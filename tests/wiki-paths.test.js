"use strict";

const assert = require("assert");
const canonicalSegments = require("./fixtures/canonical-wiki-path-segments.json");

const state = {
  settings: {
    categoryIds: "",
    includeChildCategories: "0"
  },
  categories: new Map(),
  topics: new Map(),
  tidsByCid: new Map()
};
const originalMainRequire = require.main.require.bind(require.main);

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setCategories(rows) {
  state.categories = new Map(rows.map((row) => [parseInt(row.cid, 10), row]));
}

function setTopics(rows) {
  state.topics = new Map(rows.map((row) => [parseInt(row.tid, 10), row]));
  state.tidsByCid = new Map();
  rows.forEach((row) => {
    const cid = parseInt(row.cid, 10);
    const list = state.tidsByCid.get(cid) || [];
    list.push(parseInt(row.tid, 10));
    state.tidsByCid.set(cid, list);
  });
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "./src/categories": {
      getCategoryData: async (cid) => state.categories.get(parseInt(cid, 10)) || null,
      getChildrenCids: async () => []
    },
    "./src/database": {
      getSortedSetRange: async (key) => state.tidsByCid.get(parseInt((key.match(/^cid:(\d+):tids$/) || [])[1], 10)) || [],
      getSortedSetRevRange: async (key) => state.tidsByCid.get(parseInt((key.match(/^cid:(\d+):tids$/) || [])[1], 10)) || [],
      getObjectField: async () => null,
      getObject: async () => ({})
    },
    "./src/controllers/helpers": {},
    "./src/user": {
      isAdministrator: async () => false
    },
    "./src/privileges": {
      categories: {
        get: async () => ({
          read: true,
          "topics:read": true,
          "topics:create": true
        })
      },
      topics: {
        filterTids: async (priv, tids) => (Array.isArray(tids) ? tids : [])
      }
    },
    "./src/meta": {
      settings: {
        get: async () => state.settings,
        setOnEmpty: async () => {},
        set: async () => {}
      }
    },
    "./src/slugify": slugify,
    "./src/utils": {
      isNumber: function isNumberStub(val) {
        if (typeof val === "number") {
          return Number.isFinite(val);
        }
        if (typeof val === "string" && val.trim() !== "") {
          return !Number.isNaN(parseFloat(val));
        }
        return false;
      }
    },
    "./src/topics": {
      getTopicData: async (tid) => state.topics.get(parseInt(tid, 10)) || null,
      getTopicsFields: async (tids) => tids.map((tid) => state.topics.get(parseInt(tid, 10))).filter(Boolean),
      getTopicsFromSet: async (setKey, uid, start, stop) => {
        const m = setKey.match(/^cid:(\d+):tids$/);
        const cid = m ? parseInt(m[1], 10) : 0;
        const tids = (state.tidsByCid.get(cid) || []).slice(start, stop + 1);
        return tids.map((tid) => state.topics.get(tid)).filter(Boolean);
      },
      getTopicField: async (tid, field) => {
        const t = state.topics.get(parseInt(tid, 10));
        return t && Object.prototype.hasOwnProperty.call(t, field) ? t[field] : null;
      }
    },
    "nconf": {
      get: (key) => (key === "relative_path" ? "" : undefined)
    }
  };

  if (!stubs[id]) {
    return originalMainRequire(id);
  }
  return stubs[id];
};

const wikiPaths = require("../lib/wiki-paths");
const wikiLinks = require("../lib/wiki-links");

[
  "resolveWikiNode",
  "listWikiNodeChildren",
  "getCanonicalPagePath",
  "getCanonicalNamespacePath",
  "validateCanonicalPagePlacement",
  "validateCanonicalNamespacePlacement",
  "invalidateWikiTreeIndex"
].forEach((name) => {
  assert.strictEqual(typeof wikiPaths[name], "function", `${name} should be exported by wiki-paths facade`);
});

