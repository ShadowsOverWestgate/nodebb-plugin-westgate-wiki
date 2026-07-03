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
      getPostField: async (pid) => postTidByPid.get(String(pid)),
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

test("topic sorted tid feed payloads exclude wiki category topics", async () => {
  await withForumFeedStubs(async (feeds) => {
    const result = await feeds.filterTopicsFilterSortedTids({
      uid: 42,
      tids: [10, 20, 30]
    });

    assert.deepEqual(result.tids, [10, 30]);
  });
});

test("direct topic object lookups exclude wiki topics from forum consumers", async () => {
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

test("single wiki topic lookups without a create grant are stripped (feed leak regression)", async () => {
  await withForumFeedStubs(async (feeds) => {
    const result = await feeds.filterTopicsGet({
      uid: 42,
      topics: [
        { tid: 20, cid: 2, title: "wiki topic" }
      ]
    });

    assert.deepEqual(result.topics, []);
  });
});

test("topic create grants let core create-path hydration keep the wiki topic", async () => {
  await withForumFeedStubs(async (feeds) => {
    await feeds.filterTopicCreate({ topic: { tid: 20, cid: 2 } });

    const result = await feeds.filterTopicsGet({
      uid: 42,
      topics: [
        { tid: 20, cid: 2, title: "wiki topic" }
      ]
    });

    assert.deepEqual(result.topics.map((topic) => topic.tid), [20]);
  });
});

test("topic create grants ignore non-wiki topics", async () => {
  await withForumFeedStubs(async (feeds) => {
    await feeds.filterTopicCreate({ topic: { tid: 10, cid: 1 } });

    const result = await feeds.filterTopicsGet({
      uid: 42,
      topics: [
        { tid: 20, cid: 2, title: "wiki topic" }
      ]
    });

    assert.deepEqual(result.topics, []);
  });
});

test("direct post summary lookups exclude wiki posts from forum consumers", async () => {
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

test("single wiki post summary lookups without a grant are stripped (feed leak regression)", async () => {
  await withForumFeedStubs(async (feeds) => {
    const result = await feeds.filterPostGetPostSummaryByPids({
      uid: 42,
      posts: [
        { pid: 202, topic: { tid: 20, cid: 2 }, category: { cid: 2 } }
      ]
    });

    assert.deepEqual(result.posts, []);
  });
});

test("post create grants let core create-path hydration keep the wiki post", async () => {
  await withForumFeedStubs(async (feeds) => {
    await feeds.filterPostCreate({ post: { pid: 202, tid: 20 } });

    const result = await feeds.filterPostGetPostSummaryByPids({
      uid: 42,
      posts: [
        { pid: 202, topic: { tid: 20, cid: 2 }, category: { cid: 2 } }
      ]
    });

    assert.deepEqual(result.posts.map((post) => post.pid), [202]);
  });
});

test("post create grants ignore posts in non-wiki topics", async () => {
  await withForumFeedStubs(async (feeds) => {
    await feeds.filterPostCreate({ post: { pid: 101, tid: 10 } });

    const result = await feeds.filterPostGetPostSummaryByPids({
      uid: 42,
      posts: [
        { pid: 202, topic: { tid: 20, cid: 2 }, category: { cid: 2 } }
      ]
    });

    assert.deepEqual(result.posts, []);
  });
});

test("post edit grants let core edit-path hydration keep the wiki post", async () => {
  await withForumFeedStubs(async (feeds) => {
    await feeds.filterPostEdit({ data: { pid: 202 } });

    const result = await feeds.filterPostGetPostSummaryByPids({
      uid: 42,
      posts: [
        { pid: 202, topic: { tid: 20, cid: 2 }, category: { cid: 2 } }
      ]
    });

    assert.deepEqual(result.posts.map((post) => post.pid), [202]);
  });
});

test("post summary feed hook still strips a wiki post that was never granted hydration", async () => {
  await withForumFeedStubs(async (feeds) => {
    const result = await feeds.filterPostGetPostSummaryByPids({
      uid: 42,
      posts: [
        { pid: 202, topic: { tid: 20, cid: 2 }, category: { cid: 2 } }, // wiki category post, no grant
        { pid: 101, topic: { tid: 10, cid: 1 }, category: { cid: 1 } } // forum post
      ]
    });
    assert.deepEqual(result.posts.map((p) => p.pid), [101]);
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
