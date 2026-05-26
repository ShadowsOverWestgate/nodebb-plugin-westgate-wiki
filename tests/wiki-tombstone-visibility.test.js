"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const originalMainRequire = require.main.require.bind(require.main);
const originalCache = new Map();

const TOMBSTONE_FIELDS = [
  "westgateWikiTombstoned",
  "westgateWikiTombstoneAt",
  "westgateWikiTombstoneUid",
  "westgateWikiTombstoneRevisionId",
  "westgateWikiTombstoneReason"
];

const state = {
  settings: { categoryIds: "10", includeChildCategories: "0" },
  categories: new Map(),
  topics: new Map(),
  tidsByCid: new Map(),
  topicsFieldsCalls: [],
  topicFieldsCalls: [],
  includeTombstoneFieldsInTopicData: false,
  deniedTopicReadUids: new Set()
};

function projectPath(relativePath) {
  return path.join(root, relativePath);
}

function clearProjectModule(relativePath) {
  delete require.cache[require.resolve(projectPath(relativePath))];
}

function patchProjectModule(relativePath, exports) {
  const filename = require.resolve(projectPath(relativePath));
  if (!originalCache.has(filename)) {
    originalCache.set(filename, require.cache[filename] || null);
  }
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports
  };
}

function restorePatchedModules() {
  for (const [filename, previous] of Array.from(originalCache.entries()).reverse()) {
    if (previous) {
      require.cache[filename] = previous;
    } else {
      delete require.cache[filename];
    }
  }
  originalCache.clear();
}

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
    const tids = state.tidsByCid.get(cid) || [];
    tids.push(parseInt(row.tid, 10));
    state.tidsByCid.set(cid, tids);
  });
}

function rowWithFields(row, fields) {
  return (Array.isArray(fields) ? fields : []).reduce((memo, field) => {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      memo[field] = row[field];
    }
    return memo;
  }, {});
}

function reset() {
  state.settings = { categoryIds: "10", includeChildCategories: "0" };
  setCategories([{ cid: 10, name: "Lore", slug: "10/lore", parentCid: 0, topic_count: 2 }]);
  setTopics([
    {
      tid: 100,
      cid: 10,
      title: "Visible Page",
      titleRaw: "Visible Page",
      slug: "100/visible-page",
      mainPid: 1000,
      deleted: 0,
      scheduled: 0,
      postcount: 1,
      lastposttime: 1000
    },
    {
      tid: 101,
      cid: 10,
      title: "Hidden Tombstone",
      titleRaw: "Hidden Tombstone",
      slug: "101/hidden-tombstone",
      mainPid: 1010,
      deleted: 0,
      scheduled: 0,
      postcount: 1,
      lastposttime: 2000,
      westgateWikiTombstoned: "1",
      westgateWikiTombstoneAt: "12345",
      westgateWikiTombstoneUid: "7",
      westgateWikiTombstoneRevisionId: "rev-delete-1",
      westgateWikiTombstoneReason: "duplicate"
    }
  ]);
  state.topicsFieldsCalls = [];
  state.topicFieldsCalls = [];
  state.includeTombstoneFieldsInTopicData = false;
  state.deniedTopicReadUids = new Set();
}

