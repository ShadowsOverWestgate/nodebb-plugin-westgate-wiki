"use strict";

const categories = require.main.require("./src/categories");
const posts = require.main.require("./src/posts");
const privileges = require.main.require("./src/privileges");
const topics = require.main.require("./src/topics");
const utils = require.main.require("./src/utils");

const config = require("../core/config");
const serializer = require("../core/serializer");
const wikiService = require("./wiki-service");
const wikiPaths = require("../tree/wiki-paths");
const wikiDiscussionSettings = require("./wiki-discussion-settings");
const wikiArticleCss = require("../content/wiki-article-css");
const wikiArticleWatch = require("../features/wiki-article-watch");
const wikiHtmlSanitizer = require("../content/wiki-html-sanitizer");
const wikiTombstones = require("../pages/wiki-tombstones");
const forumExclusion = require("../forum/forum-exclusion-service");

function normalizeTitlePath(titlePath) {
  return titlePath.join("/").toLowerCase();
}

function hasTombstoneFields(topicData) {
  return !!topicData && wikiTombstones.TOMBSTONE_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(topicData, field));
}

async function isTombstonedWikiPage(topicData) {
  if (wikiTombstones.isTombstonedTopic(topicData)) {
    return true;
  }
  if (hasTombstoneFields(topicData)) {
    return false;
  }
  return !!(await wikiTombstones.getTombstone(topicData && topicData.tid));
}

function stripTombstoneFields(topicData) {
  const publicTopicData = { ...(topicData || {}) };
  wikiTombstones.TOMBSTONE_FIELDS.forEach((field) => {
    delete publicTopicData[field];
  });
  return publicTopicData;
}

async function getParentPageBreadcrumbs(topicData, uid, namespaceInfo) {
  const titlePath = serializer.getTitlePath(topicData.titleRaw || topicData.title);

  if (titlePath.length <= 1) {
    return {
      titlePath,
      parentPages: []
    };
  }

  const wikiDirectory = require("../tree/wiki-directory-service");
  const wantedKeys = titlePath.slice(0, -1).map((_, index) => (
    normalizeTitlePath(titlePath.slice(0, index + 1))
  ));
  const matchMap = await wikiDirectory.findTopicsByNormalizedTitlePaths(topicData.cid, uid, wantedKeys);
  const parentPages = [];
  for (const [index, segment] of titlePath.slice(0, -1).entries()) {
    const key = normalizeTitlePath(titlePath.slice(0, index + 1));
    const matchingTopic = matchMap.get(key);
    let url = matchingTopic ? matchingTopic.wikiPath || "" : "";
    if (matchingTopic && !url && !(namespaceInfo && namespaceInfo.hiddenByPrivileges)) {
      const pageInfo = await wikiPaths.getCanonicalPageInfo(matchingTopic, { namespaceInfo });
      url = pageInfo.wikiPath || "";
    }

    parentPages.push({
      text: segment,
      url
    });
  }

  return {
    titlePath,
    parentPages
  };
}

