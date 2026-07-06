"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const root = process.cwd();
const originalMainRequire = require.main.require.bind(require.main);

function clearWikiLinksModule() {
  [
    "lib/content/wiki-links.js",
    "lib/core/config.js",
    "lib/core/serializer.js",
    "lib/tree/wiki-directory-service.js",
    "lib/tree/wiki-paths.js",
    "lib/pages/wiki-tombstones.js"
  ].forEach((relativePath) => {
    const filename = require.resolve(`${root}/${relativePath}`);
    delete require.cache[filename];
  });
}

async function withWikiLinksStubs(fn) {
  const stubs = {
    "nconf": { get: () => undefined },
    "./src/categories": {
      getCategoryData: async (cid) => ({ cid, name: "Lore", parentCid: 0, slug: "1/lore" }),
      getChildrenCids: async () => []
    },
    "./src/privileges": {
      categories: { get: async () => ({}) },
      topics: {
        filterTids: async (privilege, tids, uid) => (parseInt(uid, 10) === 0 ? tids : [])
      }
    },
    "./src/topics": { getTopicData: async () => null, getTopicsFields: async () => [], getTopicField: async () => null },
    "./src/meta": { settings: { get: async () => ({ categoryIds: "1", includeChildCategories: "0" }), setOnEmpty: async () => {}, set: async () => {} } },
    "./src/database": { getSortedSetRange: async () => [], getSortedSetRevRange: async () => [], getObjectField: async () => null, getObject: async () => ({}) },
    "./src/user": { isAdministrator: async () => false },
    "./src/controllers/helpers": {},
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/utils": { isNumber: () => false }
  };

  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };

  try {
    clearWikiLinksModule();
    require.cache[require.resolve(`${root}/lib/tree/wiki-directory-service.js`)] = {
      exports: {
        normalizeWikiLinkTitle: (value) => String(value || "").trim().toLowerCase(),
        getAllTopicSlugRows: async () => [{
          tid: 10,
          cid: 1,
          title: "Public Page",
          titleRaw: "Public Page",
          slug: "10/public-page",
          deleted: 0,
          scheduled: 0
        }]
      }
    };
    require.cache[require.resolve(`${root}/lib/tree/wiki-paths.js`)] = {
      exports: {
        ...require(`${root}/lib/tree/wiki-paths.js`),
        getCanonicalNamespaceInfo: async () => ({
          valid: true,
          canonicalPath: "Lore",
          wikiPath: "/wiki/Lore"
        }),
        getCanonicalPageInfo: async () => ({
          valid: true,
          canonicalPath: "Lore/Public_Page",
          wikiPath: "/wiki/Lore/Public_Page"
        })
      }
    };
    return await fn(require("../lib/content/wiki-links"));
  } finally {
    require.main.require = originalMainRequire;
    clearWikiLinksModule();
  }
}

async function withThrowingPageStubs(fn) {
  const stubs = {
    "nconf": { get: () => undefined },
    "./src/categories": {
      getCategoryData: async (cid) => ({ cid, name: "Lore", parentCid: 0, slug: "1/lore" }),
      getChildrenCids: async () => []
    },
    "./src/privileges": {
      categories: { get: async () => ({}) },
      topics: {
        filterTids: async (privilege, tids, uid) => (parseInt(uid, 10) === 0 ? tids : [])
      }
    },
    "./src/topics": { getTopicData: async () => null, getTopicsFields: async () => [], getTopicField: async () => null },
    "./src/meta": { settings: { get: async () => ({ categoryIds: "1", includeChildCategories: "0" }), setOnEmpty: async () => {}, set: async () => {} } },
    "./src/database": { getSortedSetRange: async () => [], getSortedSetRevRange: async () => [], getObjectField: async () => null, getObject: async () => ({}) },
    "./src/user": { isAdministrator: async () => false },
    "./src/controllers/helpers": {},
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/utils": { isNumber: () => false }
  };

  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };

  try {
    clearWikiLinksModule();
    require.cache[require.resolve(`${root}/lib/tree/wiki-directory-service.js`)] = {
      exports: {
        normalizeWikiLinkTitle: (value) => String(value || "").trim().toLowerCase(),
        getAllTopicSlugRows: async () => [
          { tid: 10, cid: 1, title: "Public Page", titleRaw: "Public Page", slug: "10/public-page", deleted: 0, scheduled: 0 },
          { tid: 11, cid: 1, title: "Broken Page", titleRaw: "Broken Page", slug: "11/broken-page", deleted: 0, scheduled: 0 }
        ]
      }
    };
    require.cache[require.resolve(`${root}/lib/tree/wiki-paths.js`)] = {
      exports: {
        ...require(`${root}/lib/tree/wiki-paths.js`),
        getCanonicalNamespaceInfo: async () => ({
          valid: true,
          canonicalPath: "Lore",
          wikiPath: "/wiki/Lore"
        }),
        getCanonicalPageInfo: async (topic) => {
          if (String(topic.tid) === "11") {
            throw new Error("synthetic canonical-path failure");
          }
          return {
            valid: true,
            canonicalPath: "Lore/Public_Page",
            wikiPath: "/wiki/Lore/Public_Page"
          };
        }
      }
    };
    return await fn(require("../lib/content/wiki-links"));
  } finally {
    require.main.require = originalMainRequire;
    clearWikiLinksModule();
  }
}

