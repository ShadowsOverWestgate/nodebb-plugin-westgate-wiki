"use strict";

const archiveIdentity = require("./wiki-archive-identity");
const archiveManifest = require("./wiki-archive-manifest");
const archiveExport = require("./wiki-archive-export");
const migration = require("../tree/wiki-canonical-diagnostics");
const wikiHtmlSanitizer = require("../content/wiki-html-sanitizer");
const wikiSlug = require("../core/wiki-slug");

const DEFAULT_SUPPORTED_ASSET_TYPES = new Set([
  "application/octet-stream",
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
  "image/webp",
  "text/plain"
]);

function compareText(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function makeError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function getFileValue(files, archivePath) {
  if (files instanceof Map) {
    return files.get(archivePath);
  }
  return files && Object.prototype.hasOwnProperty.call(files, archivePath) ? files[archivePath] : undefined;
}

function getFileText(files, archivePath) {
  const value = getFileValue(files, archivePath);
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return String(value || "");
}

function sortByPathAndId(a, b) {
  return compareText(a && a.canonicalPath, b && b.canonicalPath) ||
    compareText(a && (a.archiveNamespaceId || a.archivePageId), b && (b.archiveNamespaceId || b.archivePageId));
}

function sortBlockers(a, b) {
  return compareText(a.code, b.code) ||
    compareText(a.canonicalPath, b.canonicalPath) ||
    compareText(a.archiveNamespaceId, b.archiveNamespaceId) ||
    compareText(a.archivePageId, b.archivePageId);
}

function sortAssetOperations(a, b) {
  return compareText(a.path, b.path) || compareText(a.sha256, b.sha256);
}

function pathDepth(canonicalPath) {
  const value = String(canonicalPath || "");
  return value ? value.split("/").filter(Boolean).length : 0;
}

function asPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function placementMeta(canonicalPath) {
  const segments = String(canonicalPath || "").split("/").map((segment) => segment.trim()).filter(Boolean);
  const normalized = segments.map((segment) => wikiSlug.normalizeCanonicalSegment(segment));
  return {
    canonicalPath: String(canonicalPath || "").trim(),
    foldedKey: normalized.map((segment) => segment.foldedKey).filter(Boolean).join("/")
  };
}

function getCanonicalDiagnostics(options = {}) {
  if (options.canonicalDiagnostics) {
    return options.canonicalDiagnostics;
  }
  if (options.migration && typeof options.migration.verify === "function") {
    return options.migration.verify(options.migrationInput || options.destination || {});
  }
  if (options.verifyCanonical === true && migration && typeof migration.verify === "function") {
    return migration.verify(options.migrationInput || {});
  }
  return { status: "ok", treeIndex: { status: "ok", blockingErrors: 0 }, summary: { blockingErrors: 0 } };
}

async function assertCanonicalDiagnostics(options = {}) {
  const report = await getCanonicalDiagnostics(options);
  if (archiveExport.hasBlockingDiagnostics(report)) {
    const err = makeError("archive-import-blocked-by-canonical-diagnostics");
    err.report = report;
    throw err;
  }
  return report;
}

function getArticleCssSanitizer(options = {}) {
  if (options.articleCss && typeof options.articleCss.sanitizeArticleCss === "function") {
    return options.articleCss.sanitizeArticleCss;
  }

  try {
    const wikiArticleCss = require("../content/wiki-article-css");
    if (wikiArticleCss && typeof wikiArticleCss.sanitizeArticleCss === "function") {
      return wikiArticleCss.sanitizeArticleCss;
    }
  } catch (err) {
    // Import preview remains usable in pure tests without a NodeBB require.main.
  }

  return function fallbackSanitizeArticleCss(css) {
    const value = String(css || "");
    if (hasUnsafeCssSignal(value)) {
      return "";
    }
    return value.trim();
  };
}

function normalizeArchiveHtml(html) {
  return String(html || "").trim();
}

function validatePageHtml(page, files) {
  const html = getFileText(files, page.articleHtmlPath);
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);
  if (sanitized !== normalizeArchiveHtml(html)) {
    throw makeError("unsafe-archive-html", `unsafe-archive-html: ${page.canonicalPath}`);
  }
}

