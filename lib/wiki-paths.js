"use strict";

const categories = require.main.require("./src/categories");
const topics = require.main.require("./src/topics");

const config = require("./config");
const wikiSlug = require("./wiki-slug");
const wikiTreeIndex = require("./wiki-tree-index");

const NAMESPACE_INDEX_CACHE_TTL_MS = 30000;
const RESERVED_FIRST_SEGMENTS = new Set([
  "category",
  "compose",
  "edit",
  "namespace",
  "search",
  "admin",
  "api"
]);

let namespaceIndexCache = null;
const cacheMetrics = {
  namespaceIndex: {
    hits: 0,
    misses: 0,
    rebuilds: 0,
    invalidations: 0
  }
};

function asPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function splitPath(value) {
  return String(value || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getSlugLeaf(slug) {
  const parts = splitPath(slug);
  return parts.length ? parts[parts.length - 1] : "";
}

function getTopicSlugLeaf(topic) {
  const title = String(topic && (topic.titleRaw || topic.title) || "").trim();
  return title ? normalizeTitleToSlugLeaf(title) : getSlugLeaf(topic && topic.slug);
}

function isLiveTopicRow(topic) {
  return !!(topic && !parseInt(topic.deleted, 10) && !parseInt(topic.scheduled, 10));
}

function getTopicSlugLeafCounts(topicRows) {
  const counts = new Map();
  (Array.isArray(topicRows) ? topicRows : []).forEach((topic) => {
    if (!isLiveTopicRow(topic)) {
      return;
    }
    const leaf = getTopicSlugLeaf(topic);
    if (leaf) {
      counts.set(leaf, (counts.get(leaf) || 0) + 1);
    }
  });
  return counts;
}

function getTopicWikiPath(topic, namespacePath, slugLeafCounts) {
  const leaf = getTopicSlugLeaf(topic);
  if (!namespacePath || !leaf) {
    return getLegacyArticlePath(topic);
  }
  if (slugLeafCounts && slugLeafCounts.get(leaf) > 1) {
    return getLegacyArticlePath(topic);
  }
  return `${namespacePath}/${leaf}`;
}

function attachTopicWikiPaths(topicRows, namespacePath) {
  const counts = getTopicSlugLeafCounts(topicRows);
  return (Array.isArray(topicRows) ? topicRows : []).map((topic) => ({
    ...topic,
    wikiPath: getTopicWikiPath(topic, namespacePath, counts)
  }));
}

function normalizeTitleToSlugLeaf(title) {
  return wikiSlug.slugifyWikiText(title, "topic");
}

function normalizeCanonicalSegment(value) {
  return wikiSlug.normalizeCanonicalSegment(value);
}

function normalizeExplicitWikiSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return "";
  }
  return slug;
}

function decodeWikiSlugSource(value) {
  return wikiSlug.decodeHtmlEntities(value).trim();
}

function getCategorySlugSegment(category) {
  return getSlugLeaf(category && category.slug);
}

function getLegacyNamespacePath(category) {
  return category && category.slug ? `/wiki/category/${category.slug}` : "";
}

function getLegacyArticlePath(topic) {
  return topic && topic.slug ? `/wiki/${topic.slug}` : "";
}

function hasReservedFirstSegment(pathSegments) {
  return !!(pathSegments.length && RESERVED_FIRST_SEGMENTS.has(String(pathSegments[0]).toLowerCase()));
}

function getSettingsRouteRootCid(settings = {}) {
  return asPositiveInt(settings.routeRootCid);
}

function shouldOmitRouteRootSegment(category, index, settings) {
  return index === 0 && getSettingsRouteRootCid(settings) === asPositiveInt(category && category.cid);
}

function buildWikiPath(pathKey) {
  return pathKey ? `/wiki/${pathKey}` : "/wiki";
}

async function loadEffectiveCategories(settings) {
  const rows = await Promise.all(
    (settings.effectiveCategoryIds || []).map((cid) => categories.getCategoryData(cid))
  );
  return rows.filter(Boolean);
}

function indexCategories(categoryList) {
  const byCid = new Map();
  categoryList.forEach((category) => {
    const cid = asPositiveInt(category && category.cid);
    if (cid) {
      byCid.set(cid, category);
    }
  });
  return byCid;
}

