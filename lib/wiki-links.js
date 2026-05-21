"use strict";

const nconf = require.main.require("nconf");
const categories = require.main.require("./src/categories");
const topics = require.main.require("./src/topics");

const config = require("./config");
const serializer = require("./serializer");
const wikiPaths = require("./wiki-paths");

const WIKI_LINK_REGEX = /\[\[([^[\]|]+(?:\/[^[\]|]+)*)(?:\|([^[\]]+))?\]\]/g;
const WIKI_LINK_ENTITY_REGEX = /<span\b(?=[^>]*\bdata-wiki-entity=(["'])(page|namespace)\1)([^>]*)>([\s\S]*?)<\/span>/gi;

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

async function buildResolverContext(currentCategoryId, settings) {
  const categoryList = await getEffectiveCategories(settings);
  const categoryByCid = new Map(categoryList.map((category) => [parseInt(category.cid, 10), category]));
  const rootCategories = findRootCategories(categoryList, settings);
  const namespacePathCounts = new Map();
  categoryList.forEach((category) => {
    const path = wikiPaths.buildNamespacePathFromCategoryMap(category, categoryByCid, settings);
    namespacePathCounts.set(path, (namespacePathCounts.get(path) || 0) + 1);
  });
  const namespacePathByCid = new Map();
  const topicRowsByCid = new Map();
  const topicMatchByCidAndTarget = new Map();
  let defaultRedlinkCategory;
  let hasDefaultRedlinkCategory = false;

  async function getNamespacePath(category) {
    const cid = parseInt(category && category.cid, 10);
    if (!Number.isInteger(cid) || cid <= 0) {
      return "";
    }
    if (!namespacePathByCid.has(cid)) {
      const contextPath = wikiPaths.buildNamespacePathFromCategoryMap(category, categoryByCid, settings);
      const canUseContextPath = namespacePathCounts.get(contextPath) === 1 && !isContextNamespacePathReserved(contextPath);
      namespacePathByCid.set(cid, canUseContextPath ? contextPath : serializer.buildWikiSectionPath(category));
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

  async function getDefaultCategory() {
    if (!hasDefaultRedlinkCategory) {
      defaultRedlinkCategory = categoryList.slice().sort((a, b) => parseInt(a.cid, 10) - parseInt(b.cid, 10))[0] || null;
      hasDefaultRedlinkCategory = true;
    }
    return defaultRedlinkCategory;
  }

  return {
    settings,
    currentCategoryId,
    categoryList,
    categoryByCid,
    rootCategories,
    getNamespacePath,
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
    await wikiPaths.getNamespacePath(category) || serializer.buildWikiSectionPath(category);
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
    await wikiPaths.getNamespacePath(category) || serializer.buildWikiSectionPath(category);
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
  const matches = rows.filter((topic) => (
    topic &&
    !parseInt(topic.deleted, 10) &&
    !parseInt(topic.scheduled, 10) &&
    (
      wikiPaths.getTopicSlugLeaf(topic) === pageSlug ||
      wikiDirectory.normalizeWikiLinkTitle(topic.titleRaw || topic.title || "") === normalizedTitle
    )
  ));

  const resolvedMatches = matches.length ? matches : rows.filter((topic) => {
    if (!topic || parseInt(topic.deleted, 10) || parseInt(topic.scheduled, 10)) {
      return false;
    }
    const titlePath = serializer.getTitlePath(topic.titleRaw || topic.title || "");
    const titleLeaf = titlePath.length ? titlePath[titlePath.length - 1] : topic.title;
    return wikiDirectory.normalizeWikiLinkTitle(titleLeaf) === normalizedTitle;
  });

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
  if (context && topicWithCid && topicWithCid.cid != null) {
    const category = context.categoryByCid.get(parseInt(topicWithCid.cid, 10)) || fallbackCategory;
    const namespacePath = category ? await context.getNamespacePath(category) : "";
    const pageSlug = wikiPaths.getTopicSlugLeaf(topicWithCid);
    if (namespacePath && pageSlug) {
      return `${namespacePath}/${pageSlug}`;
    }
  }
  return await wikiPaths.getArticlePath(topicWithCid) || wikiPaths.getLegacyArticlePath(topicWithCid);
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

async function replaceWikiLinks(content, currentCategoryId, settings) {
  content = replaceWikiEntityLinksWithLegacySyntax(content);
  // Global regex: never call .test() on WIKI_LINK_REGEX without resetting lastIndex
  // before matchAll, or matchAll returns nothing (lastIndex left past the first match).
  WIKI_LINK_REGEX.lastIndex = 0;
  const matches = [...String(content || "").matchAll(WIKI_LINK_REGEX)];

  if (!matches.length) {
    return content;
  }

  const forumBookIcon = !Number.isInteger(currentCategoryId);
  const context = await buildResolverContext(currentCategoryId, settings);

  const replacements = await Promise.all(matches.map(async (match) => {
    const rawTarget = String(match[1] || "").trim();
    const targetParts = splitTargetFragment(rawTarget);
    const targetWithoutFragment = targetParts.target;
    const sectionFragment = targetParts.fragment;
    const explicitPipeLabel = String(match[2] || "").trim();
    const pathSegments = splitTargetPath(targetWithoutFragment);
    const labelFallback = targetWithoutFragment.split("/").pop().trim();

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
        const pageSlug = wikiPaths.getTopicSlugLeaf(canonicalTopic);
        return {
          source: match[0],
          replacement: buildWikiArticleLink(displayLabel, `${namespacePath}/${pageSlug}`, forumBookIcon, {
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

function contentHasWikiLinkMarkers(content) {
  // Do not use WIKI_LINK_REGEX.test() here: it advances lastIndex on the global regex
  // and breaks the subsequent matchAll in replaceWikiLinks.
  const source = String(content || "");
  return source.includes("[[") || /data-wiki-entity=(["'])(?:page|namespace)\1/i.test(source);
}

async function transformWikiPostContent(data) {
  if (!data || !data.postData || !data.postData.content) {
    return data;
  }

  const settings = await config.getSettings();

  if (!settings.isConfigured) {
    return data;
  }

  if (!contentHasWikiLinkMarkers(data.postData.content)) {
    return data;
  }

  const categoryId = await getPostCategoryId(data.postData, settings);
  data.postData.content = await replaceWikiLinks(data.postData.content, categoryId, settings);
  return data;
}

module.exports = {
  transformWikiPostContent,
  getPostCategoryId,
  replaceWikiLinks,
  contentHasWikiLinkMarkers,
  replaceWikiEntityLinksWithLegacySyntax
};
