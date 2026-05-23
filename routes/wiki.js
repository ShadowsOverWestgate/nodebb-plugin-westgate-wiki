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
    canWatchWikiArticle: !!wikiPage.canWatchWikiArticle,
    wikiArticleWatched: !!wikiPage.wikiArticleWatched,
    ...buildWikiNavRenderData(wikiPage.sectionNavigation, { currentTid: wikiPage.topic.tid }),
    /* Inline ToC mount: avoids Benchpress empty IF/ELSE in wiki-page.tpl */
    showWikiTocInline: !wikiPage.sectionNavigation,
    hasArticleCss: !!wikiPage.scopedArticleCss,
    articleCss: wikiPage.articleCss || "",
    scopedArticleCss: wikiPage.scopedArticleCss || "",
    mainPost: wikiPage.mainPost
  };
}

function canonicalWikiPath(canonicalPath) {
  return canonicalPath ? `/wiki/${canonicalPath}` : "";
}

function getNodeLeafTitle(node) {
  const pageTitlePath = node && node.page && Array.isArray(node.page.titlePath) ? node.page.titlePath : [];
  if (pageTitlePath.length) {
    return pageTitlePath[pageTitlePath.length - 1];
  }
  if (node && node.namespace && node.namespace.category && node.namespace.category.name) {
    return node.namespace.category.name;
  }
  const segments = Array.isArray(node && node.segments) ? node.segments : [];
  if (segments.length) {
    return segments[segments.length - 1];
  }
  return String(node && node.canonicalPath || "Wiki");
}

function buildCanonicalNodeListingRows(children) {
  return (children && Array.isArray(children.directNodes) ? children.directNodes : []).map((node) => {
    const displayTitle = getNodeLeafTitle(node);
    return {
      canonicalPath: node.canonicalPath || "",
      wikiPath: node.wikiPath || canonicalWikiPath(node.canonicalPath),
      displayTitle,
      title: displayTitle,
      hasPage: !!node.page,
      hasNamespace: !!node.namespace,
      isComposite: !!node.isComposite,
      isBranchOnly: !!node.isBranchOnly,
      hasDescendants: !!node.hasDescendants
    };
  });
}

function buildCreateIntentRenderData(req, section, options = {}) {
  const createIntentTitle = getCreateIntentTitle(req);
  const directCreateIntentTitle = String(options.createIntentTitle || "").trim();
  const effectiveCreateIntentTitle = createIntentTitle || directCreateIntentTitle;
  const canCreatePage = !!(section && section.privileges && section.privileges.canCreatePage);
  const hasCreateIntent = !!(effectiveCreateIntentTitle && canCreatePage);
  const createIntentAutoload = !!(createIntentTitle && String((req.query && req.query.redlink) || "") === "1");

  return {
    canCreatePage,
    hasCreateIntent,
    createIntentTitle: effectiveCreateIntentTitle,
    createIntentCid: section && section.cid ? section.cid : "",
    createIntentNamespaceName: section && section.name ? section.name : "",
    createIntentAutoload
  };
}

async function buildCanonicalPageRenderData(req, nodeResult, wikiPage, wikiSection, options = {}) {
  const section = wikiSection && wikiSection.section;
  const rows = buildCanonicalNodeListingRows(nodeResult.children);
  const node = nodeResult.node || {};

  return {
    ...buildWikiPageRenderData(wikiPage, { isWikiHome: false }),
    ...wikiBreadcrumbTrail.forCanonicalNodeView(nodeResult),
    canonicalNodeView: true,
    canonicalPath: nodeResult.canonicalPath || node.canonicalPath || "",
    wikiPath: nodeResult.wikiPath || canonicalWikiPath(nodeResult.canonicalPath),
    hasNamespace: !!section,
    isComposite: !!node.isComposite,
    isBranchOnly: false,
    hasDescendants: !!node.hasDescendants,
    nodeListing: {
      rows,
      hasRows: rows.length > 0
    },
    hasNodeListingRows: rows.length > 0,
    ...(section ? buildCreateIntentRenderData(req, section, options) : {
      canCreatePage: false,
      hasCreateIntent: false,
      createIntentTitle: "",
      createIntentCid: "",
      createIntentNamespaceName: "",
      createIntentAutoload: false
    }),
    canCreateWikiNamespaces: await wikiNamespaceCreators.getCanCreateWikiNamespaces(req.uid)
  };
}

