"use strict";

const user = require.main.require("./src/user");
const privileges = require.main.require("./src/privileges");
const helpers = require.main.require("./src/controllers/helpers");

const config = require("../core/config");
const topicService = require("./topic-service");

/**
 * @returns {Promise<{ ok: true }|{ ok: false, code: string, status: number }>}
 */
async function assertCanSetWikiHomepage(tid, uid) {
  const settings = await config.getSettings();

  if (!settings.isConfigured) {
    return { ok: false, code: "not-configured", status: 400 };
  }

  const page = await topicService.getWikiPage(String(tid), uid);
  if (page.status === "not-found") {
    return { ok: false, code: "not-found", status: 404 };
  }
  if (page.status === "forbidden") {
    return { ok: false, code: "forbidden", status: 403 };
  }
  if (page.status !== "ok") {
    return { ok: false, code: "not-wiki", status: 400 };
  }

  const topic = page.topic;
  const cid = parseInt(topic.cid, 10);

  const [isAdmin, isGmod, isCatMod, isOwner] = await Promise.all([
    user.isAdministrator(uid),
    user.isGlobalModerator(uid),
    privileges.categories.isAdminOrMod(cid, uid),
    uid > 0 && parseInt(topic.uid, 10) === uid
  ]);

  const hasNoHome = !settings.homeTopicId;

  if (hasNoHome) {
    if (isAdmin || isGmod || isCatMod || isOwner) {
      return { ok: true };
    }
    return { ok: false, code: "forbidden", status: 403 };
  }

  if (isAdmin || isGmod || isCatMod) {
    return { ok: true };
  }

  return { ok: false, code: "forbidden", status: 403 };
}

async function putWikiHomepage(req, res) {
  const raw = (req.body && Object.prototype.hasOwnProperty.call(req.body, "tid"))
    ? req.body.tid
    : (req.query && req.query.tid);
  const tid = parseInt(raw, 10);

  if (!Number.isInteger(tid) || tid <= 0) {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  const check = await assertCanSetWikiHomepage(tid, req.uid);
  if (!check.ok) {
    if (check.code === "not-found") {
      return helpers.formatApiResponse(404, res, new Error("[[error:no-topic]]"));
    }
    if (check.code === "not-wiki" || check.code === "not-configured") {
      return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
    }
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }

  try {
    await config.setHomeTopicIdInSettings(tid);
  } catch (e) {
    return helpers.formatApiResponse(500, res, e);
  }

  return helpers.formatApiResponse(200, res, { tid });
}

module.exports = {
  assertCanSetWikiHomepage,
  putWikiHomepage
};