function hasUnsafeCssSignal(css) {
  const value = String(css || "");
  // Dangerous constructs are never allowed anywhere in article CSS. The old
  // pattern only matched these when followed by a selector, so
  // `.x{background:url(javascript:...)}` and `@import "evil.css"` slipped past
  // this fallback (used when the real sanitizer module fails to load).
  if (/(?:expression|javascript|vbscript|data:text\/html|behavior\s*:|@import|url\s*\()/i.test(value)) {
    return true;
  }
  // Unscoped selectors that would restyle the whole page, not just the article.
  return /(?:^|[\s,}])\s*(?:html|body|:root|\*|#content|\.container|\.navbar|\.footer|\.westgate-wiki)\b/i.test(value);
}

function normalizeArchiveCss(css) {
  return String(css || "").trim();
}

function validatePageCss(page, sanitizeArticleCss) {
  const source = String(page.articleCss || "");
  const sanitized = sanitizeArticleCss(source);
  if (sanitized !== normalizeArchiveCss(source)) {
    throw makeError("unsafe-archive-css", `unsafe-archive-css: ${page.canonicalPath}`);
  }
}

function normalizeContentType(contentType) {
  return String(contentType || "").toLowerCase().split(";")[0].trim();
}

function getSupportedAssetTypes(options = {}) {
  const configured = options.policy && Array.isArray(options.policy.supportedAssetContentTypes) ?
    options.policy.supportedAssetContentTypes :
    null;
  if (configured && configured.length) {
    return new Set(configured.map(normalizeContentType).filter(Boolean));
  }
  return DEFAULT_SUPPORTED_ASSET_TYPES;
}

function validateAssets(manifest, options = {}) {
  const supportedTypes = getSupportedAssetTypes(options);
  manifest.assets.forEach((asset) => {
    const contentType = normalizeContentType(asset.contentType);
    if (!supportedTypes.has(contentType)) {
      throw makeError("unsupported-archive-asset-type", `unsupported-archive-asset-type: ${asset.path}`);
    }
  });
}

function validateContent(manifest, files, options = {}) {
  const sanitizeArticleCss = getArticleCssSanitizer(options);
  validateAssets(manifest, options);
  manifest.pages.forEach((page) => {
    validatePageHtml(page, files);
    validatePageCss(page, sanitizeArticleCss);
  });
}

function manifestWarnings(manifest) {
  return (Array.isArray(manifest.reports) ? manifest.reports : [])
    .filter((report) => report && report.severity === "warning")
    .map((report) => ({ ...report }));
}

function groupByCanonicalPath(rows = []) {
  const byPath = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row || !Object.prototype.hasOwnProperty.call(row, "canonicalPath")) {
      return;
    }
    const canonicalPath = String(row && row.canonicalPath || "").trim();
    const group = byPath.get(canonicalPath) || [];
    group.push(row);
    byPath.set(canonicalPath, group);
  });
  return byPath;
}

