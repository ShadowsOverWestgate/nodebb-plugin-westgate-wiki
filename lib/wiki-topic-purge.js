"use strict";

const topics = require.main.require("./src/topics");

const config = require("./config");

/**
 * When a topic is deleted in the forum UI, NodeBB soft-deletes it first, then
 * fires action:topic.delete. For configured wiki namespaces we immediately
 * purge the topic and posts so the page is fully removed (not recoverable via
 * "restore" in the usual soft-delete flow).
 */
async function onTopicDelete({ topic, uid }) {
  if (!topic || !topic.tid) {
    return;
  }

  const settings = await config.getSettings();
  if (settings.homeTopicId && parseInt(topic.tid, 10) === settings.homeTopicId) {
    return;
  }

  if (!settings.isConfigured) {
    return;
  }

  const cid = parseInt(topic.cid, 10);
  if (!Number.isInteger(cid) || !settings.effectiveCategoryIds.includes(cid)) {
    return;
  }

  const wikiDirectory = require("./wiki-directory-service");
  wikiDirectory.invalidateNamespace(cid);

  await topics.purgePostsAndTopic([topic.tid], uid);
}

async function onTopicsPurge(data = {}) {
  const purgedTopics = Array.isArray(data.topics) ? data.topics : [];
  if (!purgedTopics.length) {
    return;
  }

  const settings = await config.getSettings();
  if (!settings.isConfigured) {
    return;
  }

  const wikiDirectory = require("./wiki-directory-service");
  const invalidatedCids = new Set();
  for (const topic of purgedTopics) {
    const tid = parseInt(topic && topic.tid, 10);
    if (settings.homeTopicId && tid === parseInt(settings.homeTopicId, 10)) {
      continue;
    }

    const cid = parseInt(topic && topic.cid, 10);
    if (Number.isInteger(cid) && settings.effectiveCategoryIds.includes(cid)) {
      invalidatedCids.add(cid);
    }
  }

  invalidatedCids.forEach((cid) => {
    wikiDirectory.invalidateNamespace(cid);
  });
}

module.exports = {
  onTopicDelete,
  onTopicsPurge
};
