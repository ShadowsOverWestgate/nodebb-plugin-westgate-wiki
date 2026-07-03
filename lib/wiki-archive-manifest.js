"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const archiveConfig = require("./wiki-archive-config");
const archiveSchema = require("./wiki-archive-schema");
const serializer = require("./serializer");
const wikiSlug = require("./wiki-slug");
const wikiTreeIndex = require("./wiki-tree-index");

const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PAGE_ID_PATTERN = /^wgap_[0-9a-f]{32}$/;
const NAMESPACE_ID_PATTERN = /^wgan_[0-9a-f]{32}$/;
const ALLOWED_MANIFEST_KEYS = new Set([
  "schemaId",
  "formatId",
  "version",
  "canonicalPathContractVersion",
  "exporter",
  "checksums",
  "namespaces",
  "pages",
  "assets",
  "settingsSnapshot",
  "reports"
]);
const ALLOWED_EXPORTER_KEYS = new Set(["plugin", "version"]);
const ALLOWED_CHECKSUM_KEYS = new Set(["path", "bytes", "sha256"]);
const ALLOWED_NAMESPACE_KEYS = new Set([
  "archiveNamespaceId",
  "parentArchiveNamespaceId",
  "canonicalPath",
  "titlePath"
]);
const ALLOWED_PAGE_KEYS = new Set([
  "archivePageId",
  "archiveNamespaceId",
  "canonicalPath",
  "title",
  "articleHtmlPath",
  "articleCss",
  "discussionDisabled",
  "topdata",
  "assetIds"
]);
const ALLOWED_TOPDATA_KEYS = new Set(["managedMarkerPreserved"]);
const ALLOWED_ASSET_KEYS = new Set([
  "assetId",
  "path",
  "sha256",
  "bytes",
  "contentType",
  "sourceReferences",
  "referencedByPageIds"
]);
const ALLOWED_REPORT_KEYS = new Set(["severity", "code", "path", "message", "sourceReference"]);
const RESERVED_FIRST_SEGMENTS = wikiTreeIndex.RESERVED_FIRST_SEGMENTS;

function clonePlain(value) {
  if (Array.isArray(value)) {
    return value.map(clonePlain);
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.keys(value).sort().reduce((output, key) => {
      output[key] = clonePlain(value[key]);
      return output;
    }, {});
  }
  return value;
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

function sortByFields(fields) {
  return (left, right) => {
    for (const field of fields) {
      const compared = compareText(left && left[field], right && right[field]);
      if (compared) {
        return compared;
      }
    }
    return 0;
  };
}

function normalizeManifest(manifest = {}) {
  const normalized = clonePlain(manifest);
  normalized.checksums = (Array.isArray(manifest.checksums) ? manifest.checksums : [])
    .map(clonePlain)
    .sort(sortByFields(["path"]));
  normalized.namespaces = (Array.isArray(manifest.namespaces) ? manifest.namespaces : [])
    .map(clonePlain)
    .sort(sortByFields(["canonicalPath", "archiveNamespaceId"]));
  normalized.pages = (Array.isArray(manifest.pages) ? manifest.pages : [])
    .map((page) => {
      const normalizedPage = clonePlain(page);
      if (Array.isArray(page && page.assetIds)) {
        normalizedPage.assetIds = page.assetIds.slice().sort();
      }
      return normalizedPage;
    })
    .sort(sortByFields(["canonicalPath", "archivePageId"]));
  normalized.assets = (Array.isArray(manifest.assets) ? manifest.assets : [])
    .map((asset) => ({
      ...clonePlain(asset),
      referencedByPageIds: Array.isArray(asset && asset.referencedByPageIds) ?
        asset.referencedByPageIds.slice().sort() :
        asset && asset.referencedByPageIds
    }))
    .sort(sortByFields(["path", "assetId"]));
  normalized.reports = (Array.isArray(manifest.reports) ? manifest.reports : [])
    .map(clonePlain)
    .sort(sortByFields(["severity", "code", "path", "message"]));
  return normalized;
}

function serializeManifest(manifest) {
  return `${JSON.stringify(normalizeManifest(manifest), null, 2)}\n`;
}

function makeError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function assertSafeArchivePath(archivePath) {
  const value = String(archivePath || "").trim();
  if (
    !value ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    value.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    throw makeError("unsafe-archive-path", `unsafe-archive-path: ${value}`);
  }
  return value;
}

function getFileValue(files, archivePath) {
  if (files instanceof Map) {
    return files.get(archivePath);
  }
  return files && Object.prototype.hasOwnProperty.call(files, archivePath) ? files[archivePath] : undefined;
}

function getFilePaths(files) {
  if (files instanceof Map) {
    return Array.from(files.keys());
  }
  if (files && typeof files === "object") {
    return Object.keys(files);
  }
  return [];
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return null;
  }
  return Buffer.from(String(value));
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertArray(value, code) {
  if (!Array.isArray(value)) {
    throw makeError(code, code);
  }
  return value;
}

function assertPlainManifestObject(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || manifest.constructor !== Object) {
    throw makeError("invalid-archive-manifest", "invalid-archive-manifest");
  }
}

