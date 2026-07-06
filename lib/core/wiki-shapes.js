"use strict";

/*
 * The plugin's three hub contracts — the plain-object shapes that cross module
 * boundaries into 14-20 consumer files each. Producers assert them so a field
 * rename/removal fails loudly AT the producer instead of surfacing as
 * `undefined` reads three modules away.
 *
 * These lists are the contract. Extending a shape (adding keys) is always
 * safe; removing or renaming a key means updating this file, which is the
 * signal to grep for consumers.
 */

// wikiTreeIndex.resolveWikiNode(...) successful result.
const NODE_RESULT_OK_KEYS = [
  "status",
  "requestedPath",
  "canonicalPath",
  "wikiPath",
  "redirectToCanonical",
  "node",
  "ancestors",
  "children"
];

// The shaped node inside a successful resolver result.
const SHAPED_NODE_KEYS = [
  "canonicalPath",
  "foldedKey",
  "segments",
  "page",
  "namespace",
  "isComposite",
  "isBranchOnly"
];

// getCanonicalPageInfo / getCanonicalNamespaceInfo result.
const PATH_INFO_KEYS = [
  "valid",
  "hiddenByPrivileges",
  "canonicalPath",
  "wikiPath"
];

// wiki-links buildResolverContext output, threaded through ~15 helpers.
const RESOLVER_CONTEXT_KEYS = [
  "viewerUid",
  "hasViewerUid",
  "categoryByCid",
  "rootCategories",
  "getNamespacePath",
  "getNamespaceInfo",
  "canReadTopic",
  "getTopicRows",
  "topicMatchByCidAndTarget",
  "getDefaultCategory"
];

function assertShape(value, keys, label) {
  if (!value || typeof value !== "object") {
    throw new Error(`[westgate-wiki] ${label} is not an object`);
  }
  const missing = keys.filter((key) => !(key in value));
  if (missing.length) {
    throw new Error(`[westgate-wiki] ${label} is missing contract keys: ${missing.join(", ")} — update lib/core/wiki-shapes.js and its consumers together`);
  }
  return value;
}

module.exports = {
  NODE_RESULT_OK_KEYS,
  SHAPED_NODE_KEYS,
  PATH_INFO_KEYS,
  RESOLVER_CONTEXT_KEYS,
  assertShape
};
