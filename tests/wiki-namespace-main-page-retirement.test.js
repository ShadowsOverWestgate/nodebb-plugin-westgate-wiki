"use strict";

const assert = require("node:assert/strict");

const { installNodebbStubs } = require("./helpers/nodebb-stub");

installNodebbStubs({
  "nconf": { get: () => "" },
  "./src/controllers/api": {},
  "./src/middleware": { ensureLoggedIn: () => {}, checkRequired: () => {} },
  "./src/plugins": { hooks: { on: () => {} } },
  "./src/routes/helpers": {
    setupAdminPageRoute: () => {},
    setupPageRoute: () => {},
    setupApiRoute(router, method, routePath, middleware, handler) {
      router.registeredRoutes.push({ method, routePath, middleware, handler });
    }
  },
  "./src/slugify": (value) => String(value || "").toLowerCase(),
  "./src/utils": { isNumber: () => true }
});

const wikiDirectory = require("../lib/tree/wiki-directory-service");

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
