"use strict";

const MANAGED_MUTATION_MARKER = "westgateWikiManagedMutation";

const mutationQueues = new Map();

async function withTopicMutationGuard(tid, fn) {
  const key = String(tid || "");
  const previous = mutationQueues.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
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

module.exports = {
  MANAGED_MUTATION_MARKER,
  isManagedMutation,
  managedPostEditPayload,
  markManagedMutation,
  withTopicMutationGuard
};
