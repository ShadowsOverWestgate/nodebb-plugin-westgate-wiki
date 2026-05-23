"use strict";

const TITLE_PATH_DELIMITER = " :: ";
const TITLE_PATH_DELIMITER_REGEX = /\s*::\s*/;

function getSlugPath(slug) {
  return String(slug || "").split("/").slice(1).join("/");
}

function decodeTitle(value) {
  return String(value || "")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&amp;/g, "&");
}

function getTitlePath(value) {
  return String(value || "")
    .split(TITLE_PATH_DELIMITER_REGEX)
    .map((segment) => decodeTitle(segment).trim())
    .filter(Boolean);
}

function getTitleDisplay(titlePath, fallbackTitle) {
  const segments = Array.isArray(titlePath) ? titlePath.filter(Boolean) : getTitlePath(fallbackTitle);
  if (!segments.length) {
    return String(fallbackTitle || "").trim();
  }
  return segments.join(TITLE_PATH_DELIMITER);
}

function getParentTitlePathSegments(titlePath) {
  const parentSegments = Array.isArray(titlePath) ? titlePath.slice(0, -1).filter(Boolean) : [];
  return parentSegments.map((segment, index) => ({
    text: segment,
    hasSeparatorBefore: index > 0
  }));
}

function buildWikiSectionPath(category) {
  return `/wiki/category/${category.slug}`;
}

function serializeSectionLink(category) {
  return {
    cid: category.cid,
    name: category.name,
    description: category.description,
    slug: category.slug,
    slugPath: getSlugPath(category.slug),
    wikiPath: category.wikiPath || "",
    hasWikiPath: !!category.wikiPath,
    categoryPath: `/category/${category.slug}`,
    icon: category.icon
  };
}

function serializeCategoryPrivileges(categoryPrivileges = {}) {
  return {
    canCreatePage: !!categoryPrivileges["topics:create"],
    canReadTopics: !!categoryPrivileges["topics:read"],
    canReadCategory: !!categoryPrivileges.read
  };
}

function serializeTopicSummary(topic) {
  const titlePath = getTitlePath(topic.titleRaw || topic.title);
  const titleLeaf = titlePath.length ? titlePath[titlePath.length - 1] : topic.title;
  const parentTitlePathSegments = getParentTitlePathSegments(titlePath);

  return {
    tid: topic.tid,
    title: topic.title,
    titleLeaf,
    titlePath,
    titleDepth: Math.max(0, titlePath.length - 1),
    hasParentPath: titlePath.length > 1,
    parentTitlePathText: titlePath.slice(0, -1).join(TITLE_PATH_DELIMITER),
    parentTitlePathSegments,
    slug: topic.slug,
    teaserPid: topic.teaserPid,
    postcount: topic.postcount,
    replyCount: Math.max(0, parseInt(topic.postcount, 10) - 1),
    wikiPath: topic.wikiPath || "",
    hasWikiPath: !!topic.wikiPath,
    topicPath: `/topic/${topic.slug}`
  };
}

function serializeSection(category, topics, categoryPrivileges) {
  return {
    ...serializeSectionLink(category),
    parentCid: category.parentCid,
    privileges: serializeCategoryPrivileges(categoryPrivileges),
    topicCount: topics.length,
    topics: topics.map(serializeTopicSummary)
  };
}

module.exports = {
  buildWikiSectionPath,
  getParentTitlePathSegments,
  getSlugPath,
  getTitleDisplay,
  getTitlePath,
  serializeCategoryPrivileges,
  serializeSection,
  serializeSectionLink,
  serializeTopicSummary
};
