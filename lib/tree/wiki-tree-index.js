"use strict";

const serializer = require("../core/serializer");
const wikiTombstones = require("../pages/wiki-tombstones");
const wikiSlug = require("../core/wiki-slug");
const wikiShapes = require("../core/wiki-shapes");

// Invalidation is event-driven (topic move/delete, category and settings
// changes all clear this cache); the TTL is only a safety net, so keep it
// long — each rebuild bulk-fetches every wiki topic row.
const TREE_INDEX_CACHE_TTL_MS = 5 * 60 * 1000;
// single source of truth for reserved /wiki/* route roots; wiki-paths,
// wiki-path-migration, and wiki-archive-manifest all import this set
const RESERVED_FIRST_SEGMENTS = new Set([
  "category",
  "compose",
  "edit",
  "manage",
  "namespace",
  "search",
  "admin",
  "api"
]);

let runtimeTreeCache = null;
// Bumped on every invalidation so an in-flight rebuild that started before the
// invalidation cannot write its (now stale) tree into the cache.
let runtimeTreeEpoch = 0;
const cacheMetrics = {
  hits: 0,
  misses: 0,
  rebuilds: 0,
  invalidations: 0
};

function asPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function hasViewerUid(options) {
  return options && Object.prototype.hasOwnProperty.call(options, "uid") && options.uid !== undefined && options.uid !== null;
}

function comparePathRows(a, b) {
  const left = String(a && a.canonicalPath || "");
  const right = String(b && b.canonicalPath || "");
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function encodeWikiPath(canonicalPath) {
  return canonicalPath ? `/wiki/${canonicalPath}` : "/wiki";
}

function visibleInfo(canonicalPath) {
  return {
    valid: true,
    hiddenByPrivileges: false,
    canonicalPath,
    wikiPath: encodeWikiPath(canonicalPath)
  };
}

function buildRouteRootAncestor(state) {
  const routeRoot = state.routeRootCid ? state.categoriesByCid.get(state.routeRootCid) : null;
  if (!routeRoot) {
    return [];
  }
  return [{
    canonicalPath: "",
    segment: String(routeRoot.name || "").trim() || "Wiki",
    wikiPath: "/wiki"
  }];
}

function getNodeDisplayTitle(node) {
  if (!node) {
    return "";
  }

  if (node.pageFacets.length === 1) {
    const titleSegments = Array.isArray(node.pageFacets[0].titleSegments) ? node.pageFacets[0].titleSegments : [];
    if (titleSegments.length) {
      return titleSegments[titleSegments.length - 1];
    }
  }

  if (node.namespaceFacets.length === 1) {
    return String(node.namespaceFacets[0].category && node.namespaceFacets[0].category.name || "").trim();
  }

  return "";
}

function buildNodeAncestors(state, node) {
  const canonicalAncestors = node.segments.slice(0, -1).map((segment, index) => {
    const canonicalPath = node.segments.slice(0, index + 1).join("/");
    const ancestorNode = state.nodes.get(canonicalPath);
    // titleRaw/category-name derived; escaped here because the breadcrumb view
    // interpolates ancestor.displayTitle raw (Benchpress does not escape {value}).
    const displayTitle = serializer.escapeTitleHTML(getNodeDisplayTitle(ancestorNode));
    return {
      canonicalPath,
      segment,
      ...(displayTitle ? { displayTitle } : {}),
      wikiPath: encodeWikiPath(canonicalPath)
    };
  });
  return buildRouteRootAncestor(state).concat(canonicalAncestors);
}

function invalidInfo(hiddenByPrivileges = false) {
  return {
    valid: false,
    hiddenByPrivileges,
    canonicalPath: "",
    wikiPath: ""
  };
}

function cloneRow(row) {
  return row && typeof row === "object" ? { ...row } : row;
}

function isLiveTopic(topic) {
  return !!(topic && !parseInt(topic.deleted, 10) && !parseInt(topic.scheduled, 10));
}

function getSettingsEffectiveCategoryIds(settings = {}) {
  return Array.isArray(settings.effectiveCategoryIds) ?
    settings.effectiveCategoryIds :
    (Array.isArray(settings.categoryIds) ? settings.categoryIds : []);
}

function normalizeSegment(value) {
  return wikiSlug.normalizeCanonicalSegment(value);
}

function normalizeSegments(values) {
  const segments = (Array.isArray(values) ? values : []).map(normalizeSegment);
  return {
    segments,
    canonicalSegments: segments.map((segment) => segment.canonical).filter(Boolean),
    foldedSegments: segments.map((segment) => segment.foldedKey).filter(Boolean),
    invalidSegments: segments
      .map((segment, index) => ({
        index,
        source: values[index],
        error: segment.error
      }))
      .filter((row) => row.error)
  };
}

function splitRequestPath(requestPath) {
  if (Array.isArray(requestPath)) {
    return requestPath.map((segment) => String(segment || "").trim()).filter(Boolean);
  }

  let value = String(requestPath || "").trim();
  const hadLeadingSlash = value.startsWith("/");
  value = value.replace(/^\/+|\/+$/g, "");
  if (hadLeadingSlash && value.toLowerCase() === "wiki") {
    value = "";
  } else if (hadLeadingSlash && value.toLowerCase().startsWith("wiki/")) {
    value = value.slice(5);
  }

  if (!value) {
    return [];
  }

  return value.split("/").map((segment) => segment.trim()).filter(Boolean);
}

function isRetiredWikiRouteFirstSegment(segment) {
  const value = String(segment || "").trim().toLowerCase();
  return RESERVED_FIRST_SEGMENTS.has(value) || /^\d+$/.test(value);
}

function parseRequestPath(requestPath) {
  const rawSegments = splitRequestPath(requestPath);
  if (!rawSegments.length) {
    return { status: "root-outside-tree", rawSegments, rawPath: "", canonicalPath: "", foldedKey: "" };
  }

  const decodedSegments = [];
  for (const segment of rawSegments) {
    if (segment.includes("-")) {
      return { status: "not-found", rawSegments, rawPath: rawSegments.join("/") };
    }

    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch (e) {
      return { status: "invalid", rawSegments, rawPath: rawSegments.join("/"), error: "invalid-encoding" };
    }

    if (decoded.includes("/")) {
      return { status: "invalid", rawSegments, rawPath: rawSegments.join("/"), error: "encoded-path-separator" };
    }
    if (decoded.includes("-")) {
      return { status: "not-found", rawSegments, rawPath: decodedSegments.concat(decoded).join("/") };
    }
    decodedSegments.push(decoded.trim());
  }

  if (isRetiredWikiRouteFirstSegment(decodedSegments[0])) {
    return { status: "not-found", rawSegments, rawPath: decodedSegments.join("/") };
  }

  const normalized = normalizeSegments(decodedSegments);
  if (normalized.invalidSegments.length || normalized.canonicalSegments.length !== decodedSegments.length) {
    return {
      status: "invalid",
      rawSegments,
      rawPath: decodedSegments.join("/"),
      invalidSegments: normalized.invalidSegments
    };
  }

  return {
    status: "ok",
    rawSegments,
    rawPath: decodedSegments.join("/"),
    canonicalPath: normalized.canonicalSegments.join("/"),
    foldedKey: normalized.foldedSegments.join("/")
  };
}

function indexRowsByCid(rows) {
  const byCid = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const cid = asPositiveInt(row && row.cid);
    if (cid) {
      byCid.set(cid, row);
    }
  });
  return byCid;
}

