"use strict";

const routeHelpers = require.main.require("./src/routes/helpers");
const cacheService = require("./lib/cache-service");
const config = require("./lib/config");
const adminControllers = require("./lib/controllers/admin");
const wikiArchiveAdminControllers = require("./lib/controllers/wiki-archive-admin");
const serializer = require("./lib/serializer");
const topicService = require("./lib/topic-service");
const wikiLinkAutocomplete = require("./lib/wiki-link-autocomplete");
const wikiSearchService = require("./lib/wiki-search-service");
const wikiUserAutocomplete = require("./lib/wiki-user-autocomplete");
const wikiLinks = require("./lib/wiki-links");
const wikiFootnotes = require("./lib/wiki-footnotes");
const wikiHtmlParse = require("./lib/wiki-html-parse");
const wikiDiscussionPlaceholder = require("./lib/wiki-discussion-placeholder");
const wikiDiscussionSettings = require("./lib/wiki-discussion-settings");
const wikiArticleCss = require("./lib/wiki-article-css");
const wikiUserMentions = require("./lib/wiki-user-mentions");
const wikiMentionNotifications = require("./lib/wiki-mention-notifications");
const wikiArticleWatch = require("./lib/wiki-article-watch");
const wikiEditLocks = require("./lib/wiki-edit-locks");
const wikiPageActions = require("./lib/wiki-page-actions");
const wikiNativeMutationGuards = require("./lib/wiki-native-mutation-guards");
const wikiRevisionActions = require("./lib/wiki-revision-actions");
const wikiTopdataBotPrivileges = require("./lib/wiki-topdata-bot-privileges");
const wikiRevisionPermissions = require("./lib/wiki-revision-permissions");
const wikiRevisions = require("./lib/wiki-revisions");
const wikiService = require("./lib/wiki-service");
const wikiPaths = require("./lib/wiki-paths");
const wikiPageValidation = require("./lib/wiki-page-validation");
const wikiTopicPurge = require("./lib/wiki-topic-purge");
const wikiRoutes = require("./routes/wiki");
const filterCategoriesForum = require("./lib/filter-categories-forum");
const filterForumFeeds = require("./lib/filter-forum-feeds");
const filterForumSearch = require("./lib/filter-forum-search");
const forumExclusionService = require("./lib/forum-exclusion-service");
const wikiDirectoryController = require("./lib/controllers/wiki-directory");

const plugin = module.exports;

plugin.init = async function (params) {
  const { router } = params;

  await config.ensureDefaults();
  await forumExclusionService.removeWikiTopicsFromRecentSet();
  wikiNativeMutationGuards.install();

  routeHelpers.setupAdminPageRoute(
    router,
    "/admin/plugins/westgate-wiki",
    adminControllers.renderAdminPage
  );

  wikiRoutes.register(params);
};

