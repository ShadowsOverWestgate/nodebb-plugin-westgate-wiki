"use strict";

// The single owner of wiki cache invalidation. Every public invalidation entry
// point (config.invalidateSettingsCache, wikiPaths.invalidateWikiTreeIndex,
// wikiDirectory.invalidateNamespace/invalidateAllWikiCaches) delegates here,
// and this module only calls each cache's plain, side-effect-free clear —
// so there is exactly one invalidation behavior and no recursion.
//
// All wiki caches are small 15-30s TTL maps; clearing them together on every
// mutation is deliberately coarse. ponytail: full clear everywhere; add
// per-cid scoping back only if rebuild cost ever shows up in profiles.

function invalidateAll() {
  // Lazy requires: this module sits below config/tree/directory and must not
  // create load-order cycles.
  require("./config").clearSettingsCache();
  require("../tree/wiki-tree-index").invalidateWikiTreeIndex();
  require("../tree/wiki-directory-service").clearDirectoryCaches();
  require("../forum/forum-exclusion-service").clearWikiTidCache();
}

module.exports = {
  invalidateAll
};
