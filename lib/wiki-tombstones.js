"use strict";

const wikiTopicMutations = require("./wiki-topic-mutations");

const TOMBSTONE_FIELDS = [
  "westgateWikiTombstoned",
  "westgateWikiTombstoneAt",
  "westgateWikiTombstoneUid",
  "westgateWikiTombstoneRevisionId",
  "westgateWikiTombstoneReason"
];

function toPositiveInt(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) && Number.isSafeInteger(value) && value > 0 ? value : 0;
  }
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }
  return 0;
}

function isTombstonedTopic(topic) {
  if (!topic) {
    return false;
  }
  const marker = topic.westgateWikiTombstoned;
  return (typeof marker === "string" || typeof marker === "number") && String(marker) === "1";
}

function getTombstoneFromFields(fields = {}) {
  if (!isTombstonedTopic(fields)) {
    return null;
  }

  return {
    tombstoned: true,
    at: toPositiveInt(fields.westgateWikiTombstoneAt),
    uid: toPositiveInt(fields.westgateWikiTombstoneUid),
    revisionId: String(fields.westgateWikiTombstoneRevisionId || "").trim(),
    reason: String(fields.westgateWikiTombstoneReason || "")
  };
}

function getTopics() {
  return require.main.require("./src/topics");
}

async function getTombstone(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    return null;
  }
  const topics = getTopics();
  if (!topics || typeof topics.getTopicFields !== "function") {
    return null;
  }
  const fields = await topics.getTopicFields(parsedTid, TOMBSTONE_FIELDS);
  return getTombstoneFromFields(fields);
}

function invalid() {
  throw new Error("invalid-wiki-tombstone");
}

function normalizeTombstoneInput(input = {}) {
  const tid = toPositiveInt(input.tid);
  const uid = toPositiveInt(input.uid);
  const revisionId = String(input.revisionId || "").trim();
  if (!tid || !uid || !revisionId) {
    invalid();
  }

  return {
    tid,
    uid,
    revisionId,
    at: toPositiveInt(input.timestamp) || Date.now(),
    reason: String(input.reason || "")
  };
}

async function setTombstone(input = {}) {
  const tombstone = normalizeTombstoneInput(input);
  const values = {
    westgateWikiTombstoned: "1",
    westgateWikiTombstoneAt: String(tombstone.at),
    westgateWikiTombstoneUid: String(tombstone.uid),
    westgateWikiTombstoneRevisionId: tombstone.revisionId,
    westgateWikiTombstoneReason: tombstone.reason
  };

  const topics = getTopics();
  if (typeof topics.setTopicFields === "function") {
    await topics.setTopicFields(tombstone.tid, values);
    return tombstone;
  }

  const fallbackFields = TOMBSTONE_FIELDS.slice(1).concat(TOMBSTONE_FIELDS[0]);
  for (const field of fallbackFields) {
    await topics.setTopicField(tombstone.tid, field, values[field]);
  }

  return tombstone;
}

function normalizeTid(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    invalid();
  }
  return parsedTid;
}

async function clearTombstone(tid) {
  const parsedTid = normalizeTid(tid);
  const topics = getTopics();
  const fields = TOMBSTONE_FIELDS.slice(1).concat(TOMBSTONE_FIELDS[0]);
  for (const field of fields) {
    await topics.setTopicField(parsedTid, field, "");
  }
  return { tid: parsedTid, cleared: true };
}

async function clearTombstoneIfRevision(tid, revisionId) {
  const parsedTid = normalizeTid(tid);
  const expectedRevisionId = String(revisionId || "").trim();
  const tombstone = await getTombstone(parsedTid);
  if (!tombstone || !expectedRevisionId || tombstone.revisionId !== expectedRevisionId) {
    return { tid: parsedTid, cleared: false, matched: false };
  }

  await clearTombstone(parsedTid);
  return { tid: parsedTid, cleared: true, matched: true };
}

async function getTombstoneIfRevision(tid, revisionId) {
  const parsedTid = normalizeTid(tid);
  const expectedRevisionId = String(revisionId || "").trim();
  if (!expectedRevisionId) {
    return null;
  }

  const tombstone = await getTombstone(parsedTid);
  return tombstone && tombstone.revisionId === expectedRevisionId ? tombstone : null;
}

async function hardPurgeTombstone(tid, uid) {
  const parsedTid = normalizeTid(tid);
  const parsedUid = toPositiveInt(uid);
  if (!parsedUid) {
    invalid();
  }

  const tombstone = await getTombstone(parsedTid);
  if (!tombstone) {
    throw new Error("wiki-page-not-tombstoned");
  }
  if (!tombstone.at || !tombstone.uid || !tombstone.revisionId) {
    throw new Error("wiki-page-tombstone-incomplete");
  }

  const topics = getTopics();
  await wikiTopicMutations.withManagedMutationContext(() => topics.purgePostsAndTopic([parsedTid], parsedUid));
  return { tid: parsedTid, purged: true };
}

async function hardPurgeTombstoneIfRevision(tid, uid, revisionId) {
  const parsedTid = normalizeTid(tid);
  const parsedUid = toPositiveInt(uid);
  if (!parsedUid) {
    invalid();
  }

  const tombstone = await getTombstoneIfRevision(parsedTid, revisionId);
  if (!tombstone) {
    throw new Error("wiki-page-tombstone-stale");
  }
  if (!tombstone.at || !tombstone.uid || !tombstone.revisionId) {
    throw new Error("wiki-page-tombstone-incomplete");
  }

  const topics = getTopics();
  await wikiTopicMutations.withManagedMutationContext(() => topics.purgePostsAndTopic([parsedTid], parsedUid));
  return { tid: parsedTid, purged: true };
}

async function hardPurgeCheckedTombstone(tid, uid, tombstone) {
  const parsedTid = normalizeTid(tid);
  const parsedUid = toPositiveInt(uid);
  if (!parsedUid) {
    invalid();
  }
  if (!tombstone || !tombstone.at || !tombstone.uid || !String(tombstone.revisionId || "").trim()) {
    throw new Error("wiki-page-tombstone-incomplete");
  }

  const topics = getTopics();
  await wikiTopicMutations.withManagedMutationContext(() => topics.purgePostsAndTopic([parsedTid], parsedUid));
  return { tid: parsedTid, purged: true };
}

module.exports = {
  TOMBSTONE_FIELDS,
  isTombstonedTopic,
  getTombstoneFromFields,
  getTombstone,
  setTombstone,
  clearTombstone,
  clearTombstoneIfRevision,
  getTombstoneIfRevision,
  hardPurgeTombstone,
  hardPurgeTombstoneIfRevision,
  hardPurgeCheckedTombstone
};
