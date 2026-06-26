"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const root = process.cwd();
const originalMainRequire = require.main.require.bind(require.main);

function clearForumFeedModules() {
  [
    "lib/filter-forum-feeds.js",
    "lib/forum-exclusion-service.js",
    "lib/config.js"
  ].forEach((relativePath) => {
    const filename = require.resolve(`${root}/${relativePath}`);
    delete require.cache[filename];
  });
}

async function withForumFeedStubs(fn) {
  const topicCidByTid = new Map([
    ["10", 1],
    ["20", 2],
    ["30", 3]
  ]);
  const postTidByPid = new Map([
    ["101", 10],
    ["202", 20],
    ["303", 30]
  ]);
  const stubs = {
    "./src/categories": {
      getChildrenCids: async () => [],
      getCidsByPrivilege: async () => [-1, 1, 2, 3]
    },
    "./src/database": {
      getSortedSetRange: async () => [],
      sortedSetRemove: async () => {}
    },
    "./src/meta": {
      settings: {
        get: async () => ({
          categoryIds: "2",
          includeChildCategories: "0"
        })
      }
    },
    "./src/posts": {
      getPostsFields: async (pids) => pids.map((pid) => ({
        pid,
        tid: postTidByPid.get(String(pid))
      }))
    },
    "./src/topics": {
      getTopicField: async (tid) => topicCidByTid.get(String(tid)),
      getTopicsFields: async (tids) => tids.map((tid) => ({
        tid,
        cid: topicCidByTid.get(String(tid))
      }))
    }
  };

  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };

  try {
    clearForumFeedModules();
    const feeds = require("../lib/filter-forum-feeds");
    await fn(feeds);
  } finally {
    require.main.require = originalMainRequire;
    clearForumFeedModules();
  }
}

test("generic topic payloads exclude wiki category topics for forum and widget consumers", async () => {
  await withForumFeedStubs(async (feeds) => {
    const result = await feeds.filterTopicsGet({
      uid: 42,
      topics: [
        { tid: 10, cid: 1, title: "forum topic" },
        { tid: 20, cid: 2, title: "wiki topic" },
        { tid: 30, cid: 3, title: "another forum topic" }
      ]
    });

    assert.deepEqual(result.topics.map((topic) => topic.tid), [10, 30]);
  });
});

test("post summary payloads exclude wiki category posts for recent post widgets", async () => {
  await withForumFeedStubs(async (feeds) => {
    const result = await feeds.filterPostGetPostSummaryByPids({
      uid: 42,
      posts: [
        { pid: 101, topic: { tid: 10, cid: 1 }, category: { cid: 1 } },
        { pid: 202, topic: { tid: 20, cid: 2 }, category: { cid: 2 } },
        { pid: 303, topic: { tid: 30, cid: 3 }, category: { cid: 3 } }
      ]
    });

    assert.deepEqual(result.posts.map((post) => post.pid), [101, 303]);
  });
});

test("recent topics widget pins cid list to non-wiki cids when unconfigured", async () => {
  await withForumFeedStubs(async (feeds) => {
    const result = await feeds.filterWidgetRenderRecentTopics({
      uid: 42,
      data: {}
    });

    // wiki cid 2 and the -1 pseudo-category dropped; full readable window preserved
    assert.equal(result.data.cid, "1,3");
  });
});

test("recent topics widget strips wiki cids from an admin-configured list", async () => {
  await withForumFeedStubs(async (feeds) => {
    const result = await feeds.filterWidgetRenderRecentTopics({
      uid: 42,
      data: { cid: "1,2,3" }
    });

    assert.equal(result.data.cid, "1,3");
  });
});