function makeIncludedCidSet(input, categories) {
  const configured = input && input.settings && Array.isArray(input.settings.effectiveCategoryIds) ?
    input.settings.effectiveCategoryIds :
    (Array.isArray(input && input.effectiveCategoryIds) ? input.effectiveCategoryIds : null);

  if (!configured || !configured.length) {
    return new Set((Array.isArray(categories) ? categories : [])
      .map((category) => asPositiveInt(category && category.cid))
      .filter(Boolean));
  }

  return new Set(configured.map(asPositiveInt).filter(Boolean));
}

function getRouteRootCid(input) {
  return asPositiveInt(
    input && input.routeRootCid != null ?
      input.routeRootCid :
      (input && input.settings && input.settings.routeRootCid)
  );
}

function buildCategoryChain(category, categoriesByCid, includedCids, routeRootCid, options = {}) {
  const chain = [];
  const seen = new Set();
  let current = category;

  while (current) {
    const cid = asPositiveInt(current && current.cid);
    if (!cid || seen.has(cid)) {
      break;
    }
    if (!options.ignoreIncludedCids && includedCids && includedCids.size && !includedCids.has(cid)) {
      break;
    }

    seen.add(cid);
    chain.unshift(current);
    current = categoriesByCid.get(asPositiveInt(current.parentCid));
  }

  if (routeRootCid && chain.length && asPositiveInt(chain[0].cid) === routeRootCid) {
    return chain.slice(1);
  }
  return chain;
}

function buildNamespaceRecord(category, categoriesByCid, includedCids, routeRootCid, options = {}) {
  const chain = buildCategoryChain(category, categoriesByCid, includedCids, routeRootCid, options);
  const normalized = normalizeSegments(chain.map((entry) => entry && entry.name));
  const canonicalPath = normalized.canonicalSegments.join("/");
  const foldedKey = normalized.foldedSegments.join("/");

  return {
    cid: asPositiveInt(category && category.cid),
    category,
    categoryChain: chain,
    segments: normalized.canonicalSegments,
    foldedSegments: normalized.foldedSegments,
    canonicalPath,
    foldedKey,
    invalidSegments: normalized.invalidSegments
  };
}

function getTopicTitleSegments(topic) {
  return serializer.getTitlePath(topic && (topic.titleRaw || topic.title));
}

// A topic carrying westgateWikiNamespaceIndexCid is the stored index page of
// that namespace: it keeps resolving at the namespace path even after its
// title is edited. The field is honored only while structurally valid — the
// namespace must still exist and the page must still live in its parent
// category — otherwise it is ignored and title-derived paths apply.
function getStoredIndexNamespace(topic, namespaceByCid) {
  const indexCid = asPositiveInt(topic && topic.westgateWikiNamespaceIndexCid);
  if (!indexCid) {
    return null;
  }
  const namespace = namespaceByCid.get(indexCid);
  if (!namespace || !namespace.canonicalPath || namespace.invalidSegments.length) {
    return null;
  }
  const parentCid = asPositiveInt(namespace.category && namespace.category.parentCid);
  return parentCid && parentCid === asPositiveInt(topic && topic.cid) ? namespace : null;
}

