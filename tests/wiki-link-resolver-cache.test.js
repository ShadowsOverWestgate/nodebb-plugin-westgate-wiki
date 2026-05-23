"use strict";

const assert = require("node:assert/strict");

const state = {
  settings: {
    categoryIds: "1, 2, 3",
    includeChildCategories: "0"
  },
  categories: new Map([
    [1, { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 0 }],
    [2, { cid: 2, name: "Development", slug: "2/development", parentCid: 1, topic_count: 2 }],
    [3, { cid: 3, name: "Item Types", slug: "3/item-types", parentCid: 1, topic_count: 0 }]
  ]),
  topics: new Map([
    [10, { tid: 10, cid: 2, title: "Map Creation Guide", titleRaw: "Map Creation Guide", slug: "10/map-creation-guide", deleted: 0, scheduled: 0 }],
    [11, { tid: 11, cid: 2, title: "Missing Helpers", titleRaw: "Missing Helpers", slug: "11/missing-helpers", deleted: 0, scheduled: 0 }]
  ]),
  tidsByCid: new Map([[2, [10, 11]]]),
  categoryDataCalls: 0,
  sortedSetRangeCalls: 0,
  topicFieldCalls: 0,
  hiddenCategoryCidsByUid: new Map(),
  hiddenTopicTidsByUid: new Map()
};

const originalMainRequire = require.main.require.bind(require.main);

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "nconf": {
      get: (key) => (key === "relative_path" ? "" : undefined)
    },
    "./src/categories": {
      getCategoryData: async (cid) => {
        state.categoryDataCalls += 1;
        return state.categories.get(parseInt(cid, 10)) || null;
      },
      getChildrenCids: async () => []
    },
    "./src/controllers/helpers": {
      formatApiResponse: (status, res, payload) => {
        res.statusCode = status;
        res.payload = payload;
        return payload;
      }
    },
    "./src/database": {
      getSortedSetRange: async (key) => {
        state.sortedSetRangeCalls += 1;
        const cid = parseInt(key.match(/^cid:(\d+):tids$/)[1], 10);
        return state.tidsByCid.get(cid) || [];
      },
      getSortedSetRevRange: async (key, start, stop) => {
        const cid = parseInt(key.match(/^cid:(\d+):tids$/)[1], 10);
        return (state.tidsByCid.get(cid) || []).slice(start, stop + 1);
      },
      getObjectField: async () => null,
      getObject: async () => ({})
    },
    "./src/meta": {
      settings: {
        get: async () => state.settings,
        setOnEmpty: async () => {},
        set: async () => {}
      }
    },
    "./src/slugify": slugify,
    "./src/privileges": {
      categories: {
        get: async (cid, uid) => {
          const hidden = state.hiddenCategoryCidsByUid.get(parseInt(uid, 10)) || new Set();
          const canRead = !hidden.has(parseInt(cid, 10));
          return { read: canRead, "topics:read": canRead };
        },
        can: async () => true,
        isAdminOrMod: async () => false
      },
      topics: {
        filterTids: async (privilege, tids, uid) => {
          const hidden = state.hiddenTopicTidsByUid.get(parseInt(uid, 10)) || new Set();
          return (Array.isArray(tids) ? tids : []).filter((tid) => !hidden.has(parseInt(tid, 10)));
        },
        get: async () => ({ "topics:read": true, view_deleted: false, view_scheduled: false })
      }
    },
    "./src/topics": {
      getTopicData: async () => null,
      getTopicsFields: async (tids) => {
        state.topicFieldCalls += 1;
        return (Array.isArray(tids) ? tids : [])
          .map((tid) => state.topics.get(parseInt(tid, 10)))
          .filter(Boolean);
      }
    },
    "./src/user": {
      isAdministrator: async () => false,
      isGlobalModerator: async () => false
    },
    "./src/utils": {
      isNumber: (value) => String(value || "").trim() !== "" && !Number.isNaN(parseFloat(value))
    }
  };

  return stubs[id] || originalMainRequire(id);
};

const wikiDirectory = require("../lib/wiki-directory-service");
const wikiLinks = require("../lib/wiki-links");
const config = require("../lib/config");