canonicalSegments.forEach((row) => {
  const segment = wikiPaths.normalizeCanonicalSegment(row.source);
  assert.strictEqual(segment.canonical, row.canonical);
  assert.strictEqual(segment.foldedKey, row.folded);
});

function reset(settings, categories, topics) {
  state.settings = {
    includeChildCategories: "0",
    ...settings
  };
  setCategories(categories);
  setTopics(topics || []);
  try {
    require("../lib/config").invalidateSettingsCache();
    require("../lib/wiki-paths").invalidateNamespaceIndexCache({ skipSettingsInvalidation: true });
    require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  } catch (e) {
    // Modules may not be loaded yet during test bootstrap.
  }
}

(async () => {
  reset(
    { categoryIds: "1, 2, 3" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 1 },
      { cid: 2, name: "Mechanics", slug: "2/mechanics", parentCid: 1 },
      { cid: 3, name: "Classes", slug: "3/classes", parentCid: 2 }
    ]
  );
  assert.strictEqual(await wikiPaths.getNamespacePath(3), "/wiki/wiki/mechanics/classes");
  assert.strictEqual(await wikiPaths.getCanonicalNamespacePath(state.categories.get(3)), "Wiki/Mechanics/Classes");
  assert.strictEqual((await wikiPaths.resolveWikiNode("Wiki/Mechanics/Classes", { uid: 1 })).node.namespace.cid, 3);

  reset(
    { categoryIds: "1, 2" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 1 },
      { cid: 2, name: "Guides", slug: "2/guides", parentCid: 1 }
    ]
  );
  assert.strictEqual(
    (await wikiPaths.resolveRouteRootNamespace()).status,
    "namespace-not-found",
    "a category with slug wiki must not become the route root without explicit routeRootCid"
  );
  assert.strictEqual(await wikiPaths.getNamespacePath(2), "/wiki/wiki/guides");

  reset(
    { categoryIds: "1, 2", routeRootCid: "1" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 1 },
      { cid: 2, name: "Guides", slug: "2/guides", parentCid: 1 }
    ],
    [
      { tid: 9, cid: 1, title: "Home", slug: "9/home", deleted: 0, scheduled: 0, postcount: 1 }
    ]
  );
  assert.strictEqual((await wikiPaths.resolveRouteRootNamespace()).cid, 1);
  assert.strictEqual(await wikiPaths.getNamespacePath(2), "/wiki/guides");
  assert.strictEqual((await wikiPaths.resolveArticlePath("home", 1)).status, "ok");

  reset(
    { categoryIds: "1, 2, 3" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Classes A", slug: "2/classes", parentCid: 1 },
      { cid: 3, name: "Classes B", slug: "3/classes", parentCid: 1 }
    ]
  );
  assert.strictEqual((await wikiPaths.resolveNamespacePath("wiki/classes")).status, "namespace-collision");
  assert.strictEqual((await wikiPaths.getNamespaceSetupDiagnostics()).namespaceCollisions.length, 1);

  reset(
    { categoryIds: "4" },
    [
      { cid: 4, name: "Search", slug: "4/search", parentCid: 0 }
    ]
  );
  assert.strictEqual((await wikiPaths.resolveNamespacePath("search")).status, "reserved-path-segment");
  assert.deepStrictEqual(
    (await wikiPaths.getNamespaceSetupDiagnostics()).reservedNamespacePaths.map((row) => row.path),
    ["/wiki/search"]
  );

  reset(
    { categoryIds: "1", routeRootCid: "1" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 2 }
    ],
    [
      { tid: 10, cid: 1, title: "Acolyte", slug: "10/acolyte", deleted: 0, scheduled: 0, postcount: 1 },
      { tid: 11, cid: 1, title: "Acolyte", slug: "11/acolyte", deleted: 0, scheduled: 0, postcount: 1 }
    ]
  );
  assert.strictEqual((await wikiPaths.resolveArticlePath("acolyte")).status, "page-collision");
  assert.strictEqual((await wikiPaths.validatePageTitlePath(1, "Acolyte")).status, "page-collision");
  assert.strictEqual((await wikiPaths.validatePageTitlePath(1, "Acolyte", { omitTid: 10 })).status, "page-collision");
  assert.strictEqual((await wikiPaths.validatePageTitlePath(1, "Acolyte", { pageSlug: "alternate-acolyte" })).status, "ok");
  assert.strictEqual((await wikiPaths.validatePageTitlePath(1, "New Page")).path, "/wiki/new-page");
  assert.strictEqual(wikiPaths.normalizeTitleToSlugLeaf("Hardiness vs. Enchantments"), "hardiness-vs-enchantments");
  assert.strictEqual(wikiPaths.normalizeTitleToSlugLeaf("Grandmaster's Battle Momentum"), "grandmasters-battle-momentum");
  assert.strictEqual(wikiPaths.normalizeTitleToSlugLeaf("Bigby’s Clenched Fist"), "bigbys-clenched-fist");
  assert.strictEqual(wikiPaths.normalizeTitleToSlugLeaf("Élite &amp; Noble Houses"), "elite-noble-houses");
  assert.strictEqual(wikiPaths.normalizeTitleToSlugLeaf("Alpha!@#$%^&*()[]-=_+/?.,<>`~|\\Omega"), "alpha-omega");
  assert.strictEqual(wikiPaths.normalizeTitleToSlugLeaf("Æther Œuvre Øresund Straße Þorn Łódź Đelta"), "aether-oeuvre-oresund-strasse-thorn-lodz-delta");
  assert.strictEqual(wikiPaths.normalizeTitleToSlugLeaf("你好, world!"), "ni-hao-world");
  assert.strictEqual(wikiPaths.normalizeTitleToSlugLeaf("Asdf :: A sub page :: Baby page"), "asdf-a-sub-page-baby-page");
  assert.strictEqual(
    wikiPaths.getTopicSlugLeaf({
      title: "Generated Page Title",
      slug: "10/legacy-generated-page",
      westgateWikiPageSlug: "old-generated-path"
    }),
    "generated-page-title"
  );

  reset(
    { categoryIds: "1", routeRootCid: "1" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 2 }
    ],
    [
      { tid: 12, cid: 1, title: "Ckeditor Page", titleRaw: "Ckeditor Page", slug: "12/ckeditor-page", deleted: 0, scheduled: 0, postcount: 1 },
      { tid: 13, cid: 1, title: "CKEditor Page.................", titleRaw: "CKEditor Page.................", slug: "13/ckeditor-page", deleted: 0, scheduled: 0, postcount: 1 }
    ]
  );
  assert.strictEqual((await wikiPaths.resolveArticlePath("ckeditor-page")).status, "page-collision");
  assert.strictEqual(await wikiPaths.getArticlePath(state.topics.get(12)), "/wiki/12/ckeditor-page");
  assert.strictEqual(await wikiPaths.getArticlePath(state.topics.get(13)), "/wiki/13/ckeditor-page");

  reset(
    { categoryIds: "1, 2", routeRootCid: "1" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Guides", slug: "2/guides", parentCid: 1 }
    ]
  );
  assert.strictEqual((await wikiPaths.validatePageTitlePath(1, "Guides")).status, "namespace-page-collision");
  assert.strictEqual((await wikiPaths.validatePageTitlePath(1, "Search")).status, "reserved-path-segment");

  reset(
    { categoryIds: "1, 2" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Development", slug: "2/development", parentCid: 1, topic_count: 1 }
    ],
    [
      { tid: 20, cid: 2, title: "Map Creation Guide", slug: "20/map-creation-guide" }
    ]
  );
  assert.match(
    await wikiLinks.replaceWikiLinks("[[development:Map Creation Guide]]", 1, await require("../lib/config").getSettings(), 1),
    /href="\/wiki\/Wiki\/Development\/Map_Creation_Guide"/
  );
  assert.match(
    await wikiLinks.replaceWikiLinks('<p><span class="wiki-entity wiki-entity--page" data-wiki-entity="page" data-wiki-target="development/Map Creation Guide" data-wiki-label="Map guide">Map guide</span></p>', 1, await require("../lib/config").getSettings(), 1),
    /<a class="wiki-internal-link" href="\/wiki\/Wiki\/Development\/Map_Creation_Guide">Map guide<\/a>/
  );
  assert.match(
    await wikiLinks.replaceWikiLinks('<p><span class="wiki-entity wiki-entity--namespace" data-wiki-entity="namespace" data-wiki-target="development" data-wiki-label="Development">Development</span></p>', 1, await require("../lib/config").getSettings(), 1),
    /<a class="wiki-internal-link wiki-namespace-link" href="\/wiki\/Wiki\/Development">Development<\/a>/
  );

  reset(
    { categoryIds: "1, 2, 3" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Development", slug: "2/development", parentCid: 1 },
      { cid: 3, name: "Guides", slug: "3/guides", parentCid: 2, topic_count: 0 }
    ],
    [
      { tid: 30, cid: 3, title: "Module Development: Setup on Windows", slug: "30/module-development-setup-on-windows", deleted: 0, scheduled: 0, postcount: 1 },
      { tid: 31, cid: 3, title: "Module Development: Linux Setup", slug: "31/module-development-linux-setup", deleted: 0, scheduled: 0, postcount: 1 }
    ]
  );
  assert.match(
    await wikiLinks.replaceWikiLinks("[[development/guides/module-development-setup-on-windows]]", 3, await require("../lib/config").getSettings(), 1),
    /href="\/wiki\/Wiki\/Development\/Guides\/Module_Development_Setup_on_Windows"/
  );
  assert.match(
    await wikiLinks.replaceWikiLinks("[[module-development-setup-on-windows]]", 3, await require("../lib/config").getSettings(), 1),
    /href="\/wiki\/Wiki\/Development\/Guides\/Module_Development_Setup_on_Windows"/
  );

  reset(
    { categoryIds: "1, 2", routeRootCid: "1" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Feats", slug: "2/feats", parentCid: 1, topic_count: 1 }
    ],
    [
      {
        tid: 35,
        cid: 2,
        title: "Hardiness vs. Enchantments",
        titleRaw: "Hardiness vs. Enchantments",
        slug: "35/hardiness-vs.-enchantments",
        deleted: 0,
        scheduled: 0,
        postcount: 1
      }
    ]
  );
  assert.strictEqual(
    await wikiPaths.getArticlePath(state.topics.get(35)),
    "/wiki/feats/hardiness-vs-enchantments"
  );
  assert.strictEqual((await wikiPaths.resolveArticlePath("feats/hardiness-vs-enchantments")).status, "ok");
  assert.strictEqual((await wikiPaths.resolveArticlePath("feats/hardiness-vs.-enchantments")).status, "page-not-found");

  reset(
    { categoryIds: "1, 2, 3" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Spells", slug: "2/spells", parentCid: 1, topic_count: 1 },
      { cid: 3, name: "Clairaudience", slug: "3/clairaudience", parentCid: 2, topic_count: 0 }
    ],
    [
      { tid: 40, cid: 2, title: "Clairaudience&#x2F;Clairvoyance", titleRaw: "Clairaudience&#x2F;Clairvoyance", slug: "40/clairaudience-clairvoyance", deleted: 0, scheduled: 0, postcount: 1 }
    ]
  );
  const slashTitleLink = await wikiLinks.replaceWikiLinks(
    "[[Clairaudience/Clairvoyance]]",
    2,
    await require("../lib/config").getSettings(),
    1
  );
  assert.match(slashTitleLink, /href="\/wiki\/Wiki\/Spells\/Clairaudience_Clairvoyance"/);
  assert.doesNotMatch(slashTitleLink, /wiki-redlink/);

  console.log("wiki-paths tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
