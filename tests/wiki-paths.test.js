"use strict";

const assert = require("assert");
const canonicalSegments = require("./fixtures/canonical-wiki-path-segments.json");
const { state, setCategories, setTopics, installNodebbStubs } = require("./helpers/nodebb-stub");

installNodebbStubs();

const wikiPaths = require("../lib/tree/wiki-paths");
const wikiLinks = require("../lib/content/wiki-links");

[
  "resolveWikiNode",
  "listWikiNodeChildren",
  "getCanonicalPagePath",
  "getCanonicalNamespacePath",
  "validateCanonicalPagePlacement",
  "validateCanonicalNamespacePlacement",
  "invalidateWikiTreeIndex"
].forEach((name) => {
  assert.strictEqual(typeof wikiPaths[name], "function", `${name} should be exported by wiki-paths facade`);
});

canonicalSegments.forEach((row) => {
  const segment = wikiPaths.normalizeCanonicalSegment(row.source);
  assert.strictEqual(segment.canonical, row.canonical);
  assert.strictEqual(segment.foldedKey, row.folded);
});

function reset(settings, categories, topics) {
  state.settings = {
    includeChildCategories: "0",
    ...settings
  };
  setCategories(categories);
  setTopics(topics || []);
  try {
    require("../lib/core/config").invalidateSettingsCache();
    require("../lib/tree/wiki-paths").invalidateNamespaceIndexCache({ skipSettingsInvalidation: true });
    require("../lib/tree/wiki-directory-service").invalidateAllWikiCaches();
  } catch (e) {
    // Modules may not be loaded yet during test bootstrap.
  }
}


(async () => {
  // Canonical facade: namespace paths derive from category NAMES via the tree.
  reset(
    { categoryIds: "1, 2, 3" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 1 },
      { cid: 2, name: "Mechanics", slug: "2/mechanics", parentCid: 1 },
      { cid: 3, name: "Classes", slug: "3/classes", parentCid: 2 }
    ]
  );
  assert.strictEqual(await wikiPaths.getCanonicalNamespacePath(state.categories.get(3)), "Wiki/Mechanics/Classes");
  assert.strictEqual((await wikiPaths.resolveWikiNode("Wiki/Mechanics/Classes", { uid: 1 })).node.namespace.cid, 3);

  const entry = await wikiPaths.getNamespaceEntry(3);
  assert.strictEqual(entry.status, "ok");
  assert.strictEqual(entry.path, "/wiki/Wiki/Mechanics/Classes");
  assert.deepStrictEqual(entry.segments, ["Wiki", "Mechanics", "Classes"]);
  assert.strictEqual((await wikiPaths.getNamespaceEntry(99)).status, "not-wiki");

  // Route root: never inferred from slugs, only from explicit routeRootCid.
  reset(
    { categoryIds: "1, 2" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 1 },
      { cid: 2, name: "Guides", slug: "2/guides", parentCid: 1 }
    ]
  );
  assert.strictEqual(
    (await wikiPaths.resolveRouteRootNamespace()).status,
    "namespace-not-found",
    "a category with slug wiki must not become the route root without explicit routeRootCid"
  );

  reset(
    { categoryIds: "1, 2", routeRootCid: "1" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0, topic_count: 1 },
      { cid: 2, name: "Guides", slug: "2/guides", parentCid: 1 }
    ]
  );
  const rootNamespace = await wikiPaths.resolveRouteRootNamespace();
  assert.strictEqual(rootNamespace.status, "ok");
  assert.strictEqual(rootNamespace.cid, 1);
  assert.strictEqual(rootNamespace.path, "/wiki");
  assert.deepStrictEqual(rootNamespace.segments, []);
  assert.strictEqual((await wikiPaths.getNamespaceEntry(2)).path, "/wiki/Guides",
    "route root segment must be omitted from child namespace paths");

  // Diagnostics: folded name collisions and reserved first segments.
  reset(
    { categoryIds: "1, 2, 3" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Classes", slug: "2/classes-a", parentCid: 1 },
      { cid: 3, name: "classes", slug: "3/classes-b", parentCid: 1 }
    ]
  );
  const collisionDiagnostics = await wikiPaths.getNamespaceSetupDiagnostics();
  assert.strictEqual(collisionDiagnostics.namespaceCollisions.length, 1);
  assert.strictEqual(collisionDiagnostics.hasSetupErrors, true);
  assert.strictEqual((await wikiPaths.getNamespaceEntry(2)).status, "namespace-collision");

  reset(
    { categoryIds: "1", routeRootCid: "1" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Search", slug: "2/search", parentCid: 1 }
    ]
  );
  // cid 2 not configured -> clean setup.
  assert.strictEqual((await wikiPaths.getNamespaceSetupDiagnostics()).hasSetupErrors, false);

  reset(
    { categoryIds: "1, 2", routeRootCid: "1" },
    [
      { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
      { cid: 2, name: "Search", slug: "2/search", parentCid: 1 }
    ]
  );
  const reservedDiagnostics = await wikiPaths.getNamespaceSetupDiagnostics();
  assert.deepStrictEqual(
    reservedDiagnostics.reservedNamespacePaths.map((row) => row.path),
    ["/wiki/Search"]
  );
  assert.strictEqual(reservedDiagnostics.hasSetupErrors, true);

  console.log("wiki-paths facade tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
