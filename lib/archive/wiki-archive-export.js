"use strict";

const crypto = require("node:crypto");

const archiveAssets = require("./wiki-archive-assets");
const archiveIdentity = require("./wiki-archive-identity");
const archiveManifest = require("./wiki-archive-manifest");
const archiveSchema = require("./wiki-archive-schema");
const archiveZip = require("./wiki-archive-zip");
const migration = require("../tree/wiki-canonical-diagnostics");
const wikiTreeIndex = require("../tree/wiki-tree-index");
const wikiHtmlSanitizer = require("../content/wiki-html-sanitizer");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

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

function archiveNamespaceId(canonicalPath) {
  return `wgan_${sha256(String(canonicalPath || "")).slice(0, 32)}`;
}

function hasBlockingDiagnostics(verify) {
  return !!(
    verify &&
    (
      verify.status && verify.status !== "ok" ||
      verify.status === "blocking" ||
      verify.treeIndex && verify.treeIndex.status === "blocking" ||
      parseInt(verify.treeIndex && verify.treeIndex.blockingErrors, 10) > 0 ||
      parseInt(verify.summary && verify.summary.blockingErrors, 10) > 0
    )
  );
}

async function verifyCanonicalDiagnostics(options = {}, exportInput = {}) {
  const verifier = options.migration && typeof options.migration.verify === "function" ?
    options.migration :
    migration;
  const report = await verifier.verify(options.migrationInput || exportInput || {});
  if (hasBlockingDiagnostics(report)) {
    const err = new Error("archive-export-blocked-by-canonical-diagnostics");
    err.report = report;
    throw err;
  }
  return report;
}

function hasExplicitTreeInput(options = {}) {
  return !!(
    options.tree ||
    Object.prototype.hasOwnProperty.call(options, "categories") ||
    Object.prototype.hasOwnProperty.call(options, "topics")
  );
}

async function collectExportInput(options = {}) {
  if (hasExplicitTreeInput(options)) {
    return options;
  }

  const runtimeService = options.migration && typeof options.migration.collectRuntimeInput === "function" ?
    options.migration :
    migration;
  if (!runtimeService || typeof runtimeService.collectRuntimeInput !== "function") {
    return options;
  }

  const runtimeInput = await runtimeService.collectRuntimeInput();
  return {
    ...options,
    ...runtimeInput,
    posts: options.posts,
    topicFieldsApi: options.topicFieldsApi,
    topicsApi: options.topicsApi,
    articleCss: options.articleCss,
    discussionSettings: options.discussionSettings,
    uploadStore: options.uploadStore,
    idFactory: options.idFactory,
    migration: options.migration,
    settings: runtimeInput.settings
  };
}

function getTree(options = {}) {
  if (options.tree) {
    return options.tree;
  }
  return wikiTreeIndex.createWikiTreeIndex({
    categories: options.categories || [],
    topics: options.topics || [],
    settings: options.settings || {},
    routeRootCid: options.routeRootCid,
    canReadTopic: options.canReadTopic,
    canViewCategory: options.canViewCategory
  });
}

function getTreeState(tree) {
  if (!tree || typeof tree.getState !== "function") {
    throw new Error("archive-export-canonical-tree-unavailable");
  }
  return tree.getState();
}

function namespaceParentPath(namespace) {
  const segments = Array.isArray(namespace && namespace.segments) ? namespace.segments : [];
  if (segments.length <= 1) {
    return "";
  }
  return segments.slice(0, -1).join("/");
}

function namespaceTitlePath(namespace) {
  const segments = Array.isArray(namespace && namespace.segments) ? namespace.segments : [];
  if (segments.length) {
    return segments.slice();
  }
  const title = String(namespace && namespace.category && namespace.category.name || "").trim();
  return title ? [title] : [];
}

function collectNamespaces(state) {
  const namespaces = Array.from(state.namespaceByCid.values())
    .filter((namespace) => namespace && !(namespace.invalidSegments || []).length)
    .sort((a, b) => compareText(a.canonicalPath, b.canonicalPath) || a.cid - b.cid);
  const idByCanonicalPath = new Map();

  namespaces.forEach((namespace) => {
    idByCanonicalPath.set(namespace.canonicalPath, archiveNamespaceId(namespace.canonicalPath));
  });

  return {
    idByCanonicalPath,
    idByCid: new Map(namespaces.map((namespace) => [namespace.cid, idByCanonicalPath.get(namespace.canonicalPath)])),
    canonicalPathByCid: new Map(namespaces.map((namespace) => [namespace.cid, namespace.canonicalPath])),
    records: namespaces.map((namespace) => {
      const parentPath = namespaceParentPath(namespace);
      return {
        archiveNamespaceId: idByCanonicalPath.get(namespace.canonicalPath),
        parentArchiveNamespaceId: parentPath ? idByCanonicalPath.get(parentPath) || null : null,
        canonicalPath: namespace.canonicalPath,
        titlePath: namespaceTitlePath(namespace)
      };
    })
  };
}