function planNamespaces(manifest, destination = {}) {
  const operations = [];
  const blockers = [];
  const namespacePlans = new Map();
  const destinationByPath = groupByCanonicalPath(destination.namespaces || []);
  const namespaces = manifest.namespaces.slice().sort((a, b) => {
    const depthCompare = pathDepth(a.canonicalPath) - pathDepth(b.canonicalPath);
    return depthCompare || sortByPathAndId(a, b);
  });

  // Children of the route root are exported with parentArchiveNamespaceId=null
  // because the root segment is omitted from canonical paths. Re-parent them
  // under the manifest's route-root namespace (canonicalPath "") so import does
  // not scatter them as top-level categories outside the configured wiki root.
  const rootNamespace = namespaces.find((namespace) => !namespace.canonicalPath) || null;
  const effectiveParentId = (namespace) => {
    if (namespace.parentArchiveNamespaceId) {
      return namespace.parentArchiveNamespaceId;
    }
    if (namespace.canonicalPath && rootNamespace && rootNamespace.archiveNamespaceId !== namespace.archiveNamespaceId) {
      return rootNamespace.archiveNamespaceId;
    }
    return "";
  };

  namespaces.forEach((namespace) => {
    const destinationMatches = destinationByPath.get(namespace.canonicalPath) || [];
    if (destinationMatches.length > 1) {
      blockers.push({
        severity: "blocker",
        code: "namespace-ambiguous",
        archiveNamespaceId: namespace.archiveNamespaceId,
        canonicalPath: namespace.canonicalPath,
        cids: destinationMatches.map((row) => parseInt(row.cid, 10)).filter(Boolean).sort((a, b) => a - b)
      });
      return;
    }

    if (destinationMatches.length === 1) {
      const match = destinationMatches[0];
      const operation = {
        type: "namespace.match",
        archiveNamespaceId: namespace.archiveNamespaceId,
        canonicalPath: namespace.canonicalPath,
        cid: parseInt(match.cid, 10) || 0
      };
      namespacePlans.set(namespace.archiveNamespaceId, { status: "matched", operation, namespace, cid: operation.cid });
      operations.push(operation);
      return;
    }

    const parentId = effectiveParentId(namespace);
    const parentPlan = parentId ? namespacePlans.get(parentId) : null;
    if (parentId && !parentPlan) {
      blockers.push({
        severity: "blocker",
        code: "namespace-parent-unresolved",
        archiveNamespaceId: namespace.archiveNamespaceId,
        parentArchiveNamespaceId: parentId,
        canonicalPath: namespace.canonicalPath
      });
      return;
    }

    const operation = {
      type: "namespace.create",
      archiveNamespaceId: namespace.archiveNamespaceId,
      parentArchiveNamespaceId: parentId || null,
      canonicalPath: namespace.canonicalPath,
      titlePath: namespace.titlePath.slice()
    };
    if (parentPlan && parentPlan.cid) {
      operation.parentCid = parentPlan.cid;
    }
    namespacePlans.set(namespace.archiveNamespaceId, { status: "create", operation, namespace, cid: 0 });
    operations.push(operation);
  });

  return { operations, blockers, namespacePlans };
}

function destinationPageRows(destination = {}) {
  return (Array.isArray(destination.pages) ? destination.pages : []).map((page) => ({
    ...page,
    archivePageId: page && (page.archivePageId || page.westgateWikiArchivePageId) || ""
  }));
}

function findDestinationPageByTid(rows, tid) {
  return rows.find((row) => (parseInt(row && row.tid, 10) || 0) === (parseInt(tid, 10) || 0)) || null;
}

function destinationPostRef(destinationPage) {
  const pid = asPositiveInt(destinationPage && destinationPage.pid);
  const mainPid = asPositiveInt(destinationPage && (destinationPage.mainPid || destinationPage.mainPostPid));
  const output = {};
  if (pid) {
    output.pid = pid;
  }
  if (mainPid) {
    output.mainPid = mainPid;
  }
  return output;
}

function targetNamespaceRef(namespacePlans, archiveNamespaceId) {
  const plan = namespacePlans.get(archiveNamespaceId);
  if (!plan) {
    return null;
  }
  if (plan.cid) {
    return { cid: plan.cid };
  }
  return { archiveNamespaceId, planned: true };
}

function getPageChanges(sourcePage, destinationPage, namespacePlans, includeArchiveIdChange) {
  const changes = {};
  const destinationTitle = String(destinationPage && destinationPage.title || "");
  if (destinationTitle && destinationTitle !== sourcePage.title) {
    changes.title = { from: destinationTitle, to: sourcePage.title };
  }
  if (String(destinationPage && destinationPage.canonicalPath || "") !== sourcePage.canonicalPath) {
    changes.canonicalPath = {
      from: String(destinationPage && destinationPage.canonicalPath || ""),
      to: sourcePage.canonicalPath
    };
  }

  const namespaceRef = targetNamespaceRef(namespacePlans, sourcePage.archiveNamespaceId);
  const destinationCid = parseInt(destinationPage && destinationPage.cid, 10) || 0;
  if (namespaceRef && namespaceRef.cid && destinationCid && destinationCid !== namespaceRef.cid) {
    changes.category = { from: destinationCid, to: namespaceRef.cid };
  } else if (namespaceRef && namespaceRef.planned && destinationCid) {
    changes.category = {
      from: destinationCid,
      toArchiveNamespaceId: sourcePage.archiveNamespaceId,
      planned: true
    };
  }
  if (includeArchiveIdChange) {
    changes.archivePageId = {
      from: String(destinationPage && (destinationPage.archivePageId || destinationPage.westgateWikiArchivePageId) || ""),
      to: sourcePage.archivePageId
    };
  }
  return changes;
}

