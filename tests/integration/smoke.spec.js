"use strict";

/*
 * Integration smoke test — boots REAL NodeBB against the test mongo database
 * (config.json "test_database") with this plugin active ("test_plugins").
 *
 * Run from the NodeBB root:
 *   npx mocha node_modules/nodebb-plugin-westgate-wiki/tests/integration/smoke.spec.js
 *
 * Unlike tests/*.test.js (which stub NodeBB via require.main.require), this
 * exercises the actual plugin<->NodeBB contract: real categories, topics,
 * privileges, parse pipeline, and the /wiki/* HTTP routes.
 */

const path = require("path");
const assert = require("assert");

// Boots NodeBB test harness (flushes nodebb_test db, installs, starts webserver).
const db = require(path.join(process.cwd(), "test/mocks/databasemock"));
require("./use-test-port");

const nconf = require(path.join(process.cwd(), "node_modules/nconf"));

describe("westgate-wiki integration smoke", function () {
  this.timeout(60000);

  let categories;
  let topics;
  let posts;
  let user;
  let groups;
  let meta;

  let pluginConfig;
  let wikiPaths;

  let adminUid;
  let wikiCid;
  let firstPage; // topic "First Page"

  before(async function () {
    categories = require(path.join(process.cwd(), "src/categories"));
    topics = require(path.join(process.cwd(), "src/topics"));
    posts = require(path.join(process.cwd(), "src/posts"));
    user = require(path.join(process.cwd(), "src/user"));
    groups = require(path.join(process.cwd(), "src/groups"));
    meta = require(path.join(process.cwd(), "src/meta"));

    const pluginRoot = path.join(process.cwd(), "node_modules/nodebb-plugin-westgate-wiki");
    pluginConfig = require(path.join(pluginRoot, "lib/core/config"));
    wikiPaths = require(path.join(pluginRoot, "lib/tree/wiki-paths"));

    adminUid = await user.create({ username: "wikiadmin", password: "123456abc" });
    await groups.join("administrators", adminUid);

    const category = await categories.create({
      name: "Lore",
      description: "wiki namespace",
    });
    wikiCid = category.cid;

    await meta.settings.set("westgate-wiki", {
      categoryIds: String(wikiCid),
      includeChildCategories: "1",
    });
    pluginConfig.invalidateSettingsCache();

    firstPage = (await topics.post({
      uid: adminUid,
      cid: wikiCid,
      title: "First Page",
      content: "This is the first wiki article body.",
    })).topicData;
  });

  it("plugin is active and configured", async function () {
    const settings = await pluginConfig.getSettings();
    assert.strictEqual(settings.isConfigured, true, "plugin settings not configured");
    assert.ok(settings.effectiveCategoryIds.includes(wikiCid));
  });

  it("canonical tree resolves the created page", async function () {
    const canonicalPath = await wikiPaths.getCanonicalPagePath(firstPage, { uid: adminUid });
    assert.ok(canonicalPath, `no canonical path for tid ${firstPage.tid}`);

    const requestPath = canonicalPath.replace(/^\/wiki\/?/, "");
    const resolved = await wikiPaths.resolveWikiNode(requestPath, { uid: adminUid });
    const node = resolved && resolved.node;
    assert.ok(node, `resolveWikiNode(${requestPath}) returned no node: ${JSON.stringify(resolved)}`);
    const pageTid = node.page ? node.page.tid : (node.pageFacet && node.pageFacet.tid);
    assert.strictEqual(parseInt(pageTid, 10), parseInt(firstPage.tid, 10),
      `resolved node does not carry tid ${firstPage.tid}: ${JSON.stringify(node)}`);
  });

  it("[[First Page]] in another wiki article renders a working internal link", async function () {
    const second = (await topics.post({
      uid: adminUid,
      cid: wikiCid,
      title: "Second Page",
      content: "See [[First Page]] for details.",
    })).topicData;

    const mainPid = second.mainPid;
    const [postData] = await posts.getPostsByPids([mainPid], adminUid);
    const parsed = await posts.parsePost(postData);

    assert.ok(
      /class="[^"]*wiki-internal-link/.test(parsed.content),
      `no wiki-internal-link anchor in parsed content:\n${parsed.content}`
    );
    const href = (parsed.content.match(/href="([^"]*\/wiki\/[^"]+)"/) || [])[1];
    assert.ok(href, `no /wiki/ href in parsed content:\n${parsed.content}`);

    // The generated href must actually resolve through the routing engine —
    // this is exactly where the two-engine divergence broke production links.
    const requestPath = href.replace(/^.*\/wiki\/?/, "").split(/[?#]/)[0];
    const resolved = await wikiPaths.resolveWikiNode(decodeURIComponent(requestPath), { uid: adminUid });
    assert.ok(resolved && resolved.node, `generated href ${href} does not resolve via tree index`);
  });

  it("[[Missing Page]] renders a redlink, and upgrades after the page is created", async function () {
    const holder = (await topics.post({
      uid: adminUid,
      cid: wikiCid,
      title: "Redlink Holder",
      content: "Broken: [[Missing Page]].",
    })).topicData;

    const [postData] = await posts.getPostsByPids([holder.mainPid], adminUid);
    let parsed = await posts.parsePost(postData);
    assert.ok(
      /wiki-redlink/.test(parsed.content) || /\?create=/.test(parsed.content),
      `expected a redlink for missing page:\n${parsed.content}`
    );

    await topics.post({
      uid: adminUid,
      cid: wikiCid,
      title: "Missing Page",
      content: "Now it exists.",
    });

    // action:topic.post clears wiki main-post parse caches; re-parse and expect a live link.
    const [postData2] = await posts.getPostsByPids([holder.mainPid], adminUid);
    parsed = await posts.parsePost(postData2);
    assert.ok(
      /wiki-internal-link/.test(parsed.content),
      `redlink did not upgrade to internal link after page creation:\n${parsed.content}`
    );
  });

  it("[[Title: With Colon]] resolves as a literal page title, not a namespace path", async function () {
    await topics.post({
      uid: adminUid,
      cid: wikiCid,
      title: "Chapter 1: Intro",
      content: "A page whose title contains a colon.",
    });

    const linker = (await topics.post({
      uid: adminUid,
      cid: wikiCid,
      title: "Colon Linker",
      content: "See [[Chapter 1: Intro]].",
    })).topicData;

    const [postData] = await posts.getPostsByPids([linker.mainPid], adminUid);
    const parsed = await posts.parsePost(postData);
    assert.ok(
      /wiki-internal-link/.test(parsed.content),
      `colon-titled page did not resolve to an internal link:\n${parsed.content}`
    );
  });

  it("index page keeps resolving at its namespace path after a title edit (stored linkage)", async function () {
    const child = await categories.create({ name: "Guides", parentCid: wikiCid, description: "child namespace" });
    await meta.settings.set("westgate-wiki", {
      categoryIds: String(wikiCid),
      includeChildCategories: "1",
      routeRootCid: String(wikiCid),
    });
    pluginConfig.invalidateSettingsCache();

    // Index page: lives in the parent, titled like the child namespace leaf.
    const indexPage = (await topics.post({
      uid: adminUid,
      cid: wikiCid,
      title: "Guides",
      content: "Guides namespace index page.",
    })).topicData;

    let resolved = await wikiPaths.resolveWikiNode("Guides", { uid: adminUid });
    assert.strictEqual(resolved.status, "ok");
    assert.ok(resolved.node.isComposite, `expected composite node: ${JSON.stringify(resolved.node)}`);

    // Tree build heals the stored linkage onto the topic.
    const stampedCid = parseInt(await topics.getTopicField(indexPage.tid, "westgateWikiNamespaceIndexCid"), 10);
    assert.strictEqual(stampedCid, parseInt(child.cid, 10), "index linkage field was not stamped");

    // Title edit used to silently demote the index page to a normal page.
    await topics.setTopicFields(indexPage.tid, { title: "Guides Overview", titleRaw: "Guides Overview" });
    wikiPaths.invalidateWikiTreeIndex({ reason: "test-title-edit" });

    resolved = await wikiPaths.resolveWikiNode("Guides", { uid: adminUid });
    assert.strictEqual(resolved.status, "ok", "namespace path stopped resolving after index-page title edit");
    assert.ok(resolved.node.isComposite, "index page lost after title edit despite stored linkage");
    const pageTid = resolved.node.page ? resolved.node.page.tid : (resolved.node.pageFacet && resolved.node.pageFacet.tid);
    assert.strictEqual(parseInt(pageTid, 10), parseInt(indexPage.tid, 10));
  });

  it("HTTP GET /wiki/<page path> returns 200", async function () {
    const canonicalPath = await wikiPaths.getCanonicalPagePath(firstPage, { uid: 0 });
    assert.ok(canonicalPath, "no guest-visible canonical path (guests can read by default in test install)");
    const wikiUrl = `${nconf.get("url")}/wiki/${canonicalPath.replace(/^\/wiki\/?/, "")}`;
    const res = await fetch(wikiUrl, { redirect: "follow" });
    assert.strictEqual(res.status, 200, `GET ${wikiUrl} -> ${res.status}`);
  });
});
