"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const originalMainRequire = require.main.require.bind(require.main);

const categoriesByCid = new Map([
  [1, { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 }],
  [2, { cid: 2, name: "Lore", slug: "2/lore", parentCid: 1 }]
]);
let categoryLookups = 0;

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "./src/categories": {
      getCategoryData: async (cid) => {
        categoryLookups += 1;
        return categoriesByCid.get(parseInt(cid, 10)) || null;
      },
      getChildrenCids: async () => []
    },
    "./src/meta": {
      settings: {
        get: async () => ({
          categoryIds: "1, 2",
          includeChildCategories: "0"
        }),
        setOnEmpty: async () => {},
        set: async () => {}
      }
    },
    "./src/privileges": {
      categories: {
        get: async () => ({ read: true, "topics:read": true })
      }
    },
    "./src/topics": {},
    "./src/utils": {
      isNumber: (value) => String(value || "").trim() !== "" && !Number.isNaN(parseFloat(value))
    }
  };

  return stubs[id] || originalMainRequire(id);
};

function clearProjectModule(relativePath) {
  delete require.cache[require.resolve(path.join(root, relativePath))];
}

(async () => {
  const wikiPaths = require("../lib/wiki-paths");
  const originals = {
    getCanonicalNamespacePathInfo: wikiPaths.getCanonicalNamespacePathInfo,
    getCanonicalNamespacePath: wikiPaths.getCanonicalNamespacePath,
    getCanonicalPagePath: wikiPaths.getCanonicalPagePath
  };
  const calls = {
    namespaces: [],
    pages: []
  };

  wikiPaths.getCanonicalNamespacePath = async (category, options = {}) => {
    calls.namespaces.push({ category, options });
    return options.uid === 99 ? "" : "Lore";
  };
  wikiPaths.getCanonicalNamespacePathInfo = async (category, options = {}) => {
    if (parseInt(category && category.cid, 10) !== 1) {
      return null;
    }
    return {
      valid: true,
      hiddenByPrivileges: false,
      canonicalPath: "",
      wikiPath: "/wiki",
      uid: options.uid
    };
  };
  wikiPaths.getCanonicalPagePath = async (topic, options = {}) => {
    calls.pages.push({ topic, options });
    return options.uid === 99 ? "" : "Lore/Blood_Rites";
  };

  clearProjectModule("lib/wiki-canonical-path-adapter.js");
  const adapter = require("../lib/wiki-canonical-path-adapter");

  try {
    const settings = { routeRootCid: 1, effectiveCategoryIds: [1, 2] };
    const category = categoriesByCid.get(2);
    const topic = { tid: 10, cid: 2, title: "Blood Rites", titleRaw: "Blood Rites" };

    const namespaceInfo = await adapter.getCanonicalNamespaceInfo(category, { uid: 7, settings });
    assert.equal(namespaceInfo.valid, true);
    assert.equal(namespaceInfo.hiddenByPrivileges, false);
    assert.equal(namespaceInfo.canonicalPath, "Lore");
    assert.equal(namespaceInfo.wikiPath, "/wiki/Lore");
    assert.equal(calls.namespaces.length, 1);
    assert.equal(calls.namespaces[0].category, category);
    assert.deepEqual(calls.namespaces[0].options, { uid: 7, settings });
    assert.equal(categoryLookups, 0, "adapter should not rebuild category chains beside the tree facade");

    const rootNamespaceInfo = await adapter.getCanonicalNamespaceInfo(categoriesByCid.get(1), { uid: 7, settings });
    assert.equal(rootNamespaceInfo.valid, true);
    assert.equal(rootNamespaceInfo.hiddenByPrivileges, false);
    assert.equal(rootNamespaceInfo.canonicalPath, "");
    assert.equal(rootNamespaceInfo.wikiPath, "/wiki");

    const hiddenNamespaceInfo = await adapter.getCanonicalNamespaceInfo(category, { uid: 99, settings });
    assert.equal(hiddenNamespaceInfo.valid, false);
    assert.equal(hiddenNamespaceInfo.hiddenByPrivileges, true);
    assert.equal(hiddenNamespaceInfo.canonicalPath, "");
    assert.equal(hiddenNamespaceInfo.wikiPath, "");
    assert.equal(calls.namespaces.length, 3, "hidden namespace detection should re-check unscoped tree visibility");
    assert.equal(calls.namespaces[1].options.uid, 99);
    assert.equal(Object.prototype.hasOwnProperty.call(calls.namespaces[2].options, "uid"), false);

    const pageInfo = await adapter.getCanonicalPageInfo(topic, { uid: 7, settings, namespaceInfo });
    assert.equal(pageInfo.valid, true);
    assert.equal(pageInfo.hiddenByPrivileges, false);
    assert.equal(pageInfo.canonicalPath, "Lore/Blood_Rites");
    assert.equal(pageInfo.wikiPath, "/wiki/Lore/Blood_Rites");
    assert.equal(calls.pages.length, 1);
    assert.equal(calls.pages[0].topic, topic);
    assert.equal(calls.pages[0].options.namespaceInfo, namespaceInfo);

    const hiddenPageInfo = await adapter.getCanonicalPageInfo(topic, { uid: 99, settings });
    assert.equal(hiddenPageInfo.valid, false);
    assert.equal(hiddenPageInfo.hiddenByPrivileges, true);
    assert.equal(hiddenPageInfo.canonicalPath, "");
    assert.equal(hiddenPageInfo.wikiPath, "");
    assert.equal(calls.pages.length, 3, "hidden page detection should re-check unscoped tree visibility");
    assert.equal(calls.pages[1].options.uid, 99);
    assert.equal(Object.prototype.hasOwnProperty.call(calls.pages[2].options, "uid"), false);
    assert.equal(categoryLookups, 0, "adapter should remain a compatibility shim over wiki-paths");

    console.log("wiki canonical path adapter tests passed");
  } finally {
    wikiPaths.getCanonicalNamespacePathInfo = originals.getCanonicalNamespacePathInfo;
    wikiPaths.getCanonicalNamespacePath = originals.getCanonicalNamespacePath;
    wikiPaths.getCanonicalPagePath = originals.getCanonicalPagePath;
    clearProjectModule("lib/wiki-canonical-path-adapter.js");
    require.main.require = originalMainRequire;
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
