"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const originalMainRequire = require.main.require.bind(require.main);

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "nconf": { get: () => "" },
    "./src/categories": {},
    "./src/controllers/api": {},
    "./src/controllers/helpers": { formatApiResponse: () => {} },
    "./src/database": {},
    "./src/groups": { getNonPrivilegeGroups: async () => [] },
    "./src/meta": { settings: { get: async () => ({}), setOnEmpty: async () => {}, set: async () => {} } },
    "./src/middleware": { ensureLoggedIn: () => {}, checkRequired: () => {} },
    "./src/notifications": {},
    "./src/plugins": { hooks: { on: () => {} } },
    "./src/posts": {},
    "./src/privileges": {},
    "./src/routes/helpers": {
      setupAdminPageRoute: () => {},
      setupPageRoute: () => {},
      setupApiRoute(router, method, routePath, middleware, handler) {
        router.registeredRoutes.push({ method, routePath, middleware, handler });
      }
    },
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/topics": {},
    "./src/user": {},
    "./src/utils": { isNumber: () => true }
  };
  return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
};

const wikiDirectory = require("../lib/wiki-directory-service");

const rows = wikiDirectory.sortSummaries([
  { tid: 40, title: "Alpha", titleLeaf: "Alpha", titlePath: ["Alpha"] },
  { tid: 41, title: "Beta", titleLeaf: "Beta", titlePath: ["Beta"] }
], 41);

assert.deepEqual(
  rows.map((row) => row.tid),
  [40, 41],
  "directory summaries should not pin namespace-main-page topics"
);
assert.equal(
  Object.prototype.hasOwnProperty.call(rows[1], "isNamespaceMainPage"),
  false,
  "directory summary rows should not expose namespace-main-page state"
);

const composeController = fs.readFileSync(path.join(root, "lib/controllers/compose.js"), "utf8");
assert.doesNotMatch(
  composeController,
  /wikiNamespaceMainPages|namespaceMainPageApiUrl|canSetNamespaceMainPage|isNamespaceMainPage|showNamespaceMainPageToggle/,
  "compose render data and payload should not reference retired namespace-main-page state"
);

const composeClient = fs.readFileSync(path.join(root, "public/wiki-compose-page.js"), "utf8");
assert.doesNotMatch(
  composeClient,
  /wiki-compose-namespace-main-page|namespaceMainPageApiUrl|canSetNamespaceMainPage|namespace main page/i,
  "compose client should not look for the retired checkbox or save namespace-main-page state"
);

const directoryService = fs.readFileSync(path.join(root, "lib/wiki-directory-service.js"), "utf8");
assert.doesNotMatch(
  directoryService,
  /wikiNamespaceMainPages|getMainTopicIdForCid|isNamespaceMainPage/,
  "directory service should not read or pin namespace-main-page selections"
);

(async () => {
  const plugin = require("../library");
  const router = { registeredRoutes: [] };
  await plugin.registerApiRoutes({
    router,
    middleware: {
      ensureLoggedIn: function ensureLoggedIn() {},
      checkRequired: () => function checkRequired() {}
    }
  });

  assert.equal(
    router.registeredRoutes.some((route) => route.routePath === "/westgate-wiki/namespace-main-page"),
    false,
    "retired namespace-main-page API route should not be registered"
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(plugin.services, "wikiNamespaceMainPages"),
    false,
    "retired namespace-main-page service should not be publicly exported"
  );

  console.log("wiki namespace main page retirement tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