function planPages(manifest, destination = {}, namespacePlans) {
  const operations = [];
  const blockers = [];
  const pagePlans = new Map();
  const rows = destinationPageRows(destination);
  const pages = manifest.pages.slice().sort(sortByPathAndId);

  pages.forEach((page) => {
    if (!namespacePlans.has(page.archiveNamespaceId)) {
      blockers.push({
        severity: "blocker",
        code: "page-namespace-unresolved",
        archivePageId: page.archivePageId,
        archiveNamespaceId: page.archiveNamespaceId,
        canonicalPath: page.canonicalPath
      });
      return;
    }

    const match = archiveIdentity.matchDestinationPage(page, rows);
    if (match.status === "conflict-id-path-disagreement") {
      blockers.push({
        severity: "blocker",
        code: "page-id-path-disagreement",
        archivePageId: page.archivePageId,
        canonicalPath: page.canonicalPath,
        archiveIdTid: match.archiveIdTid,
        canonicalPathTid: match.canonicalPathTid,
        canonicalPathTids: match.canonicalPathTids
      });
      return;
    }
    if (match.status === "ambiguous-canonical-path") {
      blockers.push({
        severity: "blocker",
        code: "page-canonical-ambiguous",
        archivePageId: page.archivePageId,
        canonicalPath: page.canonicalPath,
        tids: match.tids
      });
      return;
    }
    if (match.status === "ambiguous-archive-id") {
      blockers.push({
        severity: "blocker",
        code: "page-archive-id-ambiguous",
        archivePageId: page.archivePageId,
        canonicalPath: page.canonicalPath,
        tids: match.tids
      });
      return;
    }

    if (match.status === "matched-archive-id") {
      const destinationPage = findDestinationPageByTid(rows, match.tid) || {};
      const operation = {
        type: "page.update",
        match: "archive-id",
        archivePageId: page.archivePageId,
        canonicalPath: page.canonicalPath,
        tid: match.tid,
        ...destinationPostRef(destinationPage),
        changes: getPageChanges(page, destinationPage, namespacePlans, false)
      };
      pagePlans.set(page.archivePageId, { status: "matched", operation, tid: match.tid });
      operations.push(operation);
      return;
    }

    if (match.status === "matched-canonical-path") {
      const destinationPage = findDestinationPageByTid(rows, match.tid) || {};
      const operation = {
        type: "page.adopt",
        match: "canonical-path",
        archivePageId: page.archivePageId,
        canonicalPath: page.canonicalPath,
        tid: match.tid,
        ...destinationPostRef(destinationPage),
        changes: getPageChanges(page, destinationPage, namespacePlans, true)
      };
      pagePlans.set(page.archivePageId, { status: "adopt", operation, tid: match.tid });
      operations.push(operation);
      return;
    }

    const namespaceRef = targetNamespaceRef(namespacePlans, page.archiveNamespaceId);
    const operation = {
      type: "page.create",
      archivePageId: page.archivePageId,
      archiveNamespaceId: page.archiveNamespaceId,
      canonicalPath: page.canonicalPath,
      title: page.title,
      namespace: namespaceRef
    };
    pagePlans.set(page.archivePageId, { status: "create", operation, tid: 0 });
    operations.push(operation);
  });

  return { operations, blockers, pagePlans };
}

function planAssets(manifest, destination = {}) {
  const destinationAssets = Array.isArray(destination.assets) ? destination.assets : [];
  return manifest.assets.slice()
    .sort((a, b) => compareText(a.path, b.path) || compareText(a.sha256, b.sha256))
    .map((asset) => {
      const match = destinationAssets
        .filter((row) => String(row && row.sha256 || "") === asset.sha256)
        .sort((a, b) => compareText(a && a.path, b && b.path))[0];
      if (match) {
        return {
          type: "asset.reuse",
          assetId: asset.assetId,
          path: asset.path,
          sha256: asset.sha256,
          destinationPath: String(match.path || "")
        };
      }
      return {
        type: "asset.import",
        assetId: asset.assetId,
        path: asset.path,
        sha256: asset.sha256,
        bytes: asset.bytes,
        contentType: asset.contentType
      };
    })
    .sort(sortAssetOperations);
}

function namespacePlacementRow(operation) {
  const meta = placementMeta(operation.canonicalPath);
  return {
    type: "namespace",
    source: "planned",
    archiveNamespaceId: operation.archiveNamespaceId,
    canonicalPath: meta.canonicalPath,
    foldedKey: meta.foldedKey
  };
}

