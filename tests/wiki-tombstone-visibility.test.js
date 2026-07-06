"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const {
  state,
  setCategories,
  setTopics,
  installNodebbStubs,
  restoreNodebbStubs
} = require("./helpers/nodebb-stub");
const originalCache = new Map();

const TOMBSTONE_FIELDS = [
  "westgateWikiTombstoned",
  "westgateWikiTombstoneAt",
  "westgateWikiTombstoneUid",
  "westgateWikiTombstoneRevisionId",
  "westgateWikiTombstoneReason"
];

state.topicsFieldsCalls = [];
state.topicFieldsCalls = [];
state.includeTombstoneFieldsInTopicData = false;
state.deniedTopicReadUids = new Set();

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

function installStubs() {
  installNodebbStubs({
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
      topics: {
        filterTids: async (privilege, tids) => (Array.isArray(tids) ? tids : []),
        get: async (tid, uid) => ({
          "topics:read": !state.deniedTopicReadUids.has(parseInt(uid, 10)),
          view_deleted: false,
          view_scheduled: false,
          "topics:delete": true
        })
      }
    },
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
  });
}

function clearRuntimeModules() {
  [
    "lib/core/config.js",
    "lib/read/topic-service.js",
    "lib/read/wiki-discussion-placeholder.js",
    "lib/read/wiki-discussion-settings.js",
    "lib/tree/wiki-directory-service.js",
    "lib/tree/wiki-paths.js",
    "lib/read/wiki-service.js",
    "lib/pages/wiki-tombstones.js",
    "lib/tree/wiki-tree-index.js"
  ].forEach(clearProjectModule);
}

(async () => {
  installStubs();

  try {
    reset();
    clearRuntimeModules();
    patchProjectModule("lib/content/wiki-article-css.js", {
      getArticleCss: async () => "",
      scopeArticleCss: () => ""
    });
    patchProjectModule("lib/features/wiki-article-watch.js", {
      getWatchState: async () => ({ canWatchWikiArticle: true, wikiArticleWatched: false })
    });

    const wikiTreeIndex = require("../lib/tree/wiki-tree-index");
    const hidden = await wikiTreeIndex.resolveWikiNode("Lore/Hidden_Tombstone", { uid: 1 });
    assert.equal(hidden.status, "not-found", "runtime wiki tree should not resolve tombstoned pages");
    assert(
      state.topicsFieldsCalls.some((call) => TOMBSTONE_FIELDS.every((field) => call.fields.includes(field))),
      "runtime tree topic fetch should request tombstone fields"
    );

    reset();
    clearRuntimeModules();
    const wikiDirectory = require("../lib/tree/wiki-directory-service");
    const rows = await wikiDirectory.getOrderedSummaries(10, 1, true);
    assert.deepEqual(rows.map((row) => row.tid), [100], "directory summaries should omit tombstoned topics");
    assert(
      state.topicsFieldsCalls.some((call) => TOMBSTONE_FIELDS.every((field) => call.fields.includes(field))),
      "directory topic fetch should request tombstone fields"
    );
    assert(TOMBSTONE_FIELDS.every((field) => !Object.prototype.hasOwnProperty.call(rows[0], field)), "public summaries should not expose tombstone fields");

    reset();
    clearRuntimeModules();
    patchProjectModule("lib/content/wiki-article-css.js", {
      getArticleCss: async () => "",
      scopeArticleCss: () => ""
    });
    patchProjectModule("lib/features/wiki-article-watch.js", {
      getWatchState: async () => ({ canWatchWikiArticle: true, wikiArticleWatched: false })
    });
    const topicService = require("../lib/read/topic-service");
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
    patchProjectModule("lib/content/wiki-article-css.js", {
      getArticleCss: async () => "",
      scopeArticleCss: () => ""
    });
    patchProjectModule("lib/features/wiki-article-watch.js", {
      getWatchState: async () => ({ canWatchWikiArticle: true, wikiArticleWatched: false })
    });
    const visibleTopicService = require("../lib/read/topic-service");
    const visiblePage = await visibleTopicService.getWikiPage(100, 1);
    assert.equal(visiblePage.status, "ok", "non-tombstoned pages with stale tombstone metadata should still load");
    assert(
      TOMBSTONE_FIELDS.every((field) => !Object.prototype.hasOwnProperty.call(visiblePage.topic, field)),
      "topic-service public payloads should strip raw tombstone fields"
    );

    reset();
    clearRuntimeModules();
    const wikiDiscussionPlaceholder = require("../lib/read/wiki-discussion-placeholder");
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
    restoreNodebbStubs();
    restorePatchedModules();
    clearRuntimeModules();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
