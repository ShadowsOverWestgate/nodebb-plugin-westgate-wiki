"use strict";

const posts = require.main.require("./src/posts");
const topics = require.main.require("./src/topics");

const forumExclusion = require("./forum-exclusion-service");
const wikiPaths = require("../tree/wiki-paths");
const wikiTombstones = require("../pages/wiki-tombstones");
const categories = require.main.require("./src/categories");
const config = require("../core/config");

async function resolveWikiPathForTopic(topic, uid) {
  const cid = parseInt(topic && topic.cid, 10);
  if (!Number.isInteger(cid) || cid <= 0) {
    return "";
  }
  const category = await categories.getCategoryData(cid);
  if (!category) {
    return "";
  }
  const settings = await config.getSettings();
  const namespaceInfo = await wikiPaths.getCanonicalNamespaceInfo(category, { settings, uid });
  const pageInfo = await wikiPaths.getCanonicalPageInfo(topic, { namespaceInfo, uid });
  return pageInfo.wikiPath || "";
}

async function filterSearchInContent(data) {
  if (!data || !Array.isArray(data.pids) || !data.pids.length) {
    return data;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (!wikiCidSet.size) {
    return data;
  }

  const postRows = await posts.getPostsFields(data.pids, ["pid", "tid"]);
  const postByPid = new Map(postRows.map((row) => [String(row && row.pid), row]));
  const tids = [...new Set(
    postRows.map((row) => row && row.tid).filter((tid) => tid !== undefined && tid !== null).map(String)
  )];
  const topicRows = tids.length ?
    await topics.getTopicsFields(tids, ["tid", "cid", "mainPid"].concat(wikiTombstones.TOMBSTONE_FIELDS)) :
    [];
  const topicByTid = new Map(topicRows.map((row) => [String(row && row.tid), row]));

  const keptPids = [];

  for (const pid of data.pids) {
    const post = postByPid.get(String(pid));
    const topic = post && topicByTid.get(String(post.tid));
    const cid = topic && parseInt(topic.cid, 10);
    const isWiki = Number.isInteger(cid) && wikiCidSet.has(cid);

    if (!isWiki) {
      keptPids.push(pid);
      continue;
    }

    if (wikiTombstones.isTombstonedTopic(topic)) {
      continue;
    }

    const isMainPost = topic && String(topic.mainPid) === String(pid);
    if (!isMainPost) {
      continue;
    }

    forumExclusion.grantPidHydration(pid);
    keptPids.push(pid);
  }

  data.pids = keptPids;
  return data;
}

async function filterSearchIndexTopics(data) {
  if (!data || !Array.isArray(data.data) || !Array.isArray(data.tids) || !data.tids.length) {
    return data;
  }

  const topicRows = await topics.getTopicsFields(data.tids, ["tid"].concat(wikiTombstones.TOMBSTONE_FIELDS));
  const tombstonedTids = new Set(
    topicRows
      .filter((topic) => wikiTombstones.isTombstonedTopic(topic))
      .map((topic) => String(topic.tid))
  );
  if (!tombstonedTids.size) {
    return data;
  }

  const keptData = [];
  const keptTids = [];
  data.tids.forEach((tid, index) => {
    if (tombstonedTids.has(String(tid))) {
      return;
    }
    keptData.push(data.data[index]);
    keptTids.push(tid);
  });
  data.data = keptData;
  data.tids = keptTids;
  return data;
}

async function filterSearchIndexPosts(data) {
  if (!data || !Array.isArray(data.data) || !Array.isArray(data.pids) || !data.pids.length) {
    return data;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (!wikiCidSet.size) {
    return data;
  }

  const postRows = await posts.getPostsFields(data.pids, ["pid", "tid"]);
  const tids = [...new Set(
    postRows.map((row) => row && row.tid).filter((tid) => tid !== undefined && tid !== null).map(String)
  )];
  const topicRows = tids.length ?
    await topics.getTopicsFields(tids, ["tid", "cid", "mainPid"].concat(wikiTombstones.TOMBSTONE_FIELDS)) :
    [];
  const topicByTid = new Map(topicRows.map((row) => [String(row && row.tid), row]));

  const keptData = [];
  const keptPids = [];

  data.pids.forEach((pid, index) => {
    const post = postRows[index];
    const topic = post && topicByTid.get(String(post.tid));
    const cid = topic && parseInt(topic.cid, 10);
    const isWiki = Number.isInteger(cid) && wikiCidSet.has(cid);

    if (isWiki && (wikiTombstones.isTombstonedTopic(topic) || String(topic.mainPid) !== String(pid))) {
      return;
    }

    keptData.push(data.data[index]);
    keptPids.push(pid);
  });

  data.data = keptData;
  data.pids = keptPids;
  return data;
}

async function filterSearchContentGetResult(data) {
  const resultPosts = data && data.result && Array.isArray(data.result.posts) ? data.result.posts : [];
  if (!resultPosts.length) {
    return data;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (!wikiCidSet.size) {
    return data;
  }

  const viewerUid = (data && data.data && data.data.uid) || (data && data.uid) || 0;

  const pids = resultPosts.map((post) => post && post.pid).filter((pid) => pid !== undefined && pid !== null);
  const postRows = await posts.getPostsFields(pids, ["pid", "tid"]);
  const tidByPid = new Map(postRows.map((row) => [String(row && row.pid), row && row.tid]));
  const tids = [...new Set(postRows.map((row) => row && row.tid).filter((tid) => tid !== undefined && tid !== null).map(String))];
  const topicRows = tids.length ?
    await topics.getTopicsFields(tids, ["tid", "cid", "mainPid"].concat(wikiTombstones.TOMBSTONE_FIELDS)) :
    [];
  const topicByTid = new Map(topicRows.map((row) => [String(row && row.tid), row]));

  await Promise.all(resultPosts.map(async (post) => {
    const topic = post && topicByTid.get(String(tidByPid.get(String(post.pid))));
    const cid = topic && parseInt(topic.cid, 10);
    if (!Number.isInteger(cid) || !wikiCidSet.has(cid)) {
      return;
    }
    if (wikiTombstones.isTombstonedTopic(topic)) {
      return;
    }
    const wikiPath = await resolveWikiPathForTopic(topic, viewerUid);
    if (wikiPath) {
      post.isWikiArticle = true;
      post.wikiPath = wikiPath;
    }
  }));
  return data;
}

module.exports = {
  filterSearchContentGetResult,
  filterSearchInContent,
  filterSearchIndexPosts,
  filterSearchIndexTopics
};
