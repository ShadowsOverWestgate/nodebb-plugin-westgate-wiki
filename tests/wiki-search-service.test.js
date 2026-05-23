"use strict";

const assert = require("assert");

const state = {
  settings: {
    categoryIds: "1, 2, 3",
    includeChildCategories: "0"
  },
  categories: new Map(),
  topics: new Map(),
  tidsByCid: new Map(),
  readableCategories: new Set([1, 2, 3]),
  readableTopics: new Set()
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

function setCategories(rows, readableCids) {
  state.categories = new Map(rows.map((row) => [parseInt(row.cid, 10), row]));
  state.readableCategories = new Set((readableCids || rows.map((row) => row.cid)).map((cid) => parseInt(cid, 10)));
}

function setTopics(rows, readableTids) {
  state.topics = new Map(rows.map((row) => [parseInt(row.tid, 10), row]));
  state.tidsByCid = new Map();
  rows.forEach((row) => {
    const cid = parseInt(row.cid, 10);
    const list = state.tidsByCid.get(cid) || [];
    list.push(parseInt(row.tid, 10));
    state.tidsByCid.set(cid, list);
  });
  state.readableTopics = new Set((readableTids || rows.map((row) => row.tid)).map((tid) => parseInt(tid, 10)));
}

function reset({ settings, categories, topics, readableCids, readableTids }) {
  state.settings = {
    includeChildCategories: "0",
    ...settings
  };
  setCategories(categories || [], readableCids);
  setTopics(topics || [], readableTids);
  try {
    require("../lib/config").invalidateSettingsCache();
    require("../lib/wiki-paths").invalidateNamespaceIndexCache({ skipSettingsInvalidation: true });
    require("../lib/wiki-directory-service").invalidateAllWikiCaches();
  } catch (e) {
    // Modules may not be loaded yet during test bootstrap.
  }
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "nconf": { get: () => "" },
    "./src/categories": {
      getCategoryData: async (cid) => state.categories.get(parseInt(cid, 10)) || null,
      getChildren: async (cids) => (Array.isArray(cids) ? cids : []).map((cid) => {
        const parsedCid = parseInt(cid, 10);
        return [...state.categories.values()].filter((category) => parseInt(category.parentCid, 10) === parsedCid);
      }),
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
      isSetMember: async () => false,
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
    "./src/notifications": {},
    "./src/privileges": {
      categories: {
        get: async (cid) => ({
          read: state.readableCategories.has(parseInt(cid, 10)),
          "topics:read": state.readableCategories.has(parseInt(cid, 10)),
          "topics:create": true
        }),
        can: async (privilege, cid) => privilege === "topics:read" && state.readableCategories.has(parseInt(cid, 10))
      },
      topics: {
        filterTids: async (privilege, tids) => (Array.isArray(tids) ? tids : [])
          .filter((tid) => state.readableTopics.has(parseInt(tid, 10))),
        get: async (tid) => ({
          "topics:read": state.readableTopics.has(parseInt(tid, 10)),
          view_deleted: false,
          view_scheduled: false
        })
      },
      posts: {
        canEdit: async () => ({ flag: false })
      }
    },
    "./src/posts": {
      getPostSummaryByPids: async (pids) => (Array.isArray(pids) ? pids : []).map((pid) => ({
        pid,
        uid: 1,
        content: "<p>Visible article body.</p>",
        timestamp: 1000,
        edited: 0,
        editor: 0,
        user: { uid: 1, displayname: "Author", userslug: "author" }
      })),
      getUserInfoForPosts: async (uids) => (Array.isArray(uids) ? uids : []).map((uid) => ({
        uid,
        displayname: `User ${uid}`,
        userslug: `user-${uid}`
      }))
    },
    "./src/slugify": slugify,
    "./src/topics": {
      getTopicData: async (tid) => state.topics.get(parseInt(tid, 10)) || null,
      getTopicField: async () => null,
      getTopicsFields: async (tids) => (Array.isArray(tids) ? tids : [])
        .map((tid) => state.topics.get(parseInt(tid, 10)))
        .filter(Boolean)
    },
    "./src/user": {
      isAdministrator: async () => false,
      isGlobalModerator: async () => false
    },
    "./src/utils": {
      isNumber: (value) => {
        if (typeof value === "number") {
          return Number.isFinite(value);
        }
        return typeof value === "string" && value.trim() !== "" && !Number.isNaN(parseFloat(value));
      },
      toISOString: (value) => new Date(value).toISOString()
    }
  };

  return stubs[id] || originalMainRequire(id);
};

const wikiSearch = require("../lib/wiki-search-service");
const wikiDirectory = require("../lib/wiki-directory-service");
const wikiService = require("../lib/wiki-service");
const topicService = require("../lib/topic-service");

(async () => {
  reset({
    settings: { categoryIds: "1, 2, 3" },
    categories: [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 2 },
      { cid: 2, name: "Development", slug: "2/development", parentCid: 1, topic_count: 4 },
      { cid: 3, name: "Secret Maps", slug: "3/secret-maps", parentCid: 1, topic_count: 1 }
    ],
    topics: [
      { tid: 10, cid: 2, title: "Map Creation Guide", titleRaw: "Map Creation Guide", slug: "10/map-creation-guide", deleted: "0", scheduled: "0", lastposttime: 5000 },
      { tid: 11, cid: 2, title: "Map Creation Tools", titleRaw: "Map Creation Tools", slug: "11/map-creation-tools", deleted: "0", scheduled: "0", lastposttime: 7000 },
      { tid: 12, cid: 2, title: "Overland Map Creation", titleRaw: "Guides/Overland Map Creation", slug: "12/overland-map-creation", deleted: "0", scheduled: "0", lastposttime: 9000 },
      { tid: 13, cid: 2, title: "Deleted Map Page", titleRaw: "Deleted Map Page", slug: "13/deleted-map-page", deleted: 1, scheduled: 0, lastposttime: 9500 },
      { tid: 20, cid: 3, title: "Secret Map", titleRaw: "Secret Map", slug: "20/secret-map", deleted: "0", scheduled: "0", lastposttime: 8000 }
    ],
    readableCids: [1, 2],
    readableTids: [10, 11, 12]
  });

  {
    const result = await wikiSearch.search({ q: "Map Creation Guide", uid: 1, mode: "full", limit: 10 });
    assert.strictEqual(result.query, "Map Creation Guide");
    assert.strictEqual(result.hasQuery, true);
    assert.strictEqual(result.queryTooShort, false);
    assert(result.groups.exact.length >= 1, "exact title matches should be grouped separately");
    assert.strictEqual(result.groups.exact[0].tid, 10);
    assert.strictEqual(result.groups.exact[0].wikiPath, "/wiki/Wiki/Development/Map_Creation_Guide");
  }

  {
    const result = await wikiSearch.search({ q: "Map Creation", uid: 1, mode: "full", limit: 10 });
    assert.deepStrictEqual(
      result.groups.pages.slice(0, 2).map((row) => row.tid).sort(),
      [10, 11],
      "prefix matches should rank before contains matches"
    );
    assert.strictEqual(result.groups.pages[2].tid, 12);
    assert(result.results.every((row) => row.cid !== 3), "unreadable namespaces and pages must not leak");
    assert(result.results.every((row) => row.tid !== 13), "deleted topics must not be returned");
  }

  {
    const result = await wikiSearch.search({ q: "development", uid: 1, mode: "full", limit: 10 });
    assert.strictEqual(result.groups.namespaces.length, 1);
    assert.strictEqual(result.groups.namespaces[0].type, "namespace");
    assert.strictEqual(result.groups.namespaces[0].wikiPath, "/wiki/Wiki/Development");
  }

  reset({
    settings: { categoryIds: "10, 11" },
    categories: [
      { cid: 10, name: "Lore", slug: "10/lore", parentCid: 0, topic_count: 1 },
      { cid: 11, name: "Gond", slug: "11/gond", parentCid: 10, topic_count: 0 }
    ],
    topics: [
      { tid: 55, cid: 10, title: "Gond", titleRaw: "Gond", slug: "55/gond", deleted: 0, scheduled: 0, lastposttime: 1000 }
    ],
    readableCids: [10, 11],
    readableTids: [55]
  });

  {
    const result = await wikiSearch.search({ q: "Gond", uid: 1, mode: "full", limit: 10 });
    const compositeRows = result.results.filter((row) => row.wikiPath === "/wiki/Lore/Gond");
    assert(compositeRows.length >= 1, "search should return the canonical composite node path");
    assert(
      compositeRows.every((row) => row.facets && row.facets.page === true && row.facets.namespace === true),
      "search rows at a composite node should expose both page and namespace facets"
    );
  }

  reset({
    settings: { categoryIds: "1, 2, 3" },
    categories: [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 0 },
      { cid: 2, name: "Development", slug: "2/development", parentCid: 1, topic_count: 1 },
      { cid: 3, name: "Lore", slug: "3/lore", parentCid: 1, topic_count: 1 }
    ],
    topics: [
      { tid: 30, cid: 2, title: "Setup", titleRaw: "Setup", slug: "30/setup", deleted: 0, scheduled: 0, lastposttime: 1000 },
      { tid: 31, cid: 3, title: "Setup", titleRaw: "Setup", slug: "31/setup", deleted: 0, scheduled: 0, lastposttime: 2000 }
    ],
    readableCids: [1, 2, 3],
    readableTids: [30, 31]
  });

  {
    const result = await wikiSearch.search({ q: "s", uid: 1, mode: "full", limit: 10 });
    assert.strictEqual(result.queryTooShort, true);
    assert.deepStrictEqual(result.results, []);
  }

  {
    const result = await wikiSearch.search({ q: "Setup", uid: 1, mode: "full", limit: 10 });
    const pageResults = result.results.filter((row) => row.type === "page");
    assert.strictEqual(pageResults.length, 2);
    assert(pageResults.every((row) => row.namespaceTitle && row.namespacePath), "duplicate leaves need namespace context");
    assert.deepStrictEqual(
      pageResults.map((row) => row.wikiPath).sort(),
      ["/wiki/Wiki/Development/Setup", "/wiki/Wiki/Lore/Setup"]
    );
  }

  reset({
    settings: { categoryIds: "1, 2" },
    categories: [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 0 },
      { cid: 2, name: "Lore", slug: "2/lore", parentCid: 1, topic_count: 3 }
    ],
    topics: [
      { tid: 40, cid: 2, title: "Asdg", titleRaw: "Asdg", slug: "40/asdg", deleted: 0, scheduled: 0, lastposttime: 1000 },
      { tid: 41, cid: 2, title: "Asdf :: A child", titleRaw: "Asdf :: A child", slug: "41/asdf-a-child", deleted: 0, scheduled: 0, lastposttime: 2000 },
      { tid: 42, cid: 2, title: "Asdf", titleRaw: "Asdf", slug: "42/asdf", deleted: 0, scheduled: 0, lastposttime: 3000 }
    ],
    readableCids: [1, 2],
    readableTids: [40, 41, 42]
  });

  {
    const rows = await wikiDirectory.getOrderedSummaries(2, 1, false);
    assert.deepStrictEqual(
      rows.map((row) => row.tid),
      [42, 41, 40],
      "subpages should sort directly after their parent page before the next sibling"
    );
  }

  reset({
    settings: { categoryIds: "10" },
    categories: [
      { cid: 10, name: "Lore", slug: "10/lore", parentCid: 0, topic_count: 1 }
    ],
    topics: [
      { tid: 77, cid: 10, title: "Gond :: Clerics", titleRaw: "Gond :: Clerics", slug: "77/gond-clerics", deleted: 0, scheduled: 0, lastposttime: 1000 }
    ],
    readableCids: [10],
    readableTids: [77]
  });

  {
    const rows = await wikiDirectory.getOrderedSummaries(10, 1, false);
    assert.strictEqual(rows[0].wikiPath, "/wiki/Lore/Gond/Clerics");

    const dirWin = await wikiDirectory.getDirectoryWindow(10, 1);
    assert.strictEqual(dirWin.namespacePath, "/wiki/Lore");
    assert.strictEqual(dirWin.pages[0].wikiPath, "/wiki/Lore/Gond/Clerics");
  }

  reset({
    settings: { categoryIds: "10", routeRootCid: "10" },
    categories: [
      { cid: 10, name: "Lore", slug: "10/lore", parentCid: 0, topic_count: 1 }
    ],
    topics: [
      { tid: 78, cid: 10, title: "Home", titleRaw: "Home", slug: "78/home", deleted: 0, scheduled: 0, lastposttime: 1000 }
    ],
    readableCids: [10],
    readableTids: [78]
  });

  {
    const rows = await wikiDirectory.getOrderedSummaries(10, 1, false);
    assert.strictEqual(rows[0].wikiPath, "/wiki/Home");

    const dirWin = await wikiDirectory.getDirectoryWindow(10, 1);
    assert.strictEqual(dirWin.namespacePath, "/wiki");
    assert.strictEqual(dirWin.pages[0].wikiPath, "/wiki/Home");

    const result = await wikiSearch.search({ q: "Home", uid: 1, mode: "full", limit: 10 });
    assert.strictEqual(result.groups.exact[0].wikiPath, "/wiki/Home");
    assert.strictEqual(result.groups.exact[0].namespacePath, "/wiki");
  }

  {
    const section = wikiService.sortSectionTopics({
      topics: [
        { tid: 40, title: "Asdg", titleLeaf: "Asdg", titlePath: ["Asdg"] },
        { tid: 41, title: "Asdf :: A child", titleLeaf: "A child", titlePath: ["Asdf", "A child"] },
        { tid: 42, title: "Asdf", titleLeaf: "Asdf", titlePath: ["Asdf"] }
      ]
    });
    assert.deepStrictEqual(
      section.topics.map((row) => row.tid),
      [42, 41, 40],
      "initial section rendering should preserve tree ordering"
    );
  }

  reset({
    settings: { categoryIds: "10", homeTopicId: "92" },
    categories: [
      { cid: 10, name: "Wiki", slug: "10/wiki", parentCid: 0, topic_count: 3 }
    ],
    topics: [
      { tid: 90, cid: 10, title: "A Very Large Article", titleRaw: "A Very Large Article", slug: "90/a-very-large-article", mainPid: 9000, deleted: 0, scheduled: 0, lastposttime: 1000 },
      { tid: 91, cid: 10, title: "Code Block Test", titleRaw: "Code Block Test", slug: "91/code-block-test", mainPid: 9100, deleted: 0, scheduled: 0, lastposttime: 1100 },
      { tid: 92, cid: 10, title: "Homepage of Da Wiki", titleRaw: "Homepage of Da Wiki", slug: "92/homepage-of-da-wiki", mainPid: 9200, deleted: 0, scheduled: 0, lastposttime: 1200 }
    ],
    readableCids: [10],
    readableTids: [90, 91, 92]
  });

  {
    const alphabetical = await wikiDirectory.getDirectoryWindow(10, 1, { limit: 2 });
    assert.deepStrictEqual(
      alphabetical.pages.map((row) => row.tid),
      [90, 91],
      "plain namespace contents should remain alphabetical"
    );

    const navigation = await wikiDirectory.getDirectoryWindow(10, 1, { limit: 2, pinHomeTopic: true });
    assert.deepStrictEqual(
      navigation.pages.map((row) => row.tid),
      [92, 90],
      "navigation windows should pin the configured wiki homepage before alphabetical rows"
    );

    const nextNavigation = await wikiDirectory.getDirectoryWindow(10, 1, {
      limit: 2,
      after: navigation.nextCursor,
      pinHomeTopic: true
    });
    assert.deepStrictEqual(
      nextNavigation.pages.map((row) => row.tid),
      [91],
      "navigation pagination should not repeat the pinned wiki homepage"
    );

    const article = await topicService.getWikiPage(90, 1);
    assert.strictEqual(article.status, "ok");
    assert.deepStrictEqual(
      article.sectionNavigation.topics.map((row) => row.tid).slice(0, 3),
      [92, 90, 91],
      "article navigation drawer rows should pin the configured wiki homepage first"
    );
  }

  reset({
    settings: { categoryIds: "100, 101, 102" },
    categories: [
      { cid: 100, name: "HiddenParent", slug: "100/hidden-parent", parentCid: 0, topic_count: 0 },
      { cid: 101, name: "ReadableChild", slug: "101/readable-child", parentCid: 100, topic_count: 2 },
      { cid: 102, name: "ChildLeaf", slug: "102/child-leaf", parentCid: 101, topic_count: 0 }
    ],
    topics: [
      { tid: 509, cid: 101, title: "Parent Page", titleRaw: "Parent Page", slug: "509/parent-page", mainPid: 9509, deleted: 0, scheduled: 0, lastposttime: 900 },
      { tid: 510, cid: 101, title: "Parent Page :: Visible Page", titleRaw: "Parent Page :: Visible Page", slug: "510/visible-page", mainPid: 9510, deleted: 0, scheduled: 0, lastposttime: 1000 }
    ],
    readableCids: [101, 102],
    readableTids: [509, 510]
  });

  {
    const namespaceResult = await wikiSearch.search({ q: "ReadableChild", uid: 1, mode: "full", limit: 10 });
    assert.deepStrictEqual(
      namespaceResult.results,
      [],
      "search should not expose a readable child namespace through an unreadable parent chain"
    );

    const pageResult = await wikiSearch.search({ q: "Visible Page", uid: 1, mode: "full", limit: 10 });
    assert.deepStrictEqual(
      pageResult.results,
      [],
      "search should not expose page paths under an unreadable parent namespace"
    );

    const section = await wikiService.getSection(101, 1);
    assert.strictEqual(section.status, "ok", "the legacy category can still be read directly");
    assert.strictEqual(section.section.wikiPath, "", "section canonical URL should be withheld when an ancestor is unreadable");
    assert.strictEqual(section.section.canonicalPath, "", "section canonical path should be withheld when an ancestor is unreadable");
    assert.strictEqual(section.section.hasWikiPath, false, "section render data should mark blank paths as non-linkable");
    assert(
      section.section.topics.every((topic) => topic.wikiPath === "" && topic.hasWikiPath === false),
      "page canonical URLs should be withheld and marked non-linkable when an ancestor is unreadable"
    );
    assert.strictEqual(section.section.childSections[0].wikiPath, "", "child namespace URL should be withheld through unreadable ancestors");
    assert.strictEqual(section.section.childSections[0].hasWikiPath, false, "child namespace should be marked non-linkable");
    assert.deepStrictEqual(
      section.section.ancestorSections,
      [],
      "render data should not include unreadable ancestor namespace names"
    );

    const hub = await wikiService.getSections(1);
    assert.deepStrictEqual(
      hub.sections,
      [],
      "unreadable configured roots should not appear in wiki hub sections"
    );

    const article = await topicService.getWikiPage(510, 1);
    assert.strictEqual(article.status, "ok", "the readable article is still renderable by legacy numeric route");
    assert.strictEqual(article.topic.wikiPath, "", "article canonical URL should be withheld when an ancestor is unreadable");
    assert.strictEqual(article.topic.canonicalPath, "", "article canonical path should be withheld when an ancestor is unreadable");
    assert.strictEqual(article.topic.hasWikiPath, false, "article topic should be marked non-linkable when path is hidden");
    assert.strictEqual(article.category.wikiPath, "", "article category URL should be withheld when an ancestor is unreadable");
    assert.strictEqual(article.category.hasWikiPath, false, "article category should be marked non-linkable when path is hidden");
    assert.strictEqual(article.sectionNavigation.hasWikiPath, false, "article nav namespace row should be marked non-linkable");
    assert(
      article.sectionNavigation.topics.every((topic) => topic.hasWikiPath === false),
      "article nav page rows should be marked non-linkable when paths are hidden"
    );
    assert.strictEqual(article.sectionNavigation.childSections[0].hasWikiPath, false, "article nav child namespace rows should be marked non-linkable");
    assert.deepStrictEqual(article.ancestorSections, [], "article breadcrumbs should not include unreadable ancestor namespaces");
    assert.deepStrictEqual(
      article.parentPages,
      [{ text: "Parent Page", url: "" }],
      "parent-page breadcrumbs should not link through unreadable ancestor namespaces"
    );
    assert.doesNotMatch(
      JSON.stringify({
        topic: article.topic,
        category: article.category,
        ancestorSections: article.ancestorSections,
        parentPages: article.parentPages
      }),
      /HiddenParent|\/wiki\/HiddenParent/,
      "article render data should not leak hidden ancestor names or paths"
    );
  }

  reset({
    settings: { categoryIds: "" },
    categories: [],
    topics: []
  });

  {
    const result = await wikiSearch.search({ q: "Map", uid: 1, mode: "full", limit: 10 });
    assert.strictEqual(result.isConfigured, false);
    assert.deepStrictEqual(result.results, []);
  }

  console.log("wiki-search-service tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