function buildCategoryChain(category, categoryByCid, settings) {
  const chain = [];
  let current = category;

  while (current) {
    const cid = asPositiveInt(current.cid);
    if (!cid || !(settings.effectiveCategoryIds || []).includes(cid)) {
      break;
    }

    chain.unshift(current);
    const parentCid = asPositiveInt(current.parentCid);
    current = parentCid ? categoryByCid.get(parentCid) : null;
  }

  return chain;
}

function buildNamespaceSegments(category, categoryByCid, settings) {
  return buildCategoryChain(category, categoryByCid, settings)
    .filter((entry, index) => !shouldOmitRouteRootSegment(entry, index, settings))
    .map(getCategorySlugSegment)
    .filter(Boolean);
}

function buildNamespacePathFromCategoryMap(category, categoryByCid, settings) {
  const segments = buildNamespaceSegments(category, categoryByCid, settings);
  return buildWikiPath(segments.join("/"));
}

function buildNamespacePathFromCategoryList(category, categoryList, settings) {
  return buildNamespacePathFromCategoryMap(category, indexCategories(categoryList || []), settings);
}

function buildNamespaceIndex(categoryList, settings) {
  const categoryByCid = indexCategories(categoryList);
  const entries = [];
  const reservedEntries = [];
  const pathCounts = new Map();
  const byCid = new Map();
  const byPath = new Map();

  categoryList.forEach((category) => {
    const cid = asPositiveInt(category.cid);
    const segments = buildNamespaceSegments(category, categoryByCid, settings);
    const pathKey = segments.join("/");
    if (!cid) {
      return;
    }
    if (hasReservedFirstSegment(segments)) {
      reservedEntries.push({ cid, category, segments, pathKey, path: buildWikiPath(pathKey) });
      return;
    }
    const entry = { cid, category, segments, pathKey, path: buildWikiPath(pathKey) };
    entries.push(entry);
    byCid.set(cid, entry);
    const rows = byPath.get(pathKey) || [];
    rows.push(entry);
    byPath.set(pathKey, rows);
    pathCounts.set(pathKey, (pathCounts.get(pathKey) || 0) + 1);
  });

  return { entries, reservedEntries, pathCounts, byCid, byPath };
}

function groupEntriesByPath(entries) {
  const byPath = new Map();
  entries.forEach((entry) => {
    const rows = byPath.get(entry.pathKey) || [];
    rows.push(entry);
    byPath.set(entry.pathKey, rows);
  });
  return byPath;
}

function namespaceSettingsKey(settings) {
  return JSON.stringify({
    categoryIds: settings.categoryIds || [],
    effectiveCategoryIds: settings.effectiveCategoryIds || [],
    includeChildCategories: !!settings.includeChildCategories,
    routeRootCid: getSettingsRouteRootCid(settings)
  });
}

async function getCachedNamespaceIndex(settings) {
  const key = namespaceSettingsKey(settings || {});
  const now = Date.now();
  if (namespaceIndexCache && namespaceIndexCache.expiry > now && namespaceIndexCache.key === key) {
    cacheMetrics.namespaceIndex.hits += 1;
    return namespaceIndexCache;
  }

  cacheMetrics.namespaceIndex.misses += 1;
  const categoryList = await loadEffectiveCategories(settings);
  const index = buildNamespaceIndex(categoryList, settings);
  namespaceIndexCache = {
    key,
    expiry: now + NAMESPACE_INDEX_CACHE_TTL_MS,
    categoryList,
    index
  };
  cacheMetrics.namespaceIndex.rebuilds += 1;
  return namespaceIndexCache;
}

function invalidateNamespaceIndexCache(options = {}) {
  namespaceIndexCache = null;
  cacheMetrics.namespaceIndex.invalidations += 1;
  if (!options.skipTreeInvalidation && wikiTreeIndex && typeof wikiTreeIndex.invalidateWikiTreeIndex === "function") {
    wikiTreeIndex.invalidateWikiTreeIndex(options.reason || "namespace-index-invalidated");
  }
  if (!options.skipSettingsInvalidation && config && typeof config.invalidateSettingsCache === "function") {
    config.invalidateSettingsCache({ skipNamespaceInvalidation: true });
  }
}

