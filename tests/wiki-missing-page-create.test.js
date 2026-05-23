"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const missingPageCreate = require("../lib/wiki-missing-page-create");

assert.equal(missingPageCreate.titleFromPageSlug("my-cool-page"), "My Cool Page");
assert.equal(missingPageCreate.titleFromPageSlug("My%20Cool%20Page"), "My Cool Page");
assert.equal(missingPageCreate.titleFromPageSlug("NWScript_Guide"), "NWScript Guide");

const capturedRoutes = new Map();
const originalMainRequire = require.main.require.bind(require.main);

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "nconf": { get: () => "" },
    "./src/controllers/api": { loadConfig: async () => ({ relative_path: "", csrf_token: "", "cache-buster": "" }) },
    "./src/controllers/helpers": {
      notAllowed: () => {
        throw new Error("notAllowed should not be called");
      },
      redirect: () => {
        throw new Error("redirect should not be called");
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
    "./src/privileges": { categories: {}, topics: {}, posts: {} },
    "./src/routes/helpers": {
      setupPageRoute: (router, routePath, middlewareOrHandler, maybeHandler) => {
        capturedRoutes.set(routePath, typeof middlewareOrHandler === "function" ? middlewareOrHandler : maybeHandler);
      }
    },
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/topics": {},
    "./src/user": {},
    "./src/utils": { isNumber: () => true, toISOString: (value) => new Date(value).toISOString() }
  };

  return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
};

const routes = require("../routes/wiki");
const wikiPaths = require("../lib/wiki-paths");
const wikiService = require("../lib/wiki-service");
const wikiNamespaceCreators = require("../lib/wiki-namespace-creators");

wikiNamespaceCreators.getCanCreateWikiNamespaces = async () => false;
wikiPaths.resolveWikiNode = async (requestPath) => {
  if (requestPath === "Lore/Missing_Page") {
    return { status: "not-found", requestedPath: requestPath };
  }
  if (requestPath === "Lore") {
    return {
      status: "ok",
      requestedPath: "Lore",
      canonicalPath: "Lore",
      wikiPath: "/wiki/Lore",
      redirectToCanonical: false,
      node: {
        canonicalPath: "Lore",
        segments: ["Lore"],
        page: null,
        namespace: { cid: 10, canonicalPath: "Lore", category: { cid: 10, name: "Lore" }, categoryChain: [] },
        isComposite: false,
        isBranchOnly: false,
        hasDescendants: true
      },
      ancestors: [],
      children: { directNodes: [], childNamespaces: [], childPages: [] }
    };
  }
  return { status: "not-found", requestedPath: requestPath };
};
wikiService.getSection = async () => ({
  status: "ok",
  section: {
    cid: 10,
    name: "Lore",
    wikiPath: "/wiki/Lore",
    ancestorSections: [],
    childSections: [],
    topics: [],
    topicCount: 0,
    directoryHasMore: false,
    directoryNextCursor: "",
    privileges: { canCreatePage: true }
  }
});

routes.register({ router: { get: () => {} }, middleware: require.main.require("./src/middleware") });
const catchAllHandler = capturedRoutes.get("/wiki/:path(*)");
assert.equal(typeof catchAllHandler, "function", "catch-all route should be registered");

(async () => {
  const renderCalls = [];
  let nextCalled = false;
  await catchAllHandler(
    { params: { path: "Lore/Missing_Page" }, query: {}, uid: 1 },
    {
      locals: {},
      render: (template, data) => renderCalls.push({ template, data })
    },
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(renderCalls[0].template, "wiki-section");
  assert.equal(renderCalls[0].data.hasCreateIntent, true);
  assert.equal(renderCalls[0].data.createIntentTitle, "Missing Page");
  assert.equal(renderCalls[0].data.createIntentAutoload, false);

  const sectionTemplate = fs.readFileSync(path.join(__dirname, "..", "templates/wiki-section.tpl"), "utf8");
  assert.match(
    sectionTemplate,
    /<!-- IF createIntentAutoload -->[\s\S]*data-wiki-create-autoload="1"[\s\S]*<!-- ENDIF createIntentAutoload -->/,
    "direct missing-page prompts should not always auto-open the editor like redlinks do"
  );

  console.log("wiki missing page create tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