test("transformWikiPostContent uses the anonymous parse-cache viewer, not hook uid fields", async () => {
  await withWikiLinksStubs(async (wikiLinks) => {
    const anonymousParse = {
      postData: {
        cid: 99,
        content: "[[Public Page]]"
      }
    };
    const uidParse = {
      uid: 7,
      req: { uid: 7 },
      postData: {
        cid: 99,
        content: "[[Public Page]]"
      }
    };

    await wikiLinks.transformWikiPostContent(anonymousParse);
    await wikiLinks.transformWikiPostContent(uidParse);

    assert.equal(uidParse.postData.content, anonymousParse.postData.content);
    assert.match(uidParse.postData.content, /href="\/wiki\/Lore\/Public_Page"/);
    assert.equal(typeof wikiLinks.transformWikiPostContent, "function");
  });
});

test("a single failing link degrades to its label without killing the transform", async () => {
  await withThrowingPageStubs(async (wikiLinks) => {
    const data = {
      postData: {
        cid: 99,
        content: "[[Public Page]] and [[Broken Page|Concentration]]"
      }
    };

    const result = await wikiLinks.transformWikiPostContent(data);

    assert.match(result.postData.content, /href="\/wiki\/Lore\/Public_Page"/);
    assert.ok(result.postData.content.includes("Concentration"), "failing link keeps its label");
    assert.ok(!result.postData.content.includes("[[Broken Page"), "failing link no longer literal [[...]]");
  });
});

test("transformWikiPostContent survives an internal throw and returns original content", async () => {
  const stubs = {
    "nconf": { get: () => undefined },
    "./src/meta": { settings: { get: async () => { throw new Error("synthetic settings failure"); }, setOnEmpty: async () => {}, set: async () => {} } },
    "./src/categories": { getCategoryData: async () => null, getChildrenCids: async () => [] },
    "./src/privileges": { categories: { get: async () => ({}) }, topics: { filterTids: async () => [] } },
    "./src/topics": { getTopicData: async () => null, getTopicsFields: async () => [], getTopicField: async () => null },
    "./src/database": { getSortedSetRange: async () => [], getSortedSetRevRange: async () => [], getObjectField: async () => null, getObject: async () => ({}) },
    "./src/user": { isAdministrator: async () => false },
    "./src/controllers/helpers": {},
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/utils": { isNumber: () => false }
  };
  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };
  try {
    clearWikiLinksModule();
    const wikiLinks = require("../lib/content/wiki-links");
    const data = { postData: { pid: 42, tid: 7, cid: 99, content: "[[Public Page]]" } };

    const originalConsoleError = console.error;
    let consoleErrorCalled = false;
    let consoleErrorMessage = "";
    console.error = function(...args) {
      consoleErrorCalled = true;
      consoleErrorMessage = args[0];
    };

    try {
      const result = await wikiLinks.transformWikiPostContent(data);
      assert.equal(result.postData.content, "[[Public Page]]");
      assert.ok(consoleErrorCalled, "console.error should have been called");
      assert.ok(consoleErrorMessage.startsWith("[westgate-wiki] parse transform failed"), "console.error message should start with correct prefix");
    } finally {
      console.error = originalConsoleError;
    }
  } finally {
    require.main.require = originalMainRequire;
    clearWikiLinksModule();
  }
});
