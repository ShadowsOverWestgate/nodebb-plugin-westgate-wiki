"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const root = process.cwd();
const originalMainRequire = require.main.require.bind(require.main);

function clearModules() {
  [
    "lib/read/topic-service.js",
    "lib/core/config.js",
    "lib/read/wiki-service.js",
    "lib/read/wiki-discussion-settings.js",
    "lib/content/wiki-article-css.js",
    "lib/features/wiki-article-watch.js",
    "lib/content/wiki-html-sanitizer.js",
    "lib/pages/wiki-tombstones.js",
    "lib/core/serializer.js"
  ].forEach((relativePath) => {
    const filename = require.resolve(`${root}/${relativePath}`);
    delete require.cache[filename];
  });
}

async function withTopicServiceStubs(fn) {
  const stubs = {
    nconf: {
      get: () => ""
    },
    "./src/categories": {
      getCategoryData: async () => ({ cid: 2, name: "Wiki", slug: "2/wiki", parentCid: 0 }),
      getChildren: async () => [[]],
      getChildrenCids: async () => []
    },
    "./src/controllers/helpers": {
      formatApiResponse: (status, res, payload) => {
        res.statusCode = status;
        res.payload = payload;
        return payload;
      }
    },
    "./src/database": {
      getObjectField: async () => null,
      getObject: async () => ({}),
      getSetMembers: async () => [],
      getSortedSetRange: async () => [],
      getSortedSetRevRange: async () => [],
      isSetMember: async () => false,
      setAdd: async () => {},
      setRemove: async () => {}
    },
    "./src/meta": {
      settings: {
        get: async () => ({
          categoryIds: "2",
          includeChildCategories: "0",
          homeTopicId: ""
        })
      }
    },
    "./src/notifications": {},
    "./src/posts": {
      getPostSummaryByPids: async () => [],
      getPostFields: async () => ({
        pid: 202,
        tid: 20,
        uid: 9,
        content: "<p>Stored article body</p>",
        sourceContent: "<p>Stored article body</p>",
        timestamp: 1700000000000,
        edited: 0,
        editor: 0
      }),
      getUserInfoForPosts: async () => [{
        uid: 9,
        username: "author",
        userslug: "author",
        displayname: "Author"
      }]
    },
    "./src/privileges": {
      topics: {
        get: async () => ({
          "topics:read": true,
          "topics:delete": false,
          view_deleted: false,
          view_scheduled: false
        })
      },
      categories: {
        get: async () => ({ "topics:create": true })
      },
      posts: {
        canEdit: async () => ({ flag: true })
      }
    },
    "./src/topics": {
      getTopicData: async () => ({
        tid: 20,
        cid: 2,
        mainPid: 202,
        title: "Setting Overview",
        titleRaw: "Setting Overview",
        deleted: false,
        scheduled: false
      }),
      getTopicField: async () => null,
      getTopicsFields: async () => []
    },
    "./src/slugify": (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    "./src/user": {
      isAdministrator: async () => false,
      isGlobalModerator: async () => false
    },
    "./src/utils": {
      isNumber: (value) => !Number.isNaN(parseInt(value, 10)),
      toISOString: (value) => new Date(parseInt(value, 10)).toISOString()
    }
  };

  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };

  try {
    clearModules();
    const topicService = require("../lib/read/topic-service");
    await fn(topicService);
  } finally {
    require.main.require = originalMainRequire;
    clearModules();
  }
}

test("wiki pages load their main post when post summary filters return no rows", async () => {
  await withTopicServiceStubs(async (topicService) => {
    const page = await topicService.getWikiPage(20, 5);

    assert.equal(page.status, "ok");
    assert.equal(page.mainPost.pid, 202);
    assert.match(page.mainPost.content, /Stored article body/);
  });
});
