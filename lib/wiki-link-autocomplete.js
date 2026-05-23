"use strict";

const categories = require.main.require("./src/categories");
const helpers = require.main.require("./src/controllers/helpers");
const privileges = require.main.require("./src/privileges");

const config = require("./config");
const serializer = require("./serializer");
const wikiCanonicalPathAdapter = require("./wiki-canonical-path-adapter");
const wikiDirectory = require("./wiki-directory-service");

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function compactNormalizedText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function textMatchesQuery(query, candidates) {
  if (!query) {
    return false;
  }

  const compactQuery = compactNormalizedText(query);
  return candidates.some((candidate) => {
    const normalized = normalizeText(candidate);
    return normalized.includes(query) || (
      compactQuery &&
      compactNormalizedText(normalized).includes(compactQuery)
    );
  });
}

function clampLimit(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function normalizeType(value) {
  return value === "page" || value === "namespace" ? value : "";
}

function pathToInsertKey(path) {
  return String(path || "").replace(/^\/wiki\/?/, "");
}

function pageTitleLeaf(result) {
  return String(result.titleLeaf || result.title || "").trim();
}

function pageTitleTarget(result) {
  if (Array.isArray(result.titlePath) && result.titlePath.length) {
    return serializer.getTitleDisplay(result.titlePath, result.title);
  }
  return pageTitleLeaf(result);
}

function wikiPageInsertMarkup(target, label) {
  return label && label !== target ? `[[${target}|${label}]]` : `[[${target}]]`;
}

function pageInsertText(result, context, currentCid) {
  const label = pageTitleLeaf(result);
  const titleTarget = pageTitleTarget(result);

  if (context === "forum") {
    return `[${label || titleTarget}](${result.wikiPath})`;
  }

  if (parseInt(result.cid, 10) === parseInt(currentCid, 10)) {
    return wikiPageInsertMarkup(titleTarget, label);
  }

  const namespaceKey = pathToInsertKey(result.namespacePath);
  const target = namespaceKey ? `${namespaceKey}/${titleTarget}` : titleTarget;
  return wikiPageInsertMarkup(target, label);
}

function namespaceInsertText(result, context) {
  if (context === "forum") {
    return `[${result.title}](${result.wikiPath})`;
  }

  const namespaceKey = pathToInsertKey(result.wikiPath);
  return `[[ns:${namespaceKey || result.title}]]`;
}

function isDescendantOf(category, ancestorCid, categoryByCid) {
  let parentCid = parseInt(category.parentCid, 10);
  const targetCid = parseInt(ancestorCid, 10);

  while (Number.isInteger(parentCid) && parentCid > 0) {
    if (parentCid === targetCid) {
      return true;
    }
    const parent = categoryByCid.get(parentCid);
    parentCid = parseInt(parent && parent.parentCid, 10);
  }

  return false;
}

async function getCandidateCategories(settings, options) {
  const rows = await Promise.all(
    settings.effectiveCategoryIds.map((cid) => categories.getCategoryData(cid))
  );
  const categoryList = rows.filter(Boolean);
  const categoryByCid = new Map(categoryList.map((category) => [parseInt(category.cid, 10), category]));
  const scope = options.scope || "current-namespace";
  const currentCid = parseInt(options.cid, 10);

  if (scope === "all-wiki" || !Number.isInteger(currentCid) || currentCid <= 0) {
    return categoryList;
  }

  if (scope === "descendants") {
    return categoryList.filter((category) => (
      parseInt(category.cid, 10) === currentCid ||
      isDescendantOf(category, currentCid, categoryByCid)
    ));
  }

  return categoryList.filter((category) => parseInt(category.cid, 10) === currentCid);
}

async function canReadCategory(cid, uid) {
  return privileges.categories.can("topics:read", cid, uid);
}

async function getNamespaceWikiPath(category, options = {}) {
  const namespaceInfo = await wikiCanonicalPathAdapter.getCanonicalNamespaceInfo(category, options);
  return namespaceInfo.wikiPath || "";
}

async function buildNamespaceResult(category, context, options = {}) {
  const wikiPath = await getNamespaceWikiPath(category, options);
  if (!wikiPath) {
    return null;
  }
  const result = {
    type: "namespace",
    title: category.name,
    titleLeaf: category.name,
    namespacePath: wikiPath,
    wikiPath,
    cid: category.cid,
    tid: null
  };
  result.insertText = namespaceInsertText(result, context);
  return result;
}

async function getPageResults(category, options) {
  const cid = parseInt(category.cid, 10);
  const topicList = await wikiDirectory.getOrderedSummaries(cid, options.uid || 0, false);
  const namespacePath = await getNamespaceWikiPath(category, {
    settings: options.settings,
    uid: options.uid
  });
  const q = normalizeText(options.q);
  if (!namespacePath) {
    return [];
  }

  return topicList.filter((topic) => {
    if (!topic || topic.deleted || topic.scheduled || !topic.slug) {
      return false;
    }
    if (!q) {
      return options.scope === "current-namespace";
    }
    const title = normalizeText(topic.titleRaw || topic.title);
    return title.includes(q);
  }).map((topic) => {
    const titlePath = serializer.getTitlePath(topic.titleRaw || topic.title);
    const titleLeaf = titlePath.length ? titlePath[titlePath.length - 1] : topic.title;
    const wikiPath = topic.wikiPath || "";
    if (!wikiPath) {
      return null;
    }
    const result = {
      type: "page",
      title: topic.title,
      titleLeaf,
      titlePath,
      namespacePath,
      wikiPath,
      cid,
      tid: topic.tid,
      slug: topic.slug
    };
    result.insertText = pageInsertText(result, options.context, options.cid);
    return result;
  }).filter(Boolean);
}

async function search(options) {
  const settings = await config.getSettings();
  if (!settings.isConfigured) {
    return [];
  }

  const context = options.context === "forum" ? "forum" : "wiki";
  const limit = clampLimit(options.limit);
  const q = normalizeText(options.q);
  const type = normalizeType(options.type);
  const categoryList = await getCandidateCategories(settings, options);
  const results = [];

  for (const category of categoryList) {
    if (!await canReadCategory(category.cid, options.uid)) {
      continue;
    }

    const namespacePath = await getNamespaceWikiPath(category, { settings, uid: options.uid });
    if (type !== "page" && textMatchesQuery(q, [category.name, namespacePath])) {
      const namespaceResult = await buildNamespaceResult(category, context, { settings, uid: options.uid });
      if (namespaceResult) {
        results.push(namespaceResult);
      }
    }

    if (type !== "namespace") {
      const pageResults = await getPageResults(category, {
        ...options,
        context,
        q,
        settings
      });
      results.push(...pageResults);
    }
  }

  results.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "namespace" ? -1 : 1;
    }
    return 0;
  });

  return results.slice(0, limit);
}

async function apiSearch(req, res) {
  const results = await search({
    q: req.query && req.query.q,
    context: req.query && req.query.context,
    cid: req.query && req.query.cid,
    scope: req.query && req.query.scope,
    type: req.query && req.query.type,
    limit: req.query && req.query.limit,
    uid: req.uid
  });

  return helpers.formatApiResponse(200, res, { results });
}

module.exports = {
  apiSearch,
  search
};