function installNodebbStubs() {
  require.main.require = function requireNodebbStub(id) {
    const stubs = {
      nconf: { get: (key) => (key === "relative_path" ? "" : "") },
      "./src/categories": {
        getCategoryData: async (cid) => state.categories.get(parseInt(cid, 10)) || null,
        getChildren: async () => [[]],
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
        getObject: async () => ({}),
        isSetMember: async () => false
      },
      "./src/meta": {
        settings: {
          get: async () => state.settings,
          setOnEmpty: async () => {},
          set: async () => {}
        }
      },
      "./src/notifications": {},
      "./src/posts": {
        getPostSummaryByPids: async (pids) => (Array.isArray(pids) ? pids : []).map((pid) => ({
          pid,
          uid: 1,
          content: "<p>Article body.</p>",
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
      "./src/privileges": {
        categories: {
          get: async () => ({ read: true, "topics:read": true, "topics:create": true }),
          can: async () => true
        },
        topics: {
          filterTids: async (privilege, tids) => (Array.isArray(tids) ? tids : []),
          get: async (tid, uid) => ({
            "topics:read": !state.deniedTopicReadUids.has(parseInt(uid, 10)),
            view_deleted: false,
            view_scheduled: false,
            "topics:delete": true
          })
        },
        posts: {
          canEdit: async () => ({ flag: true })
        }
      },
      "./src/slugify": slugify,
      "./src/topics": {
        getTopicData: async (tid) => {
          const row = state.topics.get(parseInt(tid, 10));
          if (!row) {
            return null;
          }
          return rowWithFields(row, [
            "tid",
            "cid",
            "title",
            "titleRaw",
            "slug",
            "mainPid",
            "deleted",
            "scheduled",
            "postcount",
            "lastposttime"
          ].concat(state.includeTombstoneFieldsInTopicData ? TOMBSTONE_FIELDS : []));
        },
        getTopicFields: async (tid, fields) => {
          state.topicFieldsCalls.push({ tid, fields });
          const row = state.topics.get(parseInt(tid, 10)) || {};
          return rowWithFields(row, fields);
        },
        getTopicsFields: async (tids, fields) => {
          state.topicsFieldsCalls.push({ tids, fields });
          return (Array.isArray(tids) ? tids : [])
            .map((tid) => state.topics.get(parseInt(tid, 10)))
            .filter(Boolean)
            .map((row) => ({ tid: row.tid, ...rowWithFields(row, fields) }));
        },
        getTopicField: async (tid, field) => {
          const row = state.topics.get(parseInt(tid, 10)) || {};
          return row[field] || null;
        },
        setTopicField: async () => {}
      },
      "./src/user": {
        isAdministrator: async () => false,
        isGlobalModerator: async () => false
      },
      "./src/utils": {
        isNumber: (value) => /^\d+$/.test(String(value || "")),
        toISOString: (value) => new Date(value).toISOString()
      }
    };
    return stubs[id] || originalMainRequire(id);
  };
}

function clearRuntimeModules() {
  [
    "lib/config.js",
    "lib/topic-service.js",
    "lib/wiki-canonical-path-adapter.js",
    "lib/wiki-discussion-placeholder.js",
    "lib/wiki-discussion-settings.js",
    "lib/wiki-directory-service.js",
    "lib/wiki-paths.js",
    "lib/wiki-service.js",
    "lib/wiki-tombstones.js",
    "lib/wiki-tree-index.js"
  ].forEach(clearProjectModule);
}

(async () => {
  installNodebbStubs();

  try {
    reset();
    clearRuntimeModules();
    patchProjectModule("lib/wiki-article-css.js", {
      getArticleCss: async () => "",
      scopeArticleCss: () => ""
    });
    patchProjectModule("lib/wiki-article-watch.js", {
      getWatchState: async () => ({ canWatchWikiArticle: true, wikiArticleWatched: false })
    });

    const wikiTreeIndex = require("../lib/wiki-tree-index");
    const hidden = await wikiTreeIndex.resolveWikiNode("Lore/Hidden_Tombstone", { uid: 1 });
    assert.equal(hidden.status, "not-found", "runtime wiki tree should not resolve tombstoned pages");
    assert(
      state.topicsFieldsCalls.some((call) => TOMBSTONE_FIELDS.every((field) => call.fields.includes(field))),
      "runtime tree topic fetch should request tombstone fields"
    );

    reset();
    clearRuntimeModules();
    const wikiDirectory = require("../lib/wiki-directory-service");
    const rows = await wikiDirectory.getOrderedSummaries(10, 1, true);
    assert.deepEqual(rows.map((row) => row.tid), [100], "directory summaries should omit tombstoned topics");
    assert(
      state.topicsFieldsCalls.some((call) => TOMBSTONE_FIELDS.every((field) => call.fields.includes(field))),
      "directory topic fetch should request tombstone fields"
    );
    assert(TOMBSTONE_FIELDS.every((field) => !Object.prototype.hasOwnProperty.call(rows[0], field)), "public summaries should not expose tombstone fields");
    assert.deepEqual(
      await wikiDirectory.findPageSlugMatchesForValidation(10, "hidden-tombstone"),
      [],
      "slug validation should ignore tombstoned matching topics"
    );

    reset();
    clearRuntimeModules();
    patchProjectModule("lib/wiki-article-css.js", {
      getArticleCss: async () => "",
      scopeArticleCss: () => ""
    });
    patchProjectModule("lib/wiki-article-watch.js", {
      getWatchState: async () => ({ canWatchWikiArticle: true, wikiArticleWatched: false })
    });
    const topicService = require("../lib/topic-service");
    const normalPage = await topicService.getWikiPage(101, 1);
    assert.equal(normalPage.status, "not-found", "normal wiki article loads should hide tombstoned pages");
    assert(
      state.topicFieldsCalls.some((call) => TOMBSTONE_FIELDS.every((field) => call.fields.includes(field))),
      "topic-service should fall back to tombstone field reads when topic data lacks them"
    );

    const internalPage = await topicService.getWikiPage(101, 1, { includeTombstoned: true });
    assert.equal(internalPage.status, "ok", "internal callers should be able to include tombstoned pages");
    assert.equal(internalPage.topic.tid, 101);

    state.deniedTopicReadUids.add(9);
    const forbiddenInternalPage = await topicService.getWikiPage(101, 9, { includeTombstoned: true });
    assert.equal(forbiddenInternalPage.status, "forbidden", "includeTombstoned should not bypass topic read privileges");

    reset();
    state.includeTombstoneFieldsInTopicData = true;
    Object.assign(state.topics.get(100), {
      westgateWikiTombstoned: "0",
      westgateWikiTombstoneAt: "12345",
      westgateWikiTombstoneUid: "7",
      westgateWikiTombstoneRevisionId: "old-revision",
      westgateWikiTombstoneReason: "old reason"
    });
    clearRuntimeModules();
    patchProjectModule("lib/wiki-article-css.js", {
      getArticleCss: async () => "",
      scopeArticleCss: () => ""
    });
    patchProjectModule("lib/wiki-article-watch.js", {
      getWatchState: async () => ({ canWatchWikiArticle: true, wikiArticleWatched: false })
    });
    const visibleTopicService = require("../lib/topic-service");
    const visiblePage = await visibleTopicService.getWikiPage(100, 1);
    assert.equal(visiblePage.status, "ok", "non-tombstoned pages with stale tombstone metadata should still load");
    assert(
      TOMBSTONE_FIELDS.every((field) => !Object.prototype.hasOwnProperty.call(visiblePage.topic, field)),
      "topic-service public payloads should strip raw tombstone fields"
    );

    reset();
    clearRuntimeModules();
    const wikiDiscussionPlaceholder = require("../lib/wiki-discussion-placeholder");
    const data = {
      uid: 1,
      templateData: {
        tid: 101,
        cid: 10,
        mainPid: 1010,
        title: "Hidden Tombstone",
        slug: "101/hidden-tombstone",
        posts: [
          { pid: 1010, content: "<p>Stored article body.</p>", excerpt: "keep", teaser: "keep" }
        ]
      }
    };
    const result = await wikiDiscussionPlaceholder.filterTopicBuild(data);
    assert.equal(result.templateData.posts[0].content, "<p>Stored article body.</p>", "tombstoned discussion topics should not render a public article link");
    assert(!result.templateData.posts[0].content.includes("wiki-discussion-placeholder__link"));

    console.log("wiki tombstone visibility tests passed");
  } finally {
    require.main.require = originalMainRequire;
    restorePatchedModules();
    clearRuntimeModules();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