function hasOnlyAllowedKeys(record, allowedKeys) {
  return !!(record && typeof record === "object" && !Array.isArray(record)) &&
    Object.keys(record).every((key) => allowedKeys.has(key));
}

function assertAllowedKeys(record, allowedKeys, code) {
  if (!hasOnlyAllowedKeys(record, allowedKeys)) {
    throw makeError(code, code);
  }
}

function assertRawManifestSectionArrays(manifest = {}) {
  assertArray(manifest.checksums, "invalid-checksum-list");
  assertArray(manifest.namespaces, "invalid-namespace-list");
  assertArray(manifest.pages, "invalid-page-list");
  assertArray(manifest.assets, "invalid-asset-list");
  assertArray(manifest.reports, "invalid-report-list");
}

function validateCount(name, count, limit) {
  if (Number.isInteger(limit) && limit > 0 && count > limit) {
    throw makeError("archive-limit-exceeded", `archive-limit-exceeded: ${name}`);
  }
}

function parseSafeNonNegativeInteger(value, code) {
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value >= 0) {
      return value;
    }
    throw makeError(code, code);
  }

  if (typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }

  throw makeError(code, code);
}

function validateChecksumRecord(record, files) {
  assertAllowedKeys(record, ALLOWED_CHECKSUM_KEYS, "invalid-checksum-record");
  const archivePath = assertSafeArchivePath(record && record.path);
  const bytes = parseSafeNonNegativeInteger(record && record.bytes, "invalid-checksum-record");
  const expectedHash = String(record && record.sha256 || "");
  if (!HEX_SHA256_PATTERN.test(expectedHash)) {
    throw makeError("invalid-checksum-record", "invalid-checksum-record");
  }

  const buffer = toBuffer(getFileValue(files, archivePath));
  if (!buffer) {
    throw makeError("missing-checksum-file", `missing-checksum-file: ${archivePath}`);
  }
  if (buffer.length !== bytes || hashBuffer(buffer) !== expectedHash) {
    throw makeError("archive-checksum-mismatch", `archive-checksum-mismatch: ${archivePath}`);
  }
  return archivePath;
}

function assertPathHasChecksum(archivePath, checksumPaths) {
  const safePath = assertSafeArchivePath(archivePath);
  if (!checksumPaths.has(safePath)) {
    throw makeError("missing-archive-checksum", `missing-archive-checksum: ${safePath}`);
  }
  return safePath;
}

function validatePortableId(value, pattern, code) {
  const normalized = String(value || "");
  if (!pattern.test(normalized)) {
    throw makeError(code, code);
  }
  return normalized;
}

function assertUniqueArchiveField(value, seen, fieldName, options = {}) {
  const normalized = String(value || "").trim();
  if ((!normalized && !options.allowEmpty) || seen.has(normalized)) {
    throw makeError("duplicate-archive-field", `duplicate-archive-field: ${fieldName}`);
  }
  seen.add(normalized);
  return normalized;
}

function validateNamespaceParentGraph(namespacesById) {
  namespacesById.forEach((namespace, namespaceId) => {
    const parentId = namespace.parentArchiveNamespaceId;
    if (parentId === null || parentId === undefined) {
      return;
    }
    const parent = namespacesById.get(parentId);
    if (parentId === namespaceId || !parent) {
      throw makeError("invalid-archive-namespace-parent", "invalid-archive-namespace-parent");
    }
  });

  namespacesById.forEach((namespace, namespaceId) => {
    const seen = new Set([namespaceId]);
    let parentId = namespace.parentArchiveNamespaceId;
    while (parentId) {
      if (seen.has(parentId)) {
        throw makeError("invalid-archive-namespace-cycle", "invalid-archive-namespace-cycle");
      }
      seen.add(parentId);
      const parent = namespacesById.get(parentId);
      parentId = parent && parent.parentArchiveNamespaceId;
    }
  });

  namespacesById.forEach((namespace) => {
    const parentId = namespace.parentArchiveNamespaceId;
    if (parentId === null || parentId === undefined) {
      return;
    }
    const parent = namespacesById.get(parentId);
    const parentPath = String(parent && parent.canonicalPath || "");
    const canonicalPath = String(namespace.canonicalPath || "");
    const expectedParentPath = splitCanonicalPath(canonicalPath).slice(0, -1).join("/");
    if (parentPath !== expectedParentPath) {
      throw makeError("invalid-archive-namespace-parent", "invalid-archive-namespace-parent");
    }
  });
}

