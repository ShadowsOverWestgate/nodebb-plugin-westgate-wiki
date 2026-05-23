"use strict";

const wikiPaths = require("./wiki-paths");

function asPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function hasViewerUid(options) {
  return options && Object.prototype.hasOwnProperty.call(options, "uid") && options.uid !== undefined && options.uid !== null;
}

function withoutViewerUid(options = {}) {
  const unscoped = { ...options };
  delete unscoped.uid;
  return unscoped;
}

function toWikiPath(canonicalPath) {
  return canonicalPath ? `/wiki/${canonicalPath}` : "/wiki";
}

function visibleInfo(canonicalPath) {
  return {
    valid: true,
    hiddenByPrivileges: false,
    canonicalPath,
    wikiPath: toWikiPath(canonicalPath)
  };
}

function invalidInfo(hiddenByPrivileges = false) {
  return {
    valid: false,
    hiddenByPrivileges,
    canonicalPath: "",
    wikiPath: ""
  };
}

async function isHiddenByViewer(pathGetter, subject, options) {
  if (!hasViewerUid(options)) {
    return false;
  }
  return !!await pathGetter(subject, withoutViewerUid(options));
}

async function getNamespacePathInfo(category, options) {
  if (wikiPaths && typeof wikiPaths.getCanonicalNamespacePathInfo === "function") {
    const info = await wikiPaths.getCanonicalNamespacePathInfo(category, options);
    if (info && typeof info === "object" && Object.prototype.hasOwnProperty.call(info, "valid")) {
      return info;
    }
  }
  return null;
}

async function getCanonicalNamespaceInfo(category, options = {}) {
  const cid = asPositiveInt(category && category.cid);
  if (!cid) {
    return {
      ...invalidInfo(false),
      categoryChain: []
    };
  }

  const namespacePathInfo = await getNamespacePathInfo(category, options);
  if (namespacePathInfo) {
    return namespacePathInfo.valid ?
      visibleInfo(namespacePathInfo.canonicalPath || "") :
      invalidInfo(!!namespacePathInfo.hiddenByPrivileges);
  }

  const canonicalPath = await wikiPaths.getCanonicalNamespacePath(category, options);
  if (canonicalPath) {
    return visibleInfo(canonicalPath);
  }

  const hiddenByPrivileges = await isHiddenByViewer(wikiPaths.getCanonicalNamespacePath, category, options);
  return invalidInfo(hiddenByPrivileges);
}

async function getCanonicalPageInfo(topic, options = {}) {
  const tid = asPositiveInt(topic && topic.tid);
  const cid = asPositiveInt(topic && topic.cid);
  if (!tid && !cid) {
    return invalidInfo(false);
  }
  if (options.namespaceInfo && !options.namespaceInfo.valid) {
    return invalidInfo(!!options.namespaceInfo.hiddenByPrivileges);
  }

  const canonicalPath = await wikiPaths.getCanonicalPagePath(topic, options);
  if (canonicalPath) {
    return visibleInfo(canonicalPath);
  }

  const hiddenByPrivileges = await isHiddenByViewer(wikiPaths.getCanonicalPagePath, topic, options);
  return invalidInfo(hiddenByPrivileges);
}

module.exports = {
  getCanonicalNamespaceInfo,
  getCanonicalPageInfo
};
