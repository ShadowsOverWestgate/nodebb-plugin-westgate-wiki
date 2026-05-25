"use strict";

const crypto = require("node:crypto");
const diff = require("diff");

const db = require.main.require("./src/database");

const REVISION_LIST_PREFIX = "westgate-wiki:revisions";
const REVISION_RECORD_PREFIX = "westgate-wiki:revision";
const REVISION_PURGE_PREFIX = "westgate-wiki:revision-purge";
const DEFAULT_CHECKPOINT_INTERVAL = 25;
const LARGE_PATCH_RATIO = 0.8;

let nowProvider = () => Date.now();
let revisionIdProvider = null;

function toPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function listKey(tid) {
  return `${REVISION_LIST_PREFIX}:${tid}`;
}

function metaKey(tid) {
  return `${REVISION_LIST_PREFIX}:${tid}:meta`;
}

function purgeMarkerKey(tid) {
  return `${REVISION_PURGE_PREFIX}:${tid}`;
}

function recordKey(tid, revisionId) {
  return `${REVISION_RECORD_PREFIX}:${tid}:${revisionId}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function bytes(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function createRevisionId(input) {
  if (revisionIdProvider) {
    return revisionIdProvider(input);
  }
  if (typeof crypto.randomUUID === "function") {
    return `wrev_${crypto.randomUUID()}`;
  }
  return `wrev_${crypto.randomBytes(18).toString("base64url")}`;
}

function toNonNegativeInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeRecord(record) {
  if (!record) {
    return null;
  }
  return {
    ...record,
    tid: toPositiveInt(record.tid),
    pid: toPositiveInt(record.pid),
    cid: toPositiveInt(record.cid),
    uid: toPositiveInt(record.uid),
    timestamp: toNonNegativeInt(record.timestamp),
    oldBytes: toNonNegativeInt(record.oldBytes),
    newBytes: toNonNegativeInt(record.newBytes),
    patchBytes: toNonNegativeInt(record.patchBytes),
    checkpoint: record.checkpoint === true || record.checkpoint === "1"
  };
}

async function getRevisionIds(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    return [];
  }
  return db.getListRange(listKey(parsedTid), 0, -1);
}

async function deleteKey(key) {
  if (typeof db.delete === "function") {
    await db.delete(key);
    return;
  }
  await db.deleteObject(key);
}

async function hasRevisions(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    return false;
  }

  const meta = await getLatestMeta(parsedTid);
  if (String(meta.latestRevisionId || "") || (parseInt(meta.revisionCount, 10) || 0) > 0) {
    return true;
  }

  if (typeof db.listLength === "function") {
    return (parseInt(await db.listLength(listKey(parsedTid)), 10) || 0) > 0;
  }

  return (await getRevisionIds(parsedTid)).length > 0;
}

async function isRevisionPurgeActive(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    return false;
  }
  return !!(await getRevisionPurge(parsedTid));
}

async function getRevisionPurge(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    return null;
  }
  const marker = await db.getObject(purgeMarkerKey(parsedTid));
  if (!marker) {
    return null;
  }
  return {
    ...marker,
    tid: toPositiveInt(marker.tid) || parsedTid,
    uid: toPositiveInt(marker.uid),
    cid: toPositiveInt(marker.cid),
    tombstoneRevisionId: String(marker.tombstoneRevisionId || ""),
    topicPurged: marker.topicPurged === true || marker.topicPurged === "1"
  };
}

async function beginRevisionPurge(tid, context = {}) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    throw new Error("invalid-wiki-revision-input");
  }
  const marker = {
    tid: String(parsedTid),
    uid: String(toPositiveInt(context.uid)),
    cid: String(toPositiveInt(context.cid)),
    tombstoneRevisionId: String(context.tombstoneRevisionId || ""),
    topicPurged: "0",
    startedAt: String(nowProvider())
  };
  await db.setObject(purgeMarkerKey(parsedTid), {
    ...marker
  });
  return {
    ...marker,
    tid: parsedTid,
    uid: toPositiveInt(marker.uid),
    cid: toPositiveInt(marker.cid),
    active: true,
    topicPurged: false
  };
}

async function markRevisionPurgeTopicPurged(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    throw new Error("invalid-wiki-revision-input");
  }
  const existing = await getRevisionPurge(parsedTid);
  const marker = {
    tid: String(parsedTid),
    uid: String(existing && existing.uid || 0),
    cid: String(existing && existing.cid || 0),
    tombstoneRevisionId: String(existing && existing.tombstoneRevisionId || ""),
    topicPurged: "1",
    startedAt: String(existing && existing.startedAt || nowProvider()),
    topicPurgedAt: String(nowProvider())
  };
  await db.setObject(purgeMarkerKey(parsedTid), marker);
  return {
    ...marker,
    tid: parsedTid,
    uid: toPositiveInt(marker.uid),
    cid: toPositiveInt(marker.cid),
    active: true,
    topicPurged: true
  };
}

async function clearRevisionPurge(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    throw new Error("invalid-wiki-revision-input");
  }
  await deleteKey(purgeMarkerKey(parsedTid));
  return { tid: parsedTid, active: false };
}

async function getStoredRevisionRecord(tid, revisionId) {
  const parsedTid = toPositiveInt(tid);
  const id = String(revisionId || "");
  if (!parsedTid || !id) {
    return null;
  }
  const record = await db.getObject(recordKey(parsedTid, id));
  return record && record.revisionId ? record : null;
}

async function getRevisionRecord(tid, revisionId) {
  return normalizeRecord(await getStoredRevisionRecord(tid, revisionId));
}

async function listRevisions(tid) {
  const ids = await getRevisionIds(tid);
  const rows = [];
  for (const id of ids) {
    const record = await getRevisionRecord(tid, id);
    if (record) {
      rows.push(record);
    }
  }
  return rows;
}

async function listRevisionSummaries(tid) {
  return (await listRevisions(tid)).map((record) => {
    const { patch, checkpointSource, ...summary } = record;
    return summary;
  });
}

function shouldCheckpoint(input) {
  if (!input.parentRevisionId) {
    return true;
  }
  if (["tombstone", "restore", "repair-checkpoint"].includes(input.action)) {
    return true;
  }
  if (!String(input.newSource || "").trim()) {
    return true;
  }
  if (input.revisionCount > 0 && input.revisionCount % DEFAULT_CHECKPOINT_INTERVAL === 0) {
    return true;
  }
  return input.patchBytes > Math.max(1, input.newBytes) * LARGE_PATCH_RATIO;
}

async function getLatestMeta(tid) {
  return (await db.getObject(metaKey(tid))) || {};
}

async function validateRevisionAppendInput(input = {}) {
  const tid = toPositiveInt(input.tid);
  const pid = toPositiveInt(input.pid);
  const cid = toPositiveInt(input.cid);
  const uid = toPositiveInt(input.uid);
  const action = String(input.action || "edit");
  if (!tid || !pid || !cid || !uid) {
    throw new Error("invalid-wiki-revision-input");
  }
  if (await isRevisionPurgeActive(tid)) {
    throw new Error("revision-purge-active");
  }

  const oldSource = String(input.oldSource || "");
  const newSource = String(input.newSource || "");
  const storedMeta = await db.getObject(metaKey(tid));
  const meta = storedMeta || {};
  const latestRevisionId = String(meta.latestRevisionId || "");
  const explicitParentRevisionId = String(input.parentRevisionId || "");
  const parentRevisionId = explicitParentRevisionId || latestRevisionId;
  if (parentRevisionId) {
    const parent = await getStoredRevisionRecord(tid, parentRevisionId);
    if (!parent) {
      throw new Error("revision-parent-not-found");
    }
    if (explicitParentRevisionId && explicitParentRevisionId !== latestRevisionId) {
      throw new Error("revision-parent-not-latest");
    }
    if (sha256(oldSource) !== parent.afterHash) {
      throw new Error("revision-parent-hash-mismatch");
    }
  }

  return {
    tid,
    pid,
    cid,
    uid,
    action,
    oldSource,
    newSource,
    meta,
    metaExists: !!storedMeta,
    parentRevisionId
  };
}

async function assertCanAppendRevision(input = {}) {
  await validateRevisionAppendInput(input);
  return true;
}

async function appendRevision(input = {}) {
  const {
    tid,
    pid,
    cid,
    uid,
    action,
    oldSource,
    newSource,
    meta,
    metaExists,
    parentRevisionId
  } = await validateRevisionAppendInput(input);

  const revisionCount = parseInt(meta.revisionCount, 10) || 0;
  const timestamp = parseInt(input.timestamp, 10) || nowProvider();
  const patch = compareSources(oldSource, newSource);
  const patchBytes = bytes(patch);
  const newBytes = bytes(newSource);
  const checkpoint = shouldCheckpoint({
    action,
    parentRevisionId,
    revisionCount,
    patchBytes,
    newBytes,
    newSource
  });
  const revisionId = String(input.revisionId || "") || createRevisionId({ tid, pid, cid, uid, action, timestamp });

  const record = {
    revisionId,
    parentRevisionId,
    tid: String(tid),
    pid: String(pid),
    cid: String(cid),
    uid: String(uid),
    action,
    timestamp: String(timestamp),
    title: String(input.title || ""),
    canonicalPath: String(input.canonicalPath || ""),
    wikiPath: String(input.wikiPath || ""),
    beforeHash: sha256(oldSource),
    afterHash: sha256(newSource),
    oldBytes: String(bytes(oldSource)),
    newBytes: String(newBytes),
    patchBytes: String(patchBytes),
    checkpoint: checkpoint ? "1" : "0",
    patch: checkpoint ? "" : patch,
    checkpointSource: checkpoint ? newSource : "",
    restoreSourceRevisionId: String(input.restoreSourceRevisionId || ""),
    tombstoneReason: String(input.tombstoneReason || "")
  };

  if (await isRevisionPurgeActive(tid)) {
    throw new Error("revision-purge-active");
  }

  const revisionRecordKey = recordKey(tid, revisionId);
  const revisionMetaKey = metaKey(tid);
  let recordWritten = false;
  let metaWritten = false;
  try {
    await db.setObject(revisionRecordKey, record);
    recordWritten = true;
    await db.setObject(revisionMetaKey, {
      latestRevisionId: revisionId,
      revisionCount: String(revisionCount + 1)
    });
    metaWritten = true;
    await db.listPrepend(listKey(tid), revisionId);
  } catch (err) {
    if (recordWritten) {
      await deleteKey(revisionRecordKey);
    }
    if (metaWritten) {
      if (metaExists) {
        await db.setObject(revisionMetaKey, meta);
      } else {
        await deleteKey(revisionMetaKey);
      }
    }
    throw err;
  }

  return {
    ...record,
    checkpoint
  };
}

async function reconstructRevision(tid, revisionId) {
  const rowsLatestFirst = await listRevisions(tid);
  const rowsChronological = rowsLatestFirst.slice().reverse();
  const targetIndex = rowsChronological.findIndex((row) => row.revisionId === String(revisionId || ""));
  if (targetIndex === -1) {
    throw new Error("revision-not-found");
  }

  let checkpointIndex = targetIndex;
  while (checkpointIndex >= 0 && !rowsChronological[checkpointIndex].checkpoint) {
    checkpointIndex -= 1;
  }
  if (checkpointIndex < 0) {
    throw new Error("revision-checkpoint-missing");
  }

  let source = String(rowsChronological[checkpointIndex].checkpointSource || "");
  if (sha256(source) !== rowsChronological[checkpointIndex].afterHash) {
    throw new Error("revision-hash-mismatch");
  }

  for (let i = checkpointIndex + 1; i <= targetIndex; i += 1) {
    const next = diff.applyPatch(source, rowsChronological[i].patch || "");
    if (typeof next !== "string") {
      throw new Error("revision-patch-apply-failed");
    }
    source = next;
    if (sha256(source) !== rowsChronological[i].afterHash) {
      throw new Error("revision-hash-mismatch");
    }
  }

  return {
    revision: rowsChronological[targetIndex],
    source
  };
}

async function purgeRevisions(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    return { tid: 0, purged: false };
  }

  const ids = await getRevisionIds(parsedTid);
  const keys = ids.map((revisionId) => recordKey(parsedTid, revisionId)).concat([
    listKey(parsedTid),
    metaKey(parsedTid)
  ]);
  if (typeof db.deleteAll === "function") {
    await db.deleteAll(keys);
  } else {
    for (const key of keys) {
      await deleteKey(key);
    }
  }
  return { tid: parsedTid, purged: true };
}

function compareSources(oldSource, newSource) {
  return diff.createPatch("wiki-article.html", String(oldSource || ""), String(newSource || ""));
}

function setNowProvider(fn) {
  nowProvider = typeof fn === "function" ? fn : () => Date.now();
}

function setRevisionIdProvider(fn) {
  revisionIdProvider = typeof fn === "function" ? fn : null;
}

module.exports = {
  appendRevision,
  assertCanAppendRevision,
  beginRevisionPurge,
  clearRevisionPurge,
  compareSources,
  createRevisionId,
  getRevisionPurge,
  getRevisionRecord,
  hasRevisions,
  isRevisionPurgeActive,
  listRevisionSummaries,
  listRevisions,
  markRevisionPurgeTopicPurged,
  purgeRevisions,
  reconstructRevision,
  setNowProvider,
  setRevisionIdProvider,
  _private: {
    listKey,
    metaKey,
    purgeMarkerKey,
    recordKey,
    sha256
  }
};