plugin.registerApiRoutes = async function ({ router, middleware }) {
  const wikiNamespaceSearch = require("./lib/wiki-namespace-search");
  const wikiHomepage = require("./lib/wiki-homepage");
  const wikiPageToc = require("./lib/wiki-page-toc");
  const wikiNamespaceCreateController = require("./lib/controllers/wiki-namespace-create");
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/path-migration/scan",
    [middleware.ensureLoggedIn],
    adminControllers.scanWikiPathMigrationReport
  );
  routeHelpers.setupApiRoute(
    router,
    "post",
    "/westgate-wiki/path-migration/prepare",
    [middleware.ensureLoggedIn],
    adminControllers.prepareWikiPathMigrationReport
  );
  routeHelpers.setupApiRoute(
    router,
    "post",
    "/westgate-wiki/path-migration/apply",
    [middleware.ensureLoggedIn],
    adminControllers.applyWikiPathMigration
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/path-migration/verify",
    [middleware.ensureLoggedIn],
    adminControllers.verifyWikiPathMigration
  );
  routeHelpers.setupApiRoute(
    router,
    "post",
    "/westgate-wiki/archive/export-jobs",
    [middleware.ensureLoggedIn],
    wikiArchiveAdminControllers.startExportJob
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/archive/jobs/:jobId",
    [middleware.ensureLoggedIn],
    wikiArchiveAdminControllers.getArchiveJob
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/archive/export-jobs/:jobId/download",
    [middleware.ensureLoggedIn],
    wikiArchiveAdminControllers.downloadExportJob
  );
  routeHelpers.setupApiRoute(
    router,
    "post",
    "/westgate-wiki/archive/import-jobs",
    [middleware.ensureLoggedIn],
    wikiArchiveAdminControllers.startImportJob
  );
  routeHelpers.setupApiRoute(
    router,
    "put",
    "/westgate-wiki/archive/import-jobs/:jobId/apply",
    [middleware.ensureLoggedIn],
    wikiArchiveAdminControllers.applyImportJob
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/page-title/check",
    [middleware.ensureLoggedIn],
    wikiPageValidation.checkPageTitle
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/link-autocomplete",
    [],
    wikiLinkAutocomplete.apiSearch
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/search",
    [],
    wikiSearchService.apiSearch
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/user-autocomplete",
    [],
    wikiUserAutocomplete.apiSearch
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/page-toc",
    [],
    wikiPageToc.apiGetPageToc
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/namespace/:cid/search",
    [],
    wikiNamespaceSearch.searchNamespaceTopics
  );
  routeHelpers.setupApiRoute(
    router,
    "put",
    "/westgate-wiki/edit-lock",
    [middleware.ensureLoggedIn, middleware.checkRequired.bind(null, ["tid"])],
    wikiEditLocks.putEditLock
  );
  routeHelpers.setupApiRoute(
    router,
    "delete",
    "/westgate-wiki/edit-lock",
    [middleware.ensureLoggedIn, middleware.checkRequired.bind(null, ["tid", "token"])],
    wikiEditLocks.deleteEditLock
  );
  routeHelpers.setupApiRoute(
    router,
    "put",
    "/westgate-wiki/article-watch",
    [middleware.ensureLoggedIn, middleware.checkRequired.bind(null, ["tid"])],
    wikiArticleWatch.putArticleWatch
  );
  routeHelpers.setupApiRoute(
    router,
    "delete",
    "/westgate-wiki/article-watch",
    [middleware.ensureLoggedIn, middleware.checkRequired.bind(null, ["tid"])],
    wikiArticleWatch.deleteArticleWatch
  );
  routeHelpers.setupApiRoute(
    router,
    "put",
    "/westgate-wiki/page/save",
    [middleware.ensureLoggedIn],
    wikiPageActions.saveWikiPage
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/revisions/:tid",
    [middleware.ensureLoggedIn],
    wikiRevisionActions.listRevisions
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/revisions/:tid/:revisionId",
    [middleware.ensureLoggedIn],
    wikiRevisionActions.getRevision
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/revisions/:tid/:fromRevisionId/:toRevisionId/diff",
    [middleware.ensureLoggedIn],
    wikiRevisionActions.diffRevisions
  );
  routeHelpers.setupApiRoute(
    router,
    "put",
    "/westgate-wiki/revisions/:tid/:revisionId/restore",
    [middleware.ensureLoggedIn],
    wikiRevisionActions.restoreRevision
  );
  routeHelpers.setupApiRoute(
    router,
    "put",
    "/westgate-wiki/page/tombstone",
    [middleware.ensureLoggedIn],
    wikiRevisionActions.tombstonePage
  );
  routeHelpers.setupApiRoute(
    router,
    "delete",
    "/westgate-wiki/page/hard-purge",
    [middleware.ensureLoggedIn],
    wikiRevisionActions.hardPurgePage
  );
  routeHelpers.setupApiRoute(
    router,
    "put",
    "/westgate-wiki/page/move",
    [middleware.ensureLoggedIn, middleware.checkRequired.bind(null, ["tid", "cid", "title"])],
    wikiPageActions.moveWikiPage
  );
  routeHelpers.setupApiRoute(
    router,
    "put",
    "/westgate-wiki/page/owner",
    [middleware.ensureLoggedIn, middleware.checkRequired.bind(null, ["tid", "uid"])],
    wikiPageActions.changeWikiPageOwner
  );
  routeHelpers.setupApiRoute(
    router,
    "put",
    "/westgate-wiki/discussion",
    [middleware.ensureLoggedIn, middleware.checkRequired.bind(null, ["tid"])],
    wikiDiscussionSettings.putDiscussionSettings
  );
  routeHelpers.setupApiRoute(
    router,
    "put",
    "/westgate-wiki/article-css",
    [middleware.ensureLoggedIn, middleware.checkRequired.bind(null, ["tid"])],
    wikiArticleCss.putArticleCss
  );
  routeHelpers.setupApiRoute(
    router,
    "put",
    "/westgate-wiki/homepage",
    [middleware.ensureLoggedIn, middleware.checkRequired.bind(null, ["tid"])],
    wikiHomepage.putWikiHomepage
  );
  routeHelpers.setupApiRoute(
    router,
    "post",
    "/westgate-wiki/namespace",
    [middleware.ensureLoggedIn],
    wikiNamespaceCreateController.postNamespace
  );
  routeHelpers.setupApiRoute(
    router,
    "get",
    "/westgate-wiki/namespace/:cid/pages",
    [],
    wikiDirectoryController.getNamespacePages
  );
};

plugin.addAdminNavigation = async function (header) {
  header.plugins.push({
    route: "/plugins/westgate-wiki",
    icon: "fa-book",
    name: "Westgate Wiki"
  });

  return header;
};