function validatePageRecordShape(page) {
  if (!page || typeof page !== "object" || Array.isArray(page)) {
    throw makeError("invalid-page-record", "invalid-page-record");
  }
  if (Object.keys(page).some((key) => !ALLOWED_PAGE_KEYS.has(key))) {
    throw makeError("invalid-page-record", "invalid-page-record");
  }
  if (Object.prototype.hasOwnProperty.call(page, "topdata")) {
    if (!page.topdata || typeof page.topdata !== "object" || Array.isArray(page.topdata) ||
      !hasOnlyAllowedKeys(page.topdata, ALLOWED_TOPDATA_KEYS)) {
      throw makeError("invalid-topdata-record", "invalid-topdata-record");
    }
    if (Object.prototype.hasOwnProperty.call(page.topdata, "managedMarkerPreserved") &&
      typeof page.topdata.managedMarkerPreserved !== "boolean") {
      throw makeError("invalid-topdata-record", "invalid-topdata-record");
    }
  }
  if (Object.prototype.hasOwnProperty.call(page, "assetIds") && !Array.isArray(page.assetIds)) {
    throw makeError("invalid-page-asset-list", "invalid-page-asset-list");
  }
}

function validateExporterRecord(exporter) {
  if (!exporter || typeof exporter !== "object" || Array.isArray(exporter) ||
    !hasOnlyAllowedKeys(exporter, ALLOWED_EXPORTER_KEYS)) {
    throw makeError("invalid-exporter-record", "invalid-exporter-record");
  }
  if (typeof exporter.plugin !== "string" || !exporter.plugin.trim() ||
    typeof exporter.version !== "string" || !exporter.version.trim()) {
    throw makeError("invalid-exporter-record", "invalid-exporter-record");
  }
}

function validateNamespaceRecordShape(namespace) {
  if (!namespace || typeof namespace !== "object" || Array.isArray(namespace) ||
    !hasOnlyAllowedKeys(namespace, ALLOWED_NAMESPACE_KEYS)) {
    throw makeError("invalid-namespace-record", "invalid-namespace-record");
  }
  if (typeof namespace.canonicalPath !== "string") {
    throw makeError("invalid-namespace-record", "invalid-namespace-record");
  }
  if (!Array.isArray(namespace.titlePath) ||
    namespace.titlePath.some((segment) => typeof segment !== "string" || !segment.trim())) {
    throw makeError("invalid-namespace-record", "invalid-namespace-record");
  }
}

function splitCanonicalPath(canonicalPath) {
  return String(canonicalPath || "").split("/").map((segment) => segment.trim()).filter(Boolean);
}

function canonicalizePathSegments(segments) {
  const source = Array.isArray(segments) ? segments : [];
  const normalized = source.map((segment) => wikiSlug.normalizeCanonicalSegment(segment));
  if (normalized.some((segment) => segment.error)) {
    return "";
  }
  return normalized.map((segment) => segment.canonical).join("/");
}

function hasRetiredRouteFirstSegment(canonicalPath) {
  const first = splitCanonicalPath(canonicalPath)[0] || "";
  return !!(first && (RESERVED_FIRST_SEGMENTS.has(first.toLowerCase()) || /^\d+$/.test(first)));
}

function validateCanonicalPathSyntax(canonicalPath, code, options = {}) {
  const value = String(canonicalPath || "");
  if (!value) {
    if (options.allowEmpty) {
      return "";
    }
    throw makeError(code, code);
  }
  if (value.trim() !== value || value.includes("-") || value.includes("//") || hasRetiredRouteFirstSegment(value)) {
    throw makeError(code, code);
  }
  const segments = splitCanonicalPath(value);
  if (!segments.length || canonicalizePathSegments(segments) !== value) {
    throw makeError(code, code);
  }
  return value;
}

