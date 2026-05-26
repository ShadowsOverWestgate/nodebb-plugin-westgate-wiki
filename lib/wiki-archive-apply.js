"use strict";

const crypto = require("node:crypto");

const { JSDOM } = require("jsdom");

const archiveAssets = require("./wiki-archive-assets");
const archiveImport = require("./wiki-archive-import");
const archiveManifest = require("./wiki-archive-manifest");
const { PORTABLE_TOPIC_FIELD } = require("./wiki-archive-schema");
const wikiTopicMutations = require("./wiki-topic-mutations");

const REWRITE_ATTRS = [
  ["img", "src"],
  ["source", "src"],
  ["a", "href"]
];

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

function getFileBuffer(files, archivePath) {
  const value = getFileValue(files, archivePath);
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return null;
  }
  return Buffer.from(String(value));
}

function getFileText(files, archivePath) {
  const buffer = getFileBuffer(files, archivePath);
  return buffer ? buffer.toString("utf8") : "";
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizePathReference(reference) {
  const value = String(reference || "").trim();
  if (!value) {
    return "";
  }
  try {
    return new URL(value, "http://westgate.local").pathname || "";
  } catch (err) {
    return value.split(/[?#]/)[0];
  }
}

function splitSuffix(reference) {
  const value = String(reference || "");
  const hashIndex = value.indexOf("#");
  const queryIndex = value.indexOf("?");
  const indexes = [hashIndex, queryIndex].filter((index) => index >= 0);
  if (!indexes.length) {
    return "";
  }
  return value.slice(Math.min(...indexes));
}

function resolveService(services, path, code) {
  const parts = path.split(".");
  let current = services;
  for (const part of parts) {
    current = current && current[part];
  }
  if (typeof current !== "function") {
    throw makeError(code || "archive-apply-service-unavailable", `archive-apply-service-unavailable: ${path}`);
  }
  return current;
}

function assertApprovedPreview(preview) {
  if (!preview) {
    throw makeError("archive-apply-preview-required");
  }
  if (preview.status === "blocked" || (Array.isArray(preview.blockers) && preview.blockers.length)) {
    const err = makeError("archive-apply-preview-blocked");
    err.blockers = preview.blockers || [];
    throw err;
  }
  if (preview.approved !== true && !(preview.approval && preview.approval.status === "approved")) {
    throw makeError("archive-apply-preview-not-approved");
  }
  if (!Array.isArray(preview.operations)) {
    throw makeError("archive-apply-preview-invalid");
  }
}

function previewOperationFingerprint(preview, includePreviewSettings) {
  const operations = (preview.operations || []).filter((operation) => {
    return includePreviewSettings || operation.type !== "settings.preview";
  });
  return stableJson({
    status: preview.status,
    blockers: preview.blockers || [],
    operations
  });
}

async function assertPreviewCurrent(options, manifest) {
  const preview = options.preview;
  const includePreviewSettings = preview.operations.some((operation) => operation.type === "settings.preview");
  const fresh = await archiveImport.previewArchive({
    manifest,
    files: options.files,
    canonicalDiagnostics: options.canonicalDiagnostics,
    destination: options.destination || {},
    destinationGroups: options.destinationGroups,
    destinationGroupResolver: options.destinationGroupResolver,
    includeSettings: includePreviewSettings,
    policy: options.policy,
    articleCss: options.articleCss
  });

  if (fresh.status !== "ok" ||
    previewOperationFingerprint(fresh, includePreviewSettings) !== previewOperationFingerprint(preview, includePreviewSettings)) {
    const err = makeError("archive-apply-preview-stale");
    err.preview = fresh;
    throw err;
  }
}

function sortApplyOperations(operations) {
  const weight = {
    "asset.reuse": 10,
    "asset.import": 11,
    "namespace.match": 20,
    "namespace.create": 21,
    "page.update": 30,
    "page.adopt": 31,
    "page.create": 32,
    "settings.preview": 40
  };
  return operations.slice().sort((a, b) => {
    const left = weight[a.type] || 100;
    const right = weight[b.type] || 100;
    return left - right;
  });
}

function findManifestAsset(manifest, assetId) {
  return manifest.assets.find((asset) => asset.assetId === assetId) || null;
}

function findManifestPage(manifest, archivePageId) {
  return manifest.pages.find((page) => page.archivePageId === archivePageId) || null;
}

function createInitialReport() {
  return {
    status: "completed",
    results: [],
    maps: {
      assets: {},
      namespaces: {},
      pages: {}
    }
  };
}

function resultBase(operation) {
  const result = {
    status: "completed",
    type: operation.type
  };
  if (operation.archiveNamespaceId) {
    result.archiveNamespaceId = operation.archiveNamespaceId;
  }
  if (operation.archivePageId) {
    result.archivePageId = operation.archivePageId;
  }
  if (operation.assetId) {
    result.assetId = operation.assetId;
  }
  if (operation.canonicalPath) {
    result.canonicalPath = operation.canonicalPath;
  }
  return result;
}

function recordFailure(report, operation, err) {
  report.status = "failed";
  report.results.push({
    ...resultBase(operation),
    status: "failed",
    code: err && err.code || "archive-apply-operation-failed",
    message: err && err.message || String(err)
  });
}

async function applyAssetOperation(operation, context) {
  const { manifest, files, report, services, uid } = context;
  const asset = findManifestAsset(manifest, operation.assetId);
  if (!asset) {
    throw makeError("archive-apply-asset-missing");
  }

  let destinationPath = operation.destinationPath || "";
  if (!destinationPath && services.assets && typeof services.assets.findBySha256 === "function") {
    const existing = await services.assets.findBySha256(asset.sha256);
    destinationPath = String(existing && (existing.path || existing.destinationPath) || "");
  }

  if (destinationPath) {
    report.maps.assets[asset.assetId] = destinationPath;
    report.results.push({
      ...resultBase(operation),
      status: operation.type === "asset.reuse" ? "already-applied" : "skipped",
      destinationPath
    });
    return;
  }

  const buffer = getFileBuffer(files, asset.path);
  if (!buffer) {
    throw makeError("archive-apply-asset-file-missing");
  }
  if (buffer.length !== asset.bytes || hashBuffer(buffer) !== asset.sha256) {
    throw makeError("archive-apply-asset-checksum-mismatch");
  }

  const importAsset = resolveService(services, "assets.importAsset");
  const imported = await importAsset({ asset, buffer, uid });
  destinationPath = String(imported && (imported.path || imported.destinationPath || imported.url) || imported || "");
  if (!destinationPath) {
    throw makeError("archive-apply-asset-path-missing");
  }

  report.maps.assets[asset.assetId] = destinationPath;
  report.results.push({
    ...resultBase(operation),
    destinationPath
  });
}

async function applyNamespaceOperation(operation, context) {
  const { report, services, uid } = context;
  if (operation.type === "namespace.match") {
    report.maps.namespaces[operation.archiveNamespaceId] = operation.cid;
    report.results.push({
      ...resultBase(operation),
      status: "already-applied",
      cid: operation.cid
    });
    return;
  }

  const parentCid = operation.parentCid ||
    (operation.parentArchiveNamespaceId ? report.maps.namespaces[operation.parentArchiveNamespaceId] : 0);
  if (operation.parentArchiveNamespaceId && !parentCid) {
    throw makeError("archive-apply-namespace-parent-unresolved");
  }

  requireNamespaceInvalidationServices(services);
  const createNamespace = resolveService(services, "namespaces.createNamespace");
  const created = await createNamespace({
    archiveNamespaceId: operation.archiveNamespaceId,
    canonicalPath: operation.canonicalPath,
    titlePath: operation.titlePath || [],
    name: Array.isArray(operation.titlePath) && operation.titlePath.length ?
      operation.titlePath[operation.titlePath.length - 1] :
      String(operation.canonicalPath || "").split("/").filter(Boolean).pop() || "Wiki",
    parentCid,
    uid,
    operation
  });
  const cid = parseInt(created && created.cid || created, 10) || 0;
  if (!cid) {
    throw makeError("archive-apply-namespace-cid-missing");
  }

  report.maps.namespaces[operation.archiveNamespaceId] = cid;
  report.results.push({
    ...resultBase(operation),
    cid
  });
  await invalidateNamespaceMutation(services, { cid });
}

function assetReferenceMap(manifest, assetMap) {
  const references = new Map();
  manifest.assets.forEach((asset) => {
    const destination = assetMap[asset.assetId];
    if (!destination) {
      return;
    }
    references.set(normalizePathReference(asset.path), destination);
    (Array.isArray(asset.sourceReferences) ? asset.sourceReferences : []).forEach((reference) => {
      references.set(normalizePathReference(reference), destination);
    });
  });
  return references;
}

function rewriteArticleHtml(html, manifest, assetMap) {
  const references = assetReferenceMap(manifest, assetMap);
  if (!references.size) {
    return String(html || "");
  }

  const dom = new JSDOM(`<body>${String(html || "")}</body>`);
  const document = dom.window.document;
  REWRITE_ATTRS.forEach(([selector, attr]) => {
    document.querySelectorAll(selector).forEach((node) => {
      const source = String(node.getAttribute(attr) || "").trim();
      if (!source ||
        archiveAssets.isRemoteReference(source) ||
        archiveAssets.isUnsupportedSchemeReference(source) ||
        !archiveAssets.isLocalUploadReference(source)) {
        return;
      }
      const destination = references.get(normalizePathReference(source));
      if (destination) {
        node.setAttribute(attr, `${destination}${splitSuffix(source)}`);
      }
    });
  });
  return document.body.innerHTML;
}

function resolvePageCid(page, operation, report) {
  if (operation.namespace && operation.namespace.cid) {
    return operation.namespace.cid;
  }
  if (operation.namespace && operation.namespace.archiveNamespaceId) {
    return report.maps.namespaces[operation.namespace.archiveNamespaceId] || 0;
  }
  if (operation.changes && operation.changes.category) {
    if (operation.changes.category.to) {
      return operation.changes.category.to;
    }
    if (operation.changes.category.toArchiveNamespaceId) {
      return report.maps.namespaces[operation.changes.category.toArchiveNamespaceId] || 0;
    }
  }
  return report.maps.namespaces[page.archiveNamespaceId] || 0;
}

function resolveArchiveIdPersister(services) {
  if (services.identity && typeof services.identity.setPageArchiveId === "function") {
    return async (tid, archivePageId) => services.identity.setPageArchiveId(tid, archivePageId, { topics: services.topics });
  }
  const setTopicField = resolveService(services, "topics.setTopicField", "archive-apply-archive-id-service-unavailable");
  return async (tid, archivePageId) => setTopicField(tid, PORTABLE_TOPIC_FIELD, archivePageId);
}

async function saveCreatedPage(services, payload) {
  const createPage = resolveService(services, "pages.createPage");
  const created = await createPage(payload);
  return normalizePageMutationResult(created, payload);
}

async function saveUpdatedPage(services, payload) {
  if (services.pages && typeof services.pages.updatePage === "function") {
    const updated = await services.pages.updatePage(payload);
    return resolvePageMutationResult(updated, payload, services);
  }

  const mainPid = await resolveMainPidBeforeFallbackMove(services, payload);
  if (payload.cid && payload.previousCid && payload.cid !== payload.previousCid &&
    services.topics && services.topics.tools && typeof services.topics.tools.move === "function") {
    await wikiTopicMutations.withManagedMutationContext(() => services.topics.tools.move(
      payload.tid,
      wikiTopicMutations.markManagedMutation({ cid: payload.cid, uid: payload.uid })
    ));
  }

  const edit = resolveService(services, "posts.edit");
  await edit(wikiTopicMutations.managedPostEditPayload({
    pid: mainPid,
    uid: payload.uid,
    title: payload.title,
    content: payload.content,
    sourceContent: payload.content
  }));
  if (services.posts && typeof services.posts.setPostFields === "function") {
    await services.posts.setPostFields(mainPid, {
      content: payload.content,
      sourceContent: payload.content
    });
  }
  if (services.posts && typeof services.posts.clearCachedPost === "function") {
    services.posts.clearCachedPost(String(mainPid));
  }
  return { tid: payload.tid, pid: mainPid, cid: payload.cid || payload.previousCid || 0 };
}

async function resolveMainPidBeforeFallbackMove(services, payload) {
  const fromPayload = parseInt(payload.pid || payload.mainPid, 10) || 0;
  if (fromPayload) {
    return fromPayload;
  }
  const getTopicField = resolveService(services, "topics.getTopicField", "archive-apply-page-pid-lookup-service-unavailable");
  const mainPid = parseInt(await getTopicField(payload.tid, "mainPid"), 10) || 0;
  if (!mainPid) {
    throw makeError("archive-apply-page-pid-missing");
  }
  return mainPid;
}

function normalizePageMutationResult(result, payload) {
  const tid = parseInt(result && result.tid || payload.tid, 10) || 0;
  const pid = parseInt(result && (result.pid || result.mainPid) || payload.pid, 10) || 0;
  const cid = parseInt(result && result.cid || payload.cid, 10) || 0;
  if (!tid || !pid) {
    throw makeError("archive-apply-page-result-invalid");
  }
  return { tid, pid, cid };
}

async function resolvePageMutationResult(result, payload, services) {
  const tid = parseInt(result && result.tid || payload.tid, 10) || 0;
  let pid = parseInt(result && (result.pid || result.mainPid) || payload.pid || payload.mainPid, 10) || 0;
  const cid = parseInt(result && result.cid || payload.cid, 10) || 0;
  if (!tid) {
    throw makeError("archive-apply-page-result-invalid");
  }
  if (!pid) {
    const getTopicField = resolveService(services, "topics.getTopicField", "archive-apply-page-pid-lookup-service-unavailable");
    pid = parseInt(await getTopicField(tid, "mainPid"), 10) || 0;
  }
  if (!pid) {
    throw makeError("archive-apply-page-pid-missing");
  }
  return { tid, pid, cid };
}

async function applyPageOperation(operation, context) {
  const { manifest, files, report, services, uid } = context;
  const page = findManifestPage(manifest, operation.archivePageId);
  if (!page) {
    throw makeError("archive-apply-page-missing");
  }

  const cid = resolvePageCid(page, operation, report);
  if (!cid) {
    throw makeError("archive-apply-page-namespace-unresolved");
  }

  const setArticleCss = resolveService(
    services,
    "articleCss.setArticleCss",
    "archive-apply-article-css-service-unavailable"
  );
  const setDiscussionDisabled = resolveService(
    services,
    "discussionSettings.setDiscussionDisabled",
    "archive-apply-discussion-settings-service-unavailable"
  );
  const syncPostUploads = resolveService(
    services,
    "uploadAssociations.syncPostUploads",
    "archive-apply-upload-associations-service-unavailable"
  );
  requirePageInvalidationServices(services);
  const persistPageArchiveId = resolveArchiveIdPersister(services);

  const html = rewriteArticleHtml(getFileText(files, page.articleHtmlPath), manifest, report.maps.assets);
  const payload = {
    uid,
    tid: operation.tid,
    pid: operation.pid,
    mainPid: operation.mainPid,
    cid,
    previousCid: operation.changes && operation.changes.category && operation.changes.category.from || 0,
    title: page.title,
    content: html,
    sourceContent: html,
    archivePageId: page.archivePageId,
    canonicalPath: page.canonicalPath,
    operation
  };
  const saved = operation.type === "page.create" ?
    await saveCreatedPage(services, payload) :
    await saveUpdatedPage(services, payload);

  await persistPageArchiveId(saved.tid, page.archivePageId);
  await setArticleCss(saved.tid, page.articleCss || "");
  await setDiscussionDisabled(saved.tid, !!page.discussionDisabled);
  await syncPostUploads({
    pid: saved.pid,
    tid: saved.tid,
    html,
    uid
  });

  report.maps.pages[page.archivePageId] = saved;
  report.results.push({
    ...resultBase(operation),
    tid: saved.tid,
    pid: saved.pid,
    cid: saved.cid
  });
  await invalidatePageMutation(services, {
    tid: saved.tid,
    pid: saved.pid,
    cid: saved.cid,
    previousCid: payload.previousCid
  });
}

function mapSettingsOperation(operation, report) {
  const routeRoot = operation.routeRoot || null;
  return {
    includeChildCategories: !!operation.includeChildCategories,
    categoryRoots: (Array.isArray(operation.categoryRoots) ? operation.categoryRoots : []).map((root) => ({
      archiveNamespaceId: root.archiveNamespaceId,
      canonicalPath: root.canonicalPath,
      includeDescendants: !!root.includeDescendants,
      cid: root.cid || report.maps.namespaces[root.archiveNamespaceId] || 0
    })),
    homepage: operation.homepage ? {
      archivePageId: operation.homepage.archivePageId,
      tid: operation.homepage.tid || (report.maps.pages[operation.homepage.archivePageId] &&
        report.maps.pages[operation.homepage.archivePageId].tid) || 0
    } : null,
    routeRootCid: routeRoot ? routeRoot.cid || report.maps.namespaces[routeRoot.archiveNamespaceId] || 0 : 0,
    namespaceCreatorGroups: Array.isArray(operation.namespaceCreatorGroups) ? operation.namespaceCreatorGroups.slice() : []
  };
}

async function applySettingsOperation(operation, context) {
  const { report, services, uid } = context;
  const applySettings = resolveService(services, "settings.applySettings", "archive-apply-settings-service-unavailable");
  requireSettingsInvalidationServices(services);
  const settings = mapSettingsOperation(operation, report);
  if (settings.categoryRoots.some((root) => !root.cid) ||
    (operation.routeRoot && !settings.routeRootCid) ||
    (settings.homepage && !settings.homepage.tid)) {
    throw makeError("archive-apply-settings-mapping-unresolved");
  }
  await applySettings(settings, { uid });
  report.results.push({
    status: "completed",
    type: operation.type
  });
  await invalidateGlobalMutation(services);
}

function requireNamespaceInvalidationServices(services) {
  resolveService(services, "invalidation.invalidateNamespace", "archive-apply-invalidate-namespace-service-unavailable");
  resolveService(services, "invalidation.invalidateListing", "archive-apply-invalidate-listing-service-unavailable");
  resolveService(services, "invalidation.invalidateWikiTreeIndex", "archive-apply-invalidate-tree-service-unavailable");
}

function requirePageInvalidationServices(services) {
  requireNamespaceInvalidationServices(services);
  resolveService(services, "invalidation.invalidateContent", "archive-apply-invalidate-content-service-unavailable");
  resolveService(services, "invalidation.invalidateSearch", "archive-apply-invalidate-search-service-unavailable");
}

function requireSettingsInvalidationServices(services) {
  resolveService(services, "invalidation.invalidateWikiTreeIndex", "archive-apply-invalidate-tree-service-unavailable");
}

async function invalidateNamespaceMutation(services, payload) {
  requireNamespaceInvalidationServices(services);
  await services.invalidation.invalidateNamespace(payload.cid);
  await services.invalidation.invalidateListing(payload);
  await invalidateGlobalMutation(services);
}

async function invalidatePageMutation(services, payload) {
  requirePageInvalidationServices(services);
  await services.invalidation.invalidateNamespace(payload.cid);
  if (payload.previousCid && payload.previousCid !== payload.cid) {
    await services.invalidation.invalidateNamespace(payload.previousCid);
  }
  await services.invalidation.invalidateContent(payload);
  await services.invalidation.invalidateSearch(payload);
  await services.invalidation.invalidateListing(payload);
  await invalidateGlobalMutation(services);
}

async function invalidateGlobalMutation(services) {
  const invalidateWikiTreeIndex = resolveService(
    services,
    "invalidation.invalidateWikiTreeIndex",
    "archive-apply-invalidate-tree-service-unavailable"
  );
  await invalidateWikiTreeIndex({ reason: "archive-import-apply" });
}

async function applyOperation(operation, context) {
  if (operation.type === "asset.reuse" || operation.type === "asset.import") {
    return applyAssetOperation(operation, context);
  }
  if (operation.type === "namespace.match" || operation.type === "namespace.create") {
    return applyNamespaceOperation(operation, context);
  }
  if (operation.type === "page.create" || operation.type === "page.update" || operation.type === "page.adopt") {
    return applyPageOperation(operation, context);
  }
  if (operation.type === "settings.preview") {
    if (context.includeSettings) {
      return applySettingsOperation(operation, context);
    }
    context.report.results.push({
      status: "skipped",
      type: operation.type,
      code: "archive-apply-settings-not-requested"
    });
  }
}

async function applyArchive(options = {}) {
  assertApprovedPreview(options.preview);
  const validation = archiveManifest.validateManifest(options.manifest, {
    files: options.files,
    policy: options.policy
  });
  const manifest = validation.manifest;
  await assertPreviewCurrent(options, manifest);

  const report = createInitialReport();
  const context = {
    manifest,
    files: options.files || {},
    report,
    services: options.services || {},
    uid: parseInt(options.uid, 10) || 0,
    includeSettings: options.includeSettings === true
  };

  for (const operation of sortApplyOperations(options.preview.operations)) {
    try {
      await applyOperation(operation, context);
    } catch (err) {
      recordFailure(report, operation, err);
      break;
    }
  }

  return report;
}

module.exports = {
  applyArchive,
  rewriteArticleHtml
};