function pagePlacementRow(operation) {
  const meta = placementMeta(operation.canonicalPath);
  return {
    type: "page",
    source: "planned",
    archivePageId: operation.archivePageId,
    tid: asPositiveInt(operation.tid),
    canonicalPath: meta.canonicalPath,
    foldedKey: meta.foldedKey
  };
}

function destinationNamespacePlacementRows(destination = {}) {
  return (Array.isArray(destination.namespaces) ? destination.namespaces : [])
    .map((namespace) => {
      const meta = placementMeta(namespace && namespace.canonicalPath);
      return {
        type: "namespace",
        source: "destination",
        cid: asPositiveInt(namespace && namespace.cid),
        canonicalPath: meta.canonicalPath,
        foldedKey: meta.foldedKey
      };
    })
    .filter((namespace) => namespace.canonicalPath && namespace.foldedKey);
}

function destinationPagePlacementRows(destination = {}) {
  return destinationPageRows(destination)
    .map((page) => {
      const meta = placementMeta(page && page.canonicalPath);
      return {
        type: "page",
        source: "destination",
        tid: asPositiveInt(page && page.tid),
        archivePageId: String(page && page.archivePageId || ""),
        canonicalPath: meta.canonicalPath,
        foldedKey: meta.foldedKey
      };
    })
    .filter((page) => page.canonicalPath && page.foldedKey);
}

function plannedNamespacePlacementRows(namespaceOperations = []) {
  return namespaceOperations
    .filter((operation) => operation.type === "namespace.create")
    .map(namespacePlacementRow)
    .filter((namespace) => namespace.canonicalPath && namespace.foldedKey);
}

function plannedPagePlacementRows(pageOperations = []) {
  return pageOperations
    .filter((operation) => operation.type === "page.create" || operation.type === "page.update" || operation.type === "page.adopt")
    .map(pagePlacementRow)
    .filter((page) => page.canonicalPath && page.foldedKey);
}

function sameNamespacePlacement(left, right) {
  if (left === right) {
    return true;
  }
  if (left.archiveNamespaceId && right.archiveNamespaceId && left.archiveNamespaceId === right.archiveNamespaceId) {
    return true;
  }
  return !!(left.cid && right.cid && left.cid === right.cid);
}

function samePagePlacement(left, right) {
  if (left === right) {
    return true;
  }
  if (left.archivePageId && right.archivePageId && left.archivePageId === right.archivePageId) {
    return true;
  }
  return !!(left.tid && right.tid && left.tid === right.tid);
}

function collisionIds(rows, idField) {
  return rows.map((row) => row[idField]).filter(Boolean).sort((a, b) => a - b);
}

function collisionArchiveIds(rows, idField) {
  return rows.map((row) => row[idField]).filter(Boolean).sort();
}

function namespacePlacementBlocker(namespace, status, matches) {
  const blocker = {
    severity: "blocker",
    code: "namespace-placement-unsafe",
    placementStatus: status,
    archiveNamespaceId: namespace.archiveNamespaceId,
    canonicalPath: namespace.canonicalPath,
    foldedKey: namespace.foldedKey
  };
  const cids = collisionIds(matches, "cid");
  const archiveNamespaceIds = collisionArchiveIds(matches, "archiveNamespaceId");
  const tids = collisionIds(matches, "tid");
  const archivePageIds = collisionArchiveIds(matches, "archivePageId");
  if (cids.length) {
    blocker.cids = cids;
  }
  if (archiveNamespaceIds.length) {
    blocker.archiveNamespaceIds = archiveNamespaceIds;
  }
  if (tids.length) {
    blocker.tids = tids;
  }
  if (archivePageIds.length) {
    blocker.archivePageIds = archivePageIds;
  }
  return blocker;
}

