"use strict";

const serializer = require("./serializer");
const wikiSlug = require("./wiki-slug");

const CANONICAL_PATH_MIGRATION_VERSION = "canonical-title-category-tree-v1";
const GENERATED_PUBLIC_SLUG_FIELD = "westgateWikiPageSlug";
const TOPDATA_PAGE_MARKER_REGEX = /<!--\s*sow-topdata-wiki:page=[^\s>]+(?:\s+wiki_slug=([^\s>]+))?[\s\S]*?-->/i;
const RESERVED_FIRST_SEGMENTS = new Set([
  "category",
  "compose",
  "edit",
  "namespace",
  "search",
  "admin",
  "api"
]);

function asPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function byNumberField(field) {
  return (a, b) => asPositiveInt(a && a[field]) - asPositiveInt(b && b[field]);
}

function indexCategories(categories) {
  return new Map((Array.isArray(categories) ? categories : [])
    .map((category) => [asPositiveInt(category && category.cid), category])
    .filter(([cid, category]) => cid && category));
}

function normalizeSegment(source) {
  return wikiSlug.normalizeCanonicalSegment(source);
}

function buildCategoryChain(category, categoriesByCid) {
  const chain = [];
  const seen = new Set();
  let current = category;

  while (current) {
    const cid = asPositiveInt(current.cid);
    if (!cid || seen.has(cid)) {
      break;
    }
    seen.add(cid);
    chain.unshift(current);
    current = categoriesByCid.get(asPositiveInt(current.parentCid));
  }

  return chain;
}

