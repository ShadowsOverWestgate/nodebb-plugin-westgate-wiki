"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const capturedRoutes = new Map();
const redirects = [];
const originalMainRequire = require.main.require.bind(require.main);

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "nconf": { get: () => "" },
    "./src/controllers/api": { loadConfig: async () => ({ relative_path: "", csrf_token: "", "cache-buster": "" }) },
    "./src/controllers/helpers": {
      notAllowed: () => {
        throw new Error("notAllowed should not be called");
      },
      redirect: (res, path, permanent) => {
        redirects.push({ path, permanent });
        if (res && typeof res.redirect === "function") {
          res.redirect(path);
        }
      }
    },
    "./src/categories": { getCategoryData: async () => null, getChildren: async () => [[]], getChildrenCids: async () => [] },
    "./src/database": { getSortedSetRange: async () => [], getSortedSetRevRange: async () => [], getObjectField: async () => null, getObject: async () => ({}) },
    "./src/groups": { getNonPrivilegeGroups: async () => [] },
    "./src/meta": { settings: { get: async () => ({}), setOnEmpty: async () => {}, set: async () => {} } },
    "./src/middleware": { ensureLoggedIn: () => {} },
    "./src/notifications": {},
    "./src/plugins": { hooks: { on: () => {} } },
    "./src/posts": { getPostSummaryByPids: async () => [], getUserInfoForPosts: async () => [] },
    "./src/privileges": { categories: { get: async () => ({}), can: async () => true }, topics: { get: async () => ({}) }, posts: { canEdit: async () => ({ flag: false }) } },
    "./src/routes/helpers": {
      setupPageRoute: (router, routePath, middlewareOrHandler, maybeHandler) => {
        capturedRoutes.set(routePath, typeof middlewareOrHandler === "function" ? middlewareOrHandler : maybeHandler);
      }
    },
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/topics": { getTopicData: async () => null },
    "./src/user": {},
    "./src/utils": { isNumber: (value) => /^\d+$/.test(String(value || "")), toISOString: (value) => new Date(value).toISOString() }
  };

  return stubs[id] || originalMainRequire(id);
};

const routes = require("../routes/wiki");
const config = require("../lib/config");
const wikiPaths = require("../lib/wiki-paths");
const wikiService = require("../lib/wiki-service");
const topicService = require("../lib/topic-service");
const wikiNamespaceCreators = require("../lib/wiki-namespace-creators");

let resolveWikiNodeResult = null;
let resolveWikiNodeImpl = null;
let legacyNamespaceResult = { status: "namespace-not-found" };
let legacyArticleResult = { status: "page-not-found" };
let resolveWikiNodeCalls = [];
let legacyNamespaceCalls = 0;
let legacyArticleCalls = 0;
let getWikiPageCalls = [];
let getSectionCalls = [];
let getWikiPageImpl = null;
let getSectionImpl = null;
let getSectionsImpl = null;
let getSettingsImpl = null;
let getArticlePathImpl = null;
let canCreateWikiNamespaces = false;

wikiPaths.resolveWikiNode = async (requestPath, options) => {
  resolveWikiNodeCalls.push({ requestPath, options });
  return resolveWikiNodeImpl(requestPath, options);
};
wikiPaths.resolveNamespacePath = async () => {
  legacyNamespaceCalls += 1;
  return legacyNamespaceResult;
};
wikiPaths.resolveArticlePath = async () => {
  legacyArticleCalls += 1;
  return legacyArticleResult;
};
wikiPaths.getArticlePath = async (topic) => getArticlePathImpl(topic);
wikiNamespaceCreators.getCanCreateWikiNamespaces = async () => canCreateWikiNamespaces;

function makeWikiPage(tid = 77) {
  return {
    status: "ok",
    topic: {
      tid,
      cid: 20,
      title: "Gond",
      titleRaw: "Gond",
      slug: `${tid}/gond`,
      wikiPath: "/wiki/Lore/Deities/Gond"
    },
    category: {
      cid: 20,
      name: "Deities",
      wikiPath: "/wiki/Lore/Deities"
    },
    categoryPrivileges: { "topics:create": true },
    topicPrivileges: { "topics:delete": false },
    canEditWikiPage: true,
    canDeleteWikiPage: true,
    canWatchWikiArticle: true,
    wikiArticleWatched: false,
    discussionDisabled: false,
    articleCss: "",
    scopedArticleCss: "",
    ancestorSections: [
      { name: "Lore", wikiPath: "/wiki/Lore" }
    ],
    pageTitlePath: ["Gond"],
    parentPages: [],
    sectionNavigation: null,
    mainPost: {
      content: "<p>Gond article body.</p>"
    }
  };
}

function makeWikiSection(cid = 42) {
  return {
    status: "ok",
    section: {
      cid,
      name: "Gond",
      wikiPath: "/wiki/Lore/Deities/Gond",
      ancestorSections: [
        { name: "Lore", wikiPath: "/wiki/Lore" },
        { name: "Deities", wikiPath: "/wiki/Lore/Deities" }
      ],
      childSections: [],
      topics: [],
      topicCount: 0,
      directoryHasMore: false,
      directoryNextCursor: "",
      privileges: { canCreatePage: true }
    }
  };
}

