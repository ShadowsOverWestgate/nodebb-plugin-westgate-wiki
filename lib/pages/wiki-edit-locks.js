"use strict";

const crypto = require("crypto");

const db = require.main.require("./src/database");
const helpers = require.main.require("./src/controllers/helpers");
const user = require.main.require("./src/user");
const topics = require.main.require("./src/topics");
const privileges = require.main.require("./src/privileges");

const config = require("../core/config");

const DEFAULT_LOCK_TTL_MS = 2 * 60 * 1000;

let nowProvider = () => Date.now();
let tokenProvider = () => {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(18).toString("base64url");
};

function lockKey(tid) {
  return `westgate-wiki:edit-lock:${tid}`;
}

function toPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function now() {
  return nowProvider();
}

function isExpired(lock, at) {
  const expiresAt = toPositiveInt(lock && lock.expiresAt);
  return !expiresAt || expiresAt <= at;
}

async function deleteLock(tid) {
  const key = lockKey(tid);
  if (typeof db.deleteObject === "function") {
    await db.deleteObject(key);
  } else if (typeof db.delete === "function") {
    await db.delete(key);
  }
}

function normalizeLock(raw) {
  if (!raw) {
    return null;
  }
  const tid = toPositiveInt(raw.tid);
  const uid = toPositiveInt(raw.uid);
  const token = String(raw.token || "");
  if (!tid || !uid || !token) {
    return null;
  }
  return {
    tid,
    uid,
    token,
    createdAt: toPositiveInt(raw.createdAt),
    updatedAt: toPositiveInt(raw.updatedAt),
    expiresAt: toPositiveInt(raw.expiresAt)
  };
}

async function decorateLock(lock) {
  if (!lock) {
    return null;
  }
  let username = "";
  if (typeof user.getUserFields === "function") {
    const userData = await user.getUserFields(lock.uid, ["displayname", "username"]);
    username = String((userData && (userData.displayname || userData.username)) || "");
  }
  return {
    uid: lock.uid,
    username,
    updatedAt: lock.updatedAt,
    expiresAt: lock.expiresAt
  };
}

async function getStoredLock(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    return null;
  }
  return normalizeLock(await db.getObject(lockKey(parsedTid)));
}

async function storeLock(lock) {
  await db.setObject(lockKey(lock.tid), {
    tid: String(lock.tid),
    uid: String(lock.uid),
    token: lock.token,
    createdAt: String(lock.createdAt),
    updatedAt: String(lock.updatedAt),
    expiresAt: String(lock.expiresAt)
  });
}

async function acquireLock(tid, uid) {
  const parsedTid = toPositiveInt(tid);
  const parsedUid = toPositiveInt(uid);
  if (!parsedTid || !parsedUid) {
    return { status: "not-found" };
  }

  const at = now();
  const existing = await getStoredLock(parsedTid);
  if (existing && !isExpired(existing, at) && existing.uid !== parsedUid) {
    return {
      status: "locked",
      lock: await decorateLock(existing)
    };
  }

  const createdAt = existing && existing.uid === parsedUid && !isExpired(existing, at) ? existing.createdAt : at;
  const lock = {
    tid: parsedTid,
    uid: parsedUid,
    token: tokenProvider(),
    createdAt,
    updatedAt: at,
    expiresAt: at + DEFAULT_LOCK_TTL_MS
  };
  await storeLock(lock);
  const stored = await getStoredLock(parsedTid);
  if (!stored || stored.uid !== lock.uid || stored.token !== lock.token) {
    return {
      status: "locked",
      lock: await decorateLock(stored)
    };
  }

  return {
    status: "ok",
    tid: lock.tid,
    uid: lock.uid,
    token: lock.token,
    expiresAt: lock.expiresAt,
    ttlMs: DEFAULT_LOCK_TTL_MS
  };
}

async function refreshLock(tid, uid, token) {
  const parsedTid = toPositiveInt(tid);
  const parsedUid = toPositiveInt(uid);
  const lockToken = String(token || "");
  if (!parsedTid || !parsedUid || !lockToken) {
    return { status: "not-found" };
  }

  const at = now();
  const existing = await getStoredLock(parsedTid);
  if (!existing) {
    return { status: "missing" };
  }
  if (isExpired(existing, at)) {
    await deleteLock(parsedTid);
    return { status: "expired" };
  }
  if (existing.uid !== parsedUid || existing.token !== lockToken) {
    return {
      status: "locked",
      lock: await decorateLock(existing)
    };
  }

  const renewed = {
    ...existing,
    updatedAt: at,
    expiresAt: at + DEFAULT_LOCK_TTL_MS
  };
  await storeLock(renewed);

  return {
    status: "ok",
    tid: renewed.tid,
    uid: renewed.uid,
    token: renewed.token,
    expiresAt: renewed.expiresAt,
    ttlMs: DEFAULT_LOCK_TTL_MS
  };
}

