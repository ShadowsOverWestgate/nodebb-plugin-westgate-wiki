"use strict";

const assert = require("node:assert/strict");

const { state, installNodebbStubs } = require("./helpers/nodebb-stub");

installNodebbStubs({
  "./src/privileges": {
    categories: {
      get: async () => ({ read: true, "topics:read": true }),
      isAdminOrMod: async () => false
    },
    topics: {
      filterTids: async (privilege, tids) => tids,
      get: async () => ({ "topics:read": true, view_deleted: false, view_scheduled: false })
    }
  },
  "./src/user": {
    isAdministrator: async () => false,
    isGlobalModerator: async () => false
  }
});

const config = require("../lib/core/config");
const wikiPaths = require("../lib/tree/wiki-paths");
const wikiDirectory = require("../lib/tree/wiki-directory-service");

(async () => {
  wikiDirectory.invalidateAllWikiCaches();
  config.invalidateSettingsCache();
  wikiPaths.invalidateNamespaceIndexCache({ skipSettingsInvalidation: true });

  const count = wikiDirectory.SUMMARY_CACHE_MAX_ENTRIES + 5;
  const categories = [];
  for (let cid = 1; cid <= count; cid += 1) {
    categories.push({ cid, name: `Section ${cid}`, slug: `${cid}/section-${cid}`, parentCid: 0, topic_count: 0 });
  }
  state.categories = new Map(categories.map((category) => [category.cid, category]));
  state.settings = { categoryIds: categories.map((category) => category.cid).join(","), includeChildCategories: "0" };

  for (let cid = 1; cid <= count; cid += 1) {
    await wikiDirectory.getOrderedSummaries(cid, cid, false);
  }

  // Pruning past the TTL empties the caches, so the returned removal count is
  // the number of live entries — the cap check without a metrics counter.
  const expiredCount = wikiDirectory.pruneExpiredCaches(Date.now() + wikiDirectory.CACHE_TTL_MS + 1);
  assert.strictEqual(expiredCount, wikiDirectory.SUMMARY_CACHE_MAX_ENTRIES, "summary cache should be capped and prunable");
  assert.strictEqual(wikiDirectory.pruneExpiredCaches(Date.now() + wikiDirectory.CACHE_TTL_MS + 1), 0, "expired summary cache entries should not linger");

  await wikiDirectory.getAllTopicSlugRows(1);
  assert.strictEqual(
    wikiDirectory.pruneExpiredCaches(Date.now() + wikiDirectory.CACHE_TTL_MS + 1),
    1,
    "expired slug scan entries should be pruned"
  );

  console.log("wiki cache bounds tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
