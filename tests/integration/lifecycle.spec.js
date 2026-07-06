"use strict";

/*
 * Lifecycle integration tests — the mutation scenarios production bugs came
 * from: category rename, page move, page rename, privilege-hidden categories.
 * Runs against real NodeBB like smoke.spec.js:
 *   npx mocha node_modules/nodebb-plugin-westgate-wiki/tests/integration/lifecycle.spec.js
 */

const path = require("path");
const assert = require("assert");

require(path.join(process.cwd(), "test/mocks/databasemock"));
require("./use-test-port");

describe("westgate-wiki lifecycle", function () {
  this.timeout(60000);

  let categories;
  let topics;
  let posts;
  let privileges;
  let user;
  let groups;
  let meta;

  let pluginConfig;
  let wikiPaths;

  let adminUid;
  let rootCid;

  async function makePage(cid, title, content) {
    return (await topics.post({ uid: adminUid, cid, title, content: content || `${title} body.` })).topicData;
  }

  async function parseMainPost(tid) {
    const mainPid = parseInt(await topics.getTopicField(tid, "mainPid"), 10);
    const [postData] = await posts.getPostsByPids([mainPid], adminUid);
    return posts.parsePost(postData);
  }

  before(async function () {
    categories = require(path.join(process.cwd(), "src/categories"));
    topics = require(path.join(process.cwd(), "src/topics"));
    posts = require(path.join(process.cwd(), "src/posts"));
    privileges = require(path.join(process.cwd(), "src/privileges"));
    user = require(path.join(process.cwd(), "src/user"));
    groups = require(path.join(process.cwd(), "src/groups"));
    meta = require(path.join(process.cwd(), "src/meta"));

    const pluginRoot = path.join(process.cwd(), "node_modules/nodebb-plugin-westgate-wiki");
    pluginConfig = require(path.join(pluginRoot, "lib/core/config"));
    wikiPaths = require(path.join(pluginRoot, "lib/tree/wiki-paths"));

    adminUid = await user.create({ username: "lifecycleadmin", password: "123456abc" });
    await groups.join("administrators", adminUid);

    rootCid = (await categories.create({ name: "Wiki", description: "root" })).cid;
    await meta.settings.set("westgate-wiki", {
      categoryIds: String(rootCid),
      includeChildCategories: "1",
      routeRootCid: String(rootCid),
    });
    pluginConfig.invalidateSettingsCache();
  });

  it("category rename moves every descendant page URL", async function () {
    const child = await categories.create({ name: "Lore", parentCid: rootCid });
    pluginConfig.invalidateSettingsCache();
    const page = await makePage(child.cid, "Old Gods");

    assert.strictEqual((await wikiPaths.resolveWikiNode("Lore/Old_Gods", { uid: adminUid })).status, "ok");

    await categories.update({ [child.cid]: { name: "Mythology" } });

    const renamed = await wikiPaths.resolveWikiNode("Mythology/Old_Gods", { uid: adminUid });
    assert.strictEqual(renamed.status, "ok", "descendant page not resolvable under renamed namespace");
    const tid = renamed.node.page ? renamed.node.page.tid : renamed.node.pageFacet.tid;
    assert.strictEqual(parseInt(tid, 10), parseInt(page.tid, 10));

    const stale = await wikiPaths.resolveWikiNode("Lore/Old_Gods", { uid: adminUid });
    assert.notStrictEqual(stale.status, "ok", "old namespace path must stop resolving after rename");
  });

  it("moving a page to another namespace moves its URL and links keep working", async function () {
    const guides = await categories.create({ name: "Guides", parentCid: rootCid });
    const systems = await categories.create({ name: "Systems", parentCid: rootCid });
    pluginConfig.invalidateSettingsCache();

    const page = await makePage(guides.cid, "Combat Basics");
    const linker = await makePage(guides.cid, "Combat Linker", "See [[Combat Basics]].");

    assert.strictEqual((await wikiPaths.resolveWikiNode("Guides/Combat_Basics", { uid: adminUid })).status, "ok");

    // Core topic moves are guarded for wiki pages; use the managed action.
    const wikiPageActions = require(path.join(process.cwd(), "node_modules/nodebb-plugin-westgate-wiki/lib/pages/wiki-page-actions"));
    const moveReq = { uid: adminUid, body: { tid: page.tid, cid: systems.cid, title: "Combat Basics" } };
    const moveRes = {
      req: moveReq, locals: {}, statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(p) { this.payload = p; return this; },
      send(p) { this.payload = p; return this; },
      set() { return this; }, setHeader() { return this; }, type() { return this; },
    };
    await wikiPageActions.moveWikiPage(moveReq, moveRes);
    assert.strictEqual(moveRes.statusCode, 200, `managed move failed: ${JSON.stringify(moveRes.payload).slice(0, 500)}`);

    const moved = await wikiPaths.resolveWikiNode("Systems/Combat_Basics", { uid: adminUid });
    assert.strictEqual(moved.status, "ok", "page not resolvable in destination namespace after move");
    assert.notStrictEqual((await wikiPaths.resolveWikiNode("Guides/Combat_Basics", { uid: adminUid })).status, "ok");

    // Title-based [[link]] should re-resolve to the new location on re-parse.
    const parsed = await parseMainPost(linker.tid);
    const href = (parsed.content.match(/href="([^"]*\/wiki\/[^"]+)"/) || [])[1] || "";
    assert.ok(decodeURIComponent(href).includes("Systems/Combat_Basics"),
      `link should follow the moved page, got: ${href || parsed.content}`);
  });

  it("renaming a page updates its URL and title-links re-resolve", async function () {
    const feats = await categories.create({ name: "Feats", parentCid: rootCid });
    pluginConfig.invalidateSettingsCache();

    const page = await makePage(feats.cid, "Power Attack");
    await makePage(feats.cid, "Feat Linker", "Try [[Cleaving Strike]] someday.");

    assert.strictEqual((await wikiPaths.resolveWikiNode("Feats/Power_Attack", { uid: adminUid })).status, "ok");

    await topics.setTopicFields(page.tid, { title: "Cleaving Strike", titleRaw: "Cleaving Strike" });
    wikiPaths.invalidateWikiTreeIndex({ reason: "test-page-rename" });
    require(path.join(process.cwd(), "src/posts/cache")).reset();

    assert.strictEqual((await wikiPaths.resolveWikiNode("Feats/Cleaving_Strike", { uid: adminUid })).status, "ok");
    assert.notStrictEqual((await wikiPaths.resolveWikiNode("Feats/Power_Attack", { uid: adminUid })).status, "ok",
      "old page path must stop resolving after rename");

    // The previously-red link to the new title now resolves.
    const linkerTid = (await wikiPaths.resolveWikiNode("Feats/Feat_Linker", { uid: adminUid })).node.page.tid;
    const parsed = await parseMainPost(linkerTid);
    assert.ok(/wiki-internal-link/.test(parsed.content),
      `link to renamed title should be live:\n${parsed.content}`);
  });

  it("guest-hidden categories: pages resolve for admin but not for guests", async function () {
    const secret = await categories.create({ name: "Secret", parentCid: rootCid });
    pluginConfig.invalidateSettingsCache();
    await privileges.categories.rescind(["groups:read", "groups:topics:read"], secret.cid, "guests");

    const page = await makePage(secret.cid, "Hidden Page");
    wikiPaths.invalidateWikiTreeIndex({ reason: "test-privilege-change" });

    assert.strictEqual((await wikiPaths.resolveWikiNode("Secret/Hidden_Page", { uid: adminUid })).status, "ok");

    const guestView = await wikiPaths.resolveWikiNode("Secret/Hidden_Page", { uid: 0 });
    assert.notStrictEqual(guestView.status, "ok", "guest must not resolve pages in a guest-hidden category");

    // Documented behavior: filter:parse.post resolves links as guest (core
    // caches parsed posts per-pid, not per-viewer), so wiki links to
    // guest-hidden pages do not render as live wiki links.
    const linker = await makePage(rootCid, "Secret Linker", "See [[Hidden Page]].");
    const parsed = await parseMainPost(linker.tid);
    assert.ok(!/wiki-internal-link[^>]*>[^<]*Hidden Page/.test(parsed.content) ||
      !decodeURIComponent(parsed.content).includes("Secret/Hidden_Page"),
      `guest-hidden page must not leak a live link:\n${parsed.content}`);
    void page;
  });

  it("moving a namespace category relocates its index page with it", async function () {
    // Structure: root > Realms > Avernus, index page for Avernus lives in Realms.
    const realms = await categories.create({ name: "Realms", parentCid: rootCid });
    const shadowfell = await categories.create({ name: "Shadowfell", parentCid: rootCid });
    const avernus = await categories.create({ name: "Avernus", parentCid: realms.cid });
    pluginConfig.invalidateSettingsCache();

    await makePage(avernus.cid, "Fiend Politics");

    // A tombstoned earlier attempt at the index page, still carrying the
    // stored linkage — must not confuse relocation (real-data regression).
    const deadIndexPage = await makePage(realms.cid, "Avernus", "Old deleted index page.");
    await wikiPaths.resolveWikiNode("Realms/Avernus", { uid: adminUid }); // heal stamps it
    await topics.setTopicFields(deadIndexPage.tid, {
      westgateWikiTombstoned: "1",
      westgateWikiTombstoneAt: String(Date.now()),
      westgateWikiTombstoneUid: String(adminUid),
    });
    wikiPaths.invalidateWikiTreeIndex({ reason: "test-tombstone" });

    const indexPage = await makePage(realms.cid, "Avernus", "Index page for the Avernus namespace.");

    let resolved = await wikiPaths.resolveWikiNode("Realms/Avernus", { uid: adminUid });
    assert.strictEqual(resolved.status, "ok");
    assert.ok(resolved.node.isComposite, "index page composite missing before move");
    // heal has stamped the stored linkage by now
    assert.strictEqual(
      parseInt(await topics.getTopicField(indexPage.tid, "westgateWikiNamespaceIndexCid"), 10),
      parseInt(avernus.cid, 10)
    );

    // ACP-style category move: Avernus goes under Shadowfell. The relocation
    // handler runs on a fire-and-forget action hook, so poll briefly.
    await categories.update({ [avernus.cid]: { parentCid: shadowfell.cid } });
    for (let i = 0; i < 40; i += 1) {
      const cidNow = parseInt(await topics.getTopicField(indexPage.tid, "cid"), 10);
      if (cidNow === parseInt(shadowfell.cid, 10)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    resolved = await wikiPaths.resolveWikiNode("Shadowfell/Avernus", { uid: adminUid });
    assert.strictEqual(resolved.status, "ok", "moved namespace does not resolve at its new path");
    assert.ok(resolved.node.isComposite,
      "index page was orphaned by the category move (not relocated to the new parent)");
    const pageTid = resolved.node.page ? resolved.node.page.tid : null;
    assert.strictEqual(parseInt(pageTid, 10), parseInt(indexPage.tid, 10));
    assert.strictEqual(
      parseInt(await topics.getTopicField(indexPage.tid, "cid"), 10),
      parseInt(shadowfell.cid, 10),
      "index page topic should now live in the namespace's new parent category"
    );
  });
});
