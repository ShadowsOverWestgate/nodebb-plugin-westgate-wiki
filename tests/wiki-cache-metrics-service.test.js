"use strict";

const assert = require("node:assert/strict");

const { installNodebbStubs } = require("./helpers/nodebb-stub");

installNodebbStubs({
  "nconf": { get: () => "" },
  "./src/routes/helpers": {
    setupAdminPageRoute: () => {},
    setupApiRoute: () => {},
    setupPageRoute: () => {}
  },
  "./src/controllers/api": {},
  "./src/middleware": { ensureLoggedIn: () => {}, checkRequired: () => {} },
  "./src/note": {},
  "./src/plugins": { hooks: { on: () => {} } }
});

const plugin = require("../library");

assert(plugin.services.cacheMetrics, "cache metrics service should be exposed");
assert.equal(typeof plugin.services.cacheMetrics.get, "function");
assert.equal(typeof plugin.services.cacheMetrics.reset, "function");

const metrics = plugin.services.cacheMetrics.get();
assert(metrics.config && metrics.config.settings, "config settings metrics should be included");
assert(metrics.wikiPaths && metrics.wikiPaths.treeIndex, "canonical tree index metrics should be included");
assert(metrics.wikiDirectory && metrics.wikiDirectory.summaries, "directory summary metrics should be included");
assert(metrics.wikiDirectory && metrics.wikiDirectory.slugScans, "directory slug scan metrics should be included");

plugin.services.cacheMetrics.reset();

console.log("wiki cache metrics service tests passed");
