"use strict";

const categories = require.main.require("./src/categories");
const privileges = require.main.require("./src/privileges");
const utils = require.main.require("./src/utils");

const config = require("./config");
const serializer = require("./serializer");
const wikiDirectory = require("./wiki-directory-service");
const wikiNamespaceMainPages = require("./wiki-namespace-main-pages");
const wikiPaths = require("./wiki-paths");

async function applyCanonicalTopicPaths(topicSummaries, namespacePath) {
  return wikiPaths.attachTopicWikiPaths(topicSummaries, namespacePath);
}

async function serializeSectionWithPaths(category, pageTopics, categoryPrivileges) {
  const section = serializer.serializeSection(category, pageTopics, categoryPrivileges);
  const namespacePath = await wikiPaths.getNamespacePath(category);
  section.wikiPath = namespacePath || wikiPaths.getLegacyNamespacePath(category);
  section.topics = await applyCanonicalTopicPaths(section.topics, section.wikiPath);
  return section;
}

function getTopicSortPath(topic) {
  const path = Array.isArray(topic && topic.titlePath) ? topic.titlePath : [];
  if (path.length) {
    return path.map((segment) => String(segment || "").trim().toLowerCase());
  }
  return [String(topic && (topic.titleLeaf || topic.title) || "").trim().toLowerCase()];
}

function compareTopicSortPath(a, b) {
  const ap = getTopicSortPath(a);
  const bp = getTopicSortPath(b);
  const len = Math.min(ap.length, bp.length);
  for (let i = 0; i < len; i += 1) {
    const cmp = ap[i].localeCompare(bp[i], undefined, {
      numeric: true,
      sensitivity: "base"
    });
    if (cmp !== 0) {
      return cmp;
    }
  }
  return ap.length - bp.length;
}

function sortSectionTopics(section, mainTopicId) {
  const mainTid = parseInt(mainTopicId, 10);
  const hasMainTid = Number.isInteger(mainTid) && mainTid > 0;

  section.topics = (Array.isArray(section.topics) ? section.topics : [])
    .map((topic) => ({
      ...topic,
      isNamespaceMainPage: hasMainTid && parseInt(topic.tid, 10) === mainTid
    }))
    .sort((a, b) => {
      if (a.isNamespaceMainPage !== b.isNamespaceMainPage) {
        return a.isNamespaceMainPage ? -1 : 1;
      }
      return compareTopicSortPath(a, b);
    });

  return section;
}

async function getSections(uid) {
  const settings = await config.getSettings();
  const invalidCategoryIds = [];

  if (!settings.isConfigured) {
    return {
      settings,
      sections: [],
      invalidCategoryIds
    };
  }

  const sections = await Promise.all(
    settings.categoryIds.map(async (cid) => {
      const [category, categoryPrivileges] = await Promise.all([
        categories.getCategoryData(cid),
        privileges.categories.get(cid, uid)
      ]);

      if (!category) {
        invalidCategoryIds.push(cid);
        return null;
      }

      const parsedCid = parseInt(cid, 10);
      const summaries = await wikiDirectory.getOrderedSummaries(parsedCid, uid, false);
      const previewTopics = summaries.slice(0, wikiDirectory.HUB_PREVIEW_LIMIT);
      const section = await serializeSectionWithPaths(category, previewTopics, categoryPrivileges);
      section.topicCount = summaries.length;
      section.directoryHasMore = summaries.length > previewTopics.length;
      return section;
    })
  );

  const validSections = sections.filter(Boolean);
  const rootSections = validSections.filter((section) => (
    !section.parentCid || !settings.effectiveCategoryIds.includes(parseInt(section.parentCid, 10))
  ));

  return {
    settings,
    sections: rootSections,
    invalidCategoryIds
  };
}

async function getConfiguredAncestorSections(category, settings) {
  const ancestors = [];
  let parentCid = parseInt(category.parentCid, 10);

  while (Number.isInteger(parentCid) && parentCid > 0) {
    if (!settings.effectiveCategoryIds.includes(parentCid)) {
      break;
    }

    const parentCategory = await categories.getCategoryData(parentCid);
    if (!parentCategory) {
      break;
    }

    const ancestor = serializer.serializeSectionLink(parentCategory);
    ancestor.wikiPath = await wikiPaths.getNamespacePath(parentCategory) || wikiPaths.getLegacyNamespacePath(parentCategory);
    ancestors.unshift(ancestor);
    parentCid = parseInt(parentCategory.parentCid, 10);
  }

  return ancestors;
}

async function getSection(cid, uid, options = {}) {
  if (!utils.isNumber(cid)) {
    return { status: "invalid" };
  }

  const parsedCid = parseInt(cid, 10);
  const settings = await config.getSettings();

  if (!settings.isConfigured || !settings.effectiveCategoryIds.includes(parsedCid)) {
    return { status: "not-wiki" };
  }

  const [category, categoryPrivileges] = await Promise.all([
    categories.getCategoryData(parsedCid),
    privileges.categories.get(parsedCid, uid)
  ]);

  if (!category) {
    return { status: "not-found" };
  }

  if (!categoryPrivileges.read || !categoryPrivileges["topics:read"]) {
    return { status: "forbidden" };
  }

  const [childCategoryGroups, dirWin] = await Promise.all([
    categories.getChildren([parsedCid], uid),
    wikiDirectory.getDirectoryWindow(parsedCid, uid, {
      limit: wikiDirectory.DEFAULT_LIMIT,
      aroundTid: options.articleTid
    })
  ]);
  const ancestorSections = await getConfiguredAncestorSections(category, settings);

  const wikiChildCandidates = (childCategoryGroups[0] || [])
    .filter(Boolean)
    .filter((child) => settings.effectiveCategoryIds.includes(parseInt(child.cid, 10)));

  const childCategoryRows = await Promise.all(
    wikiChildCandidates.map((child) => categories.getCategoryData(child.cid))
  );

  const childSections = (await Promise.all(wikiChildCandidates
    .map(async (child, index) => {
      const full = childCategoryRows[index];
      if (!full) {
        return null;
      }
      return {
        ...serializer.serializeSectionLink(full),
        articleCount: await wikiDirectory.getNamespaceTopicCount(full.cid, full)
      };
    })))
    .filter(Boolean);

  for (const childSection of childSections) {
    childSection.wikiPath = await wikiPaths.getNamespacePath(childSection.cid) || childSection.wikiPath;
  }

  const pageTopics = dirWin.status === "ok" ? dirWin.pages : [];
  const section = {
    ...(await serializeSectionWithPaths(category, pageTopics, categoryPrivileges)),
    ancestorSections,
    childSections
  };
  sortSectionTopics(section, await wikiNamespaceMainPages.getMainTopicIdForCid(parsedCid));
  if (dirWin.status === "ok") {
    section.topicCount = dirWin.totalInNamespace;
    section.directoryHasMore = dirWin.hasMore;
    section.directoryNextCursor = dirWin.nextCursor;
  }

  return {
    status: "ok",
    settings,
    section
  };
}

module.exports = {
  getConfiguredAncestorSections,
  getSection,
  getSections,
  serializeSectionWithPaths,
  sortSectionTopics
};
