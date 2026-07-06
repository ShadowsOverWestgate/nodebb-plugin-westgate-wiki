"use strict";

const assert = require("node:assert/strict");

const { state, setCategories, setTopics, installNodebbStubs } = require("./helpers/nodebb-stub");

state.settings = {
  categoryIds: "58",
  includeChildCategories: "0"
};
setCategories([
  { cid: 58, name: "Item Types", slug: "58/itemtypes", parentCid: 0 }
]);
setTopics([
  { tid: 100, cid: 58, title: "Potion Bottle", titleRaw: "Potion Bottle", slug: "100/potion-bottle", deleted: 0, scheduled: 0 }
]);
state.purgePostsAndTopicCalls = [];

installNodebbStubs({
  "./src/topics": {
    purgePostsAndTopic: async (tids, uid) => {
      state.purgePostsAndTopicCalls.push({ tids, uid });
    }
  }
});

(async () => {
  const config = require("../lib/core/config");
  const wikiDirectory = require("../lib/tree/wiki-directory-service");
  const wikiPaths = require("../lib/tree/wiki-paths");
  const wikiTopicPurge = require("../lib/pages/wiki-topic-purge");

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
