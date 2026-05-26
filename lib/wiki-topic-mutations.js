"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const crypto = require("node:crypto");

const MANAGED_MUTATION_MARKER = Symbol.for("nodebb-plugin-westgate-wiki.managedMutation");
const TOPIC_MUTATION_LOCK_KEY = "westgate-wiki:topic-mutation-lock";
const TOPIC_MUTATION_LOCK_TTL_MS = 5 * 60 * 1000;
const TOPIC_MUTATION_LOCK_COUNT_FIELD = "count";
const TOPIC_MUTATION_LOCK_OWNER_FIELD = "owner";

const managedMutationContext = new AsyncLocalStorage();
const mutationQueues = new Map();

function getDatabase() {
  try {
    return require.main.require("./src/database");
  } catch (err) {
    return null;
  }
}

function topicMutationLockKey(tid) {
  return `${TOPIC_MUTATION_LOCK_KEY}:${tid}`;
}

function createOwnerToken() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(18).toString("base64url");
}

async function deleteLockKey(db, lockKey) {
  if (typeof db.deleteObject === "function") {
    await db.deleteObject(lockKey);
  } else if (typeof db.delete === "function") {
    await db.delete(lockKey);
  }
}

async function acquireTopicMutationLock(key) {
  const db = getDatabase();
  if (
    !db ||
    typeof db.incrObjectField !== "function" ||
    typeof db.setObjectField !== "function" ||
    typeof db.getObjectField !== "function" ||
    (typeof db.deleteObject !== "function" && typeof db.delete !== "function")
  ) {
    return async () => {};
  }

  const lockKey = topicMutationLockKey(key);
  const ownerToken = createOwnerToken();
  const count = parseInt(await db.incrObjectField(lockKey, TOPIC_MUTATION_LOCK_COUNT_FIELD), 10);
  if (count !== 1) {
    const err = new Error("wiki-topic-mutation-locked");
    err.code = "wiki-topic-mutation-locked";
    err.statusCode = 409;
    throw err;
  }
  await db.setObjectField(lockKey, TOPIC_MUTATION_LOCK_OWNER_FIELD, ownerToken);
  if (typeof db.pexpire === "function") {
    await db.pexpire(lockKey, TOPIC_MUTATION_LOCK_TTL_MS);
  } else if (typeof db.expire === "function") {
    await db.expire(lockKey, Math.ceil(TOPIC_MUTATION_LOCK_TTL_MS / 1000));
  }

  let released = false;
  return async () => {
    if (released) {
      return;
    }
    released = true;
    const currentOwner = await db.getObjectField(lockKey, TOPIC_MUTATION_LOCK_OWNER_FIELD);
    if (currentOwner === ownerToken) {
      await deleteLockKey(db, lockKey);
    }
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
