"use strict";

const db = require.main.require("./src/database");
const categories = require.main.require("./src/categories");
const privileges = require.main.require("./src/privileges");
const topics = require.main.require("./src/topics");
const utils = require.main.require("./src/utils");

const wikiTombstones = require("../pages/wiki-tombstones");
const { getCategoryTids } = require("../core/wiki-category-tids");

const TOPIC_SUMMARY_FIELDS = [
  "tid",
  "title",
  "titleRaw",
  "slug",
  "westgateWikiPageSlug",
  "postcount",
  "teaserPid",
  "cid",
  "deleted",
  "scheduled",
  "lastposttime",
  "timestamp",
  "updatetime",
  ...wikiTombstones.TOMBSTONE_FIELDS
];

const config = require("../core/config");
const { decodeCursor, encodeCursor } = require("./wiki-directory-cursor");
const serializer = require("../core/serializer");
const wikiPaths = require("./wiki-paths");

const FETCH_BATCH = 100;
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 80;
const HUB_PREVIEW_LIMIT = 8;
// Event-driven invalidation (invalidateNamespace on post/edit/move, full
// clear on category/settings changes) keeps these fresh; the TTL is a safety
// net. Rebuilds bulk-fetch every topic in a namespace, so keep it long.
const CACHE_TTL_MS = 5 * 60 * 1000;
const SUMMARY_CACHE_MAX_ENTRIES = 100;
const SLUG_SCAN_CACHE_MAX_ENTRIES = 100;

/** @type {Map<string, { expiry: number, summaries: object[] }>} */
const summaryCache = new Map();

/** @type {Map<string, { expiry: number, rows: object[] }>} */
const slugScanCache = new Map();

const cacheMetrics = {
  summaries: {
    hits: 0,
    misses: 0,
    inflightHits: 0,
    rebuilds: 0,
    invalidations: 0
  },
  slugScans: {
    hits: 0,
    misses: 0,
    rebuilds: 0,
    invalidations: 0
  }
};

/** Bumped when any wiki directory summary cache is busted so in-flight builds do not write stale rows. */
let wikiSummaryWriteEpoch = 0;

function bumpWikiSummaryWriteEpoch() {
  wikiSummaryWriteEpoch += 1;
}

/** One in-flight rebuild per cache key to avoid stampedes (Mongo session / load spikes). */
const summaryInflight = new Map();

function cacheKey(cid, uid) {
  return `${cid}:${uid}`;
}

function slugScanKey(cid) {
  return `slugscan:${cid}`;
}

