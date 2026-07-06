"use strict";

const helpers = require.main.require("./src/controllers/helpers");
const topics = require.main.require("./src/topics");

const config = require("../core/config");

const DISCUSSION_DISABLED_FIELD = "westgateWikiDiscussionDisabled";
const DISCUSSION_DISABLED_MESSAGE = "Discussion is disabled for this wiki article.";

function toPositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "1" || value === 1 || value === "on";
}

function isStoredDisabled(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

async function isWikiTopic(topicData) {
  const cid = toPositiveInt(topicData && topicData.cid);
  if (!cid) {
    return false;
  }

  const settings = await config.getSettings();
  return settings.effectiveCategoryIds.includes(cid);
}

async function getDiscussionDisabled(tid) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    return false;
  }

  const value = await topics.getTopicField(parsedTid, DISCUSSION_DISABLED_FIELD);
  return isStoredDisabled(value);
}

async function setDiscussionDisabled(tid, disabled) {
  const parsedTid = toPositiveInt(tid);
  if (!parsedTid) {
    throw new Error("[[error:invalid-data]]");
  }

  await topics.setTopicField(parsedTid, DISCUSSION_DISABLED_FIELD, disabled ? "1" : "0");
}

function applyReplyDisabledTemplateState(templateData) {
  if (!templateData) {
    return;
  }

  templateData.westgateWikiDiscussionDisabled = true;
  templateData.wikiDiscussionDisabled = true;
  templateData.locked = true;

  const privileges = templateData.privileges || (templateData.topic && templateData.topic.privileges);
  if (privileges) {
    privileges["topics:reply"] = false;
    privileges.reply = false;
  }

  if (templateData.topic) {
    templateData.topic.westgateWikiDiscussionDisabled = true;
    templateData.topic.wikiDiscussionDisabled = true;
    templateData.topic.locked = true;
  }
  if (templateData.topicData) {
    templateData.topicData.westgateWikiDiscussionDisabled = true;
    templateData.topicData.wikiDiscussionDisabled = true;
    templateData.topicData.locked = true;
  }
}

async function filterTopicReply(data) {
  const tid = toPositiveInt(data && data.tid);
  if (!tid) {
    return data;
  }

  const topicData = await topics.getTopicData(tid);
  if (!await isWikiTopic(topicData)) {
    return data;
  }

  if (await getDiscussionDisabled(tid)) {
    throw new Error(DISCUSSION_DISABLED_MESSAGE);
  }

  return data;
}

async function putDiscussionSettings(req, res) {
  const tid = toPositiveInt((req.body && req.body.tid) || (req.query && req.query.tid));
  if (!tid) {
    return helpers.formatApiResponse(400, res, new Error("[[error:invalid-data]]"));
  }

  const topicService = require("./topic-service");
  const wikiPage = await topicService.getWikiPage(tid, req.uid);
  if (wikiPage.status === "forbidden") {
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }
  if (wikiPage.status !== "ok") {
    return helpers.formatApiResponse(404, res, new Error("[[error:not-found]]"));
  }
  if (!wikiPage.canEditWikiPage) {
    return helpers.formatApiResponse(403, res, new Error("[[error:no-privileges]]"));
  }

  const disabled = normalizeBoolean(req.body && req.body.disabled);
  await setDiscussionDisabled(tid, disabled);

  return helpers.formatApiResponse(200, res, {
    tid,
    discussionDisabled: disabled
  });
}

module.exports = {
  DISCUSSION_DISABLED_FIELD,
  DISCUSSION_DISABLED_MESSAGE,
  applyReplyDisabledTemplateState,
  filterTopicReply,
  getDiscussionDisabled,
  isStoredDisabled,
  putDiscussionSettings,
  setDiscussionDisabled
};
