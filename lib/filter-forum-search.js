"use strict";

const posts = require.main.require("./src/posts");
const topics = require.main.require("./src/topics");

const forumExclusion = require("./forum-exclusion-service");
const wikiCanonicalPathAdapter = require("./wiki-canonical-path-adapter");
const wikiTombstones = require("./wiki-tombstones");
const categories = require.main.require("./src/categories");
const config = require("./config");

// 30s TTL, same pattern as forumExclusion's hydration grants: `filter:search.inContent`
// resolves a wiki article's wikiPath once, `filter:search.contentGetResult` (fired a few
// lines later in the same request, see src/search.js) reads it back to tag the result.
const SEARCH_RESULT_TAG_TTL_MS = 30 * 1000;
const wikiSearchResultTags = new Map();

function rememberWikiSearchResult(pid, topic, uid) {
  const now = Date.now();
  wikiSearchResultTags.forEach((entry, key) => {
    if (entry.expiry <= now) {
      wikiSearchResultTags.delete(key);
    }
  });
  wikiSearchResultTags.set(String(pid), { topic, uid, expiry: now + SEARCH_RESULT_TAG_TTL_MS });
}

function recallWikiSearchResult(pid) {
  const entry = wikiSearchResultTags.get(String(pid));
  if (!entry || entry.expiry <= Date.now()) {
    return null;
  }
  return entry;
}

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
  const namespaceInfo = await wikiCanonicalPathAdapter.getCanonicalNamespaceInfo(category, { settings, uid });
  const pageInfo = await wikiCanonicalPathAdapter.getCanonicalPageInfo(topic, { namespaceInfo, uid });
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

  const searcherUid = (data.data && data.data.uid) || 0;
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
    rememberWikiSearchResult(pid, topic, searcherUid);
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
  const payloadUid = (data && data.data && data.data.uid) || (data && data.uid);
  await Promise.all(resultPosts.map(async (post) => {
    const tag = post && recallWikiSearchResult(post.pid);
    if (!tag || !tag.topic) {
      return;
    }
    const wikiPath = await resolveWikiPathForTopic(tag.topic, payloadUid || tag.uid || 0);
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
