"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const root = process.cwd();
const originalMainRequire = require.main.require.bind(require.main);

function clearForumSearchModules() {
  [
    "lib/filter-forum-search.js",
    "lib/forum-exclusion-service.js",
    "lib/wiki-canonical-path-adapter.js",
    "lib/config.js"
  ].forEach((relativePath) => {
    const filename = require.resolve(`${root}/${relativePath}`);
    delete require.cache[filename];
  });
}

async function withForumSearchStubs(fn) {
  const topicRows = new Map([
    ["10", { tid: 10, cid: 1, mainPid: 100 }], // wiki article topic
    ["20", { tid: 20, cid: 5, mainPid: 200 }], // forum topic
    ["30", { tid: 30, cid: 1, mainPid: 300, westgateWikiTombstoned: "1" }], // tombstoned wiki article
    ["40", { tid: 40, cid: 1, mainPid: 400 }] // second live wiki article
  ]);
  const postRows = new Map([
    ["100", { pid: 100, tid: 10 }], // wiki article main post
    ["101", { pid: 101, tid: 10 }], // wiki reply — must be dropped
    ["200", { pid: 200, tid: 20 }], // forum post
    ["300", { pid: 300, tid: 30 }], // tombstoned wiki article main post
    ["400", { pid: 400, tid: 40 }] // second live wiki article main post
  ]);
  const state = {
    categoryCalls: [],
    pageInfoCalls: [],
    pageInfoUids: []
  };

  const stubs = {
    "./src/categories": {
      getCategoryData: async (cid) => {
        state.categoryCalls.push(cid);
        return { cid };
      }
    },
    "./src/database": {
      getSortedSetRange: async () => [],
      sortedSetRemove: async () => {}
    },
    "./src/meta": {
      settings: {
        get: async () => ({ categoryIds: "1", includeChildCategories: "0" })
      }
    },
    "./src/posts": {
      getPostsFields: async (pids) => pids.map((pid) => postRows.get(String(pid)) || { pid, tid: undefined })
    },
    "./src/topics": {
      getTopicsFields: async (tids) => tids.map((tid) => topicRows.get(String(tid)) || { tid, cid: undefined })
    }
  };

  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };

  try {
    clearForumSearchModules();
    require.cache[require.resolve(`${root}/lib/wiki-canonical-path-adapter.js`)] = {
      exports: {
        getCanonicalNamespaceInfo: async (category) => ({
          valid: true,
          canonicalPath: `Category_${category.cid}`,
          wikiPath: `/wiki/Category_${category.cid}`
        }),
        getCanonicalPageInfo: async (topic, options) => {
          state.pageInfoCalls.push(topic.tid);
          state.pageInfoUids.push(options && options.uid);
          return {
            valid: true,
            canonicalPath: `Category_${topic.cid}/Topic_${topic.tid}`,
            wikiPath: `/wiki/Category_${topic.cid}/Topic_${topic.tid}`
          };
        }
      }
    };
    const forumSearch = require("../lib/filter-forum-search");
    await fn(forumSearch, state);
  } finally {
    require.main.require = originalMainRequire;
    clearForumSearchModules();
  }
}

test("title index hook keeps live wiki titles but drops tombstoned wiki titles", async () => {
  await withForumSearchStubs(async (forumSearch) => {
    const result = await forumSearch.filterSearchIndexTopics({
      data: ["live wiki title", "tombstoned wiki title", "forum title"],
      tids: [10, 30, 20]
    });
    assert.deepEqual(result.tids, [10, 20]);
    assert.deepEqual(result.data, ["live wiki title", "forum title"]);
  });
});

test("index posts hook keeps only the wiki article main post, drops wiki replies, keeps forum posts", async () => {
  await withForumSearchStubs(async (forumSearch) => {
    const result = await forumSearch.filterSearchIndexPosts({
      data: ["wiki article body", "wiki reply body", "forum post body", "tombstoned wiki body"],
      pids: [100, 101, 200, 300]
    });
    assert.deepEqual(result.pids, [100, 200]);
    assert.deepEqual(result.data, ["wiki article body", "forum post body"]);
  });
});

test("content search drops stale tombstoned wiki article hits", async () => {
  await withForumSearchStubs(async (forumSearch) => {
    const result = await forumSearch.filterSearchInContent({
      data: { uid: 42 },
      pids: [300, 100]
    });

    assert.deepEqual(result.pids, [100]);
  });
});

test("content search resolves wiki paths only for paginated result posts", async () => {
  await withForumSearchStubs(async (forumSearch, state) => {
    const inContent = await forumSearch.filterSearchInContent({
      data: { uid: 42 },
      pids: [100, 400, 200]
    });

    assert.deepEqual(inContent.pids, [100, 400, 200]);
    assert.deepEqual(state.categoryCalls, []);
    assert.deepEqual(state.pageInfoCalls, []);

    const result = await forumSearch.filterSearchContentGetResult({
      result: {
        posts: [
          { pid: 400 },
          { pid: 200 }
        ]
      }
    });

    assert.deepEqual(state.categoryCalls, [1]);
    assert.deepEqual(state.pageInfoCalls, [40]);
    assert.deepEqual(state.pageInfoUids, [42]);
    assert.equal(result.result.posts[0].isWikiArticle, true);
    assert.equal(result.result.posts[0].wikiPath, "/wiki/Category_1/Topic_40");
    assert.equal(result.result.posts[1].isWikiArticle, undefined);
    assert.equal(result.result.posts[1].wikiPath, undefined);
  });
});