function pagePlacementBlocker(page, status, matches) {
  const blocker = {
    severity: "blocker",
    code: "page-placement-unsafe",
    placementStatus: status,
    archivePageId: page.archivePageId,
    canonicalPath: page.canonicalPath,
    foldedKey: page.foldedKey
  };
  if (page.tid) {
    blocker.tid = page.tid;
  }
  const tids = collisionIds(matches, "tid");
  const archivePageIds = collisionArchiveIds(matches, "archivePageId");
  const cids = collisionIds(matches, "cid");
  const archiveNamespaceIds = collisionArchiveIds(matches, "archiveNamespaceId");
  if (tids.length) {
    blocker.tids = tids;
  }
  if (archivePageIds.length) {
    blocker.archivePageIds = archivePageIds;
  }
  if (cids.length) {
    blocker.cids = cids;
  }
  if (archiveNamespaceIds.length) {
    blocker.archiveNamespaceIds = archiveNamespaceIds;
  }
  return blocker;
}

function validatePlannedPlacements(destination, namespaceOperations, pageOperations) {
  const destinationNamespaces = destinationNamespacePlacementRows(destination);
  const destinationPages = destinationPagePlacementRows(destination);
  const plannedNamespaces = plannedNamespacePlacementRows(namespaceOperations);
  const plannedPages = plannedPagePlacementRows(pageOperations);
  const namespaceRows = destinationNamespaces.concat(plannedNamespaces);
  const pageRows = destinationPages.concat(plannedPages);
  const blockers = [];

  plannedNamespaces.forEach((namespace) => {
    const namespaceMatches = namespaceRows.filter((row) => !sameNamespacePlacement(namespace, row));
    const canonicalMatches = namespaceMatches.filter((row) => row.canonicalPath === namespace.canonicalPath);
    if (canonicalMatches.length) {
      blockers.push(namespacePlacementBlocker(namespace, "namespace-collision", canonicalMatches));
      return;
    }

    const foldedMatches = namespaceMatches.filter((row) => row.foldedKey === namespace.foldedKey);
    if (foldedMatches.length) {
      blockers.push(namespacePlacementBlocker(namespace, "namespace-folded-collision", foldedMatches));
      return;
    }

    // A page at the identical canonical path is a composite index page (legal
    // per the canonical tree contract; wiki-tree-index excludes it the same way).
    const crossFacetMatches = pageRows.filter((row) =>
      row.foldedKey === namespace.foldedKey && row.canonicalPath !== namespace.canonicalPath);
    if (crossFacetMatches.length) {
      blockers.push(namespacePlacementBlocker(namespace, "cross-facet-folded-collision", crossFacetMatches));
    }
  });

  plannedPages.forEach((page) => {
    const pageMatches = pageRows.filter((row) => !samePagePlacement(page, row));
    const canonicalMatches = pageMatches.filter((row) => row.canonicalPath === page.canonicalPath);
    if (canonicalMatches.length) {
      blockers.push(pagePlacementBlocker(page, "page-collision", canonicalMatches));
      return;
    }

    const foldedMatches = pageMatches.filter((row) => row.foldedKey === page.foldedKey);
    if (foldedMatches.length) {
      blockers.push(pagePlacementBlocker(page, "page-folded-collision", foldedMatches));
      return;
    }

    const crossFacetMatches = namespaceRows.filter((row) =>
      row.foldedKey === page.foldedKey && row.canonicalPath !== page.canonicalPath);
    if (crossFacetMatches.length) {
      blockers.push(pagePlacementBlocker(page, "cross-facet-folded-collision", crossFacetMatches));
    }
  });

  return blockers;
}

function normalizeDestinationGroupRows(options = {}) {
  const destination = options.destination || {};
  const configured = Array.isArray(options.destinationGroups) ? options.destinationGroups :
    (Array.isArray(destination.groups) ? destination.groups :
      (Array.isArray(destination.groupNames) ? destination.groupNames : null));
  if (!configured) {
    return null;
  }
  return configured
    .map((group) => typeof group === "string" ? group : group && group.name)
    .map((group) => String(group || "").trim())
    .filter(Boolean);
}

async function resolveNamespaceCreatorGroup(groupName, options = {}) {
  if (typeof options.destinationGroupResolver === "function") {
    const resolved = await options.destinationGroupResolver(groupName);
    return String(resolved || "").trim();
  }

  const destinationGroups = normalizeDestinationGroupRows(options);
  if (!destinationGroups) {
    return null;
  }
  return destinationGroups.includes(groupName) ? groupName : "";
}

