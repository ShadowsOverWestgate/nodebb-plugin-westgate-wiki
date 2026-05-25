"use strict";

const assert = require("node:assert/strict");

const TOMBSTONE_FIELDS = [
  "westgateWikiTombstoned",
  "westgateWikiTombstoneAt",
  "westgateWikiTombstoneUid",
  "westgateWikiTombstoneRevisionId",
  "westgateWikiTombstoneReason"
];

const state = {
  topicFields: new Map(),
  getTopicFieldsCalls: [],
  purgeCalls: [],
  setTopicFieldsCalls: [],
  setTopicFieldCalls: [],
  failSetTopicField: ""
};

const originalMainRequire = require.main.require.bind(require.main);
const topicsStub = {
  getTopicFields: async (tid, fields) => {
    state.getTopicFieldsCalls.push({ tid, fields });
    const row = topic(tid);
    return fields.reduce((memo, field) => {
      memo[field] = row[field] || "";
      return memo;
    }, {});
  },
  setTopicFields: async (tid, values) => {
    state.setTopicFieldsCalls.push({ tid, values: { ...values } });
    Object.entries(values).forEach(([field, value]) => {
      topic(tid)[field] = String(value);
    });
  },
  setTopicField: async (tid, field, value) => {
    state.setTopicFieldCalls.push({ tid, field, value });
    if (field === state.failSetTopicField) {
      throw new Error(`failed-${field}`);
    }
    topic(tid)[field] = String(value);
  },
  purgePostsAndTopic: async (tids, uid) => {
    state.purgeCalls.push({ tids, uid });
  }
};

function topic(tid) {
  const key = String(tid);
  if (!state.topicFields.has(key)) {
    state.topicFields.set(key, {});
  }
  return state.topicFields.get(key);
}

function reset() {
  state.topicFields = new Map();
  state.getTopicFieldsCalls = [];
  state.purgeCalls = [];
  state.setTopicFieldsCalls = [];
  state.setTopicFieldCalls = [];
  state.failSetTopicField = "";
  topicsStub.setTopicFields = async (tid, values) => {
    state.setTopicFieldsCalls.push({ tid, values: { ...values } });
    Object.entries(values).forEach(([field, value]) => {
      topic(tid)[field] = String(value);
    });
  };
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "./src/topics": topicsStub
  };
  return stubs[id] || originalMainRequire(id);
};