function getSlugLeaf(slug) {
  const parts = String(slug || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function shouldOmitRouteRootSegment(category, index) {
  return index === 0 && getSlugLeaf(category && category.slug).toLowerCase() === "wiki";
}

function buildRouteRootRecords(namespaces) {
  const byCid = new Map();

  namespaces.forEach((namespace) => {
    const root = namespace.categoryChain && namespace.categoryChain[0];
    const rootCid = asPositiveInt(root && root.cid);
    if (!rootCid || getSlugLeaf(root && root.slug).toLowerCase() !== "wiki") {
      return;
    }

    const segment = normalizeSegment(root.name);
    byCid.set(rootCid, {
      cid: rootCid,
      name: root.name || "",
      legacyPath: "/wiki",
      canonicalPath: segment.canonical,
      foldedKey: segment.foldedKey,
      status: "legacy-slug-root-omission"
    });
  });

  return Array.from(byCid.values()).sort(byNumberField("cid"));
}

function buildNamespaceRecord(category, categoriesByCid) {
  const chain = buildCategoryChain(category, categoriesByCid);
  const segments = chain.map((entry) => normalizeSegment(entry.name));
  const routableSegments = segments.filter((segment, index) => !shouldOmitRouteRootSegment(chain[index], index));

  return {
    cid: asPositiveInt(category.cid),
    name: category.name || "",
    categoryChain: chain.map((entry) => ({
      cid: asPositiveInt(entry && entry.cid),
      name: entry && entry.name || "",
      slug: entry && entry.slug || ""
    })),
    canonicalPath: segments.map((segment) => segment.canonical).filter(Boolean).join("/"),
    foldedKey: segments.map((segment) => segment.foldedKey).filter(Boolean).join("/"),
    routableCanonicalPath: routableSegments.map((segment) => segment.canonical).filter(Boolean).join("/"),
    routableFoldedKey: routableSegments.map((segment) => segment.foldedKey).filter(Boolean).join("/"),
    invalidSegments: segments
      .map((segment, index) => ({
        cid: asPositiveInt(chain[index] && chain[index].cid),
        source: chain[index] && chain[index].name,
        error: segment.error
      }))
      .filter((row) => row.error)
  };
}

function getTopicContent(topic) {
  return String(
    (topic && topic.sourceContent) ||
    (topic && topic.content) ||
    (topic && topic.mainPost && (topic.mainPost.sourceContent || topic.mainPost.content)) ||
    ""
  );
}

function getRetiredGeneratedSlugFromMarker(content) {
  const match = String(content || "").match(TOPDATA_PAGE_MARKER_REGEX);
  return match && match[1] ? match[1] : "";
}

function buildPageRecord(topic, namespaceByCid) {
  const namespace = namespaceByCid.get(asPositiveInt(topic && topic.cid));
  const titleSegments = serializer.getTitlePath(topic && (topic.titleRaw || topic.title));
  const normalizedTitleSegments = titleSegments.map(normalizeSegment);
  const markerRetiredGeneratedSlug = getRetiredGeneratedSlugFromMarker(getTopicContent(topic));
  const storedRetiredGeneratedSlug = String(topic && topic.westgateWikiPageSlug || "").trim();
  const retiredGeneratedSlug = markerRetiredGeneratedSlug || storedRetiredGeneratedSlug;
  const canonicalTitlePath = normalizedTitleSegments.map((segment) => segment.canonical).filter(Boolean).join("/");
  const foldedTitlePath = normalizedTitleSegments.map((segment) => segment.foldedKey).filter(Boolean).join("/");
  const canonicalPath = [namespace && namespace.canonicalPath, canonicalTitlePath].filter(Boolean).join("/");
  const foldedKey = [namespace && namespace.foldedKey, foldedTitlePath].filter(Boolean).join("/");
  const routableCanonicalPath = [namespace && namespace.routableCanonicalPath, canonicalTitlePath].filter(Boolean).join("/");
  const routableFoldedKey = [namespace && namespace.routableFoldedKey, foldedTitlePath].filter(Boolean).join("/");

  return {
    tid: asPositiveInt(topic && topic.tid),
    cid: asPositiveInt(topic && topic.cid),
    title: topic && (topic.titleRaw || topic.title) || "",
    canonicalPath,
    foldedKey,
    routableCanonicalPath,
    routableFoldedKey,
    markerRetiredGeneratedSlug,
    storedRetiredGeneratedSlug,
    retiredGeneratedSlug,
    retiredGeneratedSlugSource: markerRetiredGeneratedSlug ? "marker" : (storedRetiredGeneratedSlug ? "topic-field" : ""),
    hasRetiredGeneratedSlug: !!retiredGeneratedSlug,
    invalidSegments: normalizedTitleSegments
      .map((segment, index) => ({
        tid: asPositiveInt(topic && topic.tid),
        source: titleSegments[index],
        error: segment.error
      }))
      .filter((row) => row.error)
  };
}

function groupBy(rows, key) {
  const groups = new Map();
  rows.forEach((row) => {
    const value = row && row[key];
    if (!value) {
      return;
    }
    const group = groups.get(value) || [];
    group.push(row);
    groups.set(value, group);
  });
  return groups;
}

function buildCollisionRows(rows, key, idField, outputKey) {
  return Array.from(groupBy(rows, key).entries())
    .filter(([, group]) => group.length > 1)
    .map(([value, group]) => ({
      [outputKey]: value,
      [idField === "tid" ? "tids" : "cids"]: group.map((row) => row[idField]).sort((a, b) => a - b)
    }))
    .sort((a, b) => String(a[outputKey]).localeCompare(String(b[outputKey])));
}

function buildCrossFacetCollisionRows(namespaces, pages, key, outputKey) {
  const namespacesByKey = groupBy(namespaces, key);
  const pagesByKey = groupBy(pages, key);

  return Array.from(namespacesByKey.entries())
    .filter(([value]) => pagesByKey.has(value))
    .map(([value, namespaceGroup]) => ({
      [outputKey]: value,
      cids: namespaceGroup.map((row) => row.cid).sort((a, b) => a - b),
      tids: pagesByKey.get(value).map((row) => row.tid).sort((a, b) => a - b)
    }))
    .sort((a, b) => String(a[outputKey]).localeCompare(String(b[outputKey])));
}

function getFirstCanonicalSegment(canonicalPath) {
  return String(canonicalPath || "").split("/").filter(Boolean)[0] || "";
}

function buildReservedRootRows(rows, idField) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const routableCanonicalPath = row && row.routableCanonicalPath || row && row.canonicalPath || "";
      const routableFoldedKey = row && row.routableFoldedKey || row && row.foldedKey || "";
      const reservedSegment = getFirstCanonicalSegment(routableCanonicalPath);
      if (!reservedSegment || !RESERVED_FIRST_SEGMENTS.has(reservedSegment.toLowerCase())) {
        return null;
      }
      const output = {
        [idField]: asPositiveInt(row && row[idField]),
        canonicalPath: row.canonicalPath,
        foldedKey: row.foldedKey,
        reservedSegment
      };
      if (routableCanonicalPath !== row.canonicalPath) {
        output.routableCanonicalPath = routableCanonicalPath;
        output.routableFoldedKey = routableFoldedKey;
      }
      return output;
    })
    .filter((row) => row && row[idField])
    .sort((a, b) => String(a.canonicalPath).localeCompare(String(b.canonicalPath)) || a[idField] - b[idField]);
}

