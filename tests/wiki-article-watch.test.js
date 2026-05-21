"use strict";

const assert = require("assert");

const state = {
  settings: {
    categoryIds: "1",
    includeChildCategories: "0"
  },
  categories: new Map([[1, { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 }]]),
  topics: new Map([[10, { tid: 10, cid: 1, mainPid: 100, title: "Watched Page", slug: "10/watched-page" }]]),
  posts: new Map([[100, { pid: 100, tid: 10, uid: 2, editor: 2, edited: 1000, content: "<p>Updated body</p>" }]]),
  usersByUid: new Map(),
  sets: new Map(),
  objectFields: new Map(),
  notifications: [],
  pushes: [],
  deniedUids: new Set()
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

function setUsers(rows) {
  state.usersByUid = new Map(rows.map((row) => [parseInt(row.uid, 10), row]));
}

function getSet(key) {
  if (!state.sets.has(key)) {
    state.sets.set(key, new Set());
  }
  return state.sets.get(key);
}

function getObject(key) {
  if (!state.objectFields.has(key)) {
    state.objectFields.set(key, {});
  }
  return state.objectFields.get(key);
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    nconf: {
      get: (key) => (key === "relative_path" ? "/forum" : "")
    },
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
      getObject: async () => ({}),
      getObjectField: async (key, field) => getObject(key)[field],
      getSetMembers: async (key) => [...getSet(key)],
      getSortedSetRange: async () => [],
      getSortedSetRevRange: async () => [],
      incrObjectField: async (key, field) => {
        const object = getObject(key);
        object[field] = String((parseInt(object[field], 10) || 0) + 1);
        return object[field];
      },
      isSetMember: async (key, value) => getSet(key).has(String(value)),
      setAdd: async (key, value) => {
        const values = Array.isArray(value) ? value : [value];
        values.forEach((entry) => getSet(key).add(String(entry)));
      },
      setRemove: async (key, value) => {
        const values = Array.isArray(value) ? value : [value];
        values.forEach((entry) => getSet(key).delete(String(entry)));
      }
    },
    "./src/meta": {
      settings: {
        get: async () => state.settings,
        setOnEmpty: async () => {},
        set: async () => {}
      }
    },
    "./src/notifications": {
      create: async (notification) => {
        state.notifications.push(notification);
        return notification;
      },
      push: async (notification, uids) => {
        state.pushes.push({ notification, uids });
      }
    },
    "./src/posts": {
      getPostFields: async (pid) => state.posts.get(parseInt(pid, 10)) || null
    },
    "./src/privileges": {
      topics: {
        get: async (tid, uid) => ({
          "topics:read": !state.deniedUids.has(parseInt(uid, 10)),
          view_deleted: false,
          view_scheduled: false
        })
      }
    },
    "./src/slugify": slugify,
    "./src/topics": {
      getTopicData: async (tid) => state.topics.get(parseInt(tid, 10)) || null,
      getTopicFields: async (tid) => state.topics.get(parseInt(tid, 10)) || null
    },
    "./src/user": {
      getUidByUserslug: async () => null,
      getUserFields: async (uid) => state.usersByUid.get(parseInt(uid, 10)) || null
    },
    "./src/utils": {
      isNumber: (value) => value !== null && value !== "" && !Number.isNaN(Number(value))
    }
  };

  if (!stubs[id]) {
    return originalMainRequire(id);
  }
  return stubs[id];
};

const wikiArticleWatch = require("../lib/wiki-article-watch");

function resetRuntime() {
  state.sets = new Map();
  state.objectFields = new Map();
  state.notifications = [];
  state.pushes = [];
  state.deniedUids = new Set();
}

(async () => {
  setUsers([
    { uid: 2, username: "Editor", userslug: "editor", displayname: "Editor" },
    { uid: 3, username: "Watcher", userslug: "watcher", displayname: "Watcher" },
    { uid: 4, username: "Denied", userslug: "denied", displayname: "Denied" }
  ]);

  resetRuntime();
  {
    const result = await wikiArticleWatch.setArticleWatch(10, 3, true);
    assert.deepStrictEqual(result, { status: "ok", tid: 10, watched: true });
    assert.strictEqual((await wikiArticleWatch.getWatchState(10, 3)).wikiArticleWatched, true);
    assert.strictEqual(getSet("westgate-wiki:article-watch:10:uids").has("3"), true, "article watcher set should store uid");
    assert.strictEqual(getSet("uid:3:westgate-wiki:article-watches").has("10"), true, "user watcher set should store tid");
    assert.strictEqual(state.sets.has("tid:10:followers"), false, "wiki article watching should not touch forum topic watch sets");
  }

  {
    const result = await wikiArticleWatch.setArticleWatch(10, 3, false);
    assert.deepStrictEqual(result, { status: "ok", tid: 10, watched: false });
    assert.strictEqual((await wikiArticleWatch.getWatchState(10, 3)).wikiArticleWatched, false);
  }

  resetRuntime();
  await wikiArticleWatch.setArticleWatch(10, 2, true);
  await wikiArticleWatch.setArticleWatch(10, 3, true);
  await wikiArticleWatch.setArticleWatch(10, 4, true);
  state.deniedUids.add(4);

  await wikiArticleWatch.handlePostEdit({
    uid: 2,
    post: { pid: 100, tid: 10, editor: 2, edited: 2000, content: "<p>Edited article</p>" }
  });
  assert.strictEqual(state.notifications.length, 1, "only readable non-editor watchers should be notified");
  assert.strictEqual(state.notifications[0].type, wikiArticleWatch.ARTICLE_EDIT_NOTIFICATION_TYPE);
  assert.strictEqual(state.notifications[0].path, "/wiki/watched-page");
  assert.deepStrictEqual(state.pushes[0].uids, [3]);

  await wikiArticleWatch.handlePostEdit({
    uid: 2,
    post: { pid: 100, tid: 10, editor: 2, edited: 2000, content: "<p>Edited article</p>" }
  });
  assert.strictEqual(state.notifications.length, 1, "same edit should not notify watchers twice");

  {
    const payload = { types: [] };
    await wikiArticleWatch.addUserNotificationTypes(payload);
    assert(payload.types.includes("notificationType_wiki-article-edit"), "watch notification type should be registered");
  }

  console.log("wiki-article-watch tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