topicService.getWikiPage = async (tid) => {
  getWikiPageCalls.push(tid);
  return getWikiPageImpl(tid);
};
wikiService.getSection = async (cid, uid, options) => {
  getSectionCalls.push({ cid, uid, options });
  return getSectionImpl(cid);
};
wikiService.getSections = async (uid) => getSectionsImpl(uid);
config.getSettings = async () => getSettingsImpl();

routes.register({ router: { get: () => {} }, middleware: require.main.require("./src/middleware") });

const catchAllHandler = capturedRoutes.get("/wiki/:path(*)");
assert.equal(typeof catchAllHandler, "function", "catch-all wiki path route should be registered");
const legacyCategoryHandler = capturedRoutes.get("/wiki/category/:category_id/:slug?");
assert.equal(legacyCategoryHandler, undefined, "retired legacy wiki category route should not be registered");
const legacyArticleHandler = capturedRoutes.get("/wiki/:topic_id(\\d+)/:slug?");
assert.equal(legacyArticleHandler, undefined, "retired legacy numeric article route should not be registered");
const hubHandler = capturedRoutes.get("/wiki");
assert.equal(typeof hubHandler, "function", "wiki hub route should be registered");

function resetStubs() {
  redirects.length = 0;
  resolveWikiNodeCalls = [];
  legacyNamespaceCalls = 0;
  legacyArticleCalls = 0;
  getWikiPageCalls = [];
  getSectionCalls = [];
  legacyNamespaceResult = { status: "namespace-not-found" };
  legacyArticleResult = { status: "page-not-found" };
  resolveWikiNodeResult = baseNodeResult();
  resolveWikiNodeImpl = async () => resolveWikiNodeResult;
  getWikiPageImpl = async (tid) => makeWikiPage(parseInt(tid, 10));
  getSectionImpl = async (cid) => makeWikiSection(parseInt(cid, 10));
  getSectionsImpl = async () => ({
    settings: {
      categoryIds: [],
      effectiveCategoryIds: [],
      includeChildCategories: false
    },
    sections: [],
    invalidCategoryIds: []
  });
  getSettingsImpl = async () => ({
    isConfigured: true,
    homeTopicId: null
  });
  getArticlePathImpl = async () => "";
  canCreateWikiNamespaces = false;
}

function baseNodeResult(overrides = {}) {
  return {
    status: "ok",
    requestedPath: "Lore/Deities/Gond",
    canonicalPath: "Lore/Deities/Gond",
    wikiPath: "/wiki/Lore/Deities/Gond",
    redirectToCanonical: false,
    node: {
      canonicalPath: "Lore/Deities/Gond",
      segments: ["Lore", "Deities", "Gond"],
      page: {
        tid: 77,
        cid: 20,
        canonicalPath: "Lore/Deities/Gond",
        titlePath: ["Gond"],
        topic: { tid: 77, cid: 20, title: "Gond", titleRaw: "Gond" }
      },
      namespace: {
        cid: 42,
        canonicalPath: "Lore/Deities/Gond",
        category: { cid: 42, name: "Gond" },
        categoryChain: [
          { cid: 10, name: "Lore" },
          { cid: 20, name: "Deities" },
          { cid: 42, name: "Gond" }
        ]
      },
      isComposite: true,
      isBranchOnly: false,
      hasDescendants: true
    },
    ancestors: [
      { canonicalPath: "Lore", segment: "Lore", wikiPath: "/wiki/Lore" },
      { canonicalPath: "Lore/Deities", segment: "Deities", wikiPath: "/wiki/Lore/Deities" }
    ],
    children: {
      directNodes: [
        {
          canonicalPath: "Lore/Deities/Gond/Clerics",
          segments: ["Lore", "Deities", "Gond", "Clerics"],
          wikiPath: "/wiki/Lore/Deities/Gond/Clerics",
          page: null,
          namespace: {
            cid: 43,
            canonicalPath: "Lore/Deities/Gond/Clerics",
            category: { cid: 43, name: "Clerics" },
            categoryChain: []
          },
          isComposite: false,
          isBranchOnly: false,
          hasDescendants: false
        }
      ],
      childNamespaces: [],
      childPages: []
    },
    ...overrides
  };
}

async function runCatchAll(path) {
  const renderCalls = [];
  let nextCalled = false;
  await catchAllHandler(
    { params: { path }, query: {}, uid: 5 },
    {
      locals: {},
      render: (template, data) => {
        renderCalls.push({ template, data });
      },
      redirect: () => {}
    },
    () => {
      nextCalled = true;
    }
  );
  return { renderCalls, nextCalled };
}

