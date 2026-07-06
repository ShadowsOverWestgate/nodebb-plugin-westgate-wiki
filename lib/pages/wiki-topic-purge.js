"use strict";

const config = require("../core/config");

/**
 * Normal wiki page deletes go through the tombstone action path. Topic deletes
 * and purges can still happen outside that path, so these hooks keep wiki
 * directory and slug-collision caches fresh without escalating soft deletes
 * into hard purges.
 */
async function onTopicDelete({ topic }) {
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

  const wikiDirectory = require("../tree/wiki-directory-service");
  wikiDirectory.invalidateNamespace(cid);
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

  const wikiDirectory = require("../tree/wiki-directory-service");
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
