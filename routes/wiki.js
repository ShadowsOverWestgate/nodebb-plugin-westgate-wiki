"use strict";

const helpers = require.main.require("./src/controllers/helpers");
const middleware = require.main.require("./src/middleware");
const routeHelpers = require.main.require("./src/routes/helpers");
const composeAssets = require("../lib/compose-assets");
const composeController = require("../lib/controllers/compose");
const wikiNamespaceCreateController = require("../lib/controllers/wiki-namespace-create");
const config = require("../lib/config");
const wikiNamespaceCreators = require("../lib/wiki-namespace-creators");
const wikiAlphabeticalIndex = require("../lib/wiki-alphabetical-index");
const serializer = require("../lib/serializer");
const wikiService = require("../lib/wiki-service");
const topicService = require("../lib/topic-service");
const wikiSearchService = require("../lib/wiki-search-service");
const wikiBreadcrumbTrail = require("../lib/wiki-breadcrumb-trail");
const wikiMissingPageCreate = require("../lib/wiki-missing-page-create");
const wikiPageActions = require("../lib/wiki-page-actions");
const wikiPaths = require("../lib/wiki-paths");

function getCreateIntentTitle(req) {
  return String((req.query && req.query.create) || "").trim();
}

function appendQueryString(path, req) {
  const queryString = new URLSearchParams(req.query || {}).toString();
  return queryString ? `${path}?${queryString}` : path;
}

