"use strict";

// Facade over the canonical wiki tree (wiki-tree-index) plus title/slug-leaf
// helpers. The former slug-based namespace index ("Engine B") was removed:
// all path derivation now goes through the name-based canonical tree, so link
// generation and routing can no longer disagree.

const categories = require.main.require("./src/categories");

const config = require("../core/config");
const wikiSlug = require("../core/wiki-slug");
const wikiTreeIndex = require("./wiki-tree-index");

const RESERVED_FIRST_SEGMENTS = wikiTreeIndex.RESERVED_FIRST_SEGMENTS;

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

function getTopicSlugLeaf(topic) {
  const title = String(topic && (topic.titleRaw || topic.title) || "").trim();
  return title ? normalizeTitleToSlugLeaf(title) : wikiSlug.getSlugLeaf(topic && topic.slug);
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

function normalizeTitleToSlugLeaf(title) {
  return wikiSlug.slugifyWikiText(title, "topic");
}

function normalizeCanonicalSegment(value) {
  return wikiSlug.normalizeCanonicalSegment(value);
}

function buildWikiPath(pathKey) {
  return pathKey ? `/wiki/${pathKey}` : "/wiki";
}

function categoryRef(category) {
  return {
    cid: asPositiveInt(category && category.cid),
    name: category && category.name,
    slug: category && category.slug
  };
}

// Both names delegate to the single invalidation owner; params kept for
// caller compatibility but ignored — there is only one invalidation behavior.
function invalidateWikiTreeIndex() {
  require("../core/wiki-cache-invalidation").invalidateAll();
}

function invalidateNamespaceIndexCache() {
  invalidateWikiTreeIndex();
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

function hasViewerUid(options) {
  return !!(options && options.uid !== undefined && options.uid !== null);
}

function withoutViewerUid(options = {}) {
  const unscoped = { ...options };
  delete unscoped.uid;
  return unscoped;
}

// Info-shaped variants (formerly wiki-canonical-path-adapter): same data as the
// path getters plus whether an empty result is privilege-hiding vs invalidity.
async function getCanonicalNamespaceInfo(category, options = {}) {
  if (!asPositiveInt(category && category.cid)) {
    return { valid: false, hiddenByPrivileges: false, canonicalPath: "", wikiPath: "" };
  }
  return wikiTreeIndex.getCanonicalNamespacePathInfo(category, options);
}

async function getCanonicalPageInfo(topic, options = {}) {
  const invalid = (hiddenByPrivileges) => ({ valid: false, hiddenByPrivileges, canonicalPath: "", wikiPath: "" });
  if (!asPositiveInt(topic && topic.tid) && !asPositiveInt(topic && topic.cid)) {
    return invalid(false);
  }
  if (options.namespaceInfo && !options.namespaceInfo.valid) {
    return invalid(!!options.namespaceInfo.hiddenByPrivileges);
  }

  const canonicalPath = await wikiTreeIndex.getCanonicalPagePath(topic, options);
  if (canonicalPath) {
    return {
      valid: true,
      hiddenByPrivileges: false,
      canonicalPath,
      wikiPath: buildWikiPath(canonicalPath)
    };
  }

  const hiddenByPrivileges = hasViewerUid(options) &&
    !!await wikiTreeIndex.getCanonicalPagePath(topic, withoutViewerUid(options));
  return invalid(hiddenByPrivileges);
}

async function getNamespaceEntry(categoryOrCid) {
  const settings = await config.getSettings();
  const cid = asPositiveInt(categoryOrCid && categoryOrCid.cid != null ? categoryOrCid.cid : categoryOrCid);

  if (!settings.isConfigured || !cid || !(settings.effectiveCategoryIds || []).includes(cid)) {
    return { status: "not-wiki" };
  }

  const category = categoryOrCid && categoryOrCid.cid != null ? categoryOrCid : await categories.getCategoryData(cid);
  if (!category) {
    return { status: "not-found" };
  }

  const info = await wikiTreeIndex.getCanonicalNamespacePathInfo(category, {});
  if (!info.valid) {
    return { status: "not-found" };
  }

  const diagnostics = await wikiTreeIndex.listNamespaceDiagnostics();
  const collides = diagnostics.collisions.some((collision) =>
    collision.namespaces.some((namespace) => namespace.cid === cid));
  if (collides) {
    return { status: "namespace-collision", path: info.wikiPath };
  }

  return {
    status: "ok",
    cid,
    category,
    path: info.wikiPath,
    segments: splitPath(info.canonicalPath)
  };
}

async function resolveRouteRootNamespace() {
  const settings = await config.getSettings();
  if (!settings.isConfigured) {
    return { status: "not-wiki" };
  }

  const routeRootCid = asPositiveInt(settings.routeRootCid);
  if (!routeRootCid || !(settings.effectiveCategoryIds || []).includes(routeRootCid)) {
    return { status: "namespace-not-found" };
  }

  const category = await categories.getCategoryData(routeRootCid);
  if (!category) {
    return { status: "namespace-not-found" };
  }

  return {
    status: "ok",
    cid: routeRootCid,
    category,
    path: "/wiki",
    segments: []
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

  const diagnostics = await wikiTreeIndex.listNamespaceDiagnostics();

  const namespaceCollisions = diagnostics.collisions.map((collision) => ({
    path: buildWikiPath(collision.namespaces[0].canonicalPath),
    categories: collision.namespaces.map((namespace) => categoryRef(namespace.category))
  }));

  const reservedNamespacePaths = diagnostics.reserved.map((namespace) => ({
    path: buildWikiPath(namespace.canonicalPath),
    reservedSegment: namespace.segments[0],
    category: categoryRef(namespace.category)
  }));

  return {
    namespaceCollisions,
    reservedNamespacePaths,
    hasSetupErrors: namespaceCollisions.length > 0 || reservedNamespacePaths.length > 0
  };
}

module.exports = {
  RESERVED_FIRST_SEGMENTS,
  splitPath,
  getTopicSlugLeaf,
  getTopicSlugLeafCounts,
  normalizeTitleToSlugLeaf,
  normalizeCanonicalSegment,
  resolveWikiNode,
  listWikiNodeChildren,
  getCanonicalPagePath,
  getCanonicalNamespacePath,
  getCanonicalNamespacePathInfo,
  getCanonicalNamespaceInfo,
  getCanonicalPageInfo,
  validateCanonicalPagePlacement,
  validateCanonicalNamespacePlacement,
  getNamespaceEntry,
  getNamespaceSetupDiagnostics,
  resolveRouteRootNamespace,
  invalidateNamespaceIndexCache,
  invalidateWikiTreeIndex
};
