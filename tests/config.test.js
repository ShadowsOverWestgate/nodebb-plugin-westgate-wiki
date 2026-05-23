"use strict";

const assert = require("node:assert/strict");

const originalMainRequire = require.main.require.bind(require.main);

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "./src/categories": {
      getChildrenCids: async () => []
    },
    "./src/meta": {
      settings: {
        get: async () => ({}),
        setOnEmpty: async () => {},
        set: async () => {}
      }
    }
  };

  if (!stubs[id]) {
    return originalMainRequire(id);
  }
  return stubs[id];
};

const config = require("../lib/config");

assert.deepStrictEqual(
  config.parseWikiNamespaceCreateGroupNames("Wiki Editor, administrators"),
  ["Wiki Editor", "administrators"]
);

assert.deepStrictEqual(
  config.parseWikiNamespaceCreateGroupNames("Wiki Editor\nGlobal Moderators\nadministrators"),
  ["Wiki Editor", "Global Moderators", "administrators"]
);

assert.deepStrictEqual(
  config.normalizeSettings({ wikiNamespaceCreateGroups: "Wiki Editor, administrators" }).wikiNamespaceCreateGroups,
  ["Wiki Editor", "administrators"]
);

assert.strictEqual(config.normalizeSettings({ routeRootCid: "12" }).routeRootCid, 12);
assert.strictEqual(config.normalizeSettings({ routeRootCid: "0" }).routeRootCid, null);
assert.strictEqual(config.normalizeSettings({ routeRootCid: "not-a-cid" }).routeRootCid, null);
assert.strictEqual(config.normalizeSettings({ routeRootCid: " 12 " }).routeRootCidText, "12");
assert.strictEqual(config.DEFAULT_SETTINGS.routeRootCid, "");

console.log("config tests passed");
