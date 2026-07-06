"use strict";

const crypto = require("crypto");

const db = require.main.require("./src/database");
const helpers = require.main.require("./src/controllers/helpers");
const notifications = require.main.require("./src/notifications");
const privileges = require.main.require("./src/privileges");
const topics = require.main.require("./src/topics");
const user = require.main.require("./src/user");

const wikiMentionNotifications = require("./wiki-mention-notifications");

const ARTICLE_EDIT_NOTIFICATION_TYPE = "wiki-article-edit";

function watchSetKey(tid) {
  return `westgate-wiki:article-watch:${tid}:uids`;
}

function userWatchSetKey(uid) {
  return `uid:${uid}:westgate-wiki:article-watches`;
}

function editClaimKey(pid, editKey) {
  return `westgate-wiki:article-edit-notified:${pid}:${editKey}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toPositiveInt(value) {
  return wikiMentionNotifications.toPositiveInt(value);
}

async function getWikiArticleContextByTid(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    return null;
  }

  const topic = await topics.getTopicFields(parsedTid, ["tid", "mainPid"]);
  const mainPid = toPositiveInt(topic && topic.mainPid);
  return mainPid ? wikiMentionNotifications.getWikiMainPostContext({ pid: mainPid, tid: parsedTid }) : null;
}

async function userCanReadArticle(context, uid) {
  const parsedUid = toPositiveInt(uid);
  if (!context || !parsedUid) {
    return false;
  }

  const topicPrivileges = await privileges.topics.get(context.tid, parsedUid);
  return !!(
    topicPrivileges &&
    topicPrivileges["topics:read"] &&
    (!context.topic.deleted || topicPrivileges.view_deleted) &&
    (!context.topic.scheduled || topicPrivileges.view_scheduled)
  );
}

async function getWatchState(tid, uid) {
  const parsedUid = toPositiveInt(uid);
  const parsedTid = toPositiveInt(tid);
  if (!parsedUid || !parsedTid) {
    return {
      canWatchWikiArticle: false,
      wikiArticleWatched: false
    };
  }

  return {
    canWatchWikiArticle: true,
    wikiArticleWatched: !!(await db.isSetMember(watchSetKey(parsedTid), String(parsedUid)))
  };
}

async function setArticleWatch(tid, uid, watched) {
  const parsedUid = toPositiveInt(uid);
  const context = await getWikiArticleContextByTid(tid);
  if (!parsedUid || !context) {
    return { status: "not-found" };
  }
  if (!await userCanReadArticle(context, parsedUid)) {
    return { status: "forbidden" };
  }

  const articleKey = watchSetKey(context.tid);
  const userKey = userWatchSetKey(parsedUid);
  if (watched) {
    await Promise.all([
      db.setAdd(articleKey, String(parsedUid)),
      db.setAdd(userKey, String(context.tid))
    ]);
  } else {
    await Promise.all([
      db.setRemove(articleKey, String(parsedUid)),
      db.setRemove(userKey, String(context.tid))
    ]);
  }

  return {
    status: "ok",
    tid: context.tid,
    watched: !!watched
  };
}

async function putArticleWatch(req, res) {
  const tid = toPositiveInt((req.body && req.body.tid) || (req.query && req.query.tid));
  const result = await setArticleWatch(tid, req.uid, true);
  return formatWatchResponse(result, res);
}

async function deleteArticleWatch(req, res) {
  const tid = toPositiveInt((req.body && req.body.tid) || (req.query && req.query.tid));
  const result = await setArticleWatch(tid, req.uid, false);
  return formatWatchResponse(result, res);
}

function formatWatchResponse(result, res) {
  if (result.status === "forbidden") {
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }
  if (result.status !== "ok") {
    return helpers.formatApiResponse(404, res, new Error("[[error:not-found]]"));
  }

  return helpers.formatApiResponse(200, res, {
    tid: result.tid,
    watched: result.watched
  });
}

function getEditKey(context) {
  const edited = toPositiveInt(context && context.post && context.post.edited);
  if (edited) {
    return String(edited);
  }

  return crypto
    .createHash("sha1")
    .update(String(context && context.post && context.post.content || ""))
    .digest("hex")
    .slice(0, 16);
}

async function claimEditNotification(pid, editKey, uid) {
  const count = parseInt(await db.incrObjectField(editClaimKey(pid, editKey), String(uid)), 10);
  return count === 1;
}

async function getWatcherUids(context, actorUid) {
  const members = await db.getSetMembers(watchSetKey(context.tid));
  const seen = new Set();
  const uids = [];

  for (const member of members) {
    const uid = toPositiveInt(member);
    if (!uid || uid === actorUid || seen.has(uid)) {
      continue;
    }
    seen.add(uid);
    if (await userCanReadArticle(context, uid)) {
      if (!await wikiMentionNotifications.getRecipientWikiPath(context, uid)) {
        continue;
      }
      uids.push(uid);
    }
  }

  return uids;
}

async function sendArticleEditNotification(context, actorUid, uid, editKey) {
  const wikiPath = await wikiMentionNotifications.getRecipientWikiPath(context, uid);
  if (!wikiPath) {
    return;
  }
  const actor = actorUid > 0 && typeof user.getUserFields === "function" ?
    await user.getUserFields(actorUid, ["displayname", "username"]) :
    null;
  const actorName = escapeHtml((actor && (actor.displayname || actor.username)) || "Someone");
  const title = escapeHtml(context.topic.title || "a wiki article");
  const notification = await notifications.create({
    type: ARTICLE_EDIT_NOTIFICATION_TYPE,
    bodyShort: `<strong>${actorName}</strong> edited wiki article <strong>${title}</strong>`,
    bodyLong: `The wiki article "${title}" was modified.`,
    nid: `westgate-wiki:article-edit:${context.pid}:${editKey}:${uid}`,
    path: wikiPath,
    pid: context.pid,
    tid: context.tid,
    from: actorUid,
    importance: 5
  });

  if (notification) {
    await notifications.push(notification, [uid]);
  }
}

// Runs on the non-awaited action:post.edit hook; a rejection would surface as an
// unhandled rejection. Log and swallow — watch notifications are best-effort.
async function handlePostEdit(payload) {
  try {
    return await handlePostEditImpl(payload);
  } catch (err) {
    require.main.require("./src/winston").error(`[westgate-wiki] handlePostEdit failed: ${err && err.stack || err}`);
    return payload;
  }
}

async function handlePostEditImpl(payload) {
  const post = wikiMentionNotifications.getPayloadPost(payload);
  const context = await wikiMentionNotifications.getWikiMainPostContext(post);
  if (!context) {
    return payload;
  }

  const actorUid = wikiMentionNotifications.getActorUid(payload, context.post);
  const editKey = getEditKey(context);
  const watcherUids = await getWatcherUids(context, actorUid);

  for (const uid of watcherUids) {
    if (await claimEditNotification(context.pid, editKey, uid)) {
      await sendArticleEditNotification(context, actorUid, uid, editKey);
    }
  }

  return payload;
}

async function addUserNotificationTypes(payload) {
  if (!payload || !Array.isArray(payload.types)) {
    return payload;
  }

  if (!payload.types.includes(`notificationType_${ARTICLE_EDIT_NOTIFICATION_TYPE}`)) {
    payload.types.push(`notificationType_${ARTICLE_EDIT_NOTIFICATION_TYPE}`);
  }

  return payload;
}

module.exports = {
  ARTICLE_EDIT_NOTIFICATION_TYPE,
  addUserNotificationTypes,
  deleteArticleWatch,
  getEditKey,
  getWatchState,
  getWatcherUids,
  handlePostEdit,
  putArticleWatch,
  setArticleWatch,
  userCanReadArticle
};