function validateNamespaceCanonicalPath(namespace) {
  const canonicalPath = validateCanonicalPathSyntax(namespace.canonicalPath, "invalid-namespace-canonical-path", {
    allowEmpty: true
  });
  if (!canonicalPath) {
    if (namespace.parentArchiveNamespaceId !== null && namespace.parentArchiveNamespaceId !== undefined) {
      throw makeError("invalid-namespace-canonical-path", "invalid-namespace-canonical-path");
    }
    return;
  }
  const expected = canonicalizePathSegments(namespace.titlePath);
  if (!expected || expected !== canonicalPath) {
    throw makeError("invalid-namespace-canonical-path", "invalid-namespace-canonical-path");
  }
}

function validatePageCanonicalPath(page, namespace) {
  const canonicalPath = validateCanonicalPathSyntax(page.canonicalPath, "invalid-page-canonical-path");
  const titlePath = serializer.getTitlePath(page.title);
  const titleCanonicalPath = canonicalizePathSegments(titlePath);
  if (!titleCanonicalPath) {
    throw makeError("invalid-page-canonical-path", "invalid-page-canonical-path");
  }
  const namespacePath = String(namespace && namespace.canonicalPath || "");
  const expected = [namespacePath, titleCanonicalPath].filter(Boolean).join("/");
  if (expected !== canonicalPath) {
    throw makeError("invalid-page-canonical-path", "invalid-page-canonical-path");
  }
}

function validateAssetRecordShape(asset) {
  if (!asset || typeof asset !== "object" || Array.isArray(asset) ||
    !hasOnlyAllowedKeys(asset, ALLOWED_ASSET_KEYS)) {
    throw makeError("invalid-asset-record", "invalid-asset-record");
  }
  if (typeof asset.contentType !== "string" || !asset.contentType.trim()) {
    throw makeError("invalid-asset-record", "invalid-asset-record");
  }
  if (Object.prototype.hasOwnProperty.call(asset, "sourceReferences") &&
    (!Array.isArray(asset.sourceReferences) ||
      asset.sourceReferences.some((reference) => typeof reference !== "string" || !reference.trim()))) {
    throw makeError("invalid-asset-record", "invalid-asset-record");
  }
}

function validateReportRecordShape(report) {
  if (!report || typeof report !== "object" || Array.isArray(report) ||
    !hasOnlyAllowedKeys(report, ALLOWED_REPORT_KEYS)) {
    throw makeError("invalid-report-record", "invalid-report-record");
  }
  if (typeof report.severity !== "string" || !report.severity.trim() ||
    typeof report.code !== "string" || !report.code.trim() ||
    typeof report.path !== "string" ||
    typeof report.message !== "string") {
    throw makeError("invalid-report-record", "invalid-report-record");
  }
  if (Object.prototype.hasOwnProperty.call(report, "sourceReference") &&
    typeof report.sourceReference !== "string") {
    throw makeError("invalid-report-record", "invalid-report-record");
  }
}

function validateSettingsSnapshot(snapshot, pageIds, namespacesById) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
  }

  const keys = new Set(Object.keys(snapshot));
  const requiredKeys = ["categoryRoots", "includeChildCategories", "homepage", "namespaceCreatorGroups"];
  const allowedKeys = requiredKeys.concat("routeRoot");
  if (requiredKeys.some((key) => !keys.has(key))) {
    throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
  }
  if (Array.from(keys).some((key) => !allowedKeys.includes(key))) {
    throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
  }
  if (typeof snapshot.includeChildCategories !== "boolean") {
    throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
  }
  if (!Array.isArray(snapshot.categoryRoots)) {
    throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
  }
  if (!Array.isArray(snapshot.namespaceCreatorGroups) ||
    snapshot.namespaceCreatorGroups.some((group) => typeof group !== "string" || !group.trim())) {
    throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
  }

  const allowedHomepageKeys = new Set(["archivePageId"]);
  const homepage = snapshot.homepage;
  if (homepage !== null) {
    if (!homepage || typeof homepage !== "object" || Array.isArray(homepage)) {
      throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
    }
    const keys = Object.keys(homepage);
    if (keys.some((key) => !allowedHomepageKeys.has(key)) || !PAGE_ID_PATTERN.test(String(homepage.archivePageId || ""))) {
      throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
    }
    if (!pageIds.has(homepage.archivePageId)) {
      throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
    }
  }

  function validateNamespaceReference(ref, allowedRefKeys) {
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) {
      throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
    }
    const refKeys = Object.keys(ref);
    const namespace = namespacesById.get(String(ref.archiveNamespaceId || ""));
    if (refKeys.some((key) => !allowedRefKeys.has(key)) ||
      !namespace ||
      typeof ref.canonicalPath !== "string" ||
      ref.canonicalPath !== namespace.canonicalPath) {
      throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
    }
    return namespace;
  }

  const allowedRootKeys = new Set(["archiveNamespaceId", "canonicalPath", "includeDescendants"]);
  snapshot.categoryRoots.forEach((root) => {
    validateNamespaceReference(root, allowedRootKeys);
    if (typeof root.includeDescendants !== "boolean") {
      throw makeError("invalid-settings-snapshot", "invalid-settings-snapshot");
    }
  });

  if (Object.prototype.hasOwnProperty.call(snapshot, "routeRoot") && snapshot.routeRoot !== null) {
    validateNamespaceReference(snapshot.routeRoot, new Set(["archiveNamespaceId", "canonicalPath"]));
  }
}