function buildPageRecord(topic, namespaceByCid) {
  const namespace = namespaceByCid.get(asPositiveInt(topic && topic.cid));
  const titleSegments = getTopicTitleSegments(topic);
  const normalizedTitle = normalizeSegments(titleSegments);
  const storedIndexNamespace = getStoredIndexNamespace(topic, namespaceByCid);
  const canonicalSegments = storedIndexNamespace ?
    storedIndexNamespace.segments.slice() :
    (namespace && namespace.segments || []).concat(normalizedTitle.canonicalSegments);
  const foldedSegments = storedIndexNamespace ?
    storedIndexNamespace.foldedSegments.slice() :
    (namespace && namespace.foldedSegments || []).concat(normalizedTitle.foldedSegments);

  return {
    namespaceIndexCid: storedIndexNamespace ? storedIndexNamespace.cid : null,
    tid: asPositiveInt(topic && topic.tid),
    cid: asPositiveInt(topic && topic.cid),
    topic,
    titleSegments,
    segments: canonicalSegments,
    foldedSegments,
    canonicalPath: canonicalSegments.join("/"),
    foldedKey: foldedSegments.join("/"),
    invalidSegments: storedIndexNamespace ? [] : normalizedTitle.invalidSegments,
    namespace
  };
}

function buildPageRecordFromPlacement(input, namespaceByCid) {
  return buildPageRecord({
    tid: input && input.omitTid,
    cid: input && input.cid,
    title: input && input.title,
    titleRaw: input && input.titleRaw
  }, namespaceByCid);
}

function createNode(canonicalPath, foldedKey, segments, foldedSegments) {
  return {
    canonicalPath,
    foldedKey,
    segments,
    foldedSegments,
    pageFacets: [],
    namespaceFacets: [],
    childPaths: new Set()
  };
}

function addPathToIndex(state, canonicalSegments, foldedSegments) {
  let parentPath = "";
  for (let index = 1; index <= canonicalSegments.length; index += 1) {
    const segments = canonicalSegments.slice(0, index);
    const folded = foldedSegments.slice(0, index);
    const canonicalPath = segments.join("/");
    const foldedKey = folded.join("/");
    let node = state.nodes.get(canonicalPath);

    if (!node) {
      node = createNode(canonicalPath, foldedKey, segments, folded);
      state.nodes.set(canonicalPath, node);
    }

    if (parentPath) {
      const parent = state.nodes.get(parentPath);
      if (parent) {
        parent.childPaths.add(canonicalPath);
      }
    }
    parentPath = canonicalPath;
  }
}

function addFoldedLookup(state) {
  state.nodes.forEach((node) => {
    if (!node.foldedKey) {
      return;
    }
    const paths = state.foldedLookup.get(node.foldedKey) || new Set();
    paths.add(node.canonicalPath);
    state.foldedLookup.set(node.foldedKey, paths);
  });
}

function addNamespaceFacet(state, namespace) {
  if (!namespace.canonicalPath || namespace.invalidSegments.length) {
    return;
  }
  addPathToIndex(state, namespace.segments, namespace.foldedSegments);
  state.nodes.get(namespace.canonicalPath).namespaceFacets.push(namespace);
}

function isValidNamespacePlacement(namespace) {
  return !!(namespace && !namespace.invalidSegments.length);
}

function isValidRoutableNamespace(namespace) {
  return !!(isValidNamespacePlacement(namespace) && namespace.canonicalPath);
}

function isValidRoutablePage(page) {
  return !!(
    page &&
    Array.isArray(page.titleSegments) &&
    page.titleSegments.length &&
    page.canonicalPath &&
    !page.invalidSegments.length &&
    isValidNamespacePlacement(page.namespace)
  );
}

function addPageFacet(state, page) {
  if (!isValidRoutablePage(page)) {
    return;
  }
  addPathToIndex(state, page.segments, page.foldedSegments);
  state.nodes.get(page.canonicalPath).pageFacets.push(page);
}

function buildState(input = {}) {
  const categories = (Array.isArray(input.categories) ? input.categories : []).filter(Boolean);
  const topics = (Array.isArray(input.topics) ? input.topics : []).filter(isLiveTopic);
  const categoriesByCid = indexRowsByCid(categories);
  const includedCids = makeIncludedCidSet(input, categories);
  const routeRootCid = getRouteRootCid(input);
  const state = {
    categories,
    topics,
    categoriesByCid,
    includedCids,
    routeRootCid,
    namespaceByCid: new Map(),
    pageByTid: new Map(),
    nodes: new Map(),
    foldedLookup: new Map(),
    canReadTopic: typeof input.canReadTopic === "function" ? input.canReadTopic : async () => true,
    canViewCategory: typeof input.canViewCategory === "function" ? input.canViewCategory : async () => true
  };

  categories.forEach((category) => {
    const cid = asPositiveInt(category && category.cid);
    if (!cid || !includedCids.has(cid)) {
      return;
    }
    const namespace = buildNamespaceRecord(category, categoriesByCid, includedCids, routeRootCid);
    state.namespaceByCid.set(cid, namespace);
    addNamespaceFacet(state, namespace);
  });

  topics.forEach((topic) => {
    const page = buildPageRecord(topic, state.namespaceByCid);
    if (!page.tid) {
      return;
    }
    state.pageByTid.set(page.tid, page);
    addPageFacet(state, page);
  });

  addFoldedLookup(state);
  return state;
}

