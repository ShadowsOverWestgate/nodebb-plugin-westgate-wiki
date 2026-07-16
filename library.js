"use strict";

const routeHelpers = require.main.require("./src/routes/helpers");
const cacheService = require("./lib/core/cache-service");
const config = require("./lib/core/config");
const adminControllers = require("./lib/controllers/admin");
const wikiArchiveAdminControllers = require("./lib/controllers/wiki-archive-admin");
const wikiLinkAutocomplete = require("./lib/content/wiki-link-autocomplete");
const wikiSearchService = require("./lib/read/wiki-search-service");
const wikiUserAutocomplete = require("./lib/features/wiki-user-autocomplete");
const wikiLinks = require("./lib/content/wiki-links");
const wikiFootnotes = require("./lib/content/wiki-footnotes");
const wikiHtmlParse = require("./lib/content/wiki-html-parse");
const wikiDiscussionPlaceholder = require("./lib/read/wiki-discussion-placeholder");
const wikiDiscussionSettings = require("./lib/read/wiki-discussion-settings");
const wikiArticleCss = require("./lib/content/wiki-article-css");
const wikiUserMentions = require("./lib/content/wiki-user-mentions");
const wikiMentionNotifications = require("./lib/features/wiki-mention-notifications");
const wikiArticleWatch = require("./lib/features/wiki-article-watch");
const wikiEditLocks = require("./lib/pages/wiki-edit-locks");
const wikiPageActions = require("./lib/pages/wiki-page-actions");
const wikiNativeMutationGuards = require("./lib/pages/wiki-native-mutation-guards");
const wikiRevisionActions = require("./lib/pages/wiki-revision-actions");
const wikiTopdataBotPrivileges = require("./lib/forum/wiki-topdata-bot-privileges");
const wikiRevisionPermissions = require("./lib/pages/wiki-revision-permissions");
const wikiPaths = require("./lib/tree/wiki-paths");
const wikiPageValidation = require("./lib/pages/wiki-page-validation");
const wikiTopicPurge = require("./lib/pages/wiki-topic-purge");
const wikiRoutes = require("./routes/wiki");
const filterCategoriesForum = require("./lib/forum/filter-categories-forum");
const filterForumFeeds = require("./lib/forum/filter-forum-feeds");
const filterForumSearch = require("./lib/forum/filter-forum-search");
const forumExclusionService = require("./lib/forum/forum-exclusion-service");
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
  const wikiNamespaceSearch = require("./lib/features/wiki-namespace-search");
  const wikiHomepage = require("./lib/read/wiki-homepage");
  const wikiPageToc = require("./lib/content/wiki-page-toc");
  const wikiNamespaceCreateController = require("./lib/controllers/wiki-namespace-create");
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
plugin.recordWikiCreateRevision = wikiRevisionActions.recordCreateRevision;
plugin.clearWikiPostEditCache = cacheService.clearWikiPostEditCache;
plugin.onWikiTopicDelete = wikiTopicPurge.onTopicDelete;
plugin.onWikiTopicsPurge = wikiTopicPurge.onTopicsPurge;
plugin.onWikiCategoryUpdate = wikiPageActions.relocateNamespaceIndexPageOnCategoryMove;
plugin.invalidateWikiPathCaches = function () {
  const wikiDirectory = require("./lib/tree/wiki-directory-service");
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
  const wikiDirectory = require("./lib/tree/wiki-directory-service");
  const fromCid = parseInt(data && data.fromCid, 10);
  const toCid = parseInt(data && data.toCid, 10);
  if (Number.isInteger(fromCid) && fromCid > 0) {
    wikiDirectory.invalidateNamespace(fromCid);
  }
  if (Number.isInteger(toCid) && toCid > 0) {
    wikiDirectory.invalidateNamespace(toCid);
  }
  forumExclusionService.clearWikiTidCache();
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
