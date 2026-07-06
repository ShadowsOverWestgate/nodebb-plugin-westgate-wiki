"use strict";

const posts = require.main.require("./src/posts");
const topics = require.main.require("./src/topics");

const config = require("./config");
const { getCategoriesTids } = require("./wiki-category-tids");

async function getWikiMainPostIds(settings) {
  const tids = [...new Set((await getCategoriesTids(settings.effectiveCategoryIds)).filter(Boolean))];

  if (!tids.length) {
    return [];
  }

  const topicData = await topics.getTopicsFields(tids, ["mainPid"]);
  return topicData
    .map((topic) => parseInt(topic && topic.mainPid, 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

async function clearWikiPostParseCache(payload) {
  const settings = await config.getSettings();
  const cid = parseInt(payload && payload.topic && payload.topic.cid, 10);

  if (!settings.effectiveCategoryIds.includes(cid)) {
    return payload;
  }

  const wikiDirectory = require("../tree/wiki-directory-service");
  wikiDirectory.invalidateNamespace(cid);

  const pids = await getWikiMainPostIds(settings);
  pids.forEach((pid) => posts.clearCachedPost(pid));

  // Forum posts may hold redlinks to the page just created; there is no index
  // of which posts link where, so drop the whole parsed-post cache. Wiki page
  // creation is rare and the cache repopulates lazily.
  // ponytail: full cache reset; replace with a redlink->pid index if it ever hurts.
  require.main.require("./src/posts/cache").reset();

  return payload;
}

async function clearWikiPostEditCache(data) {
  const post = data && data.post;
  if (!post || !post.pid) {
    return;
  }

  const settings = await config.getSettings();
  const tid = parseInt(post.tid, 10);
  if (!Number.isInteger(tid) || tid <= 0) {
    return;
  }

  const topicData = await topics.getTopicFields(tid, ["cid", "mainPid"]);
  const cid = parseInt(topicData.cid, 10);
  if (!settings.effectiveCategoryIds.includes(cid)) {
    return;
  }

  const wikiDirectory = require("../tree/wiki-directory-service");
  wikiDirectory.invalidateNamespace(cid);

  const mainPid = parseInt(topicData.mainPid, 10);
  if (Number.isInteger(mainPid) && mainPid > 0 && mainPid === parseInt(post.pid, 10)) {
    posts.clearCachedPost(mainPid);
  }
}

module.exports = {
  clearWikiPostParseCache,
  clearWikiPostEditCache,
  getWikiMainPostIds
};