function invalidateWikiTreeIndex(options = {}) {
  if (wikiTreeIndex && typeof wikiTreeIndex.invalidateWikiTreeIndex === "function") {
    wikiTreeIndex.invalidateWikiTreeIndex(options.reason || "wiki-tree-invalidated");
  }
  invalidateNamespaceIndexCache({
    reason: options.reason,
    skipSettingsInvalidation: true,
    skipTreeInvalidation: true
  });
  if (!options.skipSettingsInvalidation && config && typeof config.invalidateSettingsCache === "function") {
    config.invalidateSettingsCache({ skipNamespaceInvalidation: true });
  }
}

async function resolveWikiNode(requestPath, options = {}) {
  return wikiTreeIndex.resolveWikiNode(requestPath, options);
}

async function listWikiNodeChildren(nodeOrPath, options = {}) {
  return wikiTreeIndex.listWikiNodeChildren(nodeOrPath, options);
}

async function getCanonicalPagePath(topic, options = {}) {
  return wikiTreeIndex.getCanonicalPagePath(topic, options);
}

async function getCanonicalNamespacePath(category, options = {}) {
  return wikiTreeIndex.getCanonicalNamespacePath(category, options);
}

async function getCanonicalNamespacePathInfo(category, options = {}) {
  return wikiTreeIndex.getCanonicalNamespacePathInfo(category, options);
}

async function validateCanonicalPagePlacement(input = {}) {
  return wikiTreeIndex.validateCanonicalPagePlacement(input);
}

async function validateCanonicalNamespacePlacement(input = {}) {
  return wikiTreeIndex.validateCanonicalNamespacePlacement(input);
}

function getCacheMetrics() {
  return {
    namespaceIndex: { ...cacheMetrics.namespaceIndex },
    ...(wikiTreeIndex && typeof wikiTreeIndex.getCacheMetrics === "function" ? wikiTreeIndex.getCacheMetrics() : {})
  };
}

function resetCacheMetrics() {
  Object.keys(cacheMetrics.namespaceIndex).forEach((key) => {
    cacheMetrics.namespaceIndex[key] = 0;
  });
  if (wikiTreeIndex && typeof wikiTreeIndex.resetCacheMetrics === "function") {
    wikiTreeIndex.resetCacheMetrics();
  }
}

async function getNamespaceEntry(categoryOrCid) {
  const settings = await config.getSettings();
  const cid = asPositiveInt(categoryOrCid && categoryOrCid.cid != null ? categoryOrCid.cid : categoryOrCid);

  if (!settings.isConfigured || !cid || !(settings.effectiveCategoryIds || []).includes(cid)) {
    return { status: "not-wiki" };
  }

  const { index } = await getCachedNamespaceIndex(settings);
  const entry = index.byCid.get(cid);

  if (!entry) {
    return { status: "not-found" };
  }

  if (index.pathCounts.get(entry.pathKey) > 1) {
    return { status: "namespace-collision", path: buildWikiPath(entry.pathKey) };
  }

  return { status: "ok", ...entry };
}

async function getNamespacePath(categoryOrCid) {
  const result = await getNamespaceEntry(categoryOrCid);
  return result.status === "ok" ? result.path : "";
}

async function getArticlePath(topicOrTid) {
  const tid = asPositiveInt(topicOrTid && topicOrTid.tid != null ? topicOrTid.tid : topicOrTid);
  const topic = topicOrTid && topicOrTid.tid != null && topicOrTid.slug ? topicOrTid : (tid ? await topics.getTopicData(tid) : null);

  if (!topic || !topic.slug) {
    return "";
  }

  const namespacePath = await getNamespacePath(topic.cid);
  const leaf = getTopicSlugLeaf(topic);
  if (!namespacePath || !leaf) {
    return "";
  }

  const topicTid = asPositiveInt(topic.tid);
  if (topicTid && (await findPageSlugMatches(topic.cid, leaf, topicTid)).length) {
    return getLegacyArticlePath(topic);
  }

  return `${namespacePath}/${leaf}`;
}

