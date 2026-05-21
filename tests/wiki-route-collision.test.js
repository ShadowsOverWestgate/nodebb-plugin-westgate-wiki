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
    "./src/categories": { getCategoryData: async () => null, getChildrenCids: async () => [] },
    "./src/database": { getSortedSetRange: async () => [], getSortedSetRevRange: async () => [], getObjectField: async () => null, getObject: async () => ({}) },
    "./src/groups": { getNonPrivilegeGroups: async () => [] },
    "./src/meta": { settings: { get: async () => ({}), setOnEmpty: async () => {}, set: async () => {} } },
    "./src/middleware": { ensureLoggedIn: () => {} },
    "./src/notifications": {},
    "./src/plugins": { hooks: { on: () => {} } },
    "./src/posts": {},
    "./src/privileges": { categories: {}, topics: {}, posts: {} },
    "./src/routes/helpers": {
      setupPageRoute: (router, routePath, middlewareOrHandler, maybeHandler) => {
        capturedRoutes.set(routePath, typeof middlewareOrHandler === "function" ? middlewareOrHandler : maybeHandler);
      }
    },
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/topics": {},
    "./src/user": {},
    "./src/utils": { isNumber: () => true }
  };

  return stubs[id] || originalMainRequire(id);
};

const routes = require("../routes/wiki");
const wikiPaths = require("../lib/wiki-paths");
const wikiService = require("../lib/wiki-service");

wikiPaths.resolveNamespacePath = async () => ({ status: "namespace-not-found" });
wikiPaths.resolveArticlePath = async () => ({
  status: "page-collision",
  cid: 1,
  category: { cid: 1, name: "Wiki", slug: "1/wiki" },
  namespacePath: "/wiki",
  pageSlug: "ckeditor-page",
  topics: [
    { tid: 12, cid: 1, title: "Ckeditor Page", titleRaw: "Ckeditor Page", slug: "12/ckeditor-page" },
    { tid: 13, cid: 1, title: "CKEditor Page.................", titleRaw: "CKEditor Page.................", slug: "13/ckeditor-page" }
  ]
});
wikiService.getSection = async () => ({
  status: "ok",
  section: {
    cid: 1,
    name: "Wiki",
    wikiPath: "/wiki",
    ancestorSections: [],
    privileges: { canCreatePage: true }
  }
});

routes.register({ router: { get: () => {} }, middleware: require.main.require("./src/middleware") });

const catchAllHandler = capturedRoutes.get("/wiki/:path(*)");
assert.equal(typeof catchAllHandler, "function", "catch-all wiki path route should be registered");

(async () => {
  const renderCalls = [];
  let nextCalled = false;
  await catchAllHandler(
    { params: { path: "ckeditor-page" }, query: {}, uid: 1 },
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

  assert.equal(nextCalled, false, "ambiguous wiki article paths should not fall through to NodeBB's 404 route");
  assert.equal(renderCalls.length, 1);
  assert.equal(renderCalls[0].template, "wiki-page-collision");
  assert.equal(renderCalls[0].data.requestedWikiPath, "/wiki/ckeditor-page");
  assert.deepEqual(
    renderCalls[0].data.pageCollisionRows.map((row) => [row.title, row.wikiPath]),
    [
      ["Ckeditor Page", "/wiki/12/ckeditor-page"],
      ["CKEditor Page.................", "/wiki/13/ckeditor-page"]
    ]
  );

  console.log("wiki route collision tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