function makeBlockingDetail(type, title, howToFix, rows) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  if (!normalizedRows.length) {
    return null;
  }
  return {
    type,
    title,
    count: normalizedRows.length,
    howToFix,
    rows: normalizedRows
  };
}

function buildBlockingDetails(report = {}) {
  const collisions = report.collisions || {};
  const reservedRoots = report.reservedRoots || {};
  return [
    makeBlockingDetail(
      "invalid-segment",
      "Invalid canonical path segments",
      "Rename the listed categories or topics so every path segment contains at least one canonical letter or number.",
      report.invalidSegments
    ),
    makeBlockingDetail(
      "reserved-namespace-root",
      "Reserved namespace route roots",
      "Rename the listed categories or move them below a route root so public wiki paths do not start with reserved segments such as search, edit, admin, api, category, compose, or namespace.",
      reservedRoots.namespaces
    ),
    makeBlockingDetail(
      "reserved-page-root",
      "Reserved page route roots",
      "Rename the listed topics or move them below a namespace so public wiki paths do not start with reserved segments such as search, edit, admin, api, category, compose, or namespace.",
      reservedRoots.pages
    ),
    makeBlockingDetail(
      "canonical-namespace-collision",
      "Canonical namespace path collisions",
      "Rename or move one of the listed categories so each namespace has a unique canonical wiki path.",
      collisions.canonicalNamespaces
    ),
    makeBlockingDetail(
      "folded-namespace-collision",
      "Folded namespace path collisions",
      "Rename or move one of the listed categories so namespace paths are unique when case, spacing, punctuation, and accents are ignored.",
      collisions.foldedNamespaces
    ),
    makeBlockingDetail(
      "canonical-page-collision",
      "Canonical page path collisions",
      "Rename or move one of the listed topics so each article has a unique canonical wiki path.",
      collisions.canonicalPages
    ),
    makeBlockingDetail(
      "folded-page-collision",
      "Folded page path collisions",
      "Rename one of the listed topics so their canonical wiki paths are unique when case, spacing, punctuation, and accents are ignored.",
      collisions.foldedPages
    ),
    makeBlockingDetail(
      "canonical-namespace-page-collision",
      "Canonical namespace/page path collisions",
      "Rename or move either the listed category or topic so a namespace and an article do not share the same canonical wiki path.",
      collisions.canonicalNamespacePages
    ),
    makeBlockingDetail(
      "folded-namespace-page-collision",
      "Folded namespace/page path collisions",
      "Rename or move either the listed category or topic so namespace and article paths are unique when case, spacing, punctuation, and accents are ignored.",
      collisions.foldedNamespacePages
    )
  ].filter(Boolean);
}

function getBlockingDetails(report = {}) {
  return Array.isArray(report.blockingDetails) ? report.blockingDetails : buildBlockingDetails(report);
}

function getBlockingSummaryText(report = {}) {
  return getBlockingDetails(report)
    .map((detail) => `${detail.title.charAt(0).toLowerCase()}${detail.title.slice(1)} (${detail.count})`)
    .join("; ");
}

function normalizeNamespaceMainPages(namespaceMainPages) {
  return Object.entries(namespaceMainPages || {})
    .map(([cid, tid]) => ({
      cid: asPositiveInt(cid),
      tid: asPositiveInt(tid)
    }))
    .filter((row) => row.cid && row.tid)
    .sort(byNumberField("cid"));
}