async function resolveNamespacePath(pathOrSegments) {
  const pathSegments = Array.isArray(pathOrSegments) ? pathOrSegments : splitPath(pathOrSegments);
  if (!pathSegments.length) {
    return { status: "invalid" };
  }
  if (hasReservedFirstSegment(pathSegments)) {
    return { status: "reserved-path-segment" };
  }

  const settings = await config.getSettings();
  if (!settings.isConfigured) {
    return { status: "not-wiki" };
  }

  const { index } = await getCachedNamespaceIndex(settings);
  const pathKey = pathSegments.join("/");
  const matches = index.byPath.get(pathKey) || [];

  if (!matches.length) {
    return { status: "namespace-not-found" };
  }

  if (matches.length > 1 || index.pathCounts.get(pathKey) > 1) {
    return { status: "namespace-collision", path: buildWikiPath(pathKey) };
  }

  return {
    status: "ok",
    cid: matches[0].cid,
    category: matches[0].category,
    path: buildWikiPath(pathKey),
    segments: matches[0].segments
  };
}

async function resolveRouteRootNamespace() {
  const settings = await config.getSettings();
  if (!settings.isConfigured) {
    return { status: "not-wiki" };
  }
  const routeRootCid = getSettingsRouteRootCid(settings);
  if (!routeRootCid) {
    return { status: "namespace-not-found" };
  }

  const { index } = await getCachedNamespaceIndex(settings);
  const entry = index.byCid.get(routeRootCid);
  const matches = entry && entry.pathKey === "" ? [entry] : [];

  if (!matches.length) {
    return { status: "namespace-not-found" };
  }

  if (matches.length > 1 || index.pathCounts.get("") > 1) {
    return { status: "namespace-collision", path: "/wiki" };
  }

  return {
    status: "ok",
    cid: matches[0].cid,
    category: matches[0].category,
    path: "/wiki",
    segments: []
  };
}

async function resolveTopicBySlugLeaf(cid, pageSlug, viewerUid) {
  const wikiDirectory = require("./wiki-directory-service");
  const parsedCid = asPositiveInt(cid);
  if (!parsedCid || !pageSlug) {
    return { status: "page-not-found" };
  }
  return wikiDirectory.resolveTopicBySlugLeafForViewer(parsedCid, viewerUid || 0, pageSlug);
}

async function findPageSlugMatches(cid, pageSlug, omitTid) {
  const wikiDirectory = require("./wiki-directory-service");
  const parsedCid = asPositiveInt(cid);
  if (!parsedCid) {
    return [];
  }
  return wikiDirectory.findPageSlugMatchesForValidation(parsedCid, pageSlug, omitTid);
}

async function getPageSlugCollision(cid, pageSlug, omitTid) {
  const matches = await findPageSlugMatches(cid, pageSlug, omitTid);
  if (!matches.length) {
    return { status: "ok", topics: [] };
  }

  return { status: "page-collision", cid, pageSlug, topics: matches };
}

async function validatePageTitlePath(cid, title, options = {}) {
  const parsedCid = asPositiveInt(cid);
  const pageSlug = normalizeExplicitWikiSlug(options.pageSlug) || normalizeTitleToSlugLeaf(title);
  if (!parsedCid || !String(title || "").trim()) {
    return { status: "invalid" };
  }

  const namespace = await getNamespaceEntry(parsedCid);
  if (namespace.status !== "ok") {
    return namespace;
  }

  if (!namespace.segments.length && RESERVED_FIRST_SEGMENTS.has(pageSlug.toLowerCase())) {
    return { status: "reserved-path-segment", pageSlug, path: buildWikiPath(pageSlug) };
  }

  const namespacePageSegments = namespace.segments.concat(pageSlug);
  const namespaceCollision = namespacePageSegments.length ? await resolveNamespacePath(namespacePageSegments) : { status: "namespace-not-found" };
  if (namespaceCollision.status === "ok") {
    return {
      status: "namespace-page-collision",
      cid: parsedCid,
      pageSlug,
      path: namespaceCollision.path,
      category: namespaceCollision.category
    };
  }
  if (namespaceCollision.status === "namespace-collision") {
    return {
      status: "namespace-collision",
      cid: parsedCid,
      pageSlug,
      path: namespaceCollision.path
    };
  }

  const pageCollision = await getPageSlugCollision(parsedCid, pageSlug, options.omitTid);
  if (pageCollision.status !== "ok") {
    return {
      ...pageCollision,
      path: `${namespace.path}/${pageSlug}`
    };
  }

  return {
    status: "ok",
    cid: parsedCid,
    pageSlug,
    namespacePath: namespace.path,
    path: `${namespace.path}/${pageSlug}`
  };
}

