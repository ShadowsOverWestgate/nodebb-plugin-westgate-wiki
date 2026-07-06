"use strict";

const categories = require.main.require("./src/categories");
const privileges = require.main.require("./src/privileges");
const utils = require.main.require("./src/utils");

const config = require("../core/config");
const serializer = require("../core/serializer");
const wikiDirectory = require("../tree/wiki-directory-service");
const wikiPaths = require("../tree/wiki-paths");

function canonicalWikiPath(canonicalPath) {
  return canonicalPath ? `/wiki/${canonicalPath}` : "";
}

function markWikiPath(row) {
  if (row && typeof row === "object") {
    row.hasWikiPath = !!row.wikiPath;
  }
  return row;
}

function hasViewerUid(uid) {
  return uid !== undefined && uid !== null;
}

async function canViewCategoryForPath(category, uid) {
  if (!hasViewerUid(uid)) {
    return true;
  }
  const result = await privileges.categories.get(category.cid, uid);
  return !!(result && result.read && result["topics:read"]);
}

async function applyCanonicalTopicPaths(topicSummaries, rawTopics, namespaceInfo) {
  const raws = Array.isArray(rawTopics) ? rawTopics : [];
  return Promise.all((Array.isArray(topicSummaries) ? topicSummaries : []).map(async (topic, index) => {
    const sourceTopic = raws[index] || topic;
    const pageInfo = await wikiPaths.getCanonicalPageInfo(sourceTopic, { namespaceInfo });
    const canonicalPath = pageInfo.canonicalPath || "";
    return {
      ...topic,
      cid: sourceTopic.cid,
      canonicalPath,
      wikiPath: pageInfo.wikiPath || canonicalWikiPath(canonicalPath),
      hasWikiPath: !!(pageInfo.wikiPath || canonicalWikiPath(canonicalPath))
    };
  }));
}

async function serializeSectionWithPaths(category, pageTopics, categoryPrivileges, settings, uid) {
  const section = serializer.serializeSection(category, pageTopics, categoryPrivileges);
  const namespaceInfo = await wikiPaths.getCanonicalNamespaceInfo(category, { settings, uid });
  const canonicalPath = namespaceInfo.canonicalPath || "";
  section.canonicalPath = canonicalPath;
  section.wikiPath = namespaceInfo.wikiPath || canonicalWikiPath(canonicalPath);
  markWikiPath(section);
  section.topics = await applyCanonicalTopicPaths(section.topics, pageTopics, namespaceInfo);
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

function pinHomeTopicFirst(rows, homeTopicId, enabled) {
  const homeTid = parseInt(homeTopicId, 10);
  if (!enabled || !Number.isInteger(homeTid) || homeTid <= 0 || !Array.isArray(rows) || rows.length < 2) {
    return rows;
  }

  const index = rows.findIndex((row) => parseInt(row && row.tid, 10) === homeTid);
  if (index <= 0) {
    return rows;
  }

  return [rows[index]].concat(rows.slice(0, index), rows.slice(index + 1));
}

function sortSectionTopics(section, options = {}) {
  section.topics = (Array.isArray(section.topics) ? section.topics : [])
    .map((topic) => {
      const { isNamespaceMainPage, ...row } = topic;
      return row;
    })
    .sort((a, b) => {
      return compareTopicSortPath(a, b);
    });
  section.topics = pinHomeTopicFirst(section.topics, options.homeTopicId, options.pinHomeTopic);

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
      if (!categoryPrivileges || !categoryPrivileges.read || !categoryPrivileges["topics:read"]) {
        return null;
      }

      const parsedCid = parseInt(cid, 10);
      const dirWin = await wikiDirectory.getDirectoryWindow(parsedCid, uid, {
        limit: wikiDirectory.HUB_PREVIEW_LIMIT
      });
      const previewTopics = dirWin.status === "ok" ? dirWin.pages : [];
      const section = await serializeSectionWithPaths(category, previewTopics, categoryPrivileges, settings, uid);
      section.topicCount = dirWin.status === "ok" ? dirWin.totalInNamespace : 0;
      section.directoryHasMore = dirWin.status === "ok" ? dirWin.hasMore : false;
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

async function getConfiguredAncestorSections(category, settings, uid) {
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
    if (!await canViewCategoryForPath(parentCategory, uid)) {
      break;
    }

    const ancestor = serializer.serializeSectionLink(parentCategory);
    const namespaceInfo = await wikiPaths.getCanonicalNamespaceInfo(parentCategory, { settings, uid });
    const canonicalPath = namespaceInfo.canonicalPath || "";
    ancestor.canonicalPath = canonicalPath;
    ancestor.wikiPath = namespaceInfo.wikiPath || canonicalWikiPath(canonicalPath);
    markWikiPath(ancestor);
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
    options.fullDirectoryListing ?
      wikiDirectory.getDirectoryListing(parsedCid, uid, {
        pinHomeTopic: !!options.pinHomeTopic
      }) :
      wikiDirectory.getDirectoryWindow(parsedCid, uid, {
        limit: wikiDirectory.DEFAULT_LIMIT,
        aroundTid: options.articleTid,
        pinHomeTopic: !!options.pinHomeTopic
      })
  ]);
  const ancestorSections = await getConfiguredAncestorSections(category, settings, uid);

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
        parentCid: full.parentCid,
        articleCount: await wikiDirectory.getVisibleNamespaceTopicCount(full.cid, uid)
      };
    })))
    .filter(Boolean);

  for (const childSection of childSections) {
    const namespaceInfo = await wikiPaths.getCanonicalNamespaceInfo(childSection, { settings, uid });
    const canonicalPath = namespaceInfo.canonicalPath || "";
    childSection.canonicalPath = canonicalPath;
    childSection.wikiPath = namespaceInfo.wikiPath || canonicalWikiPath(canonicalPath);
    markWikiPath(childSection);
  }

  const pageTopics = dirWin.status === "ok" ? dirWin.pages : [];
  const section = {
    ...(await serializeSectionWithPaths(category, pageTopics, categoryPrivileges, settings, uid)),
    ancestorSections,
    childSections
  };
  if (dirWin.status === "ok") {
    section.topicCount = dirWin.totalInNamespace;
    section.directoryHasMore = dirWin.hasMore;
    section.directoryNextCursor = dirWin.nextCursor;
  }
  sortSectionTopics(section, {
    homeTopicId: settings.homeTopicId,
    pinHomeTopic: !!options.pinHomeTopic
  });

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