async function runHub() {
  const renderCalls = [];
  let nextCalled = false;
  await hubHandler(
    { params: {}, query: {}, uid: 5 },
    {
      locals: {},
      render: (template, data) => {
        renderCalls.push({ template, data });
      },
      redirect: () => {}
    },
    () => {
      nextCalled = true;
    }
  );
  return { renderCalls, nextCalled };
}

(async () => {
  resetStubs();
  canCreateWikiNamespaces = true;
  resolveWikiNodeResult = baseNodeResult();
  legacyNamespaceResult = { status: "ok", cid: 42 };
  const composite = await runCatchAll("Lore/Deities/Gond");

  assert.equal(composite.nextCalled, false);
  assert.equal(composite.renderCalls.length, 1);
  assert.equal(composite.renderCalls[0].template, "wiki-page");
  assert.equal(composite.renderCalls[0].data.topic.tid, 77);
  assert.equal(composite.renderCalls[0].data.canEditWikiPage, true);
  assert.equal(composite.renderCalls[0].data.canDeleteWikiPage, true);
  assert.equal(composite.renderCalls[0].data.isNamespaceIndexPage, true);
  assert.equal(composite.renderCalls[0].data.canMoveWikiPage, false);
  assert.equal(composite.renderCalls[0].data.canChangeWikiOwner, false);
  assert.equal(composite.renderCalls[0].data.canMakeWikiSubpage, false);
  assert.equal(composite.renderCalls[0].data.namespaceIndexActionCid, 42);
  assert.equal(composite.renderCalls[0].data.namespaceIndexCanCreatePage, true);
  assert.equal(composite.renderCalls[0].data.namespaceIndexCanCreateWikiNamespaces, true);
  assert.equal(composite.renderCalls[0].data.namespaceIndexDeleteRedirectPath, "/wiki/Lore/Deities/Gond");
  assert.equal(composite.renderCalls[0].data.nodeListing.rows[0].wikiPath, "/wiki/Lore/Deities/Gond/Clerics");
  assert.equal(composite.renderCalls[0].data.hasNodeListingNamespaceRows, true);
  assert.equal(composite.renderCalls[0].data.nodeListingNamespaceRows[0].displayTitle, "Clerics");
  assert.equal(composite.renderCalls[0].data.nodeListing.namespaceRows[0].displayTitle, "Clerics");
  assert.equal(composite.renderCalls[0].data.hasNodeListingArticleRows, false);
  assert.equal(Object.prototype.hasOwnProperty.call(composite.renderCalls[0].data, "canonicalNode"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(composite.renderCalls[0].data, "namespaceSection"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(composite.renderCalls[0].data.nodeListing.rows[0], "topic"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(composite.renderCalls[0].data.nodeListing.rows[0], "category"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(composite.renderCalls[0].data.nodeListing.rows[0], "categoryChain"), false);
  assert.deepEqual(resolveWikiNodeCalls[0], {
    requestPath: "Lore/Deities/Gond",
    options: { uid: 5, includeChildren: true }
  });
  assert.deepEqual(getSectionCalls, [
    { cid: 42, uid: 5, options: { pinHomeTopic: true } }
  ]);
  assert.equal(legacyNamespaceCalls, 0);
  assert.equal(legacyArticleCalls, 0);

  resetStubs();
  canCreateWikiNamespaces = true;
  resolveWikiNodeResult = baseNodeResult({
    canonicalPath: "Test_child_ns",
    wikiPath: "/wiki/Test_child_ns",
    node: {
      canonicalPath: "Test_child_ns",
      segments: ["Test_child_ns"],
      page: {
        tid: 77,
        cid: 20,
        canonicalPath: "Test_child_ns",
        titlePath: ["test child ns"],
        topic: { tid: 77, cid: 20, title: "test child ns", titleRaw: "test child ns" }
      },
      namespace: {
        cid: 42,
        canonicalPath: "Test_child_ns",
        category: { cid: 42, name: "test child ns" },
        categoryChain: [
          { cid: 1, name: "Wiki" },
          { cid: 42, name: "test child ns" }
        ]
      },
      isComposite: true,
      isBranchOnly: false,
      hasDescendants: true
    },
    ancestors: [
      { canonicalPath: "", segment: "Wiki", wikiPath: "/wiki" }
    ],
    children: {
      directNodes: [
        {
          canonicalPath: "Test_child_ns/asdf",
          segments: ["Test_child_ns", "asdf"],
          wikiPath: "/wiki/Test_child_ns/asdf",
          page: {
            tid: 88,
            cid: 42,
            canonicalPath: "Test_child_ns/asdf",
            titlePath: ["asdf"],
            topic: { tid: 88, cid: 42, title: "asdf", titleRaw: "asdf" }
          },
          namespace: null,
          isComposite: false,
          isBranchOnly: false,
          hasDescendants: true
        }
      ],
      childNamespaces: [],
      childPages: []
    }
  });
  getWikiPageImpl = async (tid) => ({
    ...makeWikiPage(parseInt(tid, 10)),
    category: { cid: 42, name: "test child ns", wikiPath: "/wiki/Test_child_ns" },
    ancestorSections: [{ name: "Wiki", wikiPath: "/wiki" }],
    pageTitlePath: ["test child ns"],
    sectionNavigation: {
      cid: 42,
      name: "test child ns",
      wikiPath: "/wiki/Test_child_ns",
      childSections: [],
      topics: [{ tid: 88, title: "asdf", titleLeaf: "asdf", wikiPath: "/wiki/Test_child_ns/asdf" }],
      topicCount: 1
    }
  });
  getSectionImpl = async () => ({
    status: "ok",
    section: {
      cid: 42,
      name: "test child ns",
      wikiPath: "/wiki/Test_child_ns",
      ancestorSections: [{ name: "Wiki", wikiPath: "/wiki" }],
      childSections: [],
      topics: [{ tid: 88, title: "asdf", titleLeaf: "asdf", wikiPath: "/wiki/Test_child_ns/asdf" }],
      topicCount: 1,
      directoryHasMore: false,
      directoryNextCursor: "",
      privileges: { canCreatePage: true }
    }
  });
  const compositeWithArticleSubtree = await runCatchAll("Test_child_ns");

  assert.equal(compositeWithArticleSubtree.renderCalls[0].template, "wiki-page");
  assert.equal(compositeWithArticleSubtree.renderCalls[0].data.isNamespaceIndexPage, true);
  assert.equal(compositeWithArticleSubtree.renderCalls[0].data.hasNodeListingArticleRows, true);
  assert.equal(compositeWithArticleSubtree.renderCalls[0].data.nodeListingArticleRows[0].displayTitle, "asdf");
  assert.equal(compositeWithArticleSubtree.renderCalls[0].data.nodeListing.articleRows[0].displayTitle, "asdf");
  assert.equal(compositeWithArticleSubtree.renderCalls[0].data.nodeListing.articleRows[0].hasDescendants, true);
  assert.equal(compositeWithArticleSubtree.renderCalls[0].data.hasNodeListingBranchRows, false);
  assert.equal(compositeWithArticleSubtree.renderCalls[0].data.hasNodeListingNamespaceRows, false);

  resetStubs();
  resolveWikiNodeResult = baseNodeResult();
  getSectionImpl = async () => ({ status: "forbidden" });
  const readableArticleHiddenNamespace = await runCatchAll("Lore/Deities/Gond");

  assert.equal(readableArticleHiddenNamespace.nextCalled, false);
  assert.equal(readableArticleHiddenNamespace.renderCalls[0].template, "wiki-page");
  assert.equal(readableArticleHiddenNamespace.renderCalls[0].data.topic.tid, 77);
  assert.equal(readableArticleHiddenNamespace.renderCalls[0].data.hasNamespace, false);

  resetStubs();
  resolveWikiNodeResult = baseNodeResult();
  getWikiPageImpl = async () => ({ status: "forbidden" });
  const visibleNamespaceUnreadableArticle = await runCatchAll("Lore/Deities/Gond");

  assert.equal(visibleNamespaceUnreadableArticle.nextCalled, false);
  assert.equal(visibleNamespaceUnreadableArticle.renderCalls[0].template, "wiki-section");
  assert.equal(visibleNamespaceUnreadableArticle.renderCalls[0].data.hasArticle, false);
  assert.equal(visibleNamespaceUnreadableArticle.renderCalls[0].data.section.cid, 42);
  assert.equal(visibleNamespaceUnreadableArticle.renderCalls[0].data.canCreatePage, true);

  resetStubs();
  resolveWikiNodeResult = baseNodeResult({
    node: {
      ...baseNodeResult().node,
      namespace: null,
      isComposite: false
    },
    children: {
      directNodes: [],
      childNamespaces: [],
      childPages: []
    }
  });
  const pageOnly = await runCatchAll("Lore/Deities/Gond");

  assert.equal(pageOnly.renderCalls[0].template, "wiki-page");
  assert.equal(pageOnly.renderCalls[0].data.topic.tid, 77);
  assert.equal(pageOnly.renderCalls[0].data.hasNamespace, false);
  assert.equal(pageOnly.renderCalls[0].data.nodeListing.rows.length, 0);
  assert.deepEqual(getSectionCalls, []);

  resetStubs();
  resolveWikiNodeResult = baseNodeResult({
    node: {
      ...baseNodeResult().node,
      namespace: null,
      isComposite: false,
      hasDescendants: true
    },
    children: {
      directNodes: [
        {
          canonicalPath: "Lore/Deities/Gond/Forge_Prayers",
          segments: ["Lore", "Deities", "Gond", "Forge_Prayers"],
          wikiPath: "/wiki/Lore/Deities/Gond/Forge_Prayers",
          page: {
            tid: 88,
            cid: 20,
            canonicalPath: "Lore/Deities/Gond/Forge_Prayers",
            titlePath: ["Gond", "Forge Prayers"],
            topic: { tid: 88, cid: 20, title: "Gond :: Forge Prayers", titleRaw: "Gond :: Forge Prayers" }
          },
          namespace: null,
          isComposite: false,
          isBranchOnly: false,
          hasDescendants: false
        }
      ],
      childNamespaces: [],
      childPages: []
    }
  });
  const pageOnlyWithSubpages = await runCatchAll("Lore/Deities/Gond");

  assert.equal(pageOnlyWithSubpages.renderCalls[0].template, "wiki-page");
  assert.equal(pageOnlyWithSubpages.renderCalls[0].data.hasNamespace, false);
  assert.equal(pageOnlyWithSubpages.renderCalls[0].data.isNamespaceIndexPage, false);
  assert.equal(pageOnlyWithSubpages.renderCalls[0].data.canMoveWikiPage, true);
  assert.equal(pageOnlyWithSubpages.renderCalls[0].data.canMakeWikiSubpage, true);
  assert.equal(pageOnlyWithSubpages.renderCalls[0].data.hasNodeListingArticleRows, true);
  assert.equal(pageOnlyWithSubpages.renderCalls[0].data.nodeListingArticleRows[0].displayTitle, "Forge Prayers");
  assert.equal(pageOnlyWithSubpages.renderCalls[0].data.nodeListing.articleRows[0].displayTitle, "Forge Prayers");
  assert.equal(pageOnlyWithSubpages.renderCalls[0].data.hasNodeListingNamespaceRows, false);
  assert.deepEqual(getSectionCalls, []);

  resetStubs();
  canCreateWikiNamespaces = true;
  resolveWikiNodeResult = baseNodeResult({
    node: {
      ...baseNodeResult().node,
      page: null,
      isComposite: false
    }
  });
  getSectionImpl = async (cid) => {
    if (parseInt(cid, 10) === 20) {
      return {
        status: "ok",
        section: {
          cid: 20,
          name: "Deities",
          wikiPath: "/wiki/Lore/Deities",
          ancestorSections: [{ name: "Lore", wikiPath: "/wiki/Lore" }],
          childSections: [],
          topics: [],
          topicCount: 0,
          directoryHasMore: false,
          directoryNextCursor: "",
          privileges: { canCreatePage: true }
        }
      };
    }
    return makeWikiSection(parseInt(cid, 10));
  };
  const namespaceOnly = await runCatchAll("Lore/Deities/Gond");

  assert.equal(namespaceOnly.renderCalls[0].template, "wiki-section");
  assert.equal(namespaceOnly.renderCalls[0].data.hasArticle, false);
  assert.equal(namespaceOnly.renderCalls[0].data.section.cid, 42);
  assert.equal(namespaceOnly.renderCalls[0].data.canCreatePage, true);
  assert.equal(namespaceOnly.renderCalls[0].data.canCreateWikiNamespaces, true);
  assert.equal(namespaceOnly.renderCalls[0].data.canCreateNamespaceIndexPage, true);
  assert.equal(namespaceOnly.renderCalls[0].data.namespaceIndexCreateCid, 20);
  assert.equal(namespaceOnly.renderCalls[0].data.namespaceIndexCreateTitle, "Gond");
  assert.equal(namespaceOnly.renderCalls[0].data.namespaceIndexCreateRedirectPath, "/wiki/Lore/Deities/Gond");
  assert.equal(namespaceOnly.renderCalls[0].data.namespaceIndexCreateNamespacePath, "/wiki/Lore/Deities");
  assert.deepEqual(getWikiPageCalls, []);
  assert.deepEqual(getSectionCalls[0], {
    cid: 42,
    uid: 5,
    options: { pinHomeTopic: true, fullDirectoryListing: true }
  });

  resetStubs();
  resolveWikiNodeResult = baseNodeResult({
    node: {
      ...baseNodeResult().node,
      page: null,
      isComposite: false
    }
  });
  getSectionImpl = async (cid) => {
    if (parseInt(cid, 10) === 20) {
      return {
        status: "ok",
        section: {
          cid: 20,
          name: "Deities",
          wikiPath: "/wiki/Lore/Deities",
          ancestorSections: [{ name: "Lore", wikiPath: "/wiki/Lore" }],
          childSections: [],
          topics: [],
          topicCount: 0,
          directoryHasMore: false,
          directoryNextCursor: "",
          privileges: { canCreatePage: false }
        }
      };
    }
    return makeWikiSection(parseInt(cid, 10));
  };
  const namespaceOnlyNoParentCreate = await runCatchAll("Lore/Deities/Gond");

  assert.equal(namespaceOnlyNoParentCreate.renderCalls[0].template, "wiki-section");
  assert.equal(namespaceOnlyNoParentCreate.renderCalls[0].data.canCreateNamespaceIndexPage, false);

  resetStubs();
  resolveWikiNodeResult = baseNodeResult({
    canonicalPath: "Lore",
    wikiPath: "/wiki/Lore",
    node: {
      canonicalPath: "Lore",
      segments: ["Lore"],
      page: null,
      namespace: {
        cid: 10,
        canonicalPath: "Lore",
        category: { cid: 10, name: "Lore", parentCid: 1 },
        categoryChain: [
          { cid: 10, name: "Lore", parentCid: 1 }
        ]
      },
      isComposite: false,
      isBranchOnly: false,
      hasDescendants: true
    }
  });
  getSectionImpl = async (cid) => {
    if (parseInt(cid, 10) === 1) {
      return {
        status: "ok",
        section: {
          cid: 1,
          name: "Wiki",
          wikiPath: "/wiki",
          ancestorSections: [],
          childSections: [],
          topics: [],
          topicCount: 0,
          directoryHasMore: false,
          directoryNextCursor: "",
          privileges: { canCreatePage: true }
        }
      };
    }
    return makeWikiSection(parseInt(cid, 10));
  };
  const routeRootChildNamespace = await runCatchAll("Lore");

  assert.equal(routeRootChildNamespace.renderCalls[0].template, "wiki-section");
  assert.equal(routeRootChildNamespace.renderCalls[0].data.canCreateNamespaceIndexPage, true);
  assert.equal(routeRootChildNamespace.renderCalls[0].data.namespaceIndexCreateCid, 1);
  assert.equal(routeRootChildNamespace.renderCalls[0].data.namespaceIndexCreateTitle, "Lore");
  assert.equal(routeRootChildNamespace.renderCalls[0].data.namespaceIndexCreateRedirectPath, "/wiki/Lore");
  assert.equal(routeRootChildNamespace.renderCalls[0].data.namespaceIndexCreateNamespacePath, "/wiki");

  resetStubs();
  resolveWikiNodeImpl = async (requestPath) => {
    if (requestPath === "Lore/Deities/Missing_Page") {
      return { status: "not-found", requestedPath: requestPath };
    }
    if (requestPath === "Lore/Deities") {
      return baseNodeResult({
        canonicalPath: "Lore/Deities",
        wikiPath: "/wiki/Lore/Deities",
        node: {
          canonicalPath: "Lore/Deities",
          segments: ["Lore", "Deities"],
          page: null,
          namespace: {
            cid: 42,
            canonicalPath: "Lore/Deities",
            category: { cid: 42, name: "Deities" },
            categoryChain: []
          },
          isComposite: false,
          isBranchOnly: false,
          hasDescendants: true
        },
        ancestors: [{ canonicalPath: "Lore", segment: "Lore", wikiPath: "/wiki/Lore" }]
      });
    }
    return { status: "not-found", requestedPath: requestPath };
  };
  const missingNamespaceChild = await runCatchAll("Lore/Deities/Missing_Page");

  assert.equal(missingNamespaceChild.nextCalled, false);
  assert.equal(missingNamespaceChild.renderCalls[0].template, "wiki-section");
  assert.equal(missingNamespaceChild.renderCalls[0].data.hasCreateIntent, true);
  assert.equal(missingNamespaceChild.renderCalls[0].data.createIntentTitle, "Missing Page");
  assert.equal(missingNamespaceChild.renderCalls[0].data.createIntentAutoload, false);

  resetStubs();
  resolveWikiNodeImpl = async (requestPath) => {
    if (requestPath === "Lore/Deities/Gond/Missing_Page") {
      return { status: "not-found", requestedPath: requestPath };
    }
    if (requestPath === "Lore/Deities/Gond") {
      return baseNodeResult();
    }
    return { status: "not-found", requestedPath: requestPath };
  };
  const missingCompositeChild = await runCatchAll("Lore/Deities/Gond/Missing_Page");

  assert.equal(missingCompositeChild.nextCalled, false);
  assert.equal(missingCompositeChild.renderCalls[0].template, "wiki-page");
  assert.equal(missingCompositeChild.renderCalls[0].data.hasCreateIntent, true);
  assert.equal(missingCompositeChild.renderCalls[0].data.createIntentTitle, "Missing Page");
  assert.equal(missingCompositeChild.renderCalls[0].data.createIntentCid, 42);
  assert.equal(missingCompositeChild.renderCalls[0].data.createIntentNamespaceName, "Gond");
  assert.equal(missingCompositeChild.renderCalls[0].data.createIntentAutoload, false);

  resetStubs();
  getSectionsImpl = async () => ({
    settings: {
      categoryIds: [100],
      effectiveCategoryIds: [100],
      includeChildCategories: false
    },
    sections: [
      {
        cid: 100,
        name: "HiddenParent",
        description: "Hidden namespace description",
        wikiPath: "",
        hasWikiPath: false,
        topicCount: 0,
        topics: [],
        privileges: { canCreatePage: true }
      }
    ],
    invalidCategoryIds: []
  });
  const hubHiddenRoot = await runHub();

  assert.equal(hubHiddenRoot.nextCalled, false);
  assert.equal(hubHiddenRoot.renderCalls.length, 1);
  assert.equal(hubHiddenRoot.renderCalls[0].template, "wiki");
  assert.deepEqual(hubHiddenRoot.renderCalls[0].data.sections, []);
  assert.equal(hubHiddenRoot.renderCalls[0].data.hasSections, false);
  assert.doesNotMatch(
    JSON.stringify(hubHiddenRoot.renderCalls[0].data),
    /HiddenParent|Hidden namespace description/,
    "wiki hub render data should not include hidden configured roots"
  );

  resetStubs();
  resolveWikiNodeResult = baseNodeResult({
    redirectToCanonical: true,
    wikiPath: "/wiki/Lore/Deities/Gond"
  });
  const redirected = await runCatchAll("lore/deities/gond");

  assert.equal(redirected.renderCalls.length, 0);
  assert.equal(redirected.nextCalled, false);
  assert.deepEqual(redirects, [{ path: "/wiki/Lore/Deities/Gond", permanent: true }]);

  resetStubs();
  resolveWikiNodeImpl = async (requestPath) => {
    assert.match(requestPath, /^category\/42(?:\/gond)?$/);
    return {
      status: "not-found",
      requestedPath: requestPath
    };
  };
  const retiredCategoryRouteShape = await runCatchAll("category/42/gond");

  assert.equal(retiredCategoryRouteShape.renderCalls.length, 0);
  assert.equal(retiredCategoryRouteShape.nextCalled, true);
  assert.deepEqual(redirects, []);

  resetStubs();
  resolveWikiNodeImpl = async (requestPath) => {
    assert.match(requestPath, /^77(?:\/gond)?$/);
    return {
      status: "not-found",
      requestedPath: requestPath
    };
  };
  const retiredNumericRouteShape = await runCatchAll("77/gond");

  assert.equal(retiredNumericRouteShape.renderCalls.length, 0);
  assert.equal(retiredNumericRouteShape.nextCalled, true);
  assert.deepEqual(redirects, []);

  resetStubs();
  resolveWikiNodeResult = baseNodeResult({
    node: {
      canonicalPath: "Lore/Calendar",
      segments: ["Lore", "Calendar"],
      page: null,
      namespace: null,
      isComposite: false,
      isBranchOnly: true,
      hasDescendants: true
    },
    children: {
      directNodes: [
        {
          canonicalPath: "Lore/Calendar/Months",
          segments: ["Lore", "Calendar", "Months"],
          wikiPath: "/wiki/Lore/Calendar/Months",
          page: null,
          namespace: null,
          isComposite: false,
          isBranchOnly: true,
          hasDescendants: true
        }
      ],
      childNamespaces: [],
      childPages: []
    }
  });
  const branchOnly = await runCatchAll("Lore/Calendar");

  assert.equal(branchOnly.renderCalls[0].template, "wiki");
  assert.equal(branchOnly.renderCalls[0].data.hasArticle, false);
  assert.equal(branchOnly.renderCalls[0].data.hasNamespace, false);
  assert.equal(branchOnly.renderCalls[0].data.isBranchOnly, true);
  assert.equal(branchOnly.renderCalls[0].data.nodeListing.rows[0].wikiPath, "/wiki/Lore/Calendar/Months");
  assert.equal(branchOnly.renderCalls[0].data.nodeListingRows[0].wikiPath, "/wiki/Lore/Calendar/Months");

  const sorted = wikiService.sortSectionTopics({
    topics: [
      { tid: 40, title: "Alpha", titleLeaf: "Alpha", titlePath: ["Alpha"] },
      { tid: 41, title: "Beta", titleLeaf: "Beta", titlePath: ["Beta"] }
    ]
  }, 41);
  assert.deepEqual(
    sorted.topics.map((row) => row.tid),
    [40, 41],
    "namespace-main-page selections should not pin route/render listing order"
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(sorted.topics[1], "isNamespaceMainPage"),
    false,
    "active render rows should not expose namespace-main-page state"
  );

  const composeTemplate = fs.readFileSync(path.join(__dirname, "../templates/wiki-compose.tpl"), "utf8");
  assert.doesNotMatch(
    composeTemplate,
    /showNamespaceMainPageToggle|wiki-compose-namespace-main-page|main page for this namespace/,
    "compose UI should not expose retired namespace-main-page controls"
  );

  const pageTemplate = fs.readFileSync(path.join(__dirname, "../templates/wiki-page.tpl"), "utf8");
  assert.match(pageTemplate, /wiki-fab-dock[\s\S]*data-wiki-article-watch[\s\S]*article-body\.css/);
  assert.match(pageTemplate, /aria-label="<!-- IF isNamespaceIndexPage -->Namespace tools<!-- ELSE -->Page tools<!-- ENDIF isNamespaceIndexPage -->"/);
  assert.match(
    pageTemplate,
    /<!-- IF isNamespaceIndexPage -->[\s\S]*data-wiki-create-page="1"[\s\S]*data-cid="\{namespaceIndexActionCid\}"[\s\S]*\/wiki\/namespace\/create\/\{namespaceIndexActionCid\}[\s\S]*<!-- ELSE -->[\s\S]*data-wiki-move-page[\s\S]*<!-- ENDIF isNamespaceIndexPage -->/,
    "namespace index pages should render namespace-scoped floating actions instead of page-only move/subpage actions"
  );
  assert.match(
    pageTemplate,
    /<!-- IF hasNodeListingNamespaceRows -->[\s\S]*Child Namespaces[\s\S]*<!-- BEGIN nodeListingNamespaceRows -->/,
    "composite contents should distinguish child namespaces from article rows"
  );
  assert.match(
    pageTemplate,
    /<!-- IF hasNodeListingArticleRows -->[\s\S]*<!-- IF isNamespaceIndexPage -->Articles<!-- ELSE -->Subpages<!-- ENDIF isNamespaceIndexPage -->[\s\S]*<!-- BEGIN nodeListingArticleRows -->/,
    "page-only contents should label descendant articles as subpages instead of namespaces"
  );
  assert.match(pageTemplate, /<!-- IF hasCreateIntent -->[\s\S]*data-wiki-create-page="1"[\s\S]*<!-- ENDIF hasCreateIntent -->/);
  assert.match(pageTemplate, /<!-- IF hasNodeListingRows -->[\s\S]*wiki-node-contents/);

  const sectionTemplate = fs.readFileSync(path.join(__dirname, "../templates/wiki-section.tpl"), "utf8");
  assert.match(sectionTemplate, /wiki-fab-dock[\s\S]*data-wiki-create-page="1"[\s\S]*namespace\/create/);
  assert.match(
    sectionTemplate,
    /<!-- IF canCreateNamespaceIndexPage -->[\s\S]*data-wiki-create-page="1"[\s\S]*data-cid="\{namespaceIndexCreateCid\}"[\s\S]*data-title="\{namespaceIndexCreateTitle\}"[\s\S]*data-wiki-create-redirect-path="\{namespaceIndexCreateRedirectPath\}"[\s\S]*data-wiki-create-namespace-path="\{namespaceIndexCreateNamespacePath\}"[\s\S]*Create index page[\s\S]*<!-- ENDIF canCreateNamespaceIndexPage -->/,
    "namespace-only views should expose a dedicated create-index-page action"
  );
  assert.match(
    sectionTemplate,
    /<!-- IF \.\/hasWikiPath -->[\s\S]*<a class="wiki-index-entry-title" href="\{config\.relative_path\}\{\.\/wikiPath\}"[\s\S]*<!-- ELSE -->[\s\S]*<span class="wiki-index-entry-title/,
    "namespace section template should not render unconditional page links when wikiPath is blank"
  );
  assert.match(
    sectionTemplate,
    /<!-- IF \.\/hasWikiPath -->[\s\S]*<a class="wiki-index-entry-title" href="\{config\.relative_path\}\{\.\/wikiPath\}"[\s\S]*<!-- ELSE -->[\s\S]*<span class="wiki-index-entry-title/,
    "namespace section template should not render unconditional namespace links when wikiPath is blank"
  );

  const navTemplate = fs.readFileSync(path.join(__dirname, "../templates/partials/wiki/page-nav-drawer.tpl"), "utf8");
  assert.match(
    navTemplate,
    /<!-- IF sectionNavigation\.hasWikiPath -->[\s\S]*<a class="wiki-sidebar-nav-ns" href="\{config\.relative_path\}\{sectionNavigation\.wikiPath\}"[\s\S]*<!-- ELSE -->[\s\S]*<span class="wiki-sidebar-nav-ns/,
    "page nav drawer should not render an unconditional namespace link when wikiPath is blank"
  );
  assert.match(
    navTemplate,
    /<!-- IF \.\/hasWikiPath -->[\s\S]*<a class="wiki-sidebar-nav-page" href="\{config\.relative_path\}\{\.\/wikiPath\}"[\s\S]*<!-- ELSE -->[\s\S]*<span class="wiki-sidebar-nav-page/,
    "page nav drawer should not render unconditional page or child namespace links when wikiPath is blank"
  );

  const publicClient = fs.readFileSync(path.join(__dirname, "../public/wiki.js"), "utf8");
  const hubTemplate = fs.readFileSync(path.join(__dirname, "../templates/wiki.tpl"), "utf8");
  assert.match(
    hubTemplate,
    /<!-- IF hasNodeListingRows -->[\s\S]*<!-- BEGIN nodeListingRows -->/,
    "branch-only contents should use a top-level rows loop"
  );

  assert.match(
    publicClient,
    /redirectPath[\s\S]*data-wiki-create-redirect-path/,
    "create-page client should support an explicit post-create redirect path for namespace index pages"
  );
  assert.match(
    publicClient,
    /submittedTitle[\s\S]*redirectTitleChanged[\s\S]*redirectPath && !redirectTitleChanged/,
    "create-page client should ignore the explicit namespace index redirect when the submitted title changes"
  );

  console.log("wiki canonical node route tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
