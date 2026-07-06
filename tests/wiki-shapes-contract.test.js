"use strict";

// Pins the three hub contracts (lib/core/wiki-shapes.js). If this test fails you
// changed a shape that 14-20 files consume — update wiki-shapes.js and grep
// for consumers before shipping.

const assert = require("node:assert/strict");

const { setCategories, setTopics, setSettings, installNodebbStubs } = require("./helpers/nodebb-stub");

installNodebbStubs();

const wikiShapes = require("../lib/core/wiki-shapes");
const wikiPaths = require("../lib/tree/wiki-paths");
const wikiLinks = require("../lib/content/wiki-links");
const config = require("../lib/core/config");

(async () => {
  setSettings({ categoryIds: "1, 2", routeRootCid: "1" });
  setCategories([
    { cid: 1, name: "Wiki", slug: "1/wiki", parentCid: 0 },
    { cid: 2, name: "Lore", slug: "2/lore", parentCid: 1 }
  ]);
  setTopics([
    { tid: 10, cid: 2, title: "Old Gods", titleRaw: "Old Gods", slug: "10/old-gods", deleted: 0, scheduled: 0 }
  ]);
  config.invalidateSettingsCache();

  // 1. Resolver ok-result + shaped node.
  const resolved = await wikiPaths.resolveWikiNode("Lore/Old_Gods", { uid: 1 });
  assert.equal(resolved.status, "ok");
  wikiShapes.assertShape(resolved, wikiShapes.NODE_RESULT_OK_KEYS, "resolver result");
  wikiShapes.assertShape(resolved.node, wikiShapes.SHAPED_NODE_KEYS, "shaped node");

  // 2. Path info shapes, valid and invalid, page and namespace.
  const settings = await config.getSettings();
  const category = { cid: 2, name: "Lore", slug: "2/lore", parentCid: 1 };
  const nsInfo = await wikiPaths.getCanonicalNamespaceInfo(category, {});
  wikiShapes.assertShape(nsInfo, wikiShapes.PATH_INFO_KEYS, "namespace info");
  assert.equal(nsInfo.valid, true);

  const pageInfo = await wikiPaths.getCanonicalPageInfo({ tid: 10, cid: 2, title: "Old Gods", titleRaw: "Old Gods" }, {});
  wikiShapes.assertShape(pageInfo, wikiShapes.PATH_INFO_KEYS, "page info");
  assert.equal(pageInfo.valid, true);

  const missingInfo = await wikiPaths.getCanonicalPageInfo({ tid: 999, cid: 999, title: "Nope" }, {});
  wikiShapes.assertShape(missingInfo, wikiShapes.PATH_INFO_KEYS, "invalid page info");
  assert.equal(missingInfo.valid, false);

  // 3. Resolver context (exercised through link replacement; the producer
  // assert inside buildResolverContext throws if the contract drifts).
  const html = await wikiLinks.replaceWikiLinks("See [[Old Gods]].", 2, settings, 1);
  assert.match(html, /wiki-internal-link/);

  // 4. assertShape itself fails loudly.
  assert.throws(
    () => wikiShapes.assertShape({ status: "ok" }, wikiShapes.NODE_RESULT_OK_KEYS, "partial"),
    /missing contract keys/
  );

  console.log("wiki shapes contract tests passed");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
