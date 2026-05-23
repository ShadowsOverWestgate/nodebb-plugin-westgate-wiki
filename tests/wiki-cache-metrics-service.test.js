"use strict";

const assert = require("node:assert/strict");

const originalMainRequire = require.main.require.bind(require.main);

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "nconf": { get: () => "" },
    "./src/routes/helpers": {
      setupAdminPageRoute: () => {},
      setupApiRoute: () => {},
      setupPageRoute: () => {}
    },
    "./src/categories": { getChildrenCids: async () => [], getCategoryData: async () => null },
    "./src/controllers/api": {},
    "./src/controllers/helpers": {},
    "./src/database": { getSortedSetRange: async () => [], getSortedSetRevRange: async () => [], getObjectField: async () => null, getObject: async () => ({}) },
    "./src/groups": { getNonPrivilegeGroups: async () => [] },
    "./src/meta": { settings: { get: async () => ({}), setOnEmpty: async () => {}, set: async () => {} } },
    "./src/middleware": { ensureLoggedIn: () => {}, checkRequired: () => {} },
    "./src/note": {},
    "./src/notifications": {},
    "./src/plugins": { hooks: { on: () => {} } },
    "./src/posts": {},
    "./src/privileges": { categories: {}, topics: {}, posts: {} },
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/topics": {},
    "./src/user": {},
    "./src/utils": { isNumber: () => true }
  };

  return stubs[id] || originalMainRequire(id);
};

const plugin = require("../library");

assert(plugin.services.cacheMetrics, "cache metrics service should be exposed");
assert.equal(typeof plugin.services.cacheMetrics.get, "function");
assert.equal(typeof plugin.services.cacheMetrics.reset, "function");

const metrics = plugin.services.cacheMetrics.get();
assert(metrics.config && metrics.config.settings, "config settings metrics should be included");
assert(metrics.wikiPaths && metrics.wikiPaths.namespaceIndex, "namespace index metrics should be included");
assert(metrics.wikiPaths && metrics.wikiPaths.treeIndex, "canonical tree index metrics should be included");
assert(metrics.wikiDirectory && metrics.wikiDirectory.summaries, "directory summary metrics should be included");
assert(metrics.wikiDirectory && metrics.wikiDirectory.slugScans, "directory slug scan metrics should be included");

plugin.services.cacheMetrics.reset();

console.log("wiki cache metrics service tests passed");
