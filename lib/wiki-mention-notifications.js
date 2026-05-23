"use strict";

const db = require.main.require("./src/database");
const notifications = require.main.require("./src/notifications");
const posts = require.main.require("./src/posts");
const privileges = require.main.require("./src/privileges");
const topics = require.main.require("./src/topics");
const user = require.main.require("./src/user");
const categories = require.main.require("./src/categories");

const config = require("./config");
const wikiCanonicalPathAdapter = require("./wiki-canonical-path-adapter");
const wikiUserMentions = require("./wiki-user-mentions");

const PLUGIN_MENTION_MARKER = "westgateWikiMentionNotification";

function toPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getPayloadPost(payload) {
  return (payload && (payload.post || payload.postData)) || payload || null;
}

function getActorUid(payload, post) {
  return toPositiveInt(
    (payload && (payload.uid || payload.editor || payload.editorUid)) ||
    (post && (post.editor || post.uid))
  ) || 0;
}

function escapeTranslationArg(value) {
  return String(value || "").replace(/%/g, "%%").replace(/,/g, "&#44;");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function hydratePostForContext(post) {
  const pid = toPositiveInt(post && post.pid);
  if (!pid) {
    return null;
  }

  if (post.tid && post.content != null) {
    return post;
  }

  const fields = ["pid", "tid", "uid", "content", "edited", "editor"];
  const row = typeof posts.getPostFields === "function" ?
    await posts.getPostFields(pid, fields) :
    null;

  return {
    ...(row || {}),
    ...(post || {}),
    pid
  };
}

async function getWikiMainPostContext(postLike) {
  const post = await hydratePostForContext(postLike);
  const pid = toPositiveInt(post && post.pid);
  const tid = toPositiveInt(post && post.tid);

  if (!pid || !tid) {
    return null;
  }

  const settings = await config.getSettings();
  if (!settings.isConfigured) {
    return null;
  }

  const topic = await topics.getTopicFields(tid, ["tid", "cid", "mainPid", "title", "slug", "deleted", "scheduled"]);
  const cid = toPositiveInt(topic && topic.cid);
  const mainPid = toPositiveInt(topic && topic.mainPid);

  if (!cid || !mainPid || mainPid !== pid || !settings.effectiveCategoryIds.includes(cid)) {
    return null;
  }

  const category = await categories.getCategoryData(cid);
  return {
    post,
    topic,
    pid,
    tid,
    cid,
    category
  };
}

async function getRecipientWikiPath(context, uid) {
  const pageInfo = await wikiCanonicalPathAdapter.getCanonicalPageInfo(context.topic, {
    category: context.category,
    uid
  });
  return pageInfo.wikiPath || "";
}

async function userCanReadTopic(tid, uid, topic) {
  const parsedUid = toPositiveInt(uid);
  if (!parsedUid) {
    return false;
  }

  const topicPrivileges = await privileges.topics.get(tid, parsedUid);
  return !!(
    topicPrivileges &&
    topicPrivileges["topics:read"] &&
    (!topic.deleted || topicPrivileges.view_deleted) &&
    (!topic.scheduled || topicPrivileges.view_scheduled)
  );
}

async function claimMentionNotification(pid, uid) {
  const field = String(uid);
  const legacyKey = `mentions:pid:${pid}:uids`;
  const key = `westgate-wiki:mention-notified:${pid}`;

  if (typeof db.isSetMember === "function" && await db.isSetMember(legacyKey, field)) {
    await db.incrObjectField(key, field);
    return false;
  }

  const count = parseInt(await db.incrObjectField(key, field), 10);
  return count === 1;
}

async function resolveMentionRecipients(content, context, actorUid) {
  const mentionedUsers = await wikiUserMentions.collectMentionUsers(content);
  const recipients = [];

  for (const userData of mentionedUsers) {
    const uid = toPositiveInt(userData && userData.uid);
    if (!uid || uid === actorUid) {
      continue;
    }
    if (!await userCanReadTopic(context.tid, uid, context.topic)) {
      continue;
    }
    if (!await getRecipientWikiPath(context, uid)) {
      continue;
    }
    recipients.push(uid);
  }

  return [...new Set(recipients)];
}

async function sendMentionNotification(context, actorUid, uid) {
  const wikiPath = await getRecipientWikiPath(context, uid);
  if (!wikiPath) {
    return;
  }
  const actor = actorUid > 0 && typeof user.getUserFields === "function" ?
    await user.getUserFields(actorUid, ["displayname", "username"]) :
    null;
  const actorName = escapeTranslationArg(escapeHtml((actor && (actor.displayname || actor.username)) || "Someone"));
  const titleEscaped = escapeTranslationArg(escapeHtml(context.topic.title || ""));
  const notification = await notifications.create({
    type: "mention",
    bodyShort: `[[notifications:user_mentioned_you_in, ${actorName}, ${titleEscaped}]]`,
    bodyLong: context.post.content || "",
    nid: `westgate-wiki:mention:${context.pid}:${uid}`,
    path: wikiPath,
    pid: context.pid,
    tid: context.tid,
    from: actorUid,
    importance: 6,
    [PLUGIN_MENTION_MARKER]: true
  });

  if (notification) {
    await notifications.push(notification, [uid]);
  }
}

async function handlePostSaveOrEdit(payload) {
  const post = getPayloadPost(payload);
  const context = await getWikiMainPostContext(post);
  if (!context || !String(context.post.content || "").includes("@")) {
    return payload;
  }

  const actorUid = getActorUid(payload, context.post);
  const recipients = await resolveMentionRecipients(context.post.content, context, actorUid);

  for (const uid of recipients) {
    if (await claimMentionNotification(context.pid, uid)) {
      await sendMentionNotification(context, actorUid, uid);
    }
  }

  return payload;
}

async function filterNotificationsCreate(payload) {
  const data = payload && payload.data;
  if (!data || data[PLUGIN_MENTION_MARKER] || data.type !== "mention") {
    return payload;
  }

  const pid = toPositiveInt(data.pid);
  if (!pid) {
    return payload;
  }

  const context = await getWikiMainPostContext({ pid });
  if (context) {
    payload.data = null;
  }

  return payload;
}

module.exports = {
  PLUGIN_MENTION_MARKER,
  claimMentionNotification,
  filterNotificationsCreate,
  getActorUid,
  getPayloadPost,
  getWikiMainPostContext,
  getRecipientWikiPath,
  handlePostSaveOrEdit,
  resolveMentionRecipients,
  sendMentionNotification,
  escapeHtml,
  escapeTranslationArg,
  toPositiveInt
};
