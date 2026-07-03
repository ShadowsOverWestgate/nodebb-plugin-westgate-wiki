"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const root = process.cwd();
const originalMainRequire = require.main.require.bind(require.main);

function clearWikiLinksModule() {
  [
    "lib/wiki-links.js",
    "lib/config.js",
    "lib/serializer.js",
    "lib/wiki-canonical-path-adapter.js",
    "lib/wiki-directory-service.js",
    "lib/wiki-paths.js",
    "lib/wiki-tombstones.js"
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
    require.cache[require.resolve(`${root}/lib/wiki-directory-service.js`)] = {
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
    require.cache[require.resolve(`${root}/lib/wiki-canonical-path-adapter.js`)] = {
      exports: {
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
    return await fn(require("../lib/wiki-links"));
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