async function isTopicVisible(state, page, uid) {
  if (!page || !page.topic || !await isNamespaceVisible(state, page.namespace, uid)) {
    return false;
  }
  return (await state.canReadTopic(page.topic, uid)) !== false;
}

async function isCategoryChainVisible(state, categoryChain, uid) {
  const chain = Array.isArray(categoryChain) ? categoryChain : [];
  if (!chain.length) {
    return false;
  }
  for (const category of chain) {
    if ((await state.canViewCategory(category, uid)) === false) {
      return false;
    }
  }
  return true;
}

async function isNamespaceVisible(state, namespace, uid) {
  if (!namespace || !namespace.category) {
    return false;
  }
  if (!namespace.categoryChain.length) {
    return (await state.canViewCategory(namespace.category, uid)) !== false;
  }
  return isCategoryChainVisible(state, namespace.categoryChain, uid);
}

async function filterVisiblePages(state, pages, uid) {
  const visible = [];
  for (const page of pages) {
    if (await isTopicVisible(state, page, uid)) {
      visible.push(page);
    }
  }
  return visible;
}

async function filterVisibleNamespaces(state, namespaces, uid) {
  const visible = [];
  for (const namespace of namespaces) {
    if (await isNamespaceVisible(state, namespace, uid)) {
      visible.push(namespace);
    }
  }
  return visible;
}

async function getVisibleNodeCollision(state, node, uid) {
  if (!node) {
    return null;
  }
  if (node.pageFacets.length > 1) {
    const visible = await filterVisiblePages(state, node.pageFacets, uid);
    if (visible.length <= 1) {
      return null;
    }
    const result = {
      status: "page-collision",
      tids: visible.map((facet) => facet.tid).sort((a, b) => a - b),
      hiddenBlockers: visible.length < node.pageFacets.length
    };
    if (visible.length) {
      result.canonicalPath = node.canonicalPath;
      result.wikiPath = encodeWikiPath(node.canonicalPath);
    }
    return result;
  }
  if (node.namespaceFacets.length > 1) {
    const visible = await filterVisibleNamespaces(state, node.namespaceFacets, uid);
    if (visible.length <= 1) {
      return null;
    }
    const result = {
      status: "namespace-collision",
      cids: visible.map((facet) => facet.cid).sort((a, b) => a - b),
      hiddenBlockers: visible.length < node.namespaceFacets.length
    };
    if (visible.length) {
      result.canonicalPath = node.canonicalPath;
      result.wikiPath = encodeWikiPath(node.canonicalPath);
    }
    return result;
  }
  return null;
}

function makePageOutput(page) {
  if (!page) {
    return null;
  }
  return {
    tid: page.tid,
    cid: page.cid,
    canonicalPath: page.canonicalPath,
    titlePath: page.titleSegments.slice(),
    topic: cloneRow(page.topic)
  };
}

function makeNamespaceOutput(namespace) {
  if (!namespace) {
    return null;
  }
  return {
    cid: namespace.cid,
    canonicalPath: namespace.canonicalPath,
    categoryChain: namespace.categoryChain.map(cloneRow),
    category: cloneRow(namespace.category)
  };
}

async function hasVisibleNode(state, node, uid, seen = new Set()) {
  if (!node || seen.has(node.canonicalPath)) {
    return false;
  }
  seen.add(node.canonicalPath);

  if (node.pageFacets.length === 1 && await isTopicVisible(state, node.pageFacets[0], uid)) {
    return true;
  }
  if (node.namespaceFacets.length === 1 && await isNamespaceVisible(state, node.namespaceFacets[0], uid)) {
    return true;
  }

  for (const childPath of node.childPaths) {
    if (await hasVisibleNode(state, state.nodes.get(childPath), uid, seen)) {
      return true;
    }
  }
  return false;
}

async function hasVisibleDescendants(state, node, uid) {
  if (!node) {
    return false;
  }
  for (const childPath of node.childPaths) {
    if (await hasVisibleNode(state, state.nodes.get(childPath), uid)) {
      return true;
    }
  }
  return false;
}

async function shapeNode(state, node, uid) {
  if (!node) {
    return null;
  }

  const visiblePages = await filterVisiblePages(state, node.pageFacets, uid);
  const visibleNamespaces = await filterVisibleNamespaces(state, node.namespaceFacets, uid);
  const page = visiblePages.length === 1 ? visiblePages[0] : null;
  const namespace = visibleNamespaces.length === 1 ? visibleNamespaces[0] : null;
  const hasDescendants = await hasVisibleDescendants(state, node, uid);

  if (!page && !namespace && !hasDescendants) {
    return null;
  }

  return {
    canonicalPath: node.canonicalPath,
    foldedKey: node.foldedKey,
    segments: node.segments.slice(),
    page: makePageOutput(page),
    namespace: makeNamespaceOutput(namespace),
    isComposite: !!(page && namespace),
    isBranchOnly: !page && !namespace && hasDescendants,
    hasDescendants
  };
}

function emptyChildren() {
  return {
    directNodes: [],
    childNamespaces: [],
    childPages: []
  };
}

async function listChildrenForNode(state, node, options = {}) {
  if (!node) {
    return emptyChildren();
  }

  const uid = options.uid == null ? 0 : options.uid;
  const rows = [];
  for (const childPath of Array.from(node.childPaths).sort()) {
    const shaped = await shapeNode(state, state.nodes.get(childPath), uid);
    if (shaped) {
      rows.push(shaped);
    }
  }

  rows.sort(comparePathRows);
  return {
    directNodes: rows,
    childNamespaces: rows.filter((row) => row.namespace),
    childPages: rows.filter((row) => row.page)
  };
}

