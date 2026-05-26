"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const root = process.cwd();

function clearMutationsModule() {
  const filename = require.resolve(`${root}/lib/wiki-topic-mutations.js`);
  delete require.cache[filename];
}

function loadFreshMutations() {
  clearMutationsModule();
  return require("../lib/wiki-topic-mutations");
}

test("withTopicMutationGuard rejects concurrent cross-process attempts with a DB topic lock and releases the holder", async () => {
  const originalMainRequire = require.main.require.bind(require.main);
  const calls = [];
  const locks = new Map();
  const db = {
    incrObjectField: async (key, field) => {
      const next = (locks.get(field) || 0) + 1;
      locks.set(field, next);
      calls.push(`incr:${key}:${field}:${next}`);
      return next;
    },
    deleteObjectField: async (key, field) => {
      calls.push(`delete:${key}:${field}`);
      locks.delete(field);
    },
    pexpire: async (key, ms) => {
      calls.push(`pexpire:${key}:${ms}`);
    }
  };

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
    assert.equal(locks.get("42"), 2);

    releaseFirst();
    assert.equal(await firstPromise, "first");
    assert.equal(locks.has("42"), false);

    assert.equal(
      await secondProcessMutations.withTopicMutationGuard(42, async () => "third"),
      "third"
    );
    assert.equal(locks.has("42"), false);
    assert(calls.some((call) => call.startsWith("pexpire:westgate-wiki:topic-mutation-locks:")));
  } finally {
    if (releaseFirst) {
      releaseFirst();
    }
    require.main.require = originalMainRequire;
    clearMutationsModule();
  }
});