async function getWikiPage(topicId, uid, options = {}) {
  if (!utils.isNumber(topicId)) {
    return { status: "invalid" };
  }

  const [settings, topicData] = await Promise.all([
    config.getSettings(),
    topics.getTopicData(topicId)
  ]);

  if (!topicData) {
    return { status: "not-found" };
  }

  if (!settings.effectiveCategoryIds.includes(parseInt(topicData.cid, 10))) {
    return { status: "not-wiki" };
  }

  if (!options.includeTombstoned && await isTombstonedWikiPage(topicData)) {
    return { status: "not-found" };
  }

  const topicPrivileges = await privileges.topics.get(topicData.tid, uid);

  if (
    !topicPrivileges["topics:read"] ||
    (topicData.deleted && !topicPrivileges.view_deleted) ||
    (topicData.scheduled && !topicPrivileges.view_scheduled)
  ) {
    return { status: "forbidden" };
  }

  const [category, mainPost, categoryPrivileges, canEditMainPost] = await Promise.all([
    categories.getCategoryData(topicData.cid),
    getMainPost(topicData.mainPid, uid),
    privileges.categories.get(topicData.cid, uid),
    privileges.posts.canEdit(topicData.mainPid, uid)
  ]);
  if (mainPost) {
    mainPost.content = wikiHtmlSanitizer.renderReadOnlyWikiHtml(mainPost.content);
    await applyWikiPageBylineFromMainPost(mainPost, uid);
  }
  const namespaceInfo = await wikiPaths.getCanonicalNamespaceInfo(category, { settings, uid });
  const [ancestorSections, namespaceData, pagePathData] = await Promise.all([
    wikiService.getConfiguredAncestorSections(category, settings, uid),
    wikiService.getSection(topicData.cid, uid, { articleTid: topicData.tid, pinHomeTopic: true }),
    getParentPageBreadcrumbs(topicData, uid, namespaceInfo)
  ]);

  const homeTid = settings.homeTopicId;
  const isWikiHome = Number.isInteger(homeTid) && homeTid > 0 && parseInt(topicId, 10) === homeTid;
  const canDeleteWikiPage = isWikiHome ? false : !!topicPrivileges["topics:delete"];
  const discussionDisabled = await wikiDiscussionSettings.getDiscussionDisabled(topicData.tid);
  const articleCss = await wikiArticleCss.getArticleCss(topicData.tid);
  const articleWatchState = await wikiArticleWatch.getWatchState(topicData.tid, uid);
  const pageInfo = await wikiPaths.getCanonicalPageInfo(topicData, { namespaceInfo });
  topicData.canonicalPath = pageInfo.canonicalPath || "";
  topicData.wikiPath = pageInfo.wikiPath || "";
  topicData.hasWikiPath = !!topicData.wikiPath;
  topicData.westgateWikiDiscussionDisabled = discussionDisabled;
  category.canonicalPath = namespaceInfo.canonicalPath || "";
  category.wikiPath = namespaceInfo.wikiPath || "";
  category.hasWikiPath = !!category.wikiPath;

  return {
    status: "ok",
    settings,
    topic: stripTombstoneFields(topicData),
    category,
    categoryPrivileges,
    topicPrivileges,
    canEditWikiPage: !!canEditMainPost.flag,
    canDeleteWikiPage,
    canWatchWikiArticle: articleWatchState.canWatchWikiArticle,
    wikiArticleWatched: articleWatchState.wikiArticleWatched,
    discussionDisabled,
    articleCss,
    scopedArticleCss: wikiArticleCss.scopeArticleCss(articleCss, topicData.tid),
    ancestorSections,
    pageTitlePath: pagePathData.titlePath,
    parentPages: pagePathData.parentPages,
    sectionNavigation: namespaceData.status === "ok" ? namespaceData.section : null,
    mainPost
  };
}

async function getMainPost(mainPid, uid) {
  // The article view is a plugin-internal read of a known wiki post: without a
  // grant, our own forum-exclusion hook strips it from the summary result and
  // the raw (never parse-hooked) content would render instead.
  forumExclusion.grantPidHydration(mainPid);
  const mainPostRows = await posts.getPostSummaryByPids([mainPid], uid, {
    stripTags: false,
    extraFields: ['edited', 'editor']
  });
  const summaryPost = mainPostRows[0] || null;
  if (summaryPost || typeof posts.getPostFields !== "function") {
    return summaryPost;
  }

  const postFields = await posts.getPostFields(mainPid, [
    "pid",
    "tid",
    "uid",
    "content",
    "sourceContent",
    "timestamp",
    "timestampISO",
    "edited",
    "editor"
  ]);
  if (!postFields || !postFields.pid) {
    return null;
  }

  return {
    ...postFields,
    content: postFields.content || postFields.sourceContent || ""
  };
}

/**
 * "Last edited" byline: last editor when the post was edited, otherwise the author
 * and creation time (treats the initial post as the only revision so far).
 */
async function applyWikiPageBylineFromMainPost(mainPost, viewerUid) {
  const edited = parseInt(mainPost.edited, 10) || 0;
  const editorUid = parseInt(mainPost.editor, 10) || 0;
  const authorUid = parseInt(mainPost.uid, 10) || 0;
  const lastRevTime = edited > 0 ? edited : parseInt(mainPost.timestamp, 10) || 0;
  const lastRevUid = edited > 0 && editorUid > 0 ? editorUid : authorUid;

  const uids = lastRevUid === authorUid ? [authorUid] : [lastRevUid, authorUid];
  const userList = await posts.getUserInfoForPosts(uids, viewerUid);
  if (lastRevUid === authorUid) {
    const u = userList[0] || mainPost.user;
    mainPost.wikiLastRevisionUser = u;
    mainPost.wikiCreatedByUser = u;
  } else {
    mainPost.wikiLastRevisionUser = userList[0] || mainPost.user;
    mainPost.wikiCreatedByUser = userList[1] || mainPost.user;
  }
  mainPost.wikiLastRevisionTimeISO = lastRevTime ? utils.toISOString(lastRevTime) : mainPost.timestampISO;
}

module.exports = {
  getWikiPage
};