plugin.addComposerFormatting = async function (payload) {
  if (!payload || !Array.isArray(payload.options)) {
    return payload;
  }

  payload.options.push({
    name: "wiki-link",
    title: "Insert wiki link",
    className: "fa fa-book",
    visibility: {
      desktop: true,
      mobile: true,
      main: true,
      reply: true
    }
  });

  return payload;
};

plugin.transformWikiPostContent = wikiLinks.transformWikiPostContent;
plugin.transformWikiUserMentions = wikiUserMentions.transformWikiUserMentions;
plugin.transformWikiFootnotes = wikiFootnotes.transformWikiFootnotes;
plugin.filterWikiMentionNotificationsCreate = wikiMentionNotifications.filterNotificationsCreate;
plugin.handleWikiMentionPostSave = wikiMentionNotifications.handlePostSaveOrEdit;
plugin.handleWikiMentionPostEdit = wikiMentionNotifications.handlePostSaveOrEdit;
plugin.handleWikiArticleWatchPostEdit = wikiArticleWatch.handlePostEdit;
plugin.addWikiArticleWatchNotificationType = wikiArticleWatch.addUserNotificationTypes;
plugin.wikiMarkdownBeforeParse = wikiHtmlParse.markdownBeforeParse;
plugin.filterWikiDiscussionTopicBuild = wikiDiscussionPlaceholder.filterTopicBuild;
plugin.filterWikiDiscussionTopicReply = wikiDiscussionSettings.filterTopicReply;
plugin.clearWikiPostParseCache = cacheService.clearWikiPostParseCache;
plugin.syncPostedTopdataWikiPageSlug = wikiPageValidation.syncPostedTopdataWikiPageSlug;
plugin.recordWikiCreateRevision = async function (data) {
  if (!data) {
    return data;
  }

  const posts = require.main.require("./src/posts");
  const topics = require.main.require("./src/topics");
  const settings = await config.getSettings();
  const effectiveCategoryIds = Array.isArray(settings.effectiveCategoryIds) ? settings.effectiveCategoryIds : [];
  const post = data.post || data.postData || {};
  const topicInput = data.topic || data.topicData || {};
  const tid = parseInt(topicInput.tid || post.tid || data.tid, 10);
  if (!Number.isInteger(tid) || tid <= 0) {
    return data;
  }

  const topic = topicInput.cid && topicInput.mainPid ?
    topicInput :
    (await topics.getTopicData(tid) || topicInput);
  const cid = parseInt(topic && topic.cid, 10);
  if (!Number.isInteger(cid) || cid <= 0 || !effectiveCategoryIds.includes(cid)) {
    return data;
  }

  const mainPid = parseInt(topic && topic.mainPid, 10);
  const pid = parseInt(post.pid || data.pid || mainPid, 10);
  if (!Number.isInteger(mainPid) || mainPid <= 0 || !Number.isInteger(pid) || pid !== mainPid) {
    return data;
  }

  const uid = parseInt(data.uid || post.uid || topic.uid, 10);
  if (!Number.isInteger(uid) || uid <= 0) {
    return data;
  }

  if (await wikiRevisions.hasRevisions(tid)) {
    return data;
  }

  let source = String(post.sourceContent || post.content || "");
  if (!source && typeof posts.getPostFields === "function") {
    const stored = await posts.getPostFields(mainPid, ["content", "sourceContent"]);
    source = stored ? String(stored.sourceContent || stored.content || "") : "";
  }
  if (!source.trim()) {
    return data;
  }

  await wikiRevisions.appendRevision({
    tid,
    pid: mainPid,
    cid,
    uid,
    action: "create",
    title: String(topic.titleRaw || topic.title || ""),
    oldSource: "",
    newSource: source,
    canonicalPath: String(topic.canonicalPath || ""),
    wikiPath: String(topic.wikiPath || "")
  });

  return data;
};
plugin.clearWikiPostEditCache = cacheService.clearWikiPostEditCache;
plugin.onWikiTopicDelete = wikiTopicPurge.onTopicDelete;
plugin.onWikiTopicsPurge = wikiTopicPurge.onTopicsPurge;
plugin.invalidateWikiPathCaches = function () {
  const wikiDirectory = require("./lib/wiki-directory-service");
  wikiDirectory.invalidateAllWikiCaches();
  wikiPaths.invalidateWikiTreeIndex({ reason: "wiki-path-lifecycle" });
};
plugin.wikiFilterTopicPost = wikiPageValidation.validateTopicPost;
plugin.wikiFilterPostEdit = wikiPageValidation.validatePostEdit;
plugin.wikiFilterTopicEdit = wikiPageValidation.validateTopicEdit;
plugin.wikiFilterPostDelete = wikiNativeMutationGuards.validatePostDelete;
plugin.wikiFilterPostRestore = wikiNativeMutationGuards.validatePostRestore;
plugin.wikiFilterPostsPurge = wikiNativeMutationGuards.validatePostsPurge;
plugin.wikiFilterPrivilegesPostsEdit = wikiTopdataBotPrivileges.filterPostEditPrivilege;
plugin.addWikiRevisionCategoryPrivileges = wikiRevisionPermissions.addCategoryPrivileges;
plugin.wikiFilterTopicDelete = wikiPageValidation.validateTopicDelete;
plugin.filterCategoriesBuild = filterCategoriesForum.filterCategoriesBuild;
plugin.filterCategoryBuild = filterCategoriesForum.filterCategoryBuild;
plugin.filterTopicsUpdateRecent = filterForumFeeds.filterTopicsUpdateRecent;
plugin.filterTopicsFilterSortedTids = filterForumFeeds.filterTopicsFilterSortedTids;
plugin.filterTopicsGetUnreadTids = filterForumFeeds.filterTopicsGetUnreadTids;
plugin.filterTopicsGet = filterForumFeeds.filterTopicsGet;
plugin.filterPostGetPostSummaryByPids = filterForumFeeds.filterPostGetPostSummaryByPids;
plugin.filterTopicCreateGrantHydration = filterForumFeeds.filterTopicCreate;
plugin.filterPostCreateGrantHydration = filterForumFeeds.filterPostCreate;
plugin.filterPostEditGrantHydration = filterForumFeeds.filterPostEdit;
plugin.filterWidgetRenderRecentTopics = filterForumFeeds.filterWidgetRenderRecentTopics;
plugin.filterSearchInContent = filterForumSearch.filterSearchInContent;
plugin.filterSearchIndexTopics = filterForumSearch.filterSearchIndexTopics;
plugin.filterSearchIndexPosts = filterForumSearch.filterSearchIndexPosts;
plugin.filterSearchContentGetResult = filterForumSearch.filterSearchContentGetResult;
plugin.onWikiTopicMoved = async function (data) {
  const wikiDirectory = require("./lib/wiki-directory-service");
  const fromCid = parseInt(data && data.fromCid, 10);
  const toCid = parseInt(data && data.toCid, 10);
  if (Number.isInteger(fromCid) && fromCid > 0) {
    wikiDirectory.invalidateNamespace(fromCid);
  }
  if (Number.isInteger(toCid) && toCid > 0) {
    wikiDirectory.invalidateNamespace(toCid);
  }
  wikiPaths.invalidateWikiTreeIndex({ reason: "wiki-topic-moved" });
};
plugin.wikiFilterPrivilegesTopicsGet = async function (data) {
  if (!data || data.tid === undefined || data.tid === null) {
    return data;
  }
  const settings = await config.getSettings();
  if (settings.homeTopicId && parseInt(data.tid, 10) === settings.homeTopicId) {
    data["topics:delete"] = false;
    data.purge = false;
    data.deletable = false;
  }
  return data;
};

