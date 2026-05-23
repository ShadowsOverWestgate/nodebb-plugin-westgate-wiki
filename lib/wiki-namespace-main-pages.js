"use strict";

const db = require.main.require("./src/database");
const helpers = require.main.require("./src/controllers/helpers");
const privileges = require.main.require("./src/privileges");
const topics = require.main.require("./src/topics");
const user = require.main.require("./src/user");

const config = require("./config");

const MAIN_PAGES_KEY = "westgate-wiki:namespaceMainTopicIds";

function asPositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function getMainTopicIdMap() {
  const raw = await db.getObject(MAIN_PAGES_KEY);
  return Object.entries(raw || {}).reduce((map, [cid, tid]) => {
    const parsedCid = asPositiveInt(cid);
    const parsedTid = asPositiveInt(tid);
    if (parsedCid && parsedTid) {
      map[String(parsedCid)] = parsedTid;
    }
    return map;
  }, {});
}

async function getMainTopicIdForCid(cid) {
  const parsedCid = asPositiveInt(cid);
  if (!parsedCid) {
    return null;
  }

  const tid = asPositiveInt(await db.getObjectField(MAIN_PAGES_KEY, String(parsedCid)));
  return tid || null;
}

async function canManageNamespaceMainPage(cid, uid) {
  const parsedCid = asPositiveInt(cid);
  if (!parsedCid || !uid) {
    return false;
  }

  const [isAdmin, isGmod, isCatMod] = await Promise.all([
    user.isAdministrator(uid),
    user.isGlobalModerator(uid),
    privileges.categories.isAdminOrMod(parsedCid, uid)
  ]);

  return !!(isAdmin || isGmod || isCatMod);
}

async function assertCanUpdateNamespaceMainPage(tid, uid) {
  const parsedTid = asPositiveInt(tid);
  if (!parsedTid) {
    return { ok: false, code: "invalid", status: 400 };
  }

  const [settings, topicData] = await Promise.all([
    config.getSettings(),
    topics.getTopicData(parsedTid)
  ]);

  if (!topicData) {
    return { ok: false, code: "not-found", status: 404 };
  }

  const cid = asPositiveInt(topicData.cid);
  if (!settings.effectiveCategoryIds.includes(cid)) {
    return { ok: false, code: "not-wiki", status: 400 };
  }

  const topicPrivileges = await privileges.topics.get(parsedTid, uid);
  if (
    !topicPrivileges["topics:read"] ||
    (topicData.deleted && !topicPrivileges.view_deleted) ||
    (topicData.scheduled && !topicPrivileges.view_scheduled)
  ) {
    return { ok: false, code: "forbidden", status: 403 };
  }

  if (!(await canManageNamespaceMainPage(cid, uid))) {
    return { ok: false, code: "forbidden", status: 403 };
  }

  return { ok: true, cid, tid: parsedTid };
}

async function setNamespaceMainPage(cid, tid) {
  const parsedCid = asPositiveInt(cid);
  const parsedTid = asPositiveInt(tid);
  if (!parsedCid || !parsedTid) {
    throw new Error("invalid-namespace-main-page");
  }

  await db.setObjectField(MAIN_PAGES_KEY, String(parsedCid), String(parsedTid));
}

async function clearNamespaceMainPageIfCurrent(cid, tid) {
  const parsedCid = asPositiveInt(cid);
  const parsedTid = asPositiveInt(tid);
  if (!parsedCid || !parsedTid) {
    throw new Error("invalid-namespace-main-page");
  }

  const currentTid = await getMainTopicIdForCid(parsedCid);
  if (currentTid === parsedTid) {
    await db.deleteObjectField(MAIN_PAGES_KEY, String(parsedCid));
  }
}

function normalizeActive(value) {
  return value === true || value === "true" || value === "1" || value === 1 || value === "on";
}

async function putNamespaceMainPage(req, res) {
  const rawTid = (req.body && Object.prototype.hasOwnProperty.call(req.body, "tid"))
    ? req.body.tid
    : (req.query && req.query.tid);
  const active = normalizeActive((req.body && Object.prototype.hasOwnProperty.call(req.body, "active"))
    ? req.body.active
    : (req.query && req.query.active));

  const check = await assertCanUpdateNamespaceMainPage(rawTid, req.uid);
  if (!check.ok) {
    if (check.code === "not-found") {
      return helpers.formatApiResponse(404, res, new Error("[[error:no-topic]]"));
    }
    if (check.code === "not-wiki" || check.code === "invalid") {
      return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
    }
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }

  try {
    if (active) {
      await setNamespaceMainPage(check.cid, check.tid);
    } else {
      await clearNamespaceMainPageIfCurrent(check.cid, check.tid);
    }
  } catch (e) {
    return helpers.formatApiResponse(500, res, e);
  }

  return helpers.formatApiResponse(200, res, {
    cid: check.cid,
    tid: active ? check.tid : null
  });
}

module.exports = {
  canManageNamespaceMainPage,
  clearNamespaceMainPageIfCurrent,
  getMainTopicIdForCid,
  getMainTopicIdMap,
  putNamespaceMainPage
};