async function scan(input = {}) {
  const categories = (Array.isArray(input.categories) ? input.categories : []).filter(Boolean);
  const topics = (Array.isArray(input.topics) ? input.topics : []).filter(Boolean);
  const categoriesByCid = indexCategories(categories);
  const namespaces = categories
    .map((category) => buildNamespaceRecord(category, categoriesByCid))
    .sort((a, b) => a.canonicalPath.localeCompare(b.canonicalPath) || a.cid - b.cid);
  const namespaceByCid = new Map(namespaces.map((namespace) => [namespace.cid, namespace]));
  const pages = topics
    .filter((topic) => !parseInt(topic && topic.deleted, 10) && !parseInt(topic && topic.scheduled, 10))
    .map((topic) => buildPageRecord(topic, namespaceByCid))
    .sort((a, b) => a.canonicalPath.localeCompare(b.canonicalPath) || a.tid - b.tid);
  const legacyNamespaceMainPages = normalizeNamespaceMainPages(input.namespaceMainPages);
  const routeRoots = buildRouteRootRecords(namespaces);

  const invalidSegments = namespaces.flatMap((namespace) => namespace.invalidSegments)
    .concat(pages.flatMap((page) => page.invalidSegments));
  const collisions = {
    canonicalNamespaces: buildCollisionRows(namespaces, "canonicalPath", "cid", "canonicalPath"),
    foldedNamespaces: buildCollisionRows(namespaces, "foldedKey", "cid", "foldedKey"),
    canonicalPages: buildCollisionRows(pages, "canonicalPath", "tid", "canonicalPath"),
    foldedPages: buildCollisionRows(pages, "foldedKey", "tid", "foldedKey"),
    canonicalNamespacePages: buildCrossFacetCollisionRows(namespaces, pages, "canonicalPath", "canonicalPath"),
    foldedNamespacePages: buildCrossFacetCollisionRows(namespaces, pages, "foldedKey", "foldedKey")
  };
  const reservedRoots = {
    namespaces: buildReservedRootRows(namespaces, "cid"),
    pages: buildReservedRootRows(pages, "tid")
  };
  const blockingErrors = invalidSegments.length +
    reservedRoots.namespaces.length +
    reservedRoots.pages.length +
    collisions.canonicalNamespaces.length +
    collisions.foldedNamespaces.length +
    collisions.canonicalPages.length +
    collisions.foldedPages.length +
    collisions.canonicalNamespacePages.length +
    collisions.foldedNamespacePages.length;

  return {
    summary: {
      blockingErrors,
      legacyNamespaceMainPages: legacyNamespaceMainPages.length,
      retiredGeneratedSlugRows: pages.filter((page) => page.hasRetiredGeneratedSlug).length
    },
    namespaces,
    routeRoots,
    pages,
    legacyNamespaceMainPages,
    retiredGeneratedSlugRows: pages.filter((page) => page.hasRetiredGeneratedSlug),
    invalidSegments,
    reservedRoots,
    collisions,
    blockingDetails: buildBlockingDetails({
      invalidSegments,
      reservedRoots,
      collisions
    })
  };
}

async function prepare(input = {}) {
  return scan(input);
}

function hasBlockingCollisions(report) {
  return !!(report && report.summary && asPositiveInt(report.summary.blockingErrors));
}

function assertNoBlockingCollisions(report) {
  if (hasBlockingCollisions(report)) {
    const details = getBlockingSummaryText(report);
    throw new Error(`canonical wiki migration has ${asPositiveInt(report.summary.blockingErrors)} blocking issue(s)${details ? `: ${details}` : ""}`);
  }
}

function hasRuntimeInput(input) {
  return !!(input && (
    Object.prototype.hasOwnProperty.call(input, "categories") ||
    Object.prototype.hasOwnProperty.call(input, "topics") ||
    Object.prototype.hasOwnProperty.call(input, "namespaceMainPages")
  ));
}

async function getScanReport(input = {}) {
  if (input.scan) {
    return input.scan;
  }
  if (hasRuntimeInput(input)) {
    return scan(input);
  }
  return scan(await collectRuntimeInput());
}