async function releaseLock(tid, uid, token) {
  const parsedTid = toPositiveInt(tid);
  const parsedUid = toPositiveInt(uid);
  const lockToken = String(token || "");
  if (!parsedTid || !parsedUid || !lockToken) {
    return { status: "not-found" };
  }

  const at = now();
  const existing = await getStoredLock(parsedTid);
  if (!existing) {
    return { status: "ok", released: false };
  }
  if (isExpired(existing, at)) {
    await deleteLock(parsedTid);
    return { status: "ok", released: false };
  }
  if (existing.uid !== parsedUid || existing.token !== lockToken) {
    return {
      status: "locked",
      lock: await decorateLock(existing)
    };
  }

  await deleteLock(parsedTid);
  return { status: "ok", released: true };
}

async function assertSaveLock(tid, uid, token) {
  const parsedTid = toPositiveInt(tid);
  const parsedUid = toPositiveInt(uid);
  const lockToken = String(token || "");
  if (!parsedTid || !parsedUid) {
    return { status: "not-found" };
  }
  if (!lockToken) {
    return { status: "missing" };
  }

  const at = now();
  const existing = await getStoredLock(parsedTid);
  if (!existing) {
    return { status: "missing" };
  }
  if (isExpired(existing, at)) {
    await deleteLock(parsedTid);
    return { status: "expired" };
  }
  if (existing.uid !== parsedUid || existing.token !== lockToken) {
    return {
      status: "locked",
      lock: await decorateLock(existing)
    };
  }

  return { status: "ok" };
}

function getStatusMessage(result) {
  if (!result || result.status === "ok") {
    return "";
  }
  if (result.status === "locked") {
    const username = result.lock && result.lock.username ? result.lock.username : "another user";
    return `This wiki page is currently being edited by ${username}. Try again after their edit lock expires.`;
  }
  if (result.status === "expired") {
    return "Your wiki edit lock expired. Open the wiki editor again before saving.";
  }
  return "Open the wiki editor again before saving.";
}

function formatLockResponse(result, res) {
  if (result.status === "locked") {
    return helpers.formatApiResponse(409, res, {
      status: result.status,
      message: getStatusMessage(result),
      lock: result.lock
    });
  }
  if (result.status !== "ok") {
    const status = result.status === "not-found" ? 404 : 409;
    return helpers.formatApiResponse(status, res, new Error(getStatusMessage(result)));
  }
  return helpers.formatApiResponse(200, res, result);
}

// A lock is only meaningful for someone who can actually save the page. Gating
// acquisition here stops any logged-in user from parking locks on arbitrary tids
// and blocking real editors (assertSaveLock would then 409 their saves).
async function canManageEditLock(tid, uid) {
  const parsedTid = toPositiveInt(tid);
  const parsedUid = toPositiveInt(uid);
  if (!parsedTid || !parsedUid) {
    return false;
  }
  const topicData = await topics.getTopicFields(parsedTid, ["cid", "mainPid"]);
  const cid = toPositiveInt(topicData && topicData.cid);
  const mainPid = toPositiveInt(topicData && topicData.mainPid);
  if (!cid || !mainPid) {
    return false;
  }
  const settings = await config.getSettings();
  if (!Array.isArray(settings.effectiveCategoryIds) || !settings.effectiveCategoryIds.includes(cid)) {
    return false;
  }
  const canEdit = await privileges.posts.canEdit(mainPid, parsedUid);
  return !!(canEdit && canEdit.flag);
}

async function putEditLock(req, res) {
  const tid = (req.body && req.body.tid) || (req.query && req.query.tid);
  const token = (req.body && req.body.token) || (req.query && req.query.token);
  if (!await canManageEditLock(tid, req.uid)) {
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }
  const result = token ? await refreshLock(tid, req.uid, token) : await acquireLock(tid, req.uid);
  return formatLockResponse(result, res);
}

async function deleteEditLock(req, res) {
  const tid = (req.body && req.body.tid) || (req.query && req.query.tid);
  const token = (req.body && req.body.token) || (req.query && req.query.token);
  const result = await releaseLock(tid, req.uid, token);
  return formatLockResponse(result, res);
}

function setNowProvider(fn) {
  nowProvider = typeof fn === "function" ? fn : () => Date.now();
}

function setTokenProvider(fn) {
  tokenProvider = typeof fn === "function" ? fn : tokenProvider;
}

module.exports = {
  DEFAULT_LOCK_TTL_MS,
  acquireLock,
  assertSaveLock,
  deleteEditLock,
  formatLockResponse,
  getStatusMessage,
  putEditLock,
  refreshLock,
  releaseLock,
  setNowProvider,
  setTokenProvider
};
