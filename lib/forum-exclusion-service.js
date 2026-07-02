"use strict";

const db = require.main.require("./src/database");
const posts = require.main.require("./src/posts");
const topics = require.main.require("./src/topics");

const config = require("./config");

function toPositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toWikiCidSet(effectiveCategoryIds) {
  const s = new Set();
  (effectiveCategoryIds || []).forEach((cid) => {
    const n = toPositiveInt(cid);
    if (n) {
      s.add(n);
    }
  });
  return s;
}

async function getWikiCidSet() {
  const settings = await config.getSettings();
  return toWikiCidSet(settings.effectiveCategoryIds);
}

// Core create/edit paths hydrate the just-written wiki row through the same
// filter:topics.get / filter:post.getPostSummaryByPids hooks as forum feeds,
// with no caller context. Write-path hooks grant the row a short-lived pass so
// the feed filters keep it; everything else still gets stripped.
// ponytail: in-process TTL map; move to a shared cache if NodeBB ever runs clustered here.
const HYDRATION_GRANT_TTL_MS = 30 * 1000;
const grantedTidExpiry = new Map();
const grantedPidExpiry = new Map();

function grantHydration(map, id) {
  if (id === undefined || id === null || id === "") {
    return;
  }
  const now = Date.now();
  map.forEach((expiry, key) => {
    if (expiry <= now) {
      map.delete(key);
    }
  });
  map.set(String(id), now + HYDRATION_GRANT_TTL_MS);
}

function isHydrationGranted(map, id) {
  const expiry = map.get(String(id));
  return typeof expiry === "number" && expiry > Date.now();
}

function grantTidHydration(tid) {
  grantHydration(grantedTidExpiry, tid);
}

function grantPidHydration(pid) {
  grantHydration(grantedPidExpiry, pid);
}

function isTidHydrationGranted(tid) {
  return isHydrationGranted(grantedTidExpiry, tid);
}

function isPidHydrationGranted(pid) {
  return isHydrationGranted(grantedPidExpiry, pid);
}

async function isWikiCid(cid) {
  const n = toPositiveInt(cid);
  if (!n) {
    return false;
  }

  const wikiCidSet = await getWikiCidSet();
  return wikiCidSet.has(n);
}

function isTopicInWikiCidSet(topic, wikiCidSet) {
  const cid = topic && toPositiveInt(topic.cid);
  return !!(cid && wikiCidSet.has(cid));
}

function isObjectInWikiCidSet(row, wikiCidSet) {
  const cid = row && toPositiveInt(row.cid);
  return !!(cid && wikiCidSet.has(cid));
}

function filterNonWikiTopicsWithSet(topicData, wikiCidSet) {
  if (!wikiCidSet.size || !Array.isArray(topicData) || !topicData.length) {
    return Array.isArray(topicData) ? topicData : [];
  }

  return topicData.filter((topic) => topic && !isTopicInWikiCidSet(topic, wikiCidSet));
}

async function filterNonWikiTopics(topicData) {
  const wikiCidSet = await getWikiCidSet();
  return filterNonWikiTopicsWithSet(topicData, wikiCidSet);
}

async function filterNonWikiTids(tids) {
  if (!Array.isArray(tids) || !tids.length) {
    return [];
  }

  const wikiCidSet = await getWikiCidSet();
  if (!wikiCidSet.size) {
    return tids;
  }

  const topicRows = await topics.getTopicsFields(tids, ["tid", "cid"]);
  const wikiTids = new Set(
    topicRows
      .filter((topic) => isTopicInWikiCidSet(topic, wikiCidSet))
      .map((topic) => String(topic.tid))
  );

  if (!wikiTids.size) {
    return tids;
  }

  return tids.filter((tid) => !wikiTids.has(String(tid)));
}

