"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const root = process.cwd();

function topicLockKey(tid) {
  return `westgate-wiki:topic-mutation-lock:${tid}`;
}

function clearMutationsModule() {
  const filename = require.resolve(`${root}/lib/wiki-topic-mutations.js`);
  delete require.cache[filename];
}

function loadFreshMutations() {
  clearMutationsModule();
  return require("../lib/wiki-topic-mutations");
}

function createOwnerLockDb({ initialLocks } = {}) {
  const calls = [];
  const locks = new Map(initialLocks || []);
  const db = {
    incrObjectField: async (key, field) => {
      const lock = locks.get(key) || {};
      const next = (parseInt(lock[field], 10) || 0) + 1;
      locks.set(key, { ...lock, [field]: next });
      calls.push(`incr:${key}:${field}:${next}`);
      return next;
    },
    setObjectField: async (key, field, value) => {
      const lock = locks.get(key) || {};
      locks.set(key, { ...lock, [field]: value });
      calls.push(`set:${key}:${field}:${value}`);
    },
    getObjectField: async (key, field) => {
      calls.push(`get:${key}:${field}`);
      const lock = locks.get(key);
      return lock ? lock[field] : null;
    },
    deleteObject: async (key) => {
      calls.push(`delete:${key}`);
      locks.delete(key);
    },
    pexpire: async (key, ms) => {
      calls.push(`pexpire:${key}:${ms}`);
    }
  };
  return { calls, db, locks };
}

test("managed mutation detection ignores spoofable string markers and honors server-only markers", async () => {
  const mutations = loadFreshMutations();
  try {
    assert.equal(mutations.isManagedMutation({
      westgateWikiManagedMutation: true,
      data: { westgateWikiManagedMutation: true },
      body: { westgateWikiManagedMutation: true },
      post: { westgateWikiManagedMutation: true },
      topic: { westgateWikiManagedMutation: true }
    }), false);

    assert.equal(mutations.isManagedMutation(mutations.markManagedMutation({})), true);
    assert.equal(mutations.isManagedMutation({ req: mutations.markManagedMutation({}) }), true);
    assert.equal(mutations.isManagedMutation({ data: mutations.markManagedMutation({}) }), true);
    assert.equal(mutations.isManagedMutation({ body: mutations.markManagedMutation({}) }), true);
    assert.equal(await mutations.withManagedMutationContext(() => mutations.isManagedMutation({})), true);
  } finally {
    clearMutationsModule();
  }
});

test("withTopicMutationGuard rejects concurrent cross-process attempts with a DB topic lock and releases the holder", async () => {
  const originalMainRequire = require.main.require.bind(require.main);
  const { calls, db, locks } = createOwnerLockDb();
  const key = topicLockKey(42);

  require.main.require = function requireNodebbStub(id) {
    if (id === "./src/database") {
      return db;
    }
    return originalMainRequire(id);
  };

  let releaseFirst;
  try {
    const firstProcessMutations = loadFreshMutations();
    const secondProcessMutations = loadFreshMutations();
    let firstPromise;
    const firstEntered = new Promise((resolve) => {
      firstPromise = firstProcessMutations.withTopicMutationGuard(42, async () => {
        resolve();
        await new Promise((release) => {
          releaseFirst = release;
        });
        return "first";
      });
      firstPromise.catch(() => {});
    });

    await firstEntered;

    await assert.rejects(
      () => secondProcessMutations.withTopicMutationGuard(42, async () => "second"),
      /wiki-topic-mutation-locked/
    );
    assert.equal(locks.get(key).count, 2);

    releaseFirst();
    assert.equal(await firstPromise, "first");
    assert.equal(locks.has(key), false);

    assert.equal(
      await secondProcessMutations.withTopicMutationGuard(42, async () => "third"),
      "third"
    );
    assert.equal(locks.has(key), false);
    assert(calls.some((call) => call.startsWith(`pexpire:${key}:`)));
  } finally {
    if (releaseFirst) {
      releaseFirst();
    }
    require.main.require = originalMainRequire;
    clearMutationsModule();
  }
});

test("withTopicMutationGuard does not refresh a busy DB lock on rejected attempts", async () => {
  const originalMainRequire = require.main.require.bind(require.main);
  const key = topicLockKey(42);
  const { calls, db, locks } = createOwnerLockDb({
    initialLocks: [[key, { count: 1, owner: "owner-a" }]]
  });

  require.main.require = function requireNodebbStub(id) {
    if (id === "./src/database") {
      return db;
    }
    return originalMainRequire(id);
  };

  try {
    const mutations = loadFreshMutations();
    await assert.rejects(
      () => mutations.withTopicMutationGuard(42, async () => "blocked"),
      /wiki-topic-mutation-locked/
    );
    assert.equal(locks.get(key).count, 2);
    assert.equal(
      calls.some((call) => call.startsWith("pexpire:")),
      false,
      "rejected attempts must not extend a stale lock's TTL"
    );
  } finally {
    require.main.require = originalMainRequire;
    clearMutationsModule();
  }
});

test("withTopicMutationGuard release does not delete a newer owner lock", async () => {
  const originalMainRequire = require.main.require.bind(require.main);
  const key = topicLockKey(42);
  const { db, locks } = createOwnerLockDb();

  require.main.require = function requireNodebbStub(id) {
    if (id === "./src/database") {
      return db;
    }
    return originalMainRequire(id);
  };

  try {
    const mutations = loadFreshMutations();
    await mutations.withTopicMutationGuard(42, async () => {
      locks.set(key, { count: 1, owner: "new-owner" });
      return "owner-replaced";
    });
    assert.deepEqual(locks.get(key), { count: 1, owner: "new-owner" });
  } finally {
    require.main.require = originalMainRequire;
    clearMutationsModule();
  }
});