async function resolveNamespaceCreatorGroups(snapshot, options = {}) {
  const groups = (Array.isArray(snapshot.namespaceCreatorGroups) ? snapshot.namespaceCreatorGroups : [])
    .map((group) => String(group || "").trim())
    .filter(Boolean)
    .sort();
  const blockers = [];
  const resolvedGroups = [];

  for (const groupName of groups) {
    const resolved = await resolveNamespaceCreatorGroup(groupName, options);
    if (!resolved) {
      blockers.push({
        severity: "blocker",
        code: "settings-namespace-creator-group-unverified",
        groupName
      });
    } else {
      resolvedGroups.push(resolved);
    }
  }

  return { groups: resolvedGroups, blockers };
}

async function planSettings(manifest, namespacePlans, pagePlans, options = {}) {
  const snapshot = manifest.settingsSnapshot || {};
  const blockers = [];
  const categoryRoots = [];

  function resolveNamespaceSettingRef(ref, code) {
    const namespacePlan = namespacePlans.get(ref.archiveNamespaceId);
    if (!namespacePlan) {
      blockers.push({
        severity: "blocker",
        code,
        archiveNamespaceId: ref.archiveNamespaceId,
        canonicalPath: ref.canonicalPath
      });
      return null;
    }
    return {
      archiveNamespaceId: ref.archiveNamespaceId,
      canonicalPath: ref.canonicalPath,
      cid: namespacePlan.cid || 0,
      planned: !namespacePlan.cid
    };
  }

  (Array.isArray(snapshot.categoryRoots) ? snapshot.categoryRoots : []).forEach((root) => {
    const categoryRoot = resolveNamespaceSettingRef(root, "settings-category-root-unsafe");
    if (!categoryRoot) {
      return;
    }
    categoryRoots.push({
      archiveNamespaceId: categoryRoot.archiveNamespaceId,
      canonicalPath: categoryRoot.canonicalPath,
      includeDescendants: root.includeDescendants,
      cid: categoryRoot.cid,
      planned: categoryRoot.planned
    });
  });

  const routeRoot = snapshot.routeRoot ?
    resolveNamespaceSettingRef(snapshot.routeRoot, "settings-route-root-unsafe") :
    null;

  let homepage = null;
  if (snapshot.homepage) {
    const archivePageId = snapshot.homepage.archivePageId;
    const pagePlan = pagePlans.get(archivePageId);
    if (!pagePlan) {
      blockers.push({
        severity: "blocker",
        code: "settings-homepage-unsafe",
        archivePageId
      });
    } else {
      homepage = {
        archivePageId,
        tid: pagePlan.tid || 0,
        planned: !pagePlan.tid
      };
    }
  }

  const groupPlan = await resolveNamespaceCreatorGroups(snapshot, options);
  blockers.push(...groupPlan.blockers);

  if (blockers.length) {
    return { operations: [], blockers };
  }

  return {
    blockers: [],
    operations: [{
      type: "settings.preview",
      includeChildCategories: snapshot.includeChildCategories,
      categoryRoots,
      homepage,
      routeRoot,
      namespaceCreatorGroups: groupPlan.groups
    }]
  };
}

async function previewArchive(options = {}) {
  const validation = archiveManifest.validateManifest(options.manifest, {
    files: options.files,
    policy: options.policy
  });
  const manifest = validation.manifest;
  const warnings = manifestWarnings(manifest);
  const files = options.files || {};
  validateContent(manifest, files, options);
  const canonicalDiagnostics = await assertCanonicalDiagnostics(options);

  const destination = options.destination || {};
  const namespacePlan = planNamespaces(manifest, destination);
  const pagePlan = planPages(manifest, destination, namespacePlan.namespacePlans);
  const assetOperations = planAssets(manifest, destination);
  const placementBlockers = validatePlannedPlacements(destination, namespacePlan.operations, pagePlan.operations);
  const settingsPlan = options.includeSettings ? await planSettings(manifest, namespacePlan.namespacePlans, pagePlan.pagePlans, options) : {
    operations: [],
    blockers: []
  };

  const blockers = namespacePlan.blockers
    .concat(pagePlan.blockers)
    .concat(placementBlockers)
    .concat(settingsPlan.blockers)
    .sort(sortBlockers);
  const operations = namespacePlan.operations
    .concat(pagePlan.operations)
    .concat(assetOperations)
    .concat(settingsPlan.operations);

  return {
    status: blockers.length ? "blocked" : "ok",
    canonicalDiagnostics,
    blockers,
    warnings,
    operations
  };
}

module.exports = {
  previewArchive
};