function pruneCacheMap(cache, now) {
  let removed = 0;
  for (const [key, value] of cache.entries()) {
    if (!value || value.expiry <= now) {
      cache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

function enforceCacheLimit(cache, maxEntries) {
  let removed = 0;
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    cache.delete(oldestKey);
    removed += 1;
  }
  return removed;
}

function pruneExpiredCaches(now = Date.now()) {
  return pruneCacheMap(summaryCache, now) + pruneCacheMap(slugScanCache, now);
}

// Plain clear of THIS module's caches only. Called by wiki-cache-invalidation;
// never call other modules from here.
function clearDirectoryCaches() {
  bumpWikiSummaryWriteEpoch();
  cacheMetrics.summaries.invalidations += 1;
  cacheMetrics.slugScans.invalidations += 1;
  summaryCache.clear();
  slugScanCache.clear();
}

// Public entry points delegate to the single invalidation owner. The cid
// parameter is accepted for caller compatibility but per-cid scoping was
// removed: every invalidation clears all wiki caches together.
function invalidateNamespace() {
  require("../core/wiki-cache-invalidation").invalidateAll();
}

function invalidateAllWikiCaches() {
  require("../core/wiki-cache-invalidation").invalidateAll();
}

function getCacheMetrics() {
  return {
    summaries: { ...cacheMetrics.summaries, size: summaryCache.size, maxEntries: SUMMARY_CACHE_MAX_ENTRIES },
    slugScans: { ...cacheMetrics.slugScans, size: slugScanCache.size, maxEntries: SLUG_SCAN_CACHE_MAX_ENTRIES }
  };
}

function resetCacheMetrics() {
  Object.keys(cacheMetrics.summaries).forEach((key) => {
    cacheMetrics.summaries[key] = 0;
  });
  Object.keys(cacheMetrics.slugScans).forEach((key) => {
    cacheMetrics.slugScans[key] = 0;
  });
}

function clampLimit(value) {
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(n, MAX_LIMIT);
}

function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function letterBucket(sortKey) {
  const sk = String(sortKey || "").trim().toLowerCase();
  if (!sk.length) {
    return "#";
  }
  const ch = sk.charAt(0);
  if (ch >= "a" && ch <= "z") {
    return ch.toUpperCase();
  }
  return "#";
}

async function assertWikiCategoryReadable(cid, uid) {
  const parsedCid = parseInt(cid, 10);
  const settings = await config.getSettings();

  if (!utils.isNumber(cid) || !Number.isInteger(parsedCid) || parsedCid <= 0) {
    return { ok: false, status: "invalid", parsedCid: null, settings };
  }

  if (!settings.isConfigured || !settings.effectiveCategoryIds.includes(parsedCid)) {
    return { ok: false, status: "not-wiki", parsedCid, settings };
  }

  const catPriv = await privileges.categories.get(parsedCid, uid);
  if (!catPriv.read || !catPriv["topics:read"]) {
    return { ok: false, status: "forbidden", parsedCid, settings };
  }

  return { ok: true, status: "ok", parsedCid, settings };
}

async function getTopicSetCount(setKey, category) {
  if (typeof db.sortedSetCard === "function") {
    const count = parseInt(await db.sortedSetCard(setKey), 10);
    if (Number.isInteger(count) && count >= 0) {
      return count;
    }
  }

  return Math.max(0, parseInt(category && category.topic_count, 10) || 0);
}

async function getNamespaceTopicCount(cid, category) {
  const parsedCid = parseInt(cid, 10);
  if (!Number.isInteger(parsedCid) || parsedCid <= 0) {
    return 0;
  }
  return getTopicSetCount(`cid:${parsedCid}:tids`, category);
}

async function getVisibleNamespaceTopicCount(cid, uid) {
  const gate = await assertWikiCategoryReadable(cid, uid);
  if (!gate.ok) {
    return 0;
  }

  const summaries = await getOrderedSummaries(gate.parsedCid, uid, false);
  const directorySummaries = await filterChildNamespaceIndexSummaries(summaries, gate.parsedCid, uid, gate.settings);
  return directorySummaries.length;
}

/**
 * Loads topic rows the viewer may read, without Topics.getTopicsFromSet's heavy
 * per-topic hydration (teasers, users, bookmarks, etc.), which is expensive at
 * scale and can stress the Mongo driver when many requests rebuild in parallel.
 */
async function fetchVisibleTopicChunks(parsedCid, uid, category) {
  if (category.disabled) {
    return [];
  }

  const setKey = `cid:${parsedCid}:tids`;
  const topicCount = await getTopicSetCount(setKey, category);
  if (topicCount === 0) {
    return [];
  }

  const out = [];
  const seen = new Set();

  for (let start = 0; start < topicCount; start += FETCH_BATCH) {
    const stop = Math.min(start + FETCH_BATCH - 1, topicCount - 1);
    const tids = await db.getSortedSetRevRange(setKey, start, stop);
    if (!Array.isArray(tids) || !tids.length) {
      break;
    }

    const readableTids = await privileges.topics.filterTids("topics:read", tids, uid);
    if (!readableTids.length) {
      if (tids.length < FETCH_BATCH || stop >= topicCount - 1) {
        break;
      }
      continue;
    }

    const chunk = await topics.getTopicsFields(readableTids, TOPIC_SUMMARY_FIELDS);
    for (const t of chunk) {
      if (!t || t.tid == null || parseInt(t.deleted, 10) || parseInt(t.scheduled, 10) || wikiTombstones.isTombstonedTopic(t)) {
        continue;
      }
      const id = String(t.tid);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      out.push(t);
    }

    if (tids.length < FETCH_BATCH || stop >= topicCount - 1) {
      break;
    }
  }

  return out;
}

function sortSummaries(rows) {
  rows.sort((a, b) => {
    const cmp = compareTitleTreePath(a, b);
    if (cmp !== 0) {
      return cmp;
    }
    return parseInt(a.tid, 10) - parseInt(b.tid, 10);
  });

  return rows;
}

function canonicalWikiPath(canonicalPath) {
  return canonicalPath ? `/wiki/${canonicalPath}` : "";
}

function getTitleTreePath(row) {
  const path = Array.isArray(row && row.titlePath) ? row.titlePath : [];
  if (path.length) {
    return path.map((segment) => String(segment || "").trim().toLowerCase());
  }
  return [String(row && (row.titleLeaf || row.title) || "").trim().toLowerCase()];
}

function compareTitleTreePath(a, b) {
  const ap = getTitleTreePath(a);
  const bp = getTitleTreePath(b);
  const len = Math.min(ap.length, bp.length);
  for (let i = 0; i < len; i += 1) {
    const cmp = ap[i].localeCompare(bp[i], undefined, { numeric: true, sensitivity: "base" });
    if (cmp !== 0) {
      return cmp;
    }
  }
  return ap.length - bp.length;
}

async function attachCanonicalWikiPaths(rows, namespaceInfo) {
  return Promise.all((Array.isArray(rows) ? rows : []).map(async (row) => {
    const pageInfo = await wikiPaths.getCanonicalPageInfo(row, { namespaceInfo });
    const canonicalPath = pageInfo.canonicalPath || "";
    return {
      ...row,
      canonicalPath,
      wikiPath: pageInfo.wikiPath || canonicalWikiPath(canonicalPath),
      hasWikiPath: !!(pageInfo.wikiPath || canonicalWikiPath(canonicalPath))
    };
  }));
}

async function getDirectChildNamespaceCanonicalPaths(parsedCid, uid, settings) {
  if (!settings || !Array.isArray(settings.effectiveCategoryIds)) {
    return new Set();
  }

  const childGroups = await categories.getChildren([parsedCid], uid);
  const wikiChildren = (childGroups[0] || [])
    .filter(Boolean)
    .filter((child) => settings.effectiveCategoryIds.includes(parseInt(child.cid, 10)));

  if (!wikiChildren.length) {
    return new Set();
  }

  const fullRows = await Promise.all(wikiChildren.map((child) => categories.getCategoryData(child.cid)));
  const paths = new Set();

  await Promise.all(fullRows.filter(Boolean).map(async (child) => {
    const namespaceInfo = await wikiPaths.getCanonicalNamespaceInfo(child, { settings, uid });
    if (namespaceInfo && namespaceInfo.canonicalPath) {
      paths.add(namespaceInfo.canonicalPath);
    }
  }));

  return paths;
}

async function filterChildNamespaceIndexSummaries(summaries, parsedCid, uid, settings) {
  const childNamespacePaths = await getDirectChildNamespaceCanonicalPaths(parsedCid, uid, settings);
  if (!childNamespacePaths.size) {
    return summaries;
  }

  return (Array.isArray(summaries) ? summaries : []).filter((summary) => (
    !summary || !childNamespacePaths.has(summary.canonicalPath || "")
  ));
}

function serializeDirectorySummary(topic) {
  return {
    ...serializer.serializeTopicSummary(topic),
    cid: topic.cid,
    deleted: topic.deleted,
    scheduled: topic.scheduled,
    lastposttime: topic.lastposttime,
    timestamp: topic.timestamp,
    updatetime: topic.updatetime
  };
}

async function getOrderedSummaries(parsedCid, uid, bustCache) {
  const key = cacheKey(parsedCid, uid);
  const now = Date.now();
  pruneCacheMap(summaryCache, now);

  if (!bustCache) {
    const hit = summaryCache.get(key);
    if (hit && hit.expiry > now) {
      summaryCache.delete(key);
      summaryCache.set(key, hit);
      cacheMetrics.summaries.hits += 1;
      return hit.summaries;
    }
    const pending = summaryInflight.get(key);
    if (pending) {
      cacheMetrics.summaries.inflightHits += 1;
      return pending;
    }
  }

  cacheMetrics.summaries.misses += 1;
  const epochAtStart = wikiSummaryWriteEpoch;

  const promise = (async () => {
    const category = await categories.getCategoryData(parsedCid);
    if (!category) {
      return [];
    }

    const rawTopics = await fetchVisibleTopicChunks(parsedCid, uid, category);
    const rows = rawTopics.map(serializeDirectorySummary);
    const settings = await config.getSettings();
    const namespaceInfo = await wikiPaths.getCanonicalNamespaceInfo(category, { settings, uid });
    const withPaths = await attachCanonicalWikiPaths(rows, namespaceInfo);
    sortSummaries(withPaths);

    if (wikiSummaryWriteEpoch === epochAtStart) {
      summaryCache.set(key, { expiry: Date.now() + CACHE_TTL_MS, summaries: withPaths });
      enforceCacheLimit(summaryCache, SUMMARY_CACHE_MAX_ENTRIES);
    }

    cacheMetrics.summaries.rebuilds += 1;
    return withPaths;
  })();

  summaryInflight.set(key, promise);
  try {
    return await promise;
  } finally {
    if (summaryInflight.get(key) === promise) {
      summaryInflight.delete(key);
    }
  }
}

async function getAllCategoryTids(parsedCid) {
  return [...new Set(await getCategoryTids(parsedCid))];
}

async function fetchTopicRowsBatched(tids, fields) {
  const rows = [];
  for (let i = 0; i < tids.length; i += FETCH_BATCH) {
    const chunk = await topics.getTopicsFields(tids.slice(i, i + FETCH_BATCH), fields);
    // drop ghost rows: tids whose topic hash is gone can come back as
    // all-null objects instead of null on some drivers
    rows.push(...chunk.filter((topic) => topic && parseInt(topic.tid, 10) > 0));
  }
  return rows;
}

/**
 * All topics in category for slug collision checks (not privilege-filtered).
 * Batched; short TTL cache per cid.
 */
async function getAllTopicSlugRows(parsedCid) {
  const key = slugScanKey(parsedCid);
  const now = Date.now();
  pruneCacheMap(slugScanCache, now);
  const hit = slugScanCache.get(key);
  if (hit && hit.expiry > now) {
    slugScanCache.delete(key);
    slugScanCache.set(key, hit);
    cacheMetrics.slugScans.hits += 1;
    return hit.rows;
  }
  cacheMetrics.slugScans.misses += 1;

  const tids = await getAllCategoryTids(parsedCid);
  if (!tids.length) {
    slugScanCache.set(key, { expiry: now + CACHE_TTL_MS, rows: [] });
    enforceCacheLimit(slugScanCache, SLUG_SCAN_CACHE_MAX_ENTRIES);
    cacheMetrics.slugScans.rebuilds += 1;
    return [];
  }

  const rows = (await fetchTopicRowsBatched(tids, [
    "tid",
    "cid",
    "title",
    "titleRaw",
    "slug",
    "westgateWikiPageSlug",
    "deleted",
    "scheduled",
    ...wikiTombstones.TOMBSTONE_FIELDS
  ])).filter((topic) => !wikiTombstones.isTombstonedTopic(topic));

  slugScanCache.set(key, { expiry: now + CACHE_TTL_MS, rows });
  enforceCacheLimit(slugScanCache, SLUG_SCAN_CACHE_MAX_ENTRIES);
  cacheMetrics.slugScans.rebuilds += 1;
  return rows;
}

/**
 * Raw rows for the wiki manager view: every topic in the category's tids set,
 * including deleted, scheduled, and tombstoned topics. ponytail: uncached
 * because this diagnostic surface is low traffic.
 */
async function getRawTopicRows(parsedCid) {
  const tids = await getAllCategoryTids(parsedCid);
  if (!tids.length) {
    return [];
  }

  return fetchTopicRowsBatched(tids, [
    "tid",
    "cid",
    "uid",
    "mainPid",
    "title",
    "titleRaw",
    "slug",
    "westgateWikiPageSlug",
    "postcount",
    "timestamp",
    "deleted",
    "scheduled",
    ...wikiTombstones.TOMBSTONE_FIELDS
  ]);
}


async function resolveTopicByNormalizedTitleForViewer(parsedCid, uid, pageTitle) {
  const normalized = normalizeWikiLinkTitle(pageTitle);
  if (!normalized) {
    return null;
  }

  const summaries = await getOrderedSummaries(parsedCid, uid, false);
  return summaries.find((s) => normalizeWikiLinkTitle(s.titleRaw || s.title || "") === normalized) || null;
}

function normalizeWikiLinkTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function rowSortKey(row) {
  const path = Array.isArray(row && row.titlePath) ? row.titlePath : [];
  const segments = path.length ? path : [row && (row.titleLeaf || row.title)];
  return segments.map((segment) => String(segment || "").trim().toLowerCase()).filter(Boolean).join("\u0000");
}

function filterSummaries(summaries, { q, letter }) {
  let list = summaries;

  if (letter && letter !== "*") {
    const L = String(letter).trim().toUpperCase();
    if (L === "#" || L === "SYM") {
      list = list.filter((r) => letterBucket(rowSortKey(r)) === "#");
    } else if (/^[A-Z]$/.test(L)) {
      list = list.filter((r) => letterBucket(rowSortKey(r)) === L);
    }
  }

  if (q) {
    list = list.filter((r) => {
      const hay = `${rowSortKey(r)} ${normalizeQuery(r.title)}`;
      return hay.includes(q);
    });
  }

  return list;
}

function getPinnedHomeTopicId(settings, enabled) {
  const homeTid = parseInt(settings && settings.homeTopicId, 10);
  if (!enabled || !Number.isInteger(homeTid) || homeTid <= 0) {
    return null;
  }
  return homeTid;
}

function splitPinnedHomeTopic(rows, settings, enabled) {
  const homeTid = getPinnedHomeTopicId(settings, enabled);
  if (!homeTid || !Array.isArray(rows) || !rows.length) {
    return { homeTid, homeRow: null, bodyRows: rows };
  }

  const index = rows.findIndex((row) => parseInt(row && row.tid, 10) === homeTid);
  if (index < 0) {
    return { homeTid, homeRow: null, bodyRows: rows };
  }

  return {
    homeTid,
    homeRow: rows[index],
    bodyRows: rows.slice(0, index).concat(rows.slice(index + 1))
  };
}

function sliceWindow(list, { limit, after, aroundTid }) {
  const lim = clampLimit(limit);
  let startIdx = 0;

  if (after) {
    const cur = decodeCursor(after);
    if (cur) {
      const sk = cur.sortKey;
      const tid = cur.tid;
      const pos = list.findIndex((r) => {
        const rk = rowSortKey(r);
        if (rk > sk) {
          return true;
        }
        if (rk < sk) {
          return false;
        }
        return parseInt(r.tid, 10) > tid;
      });
      if (pos >= 0) {
        startIdx = pos;
      }
    }
  } else if (Number.isInteger(aroundTid) && aroundTid > 0) {
    const idx = list.findIndex((r) => parseInt(r.tid, 10) === aroundTid);
    if (idx >= 0) {
      const half = Math.floor(lim / 2);
      startIdx = Math.max(0, idx - half);
    }
  }

  const page = list.slice(startIdx, startIdx + lim);
  const last = page[page.length - 1];
  const nextCursor = page.length === lim && last ?
    encodeCursor(rowSortKey(last), last.tid) :
    "";

  return {
    pages: page,
    nextCursor,
    hasMore: !!nextCursor,
    windowStart: startIdx
  };
}

function sliceDirectoryWindow(list, settings, options, aroundTid) {
  const pinned = splitPinnedHomeTopic(list, settings, options.pinHomeTopic);
  if (!pinned.homeRow) {
    return sliceWindow(list, {
      limit: options.limit,
      after: options.after,
      aroundTid
    });
  }

  const limit = clampLimit(options.limit);
  if (options.after) {
    return sliceWindow(pinned.bodyRows, {
      limit,
      after: options.after,
      aroundTid
    });
  }

  const bodyLimit = limit - 1;
  if (bodyLimit <= 0) {
    return {
      pages: [pinned.homeRow],
      nextCursor: pinned.bodyRows.length ? encodeCursor("", pinned.homeTid) : "",
      hasMore: pinned.bodyRows.length > 0,
      windowStart: 0
    };
  }

  const bodySlice = sliceWindow(pinned.bodyRows, {
    limit: bodyLimit,
    after: null,
    aroundTid
  });
  return {
    ...bodySlice,
    pages: [pinned.homeRow].concat(bodySlice.pages)
  };
}

async function getDirectoryWindow(cid, uid, options = {}) {
  const gate = await assertWikiCategoryReadable(cid, uid);
  if (!gate.ok) {
    return { status: gate.status, parsedCid: gate.parsedCid };
  }

  let summaries = await getOrderedSummaries(gate.parsedCid, uid, false);

  // Self-heal: the window is centered on the topic the viewer is on. If that
  // tid is missing from the cached list (stale cache — e.g. the mutation was
  // handled by another process, where in-memory invalidation can't reach us),
  // serving it would render a sidebar that ignores the current page. Rebuild
  // once instead; the check is against the raw list because downstream
  // filters (child-namespace indexes, q/letter) legitimately drop the tid.
  const requestedAroundTid = parseInt(options.aroundTid, 10);
  if (
    Number.isInteger(requestedAroundTid) && requestedAroundTid > 0 && !options.after &&
    !summaries.some((row) => parseInt(row.tid, 10) === requestedAroundTid)
  ) {
    summaries = await getOrderedSummaries(gate.parsedCid, uid, true);
  }

  const directorySummaries = await filterChildNamespaceIndexSummaries(summaries, gate.parsedCid, uid, gate.settings);
  const filtered = filterSummaries(directorySummaries, {
    q: normalizeQuery(options.q),
    letter: options.letter
  });

  const aroundTid = requestedAroundTid;
  const slice = sliceDirectoryWindow(
    filtered,
    gate.settings,
    options,
    Number.isInteger(aroundTid) && aroundTid > 0 ? aroundTid : null
  );

  const cat = await categories.getCategoryData(gate.parsedCid);
  const namespaceInfo = cat ? await wikiPaths.getCanonicalNamespaceInfo(cat, { settings: gate.settings, uid }) : null;
  const nsPath = namespaceInfo && namespaceInfo.wikiPath ? namespaceInfo.wikiPath : "";

  return {
    status: "ok",
    cid: gate.parsedCid,
    namespacePath: nsPath,
    total: filtered.length,
    totalInNamespace: directorySummaries.length,
    ...slice
  };
}

async function getDirectoryListing(cid, uid, options = {}) {
  const gate = await assertWikiCategoryReadable(cid, uid);
  if (!gate.ok) {
    return { status: gate.status, parsedCid: gate.parsedCid };
  }

  const summaries = await getOrderedSummaries(gate.parsedCid, uid, false);
  const directorySummaries = await filterChildNamespaceIndexSummaries(summaries, gate.parsedCid, uid, gate.settings);
  const filtered = filterSummaries(directorySummaries, {
    q: normalizeQuery(options.q),
    letter: options.letter
  });
  const pinned = splitPinnedHomeTopic(filtered, gate.settings, options.pinHomeTopic);
  const pages = pinned.homeRow ? [pinned.homeRow].concat(pinned.bodyRows) : filtered;

  const cat = await categories.getCategoryData(gate.parsedCid);
  const namespaceInfo = cat ? await wikiPaths.getCanonicalNamespaceInfo(cat, { settings: gate.settings, uid }) : null;
  const nsPath = namespaceInfo && namespaceInfo.wikiPath ? namespaceInfo.wikiPath : "";

  return {
    status: "ok",
    cid: gate.parsedCid,
    namespacePath: nsPath,
    total: filtered.length,
    totalInNamespace: directorySummaries.length,
    pages,
    nextCursor: "",
    hasMore: false,
    windowStart: 0
  };
}

async function getHubPreviewTopics(cid, uid) {
  const gate = await assertWikiCategoryReadable(cid, uid);
  if (!gate.ok) {
    return [];
  }
  const summaries = await getOrderedSummaries(gate.parsedCid, uid, false);
  const directorySummaries = await filterChildNamespaceIndexSummaries(summaries, gate.parsedCid, uid, gate.settings);
  return directorySummaries.slice(0, HUB_PREVIEW_LIMIT);
}

async function findTopicsByNormalizedTitlePaths(parsedCid, uid, titlePathStrings) {
  if (!Array.isArray(titlePathStrings) || !titlePathStrings.length) {
    return new Map();
  }

  const summaries = await getOrderedSummaries(parsedCid, uid, false);
  const wanted = new Set(titlePathStrings.map((s) => s.toLowerCase()));
  const out = new Map();

  summaries.forEach((s) => {
    const pathKey = (s.titlePath || []).join("/").toLowerCase();
    if (wanted.has(pathKey)) {
      out.set(pathKey, s);
    }
  });

  return out;
}

module.exports = {
  assertWikiCategoryReadable,
  clearDirectoryCaches,
  CACHE_TTL_MS,
  cacheKey,
  decodeCursor,
  DEFAULT_LIMIT,
  encodeCursor,
  FETCH_BATCH,
  filterSummaries,
  findTopicsByNormalizedTitlePaths,
  getAllTopicSlugRows,
  getDirectoryListing,
  getDirectoryWindow,
  getHubPreviewTopics,
  getOrderedSummaries,
  getRawTopicRows,
  getCacheMetrics,
  HUB_PREVIEW_LIMIT,
  getNamespaceTopicCount,
  getVisibleNamespaceTopicCount,
  invalidateAllWikiCaches,
  invalidateNamespace,
  MAX_LIMIT,
  normalizeWikiLinkTitle,
  pruneExpiredCaches,
  resolveTopicByNormalizedTitleForViewer,
  rowSortKey,
  resetCacheMetrics,
  SLUG_SCAN_CACHE_MAX_ENTRIES,
  SUMMARY_CACHE_MAX_ENTRIES,
  sortSummaries
};