function resolveNodeByPath(state, path) {
  return state.nodes.get(path) || null;
}

async function makeAmbiguousResult(state, foldedKey, uid) {
  const paths = Array.from(state.foldedLookup.get(foldedKey) || []).sort();
  const visibleMatches = [];
  for (const canonicalPath of paths) {
    const shaped = await shapeNode(state, state.nodes.get(canonicalPath), uid);
    if (shaped) {
      visibleMatches.push({ canonicalPath, wikiPath: encodeWikiPath(canonicalPath) });
    }
  }
  if (!visibleMatches.length) {
    return null;
  }
  return {
    status: "ambiguous",
    foldedKey,
    hiddenBlockers: visibleMatches.length < paths.length,
    matches: visibleMatches
  };
}

async function resolveNodeFromParsedPath(state, parsed, options = {}) {
  if (parsed.status !== "ok") {
    return { status: parsed.status, requestedPath: parsed.rawPath || "", error: parsed.error };
  }

  const uid = options.uid == null ? 0 : options.uid;
  let node = resolveNodeByPath(state, parsed.rawPath);
  let redirectToCanonical = false;

  if (!node && parsed.canonicalPath !== parsed.rawPath) {
    node = resolveNodeByPath(state, parsed.canonicalPath);
    redirectToCanonical = !!node;
  }

  if (!node) {
    const foldedMatches = state.foldedLookup.get(parsed.foldedKey);
    if (!foldedMatches || !foldedMatches.size) {
      return { status: "not-found", requestedPath: parsed.rawPath };
    }
    if (foldedMatches.size > 1) {
      return (await makeAmbiguousResult(state, parsed.foldedKey, uid)) ||
        { status: "not-found", requestedPath: parsed.rawPath };
    }
    const canonicalPath = Array.from(foldedMatches)[0];
    node = resolveNodeByPath(state, canonicalPath);
    redirectToCanonical = true;
  } else if (parsed.rawPath !== node.canonicalPath) {
    redirectToCanonical = true;
  }

  const foldedMatches = state.foldedLookup.get(node.foldedKey);
  if (foldedMatches && foldedMatches.size > 1) {
    return (await makeAmbiguousResult(state, node.foldedKey, uid)) ||
      { status: "not-found", requestedPath: parsed.rawPath };
  }

  const collision = await getVisibleNodeCollision(state, node, uid);
  if (collision) {
    return { ...collision, requestedPath: parsed.rawPath };
  }

  const shaped = await shapeNode(state, node, uid);
  if (!shaped) {
    return { status: "not-found", requestedPath: parsed.rawPath };
  }

  wikiShapes.assertShape(shaped, wikiShapes.SHAPED_NODE_KEYS, "resolveWikiNode shaped node");
  return wikiShapes.assertShape({
    status: "ok",
    requestedPath: parsed.rawPath,
    canonicalPath: node.canonicalPath,
    wikiPath: encodeWikiPath(node.canonicalPath),
    redirectToCanonical,
    node: shaped,
    ancestors: buildNodeAncestors(state, node),
    children: options.includeChildren ? await listChildrenForNode(state, node, options) : emptyChildren()
  }, wikiShapes.NODE_RESULT_OK_KEYS, "resolveWikiNode ok result");
}

function buildNamespaceCandidate(state, input = {}) {
  const cid = asPositiveInt(input.category && input.category.cid);
  const parentCid = asPositiveInt(input.parentCid != null ? input.parentCid : input.category && input.category.parentCid);
  const category = {
    ...(input.category || {}),
    cid,
    parentCid
  };
  const categoriesByCid = new Map(state.categoriesByCid);
  if (cid) {
    categoriesByCid.set(cid, category);
  }
  return buildNamespaceRecord(category, categoriesByCid, state.includedCids, state.routeRootCid, {
    ignoreIncludedCids: true
  });
}

function hasReservedRoot(canonicalPath) {
  const first = String(canonicalPath || "").split("/")[0];
  return !!(first && RESERVED_FIRST_SEGMENTS.has(first.toLowerCase()));
}

function findCrossFacetFoldedNamespaces(state, candidate) {
  return Array.from(state.namespaceByCid.values())
    .filter(isValidRoutableNamespace)
    .filter((namespace) => namespace.foldedKey === candidate.foldedKey && namespace.canonicalPath !== candidate.canonicalPath);
}

function findCrossFacetFoldedPages(state, candidate) {
  return Array.from(state.pageByTid.values())
    .filter(isValidRoutablePage)
    .filter((page) => page.foldedKey === candidate.foldedKey && page.canonicalPath !== candidate.canonicalPath);
}

