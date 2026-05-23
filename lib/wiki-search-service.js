"use strict";

const categories = require.main.require("./src/categories");
const helpers = require.main.require("./src/controllers/helpers");
const privileges = require.main.require("./src/privileges");

const config = require("./config");
const serializer = require("./serializer");
const wikiCanonicalPathAdapter = require("./wiki-canonical-path-adapter");
const wikiDirectory = require("./wiki-directory-service");

const DEFAULT_FULL_LIMIT = 20;
const DEFAULT_SUGGEST_LIMIT = 10;
const MAX_LIMIT = 50;

function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeForMatch(value) {
  return normalizeQuery(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function clampLimit(value, mode) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return mode === "suggest" ? DEFAULT_SUGGEST_LIMIT : DEFAULT_FULL_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function normalizeMode(value) {
  return value === "suggest" ? "suggest" : "full";
}

function makeEmptyResult({ query, mode, limit, settings, queryTooShort }) {
  return {
    query,
    normalizedQuery: normalizeForMatch(query),
    mode,
    limit,
    isConfigured: !!(settings && settings.isConfigured),
    hasReadableNamespaces: false,
    hasQuery: !!query,
    queryTooShort: !!queryTooShort,
    results: [],
    groups: {
      exact: [],
      pages: [],
      namespaces: []
    },
    totalReturned: 0
  };
}

function scoreText(query, candidates) {
  const haystacks = candidates
    .map(normalizeForMatch)
    .filter(Boolean);

  if (!query || !haystacks.length) {
    return null;
  }

  if (haystacks.some((haystack) => haystack === query)) {
    return { bucket: "exact", score: 100, reason: "exact" };
  }
  if (haystacks.some((haystack) => haystack.startsWith(query))) {
    return { bucket: "pages", score: 80, reason: "prefix" };
  }
  if (haystacks.some((haystack) => haystack.split(/\s+/).some((word) => word.startsWith(query)))) {
    return { bucket: "pages", score: 65, reason: "word-prefix" };
  }
  if (haystacks.some((haystack) => haystack.includes(query))) {
    return { bucket: "pages", score: 50, reason: "contains" };
  }
  return null;
}

async function getReadableCategoryRows(settings, uid) {
  const rows = [];

  for (const cid of settings.effectiveCategoryIds || []) {
    const category = await categories.getCategoryData(cid);
    if (!category) {
      continue;
    }

    const categoryPrivileges = await privileges.categories.get(cid, uid);
    if (!categoryPrivileges || !categoryPrivileges.read || !categoryPrivileges["topics:read"]) {
      continue;
    }

    const namespaceInfo = await wikiCanonicalPathAdapter.getCanonicalNamespaceInfo(category, { settings, uid });
    const namespacePath = namespaceInfo.wikiPath || "";
    if (!namespacePath) {
      continue;
    }

    rows.push({ category, namespacePath });
  }

  return rows;
}

async function buildNamespaceResult(categoryRow, query) {
  const { category, namespacePath } = categoryRow;
  const match = scoreText(query, [category.name, namespacePath.replace(/^\/wiki\/?/, "")]);
  if (!match) {
    return null;
  }

  return {
    type: "namespace",
    title: category.name,
    titleLeaf: category.name,
    namespaceTitle: category.name,
    namespacePath,
    wikiPath: namespacePath,
    cid: category.cid,
    score: match.score - 5,
    scoreReason: `namespace-${match.reason}`,
    sortTime: 0
  };
}

function getTopicSortTime(topic) {
  return Math.max(
    parseInt(topic && topic.lastposttime, 10) || 0,
    parseInt(topic && topic.timestamp, 10) || 0,
    parseInt(topic && topic.updatetime, 10) || 0
  );
}

async function getPageResults(categoryRow, query, uid) {
  const cid = parseInt(categoryRow.category.cid, 10);
  const topicRows = await wikiDirectory.getOrderedSummaries(cid, uid, false);
  const results = [];

  topicRows.forEach((topic) => {
    if (!topic || parseInt(topic.deleted, 10) || parseInt(topic.scheduled, 10) || !topic.slug) {
      return;
    }

    const titlePath = serializer.getTitlePath(topic.titleRaw || topic.title);
    const titleLeaf = titlePath.length ? titlePath[titlePath.length - 1] : topic.title;
    const parentTitlePathSegments = serializer.getParentTitlePathSegments(titlePath);
    const match = scoreText(query, [
      topic.titleRaw || topic.title,
      topic.title,
      titleLeaf,
      titlePath.join(" ")
    ]);
    if (!match) {
      return;
    }

    const wikiPath = topic.wikiPath || "";
    if (!wikiPath) {
      return;
    }

    results.push({
      type: "page",
      title: topic.title,
      titleLeaf,
      titlePath,
      parentTitlePathSegments,
      namespaceTitle: categoryRow.category.name,
      namespacePath: categoryRow.namespacePath,
      wikiPath,
      cid,
      tid: topic.tid,
      score: match.score,
      scoreReason: match.reason,
      sortTime: getTopicSortTime(topic)
    });
  });

  return results;
}

function sortResults(results) {
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.sortTime !== a.sortTime) {
      return b.sortTime - a.sortTime;
    }
    const titleA = String(a.titleLeaf || a.title || "").toLowerCase();
    const titleB = String(b.titleLeaf || b.title || "").toLowerCase();
    const titleCmp = titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: "base" });
    if (titleCmp !== 0) {
      return titleCmp;
    }
    return (parseInt(a.tid || a.cid, 10) || 0) - (parseInt(b.tid || b.cid, 10) || 0);
  });
  return results;
}