(async () => {
  try {
    const tombstones = require("../lib/wiki-tombstones");

    reset();
    const written = await tombstones.setTombstone({
      tid: "42",
      uid: "7",
      revisionId: "rev-delete-1",
      reason: "duplicate page",
      timestamp: "12345"
    });
    assert.deepEqual(written, {
      tid: 42,
      uid: 7,
      revisionId: "rev-delete-1",
      at: 12345,
      reason: "duplicate page"
    });
    assert.deepEqual(topic(42), {
      westgateWikiTombstoned: "1",
      westgateWikiTombstoneAt: "12345",
      westgateWikiTombstoneUid: "7",
      westgateWikiTombstoneRevisionId: "rev-delete-1",
      westgateWikiTombstoneReason: "duplicate page"
    });
    assert.equal(state.setTopicFieldsCalls.length, 1);
    assert.deepEqual(state.setTopicFieldsCalls[0], {
      tid: 42,
      values: {
        westgateWikiTombstoned: "1",
        westgateWikiTombstoneAt: "12345",
        westgateWikiTombstoneUid: "7",
        westgateWikiTombstoneRevisionId: "rev-delete-1",
        westgateWikiTombstoneReason: "duplicate page"
      }
    });
    assert.deepEqual(state.setTopicFieldCalls, []);

    const parsed = await tombstones.getTombstone(42);
    assert.deepEqual(parsed, {
      tombstoned: true,
      at: 12345,
      uid: 7,
      revisionId: "rev-delete-1",
      reason: "duplicate page"
    });
    assert.equal(await tombstones.getTombstone(0), null);
    state.getTopicFieldsCalls = [];
    assert.equal(await tombstones.getTombstone("42abc"), null);
    assert.equal(await tombstones.getTombstone("1.5"), null);
    assert.equal(await tombstones.getTombstone("9007199254740993"), null);
    assert.equal(await tombstones.getTombstone(Number.MAX_SAFE_INTEGER + 1), null);
    assert.deepEqual(state.getTopicFieldsCalls, []);

    assert.equal(tombstones.isTombstonedTopic({ westgateWikiTombstoned: "1" }), true);
    assert.equal(tombstones.isTombstonedTopic({ westgateWikiTombstoned: 1 }), true);
    assert.equal(tombstones.isTombstonedTopic({ westgateWikiTombstoned: true }), false);
    assert.equal(tombstones.isTombstonedTopic({ westgateWikiTombstoned: "0" }), false);
    assert.equal(tombstones.isTombstonedTopic({ westgateWikiTombstoned: "" }), false);
    assert.equal(tombstones.isTombstonedTopic({}), false);
    assert.equal(tombstones.getTombstoneFromFields({ westgateWikiTombstoned: "0" }), null);

    reset();
    topicsStub.setTopicFields = null;
    state.failSetTopicField = "westgateWikiTombstoneRevisionId";
    await assert.rejects(
      () => tombstones.setTombstone({
        tid: 43,
        uid: 9,
        revisionId: "rev-failure",
        reason: "failure test",
        timestamp: 123
      }),
      /failed-westgateWikiTombstoneRevisionId/
    );
    assert.deepEqual(state.setTopicFieldCalls.map((call) => call.field), [
      "westgateWikiTombstoneAt",
      "westgateWikiTombstoneUid",
      "westgateWikiTombstoneRevisionId"
    ]);
    assert.notEqual(topic(43).westgateWikiTombstoned, "1");

    reset();
    await tombstones.setTombstone({
      tid: 42,
      uid: 7,
      revisionId: "rev-delete-clear",
      reason: "",
      timestamp: 12346
    });
    const cleared = await tombstones.clearTombstone("42");
    assert.deepEqual(cleared, { tid: 42, cleared: true });
    assert.deepEqual(topic(42), TOMBSTONE_FIELDS.reduce((memo, field) => {
      memo[field] = "";
      return memo;
    }, {}));

    await assert.rejects(
      () => tombstones.hardPurgeTombstone(42, 7),
      /wiki-page-not-tombstoned/
    );
    assert.deepEqual(state.purgeCalls, []);

    topic(42).westgateWikiTombstoned = "1";
    topic(42).westgateWikiTombstoneAt = "12346";
    topic(42).westgateWikiTombstoneUid = "7";
    topic(42).westgateWikiTombstoneRevisionId = "";
    await assert.rejects(
      () => tombstones.hardPurgeTombstone(42, 7),
      /wiki-page-tombstone-incomplete/
    );
    assert.deepEqual(state.purgeCalls, []);

    topic(42).westgateWikiTombstoneRevisionId = "   ";
    await assert.rejects(
      () => tombstones.hardPurgeTombstone(42, 7),
      /wiki-page-tombstone-incomplete/
    );
    assert.deepEqual(state.purgeCalls, []);

    reset();
    await tombstones.setTombstone({
      tid: 42,
      uid: 7,
      revisionId: "rev-delete-2",
      reason: "",
      timestamp: 12346
    });
    const purged = await tombstones.hardPurgeTombstone("42", "8");
    assert.deepEqual(purged, { tid: 42, purged: true });
    assert.deepEqual(state.purgeCalls, [{ tids: [42], uid: 8 }]);

    await assert.rejects(
      () => tombstones.setTombstone({ tid: 0, uid: 1, revisionId: "rev" }),
      /invalid-wiki-tombstone/
    );
    await assert.rejects(
      () => tombstones.setTombstone({ tid: "9007199254740993", uid: 1, revisionId: "rev" }),
      /invalid-wiki-tombstone/
    );
    await assert.rejects(
      () => tombstones.clearTombstone(Number.MAX_SAFE_INTEGER + 1),
      /invalid-wiki-tombstone/
    );
    await assert.rejects(
      () => tombstones.setTombstone({ tid: 1, uid: 0, revisionId: "rev" }),
      /invalid-wiki-tombstone/
    );
    await assert.rejects(
      () => tombstones.setTombstone({ tid: 1, uid: 1, revisionId: "" }),
      /invalid-wiki-tombstone/
    );
    await assert.rejects(
      () => tombstones.clearTombstone(0),
      /invalid-wiki-tombstone/
    );
    await assert.rejects(
      () => tombstones.hardPurgeTombstone(0, 1),
      /invalid-wiki-tombstone/
    );

    console.log("wiki tombstones tests passed");
  } finally {
    require.main.require = originalMainRequire;
  }
})().catch((err) => {
  console.error(err);
  throw err;
});