function createWikiTreeIndex(input = {}) {
  const state = buildState(input);

  return {
    async resolveWikiNode(requestPath, options = {}) {
      return resolveNodeFromParsedPath(state, parseRequestPath(requestPath), options);
    },

    async listWikiNodeChildren(nodeOrPath, options = {}) {
      let canonicalPath = String(nodeOrPath && nodeOrPath.canonicalPath || "");
      if (typeof nodeOrPath === "string") {
        const resolved = await resolveNodeFromParsedPath(state, parseRequestPath(nodeOrPath), {
          ...options,
          includeChildren: false
        });
        canonicalPath = resolved.status === "ok" ? resolved.canonicalPath : "";
      }
      const node = resolveNodeByPath(state, canonicalPath);
      return listChildrenForNode(state, node, options);
    },

    async getCanonicalPagePath(topic, options = {}) {
      const page = buildPageRecord(topic, state.namespaceByCid);
      if (hasViewerUid(options) && !await isTopicVisible(state, page, options.uid)) {
        return "";
      }
      return isValidRoutablePage(page) ? page.canonicalPath : "";
    },

    async getCanonicalNamespacePath(category, options = {}) {
      const namespace = state.namespaceByCid.get(asPositiveInt(category && category.cid)) ||
        buildNamespaceRecord(category, state.categoriesByCid, state.includedCids, state.routeRootCid);
      if (hasViewerUid(options) && !await isNamespaceVisible(state, namespace, options.uid)) {
        return "";
      }
      return namespace.invalidSegments.length ? "" : namespace.canonicalPath;
    },

    async getCanonicalNamespacePathInfo(category, options = {}) {
      const namespace = state.namespaceByCid.get(asPositiveInt(category && category.cid)) ||
        buildNamespaceRecord(category, state.categoriesByCid, state.includedCids, state.routeRootCid);
      if (namespace.invalidSegments.length) {
        return invalidInfo(false);
      }
      if (hasViewerUid(options) && !await isNamespaceVisible(state, namespace, options.uid)) {
        return invalidInfo(true);
      }
      return visibleInfo(namespace.canonicalPath);
    },

    async validateCanonicalPagePlacement(input = {}) {
      const cid = asPositiveInt(input.cid);
      const title = String(input.titleRaw || input.title || "").trim();
      const omitTid = asPositiveInt(input.omitTid);
      if (!cid || !title) {
        return { status: "invalid" };
      }
      if (!state.namespaceByCid.has(cid)) {
        return { status: "namespace-not-found", cid };
      }
      if (!isValidNamespacePlacement(state.namespaceByCid.get(cid))) {
        return { status: "namespace-invalid", cid };
      }

      const candidate = buildPageRecordFromPlacement({ ...input, cid }, state.namespaceByCid);
      if (candidate.invalidSegments.length || !candidate.canonicalPath) {
        return { status: "invalid", invalidSegments: candidate.invalidSegments };
      }
      if (hasReservedRoot(candidate.canonicalPath)) {
        return { status: "reserved-path-segment", canonicalPath: candidate.canonicalPath };
      }

      const canonicalMatches = Array.from(state.pageByTid.values())
        .filter(isValidRoutablePage)
        .filter((page) => page.tid !== omitTid && page.canonicalPath === candidate.canonicalPath);
      if (canonicalMatches.length) {
        return {
          status: "page-collision",
          canonicalPath: candidate.canonicalPath,
          tids: canonicalMatches.map((page) => page.tid).sort((a, b) => a - b)
        };
      }

      const foldedMatches = Array.from(state.pageByTid.values())
        .filter(isValidRoutablePage)
        .filter((page) => page.tid !== omitTid && page.foldedKey === candidate.foldedKey);
      if (foldedMatches.length) {
        return {
          status: "page-folded-collision",
          canonicalPath: candidate.canonicalPath,
          foldedKey: candidate.foldedKey,
          tids: foldedMatches.map((page) => page.tid).sort((a, b) => a - b)
        };
      }

      const foldedNamespaceMatches = findCrossFacetFoldedNamespaces(state, candidate);
      if (foldedNamespaceMatches.length) {
        return {
          status: "cross-facet-folded-collision",
          canonicalPath: candidate.canonicalPath,
          foldedKey: candidate.foldedKey,
          cids: foldedNamespaceMatches.map((namespace) => namespace.cid).sort((a, b) => a - b)
        };
      }

      return {
        status: "ok",
        cid,
        canonicalPath: candidate.canonicalPath,
        wikiPath: encodeWikiPath(candidate.canonicalPath)
      };
    },

    async validateCanonicalNamespacePlacement(input = {}) {
      const cid = asPositiveInt(input.category && input.category.cid);
      const parentCid = asPositiveInt(input.parentCid != null ? input.parentCid : input.category && input.category.parentCid);
      const name = String(input.category && input.category.name || "").trim();
      if (!cid || !name) {
        return { status: "invalid" };
      }
      if (parentCid && !state.namespaceByCid.has(parentCid)) {
        return { status: "parent-namespace-not-found", parentCid };
      }

      const candidate = buildNamespaceCandidate(state, input);
      if (candidate.invalidSegments.length || !candidate.canonicalPath) {
        return { status: "invalid", invalidSegments: candidate.invalidSegments };
      }
      if (hasReservedRoot(candidate.canonicalPath)) {
        return { status: "reserved-path-segment", canonicalPath: candidate.canonicalPath };
      }

      const namespaces = Array.from(state.namespaceByCid.values())
        .filter(isValidRoutableNamespace)
        .filter((namespace) => namespace.cid !== cid);
      const canonicalMatches = namespaces.filter((namespace) => namespace.canonicalPath === candidate.canonicalPath);
      if (canonicalMatches.length) {
        return {
          status: "namespace-collision",
          canonicalPath: candidate.canonicalPath,
          cids: canonicalMatches.map((namespace) => namespace.cid).sort((a, b) => a - b)
        };
      }

      const foldedMatches = namespaces.filter((namespace) => namespace.foldedKey === candidate.foldedKey);
      if (foldedMatches.length) {
        return {
          status: "namespace-folded-collision",
          canonicalPath: candidate.canonicalPath,
          foldedKey: candidate.foldedKey,
          cids: foldedMatches.map((namespace) => namespace.cid).sort((a, b) => a - b)
        };
      }

      const foldedPageMatches = findCrossFacetFoldedPages(state, candidate);
      if (foldedPageMatches.length) {
        return {
          status: "cross-facet-folded-collision",
          canonicalPath: candidate.canonicalPath,
          foldedKey: candidate.foldedKey,
          tids: foldedPageMatches.map((page) => page.tid).sort((a, b) => a - b)
        };
      }

      return {
        status: "ok",
        cid,
        canonicalPath: candidate.canonicalPath,
        wikiPath: encodeWikiPath(candidate.canonicalPath)
      };
    },

    listNamespaceDiagnostics() {
      const namespaces = Array.from(state.namespaceByCid.values()).filter((ns) => ns.cid);
      const invalid = namespaces.filter((ns) => ns.invalidSegments.length);
      const valid = namespaces.filter((ns) => !ns.invalidSegments.length);
      const reserved = valid.filter((ns) => hasReservedRoot(ns.canonicalPath));

      const byFolded = new Map();
      valid.forEach((ns) => {
        if (!ns.foldedKey) {
          return;
        }
        const rows = byFolded.get(ns.foldedKey) || [];
        rows.push(ns);
        byFolded.set(ns.foldedKey, rows);
      });
      const collisions = [];
      byFolded.forEach((rows, foldedKey) => {
        if (rows.length > 1) {
          collisions.push({ foldedKey, namespaces: rows });
        }
      });

      return { collisions, reserved, invalid };
    },

    getState() {
      return state;
    }
  };
}