function getWikiCacheMetrics() {
  const wikiDirectory = require("./lib/wiki-directory-service");
  return {
    config: typeof config.getCacheMetrics === "function" ? config.getCacheMetrics() : {},
    wikiPaths: typeof wikiPaths.getCacheMetrics === "function" ? wikiPaths.getCacheMetrics() : {},
    wikiDirectory: typeof wikiDirectory.getCacheMetrics === "function" ? wikiDirectory.getCacheMetrics() : {}
  };
}

function resetWikiCacheMetrics() {
  const wikiDirectory = require("./lib/wiki-directory-service");
  if (typeof config.resetCacheMetrics === "function") {
    config.resetCacheMetrics();
  }
  if (typeof wikiPaths.resetCacheMetrics === "function") {
    wikiPaths.resetCacheMetrics();
  }
  if (typeof wikiDirectory.resetCacheMetrics === "function") {
    wikiDirectory.resetCacheMetrics();
  }
}

plugin.services = {
  cacheService,
  cacheMetrics: {
    get: getWikiCacheMetrics,
    reset: resetWikiCacheMetrics
  },
  config,
  forumExclusionService,
  serializer,
  topicService,
  wikiLinkAutocomplete,
  wikiSearchService,
  wikiArticleCss,
  wikiDiscussionPlaceholder,
  wikiDiscussionSettings,
  wikiFootnotes,
  wikiLinks,
  wikiMentionNotifications,
  wikiArticleWatch,
  wikiEditLocks,
  wikiUserMentions,
  wikiPageValidation,
  wikiRevisionPermissions,
  wikiRevisions,
  wikiPaths,
  wikiService,
  wikiDirectory: require("./lib/wiki-directory-service")
};
