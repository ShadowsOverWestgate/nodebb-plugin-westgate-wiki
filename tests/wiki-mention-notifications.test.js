"use strict";

const assert = require("assert");

const state = {
  settings: {
    categoryIds: "1",
    includeChildCategories: "0"
  },
  categories: new Map([[1, { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 }]]),
  topics: new Map([[10, { tid: 10, cid: 1, mainPid: 100, title: "Mentioned Page", slug: "10/mentioned-page" }]]),
  posts: new Map([[100, { pid: 100, tid: 10, uid: 2, content: "<p>Hello @target</p>" }]]),
  usersBySlug: new Map(),
  usersByUid: new Map(),
  objectFields: new Map(),
  sets: new Map(),
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
  state.usersBySlug = new Map(rows.map((row) => [row.userslug, row]));
  state.usersByUid = new Map(rows.map((row) => [parseInt(row.uid, 10), row]));
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
    "./src/controllers/helpers": {},
    "./src/database": {
      getObject: async () => ({}),
      getObjectField: async (key, field) => getObject(key)[field],
      getSortedSetRange: async () => [],
      getSortedSetRevRange: async () => [],
      incrObjectField: async (key, field) => {
        const object = getObject(key);
        object[field] = String((parseInt(object[field], 10) || 0) + 1);
        return object[field];
      },
      isSetMember: async (key, value) => {
        const set = state.sets.get(key);
        return !!(set && set.has(String(value)));
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
      categories: { isAdminOrMod: async () => false },
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
      isAdministrator: async () => false,
      isGlobalModerator: async () => false,
      getUidByUserslug: async (userslug) => {
        const row = state.usersBySlug.get(userslug);
        return row ? row.uid : null;
      },
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

const wikiMentionNotifications = require("../lib/wiki-mention-notifications");

function resetRuntime() {
  state.objectFields = new Map();
  state.sets = new Map();
  state.notifications = [];
  state.pushes = [];
  state.deniedUids = new Set();
}

(async () => {
  setUsers([
    { uid: 2, username: "Author", userslug: "author", displayname: "Author" },
    { uid: 3, username: "target", userslug: "target", displayname: "Target" },
    { uid: 4, username: "other", userslug: "other", displayname: "Other" }
  ]);

  resetRuntime();
  await wikiMentionNotifications.handlePostSaveOrEdit({
    post: { pid: 100, tid: 10, uid: 2, content: "<p>Hello @target</p>" }
  });
  assert.strictEqual(state.notifications.length, 1, "first wiki article mention should notify");
  assert.strictEqual(state.notifications[0].type, "mention");
  assert.strictEqual(state.notifications[0].path, "/wiki/mentioned-page");
  assert.deepStrictEqual(state.pushes[0].uids, [3]);

  await wikiMentionNotifications.handlePostSaveOrEdit({
    post: { pid: 100, tid: 10, uid: 2, content: "<p>Hello again @target</p>" }
  });
  assert.strictEqual(state.notifications.length, 1, "repeat edit should not notify same mentioned user");

  await wikiMentionNotifications.handlePostSaveOrEdit({
    post: { pid: 100, tid: 10, uid: 2, content: "<p>Hello @target and @other</p>" }
  });
  assert.strictEqual(state.notifications.length, 2, "newly added mentioned user should notify once");
  assert.deepStrictEqual(state.pushes[1].uids, [4]);

  await wikiMentionNotifications.handlePostSaveOrEdit({
    post: { pid: 100, tid: 10, uid: 2, content: "<p>Self @author</p>" }
  });
  assert.strictEqual(state.notifications.length, 2, "self mentions should not notify");

  resetRuntime();
  state.deniedUids.add(4);
  await wikiMentionNotifications.handlePostSaveOrEdit({
    post: { pid: 100, tid: 10, uid: 2, content: "<p>Denied @other</p>" }
  });
  assert.strictEqual(state.notifications.length, 0, "unreadable users should not be notified");

  {
    const payload = { data: { type: "mention", pid: 100 } };
    const result = await wikiMentionNotifications.filterNotificationsCreate(payload);
    assert.strictEqual(result.data, null, "default mention notification should be suppressed for wiki articles");
  }

  {
    const payload = {
      data: {
        type: "mention",
        pid: 100,
        [wikiMentionNotifications.PLUGIN_MENTION_MARKER]: true
      }
    };
    const result = await wikiMentionNotifications.filterNotificationsCreate(payload);
    assert(result.data, "plugin-owned mention notification should not be suppressed");
  }

  {
    const payload = { data: { type: "mention", pid: 999 } };
    const result = await wikiMentionNotifications.filterNotificationsCreate(payload);
    assert(result.data, "non-wiki mention notification should pass through");
  }

  resetRuntime();
  const claims = await Promise.all([
    wikiMentionNotifications.claimMentionNotification(100, 3),
    wikiMentionNotifications.claimMentionNotification(100, 3)
  ]);
  assert.strictEqual(claims.filter(Boolean).length, 1, "atomic mention claim should allow only one sender");

  resetRuntime();
  state.sets.set("mentions:pid:100:uids", new Set(["3"]));
  assert.strictEqual(await wikiMentionNotifications.claimMentionNotification(100, 3), false, "legacy mention ledger should suppress migration duplicate");

  console.log("wiki-mention-notifications tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
