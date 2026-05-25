"use strict";

const nconf = require.main.require("nconf");
const categories = require.main.require("./src/categories");
const privileges = require.main.require("./src/privileges");
const topics = require.main.require("./src/topics");

const config = require("./config");
const serializer = require("./serializer");
const wikiCanonicalPathAdapter = require("./wiki-canonical-path-adapter");
const wikiPaths = require("./wiki-paths");

const WIKI_LINK_REGEX = /\[\[([^[\]|]+(?:\/[^[\]|]+)*)(?:\|([^[\]]+))?\]\]/g;
const WIKI_LINK_ENTITY_REGEX = /<span\b(?=[^>]*\bdata-wiki-entity=(["'])(page|namespace)\1)([^>]*)>([\s\S]*?)<\/span>/gi;
const WIKI_RENDERED_ANCHOR_REGEX = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

function normalizeSegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function compactNormalizedSegment(value) {
  return normalizeSegment(value).replace(/\s+/g, "");
}

function normalizeTitle(value) {
  return normalizeSegment(value);
}

function addNormalizedMatchKey(keys, value) {
  const normalized = normalizeSegment(value);
  if (!normalized) {
    return;
  }
  keys.add(normalized);
  keys.add(compactNormalizedSegment(normalized));
}

function getSimpleSingularAlias(value) {
  const normalized = normalizeSegment(value);
  if (normalized.endsWith("ies") && normalized.length > 3) {
    return `${normalized.slice(0, -3)}y`;
  }
  if (normalized.endsWith("ses") && normalized.length > 3) {
    return normalized.slice(0, -2);
  }
  if (normalized.endsWith("s") && normalized.length > 1) {
    return normalized.slice(0, -1);
  }
  return "";
}

function getSimplePluralAlias(value) {
  const normalized = normalizeSegment(value);
  if (!normalized || normalized.endsWith("s")) {
    return "";
  }
  if (normalized.endsWith("y") && normalized.length > 1) {
    return `${normalized.slice(0, -1)}ies`;
  }
  if (normalized.endsWith("ss") || normalized.endsWith("x") || normalized.endsWith("ch") || normalized.endsWith("sh")) {
    return `${normalized}es`;
  }
  return `${normalized}s`;
}

function splitTargetPath(rawTarget) {
  const target = String(rawTarget || "").trim();
  const colonMatch = target.match(/^([^:/[\]|]+)\s*:\s*(.+)$/);
  const pathValue = colonMatch && !/^ns:/i.test(target) ?
    `${colonMatch[1].trim()}/${colonMatch[2].trim()}` :
    target;

  return pathValue.split("/").map((segment) => segment.trim()).filter(Boolean);
}

function splitTargetFragment(rawTarget) {
  const value = String(rawTarget || "").trim();
  const hashIndex = value.indexOf("#");
  if (hashIndex === -1) {
    return {
      target: value,
      fragment: ""
    };
  }
  return {
    target: value.slice(0, hashIndex).trim(),
    fragment: normalizeSectionFragment(value.slice(hashIndex + 1))
  };
}

function normalizeSectionFragment(value) {
  let fragment = String(value || "").trim();
  if (!fragment) {
    return "";
  }
  try {
    fragment = decodeURIComponent(fragment);
  } catch (err) {
    /* Keep the literal user input when it is not valid percent-encoding. */
  }
  if (typeof fragment.normalize === "function") {
    fragment = fragment.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }
  return fragment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function withSectionFragment(wikiPath, fragment) {
  const path = String(wikiPath || "");
  const section = normalizeSectionFragment(fragment);
  return section ? `${path}#${encodeURIComponent(section)}` : path;
}

/**
 * Turn a wiki path leaf like "a-page" or "My_Topic" into readable link text
 * (e.g. "A page"). Does not run when an explicit [[target|label]] or resolved
 * topic title is used.
 */
function humanizeWikiPageSegment(segment) {
  const normalized = normalizeSegment(segment);
  if (!normalized.length) {
    return String(segment || "").trim();
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Visible anchor text: explicit pipe label wins, else real topic title, else
 * humanized path leaf.
 */
function resolveWikiLinkDisplayLabel(explicitPipeLabel, pageTitleSegment, resolvedTopic) {
  const pipe = String(explicitPipeLabel || "").trim();
  if (pipe.length) {
    return pipe;
  }
  if (resolvedTopic && resolvedTopic.title) {
    return resolvedTopic.title;
  }
  return humanizeWikiPageSegment(pageTitleSegment);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, "").trim();
}

function getHtmlAttribute(source, name) {
  const re = new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  const match = String(source || "").match(re);
  return match ? decodeHtmlAttribute(match[2]) : "";
}

function hasClassToken(attrs, token) {
  return String(getHtmlAttribute(attrs, "class") || "").split(/\s+/).includes(token);
}

function getConfiguredRelativePath() {
  return String(nconf.get("relative_path") || "").replace(/\/+$/g, "");
}

function splitHrefParts(href) {
  let value = decodeHtmlAttribute(href).trim();
  let fragment = "";
  let query = "";

  const hashIndex = value.indexOf("#");
  if (hashIndex !== -1) {
    fragment = value.slice(hashIndex + 1);
    value = value.slice(0, hashIndex);
  }

  const queryIndex = value.indexOf("?");
  if (queryIndex !== -1) {
    query = value.slice(queryIndex + 1);
    value = value.slice(0, queryIndex);
  }

  return { path: value, query, fragment };
}

function getWikiHrefParts(href) {
  const rawHref = decodeHtmlAttribute(href).trim();
  if (
    !rawHref ||
    rawHref.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(rawHref)
  ) {
    return null;
  }

  const parts = splitHrefParts(rawHref);
  const params = new URLSearchParams(parts.query || "");
  if (params.get("redlink") === "1" || params.has("create")) {
    return null;
  }

  let path = parts.path;
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  const relativePath = getConfiguredRelativePath();
  if (relativePath && (path === `${relativePath}/wiki` || path.startsWith(`${relativePath}/wiki/`))) {
    path = path.slice(relativePath.length) || "/wiki";
  }

  if (path !== "/wiki" && !path.startsWith("/wiki/")) {
    return null;
  }

  return {
    requestPath: path.replace(/^\/wiki\/?/, ""),
    fragment: parts.fragment
  };
}

function getWikiHrefFinalSegment(parts) {
  const segments = wikiPaths.splitPath(parts && parts.requestPath);
  const rawSegment = segments.length ? segments[segments.length - 1] : "";
  try {
    return decodeURIComponent(rawSegment);
  } catch (err) {
    return rawSegment;
  }
}

function parseStableWikiTarget(target) {
  const match = String(target || "").trim().match(/^(tid|topic|cid|category)\s*:\s*(\d+)$/i);
  if (!match) {
    return null;
  }
  const id = parseInt(match[2], 10);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  return {
    type: /^(tid|topic)$/i.test(match[1]) ? "page" : "namespace",
    id
  };
}

function replaceWikiEntityLinksWithLegacySyntax(content) {
  return String(content || "").replace(WIKI_LINK_ENTITY_REGEX, (source, quote, entityType, attrs, inner) => {
    const target = getHtmlAttribute(attrs, "data-wiki-target").trim();
    if (!target) {
      return stripHtml(inner);
    }
    const label = (getHtmlAttribute(attrs, "data-wiki-label") || stripHtml(inner)).trim();
    const legacyTarget = entityType === "namespace" ? `ns:${target}` : target;
    return label && label !== target.split("/").pop() ?
      `[[${legacyTarget}|${label}]]` :
      `[[${legacyTarget}]]`;
  });
}

function getCategoryMatchKeys(category) {
  const keys = new Set();
  const name = normalizeSegment(category.name);
  addNormalizedMatchKey(keys, name);
  addNormalizedMatchKey(keys, getSimpleSingularAlias(name));
  addNormalizedMatchKey(keys, getSimplePluralAlias(name));

  if (category.slug) {
    const slugLeaf = String(category.slug).split("/").pop();
    const normalizedSlugLeaf = normalizeSegment(slugLeaf);
    addNormalizedMatchKey(keys, normalizedSlugLeaf);
    addNormalizedMatchKey(keys, getSimpleSingularAlias(normalizedSlugLeaf));
    addNormalizedMatchKey(keys, getSimplePluralAlias(normalizedSlugLeaf));
  }

  return keys;
}

function isInWikiCategory(cid, settings) {
  return Number.isInteger(cid) && settings.effectiveCategoryIds.includes(cid);
}

async function getPostCategoryId(postData, settings) {
  const directCid = parseInt(
    postData && (
      postData.cid ||
      (postData.category && postData.category.cid) ||
      (postData.topic && postData.topic.cid)
    ),
    10
  );

  if (isInWikiCategory(directCid, settings)) {
    return directCid;
  }

  const tid = parseInt(
    postData && (
      postData.tid ||
      (postData.topic && postData.topic.tid)
    ),
    10
  );

  if (!Number.isInteger(tid) || tid <= 0) {
    return null;
  }

  const topicData = await topics.getTopicData(tid);
  const topicCid = parseInt(topicData && topicData.cid, 10);
  return isInWikiCategory(topicCid, settings) ? topicCid : null;
}

async function getEffectiveCategories(settings) {
  const categoryList = await Promise.all(
    settings.effectiveCategoryIds.map((cid) => categories.getCategoryData(cid))
  );

  return categoryList.filter(Boolean);
}

function normalizeViewerContext(uid) {
  if (uid === undefined || uid === null) {
    return { hasViewerUid: true, viewerUid: 0 };
  }
  const parsed = parseInt(uid, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { hasViewerUid: true, viewerUid: 0 };
  }
  return { hasViewerUid: true, viewerUid: parsed };
}

function getParseViewerUid(data) {
  if (data && data.uid !== undefined && data.uid !== null) {
    return data.uid;
  }
  if (data && data.req && data.req.uid !== undefined && data.req.uid !== null) {
    return data.req.uid;
  }
  return undefined;
}

async function buildResolverContext(currentCategoryId, settings, viewerContext) {
  const normalizedViewer = viewerContext || { hasViewerUid: false, viewerUid: 0 };
  const viewerUid = normalizedViewer.viewerUid;
  const hasViewerUid = !!normalizedViewer.hasViewerUid;
  const categoryList = await getEffectiveCategories(settings);
  const categoryByCid = new Map(categoryList.map((category) => [parseInt(category.cid, 10), category]));
  const rootCategories = findRootCategories(categoryList, settings);
  const namespacePathByCid = new Map();
  const namespaceInfoByCid = new Map();
  const topicVisibilityByTid = new Map();
  const topicRowsByCid = new Map();
  const topicMatchByCidAndTarget = new Map();
  let defaultRedlinkCategory;
  let hasDefaultRedlinkCategory = false;

  async function getNamespaceInfo(category) {
    const cid = parseInt(category && category.cid, 10);
    if (!Number.isInteger(cid) || cid <= 0) {
      return { wikiPath: "" };
    }
    if (!hasViewerUid) {
      return { wikiPath: "" };
    }
    if (!namespaceInfoByCid.has(cid)) {
      namespaceInfoByCid.set(cid, await wikiCanonicalPathAdapter.getCanonicalNamespaceInfo(category, {
        settings,
        uid: viewerUid
      }));
    }
    return namespaceInfoByCid.get(cid);
  }

  async function getNamespacePath(category) {
    const cid = parseInt(category && category.cid, 10);
    if (!Number.isInteger(cid) || cid <= 0) {
      return "";
    }
    if (!namespacePathByCid.has(cid)) {
      const namespaceInfo = await getNamespaceInfo(category);
      namespacePathByCid.set(cid, namespaceInfo.wikiPath || "");
    }
    return namespacePathByCid.get(cid);
  }

  function getTopicRows(cid) {
    const parsedCid = parseInt(cid, 10);
    if (!Number.isInteger(parsedCid) || parsedCid <= 0) {
      return Promise.resolve([]);
    }
    if (!topicRowsByCid.has(parsedCid)) {
      const wikiDirectory = require("./wiki-directory-service");
      topicRowsByCid.set(parsedCid, wikiDirectory.getAllTopicSlugRows(parsedCid));
    }
    return topicRowsByCid.get(parsedCid);
  }

  async function canReadTopic(topic) {
    const tid = parseInt(topic && topic.tid, 10);
    if (!Number.isInteger(tid) || tid <= 0 || !hasViewerUid) {
      return false;
    }
    if (!topicVisibilityByTid.has(tid)) {
      let visible = true;
      if (privileges && privileges.topics && typeof privileges.topics.filterTids === "function") {
        const filtered = await privileges.topics.filterTids("topics:read", [tid], viewerUid);
        visible = Array.isArray(filtered) && filtered.map((value) => parseInt(value, 10)).includes(tid);
      }
      topicVisibilityByTid.set(tid, visible);
    }
    return topicVisibilityByTid.get(tid);
  }

  async function getDefaultCategory() {
    if (!hasDefaultRedlinkCategory) {
      defaultRedlinkCategory = categoryList.slice().sort((a, b) => parseInt(a.cid, 10) - parseInt(b.cid, 10))[0] || null;
      hasDefaultRedlinkCategory = true;
    }
    return defaultRedlinkCategory;
  }

  return {
    settings,
    hasViewerUid,
    viewerUid,
    currentCategoryId,
    categoryList,
    categoryByCid,
    rootCategories,
    getNamespacePath,
    getNamespaceInfo,
    canReadTopic,
    getTopicRows,
    topicMatchByCidAndTarget,
    getDefaultCategory
  };
}

function isContextNamespacePathReserved(path) {
  const first = String(path || "").replace(/^\/wiki\/?/, "").split("/").filter(Boolean)[0];
  return !!(first && wikiPaths.RESERVED_FIRST_SEGMENTS.has(first.toLowerCase()));
}

function findRootCategories(categoryList, settings) {
  return categoryList.filter((category) => {
    const parentCid = parseInt(category.parentCid, 10);
    return !Number.isInteger(parentCid) || !settings.effectiveCategoryIds.includes(parentCid);
  });
}

function findMatchingCategory(categoriesToSearch, segment) {
  const normalizedSegment = normalizeSegment(segment);

  return categoriesToSearch.find((category) => (
    getCategoryMatchKeys(category).has(normalizedSegment)
  )) || null;
}

function getChildCategories(categoryList, parentCid) {
  return categoryList.filter((category) => parseInt(category.parentCid, 10) === parseInt(parentCid, 10));
}

function buildCategoryChain(categoryList, category) {
  const chain = [];
  let currentCategory = category;

  while (currentCategory) {
    chain.unshift(currentCategory);

    const parentCid = parseInt(currentCategory.parentCid, 10);
    currentCategory = Number.isInteger(parentCid) ?
      categoryList.find((entry) => parseInt(entry.cid, 10) === parentCid) :
      null;
  }

  return chain;
}

function matchesCategoryChain(chain, namespaceSegments) {
  if (namespaceSegments.length > chain.length) {
    return false;
  }

  const candidateSegments = chain.slice(chain.length - namespaceSegments.length);

  return namespaceSegments.every((segment, index) => (
    getCategoryMatchKeys(candidateSegments[index]).has(normalizeSegment(segment))
  ));
}

function resolveRelativeNamespace(categoryList, currentCategoryId, namespaceSegments) {
  let currentCategory = categoryList.find((category) => parseInt(category.cid, 10) === parseInt(currentCategoryId, 10));

  if (!currentCategory) {
    return null;
  }

  for (const segment of namespaceSegments) {
    currentCategory = findMatchingCategory(getChildCategories(categoryList, currentCategory.cid), segment);

    if (!currentCategory) {
      return null;
    }
  }

  return currentCategory;
}

function resolveAbsoluteNamespace(categoryList, settings, namespaceSegments) {
  if (!namespaceSegments.length) {
    return null;
  }

  let currentCategory = findMatchingCategory(findRootCategories(categoryList, settings), namespaceSegments[0]);

  if (!currentCategory) {
    return null;
  }

  for (const segment of namespaceSegments.slice(1)) {
    currentCategory = findMatchingCategory(getChildCategories(categoryList, currentCategory.cid), segment);

    if (!currentCategory) {
      return null;
    }
  }

  return currentCategory;
}

function resolveNamespaceBySuffix(categoryList, namespaceSegments) {
  const matches = categoryList.filter((category) => (
    matchesCategoryChain(buildCategoryChain(categoryList, category), namespaceSegments)
  ));

  return matches.length === 1 ? matches[0] : null;
}

function wrapForumWikiLinkInner(forumBookIcon, escapedLabelHtml) {
  if (!forumBookIcon) {
    return escapedLabelHtml;
  }
  return `<i class="fa-solid fa-fw fa-book wiki-forum-link-icon" aria-hidden="true"></i><span class="wiki-forum-link-text">${escapedLabelHtml}</span>`;
}

function buildWikiTitlePathInner(topic, fallbackLabel) {
  const titlePath = serializer.getTitlePath(topic && (topic.titleRaw || topic.title));
  if (titlePath.length <= 1) {
    return escapeHtml(fallbackLabel);
  }

  const parents = titlePath.slice(0, -1).map((segment) => (
    `<span class="wiki-topic-title-parent">${escapeHtml(segment)}</span><span class="wiki-topic-title-separator" aria-hidden="true">/</span>`
  )).join("");
  const leaf = titlePath[titlePath.length - 1];
  return `<span class="wiki-topic-parent-path">${parents}</span><span class="wiki-topic-title-leaf">${escapeHtml(leaf)}</span>`;
}

async function buildRedlinkMarkdown(label, category, pageTitle, forumBookIcon, context) {
  const namespacePath = context ?
    await context.getNamespacePath(category) :
    (await wikiCanonicalPathAdapter.getCanonicalNamespaceInfo(category)).wikiPath;
  if (!namespacePath) {
    return escapeHtml(label);
  }
  const createPath = `${namespacePath}?create=${encodeURIComponent(pageTitle)}&redlink=1&cid=${encodeURIComponent(category.cid)}`;
  const rel = nconf.get("relative_path") || "";
  const href = `${rel}${createPath}`;
  const cls = forumBookIcon ? "wiki-redlink wiki-link-from-forum" : "wiki-redlink";
  const inner = wrapForumWikiLinkInner(forumBookIcon, escapeHtml(label));
  return `<a class="${cls}" href="${escapeHtml(href)}">${inner}</a>`;
}

function buildWikiArticleLink(label, wikiPath, forumBookIcon, options = {}) {
  const rel = nconf.get("relative_path") || "";
  const href = `${rel}${withSectionFragment(wikiPath, options.fragment)}`;
  const extraClass = options.isSubpagePath ? " wiki-subpage-link" : "";
  const cls = forumBookIcon ? `wiki-internal-link${extraClass} wiki-link-from-forum` : `wiki-internal-link${extraClass}`;
  const labelHtml = options.useTitlePathMarkup ?
    buildWikiTitlePathInner(options.topic, label) :
    escapeHtml(label);
  const inner = wrapForumWikiLinkInner(forumBookIcon, labelHtml);
  return `<a class="${cls}" href="${escapeHtml(href)}">${inner}</a>`;
}

async function buildWikiNamespaceLink(label, category, forumBookIcon, context) {
  const rel = nconf.get("relative_path") || "";
  const namespacePath = context ?
    await context.getNamespacePath(category) :
    (await wikiCanonicalPathAdapter.getCanonicalNamespaceInfo(category)).wikiPath;
  if (!namespacePath) {
    return escapeHtml(label);
  }
  const href = `${rel}${namespacePath}`;
  const cls = forumBookIcon ?
    "wiki-internal-link wiki-namespace-link wiki-link-from-forum" :
    "wiki-internal-link wiki-namespace-link";
  const inner = wrapForumWikiLinkInner(forumBookIcon, escapeHtml(label));
  return `<a class="${cls}" href="${escapeHtml(href)}">${inner}</a>`;
}

function resolveNamespaceLinkDisplayLabel(explicitPipeLabel, namespaceSegments, resolvedCategory) {
  const pipe = String(explicitPipeLabel || "").trim();
  if (pipe.length) {
    return pipe;
  }
  if (resolvedCategory && resolvedCategory.name) {
    return resolvedCategory.name;
  }
  const leaf = namespaceSegments[namespaceSegments.length - 1];
  return humanizeWikiPageSegment(leaf);
}

async function resolveTargetCategory(categoryId, namespaceSegments, settings, context) {
  const categoryList = context ? context.categoryList : await getEffectiveCategories(settings);

  if (!namespaceSegments.length) {
    const parsedCategoryId = parseInt(categoryId, 10);
    return context && context.categoryByCid.has(parsedCategoryId) ?
      context.categoryByCid.get(parsedCategoryId) :
      categoryList.find((category) => parseInt(category.cid, 10) === parsedCategoryId) || null;
  }

  return (
    resolveRelativeNamespace(categoryList, categoryId, namespaceSegments) ||
    resolveAbsoluteNamespace(categoryList, settings, namespaceSegments) ||
    resolveNamespaceBySuffix(categoryList, namespaceSegments)
  );
}

async function filterVisibleTopicMatches(matches, cid, context) {
  const visible = [];
  const seen = new Set();
  for (const topic of Array.isArray(matches) ? matches : []) {
    const topicWithCid = topic && topic.cid == null ? { ...topic, cid } : topic;
    if (!await context.canReadTopic(topicWithCid)) {
      continue;
    }
    const tid = parseInt(topicWithCid && topicWithCid.tid, 10);
    const key = Number.isInteger(tid) && tid > 0 ? `tid:${tid}` : `row:${visible.length}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    visible.push(topic);
  }
  return visible;
}

async function resolveExistingTopicByTitleOrSlug(cid, pageTitleOrSlug, context) {
  const wikiDirectory = require("./wiki-directory-service");
  const parsedCid = parseInt(cid, 10);
  if (!Number.isInteger(parsedCid) || parsedCid <= 0) {
    return null;
  }
  const targetKey = `${parsedCid}:${wikiDirectory.normalizeWikiLinkTitle(pageTitleOrSlug)}:${wikiPaths.normalizeTitleToSlugLeaf(pageTitleOrSlug)}`;
  if (context && context.topicMatchByCidAndTarget.has(targetKey)) {
    return context.topicMatchByCidAndTarget.get(targetKey);
  }

  const pageSlug = wikiPaths.normalizeTitleToSlugLeaf(pageTitleOrSlug);
  const normalizedTitle = wikiDirectory.normalizeWikiLinkTitle(pageTitleOrSlug);
  const rows = context ? await context.getTopicRows(parsedCid) : await wikiDirectory.getAllTopicSlugRows(parsedCid);
  const liveRows = rows.filter((topic) => (
    topic &&
    !parseInt(topic.deleted, 10) &&
    !parseInt(topic.scheduled, 10)
  ));

  const exactTitleMatches = liveRows.filter((topic) => (
    wikiDirectory.normalizeWikiLinkTitle(topic.titleRaw || topic.title || "") === normalizedTitle
  ));

  const slugMatches = liveRows.filter((topic) => (
    wikiPaths.getTopicSlugLeaf(topic) === pageSlug
  ));

  const leafTitleMatches = liveRows.filter((topic) => {
    const titlePath = serializer.getTitlePath(topic.titleRaw || topic.title || "");
    const titleLeaf = titlePath.length ? titlePath[titlePath.length - 1] : topic.title;
    return wikiDirectory.normalizeWikiLinkTitle(titleLeaf) === normalizedTitle;
  });

  let resolvedMatches;
  if (context) {
    if (!context.hasViewerUid) {
      context.topicMatchByCidAndTarget.set(targetKey, null);
      return null;
    }
    const visibleExactTitleMatches = await filterVisibleTopicMatches(exactTitleMatches, parsedCid, context);
    const visibleSlugMatches = await filterVisibleTopicMatches(slugMatches, parsedCid, context);
    const visibleLeafTitleMatches = await filterVisibleTopicMatches(leafTitleMatches, parsedCid, context);
    resolvedMatches = visibleExactTitleMatches.length ? visibleExactTitleMatches : (
      visibleSlugMatches.length ? visibleSlugMatches : visibleLeafTitleMatches
    );
  } else {
    resolvedMatches = exactTitleMatches.length ? exactTitleMatches : (
      slugMatches.length ? slugMatches : leafTitleMatches
    );
  }

  if (resolvedMatches.length !== 1) {
    if (context) {
      context.topicMatchByCidAndTarget.set(targetKey, null);
    }
    return null;
  }

  const result = resolvedMatches[0].cid == null ? { ...resolvedMatches[0], cid: parsedCid } : resolvedMatches[0];
  if (context) {
    context.topicMatchByCidAndTarget.set(targetKey, result);
  }
  return result;
}

async function getArticlePathForTopic(topic, fallbackCategory, context) {
  const topicWithCid = topic && topic.cid == null && fallbackCategory ?
    { ...topic, cid: fallbackCategory.cid } :
    topic;
  if (!context || !context.hasViewerUid) {
    return "";
  }
  if (context && topicWithCid && topicWithCid.cid != null) {
    if (!await context.canReadTopic(topicWithCid)) {
      return "";
    }
    const category = context.categoryByCid.get(parseInt(topicWithCid.cid, 10)) || fallbackCategory;
    const namespaceInfo = category ? await context.getNamespaceInfo(category) : null;
    const pageInfo = await wikiCanonicalPathAdapter.getCanonicalPageInfo(topicWithCid, {
      namespaceInfo,
      uid: context.viewerUid
    });
    return pageInfo.wikiPath || "";
  }
  return "";
}

/**
 * For posts outside wiki categories: resolve [[PageTitle]] by title across
 * all configured wiki namespaces (deterministic lowest cid first).
 */
async function findTopicByTitleInAnyWikiCategory(pageTitle, settings, context) {
  const cids = [...settings.effectiveCategoryIds].sort((a, b) => a - b);

  for (const cid of cids) {
    const topic = await resolveExistingTopicByTitleOrSlug(cid, pageTitle, context);
    if (topic && topic.slug) {
      return topic;
    }
  }

  return null;
}

async function findUniqueTopicByTitleInAnyWikiCategory(pageTitle, settings, context) {
  const cids = [...settings.effectiveCategoryIds].sort((a, b) => a - b);
  const matches = [];
  const seenTids = new Set();

  for (const cid of cids) {
    const topic = await resolveExistingTopicByTitleOrSlug(cid, pageTitle, context);
    const tid = parseInt(topic && topic.tid, 10);
    if (topic && topic.slug && Number.isInteger(tid) && tid > 0 && !seenTids.has(tid)) {
      seenTids.add(tid);
      matches.push(topic);
    }
  }

  return matches.length === 1 ? matches[0] : null;
}

async function getDefaultRedlinkCategory(settings, context) {
  if (context) {
    return context.getDefaultCategory();
  }
  const list = await getEffectiveCategories(settings);
  if (!list.length) {
    return null;
  }
  return list.slice().sort((a, b) => parseInt(a.cid, 10) - parseInt(b.cid, 10))[0];
}

async function buildStableWikiTargetLink(stableTarget, explicitPipeLabel, fallbackLabel, forumBookIcon, context, fragment) {
  if (!stableTarget) {
    return "";
  }

  if (stableTarget.type === "page") {
    const topic = await topics.getTopicData(stableTarget.id);
    const category = context.categoryByCid.get(parseInt(topic && topic.cid, 10));
    const displayLabel = resolveWikiLinkDisplayLabel(explicitPipeLabel, fallbackLabel, topic);
    if (!topic || !topic.slug || !category) {
      return escapeHtml(displayLabel || fallbackLabel);
    }

    const wikiPath = await getArticlePathForTopic(topic, category, context);
    if (!wikiPath) {
      return escapeHtml(displayLabel || fallbackLabel);
    }

    return buildWikiArticleLink(displayLabel, wikiPath, forumBookIcon, {
      topic,
      isSubpagePath: serializer.getTitlePath(topic.titleRaw || topic.title).length > 1,
      fragment
    });
  }

  const category = context.categoryByCid.get(stableTarget.id);
  const displayLabel = explicitPipeLabel || String(category && category.name || fallbackLabel || "").trim();
  if (!category) {
    return escapeHtml(displayLabel || fallbackLabel);
  }

  return buildWikiNamespaceLink(displayLabel, category, forumBookIcon, context);
}

async function buildWikiLinkFromNodeResult(nodeResult, label, forumBookIcon, context, fragment) {
  const node = nodeResult && nodeResult.node;
  if (!node) {
    return "";
  }

  if (node.page && node.page.topic) {
    const topic = node.page.topic;
    const displayLabel = String(label || "").trim() || resolveWikiLinkDisplayLabel("", "", topic);
    return buildWikiArticleLink(displayLabel, nodeResult.wikiPath, forumBookIcon, {
      topic,
      isSubpagePath: serializer.getTitlePath(topic.titleRaw || topic.title).length > 1,
      fragment
    });
  }

  if (node.namespace) {
    const category = context.categoryByCid.get(parseInt(node.namespace.cid, 10)) || node.namespace.category;
    const displayLabel = String(label || "").trim() || String(category && category.name || "").trim();
    if (category && displayLabel) {
      return buildWikiNamespaceLink(displayLabel, category, forumBookIcon, context);
    }
  }

  return "";
}

async function resolveRenderedWikiAnchor(source, attrs, inner, settings, context, forumBookIcon) {
  if (hasClassToken(attrs, "wiki-link-from-forum")) {
    return source;
  }

  const href = getHtmlAttribute(attrs, "href");
  const hrefParts = getWikiHrefParts(href);
  if (!hrefParts) {
    return source;
  }

  const label = stripHtml(inner);
  const directNode = await wikiPaths.resolveWikiNode(hrefParts.requestPath, {
    uid: context.viewerUid
  });
  if (directNode.status === "ok") {
    return (await buildWikiLinkFromNodeResult(directNode, label, forumBookIcon, context, hrefParts.fragment)) || source;
  }

  const finalSegment = getWikiHrefFinalSegment(hrefParts);
  const fallbackLabels = [...new Set([
    label,
    humanizeWikiPageSegment(finalSegment)
  ].map((value) => String(value || "").trim()).filter(Boolean))];

  for (const candidate of fallbackLabels) {
    const topic = await findUniqueTopicByTitleInAnyWikiCategory(candidate, settings, context);
    if (!topic) {
      continue;
    }
    const category = context.categoryByCid.get(parseInt(topic.cid, 10));
    const wikiPath = await getArticlePathForTopic(topic, category, context);
    if (!wikiPath) {
      continue;
    }
    return buildWikiArticleLink(label || resolveWikiLinkDisplayLabel("", candidate, topic), wikiPath, forumBookIcon, {
      topic,
      isSubpagePath: serializer.getTitlePath(topic.titleRaw || topic.title).length > 1,
      fragment: hrefParts.fragment
    });
  }

  return source;
}

async function replaceRenderedWikiAnchors(content, currentCategoryId, settings, viewerUid) {
  const source = String(content || "");
  WIKI_RENDERED_ANCHOR_REGEX.lastIndex = 0;
  const matches = [...source.matchAll(WIKI_RENDERED_ANCHOR_REGEX)];
  if (!matches.length) {
    return source;
  }

  const forumBookIcon = !Number.isInteger(currentCategoryId);
  const context = await buildResolverContext(currentCategoryId, settings, normalizeViewerContext(viewerUid));
  const replacements = await Promise.all(matches.map(async (match) => ({
    source: match[0],
    replacement: await resolveRenderedWikiAnchor(match[0], match[1], match[2], settings, context, forumBookIcon)
  })));

  let nextContent = source;
  replacements.forEach(({ source: matchSource, replacement }) => {
    nextContent = nextContent.split(matchSource).join(replacement);
  });
  return nextContent;
}

async function replaceWikiLinks(content, currentCategoryId, settings, viewerUid) {
  content = replaceWikiEntityLinksWithLegacySyntax(content);
  // Global regex: never call .test() on WIKI_LINK_REGEX without resetting lastIndex
  // before matchAll, or matchAll returns nothing (lastIndex left past the first match).
  WIKI_LINK_REGEX.lastIndex = 0;
  const matches = [...String(content || "").matchAll(WIKI_LINK_REGEX)];

  if (!matches.length) {
    return content;
  }

  const forumBookIcon = !Number.isInteger(currentCategoryId);
  const context = await buildResolverContext(currentCategoryId, settings, normalizeViewerContext(viewerUid));

  const replacements = await Promise.all(matches.map(async (match) => {
    const rawTarget = String(match[1] || "").trim();
    const targetParts = splitTargetFragment(rawTarget);
    const targetWithoutFragment = targetParts.target;
    const sectionFragment = targetParts.fragment;
    const explicitPipeLabel = String(match[2] || "").trim();
    const labelFallback = targetWithoutFragment.split("/").pop().trim();
    const stableTarget = parseStableWikiTarget(targetWithoutFragment);

    if (stableTarget) {
      return {
        source: match[0],
        replacement: await buildStableWikiTargetLink(
          stableTarget,
          explicitPipeLabel,
          labelFallback,
          forumBookIcon,
          context,
          sectionFragment
        )
      };
    }

    const pathSegments = splitTargetPath(targetWithoutFragment);

    if (!pathSegments.length) {
      const plain = explicitPipeLabel || labelFallback || sectionFragment;
      return { source: match[0], replacement: escapeHtml(plain) };
    }

    if (/^ns:/i.test(targetWithoutFragment)) {
      const nsBody = targetWithoutFragment.replace(/^ns:/i, "").trim();
      const namespaceSegments = splitTargetPath(nsBody);
      if (!namespaceSegments.length) {
        const plain = explicitPipeLabel || targetWithoutFragment;
        return { source: match[0], replacement: escapeHtml(plain) };
      }
      const targetNsCategory = await resolveTargetCategory(currentCategoryId, namespaceSegments, settings, context);
      const nsDisplayLabel = resolveNamespaceLinkDisplayLabel(
        explicitPipeLabel,
        namespaceSegments,
        targetNsCategory
      );
      if (!targetNsCategory) {
        return { source: match[0], replacement: escapeHtml(nsDisplayLabel) };
      }
      return {
        source: match[0],
        replacement: await buildWikiNamespaceLink(nsDisplayLabel, targetNsCategory, forumBookIcon, context)
      };
    }

    const pageTitle = pathSegments[pathSegments.length - 1];
    const namespaceSegments = pathSegments.slice(0, -1);

    if (namespaceSegments.length && Number.isInteger(currentCategoryId)) {
      const currentCategory = await resolveTargetCategory(currentCategoryId, [], settings, context);
      const literalTopic = currentCategory ?
        await resolveExistingTopicByTitleOrSlug(currentCategory.cid, targetWithoutFragment, context) :
        null;
      if (literalTopic && literalTopic.slug) {
        const displayLabel = resolveWikiLinkDisplayLabel(explicitPipeLabel, targetWithoutFragment, literalTopic);
        const literalWikiPath = await getArticlePathForTopic(literalTopic, currentCategory, context);
        if (!literalWikiPath) {
          return { source: match[0], replacement: escapeHtml(displayLabel) };
        }
        return {
          source: match[0],
          replacement: buildWikiArticleLink(displayLabel, literalWikiPath, forumBookIcon, {
            topic: literalTopic,
            isSubpagePath: serializer.getTitlePath(literalTopic.titleRaw || literalTopic.title).length > 1,
            fragment: sectionFragment
          })
        };
      }
    }

    if (namespaceSegments.length) {
      const namespaceCategory = await resolveTargetCategory(currentCategoryId, namespaceSegments, settings, context);
      const namespacePath = namespaceCategory ? await context.getNamespacePath(namespaceCategory) : "";
      const canonicalTopic = namespaceCategory ?
        await resolveExistingTopicByTitleOrSlug(namespaceCategory.cid, pageTitle, context) :
        null;
      if (canonicalTopic && canonicalTopic.slug) {
        const displayLabel = resolveWikiLinkDisplayLabel(explicitPipeLabel, pageTitle, canonicalTopic);
        const wikiPath = await getArticlePathForTopic(canonicalTopic, namespaceCategory, context);
        if (!wikiPath) {
          return { source: match[0], replacement: escapeHtml(displayLabel) };
        }
        return {
          source: match[0],
          replacement: buildWikiArticleLink(displayLabel, wikiPath, forumBookIcon, {
            topic: canonicalTopic,
            isSubpagePath: serializer.getTitlePath(canonicalTopic.titleRaw || canonicalTopic.title).length > 1,
            fragment: sectionFragment
          })
        };
      }
    }

    const targetCategory = await resolveTargetCategory(currentCategoryId, namespaceSegments, settings, context);

    if (!targetCategory) {
      const currentCategory = await resolveTargetCategory(currentCategoryId, [], settings, context);
      const fallbackTitle = namespaceSegments.length ? targetWithoutFragment : pageTitle;
      let fallbackTopic = currentCategory ? await resolveExistingTopicByTitleOrSlug(currentCategory.cid, fallbackTitle, context) : null;

      const isBarePageLink = !namespaceSegments.length && !/^ns:/i.test(targetWithoutFragment);
      if (!fallbackTopic && isBarePageLink) {
        fallbackTopic = await findTopicByTitleInAnyWikiCategory(pageTitle, settings, context);
      }

      const displayLabel = resolveWikiLinkDisplayLabel(explicitPipeLabel, pageTitle, fallbackTopic);

      if (fallbackTopic && fallbackTopic.slug) {
        const fallbackWikiPath = await getArticlePathForTopic(fallbackTopic, currentCategory, context);
        if (!fallbackWikiPath) {
          return { source: match[0], replacement: escapeHtml(displayLabel) };
        }
        return {
          source: match[0],
          replacement: buildWikiArticleLink(displayLabel, fallbackWikiPath, forumBookIcon, {
            topic: fallbackTopic,
            isSubpagePath: serializer.getTitlePath(fallbackTopic.titleRaw || fallbackTopic.title).length > 1,
            useTitlePathMarkup: !explicitPipeLabel && isBarePageLink,
            fragment: sectionFragment
          })
        };
      }

      const redlinkCategory = currentCategory || await getDefaultRedlinkCategory(settings, context);
      return {
        source: match[0],
        replacement: redlinkCategory ?
          await buildRedlinkMarkdown(displayLabel, redlinkCategory, fallbackTitle, forumBookIcon, context) :
          escapeHtml(displayLabel)
      };
    }

    const topic = await resolveExistingTopicByTitleOrSlug(targetCategory.cid, pageTitle, context);
    const displayLabel = resolveWikiLinkDisplayLabel(explicitPipeLabel, pageTitle, topic);

    if (!topic || !topic.slug) {
      if (!namespaceSegments.length && !/^ns:/i.test(targetWithoutFragment)) {
        const namespaceCategory = await resolveTargetCategory(currentCategoryId, [pageTitle], settings, context);
        if (namespaceCategory) {
          const nsDisplayLabel = resolveNamespaceLinkDisplayLabel(
            explicitPipeLabel,
            [pageTitle],
            namespaceCategory
          );
          return {
            source: match[0],
            replacement: await buildWikiNamespaceLink(nsDisplayLabel, namespaceCategory, forumBookIcon, context)
          };
        }
      }
      return {
        source: match[0],
        replacement: await buildRedlinkMarkdown(displayLabel, targetCategory, pageTitle, forumBookIcon, context)
      };
    }

    const wikiPath = await getArticlePathForTopic(topic, targetCategory, context);
    if (!wikiPath) {
      return { source: match[0], replacement: escapeHtml(displayLabel) };
    }
    return {
      source: match[0],
      replacement: buildWikiArticleLink(displayLabel, wikiPath, forumBookIcon, {
        topic,
        isSubpagePath: serializer.getTitlePath(topic.titleRaw || topic.title).length > 1,
        useTitlePathMarkup: !explicitPipeLabel && !namespaceSegments.length,
        fragment: sectionFragment
      })
    };
  }));

  let nextContent = String(content || "");

  replacements.forEach(({ source, replacement }) => {
    nextContent = nextContent.split(source).join(replacement);
  });

  return nextContent;
}

function contentHasWikiSyntaxMarkers(content) {
  // Do not use WIKI_LINK_REGEX.test() here: it advances lastIndex on the global regex
  // and breaks the subsequent matchAll in replaceWikiLinks.
  const source = String(content || "");
  return source.includes("[[") || /data-wiki-entity=(["'])(?:page|namespace)\1/i.test(source);
}

function contentHasRenderedWikiAnchors(content) {
  return /<a\b[^>]*\bhref\s*=\s*(["'])[^"']*\/wiki(?:\/|["'?#])[\s\S]*?<\/a>/i.test(String(content || ""));
}

function contentHasWikiLinkMarkers(content) {
  return contentHasWikiSyntaxMarkers(content) || contentHasRenderedWikiAnchors(content);
}

async function transformWikiPostContent(data) {
  if (!data || !data.postData || !data.postData.content) {
    return data;
  }

  const settings = await config.getSettings();

  if (!settings.isConfigured) {
    return data;
  }

  const hasSyntaxMarkers = contentHasWikiSyntaxMarkers(data.postData.content);
  const hasRenderedAnchors = contentHasRenderedWikiAnchors(data.postData.content);
  if (!hasSyntaxMarkers && !hasRenderedAnchors) {
    return data;
  }

  const categoryId = await getPostCategoryId(data.postData, settings);
  if (hasSyntaxMarkers) {
    data.postData.content = await replaceWikiLinks(data.postData.content, categoryId, settings, getParseViewerUid(data));
  }
  if (contentHasRenderedWikiAnchors(data.postData.content)) {
    data.postData.content = await replaceRenderedWikiAnchors(data.postData.content, categoryId, settings, getParseViewerUid(data));
  }
  return data;
}

module.exports = {
  transformWikiPostContent,
  getPostCategoryId,
  replaceWikiLinks,
  contentHasWikiLinkMarkers,
  replaceWikiEntityLinksWithLegacySyntax
};