async function buildCanonicalNodeRenderData(req, nodeResult, wikiPage, wikiSection) {
  const article = wikiPage ? buildWikiPageRenderData(wikiPage, { isWikiHome: false }) : null;
  const namespace = wikiSection ? { section: wikiSection.section } : null;
  const rows = buildCanonicalNodeListingRows(nodeResult.children);
  const node = nodeResult.node || {};
  const canonicalTitle = article && article.pageTitle ?
    article.pageTitle :
    (namespace && namespace.section && namespace.section.name ? namespace.section.name : getNodeLeafTitle(node));
  const canCreateWikiNamespaces = await wikiNamespaceCreators.getCanCreateWikiNamespaces(req.uid);

  return {
    title: `${canonicalTitle} | Westgate Wiki`,
    ...wikiBreadcrumbTrail.forCanonicalNodeView(nodeResult, { leafText: canonicalTitle }),
    canonicalNodeView: true,
    canonicalPath: nodeResult.canonicalPath || node.canonicalPath || "",
    wikiPath: nodeResult.wikiPath || canonicalWikiPath(nodeResult.canonicalPath),
    canonicalTitle,
    article,
    hasArticle: !!article,
    namespace,
    hasNamespace: !!namespace,
    isComposite: !!node.isComposite,
    isBranchOnly: !!node.isBranchOnly,
    hasDescendants: !!node.hasDescendants,
    nodeListing: {
      rows,
      hasRows: rows.length > 0
    },
    hasNodeListingRows: rows.length > 0,
    canCreateWikiNamespaces
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
  const sections = (Array.isArray(wikiData.sections) ? wikiData.sections : [])
    .filter((section) => section && section.wikiPath && section.hasWikiPath !== false);
  const canCreateWikiNamespaces = await wikiNamespaceCreators.getCanCreateWikiNamespaces(uid);
  return {
    sections,
    hasSections: sections.length > 0,
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
    const sectionTrail = wikiBreadcrumbTrail.forSectionView(wikiSection.section);

    const canCreateWikiNamespaces = await wikiNamespaceCreators.getCanCreateWikiNamespaces(req.uid);

    const createIntentData = buildCreateIntentRenderData(req, wikiSection.section, options);
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
      hasArticle: false,
      ...createIntentData,
      canCreateWikiNamespaces
    });
  }

  async function renderCanonicalNode(req, res, next, nodeResult, options = {}) {
    const pageFacet = nodeResult.node && nodeResult.node.page;
    const namespaceFacet = nodeResult.node && nodeResult.node.namespace;

    const [wikiPage, wikiSection] = await Promise.all([
      pageFacet ? topicService.getWikiPage(pageFacet.tid, req.uid) : null,
      namespaceFacet ? wikiService.getSection(namespaceFacet.cid, req.uid) : null
    ]);

    const visiblePage = wikiPage && wikiPage.status === "ok" ? wikiPage : null;
    const visibleSection = wikiSection && wikiSection.status === "ok" ? wikiSection : null;
    const hasBranchListing = !!(nodeResult.node && nodeResult.node.isBranchOnly && nodeResult.children && nodeResult.children.directNodes.length);
    if (!visiblePage && !visibleSection && !hasBranchListing) {
      if (
        (wikiPage && wikiPage.status === "forbidden") ||
        (wikiSection && wikiSection.status === "forbidden")
      ) {
        return helpers.notAllowed(req, res);
      }
      return next();
    }

    if (visiblePage) {
      return res.render("wiki-page", await buildCanonicalPageRenderData(req, nodeResult, visiblePage, visibleSection, options));
    }

    if (visibleSection) {
      return renderSection(req, res, next, visibleSection, options);
    }

    return res.render("wiki", await buildCanonicalNodeRenderData(req, nodeResult, null, null));
  }

  async function renderMissingCanonicalChild(req, res, next, requestPath) {
    const pathSegments = wikiPaths.splitPath(requestPath);
    if (pathSegments.length < 2) {
      return false;
    }

    const createIntentTitle = wikiMissingPageCreate.titleFromPageSlug(pathSegments[pathSegments.length - 1]);
    if (!createIntentTitle) {
      return false;
    }

    const parentPath = pathSegments.slice(0, -1).join("/");
    const parentResult = await wikiPaths.resolveWikiNode(parentPath, {
      uid: req.uid,
      includeChildren: true
    });
    if (parentResult.status !== "ok" || !(parentResult.node && parentResult.node.namespace)) {
      return false;
    }

    const wikiSection = await wikiService.getSection(parentResult.node.namespace.cid, req.uid);
    if (wikiSection.status !== "ok" || !(wikiSection.section.privileges && wikiSection.section.privileges.canCreatePage)) {
      return false;
    }

    await renderCanonicalNode(req, res, next, parentResult, { createIntentTitle });
    return true;
  }

  routeHelpers.setupPageRoute(router, "/wiki/compose/:cid", [middleware.ensureLoggedIn], composeController.renderCompose);

  routeHelpers.setupPageRoute(router, "/wiki/edit/:tid", [middleware.ensureLoggedIn], composeController.renderEdit);

  routeHelpers.setupPageRoute(router, "/wiki/:path(*)", async (req, res, next) => {
    const requestPath = String(req.params.path || "").trim();
    if (!wikiPaths.splitPath(requestPath).length) {
      return next();
    }

    const nodeResult = await wikiPaths.resolveWikiNode(requestPath, {
      uid: req.uid,
      includeChildren: true
    });
    if (nodeResult.status !== "ok") {
      if (nodeResult.status === "not-found" && await renderMissingCanonicalChild(req, res, next, requestPath)) {
        return;
      }
      return next();
    }

    if (nodeResult.redirectToCanonical && nodeResult.wikiPath && !(res.locals && res.locals.isAPI)) {
      return helpers.redirect(res, appendQueryString(nodeResult.wikiPath, req), true);
    }

    return renderCanonicalNode(req, res, next, nodeResult);
  });
}

module.exports = {
  register,
  buildWikiPageRenderData,
  buildWikiSearchRenderData
};
