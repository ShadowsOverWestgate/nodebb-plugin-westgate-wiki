"use strict";

const assert = require("node:assert/strict");

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

  return stubs[id] || originalMainRequire(id);
};

const routes = require("../routes/wiki");
const wikiPaths = require("../lib/wiki-paths");

let legacyNamespaceCalls = 0;
let legacyArticleCalls = 0;

wikiPaths.resolveWikiNode = async () => ({
  status: "ambiguous",
  foldedKey: "lore/deities/gond",
  hiddenBlockers: false,
  matches: [
    { canonicalPath: "Lore/Deities/Gond", wikiPath: "/wiki/Lore/Deities/Gond" },
    { canonicalPath: "Lore/Deities/gond", wikiPath: "/wiki/Lore/Deities/gond" }
  ]
});
wikiPaths.resolveNamespacePath = async () => {
  legacyNamespaceCalls += 1;
  return { status: "namespace-not-found" };
};
wikiPaths.resolveArticlePath = async () => {
  legacyArticleCalls += 1;
  return { status: "page-collision" };
};

routes.register({ router: { get: () => {} }, middleware: require.main.require("./src/middleware") });

const catchAllHandler = capturedRoutes.get("/wiki/:path(*)");
assert.equal(typeof catchAllHandler, "function", "catch-all wiki path route should be registered");

(async () => {
  const renderCalls = [];
  let nextCalled = false;
  await catchAllHandler(
    { params: { path: "lore/deities/gond" }, query: {}, uid: 1 },
    {
      locals: {},
      render: (template, data) => {
        renderCalls.push({ template, data });
      }
    },
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, true, "folded canonical ambiguity should not select a legacy slug collision page");
  assert.equal(renderCalls.length, 0);
  assert.equal(legacyNamespaceCalls, 0);
  assert.equal(legacyArticleCalls, 0);

  console.log("wiki route collision tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