function buildRequestedWikiPath(namespacePath, pageSlug) {
  const base = String(namespacePath || "/wiki").replace(/\/$/, "");
  const leaf = String(pageSlug || "").replace(/^\//, "");
  return leaf ? `${base}/${leaf}` : base;
}

function getLegacyArticleRequestPath(req) {
  const slug = String(req.params && req.params.slug || "").trim();
  return `/wiki/${req.params.topic_id}${slug ? `/${slug}` : ""}`;
}

function buildPageTitleSegments(pageTitlePath) {
  const path = Array.isArray(pageTitlePath) ? pageTitlePath.filter(Boolean) : [];
  if (path.length <= 1) {
    return [];
  }
  return path.map((segment, index) => ({
    text: segment,
    hasSeparatorBefore: index > 0,
    isParent: index < path.length - 1,
    isLeaf: index === path.length - 1
  }));
}

function buildWikiNavRenderData(sectionNavigation, options = {}) {
  const wikiSidebarPageRows = (sectionNavigation && sectionNavigation.topics) || [];
  const currentTid = options.currentTid ? String(options.currentTid) : "";
  const sectionCid = sectionNavigation && sectionNavigation.cid ? String(sectionNavigation.cid) : "";

  return {
    sectionNavigation,
    hasSectionNavigation: !!sectionNavigation,
    hasSectionChildNamespaces: !!(sectionNavigation && sectionNavigation.childSections.length),
    hasSectionPages: !!(sectionNavigation && (sectionNavigation.topicCount || 0) > 0),
    wikiSidebarPageRows,
    hasWikiSidebarPageRows: wikiSidebarPageRows.length > 0,
    wikiNavFilterId: options.filterId || (currentTid ? `topic-${currentTid}` : `section-${sectionCid}`),
    wikiNavCurrentTid: currentTid,
    hasWikiNavCurrentTid: !!currentTid
  };
}

function buildWikiPageRenderData(wikiPage, { isWikiHome }) {
  const trail = wikiBreadcrumbTrail.forArticleView(wikiPage);

  const pageTitle = serializer.getTitleDisplay(wikiPage.pageTitlePath, wikiPage.topic.titleRaw || wikiPage.topic.title);
  const pageTitleSegments = buildPageTitleSegments(wikiPage.pageTitlePath);
  const pageParentTitle = wikiPage.pageTitlePath.length > 1 ?
    serializer.getTitleDisplay(wikiPage.pageTitlePath.slice(0, -1)) :
    "";
  const canManageWikiPage = !!wikiPage.canEditWikiPage && !isWikiHome;

  return {
    title: wikiPage.topic.title,
    ...trail,
    topic: wikiPage.topic,
    isWikiHome: !!isWikiHome,
    discussionDisabled: !!wikiPage.discussionDisabled,
    showWikiDiscussionLink: !isWikiHome && !wikiPage.discussionDisabled,
    pageTitle,
    pageParentTitle,
    subpageDraftTitle: wikiPageActions.buildSubpageDraftTitle(wikiPage.pageTitlePath, pageTitle),
    pageTitlePath: wikiPage.pageTitlePath,
    pageTitleSegments,
    hasPageTitleSegments: pageTitleSegments.length > 0,
    hasPageParents: wikiPage.parentPages.length > 0,
    parentPages: wikiPage.parentPages,
    category: wikiPage.category,
    canCreateSiblingPage: !!wikiPage.categoryPrivileges["topics:create"],
    canEditWikiPage: !!wikiPage.canEditWikiPage,
    canMoveWikiPage: canManageWikiPage,
    canChangeWikiOwner: canManageWikiPage,
    canMakeWikiSubpage: !!wikiPage.categoryPrivileges["topics:create"],
    canDeleteWikiPage: !!wikiPage.canDeleteWikiPage,
    ...buildWikiNavRenderData(wikiPage.sectionNavigation, { currentTid: wikiPage.topic.tid }),
    /* Inline ToC mount: avoids Benchpress empty IF/ELSE in wiki-page.tpl */
    showWikiTocInline: !wikiPage.sectionNavigation,
    hasArticleCss: !!wikiPage.scopedArticleCss,
    articleCss: wikiPage.articleCss || "",
    scopedArticleCss: wikiPage.scopedArticleCss || "",
    mainPost: wikiPage.mainPost
  };
}

function buildWikiPageCollisionRenderData(article, section) {
  const sectionData = section || {
    ...(article.category || {}),
    name: (article.category && article.category.name) || "Wiki",
    wikiPath: article.namespacePath || "/wiki",
    ancestorSections: []
  };
  const rows = (Array.isArray(article.topics) ? article.topics : []).map((topic) => {
    const row = serializer.serializeTopicSummary(topic);
    return {
      ...row,
      title: serializer.getTitleDisplay(row.titlePath, topic.titleRaw || topic.title || row.title),
      wikiPath: wikiPaths.getLegacyArticlePath(topic)
    };
  });

  return {
    title: "Ambiguous Wiki Page | Westgate Wiki",
    ...wikiBreadcrumbTrail.forSectionView(sectionData),
    section: sectionData,
    requestedWikiPath: buildRequestedWikiPath(article.namespacePath, article.pageSlug),
    pageSlug: article.pageSlug || "",
    pageCollisionRows: rows,
    hasPageCollisionRows: rows.length > 0
  };
}

function buildWikiSearchRenderData(searchResult) {
  const groups = searchResult.groups || { exact: [], pages: [], namespaces: [] };
  const exactResults = groups.exact || [];
  const pageResults = groups.pages || [];
  const namespaceResults = groups.namespaces || [];
  const hasQuery = !!searchResult.hasQuery;
  const hasResults = searchResult.totalReturned > 0;

  return {
    title: hasQuery ? `Search: ${searchResult.query} | Westgate Wiki` : "Search | Westgate Wiki",
    ...wikiBreadcrumbTrail.forWikiSearch(),
    wikiSearchQuery: searchResult.query || "",
    search: searchResult,
    exactResults,
    pageResults,
    namespaceResults,
    hasExactResults: exactResults.length > 0,
    hasPageResults: pageResults.length > 0,
    hasNamespaceResults: namespaceResults.length > 0,
    hasSearchQuery: hasQuery,
    searchQueryTooShort: !!searchResult.queryTooShort,
    searchIsConfigured: !!searchResult.isConfigured,
    hasReadableWikiNamespaces: !!searchResult.hasReadableNamespaces,
    hasSearchResults: hasResults,
    showSearchNoResults: hasQuery && !searchResult.queryTooShort && searchResult.isConfigured && searchResult.hasReadableNamespaces && !hasResults,
    showSearchEmptyPrompt: !hasQuery && searchResult.isConfigured,
    showSearchSetupState: !searchResult.isConfigured,
    showSearchNoReadableNamespaces: hasQuery && !searchResult.queryTooShort && searchResult.isConfigured && !searchResult.hasReadableNamespaces
  };
}

async function getWikiFallbackContext(uid) {
  const wikiData = await wikiService.getSections(uid);
  const canCreateWikiNamespaces = await wikiNamespaceCreators.getCanCreateWikiNamespaces(uid);
  return {
    sections: wikiData.sections,
    hasSections: wikiData.sections.length > 0,
    configuredCategoryCount: wikiData.settings.categoryIds.length,
    effectiveCategoryCount: wikiData.settings.effectiveCategoryIds.length,
    includeChildCategories: wikiData.settings.includeChildCategories,
    hasInvalidCategoryIds: wikiData.invalidCategoryIds.length > 0,
    invalidCategoryIdsText: wikiData.invalidCategoryIds.join(", "),
    canCreateWikiNamespaces
  };
}

async function getRouteRootNamespaceActions(uid, canCreateWikiNamespaces) {
  const rootNamespace = await wikiPaths.resolveRouteRootNamespace();
  if (rootNamespace.status !== "ok") {
    return {
      rootNamespaceCid: "",
      rootNamespaceCanCreatePage: false,
      rootNamespaceCanCreateWikiNamespaces: false
    };
  }

  const wikiSection = await wikiService.getSection(rootNamespace.cid, uid);
  if (wikiSection.status !== "ok") {
    return {
      rootNamespaceCid: "",
      rootNamespaceCanCreatePage: false,
      rootNamespaceCanCreateWikiNamespaces: false
    };
  }

  return {
    rootNamespaceCid: wikiSection.section.cid,
    rootNamespaceCanCreatePage: !!wikiSection.section.privileges.canCreatePage,
    rootNamespaceCanCreateWikiNamespaces: !!canCreateWikiNamespaces
  };
}

function register(params) {
  const { router, middleware } = params;

  composeAssets.register(router);

  routeHelpers.setupPageRoute(router, "/wiki/namespace/create/:parent_cid", [middleware.ensureLoggedIn], wikiNamespaceCreateController.renderChild);

  routeHelpers.setupPageRoute(router, "/wiki/search", async (req, res, next) => {
    try {
      const result = await wikiSearchService.search({
        q: req.query && req.query.q,
        mode: "full",
        limit: req.query && req.query.limit,
        uid: req.uid
      });

      return res.render("wiki-search", buildWikiSearchRenderData(result));
    } catch (err) {
      next(err);
    }
  });

  routeHelpers.setupPageRoute(router, "/wiki", async (req, res, next) => {
    try {
      const settings = await config.getSettings();
      const hubTrail = wikiBreadcrumbTrail.forWikiHub();

      if (!settings.isConfigured) {
        const ctx = await getWikiFallbackContext(req.uid);
        return res.render("wiki", {
          title: "Westgate Wiki",
          ...hubTrail,
          setupRequired: true,
          homePageSetupRequired: false,
          homePageLoadError: false,
          homePageErrorForbidden: false,
          homePageErrorNotFound: false,
          showNamespaceIndex: ctx.hasSections,
          ...ctx
        });
      }

      if (!settings.homeTopicId) {
        const ctx = await getWikiFallbackContext(req.uid);
        let bootstrapHomeCid = null;
        for (const s of ctx.sections) {
          if (s.privileges && s.privileges.canCreatePage) {
            bootstrapHomeCid = s.cid;
            break;
          }
        }
        const canBootstrapHome = Number.isInteger(parseInt(bootstrapHomeCid, 10)) && parseInt(bootstrapHomeCid, 10) > 0;
        return res.render("wiki", {
          title: "Westgate Wiki",
          ...hubTrail,
          setupRequired: false,
          homePageSetupRequired: true,
          homePageLoadError: false,
          homePageErrorForbidden: false,
          homePageErrorNotFound: false,
          showNamespaceIndex: ctx.hasSections,
          canBootstrapHome,
          bootstrapHomeCid: canBootstrapHome ? String(bootstrapHomeCid) : "",
          ...ctx
        });
      }

      const wikiPage = await topicService.getWikiPage(String(settings.homeTopicId), req.uid);

      if (wikiPage.status === "ok") {
        const canCreateWikiNamespaces = await wikiNamespaceCreators.getCanCreateWikiNamespaces(req.uid);
        const rootNamespaceActions = await getRouteRootNamespaceActions(req.uid, canCreateWikiNamespaces);
        const homePageData = {
          ...buildWikiPageRenderData(wikiPage, { isWikiHome: true }),
          canCreateWikiNamespaces,
          ...rootNamespaceActions
        };
        return res.render("wiki-page", homePageData);
      }

      const status = wikiPage.status;
      const ctx = await getWikiFallbackContext(req.uid);
      return res.render("wiki", {
        title: "Westgate Wiki",
        ...hubTrail,
        setupRequired: false,
        homePageSetupRequired: false,
        homePageLoadError: true,
        homePageErrorForbidden: status === "forbidden",
        homePageErrorNotFound: status === "not-found",
        homePageErrorStatus: String(status),
        showNamespaceIndex: ctx.hasSections,
        ...ctx
      });
    } catch (err) {
      next(err);
    }
  });

  async function renderSection(req, res, next, wikiSection, options = {}) {
    const createIntentTitle = getCreateIntentTitle(req);
    const directCreateIntentTitle = String(options.createIntentTitle || "").trim();
    const effectiveCreateIntentTitle = createIntentTitle || directCreateIntentTitle;
    const hasCreateIntent = !!(effectiveCreateIntentTitle && wikiSection.section.privileges.canCreatePage);
    const createIntentAutoload = !!(createIntentTitle && String((req.query && req.query.redlink) || "") === "1");

    const sectionTrail = wikiBreadcrumbTrail.forSectionView(wikiSection.section);

    const canCreateWikiNamespaces = await wikiNamespaceCreators.getCanCreateWikiNamespaces(req.uid);

    const canCreatePage = wikiSection.section.privileges.canCreatePage;
    const sectionContentsIndex = wikiAlphabeticalIndex.buildSectionContentsIndex(
      wikiSection.section.childSections,
      []
    );
    const namespaceIndexEntryCount = wikiSection.section.childSections.length
      + (wikiSection.section.topicCount || 0);

    res.render("wiki-section", {
      title: `${wikiSection.section.name} | Westgate Wiki`,
      ...sectionTrail,
      section: wikiSection.section,
      hasChildSections: wikiSection.section.childSections.length > 0,
      hasTopics: (wikiSection.section.topicCount || 0) > 0,
      wikiIndexNamespaces: sectionContentsIndex.namespaces,
      wikiIndexPageLetters: [],
      hasWikiIndexNamespaces: sectionContentsIndex.namespaces.length > 0,
      hasWikiIndexPageLetters: (wikiSection.section.topicCount || 0) > 0,
      hasNamespaceIndexContent: namespaceIndexEntryCount > 0,
      hasMultipleWikiIndexLetterGroups: false,
      ...buildWikiNavRenderData(wikiSection.section, { filterId: `section-${wikiSection.section.cid}` }),
      canCreatePage,
      hasCreateIntent,
      createIntentTitle: effectiveCreateIntentTitle,
      createIntentAutoload,
      canCreateWikiNamespaces
    });
  }

  async function renderArticle(req, res, next, tid) {
    const wikiPage = await topicService.getWikiPage(tid, req.uid);

    if (wikiPage.status === "invalid" || wikiPage.status === "not-found" || wikiPage.status === "not-wiki") {
      return next();
    }

    if (wikiPage.status === "forbidden") {
      return helpers.notAllowed(req, res);
    }

    const settings = await config.getSettings();
    if (settings.homeTopicId && parseInt(wikiPage.topic.tid, 10) === settings.homeTopicId && !res.locals.isAPI) {
      return helpers.redirect(res, appendQueryString("/wiki", req), true);
    }

    const canCreateWikiNamespaces = await wikiNamespaceCreators.getCanCreateWikiNamespaces(req.uid);
    const pageData = {
      ...buildWikiPageRenderData(wikiPage, { isWikiHome: false }),
      canCreateWikiNamespaces
    };
    res.render("wiki-page", pageData);
  }

  routeHelpers.setupPageRoute(router, "/wiki/category/:category_id/:slug?", async (req, res, next) => {
    const wikiSection = await wikiService.getSection(req.params.category_id, req.uid);

    if (wikiSection.status === "invalid" || wikiSection.status === "not-found" || wikiSection.status === "not-wiki") {
      return next();
    }

    if (wikiSection.status === "forbidden") {
      return helpers.notAllowed(req, res);
    }

    if (!res.locals.isAPI) {
      return helpers.redirect(res, appendQueryString(wikiSection.section.wikiPath, req), true);
    }

    return renderSection(req, res, next, wikiSection);
  });

  routeHelpers.setupPageRoute(router, "/wiki/compose/:cid", [middleware.ensureLoggedIn], composeController.renderCompose);

  routeHelpers.setupPageRoute(router, "/wiki/edit/:tid", [middleware.ensureLoggedIn], composeController.renderEdit);

  routeHelpers.setupPageRoute(router, "/wiki/:topic_id(\\d+)/:slug?", async (req, res, next) => {
    const wikiPage = await topicService.getWikiPage(req.params.topic_id, req.uid);

    if (wikiPage.status === "invalid" || wikiPage.status === "not-found" || wikiPage.status === "not-wiki") {
      return next();
    }

    if (wikiPage.status === "forbidden") {
      return helpers.notAllowed(req, res);
    }

    if (!res.locals.isAPI) {
      const canonicalPath = wikiPage.topic.wikiPath || await wikiPaths.getArticlePath(wikiPage.topic);
      if (canonicalPath && canonicalPath !== getLegacyArticleRequestPath(req)) {
        return helpers.redirect(res, appendQueryString(canonicalPath, req), true);
      }
    }

    return renderArticle(req, res, next, req.params.topic_id);
  });

  routeHelpers.setupPageRoute(router, "/wiki/:path(*)", async (req, res, next) => {
    const pathSegments = wikiPaths.splitPath(req.params.path);
    if (!pathSegments.length) {
      return next();
    }

    const namespace = await wikiPaths.resolveNamespacePath(pathSegments);
    if (namespace.status === "ok") {
      const wikiSection = await wikiService.getSection(namespace.cid, req.uid);
      if (wikiSection.status === "forbidden") {
        return helpers.notAllowed(req, res);
      }
      if (wikiSection.status !== "ok") {
        return next();
      }
      return renderSection(req, res, next, wikiSection);
    }

    const article = await wikiPaths.resolveArticlePath(pathSegments, req.uid);
    if (article.status === "page-not-found" && article.cid) {
      const wikiSection = await wikiService.getSection(article.cid, req.uid);
      if (wikiSection.status === "forbidden") {
        return helpers.notAllowed(req, res);
      }
      if (wikiSection.status === "ok" && wikiSection.section.privileges.canCreatePage) {
        const createIntentTitle = wikiMissingPageCreate.titleFromPageSlug(article.pageSlug);
        if (createIntentTitle) {
          return renderSection(req, res, next, wikiSection, { createIntentTitle });
        }
      }
      return next();
    }
    if (article.status === "page-collision" && article.cid) {
      const wikiSection = await wikiService.getSection(article.cid, req.uid);
      if (wikiSection.status === "forbidden") {
        return helpers.notAllowed(req, res);
      }
      if (wikiSection.status === "ok") {
        return res.render("wiki-page-collision", buildWikiPageCollisionRenderData(article, wikiSection.section));
      }
      return next();
    }
    if (article.status !== "ok") {
      return next();
    }

    return renderArticle(req, res, next, article.tid);
  });
}

module.exports = {
  register,
  buildWikiPageCollisionRenderData,
  buildWikiPageRenderData,
  buildWikiSearchRenderData
};