async function resolveArticlePath(pathOrSegments, viewerUid) {
  const pathSegments = Array.isArray(pathOrSegments) ? pathOrSegments : splitPath(pathOrSegments);
  const uid = viewerUid == null ? 0 : viewerUid;
  if (!pathSegments.length) {
    return { status: "namespace-not-found" };
  }
  if (hasReservedFirstSegment(pathSegments)) {
    return { status: "reserved-path-segment" };
  }

  const namespaceSegments = pathSegments.length === 1 ? [] : pathSegments.slice(0, -1);
  const pageSlug = pathSegments[pathSegments.length - 1];
  const namespace = namespaceSegments.length ?
    await resolveNamespacePath(namespaceSegments) :
    await resolveRouteRootNamespace();

  if (namespace.status !== "ok") {
    return namespace;
  }

  const topicResult = await resolveTopicBySlugLeaf(namespace.cid, pageSlug, uid);
  if (topicResult.status !== "ok") {
    return {
      ...topicResult,
      cid: namespace.cid,
      category: namespace.category,
      namespacePath: namespace.path,
      pageSlug
    };
  }

  return {
    status: "ok",
    cid: namespace.cid,
    category: namespace.category,
    namespacePath: namespace.path,
    pageSlug,
    tid: topicResult.tid,
    topic: topicResult.topic,
    path: `${namespace.path}/${pageSlug}`
  };
}

async function getNamespaceSetupDiagnostics() {
  const settings = await config.getSettings();
  if (!settings.isConfigured) {
    return {
      namespaceCollisions: [],
      reservedNamespacePaths: [],
      hasSetupErrors: false
    };
  }

  const { index } = await getCachedNamespaceIndex(settings);
  const { entries, reservedEntries } = index;
  const byPath = groupEntriesByPath(entries);
  const namespaceCollisions = [];

  byPath.forEach((rows, pathKey) => {
    if (rows.length > 1) {
      namespaceCollisions.push({
        path: buildWikiPath(pathKey),
        categories: rows.map((row) => ({
          cid: row.cid,
          name: row.category.name,
          slug: row.category.slug
        }))
      });
    }
  });

  const reservedNamespacePaths = reservedEntries.map((entry) => ({
    path: buildWikiPath(entry.pathKey),
    reservedSegment: entry.segments[0],
    category: {
      cid: entry.cid,
      name: entry.category.name,
      slug: entry.category.slug
    }
  }));

  return {
    namespaceCollisions,
    reservedNamespacePaths,
    hasSetupErrors: namespaceCollisions.length > 0 || reservedNamespacePaths.length > 0
  };
}

module.exports = {
  NAMESPACE_INDEX_CACHE_TTL_MS,
  RESERVED_FIRST_SEGMENTS,
  attachTopicWikiPaths,
  buildNamespacePathFromCategoryList,
  buildNamespacePathFromCategoryMap,
  getArticlePath,
  getCategorySlugSegment,
  getLegacyArticlePath,
  getLegacyNamespacePath,
  getNamespaceEntry,
  getNamespacePath,
  getNamespaceSetupDiagnostics,
  getPageSlugCollision,
  getTopicSlugLeaf,
  getTopicSlugLeafCounts,
  getTopicWikiPath,
  resolveWikiNode,
  listWikiNodeChildren,
  getCanonicalPagePath,
  getCanonicalNamespacePath,
  getCanonicalNamespacePathInfo,
  validateCanonicalPagePlacement,
  validateCanonicalNamespacePlacement,
  normalizeCanonicalSegment,
  normalizeTitleToSlugLeaf,
  normalizeExplicitWikiSlug,
  resolveArticlePath,
  resolveNamespacePath,
  resolveRouteRootNamespace,
  validatePageTitlePath,
  splitPath,
  invalidateNamespaceIndexCache,
  invalidateWikiTreeIndex,
  getCacheMetrics,
  resetCacheMetrics
};