function buildFacetMap(results, categoryRows) {
  const byPath = new Map();
  (Array.isArray(categoryRows) ? categoryRows : []).forEach((row) => {
    const wikiPath = String(row && row.namespacePath || "");
    if (!wikiPath) {
      return;
    }
    const facets = byPath.get(wikiPath) || { page: false, namespace: false };
    facets.namespace = true;
    byPath.set(wikiPath, facets);
  });
  results.forEach((result) => {
    const wikiPath = String(result && result.wikiPath || "");
    if (!wikiPath) {
      return;
    }
    const facets = byPath.get(wikiPath) || { page: false, namespace: false };
    facets.page = facets.page || result.type === "page";
    facets.namespace = facets.namespace || result.type === "namespace";
    byPath.set(wikiPath, facets);
  });
  return byPath;
}

function compactResult(result, facetsByPath) {
  const out = {
    type: result.type,
    title: result.title,
    titleLeaf: result.titleLeaf,
    namespaceTitle: result.namespaceTitle,
    namespacePath: result.namespacePath,
    wikiPath: result.wikiPath,
    cid: result.cid,
    scoreReason: result.scoreReason,
    facets: result.facets || facetsByPath.get(result.wikiPath) || {
      page: result.type === "page",
      namespace: result.type === "namespace"
    }
  };
  if (result.tid != null) {
    out.tid = result.tid;
  }
  if (Array.isArray(result.titlePath)) {
    out.titlePath = result.titlePath;
    out.hasParentPath = result.titlePath.length > 1;
    out.parentTitlePathText = result.titlePath.slice(0, -1).join(" :: ");
    out.parentTitlePathSegments = serializer.getParentTitlePathSegments(result.titlePath);
  }
  return out;
}

function groupResults(results) {
  return {
    exact: results.filter((row) => row.type === "page" && row.scoreReason === "exact"),
    pages: results.filter((row) => row.type === "page" && row.scoreReason !== "exact"),
    namespaces: results.filter((row) => row.type === "namespace")
  };
}

async function search(options = {}) {
  const mode = normalizeMode(options.mode);
  const limit = clampLimit(options.limit, mode);
  const query = normalizeQuery(options.q);
  const normalizedQuery = normalizeForMatch(query);
  const settings = await config.getSettings();
  const base = makeEmptyResult({
    query,
    mode,
    limit,
    settings,
    queryTooShort: !!query && normalizedQuery.length < 2
  });

  if (!settings.isConfigured || !query || base.queryTooShort) {
    return base;
  }

  const readableCategories = await getReadableCategoryRows(settings, options.uid || 0);
  base.hasReadableNamespaces = readableCategories.length > 0;
  if (!readableCategories.length) {
    return base;
  }

  const rawResults = [];
  for (const categoryRow of readableCategories) {
    const namespaceResult = await buildNamespaceResult(categoryRow, normalizedQuery);
    if (namespaceResult) {
      rawResults.push(namespaceResult);
    }
    rawResults.push(...await getPageResults(categoryRow, normalizedQuery, options.uid || 0));
  }

  const facetsByPath = buildFacetMap(rawResults, readableCategories);
  const compact = sortResults(rawResults)
    .slice(0, limit)
    .map((result) => compactResult(result, facetsByPath));
  const groups = groupResults(compact);

  return {
    ...base,
    hasReadableNamespaces: true,
    results: compact,
    groups,
    totalReturned: compact.length
  };
}

async function apiSearch(req, res) {
  const result = await search({
    q: req.query && req.query.q,
    mode: req.query && req.query.mode,
    limit: req.query && req.query.limit,
    uid: req.uid
  });

  return helpers.formatApiResponse(200, res, result);
}

module.exports = {
  apiSearch,
  search
};