async function filterNonWikiPids(pids) {
  if (!Array.isArray(pids) || !pids.length) {
    return [];
  }

  const wikiCidSet = await getWikiCidSet();
  if (!wikiCidSet.size) {
    return pids;
  }

  const postRows = await posts.getPostsFields(pids, ["pid", "tid"]);
  const tids = [...new Set(
    postRows
      .map((post) => post && post.tid)
      .filter((tid) => tid !== undefined && tid !== null)
      .map(String)
  )];

  if (!tids.length) {
    return pids;
  }

  const topicRows = await topics.getTopicsFields(tids, ["tid", "cid"]);
  const wikiTidSet = new Set(
    topicRows
      .filter((topic) => isTopicInWikiCidSet(topic, wikiCidSet))
      .map((topic) => String(topic.tid))
  );

  if (!wikiTidSet.size) {
    return pids;
  }

  const wikiPidSet = new Set(
    postRows
      .filter((post) => post && wikiTidSet.has(String(post.tid)))
      .map((post) => String(post.pid))
  );

  return pids.filter((pid) => !wikiPidSet.has(String(pid)));
}

async function getAllWikiTids() {
  const wikiCidSet = await getWikiCidSet();
  if (!wikiCidSet.size) {
    return [];
  }

  const tidGroups = await Promise.all(
    [...wikiCidSet].map((cid) => db.getSortedSetRange(`cid:${cid}:tids:lastposttime`, 0, -1))
  );

  return [...new Set(tidGroups.flat().filter((tid) => tid !== undefined && tid !== null).map(String))];
}

async function removeTidsFromRecentSet(tids) {
  if (!Array.isArray(tids) || !tids.length) {
    return;
  }

  await db.sortedSetRemove("topics:recent", tids);
}

async function removeWikiTopicsFromRecentSet() {
  const tids = await getAllWikiTids();
  await removeTidsFromRecentSet(tids);
}

function filterParallelArraysByTopics(payload, wikiCidSet) {
  const data = payload && Array.isArray(payload.data) ? payload.data : [];
  const ids = payload && (Array.isArray(payload.tids) ? payload.tids : payload.ids);
  const topicRows = payload && Array.isArray(payload.topics) ? payload.topics : [];

  if (!wikiCidSet.size || !data.length || !Array.isArray(ids) || !ids.length) {
    return payload;
  }

  const keptData = [];
  const keptIds = [];
  const keptTopics = [];

  data.forEach((row, index) => {
    const topic = topicRows[index];
    if (isTopicInWikiCidSet(topic, wikiCidSet) || isObjectInWikiCidSet(row, wikiCidSet)) {
      return;
    }
    keptData.push(row);
    keptIds.push(ids[index]);
    if (topicRows.length) {
      keptTopics.push(topic);
    }
  });

  payload.data = keptData;
  if (Array.isArray(payload.tids)) {
    payload.tids = keptIds;
  } else {
    payload.ids = keptIds;
  }
  if (topicRows.length) {
    payload.topics = keptTopics;
  }
  return payload;
}

function filterParallelArraysByPosts(payload, wikiCidSet) {
  const data = payload && Array.isArray(payload.data) ? payload.data : [];
  const pids = payload && Array.isArray(payload.pids) ? payload.pids : [];
  const postRows = payload && Array.isArray(payload.posts) ? payload.posts : [];

  if (!wikiCidSet.size || !data.length || !pids.length) {
    return payload;
  }

  const keptData = [];
  const keptPids = [];
  const keptPosts = [];

  data.forEach((row, index) => {
    const post = postRows[index];
    if (isObjectInWikiCidSet(post, wikiCidSet) || isObjectInWikiCidSet(row, wikiCidSet)) {
      return;
    }
    keptData.push(row);
    keptPids.push(pids[index]);
    if (postRows.length) {
      keptPosts.push(post);
    }
  });

  payload.data = keptData;
  payload.pids = keptPids;
  if (postRows.length) {
    payload.posts = keptPosts;
  }
  return payload;
}

module.exports = {
  grantPidHydration,
  grantTidHydration,
  isPidHydrationGranted,
  isTidHydrationGranted,
  filterNonWikiPids,
  filterNonWikiTids,
  filterNonWikiTopics,
  filterNonWikiTopicsWithSet,
  filterParallelArraysByPosts,
  filterParallelArraysByTopics,
  getAllWikiTids,
  getWikiCidSet,
  isWikiCid,
  removeTidsFromRecentSet,
  removeWikiTopicsFromRecentSet,
  toWikiCidSet
};