async function collectRuntimeInput() {
  const categories = require.main.require("./src/categories");
  const privileges = require.main.require("./src/privileges");
  const topics = require.main.require("./src/topics");
  const config = require("../core/config");
  const { getCategoriesTids } = require("../core/wiki-category-tids");
  const settings = await config.getSettings();
  const cids = Array.isArray(settings.effectiveCategoryIds) ? settings.effectiveCategoryIds : [];
  const categoryRows = (await Promise.all(cids.map((cid) => categories.getCategoryData(cid)))).filter(Boolean);
  const tids = [...new Set((await getCategoriesTids(cids)).map(asPositiveInt).filter(Boolean))];

  let topicRows = [];
  if (tids.length && topics && typeof topics.getTopicsFields === "function") {
    topicRows = (await topics.getTopicsFields(tids, [
      "tid",
      "cid",
      "title",
      "titleRaw",
      "slug",
      "deleted",
      "scheduled",
      "postcount",
      "westgateWikiNamespaceIndexCid",
      ...wikiTombstones.TOMBSTONE_FIELDS
    ])).filter(Boolean);
  } else if (tids.length && topics && typeof topics.getTopicData === "function") {
    topicRows = (await Promise.all(tids.map((tid) => topics.getTopicData(tid)))).filter(Boolean);
  }
  topicRows = topicRows.filter((topic) => !wikiTombstones.isTombstonedTopic(topic));

  return {
    categories: categoryRows,
    topics: topicRows,
    settings,
    canViewCategory: async (category, uid) => {
      if (!privileges || !privileges.categories || typeof privileges.categories.get !== "function") {
        return true;
      }
      const result = await privileges.categories.get(asPositiveInt(category && category.cid), uid || 0);
      return !!(result && result.read && result["topics:read"]);
    },
    canReadTopic: async (topic, uid) => {
      if (!privileges || !privileges.topics || typeof privileges.topics.filterTids !== "function") {
        return true;
      }
      const tid = asPositiveInt(topic && topic.tid);
      if (!tid) {
        return false;
      }
      const visible = await privileges.topics.filterTids("topics:read", [tid], uid || 0);
      return Array.isArray(visible) && visible.map(asPositiveInt).includes(tid);
    }
  };
}

// Stamp westgateWikiNamespaceIndexCid onto composite pages that predate the
// stored linkage (or were just created/imported), so the index-page connection
// stops depending on transient title/path string equality.
async function healNamespaceIndexFields(state) {
  const topics = require.main.require("./src/topics");
  if (!topics || typeof topics.setTopicField !== "function") {
    return;
  }
  for (const node of state.nodes.values()) {
    if (node.pageFacets.length !== 1 || node.namespaceFacets.length !== 1) {
      continue;
    }
    const page = node.pageFacets[0];
    const namespace = node.namespaceFacets[0];
    if (page.namespaceIndexCid || asPositiveInt(page.topic && page.topic.westgateWikiNamespaceIndexCid)) {
      continue;
    }
    try {
      await topics.setTopicField(page.tid, "westgateWikiNamespaceIndexCid", namespace.cid);
      page.topic.westgateWikiNamespaceIndexCid = namespace.cid;
    } catch (err) {
      // Healing is best-effort; the structural (path equality) composite still works.
    }
  }
}

