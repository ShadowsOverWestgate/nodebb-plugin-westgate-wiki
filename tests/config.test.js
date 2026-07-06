"use strict";

const assert = require("node:assert/strict");

const { installNodebbStubs } = require("./helpers/nodebb-stub");

const state = {
  settings: {},
  categories: new Map(),
  setCalls: []
};

function reset(settings = {}, categories = []) {
  state.settings = { ...settings };
  state.categories = new Map(categories.map((row) => [parseInt(row.cid, 10), row]));
  state.setCalls = [];
}

installNodebbStubs({
  "./src/categories": {
    getCategoryData: async (cid) => state.categories.get(parseInt(cid, 10)) || null,
    getChildrenCids: async () => []
  },
  "./src/meta": {
    settings: {
      get: async () => ({ ...state.settings }),
      setOnEmpty: async (key, defaults) => {
        if (!Object.keys(state.settings).length) {
          state.settings = { ...defaults };
        }
      },
      set: async (key, settings) => {
        state.setCalls.push({ key, settings: { ...settings } });
        state.settings = { ...settings };
      }
    }
  }
});

const config = require("../lib/core/config");

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

(async () => {
  reset(
    { categoryIds: "1, 2", includeChildCategories: "0", routeRootCid: "" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Guides", slug: "2/guides", parentCid: 1 }
    ]
  );
  await config.ensureDefaults();
  assert.strictEqual(state.settings.routeRootCid, "1");
  assert.deepStrictEqual(
    state.setCalls.map((call) => call.settings.routeRootCid),
    ["1"],
    "ensureDefaults should persist a single legacy wiki route root"
  );

  reset(
    { categoryIds: "1, 2", includeChildCategories: "0", routeRootCid: "" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Wiki Archive", slug: "2/wiki", parentCid: 0 }
    ]
  );
  await config.ensureDefaults();
  assert.strictEqual(state.settings.routeRootCid, "");
  assert.deepStrictEqual(state.setCalls, [], "ambiguous wiki roots must stay explicit");

  reset(
    { categoryIds: "1", includeChildCategories: "0", routeRootCid: "10" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 }
    ]
  );
  await config.ensureDefaults();
  assert.strictEqual(state.settings.routeRootCid, "10");
  assert.deepStrictEqual(state.setCalls, [], "an existing explicit route root must not be overwritten");

  console.log("config tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