function validateManifest(manifest, options = {}) {
  assertPlainManifestObject(manifest);
  assertAllowedKeys(manifest, ALLOWED_MANIFEST_KEYS, "invalid-archive-manifest");

  const normalized = normalizeManifest(manifest);
  const policy = archiveConfig.normalizeArchivePolicy(options.policy || {});
  const files = options.files || {};

  if (normalized.schemaId !== archiveSchema.ARCHIVE_SCHEMA_ID || normalized.formatId !== archiveSchema.ARCHIVE_FORMAT_ID) {
    throw makeError("unsupported-archive-schema", "unsupported-archive-schema");
  }
  if (normalized.version !== archiveSchema.ARCHIVE_FORMAT_VERSION) {
    throw makeError("unsupported-archive-version", "unsupported-archive-version");
  }
  if (normalized.canonicalPathContractVersion !== archiveSchema.CANONICAL_PATH_CONTRACT_VERSION) {
    throw makeError("unsupported-canonical-path-contract", "unsupported-canonical-path-contract");
  }
  validateExporterRecord(normalized.exporter);

  assertRawManifestSectionArrays(manifest);

  const checksums = assertArray(normalized.checksums, "invalid-checksum-list");
  const namespaces = assertArray(normalized.namespaces, "invalid-namespace-list");
  const pages = assertArray(normalized.pages, "invalid-page-list");
  const assets = assertArray(normalized.assets, "invalid-asset-list");
  const reports = assertArray(normalized.reports, "invalid-report-list");
  reports.forEach(validateReportRecordShape);

  validateCount("namespaces", namespaces.length, policy.limits.maxNamespaces);
  validateCount("pages", pages.length, policy.limits.maxPages);
  validateCount("assets", assets.length, policy.limits.maxAssets);
  validateCount("reports", reports.length, policy.limits.maxReports);
  validateCount("checksums", checksums.length, policy.limits.maxChecksums);
  validateCount("subordinateFiles", checksums.length, policy.limits.maxSubordinateFiles);

  const manifestBytes = Buffer.byteLength(serializeManifest(normalized));
  validateCount("manifestBytes", manifestBytes, policy.limits.maxManifestBytes);

  let subordinateBytes = 0;
  const checksumPaths = new Set();
  const checksumByPath = new Map();
  checksums.forEach((record) => {
    const checksumPath = validateChecksumRecord(record, files);
    if (checksumPaths.has(checksumPath)) {
      throw makeError("duplicate-archive-field", "duplicate-archive-field: checksum.path");
    }
    checksumPaths.add(checksumPath);
    checksumByPath.set(checksumPath, record);
    subordinateBytes += parseSafeNonNegativeInteger(record.bytes, "invalid-checksum-record");
  });
  validateCount("subordinateBytes", subordinateBytes, policy.limits.maxSubordinateBytes);

  const namespaceIds = new Set();
  const namespacePaths = new Set();
  const namespacesById = new Map();
  namespaces.forEach((namespace) => {
    validateNamespaceRecordShape(namespace);
    validateNamespaceCanonicalPath(namespace);
    const namespaceId = validatePortableId(namespace && namespace.archiveNamespaceId, NAMESPACE_ID_PATTERN, "invalid-archive-namespace-id");
    assertUniqueArchiveField(namespaceId, namespaceIds, "namespace.archiveNamespaceId");
    assertUniqueArchiveField(namespace && namespace.canonicalPath, namespacePaths, "namespace.canonicalPath", { allowEmpty: true });
    if (namespace.parentArchiveNamespaceId !== null && namespace.parentArchiveNamespaceId !== undefined) {
      validatePortableId(namespace.parentArchiveNamespaceId, NAMESPACE_ID_PATTERN, "invalid-archive-namespace-id");
    }
    namespacesById.set(namespaceId, namespace);
  });
  validateNamespaceParentGraph(namespacesById);

  const pageIds = new Set();
  const pagePaths = new Set();
  const pagesById = new Map();
  pages.forEach((page) => {
    validatePageRecordShape(page);
    const pageId = validatePortableId(page && page.archivePageId, PAGE_ID_PATTERN, "invalid-archive-page-id");
    assertUniqueArchiveField(pageId, pageIds, "page.archivePageId");
    assertUniqueArchiveField(page && page.canonicalPath, pagePaths, "page.canonicalPath");
    assertPathHasChecksum(page && page.articleHtmlPath, checksumPaths);
    if (!namespaceIds.has(String(page && page.archiveNamespaceId || ""))) {
      throw makeError("invalid-archive-namespace-reference", "invalid-archive-namespace-reference");
    }
    validatePageCanonicalPath(page, namespacesById.get(String(page.archiveNamespaceId || "")));
    pagesById.set(pageId, page);
  });

  const assetIds = new Set();
  const assetPaths = new Set();
  assets.forEach((asset) => {
    validateAssetRecordShape(asset);
    assertUniqueArchiveField(asset && asset.assetId, assetIds, "asset.assetId");
    const assetPath = assertPathHasChecksum(asset && asset.path, checksumPaths);
    assertUniqueArchiveField(assetPath, assetPaths, "asset.path");
    if (!HEX_SHA256_PATTERN.test(String(asset && asset.sha256 || ""))) {
      throw makeError("invalid-asset-checksum", "invalid-asset-checksum");
    }
    const checksum = checksumByPath.get(assetPath);
    const assetBytes = parseSafeNonNegativeInteger(asset && asset.bytes, "invalid-asset-bytes");
    const checksumBytes = parseSafeNonNegativeInteger(checksum && checksum.bytes, "invalid-checksum-record");
    if (String(asset.sha256) !== String(checksum && checksum.sha256) ||
      assetBytes !== checksumBytes) {
      throw makeError("asset-checksum-metadata-mismatch", "asset-checksum-metadata-mismatch");
    }
    if (!Array.isArray(asset.referencedByPageIds)) {
      throw makeError("invalid-asset-reference-list", "invalid-asset-reference-list");
    }
    asset.referencedByPageIds.forEach((pageId) => {
      if (!PAGE_ID_PATTERN.test(String(pageId || "")) || !pageIds.has(pageId)) {
        throw makeError("invalid-archive-page-reference", "invalid-archive-page-reference");
      }
    });
  });

  pagesById.forEach((page, pageId) => {
    if (!Object.prototype.hasOwnProperty.call(page, "assetIds")) {
      return;
    }
    page.assetIds.forEach((assetId) => {
      if (!assetIds.has(String(assetId || ""))) {
        throw makeError("invalid-archive-asset-reference", "invalid-archive-asset-reference");
      }
      const asset = assets.find((row) => row.assetId === assetId);
      if (!asset || !Array.isArray(asset.referencedByPageIds) || !asset.referencedByPageIds.includes(pageId)) {
        throw makeError("invalid-page-asset-reference", "invalid-page-asset-reference");
      }
    });
  });

  getFilePaths(files).forEach((filePath) => {
    const safePath = assertSafeArchivePath(filePath);
    if (!checksumPaths.has(safePath)) {
      throw makeError("unmanifested-archive-file", `unmanifested-archive-file: ${safePath}`);
    }
  });

  validateSettingsSnapshot(normalized.settingsSnapshot, pageIds, namespacesById);

  return {
    status: "ok",
    manifest: normalized,
    policy
  };
}

function getPageHtmlPath(archivePageId) {
  validatePortableId(archivePageId, PAGE_ID_PATTERN, "invalid-archive-page-id");
  return `pages/${archivePageId}.html`;
}

function getReportPath(name) {
  const safeName = String(name || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!safeName) {
    throw makeError("invalid-report-path", "invalid-report-path");
  }
  return `reports/${safeName}.json`;
}

module.exports = {
  HEX_SHA256_PATTERN,
  assertSafeArchivePath,
  getPageHtmlPath,
  getReportPath,
  normalizeManifest,
  serializeManifest,
  validateManifest
};