(async () => {
  wikiDirectory.invalidateAllWikiCaches();
  const settings = await config.getSettings({ bustCache: true });
  const html = await wikiLinks.replaceWikiLinks(
    [
      "[[development:Map Creation Guide]]",
      "[[development:Map Creation Guide#Basics]]",
      "[[development:Map Creation Guide#Advanced Setup|advanced setup]]",
      "[[development:Map Creation Guide|Map guide]]",
      "[[ns:development]]",
      "[[Development]]",
      "[[ns:itemtypes]]",
      "[[Itemtypes]]",
      '<span class="wiki-entity wiki-entity--page" data-wiki-entity="page" data-wiki-target="development/Map Creation Guide" data-wiki-label="Guide entity">Guide entity</span>',
      '<span class="wiki-entity wiki-entity--page" data-wiki-entity="page" data-wiki-target="development/Map Creation Guide#Using DCs" data-wiki-label="Guide section entity">Guide section entity</span>',
      "[[New Redlink]]"
    ].join(" "),
    2,
    settings,
    1
  );

  assert.match(html, /href="\/wiki\/Wiki\/Development\/Map_Creation_Guide"/);
  assert.match(html, /href="\/wiki\/Wiki\/Development\/Map_Creation_Guide#basics"/);
  assert.match(html, /href="\/wiki\/Wiki\/Development\/Map_Creation_Guide#advanced-setup">advanced setup<\/a>/);
  assert.match(html, />Map guide<\/a>/);
  assert.match(html, /class="wiki-internal-link wiki-namespace-link" href="\/wiki\/Wiki\/Development"/);
  assert.strictEqual(
    (html.match(/class="wiki-internal-link wiki-namespace-link" href="\/wiki\/Wiki\/Development"/g) || []).length,
    2,
    "bare links that uniquely match a namespace should resolve like ns: links when no page exists"
  );
  assert.strictEqual(
    (html.match(/class="wiki-internal-link wiki-namespace-link" href="\/wiki\/Wiki\/Item_Types"/g) || []).length,
    2,
    "namespace links should resolve compact typed aliases like itemtypes to item-types namespaces"
  );
  assert.match(html, /Guide entity<\/a>/);
  assert.match(html, /href="\/wiki\/Wiki\/Development\/Map_Creation_Guide#using-dcs">Guide section entity<\/a>/);
  assert.match(html, /class="wiki-redlink" href="\/wiki\/Wiki\/Development\?create=New%20Redlink&amp;redlink=1&amp;cid=2"/);
  assert.strictEqual(state.sortedSetRangeCalls, 1, "per-post resolver should scan each target namespace once");
  assert.strictEqual(state.topicFieldCalls, 1, "per-post resolver should hydrate each target namespace once");
  assert(state.categoryDataCalls <= 20, "per-post resolver should reuse effective category rows and namespace paths");

  state.topics.set(13, {
    tid: 13,
    cid: 2,
    title: "CKEditor Page",
    titleRaw: "CKEditor Page",
    slug: "13/ckeditor-page",
    deleted: 0,
    scheduled: 0
  });
  state.topics.set(14, {
    tid: 14,
    cid: 2,
    title: "CKEditor Page.................",
    titleRaw: "CKEditor Page.................",
    slug: "14/ckeditor-page",
    westgateWikiPageSlug: "ckeditor-page-dotted",
    deleted: 0,
    scheduled: 0
  });
  state.tidsByCid.set(2, [10, 11, 13, 14]);
  require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  const punctuatedTitleHtml = await wikiLinks.replaceWikiLinks(
    '<p><span class="wiki-entity wiki-entity--page" data-wiki-entity="page" data-wiki-target="CKEditor Page................." data-wiki-label="CKEditor Page.................">CKEditor Page.................</span></p>',
    2,
    settings,
    1
  );
  assert.match(
    punctuatedTitleHtml,
    /<a class="wiki-internal-link" href="\/wiki\/Wiki\/Development\/CKEditor_Page">CKEditor Page\.+<\/a>/,
    "selected Tiptap page entities should resolve exact punctuation-heavy titles without using retired generated slug fields"
  );
  assert.doesNotMatch(punctuatedTitleHtml, /wiki-redlink/);

  state.topics.set(12, {
    tid: 12,
    cid: 2,
    title: "Asdf :: A sub page :: Baby page",
    titleRaw: "Asdf :: A sub page :: Baby page",
    slug: "12/asdf-a-sub-page-baby-page",
    deleted: 0,
    scheduled: 0
  });
  state.tidsByCid.set(2, [10, 11, 12]);
  require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  const subpageHtml = await wikiLinks.replaceWikiLinks(
    "[[Asdf :: A sub page :: Baby page|Baby page]]",
    2,
    settings,
    1
  );
  assert.match(subpageHtml, /<a class="wiki-internal-link wiki-subpage-link" href="\/wiki\/Wiki\/Development\/Asdf\/A_sub_page\/Baby_page">Baby page<\/a>/);

  const bareLeafSubpageHtml = await wikiLinks.replaceWikiLinks(
    "[[Baby page]]",
    2,
    settings,
    1
  );
  assert.match(
    bareLeafSubpageHtml,
    /<a class="wiki-internal-link wiki-subpage-link" href="\/wiki\/Wiki\/Development\/Asdf\/A_sub_page\/Baby_page"><span class="wiki-topic-parent-path"><span class="wiki-topic-title-parent">Asdf<\/span><span class="wiki-topic-title-separator" aria-hidden="true">\/<\/span><span class="wiki-topic-title-parent">A sub page<\/span><span class="wiki-topic-title-separator" aria-hidden="true">\/<\/span><\/span><span class="wiki-topic-title-leaf">Baby page<\/span><\/a>/,
    "bare leaf links should resolve to a unique subpage leaf and render with segmented title-path markup"
  );

  state.settings = {
    categoryIds: "1, 4, 5",
    includeChildCategories: "0"
  };
  state.categories = new Map([
    [1, { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 0 }],
    [4, { cid: 4, name: "Classes", slug: "4/classes", parentCid: 1, topic_count: 1 }],
    [5, { cid: 5, name: "Feats", slug: "5/feats", parentCid: 1, topic_count: 1 }]
  ]);
  state.topics = new Map([
    [40, { tid: 40, cid: 4, title: "Fighter", titleRaw: "Fighter", slug: "40/fighter", deleted: 0, scheduled: 0 }],
    [50, { tid: 50, cid: 5, title: "Brew Potion", titleRaw: "Brew Potion", slug: "50/brew-potion", deleted: 0, scheduled: 0 }]
  ]);
  state.tidsByCid = new Map([[4, [40]], [5, [50]]]);
  require("../lib/config").invalidateSettingsCache();
  require("../lib/wiki-paths").invalidateNamespaceIndexCache({ skipSettingsInvalidation: true });
  require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  const generatedLinkHtml = await wikiLinks.replaceWikiLinks(
    [
      "[[feat:brew:potion]]",
      "[[feat:brew:potion|Brew Potion]]",
      "[[feat:new:thing]]",
      "[[class:fighter]]"
    ].join(" "),
    4,
    await config.getSettings({ bustCache: true }),
    1
  );
  assert.match(
    generatedLinkHtml,
    /<a class="wiki-internal-link" href="\/wiki\/Wiki\/Feats\/Brew_Potion">Brew Potion<\/a>/,
    "typed generated feat page IDs should resolve across namespaces"
  );
  assert.strictEqual(
    (generatedLinkHtml.match(/<a class="wiki-internal-link" href="\/wiki\/Wiki\/Feats\/Brew_Potion">Brew Potion<\/a>/g) || []).length,
    2,
    "explicit labels on typed generated page IDs should be preserved"
  );
  assert.match(
    generatedLinkHtml,
    /class="wiki-redlink" href="\/wiki\/Wiki\/Feats\?create=new%3Athing&amp;redlink=1&amp;cid=5"/,
    "missing typed generated page IDs should redlink in the resolved target namespace"
  );
  assert.match(
    generatedLinkHtml,
    /<a class="wiki-internal-link" href="\/wiki\/Wiki\/Classes\/Fighter">Fighter<\/a>/,
    "singular typed namespace aliases should resolve to plural namespace categories"
  );

  state.settings = {
    categoryIds: "10, 11",
    includeChildCategories: "0"
  };
  state.categories = new Map([
    [10, { cid: 10, name: "Hidden Root", slug: "10/hidden-root", parentCid: 0, topic_count: 0 }],
    [11, { cid: 11, name: "Readable Child", slug: "11/readable-child", parentCid: 10, topic_count: 1 }]
  ]);
  state.topics = new Map([
    [110, { tid: 110, cid: 11, title: "Hidden Page", titleRaw: "Hidden Page", slug: "110/hidden-page", deleted: 0, scheduled: 0 }]
  ]);
  state.tidsByCid = new Map([[11, [110]]]);
  state.hiddenCategoryCidsByUid.set(9, new Set([10]));
  require("../lib/config").invalidateSettingsCache();
  require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  const hiddenPathHtml = await wikiLinks.replaceWikiLinks(
    [
      "[[readable child:Hidden Page]]",
      "[[ns:readable child]]"
    ].join(" "),
    11,
    await config.getSettings({ bustCache: true }),
    9
  );
  assert.doesNotMatch(
    hiddenPathHtml,
    /\/wiki\/Hidden_Root\/Readable_Child/,
    "wiki link rendering should not expose canonical paths through unreadable namespace ancestors"
  );

  state.hiddenCategoryCidsByUid = new Map();
  state.hiddenTopicTidsByUid.set(9, new Set([110]));
  require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  const hiddenTopicHtml = await wikiLinks.replaceWikiLinks(
    "[[readable child:Hidden Page]]",
    11,
    await config.getSettings({ bustCache: true }),
    9
  );
  assert.doesNotMatch(
    hiddenTopicHtml,
    /href="\/wiki\/Hidden_Root\/Readable_Child\/Hidden_Page"/,
    "wiki link rendering should not expose a page href when the topic is unreadable but the namespace is readable"
  );

  state.hiddenTopicTidsByUid = new Map();
  const guestPublicHtml = await wikiLinks.replaceWikiLinks(
    [
      "[[readable child:Hidden Page]]",
      "[[ns:readable child]]"
    ].join(" "),
    11,
    await config.getSettings({ bustCache: true }),
    0
  );
  assert.match(
    guestPublicHtml,
    /href="\/wiki\/Hidden_Root\/Readable_Child\/Hidden_Page"/,
    "guest viewer uid 0 should render public page links when topic privileges allow anonymous reads"
  );
  assert.match(
    guestPublicHtml,
    /href="\/wiki\/Hidden_Root\/Readable_Child"/,
    "guest viewer uid 0 should render public namespace links when category privileges allow anonymous reads"
  );

  state.hiddenTopicTidsByUid.set(0, new Set([110]));
  const guestHiddenTopicHtml = await wikiLinks.replaceWikiLinks(
    [
      "[[readable child:Hidden Page]]",
      "[[ns:readable child]]"
    ].join(" "),
    11,
    await config.getSettings({ bustCache: true }),
    0
  );
  assert.doesNotMatch(
    guestHiddenTopicHtml,
    /href="\/wiki\/Hidden_Root\/Readable_Child\/Hidden_Page"/,
    "guest viewer uid 0 should not render topic hrefs denied by anonymous topic privileges"
  );
  assert.match(
    guestHiddenTopicHtml,
    /href="\/wiki\/Hidden_Root\/Readable_Child"/,
    "guest viewer uid 0 should still render the readable namespace when only the topic is denied"
  );

  state.topics = new Map([
    [110, { tid: 110, cid: 11, title: "Collision Page", titleRaw: "Collision Page", slug: "110/collision-page", deleted: 0, scheduled: 0 }],
    [111, { tid: 111, cid: 11, title: "Collision Page", titleRaw: "Collision Page", slug: "111/collision-page", deleted: 0, scheduled: 0 }]
  ]);
  state.tidsByCid = new Map([[11, [110, 111]]]);
  state.hiddenTopicTidsByUid = new Map([[0, new Set([111])]]);
  require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  const guestVisibleDuplicateHtml = await wikiLinks.replaceWikiLinks(
    "[[readable child:Collision Page]]",
    11,
    await config.getSettings({ bustCache: true }),
    0
  );
  assert.match(
    guestVisibleDuplicateHtml,
    /href="\/wiki\/Hidden_Root\/Readable_Child\/Collision_Page"/,
    "hidden duplicate topics should not suppress a visible guest wiki link"
  );

  state.hiddenTopicTidsByUid = new Map();
  require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  const guestVisibleAmbiguousHtml = await wikiLinks.replaceWikiLinks(
    "[[readable child:Collision Page]]",
    11,
    await config.getSettings({ bustCache: true }),
    0
  );
  assert.doesNotMatch(
    guestVisibleAmbiguousHtml,
    /href="\/wiki\/Hidden_Root\/Readable_Child\/Collision_Page"/,
    "visible duplicate topics should remain ambiguous and not pick an arbitrary page href"
  );

  state.hiddenTopicTidsByUid = new Map([[0, new Set([110, 111])]]);
  require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  const guestHiddenAmbiguousHtml = await wikiLinks.replaceWikiLinks(
    "[[readable child:Collision Page]]",
    11,
    await config.getSettings({ bustCache: true }),
    0
  );
  assert.doesNotMatch(
    guestHiddenAmbiguousHtml,
    /href="\/wiki\/Hidden_Root\/Readable_Child\/Collision_Page"/,
    "all-hidden duplicate topics should not render a page href"
  );

  state.topics = new Map([
    [120, { tid: 120, cid: 11, title: "Hidden Exact", titleRaw: "Hidden Exact", slug: "120/hidden-exact", deleted: 0, scheduled: 0 }],
    [121, { tid: 121, cid: 11, title: "Hidden/Exact", titleRaw: "Hidden/Exact", slug: "121/hidden-exact", deleted: 0, scheduled: 0 }]
  ]);
  state.tidsByCid = new Map([[11, [120, 121]]]);
  state.hiddenTopicTidsByUid = new Map([[0, new Set([120])]]);
  require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  const hiddenExactVisibleSlugHtml = await wikiLinks.replaceWikiLinks(
    "[[readable child:Hidden Exact]]",
    11,
    await config.getSettings({ bustCache: true }),
    0
  );
  assert.match(
    hiddenExactVisibleSlugHtml,
    /href="\/wiki\/Hidden_Root\/Readable_Child\/Hidden_Exact"/,
    "hidden exact-title matches should not suppress a visible slug match"
  );

  state.topics = new Map([
    [130, { tid: 130, cid: 11, title: "Leaf Target", titleRaw: "Leaf Target", slug: "130/leaf-target", deleted: 0, scheduled: 0 }],
    [131, { tid: 131, cid: 11, title: "Parent :: Leaf Target", titleRaw: "Parent :: Leaf Target", slug: "131/parent-leaf-target", deleted: 0, scheduled: 0 }]
  ]);
  state.tidsByCid = new Map([[11, [130, 131]]]);
  state.hiddenTopicTidsByUid = new Map([[0, new Set([130])]]);
  require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  const hiddenExactVisibleLeafHtml = await wikiLinks.replaceWikiLinks(
    "[[readable child:Leaf Target]]",
    11,
    await config.getSettings({ bustCache: true }),
    0
  );
  assert.match(
    hiddenExactVisibleLeafHtml,
    /href="\/wiki\/Hidden_Root\/Readable_Child\/Parent\/Leaf_Target"/,
    "hidden exact-title matches should not suppress a visible leaf-title match"
  );

  const parseHookData = {
    postData: {
      uid: 1,
      cid: 11,
      content: "[[readable child:Hidden Page]] [[ns:readable child]]"
    }
  };
  await wikiLinks.transformWikiPostContent(parseHookData);
  assert.doesNotMatch(
    parseHookData.postData.content,
    /href="\/wiki\/Hidden_Root\/Readable_Child/,
    "parse hook should fail closed when no reliable viewer uid is present instead of using the post author"
  );

  console.log("wiki-link resolver cache tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
