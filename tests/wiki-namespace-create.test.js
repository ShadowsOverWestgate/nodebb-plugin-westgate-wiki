"use strict";

const assert = require("node:assert/strict");

const state = {
  settings: {
    categoryIds: "1",
    includeChildCategories: "1",
    wikiNamespaceCreateGroups: ""
  },
  categories: new Map([
    [1, { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 }]
  ]),
  childrenByCid: new Map([[1, []]]),
  apiResponse: null,
  nextCid: 2
};

const originalMainRequire = require.main.require.bind(require.main);

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "nconf": {
      get: () => ""
    },
    "./src/controllers/api": {
      loadConfig: async () => ({ relative_path: "", csrf_token: "csrf" })
    },
    "./src/categories": {
      create: async (payload) => {
        const cid = state.nextCid++;
        const row = {
          cid,
          name: payload.name,
          description: payload.description,
          slug: `${cid}/${slugify(payload.name)}`,
          parentCid: payload.parentCid
        };
        state.categories.set(cid, row);
        state.childrenByCid.set(payload.parentCid, (state.childrenByCid.get(payload.parentCid) || []).concat(cid));
        return { cid };
      },
      getCategoryData: async (cid) => state.categories.get(parseInt(cid, 10)) || null,
      getChildrenCids: async (cid) => state.childrenByCid.get(parseInt(cid, 10)) || []
    },
    "./src/controllers/helpers": {
      formatApiResponse: async (status, res, payload) => {
        state.apiResponse = { status, payload };
        return state.apiResponse;
      },
      notAllowed: () => {}
    },
    "./src/database": {
      getSortedSetRange: async () => []
    },
    "./src/groups": {
      isMemberOfGroups: async () => []
    },
    "./src/meta": {
      settings: {
        get: async () => ({ ...state.settings }),
        setOnEmpty: async () => {},
        set: async (key, next) => {
          state.settings = { ...next };
        }
      }
    },
    "./src/privileges": {
      categories: {
        get: async () => ({ read: true, "topics:read": true })
      }
    },
    "./src/slugify": slugify,
    "./src/topics": {
      getTopicData: async () => null
    },
    "./src/user": {
      isAdministrator: async () => true
    }
  };

  return stubs[id] || originalMainRequire(id);
};

const wikiServicePath = require.resolve("../lib/wiki-service");
require.cache[wikiServicePath] = {
  id: wikiServicePath,
  filename: wikiServicePath,
  loaded: true,
  exports: {
    getSection: async () => ({
      status: "ok",
      section: {
        cid: 1,
        name: "Wiki",
        wikiPath: "/wiki"
      }
    })
  }
};

const controller = require("../lib/controllers/wiki-namespace-create");

(async () => {
  await controller.postNamespace({
    uid: 1,
    body: {
      name: "New Namespace",
      description: "A child namespace",
      parentCid: 1
    }
  }, {});

  assert.equal(state.apiResponse.status, 200);
  assert.equal(state.apiResponse.payload.cid, 2);
  assert.equal(
    state.apiResponse.payload.wikiPath,
    "/wiki/Wiki/New_Namespace",
    "created namespace redirects should use canonical wiki paths, not the legacy category route"
  );
  assert.notEqual(state.apiResponse.payload.wikiPath, "/wiki/category/2/new-namespace");

  console.log("wiki namespace create tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