async function getFirstPostHtml(topic, options = {}) {
  const mainPid = parseInt(topic && topic.mainPid, 10);
  if (mainPid && options.posts && typeof options.posts.getPostFields === "function") {
    const post = await options.posts.getPostFields(mainPid, ["content", "sourceContent"]);
    return String(post && (post.sourceContent || post.content) || "");
  }
  if (topic && topic.mainPost) {
    return String(topic.mainPost.sourceContent || topic.mainPost.content || "");
  }
  return String(topic && (topic.sourceContent || topic.content) || "");
}

function sanitizeArchiveHtml(html) {
  return wikiHtmlSanitizer.sanitizeWikiHtml(html);
}

async function getArticleCss(tid, options = {}) {
  const service = options.articleCss || require("../content/wiki-article-css");
  const css = service && typeof service.getArticleCss === "function" ? String(await service.getArticleCss(tid) || "") : "";
  if (service && typeof service.sanitizeArticleCss === "function") {
    return service.sanitizeArticleCss(css);
  }
  try {
    const wikiArticleCss = require("../content/wiki-article-css");
    if (wikiArticleCss && typeof wikiArticleCss.sanitizeArticleCss === "function") {
      return wikiArticleCss.sanitizeArticleCss(css);
    }
  } catch (err) {
    // Pure archive export tests can run without a NodeBB require.main.
  }
  return css.trim();
}

async function getDiscussionDisabled(tid, options = {}) {
  const service = options.discussionSettings || require("../read/wiki-discussion-settings");
  return service && typeof service.getDiscussionDisabled === "function" ? !!await service.getDiscussionDisabled(tid) : false;
}

function getPageTitle(page) {
  return String(page && page.topic && (page.topic.titleRaw || page.topic.title) || "");
}

async function collectPages(state, namespaceIds, options = {}) {
  const pages = Array.from(state.pageByTid.values())
    .filter((page) => page && page.tid && page.canonicalPath && page.namespace && namespaceIds.idByCid.has(page.cid))
    .sort((a, b) => compareText(a.canonicalPath, b.canonicalPath) || a.tid - b.tid);
  const records = [];
  const files = new Map();
  const pagesForAssets = [];
  const archivePageIdByTid = new Map();

  for (const page of pages) {
    const archivePageId = await archiveIdentity.getOrCreatePageArchiveId(page.tid, {
      topics: options.topicFieldsApi || options.topicsApi,
      idFactory: options.idFactory
    });
    archivePageIdByTid.set(page.tid, archivePageId);

    const articleHtml = sanitizeArchiveHtml(await getFirstPostHtml(page.topic, options));
    const articleHtmlPath = archiveManifest.getPageHtmlPath(archivePageId);
    files.set(articleHtmlPath, articleHtml);
    pagesForAssets.push({
      archivePageId,
      canonicalPath: page.canonicalPath,
      articleHtml
    });

    records.push({
      archivePageId,
      archiveNamespaceId: namespaceIds.idByCid.get(page.cid),
      canonicalPath: page.canonicalPath,
      title: getPageTitle(page),
      articleHtmlPath,
      articleCss: await getArticleCss(page.tid, options),
      discussionDisabled: await getDiscussionDisabled(page.tid, options),
      topdata: {
        managedMarkerPreserved: /<!--\s*sow-topdata-wiki:page=/i.test(articleHtml)
      }
    });
  }

  return {
    archivePageIdByTid,
    files,
    pagesForAssets,
    records
  };
}

async function getSettings(options = {}) {
  if (options.settings) {
    return options.settings;
  }
  if (options.settingsService && typeof options.settingsService.getSettings === "function") {
    return options.settingsService.getSettings({ bustCache: true });
  }
  const config = require("../core/config");
  return config.getSettings({ bustCache: true });
}

