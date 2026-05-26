"use strict";

const assert = require("node:assert/strict");

const state = {
  settings: {
    categoryIds: "1, 2, 3, 4",
    includeChildCategories: "0"
  },
  categories: new Map([
    [1, { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 0 }],
    [2, { cid: 2, name: "Mechanics", slug: "2/mechanics", parentCid: 1, topic_count: 0 }],
    [3, { cid: 3, name: "Feats", slug: "3/feats", parentCid: 2, topic_count: 0 }],
    [4, { cid: 4, name: "Item Types", slug: "4/item-types", parentCid: 1, topic_count: 0 }]
  ]),
  topics: new Map(),
  tidsByCid: new Map()
};

const originalMainRequire = require.main.require.bind(require.main);

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "./src/categories": {
      getCategoryData: async (cid) => state.categories.get(parseInt(cid, 10)) || null,
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
      getSortedSetRange: async (key) => state.tidsByCid.get(parseInt(key.match(/^cid:(\d+):tids$/)[1], 10)) || [],
      getSortedSetRevRange: async (key) => state.tidsByCid.get(parseInt(key.match(/^cid:(\d+):tids$/)[1], 10)) || [],
      sortedSetCard: async (key) => (state.tidsByCid.get(parseInt(key.match(/^cid:(\d+):tids$/)[1], 10)) || []).length,
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
    "./src/privileges": {
      categories: {
        can: async () => true,
        get: async () => ({ read: true, "topics:read": true })
      },
      topics: {
        filterTids: async (privilege, tids) => tids,
        get: async () => ({ "topics:read": true, view_deleted: false, view_scheduled: false })
      }
    },
    "./src/slugify": (value) => String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
    "./src/topics": {
      getTopicData: async () => null,
      getTopicsFields: async (tids) => (Array.isArray(tids) ? tids : [])
        .map((tid) => state.topics.get(parseInt(tid, 10)))
        .filter(Boolean)
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

const config = require("../lib/config");
const wikiLinkAutocomplete = require("../lib/wiki-link-autocomplete");

(async () => {
  await config.getSettings({ bustCache: true });

  const compactAliasResults = await wikiLinkAutocomplete.search({
    q: "itemtypes",
    scope: "all-wiki",
    type: "namespace",
    uid: 1,
    limit: 10
  });

  assert.deepStrictEqual(
    compactAliasResults.map((row) => row.wikiPath),
    ["/wiki/Wiki/Item_Types"],
    "namespace autocomplete should match compact typed aliases against spaced or hyphenated namespace names"
  );
  assert.strictEqual(compactAliasResults[0].insertText, "[[ns:Wiki/Item_Types]]");

  const directSlugResults = await wikiLinkAutocomplete.search({
    q: "feats",
    scope: "all-wiki",
    type: "namespace",
    uid: 1,
    limit: 10
  });

  assert.deepStrictEqual(
    directSlugResults.map((row) => row.wikiPath),
    ["/wiki/Wiki/Mechanics/Feats"],
    "namespace autocomplete should match nested namespace route leaves"
  );
  assert.strictEqual(directSlugResults[0].insertText, "[[ns:Wiki/Mechanics/Feats]]");

  state.settings.categoryIds = "1, 2, 3, 4, 5";
  state.categories.set(5, { cid: 5, name: "Feats", slug: "5/feats", parentCid: 0, topic_count: 1 });
  state.topics.set(50, {
    tid: 50,
    cid: 5,
    title: "Inspire Competence",
    titleRaw: "Inspire Competence",
    slug: "50/inspire-competence",
    deleted: 0,
    scheduled: 0
  });
  state.tidsByCid.set(5, [50]);
  config.invalidateSettingsCache();

  const canonicalPageResults = await wikiLinkAutocomplete.search({
    q: "inspire",
    scope: "all-wiki",
    type: "page",
    context: "forum",
    uid: 1,
    limit: 10
  });

  assert.deepStrictEqual(
    canonicalPageResults.map((row) => row.wikiPath),
    ["/wiki/Feats/Inspire_Competence"],
    "page autocomplete should emit canonical page hrefs instead of recomposed slug paths"
  );
  assert.strictEqual(
    canonicalPageResults[0].insertText,
    "[[tid:50|Inspire Competence]]"
  );

  const forumNamespaceResults = await wikiLinkAutocomplete.search({
    q: "feats",
    scope: "all-wiki",
    type: "namespace",
    context: "forum",
    uid: 1,
    limit: 10
  });

  assert.strictEqual(
    forumNamespaceResults.find((row) => parseInt(row.cid, 10) === 5).insertText,
    "[[cid:5|Feats]]",
    "forum namespace autocomplete should store stable category markers instead of hard-coded wiki hrefs"
  );

  console.log("wiki-link autocomplete tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
