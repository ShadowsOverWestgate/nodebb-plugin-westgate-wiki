"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

const MANAGED_MUTATION_MARKER = "westgateWikiManagedMutation";
const TOPIC_MUTATION_LOCK_KEY = "westgate-wiki:topic-mutation-locks";
const TOPIC_MUTATION_LOCK_TTL_MS = 5 * 60 * 1000;

const managedMutationContext = new AsyncLocalStorage();
const mutationQueues = new Map();

function getDatabase() {
  try {
    return require.main.require("./src/database");
  } catch (err) {
    return null;
  }
}

async function acquireTopicMutationLock(key) {
  const db = getDatabase();
  if (!db || typeof db.incrObjectField !== "function" || typeof db.deleteObjectField !== "function") {
    return async () => {};
  }

  const count = parseInt(await db.incrObjectField(TOPIC_MUTATION_LOCK_KEY, key), 10);
  if (typeof db.pexpire === "function") {
    await db.pexpire(TOPIC_MUTATION_LOCK_KEY, TOPIC_MUTATION_LOCK_TTL_MS);
  } else if (typeof db.expire === "function") {
    await db.expire(TOPIC_MUTATION_LOCK_KEY, Math.ceil(TOPIC_MUTATION_LOCK_TTL_MS / 1000));
  }

  if (count !== 1) {
    const err = new Error("wiki-topic-mutation-locked");
    err.code = "wiki-topic-mutation-locked";
    err.statusCode = 409;
    throw err;
  }

  let released = false;
  return async () => {
    if (released) {
      return;
    }
    released = true;
    await db.deleteObjectField(TOPIC_MUTATION_LOCK_KEY, key);
  };
}

async function withTopicMutationGuard(tid, fn) {
  const key = String(tid || "");
  const previous = mutationQueues.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(async () => {
    const release = await acquireTopicMutationLock(key);
    try {
      return await fn();
    } finally {
      await release();
    }
  });
  const tail = run.catch(() => {});
  mutationQueues.set(key, tail);
  try {
    return await run;
  } finally {
    if (mutationQueues.get(key) === tail) {
      mutationQueues.delete(key);
    }
  }
}

function markManagedMutation(target) {
  if (target && typeof target === "object") {
    Object.defineProperty(target, MANAGED_MUTATION_MARKER, {
      configurable: true,
      enumerable: false,
      value: true,
      writable: true
    });
  }
  return target;
}

function isManagedMutation(data) {
  if (managedMutationContext.getStore() === true) {
    return true;
  }
  return !!(
    data &&
    (
      data[MANAGED_MUTATION_MARKER] ||
      (data.req && data.req[MANAGED_MUTATION_MARKER]) ||
      (data.data && data.data[MANAGED_MUTATION_MARKER]) ||
      (data.body && data.body[MANAGED_MUTATION_MARKER]) ||
      (data.post && data.post[MANAGED_MUTATION_MARKER]) ||
      (data.topic && data.topic[MANAGED_MUTATION_MARKER])
    )
  );
}

function managedPostEditPayload(payload, req) {
  if (req) {
    markManagedMutation(req);
  }
  return markManagedMutation({
    ...payload,
    req
  });
}

function withManagedMutationContext(fn) {
  return managedMutationContext.run(true, fn);
}

module.exports = {
  MANAGED_MUTATION_MARKER,
  TOPIC_MUTATION_LOCK_KEY,
  isManagedMutation,
  managedPostEditPayload,
  markManagedMutation,
  withManagedMutationContext,
  withTopicMutationGuard
};
