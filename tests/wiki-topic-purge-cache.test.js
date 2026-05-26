"use strict";

const assert = require("node:assert/strict");

const state = {
  settings: {
    categoryIds: "58",
    includeChildCategories: "0"
  },
  categories: new Map([
    [58, { cid: 58, name: "Item Types", slug: "58/itemtypes", parentCid: 0 }]
  ]),
  topics: new Map([
    [100, { tid: 100, cid: 58, title: "Potion Bottle", titleRaw: "Potion Bottle", slug: "100/potion-bottle", deleted: 0, scheduled: 0 }]
  ]),
  tidsByCid: new Map([[58, [100]]]),
  purgePostsAndTopicCalls: []
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

function rangeForCid(key) {
  const match = String(key || "").match(/^cid:(\d+):tids$/);
  return match ? (state.tidsByCid.get(parseInt(match[1], 10)) || []) : [];
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "./src/categories": {
      getCategoryData: async (cid) => state.categories.get(parseInt(cid, 10)) || null,
      getChildrenCids: async () => []
    },
    "./src/controllers/helpers": {},
    "./src/database": {
      getSortedSetRange: async (key) => rangeForCid(key),
      getSortedSetRevRange: async (key) => rangeForCid(key),
      getObjectField: async () => null,
      getObject: async () => ({})
    },
    "./src/meta": {
      settings: {
        get: async () => state.settings,
        setOnEmpty: async () => {},
        set: async () => {}
      }
    },
    "./src/privileges": {
      categories: {
        get: async () => ({
          read: true,
          "topics:read": true,
          "topics:create": true
        })
      },
      topics: {
        filterTids: async (privilege, tids) => (Array.isArray(tids) ? tids : [])
      }
    },
    "./src/slugify": slugify,
    "./src/topics": {
      getTopicData: async (tid) => state.topics.get(parseInt(tid, 10)) || null,
      getTopicsFields: async (tids) => tids.map((tid) => state.topics.get(parseInt(tid, 10))).filter(Boolean),
      purgePostsAndTopic: async (tids, uid) => {
        state.purgePostsAndTopicCalls.push({ tids, uid });
      }
    },
    "./src/user": {
      isAdministrator: async () => false
    },
    "./src/utils": {
      isNumber: (value) => value !== "" && !Number.isNaN(parseFloat(value))
    },
    "nconf": {
      get: (key) => (key === "relative_path" ? "" : undefined)
    }
  };

  return stubs[id] || originalMainRequire(id);
};

(async () => {
  const config = require("../lib/config");
  const wikiDirectory = require("../lib/wiki-directory-service");
  const wikiPaths = require("../lib/wiki-paths");
  const wikiTopicPurge = require("../lib/wiki-topic-purge");

  config.invalidateSettingsCache();
  wikiDirectory.invalidateAllWikiCaches();
  wikiPaths.invalidateNamespaceIndexCache({ skipSettingsInvalidation: true });

  assert.equal(
    (await wikiPaths.validateCanonicalPagePlacement({ cid: 58, title: "Potion Bottle" })).status,
    "page-collision",
    "existing topic should seed the slug collision cache"
  );

  state.topics.delete(100);
  state.tidsByCid.set(58, []);

  if (typeof wikiTopicPurge.onTopicDelete === "function") {
    await wikiTopicPurge.onTopicDelete({ topic: { tid: 100, cid: 58 }, uid: 5 });
  }

  assert.deepEqual(
    state.purgePostsAndTopicCalls,
    [],
    "normal topic delete should invalidate wiki caches without hard-purging the topic"
  );
  assert.equal(
    (await wikiPaths.validateCanonicalPagePlacement({ cid: 58, title: "Potion Bottle" })).status,
    "ok",
    "deleting a topic should invalidate wiki slug collision caches before replacement creates"
  );

  config.invalidateSettingsCache();
  wikiDirectory.invalidateAllWikiCaches();
  wikiPaths.invalidateNamespaceIndexCache({ skipSettingsInvalidation: true });

  state.topics.set(101, { tid: 101, cid: 58, title: "Silver Mirror", titleRaw: "Silver Mirror", slug: "101/silver-mirror", deleted: 0, scheduled: 0 });
  state.tidsByCid.set(58, [101]);

  assert.equal(
    (await wikiPaths.validateCanonicalPagePlacement({ cid: 58, title: "Silver Mirror" })).status,
    "page-collision",
    "existing topic should seed the slug collision cache before purge invalidation"
  );

  state.topics.delete(101);
  state.tidsByCid.set(58, []);

  if (typeof wikiTopicPurge.onTopicsPurge === "function") {
    await wikiTopicPurge.onTopicsPurge({ topics: [{ tid: 101, cid: 58 }], uid: 5 });
  }

  assert.equal(
    (await wikiPaths.validateCanonicalPagePlacement({ cid: 58, title: "Silver Mirror" })).status,
    "ok",
    "purging a topic should invalidate wiki slug collision caches before replacement creates"
  );

  console.log("wiki topic purge cache tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
