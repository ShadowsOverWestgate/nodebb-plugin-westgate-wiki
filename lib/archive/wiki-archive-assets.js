"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const { JSDOM } = require("jsdom");

const LOCAL_UPLOAD_PREFIXES = [
  "/uploads/",
  "/assets/uploads/"
];

const ATTR_SELECTORS = [
  ["img", "src"],
  ["source", "src"],
  ["a", "href"]
];

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
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

function sortReports(a, b) {
  return compareText(a.severity, b.severity) ||
    compareText(a.code, b.code) ||
    compareText(a.path, b.path) ||
    compareText(a.sourceReference, b.sourceReference);
}

function normalizePathReference(reference) {
  const value = String(reference || "").trim();
  if (!value) {
    return "";
  }
  try {
    const parsed = new URL(value, "http://westgate.local");
    return parsed.pathname || "";
  } catch (err) {
    return value.split(/[?#]/)[0];
  }
}

function isRemoteReference(reference) {
  const value = String(reference || "").trim();
  return value.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value) &&
    !String(reference || "").toLowerCase().startsWith("file:");
}

function isUnsupportedSchemeReference(reference) {
  const value = String(reference || "").trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function isLocalUploadReference(reference) {
  const pathname = normalizePathReference(reference);
  return LOCAL_UPLOAD_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getAssetExtension(reference, contentType) {
  const fromReference = path.posix.extname(normalizePathReference(reference)).toLowerCase().replace(/[^.a-z0-9]/g, "");
  if (fromReference) {
    return fromReference;
  }

  const normalizedType = String(contentType || "").toLowerCase().split(";")[0].trim();
  if (normalizedType === "image/png") {
    return ".png";
  }
  if (normalizedType === "image/gif") {
    return ".gif";
  }
  if (normalizedType === "image/jpeg" || normalizedType === "image/jpg") {
    return ".jpg";
  }
  if (normalizedType === "image/webp") {
    return ".webp";
  }
  if (normalizedType === "image/svg+xml") {
    return ".svg";
  }
  return ".bin";
}

function extractReferences(articleHtml) {
  const document = new JSDOM(String(articleHtml || "")).window.document;
  const references = [];

  ATTR_SELECTORS.forEach(([selector, attr]) => {
    document.querySelectorAll(selector).forEach((node) => {
      const value = String(node.getAttribute(attr) || "").trim();
      if (value) {
        references.push({ tagName: selector, attr, reference: value });
      }
    });
  });

  return references;
}

function hasLocalUploadReferences(pages = []) {
  return (Array.isArray(pages) ? pages : []).some((page) => extractReferences(page && page.articleHtml)
    .some((item) => !isRemoteReference(item.reference) &&
      !isUnsupportedSchemeReference(item.reference) &&
      isLocalUploadReference(item.reference)));
}

async function readUpload(uploadStore, sourceReference) {
  if (!uploadStore || typeof uploadStore.readLocalUpload !== "function") {
    throw new Error("archive-upload-store-unavailable");
  }
  return uploadStore.readLocalUpload(normalizePathReference(sourceReference), sourceReference);
}

async function collectAssetsFromPages(pages = [], options = {}) {
  const assetsByHash = new Map();
  const files = new Map();
  const reports = [];
  const pageAssetIds = new Map();

  for (const page of Array.isArray(pages) ? pages : []) {
    const archivePageId = String(page && page.archivePageId || "");
    const canonicalPath = String(page && page.canonicalPath || "");
    const assetIdsForPage = new Set();

    for (const item of extractReferences(page && page.articleHtml)) {
      const sourceReference = item.reference;
      if (isRemoteReference(sourceReference)) {
        reports.push({
          severity: "warning",
          code: "remote-asset",
          path: canonicalPath,
          sourceReference,
          message: "Remote asset reference preserved"
        });
        continue;
      }

      if (isUnsupportedSchemeReference(sourceReference)) {
        reports.push({
          severity: "warning",
          code: "unsupported-local-reference",
          path: canonicalPath,
          sourceReference,
          message: "Local reference is not a recognized NodeBB upload"
        });
        continue;
      }

      if (!isLocalUploadReference(sourceReference)) {
        if (normalizePathReference(sourceReference).startsWith("/")) {
          reports.push({
            severity: "warning",
            code: "unsupported-local-reference",
            path: canonicalPath,
            sourceReference,
            message: "Local reference is not a recognized NodeBB upload"
          });
        }
        continue;
      }

      const upload = await readUpload(options.uploadStore, sourceReference);
      if (!upload || !upload.buffer) {
        reports.push({
          severity: "warning",
          code: "missing-local-upload",
          path: canonicalPath,
          sourceReference: normalizePathReference(sourceReference),
          message: "Local upload reference could not be read"
        });
        continue;
      }

      const buffer = Buffer.isBuffer(upload.buffer) ? upload.buffer : Buffer.from(upload.buffer);
      const sha256 = hashBuffer(buffer);
      const assetId = `asset_${sha256.slice(0, 32)}`;
      const assetPath = `assets/sha256/${sha256}${getAssetExtension(sourceReference, upload.contentType)}`;
      let asset = assetsByHash.get(sha256);
      if (!asset) {
        asset = {
          assetId,
          path: assetPath,
          sha256,
          bytes: buffer.length,
          contentType: String(upload.contentType || "application/octet-stream"),
          sourceReferences: new Set(),
          referencedByPageIds: new Set()
        };
        assetsByHash.set(sha256, asset);
        files.set(assetPath, buffer);
      }
      asset.sourceReferences.add(normalizePathReference(sourceReference));
      asset.referencedByPageIds.add(archivePageId);
      assetIdsForPage.add(assetId);
    }

    pageAssetIds.set(archivePageId, Array.from(assetIdsForPage).sort());
  }

  const assets = Array.from(assetsByHash.values())
    .map((asset) => ({
      assetId: asset.assetId,
      path: asset.path,
      sha256: asset.sha256,
      bytes: asset.bytes,
      contentType: asset.contentType,
      sourceReferences: Array.from(asset.sourceReferences).sort(),
      referencedByPageIds: Array.from(asset.referencedByPageIds).sort()
    }))
    .sort((a, b) => compareText(a.path, b.path) || compareText(a.assetId, b.assetId));

  return {
    assets,
    files,
    reports: reports.sort(sortReports),
    pageAssetIds
  };
}

module.exports = {
  collectAssetsFromPages,
  extractReferences,
  hasLocalUploadReferences,
  isLocalUploadReference,
  isRemoteReference,
  isUnsupportedSchemeReference
};
