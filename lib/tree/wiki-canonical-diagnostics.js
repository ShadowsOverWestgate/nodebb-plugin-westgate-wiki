"use strict";

// Canonical-tree diagnostics for the archive subsystem. Replaces the retired
// one-shot migration tooling (wiki-path-migration.js): the version constant,
// runtime input collection, and a verify() that answers the only question the
// archive layer ever asked — does the current tree have blocking errors?

const wikiTreeIndex = require("./wiki-tree-index");

// Written into archive manifests as canonicalPathContractVersion; must stay
// stable or existing production exports become unimportable.
const CANONICAL_PATH_MIGRATION_VERSION = "canonical-title-category-tree-v1";

const RESERVED_FIRST_SEGMENTS = wikiTreeIndex.RESERVED_FIRST_SEGMENTS;

function asPositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasReservedRoot(canonicalPath) {
  const first = String(canonicalPath || "").split("/").filter(Boolean)[0];
  return !!(first && RESERVED_FIRST_SEGMENTS.has(first.toLowerCase()));
}

function countGroups(rows, keyOf) {
  const byKey = new Map();
  rows.forEach((row) => {
    const key = keyOf(row);
    if (!key) {
      return;
    }
    byKey.set(key, (byKey.get(key) || 0) + 1);
  });
  let groups = 0;
  byKey.forEach((count) => {
    if (count > 1) {
      groups += 1;
    }
  });
  return groups;
}

function countBlockingErrors(state) {
  const namespaces = Array.from(state.namespaceByCid.values()).filter((ns) => ns.cid);
  const pages = Array.from(state.pageByTid.values()).filter((page) => page.tid);
  const validNamespaces = namespaces.filter((ns) => !ns.invalidSegments.length && ns.canonicalPath);
  const validPages = pages.filter((page) => !page.invalidSegments.length && page.canonicalPath);

  const invalidSegments =
    namespaces.reduce((sum, ns) => sum + ns.invalidSegments.length, 0) +
    pages.reduce((sum, page) => sum + page.invalidSegments.length, 0);

  const reservedRoots =
    validNamespaces.filter((ns) => hasReservedRoot(ns.canonicalPath)).length +
    validPages.filter((page) => hasReservedRoot(page.canonicalPath)).length;

  const namespaceCollisions =
    countGroups(validNamespaces, (ns) => ns.canonicalPath) +
    countGroups(validNamespaces, (ns) => ns.foldedKey);
  const pageCollisions =
    countGroups(validPages, (page) => page.canonicalPath) +
    countGroups(validPages, (page) => page.foldedKey);

  // Cross-facet folded overlap at a *different* canonical path is a collision;
  // identical paths are composite index pages and legal.
  const namespaceByFolded = new Map();
  validNamespaces.forEach((ns) => {
    const rows = namespaceByFolded.get(ns.foldedKey) || [];
    rows.push(ns);
    namespaceByFolded.set(ns.foldedKey, rows);
  });
  const crossFacet = validPages.filter((page) =>
    (namespaceByFolded.get(page.foldedKey) || []).some((ns) => ns.canonicalPath !== page.canonicalPath)).length;

  return invalidSegments + reservedRoots + namespaceCollisions + pageCollisions + crossFacet;
}

async function collectRuntimeInput() {
  const categories = require.main.require("./src/categories");
  const posts = require.main.require("./src/posts");
  const topics = require.main.require("./src/topics");
  const config = require("../core/config");
  const { getCategoriesTids } = require("../core/wiki-category-tids");

  const settings = await config.getSettings({ bustCache: true });
  const cids = settings.effectiveCategoryIds || [];
  const categoryRows = (await Promise.all(cids.map((cid) => categories.getCategoryData(cid)))).filter(Boolean);
  const tids = [...new Set((await getCategoriesTids(cids)).map(asPositiveInt).filter(Boolean))];
  const topicRows = await topics.getTopicsFields(tids, [
    "tid", "cid", "title", "titleRaw", "slug", "mainPid", "deleted", "scheduled", "westgateWikiNamespaceIndexCid"
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
    settings
  };
}

async function verify(input = {}) {
  const tree = wikiTreeIndex.createWikiTreeIndex(input);
  const blockingErrors = countBlockingErrors(tree.getState());
  const status = blockingErrors ? "needs-attention" : "ok";

  return {
    status,
    migrationVersion: CANONICAL_PATH_MIGRATION_VERSION,
    treeIndex: {
      status: blockingErrors ? "blocking" : "ok",
      blockingErrors
    },
    summary: {
      blockingErrors
    }
  };
}

module.exports = {
  CANONICAL_PATH_MIGRATION_VERSION,
  collectRuntimeInput,
  verify
};
