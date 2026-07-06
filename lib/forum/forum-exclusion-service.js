"use strict";

const db = require.main.require("./src/database");

const config = require("../core/config");

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

// Feed filters (unread badge, sorted tid lists) run on every authenticated
// page load; resolving each candidate tid's cid from the DB per request was
// the dominant plugin cost. Cache the full wiki tid membership set instead —
// it is rebuilt from the per-cid sorted sets at most once per TTL and patched
// live on wiki topic creation (addWikiTids) / cleared on moves and category
// changes (clearWikiTidCache).
const WIKI_TID_CACHE_TTL_MS = 5 * 60 * 1000;
let wikiTidCache = null; // { expiry, cidKey, promise: Promise<Set<string>> }

async function loadWikiTidSet(wikiCidSet) {
  const tidGroups = await Promise.all(
    [...wikiCidSet].map((cid) => db.getSortedSetRange(`cid:${cid}:tids:lastposttime`, 0, -1))
  );
  return new Set(tidGroups.flat().filter((tid) => tid !== undefined && tid !== null).map(String));
}

async function getWikiTidSet() {
  const wikiCidSet = await getWikiCidSet();
  if (!wikiCidSet.size) {
    return new Set();
  }

  const cidKey = [...wikiCidSet].sort((a, b) => a - b).join(",");
  const now = Date.now();
  if (!wikiTidCache || wikiTidCache.expiry <= now || wikiTidCache.cidKey !== cidKey) {
    const entry = {
      expiry: now + WIKI_TID_CACHE_TTL_MS,
      cidKey,
      promise: loadWikiTidSet(wikiCidSet)
    };
    entry.promise.catch(() => {
      if (wikiTidCache === entry) {
        wikiTidCache = null;
      }
    });
    wikiTidCache = entry;
  }
  return wikiTidCache.promise;
}

async function addWikiTids(tids) {
  if (!wikiTidCache || !Array.isArray(tids) || !tids.length) {
    return;
  }
  const set = await wikiTidCache.promise.catch(() => null);
  if (set) {
    tids.forEach((tid) => set.add(String(tid)));
  }
}

function clearWikiTidCache() {
  wikiTidCache = null;
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

  const wikiTids = await getWikiTidSet();
  if (!wikiTids.size) {
    return tids;
  }

  return tids.filter((tid) => !wikiTids.has(String(tid)));
}

async function getAllWikiTids() {
  const wikiCidSet = await getWikiCidSet();
  if (!wikiCidSet.size) {
    return [];
  }

  return [...await loadWikiTidSet(wikiCidSet)];
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

module.exports = {
  addWikiTids,
  clearWikiTidCache,
  getWikiTidSet,
  grantPidHydration,
  grantTidHydration,
  isPidHydrationGranted,
  isTidHydrationGranted,
  filterNonWikiTids,
  filterNonWikiTopics,
  filterNonWikiTopicsWithSet,
  getAllWikiTids,
  getWikiCidSet,
  isWikiCid,
  removeTidsFromRecentSet,
  removeWikiTopicsFromRecentSet,
  toWikiCidSet
};