async function getRuntimeTree() {
  const now = Date.now();
  if (runtimeTreeCache && runtimeTreeCache.expiry > now) {
    cacheMetrics.hits += 1;
    return runtimeTreeCache.tree;
  }

  cacheMetrics.misses += 1;
  const epochAtStart = runtimeTreeEpoch;
  const tree = createWikiTreeIndex(await collectRuntimeInput());
  await healNamespaceIndexFields(tree.getState());
  if (runtimeTreeEpoch === epochAtStart) {
    runtimeTreeCache = {
      expiry: now + TREE_INDEX_CACHE_TTL_MS,
      tree
    };
  }
  cacheMetrics.rebuilds += 1;
  return tree;
}

async function getRuntimeCategoryChain(category) {
  const categories = require.main.require("./src/categories");
  const chain = [];
  const seen = new Set();
  let current = category;

  while (current) {
    const cid = asPositiveInt(current && current.cid);
    if (!cid || seen.has(cid)) {
      break;
    }
    seen.add(cid);
    chain.unshift(current);
    const parentCid = asPositiveInt(current.parentCid);
    current = parentCid && categories && typeof categories.getCategoryData === "function" ?
      await categories.getCategoryData(parentCid) :
      null;
  }

  return chain;
}

function getRuntimeCanViewCategory(options = {}) {
  if (typeof options.canViewCategory === "function") {
    return options.canViewCategory;
  }
  return async (category, uid) => {
    const privileges = require.main.require("./src/privileges");
    if (!privileges || !privileges.categories || typeof privileges.categories.get !== "function") {
      return true;
    }
    const result = await privileges.categories.get(asPositiveInt(category && category.cid), uid || 0);
    return !!(result && result.read && result["topics:read"]);
  };
}

async function getCategoryOnlyTree(category, options = {}) {
  const settings = options.settings || {};
  const categories = await getRuntimeCategoryChain(category);
  return createWikiTreeIndex({
    categories,
    topics: [],
    settings: {
      ...settings,
      effectiveCategoryIds: getSettingsEffectiveCategoryIds(settings)
    },
    routeRootCid: options.routeRootCid,
    canViewCategory: getRuntimeCanViewCategory(options)
  });
}

function getCanonicalPagePathFromNamespaceInfo(topic, namespaceInfo) {
  if (!namespaceInfo || !namespaceInfo.valid || !isLiveTopic(topic)) {
    return "";
  }
  const titleSegments = serializer.getTitlePath(topic && (topic.titleRaw || topic.title));
  if (!titleSegments.length) {
    return "";
  }
  const normalizedTitle = normalizeSegments(titleSegments);
  if (normalizedTitle.invalidSegments.length || normalizedTitle.canonicalSegments.length !== titleSegments.length) {
    return "";
  }
  return [namespaceInfo.canonicalPath, normalizedTitle.canonicalSegments.join("/")].filter(Boolean).join("/");
}

async function resolveWikiNode(requestPath, options = {}) {
  return (await getRuntimeTree()).resolveWikiNode(requestPath, options);
}

async function listWikiNodeChildren(nodeOrPath, options = {}) {
  return (await getRuntimeTree()).listWikiNodeChildren(nodeOrPath, options);
}

async function getCanonicalPagePath(topic, options = {}) {
  if (options.namespaceInfo) {
    return getCanonicalPagePathFromNamespaceInfo(topic, options.namespaceInfo);
  }
  return (await getRuntimeTree(options)).getCanonicalPagePath(topic, options);
}

async function getCanonicalNamespacePath(category, options = {}) {
  if (options.settings && category && asPositiveInt(category.cid)) {
    return (await getCategoryOnlyTree(category, options)).getCanonicalNamespacePath(category, options);
  }
  return (await getRuntimeTree(options)).getCanonicalNamespacePath(category, options);
}

async function getCanonicalNamespacePathInfo(category, options = {}) {
  if (options.settings && category && asPositiveInt(category.cid)) {
    return (await getCategoryOnlyTree(category, options)).getCanonicalNamespacePathInfo(category, options);
  }
  return (await getRuntimeTree(options)).getCanonicalNamespacePathInfo(category, options);
}

async function validateCanonicalPagePlacement(input = {}) {
  return (await getRuntimeTree()).validateCanonicalPagePlacement(input);
}

async function listNamespaceDiagnostics() {
  return (await getRuntimeTree()).listNamespaceDiagnostics();
}

async function validateCanonicalNamespacePlacement(input = {}) {
  return (await getRuntimeTree()).validateCanonicalNamespacePlacement(input);
}

function invalidateWikiTreeIndex() {
  runtimeTreeCache = null;
  runtimeTreeEpoch += 1;
  cacheMetrics.invalidations += 1;
}

function getCacheMetrics() {
  return {
    treeIndex: { ...cacheMetrics }
  };
}

function resetCacheMetrics() {
  Object.keys(cacheMetrics).forEach((key) => {
    cacheMetrics[key] = 0;
  });
}

module.exports = {
  TREE_INDEX_CACHE_TTL_MS,
  RESERVED_FIRST_SEGMENTS,
  createWikiTreeIndex,
  resolveWikiNode,
  listWikiNodeChildren,
  getCanonicalPagePath,
  getCanonicalNamespacePath,
  getCanonicalNamespacePathInfo,
  validateCanonicalPagePlacement,
  validateCanonicalNamespacePlacement,
  listNamespaceDiagnostics,
  invalidateWikiTreeIndex,
  getCacheMetrics,
  resetCacheMetrics
};