function getStoredRetiredGeneratedSlugRows(report) {
  return (Array.isArray(report && report.retiredGeneratedSlugRows) ? report.retiredGeneratedSlugRows : [])
    .filter((row) => asPositiveInt(row && row.tid) && String(row && row.storedRetiredGeneratedSlug || "").trim());
}

function getLegacyNamespaceMainPageRows(report) {
  return (Array.isArray(report && report.legacyNamespaceMainPages) ? report.legacyNamespaceMainPages : [])
    .filter((row) => asPositiveInt(row && row.cid) && asPositiveInt(row && row.tid));
}

function buildExpectedPostApplyScan(report) {
  const nextRetiredRows = (Array.isArray(report && report.retiredGeneratedSlugRows) ? report.retiredGeneratedSlugRows : [])
    .map((row) => ({
      ...row,
      storedRetiredGeneratedSlug: "",
      retiredGeneratedSlug: row && row.markerRetiredGeneratedSlug || "",
      retiredGeneratedSlugSource: row && row.markerRetiredGeneratedSlug ? "marker" : "",
      hasRetiredGeneratedSlug: !!(row && row.markerRetiredGeneratedSlug)
    }))
    .filter((row) => row.hasRetiredGeneratedSlug);

  return {
    ...(report || {}),
    summary: {
      ...(report && report.summary || {}),
      legacyNamespaceMainPages: 0,
      retiredGeneratedSlugRows: nextRetiredRows.length
    },
    legacyNamespaceMainPages: [],
    retiredGeneratedSlugRows: nextRetiredRows
  };
}

function getRuntimeServices(customServices = {}) {
  return {
    clearTopicField: customServices.clearTopicField || (async (tid, field) => {
      const topics = require.main.require("./src/topics");
      if (!topics || typeof topics.setTopicField !== "function") {
        throw new Error("NodeBB topics.setTopicField API unavailable");
      }
      await topics.setTopicField(asPositiveInt(tid), field, "");
    }),
    clearNamespaceMainPage: customServices.clearNamespaceMainPage || (async (cid, tid) => {
      const wikiNamespaceMainPages = require("./wiki-namespace-main-pages");
      if (!wikiNamespaceMainPages || typeof wikiNamespaceMainPages.clearNamespaceMainPageIfCurrent !== "function") {
        throw new Error("wiki namespace main page clear service unavailable");
      }
      await wikiNamespaceMainPages.clearNamespaceMainPageIfCurrent(cid, tid);
    }),
    markMigrationVersion: customServices.markMigrationVersion || (async (version) => {
      const config = require("./config");
      if (!config || typeof config.setCanonicalPathMigrationVersion !== "function") {
        throw new Error("canonical path migration settings service unavailable");
      }
      await config.setCanonicalPathMigrationVersion(version);
    }),
    setRouteRootCid: customServices.setRouteRootCid || (async (cid) => {
      const config = require("./config");
      if (!config || typeof config.setRouteRootCidInSettings !== "function") {
        throw new Error("route root settings service unavailable");
      }
      await config.setRouteRootCidInSettings(cid);
    }),
    invalidateCanonicalCaches: customServices.invalidateCanonicalCaches || (async (reason) => {
      const wikiPaths = require("./wiki-paths");
      if (wikiPaths && typeof wikiPaths.invalidateWikiTreeIndex === "function") {
        wikiPaths.invalidateWikiTreeIndex({ reason });
      }
    })
  };
}

async function verify(input = {}) {
  const report = await getScanReport(input);
  const activeNamespaceMainPageOverrides = getLegacyNamespaceMainPageRows(report).length;
  const activeGeneratedPublicSlugRouting = getStoredRetiredGeneratedSlugRows(report).length;
  const blockingErrors = asPositiveInt(report && report.summary && report.summary.blockingErrors);
  const treeIndex = {
    status: blockingErrors ? "blocking" : "ok",
    blockingErrors
  };

  return {
    status: treeIndex.status === "ok" && activeNamespaceMainPageOverrides === 0 && activeGeneratedPublicSlugRouting === 0 ?
      "ok" :
      "needs-attention",
    migrationVersion: CANONICAL_PATH_MIGRATION_VERSION,
    treeIndex,
    activeNamespaceMainPageOverrides,
    activeGeneratedPublicSlugRouting,
    summary: {
      blockingErrors,
      legacyNamespaceMainPages: activeNamespaceMainPageOverrides,
      retiredGeneratedSlugRows: Array.isArray(report && report.retiredGeneratedSlugRows) ? report.retiredGeneratedSlugRows.length : 0
    }
  };
}

