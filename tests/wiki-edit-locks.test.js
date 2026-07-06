"use strict";

const assert = require("node:assert/strict");
const { installNodebbStubs } = require("./helpers/nodebb-stub");

const state = {
  now: 100000,
  objects: new Map(),
  topics: new Map([[10, { tid: 10, cid: 1, mainPid: 100, title: "Locked Page" }]])
};

function getObject(key) {
  if (!state.objects.has(key)) {
    state.objects.set(key, {});
  }
  return state.objects.get(key);
}

installNodebbStubs({
  "./src/database": {
    delete: async (key) => {
      state.objects.delete(key);
    },
    deleteObject: async (key) => {
      state.objects.delete(key);
    },
    getObject: async (key) => state.objects.get(key) || null,
    setObject: async (key, value) => {
      state.objects.set(key, { ...value });
    },
    setObjectField: async (key, field, value) => {
      getObject(key)[field] = value;
    }
  },
  "./src/topics": {
    getTopicField: async (tid, field) => {
      const topic = state.topics.get(parseInt(tid, 10));
      return topic ? topic[field] : null;
    }
  },
  "./src/user": {
    getUserFields: async (uid) => ({
      uid,
      username: uid === 2 ? "Editor" : "Other",
      displayname: uid === 2 ? "Editor" : "Other"
    })
  }
});

const wikiEditLocks = require("../lib/pages/wiki-edit-locks");

wikiEditLocks.setNowProvider(() => state.now);
wikiEditLocks.setTokenProvider(() => `token-${state.now}`);

function resetRuntime() {
  state.now = 100000;
  state.objects = new Map();
}

(async () => {
  resetRuntime();
  {
    const first = await wikiEditLocks.acquireLock(10, 2);
    assert.equal(first.status, "ok");
    assert.equal(first.tid, 10);
    assert.equal(first.uid, 2);
    assert.equal(first.token, "token-100000");
    assert.equal(first.expiresAt, 220000);

    const second = await wikiEditLocks.acquireLock(10, 3);
    assert.equal(second.status, "locked");
    assert.equal(second.lock.uid, 2);
    assert.equal(second.lock.username, "Editor");
    assert.equal(second.lock.expiresAt, 220000);
  }

  resetRuntime();
  {
    let injectedRace = false;
    state.objects.set = function setWithRace(key, value) {
      Map.prototype.set.call(this, key, { ...value });
      if (!injectedRace && key === "westgate-wiki:edit-lock:10") {
        injectedRace = true;
        Map.prototype.set.call(this, key, {
          tid: "10",
          uid: "3",
          token: "race-winner",
          createdAt: String(state.now),
          updatedAt: String(state.now),
          expiresAt: String(state.now + wikiEditLocks.DEFAULT_LOCK_TTL_MS)
        });
      }
      return this;
    };

    const result = await wikiEditLocks.acquireLock(10, 2);
    assert.equal(result.status, "locked");
    assert.equal(result.lock.uid, 3);
    state.objects.set = Map.prototype.set;
  }

  resetRuntime();
  {
    await wikiEditLocks.acquireLock(10, 2);
    state.now += wikiEditLocks.DEFAULT_LOCK_TTL_MS + 1;

    const result = await wikiEditLocks.acquireLock(10, 3);
    assert.equal(result.status, "ok");
    assert.equal(result.uid, 3);
    assert.equal(result.token, "token-220001");
  }

  resetRuntime();
  {
    const acquired = await wikiEditLocks.acquireLock(10, 2);
    state.now += 30000;
    const renewed = await wikiEditLocks.refreshLock(10, 2, acquired.token);
    assert.equal(renewed.status, "ok");
    assert.equal(renewed.token, acquired.token);
    assert.equal(renewed.expiresAt, 250000);

    const wrongToken = await wikiEditLocks.refreshLock(10, 2, "wrong");
    assert.equal(wrongToken.status, "locked");
  }

  resetRuntime();
  {
    const acquired = await wikiEditLocks.acquireLock(10, 2);
    assert.equal((await wikiEditLocks.assertSaveLock(10, 2, acquired.token)).status, "ok");
    assert.equal((await wikiEditLocks.assertSaveLock(10, 3, acquired.token)).status, "locked");
    assert.equal((await wikiEditLocks.assertSaveLock(10, 2, "wrong")).status, "locked");
    await wikiEditLocks.releaseLock(10, 2, acquired.token);
    assert.equal((await wikiEditLocks.assertSaveLock(10, 2, acquired.token)).status, "missing");
  }

  resetRuntime();
  {
    const acquired = await wikiEditLocks.acquireLock(10, 2);
    state.now += wikiEditLocks.DEFAULT_LOCK_TTL_MS + 1;
    assert.equal((await wikiEditLocks.assertSaveLock(10, 2, acquired.token)).status, "expired");
  }

  console.log("wiki-edit-locks tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
