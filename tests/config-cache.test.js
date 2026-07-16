"use strict";

const assert = require("node:assert/strict");

const { installNodebbStubs } = require("./helpers/nodebb-stub");

const state = {
  settings: {
    categoryIds: "1",
    includeChildCategories: "1",
    homeTopicId: ""
  },
  childrenByCid: new Map([[1, [2, 3]]]),
  metaGetCalls: 0,
  childrenCalls: 0
};

installNodebbStubs({
  "./src/categories": {
    getChildrenCids: async (cid) => {
      state.childrenCalls += 1;
      return state.childrenByCid.get(parseInt(cid, 10)) || [];
    }
  },
  "./src/meta": {
    settings: {
      get: async () => {
        state.metaGetCalls += 1;
        return { ...state.settings };
      },
      setOnEmpty: async () => {},
      set: async (key, next) => {
        state.settings = { ...next };
      }
    }
  }
});

const config = require("../lib/core/config");

(async () => {
  const first = await config.getSettings();
  const second = await config.getSettings();

  assert.deepStrictEqual(first.effectiveCategoryIds, [1, 2, 3]);
  assert.deepStrictEqual(second.effectiveCategoryIds, [1, 2, 3]);
  assert.strictEqual(state.metaGetCalls, 1, "settings should be read once while cache is warm");
  assert.strictEqual(state.childrenCalls, 1, "descendant expansion should be cached with settings");

  await config.getSettings({ bustCache: true });
  assert.strictEqual(state.metaGetCalls, 2, "bustCache should force a settings reload");
  assert.strictEqual(state.childrenCalls, 2, "bustCache should force descendant expansion");

  await config.setHomeTopicIdInSettings(99);
  const afterHomeChange = await config.getSettings();
  assert.strictEqual(afterHomeChange.homeTopicId, 99);
  assert.strictEqual(state.metaGetCalls, 4, "settings mutation should invalidate cached settings");

  await config.mergeWikiCategoryIdIntoSettings(4);
  const afterCategoryMerge = await config.getSettings();
  assert.deepStrictEqual(afterCategoryMerge.categoryIds, [1, 4]);
  assert.strictEqual(state.metaGetCalls, 6, "category mutation should invalidate cached settings");

  assert.equal(typeof config.invalidateSettingsCache, "function");

  console.log("config cache tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
