"use strict";

const crypto = require("node:crypto");
const diff = require("diff");

const db = require.main.require("./src/database");

const REVISION_LIST_PREFIX = "westgate-wiki:revisions";
const REVISION_RECORD_PREFIX = "westgate-wiki:revision";
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

async function appendRevision(input = {}) {
  const tid = toPositiveInt(input.tid);
  const pid = toPositiveInt(input.pid);
  const cid = toPositiveInt(input.cid);
  const uid = toPositiveInt(input.uid);
  const action = String(input.action || "edit");
  if (!tid || !pid || !cid || !uid) {
    throw new Error("invalid-wiki-revision-input");
  }

  const oldSource = String(input.oldSource || "");
  const newSource = String(input.newSource || "");
  const meta = await getLatestMeta(tid);
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
  const revisionId = createRevisionId({ tid, pid, cid, uid, action, timestamp });

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

  await db.setObject(recordKey(tid, revisionId), record);
  await db.listPrepend(listKey(tid), revisionId);
  await db.setObject(metaKey(tid), {
    latestRevisionId: revisionId,
    revisionCount: String(revisionCount + 1)
  });

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
  compareSources,
  getRevisionRecord,
  listRevisionSummaries,
  listRevisions,
  reconstructRevision,
  setNowProvider,
  setRevisionIdProvider,
  _private: {
    listKey,
    metaKey,
    recordKey,
    sha256
  }
};