async function apply(input = {}) {
  const report = await getScanReport(input);
  assertNoBlockingCollisions(report);

  const services = getRuntimeServices(input.services || {});
  const retiredRows = getStoredRetiredGeneratedSlugRows(report);
  const legacyMainPageRows = getLegacyNamespaceMainPageRows(report);
  const routeRootRows = Array.isArray(report && report.routeRoots) ? report.routeRoots : [];
  const routeRootCid = routeRootRows.length === 1 ? asPositiveInt(routeRootRows[0] && routeRootRows[0].cid) : 0;

  for (const row of retiredRows) {
    await services.clearTopicField(asPositiveInt(row.tid), GENERATED_PUBLIC_SLUG_FIELD);
  }

  for (const row of legacyMainPageRows) {
    await services.clearNamespaceMainPage(asPositiveInt(row.cid), asPositiveInt(row.tid));
  }

  if (routeRootCid) {
    await services.setRouteRootCid(routeRootCid);
  }

  await services.markMigrationVersion(CANONICAL_PATH_MIGRATION_VERSION);
  await services.invalidateCanonicalCaches("canonical-path-migration-applied");

  const verifyReport = input.verifyScan ? input.verifyScan : (input.scan ? buildExpectedPostApplyScan(report) : await getScanReport({}));
  const verification = await verify({ scan: verifyReport });

  return {
    status: verification.status,
    migrationVersion: CANONICAL_PATH_MIGRATION_VERSION,
    activatedRouteRootCid: routeRootCid || null,
    clearedGeneratedPublicSlugFields: retiredRows.length,
    clearedNamespaceMainPageOverrides: legacyMainPageRows.length,
    verify: verification
  };
}

async function collectRuntimeInput() {
  const db = require.main.require("./src/database");
  const categories = require.main.require("./src/categories");
  const posts = require.main.require("./src/posts");
  const topics = require.main.require("./src/topics");
  const config = require("./config");
  const wikiNamespaceMainPages = require("./wiki-namespace-main-pages");
  const settings = await config.getSettings({ bustCache: true });
  const cids = settings.effectiveCategoryIds || [];
  const categoryRows = (await Promise.all(cids.map((cid) => categories.getCategoryData(cid)))).filter(Boolean);
  const tids = [...new Set((await Promise.all(
    cids.map((cid) => db.getSortedSetRange(`cid:${cid}:tids`, 0, -1))
  )).flat().map(asPositiveInt).filter(Boolean))];
  const topicRows = await topics.getTopicsFields(tids, [
    "tid", "cid", "title", "titleRaw", "slug", "mainPid", "deleted", "scheduled", "westgateWikiPageSlug"
  ]);

  const hydratedTopics = await Promise.all((topicRows || []).filter(Boolean).map(async (topic) => {
    const mainPid = asPositiveInt(topic.mainPid);
    const mainPost = mainPid && posts && typeof posts.getPostFields === "function" ?
      await posts.getPostFields(mainPid, ["content", "sourceContent"]) :
      null;
    return { ...topic, mainPost };
  }));

  return {
    categories: categoryRows,
    topics: hydratedTopics,
    settings,
    namespaceMainPages: await wikiNamespaceMainPages.getMainTopicIdMap()
  };
}

async function scanRuntime() {
  return scan(await collectRuntimeInput());
}

async function prepareRuntime() {
  return prepare(await collectRuntimeInput());
}

async function applyRuntime() {
  return apply();
}

async function verifyRuntime() {
  return verify();
}

module.exports = {
  CANONICAL_PATH_MIGRATION_VERSION,
  scan,
  prepare,
  apply,
  verify,
  scanRuntime,
  prepareRuntime,
  applyRuntime,
  verifyRuntime,
  collectRuntimeInput
};