function buildSettingsSnapshot(settings, namespaceIds, archivePageIdByTid) {
  const includeChildCategories = settings.includeChildCategories !== false;
  const categoryRoots = (Array.isArray(settings.categoryIds) ? settings.categoryIds : [])
    .map((cid) => {
      const archiveNamespaceId = namespaceIds.idByCid.get(parseInt(cid, 10));
      if (!archiveNamespaceId) {
        return null;
      }
      const canonicalPath = namespaceIds.canonicalPathByCid.get(parseInt(cid, 10)) || "";
      return {
        archiveNamespaceId,
        canonicalPath,
        includeDescendants: includeChildCategories
      };
    })
    .filter(Boolean)
    .sort((a, b) => compareText(a.canonicalPath, b.canonicalPath));
  const homeTid = parseInt(settings.homeTopicId, 10);
  const homepageArchivePageId = homeTid ? archivePageIdByTid.get(homeTid) : "";
  const routeRootCid = parseInt(settings.routeRootCid, 10);
  const routeRootArchiveNamespaceId = Number.isInteger(routeRootCid) && routeRootCid > 0 ?
    namespaceIds.idByCid.get(routeRootCid) :
    "";

  return {
    categoryRoots,
    includeChildCategories,
    homepage: homepageArchivePageId ? { archivePageId: homepageArchivePageId } : null,
    routeRoot: routeRootArchiveNamespaceId ? {
      archiveNamespaceId: routeRootArchiveNamespaceId,
      canonicalPath: namespaceIds.canonicalPathByCid.get(routeRootCid) || ""
    } : null,
    namespaceCreatorGroups: (Array.isArray(settings.wikiNamespaceCreateGroups) ? settings.wikiNamespaceCreateGroups : [])
      .map((group) => String(group || "").trim())
      .filter(Boolean)
      .sort()
  };
}

function getExporter() {
  let version = "0.0.0";
  try {
    version = require("../../package.json").version || version;
  } catch (err) {
    // Tests and embedded plugin runtime can still produce deterministic exports.
  }
  return {
    plugin: "nodebb-plugin-westgate-wiki",
    version
  };
}

function checksumRecord(archivePath, value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return {
    path: archivePath,
    bytes: buffer.length,
    sha256: sha256(buffer)
  };
}

function mergeFiles(...maps) {
  const files = new Map();
  maps.forEach((map) => {
    map.forEach((value, key) => {
      files.set(key, value);
    });
  });
  return files;
}

function sortReports(a, b) {
  return compareText(a.severity, b.severity) ||
    compareText(a.code, b.code) ||
    compareText(a.path, b.path) ||
    compareText(a.sourceReference, b.sourceReference);
}

async function collectExport(options = {}) {
  const exportInput = await collectExportInput(options);
  const canonicalDiagnostics = await verifyCanonicalDiagnostics(options, exportInput);
  const tree = getTree(exportInput);
  const state = getTreeState(tree);
  const namespaceRecords = collectNamespaces(state);
  const pageRecords = await collectPages(state, namespaceRecords, exportInput);
  if (archiveAssets.hasLocalUploadReferences(pageRecords.pagesForAssets) &&
    !(exportInput.uploadStore && typeof exportInput.uploadStore.readLocalUpload === "function")) {
    throw new Error("archive-export-upload-store-unavailable");
  }
  const assetResult = await archiveAssets.collectAssetsFromPages(pageRecords.pagesForAssets, {
    uploadStore: exportInput.uploadStore
  });

  pageRecords.records.forEach((page) => {
    page.assetIds = assetResult.pageAssetIds.get(page.archivePageId) || [];
  });

  const reports = pageRecords.records.map((page) => ({
    severity: "info",
    code: "exported-page",
    path: page.canonicalPath,
    message: "Page exported"
  })).concat(assetResult.reports).sort(sortReports);
  const reportPath = archiveManifest.getReportPath("export-summary");
  const reportJson = `${JSON.stringify({ reports }, null, 2)}\n`;
  const reportFiles = new Map([[reportPath, reportJson]]);
  const files = mergeFiles(pageRecords.files, assetResult.files, reportFiles);
  const checksums = Array.from(files.entries())
    .map(([archivePath, value]) => checksumRecord(archivePath, value))
    .sort((a, b) => compareText(a.path, b.path));

  const manifest = archiveManifest.normalizeManifest({
    schemaId: archiveSchema.ARCHIVE_SCHEMA_ID,
    formatId: archiveSchema.ARCHIVE_FORMAT_ID,
    version: archiveSchema.ARCHIVE_FORMAT_VERSION,
    canonicalPathContractVersion: archiveSchema.CANONICAL_PATH_CONTRACT_VERSION,
    exporter: getExporter(),
    checksums,
    namespaces: namespaceRecords.records,
    pages: pageRecords.records,
    assets: assetResult.assets,
    settingsSnapshot: buildSettingsSnapshot(await getSettings(exportInput), namespaceRecords, pageRecords.archivePageIdByTid),
    reports
  });

  return {
    status: "ok",
    canonicalDiagnostics,
    manifest,
    files,
    serializedManifest: archiveManifest.serializeManifest(manifest)
  };
}

async function createExportZip(options = {}) {
  const exportResult = await collectExport(options);
  const writer = typeof options.createArchiveZip === "function" ? options.createArchiveZip : archiveZip.createArchiveZip;
  return {
    ...exportResult,
    zip: writer({
      manifest: exportResult.manifest,
      files: exportResult.files,
      policy: options.policy
    }, {
      policy: options.policy
    })
  };
}

module.exports = {
  collectExport,
  collectExportInput,
  createExportZip,
  hasBlockingDiagnostics
};
