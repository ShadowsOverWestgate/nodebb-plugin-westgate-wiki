"use strict";

/*
 * Production-data oracle — imports a real wiki archive export into the test
 * NodeBB instance, then snapshots every article's canonical /wiki path and
 * verifies each one resolves through the routing tree.
 *
 * Run from the NodeBB root:
 *   WIKI_ARCHIVE=/path/to/westgate-wiki-archive.zip \
 *   npx mocha node_modules/nodebb-plugin-westgate-wiki/tests/integration/archive-snapshot.spec.js
 *
 * The snapshot is written next to this file (prod-url-snapshot.json). Diff it
 * across refactors: deployed article URLs must not change.
 */

const path = require("path");
const fs = require("fs");
const assert = require("assert");

const db = require(path.join(process.cwd(), "test/mocks/databasemock"));
require("./use-test-port");

const ARCHIVE_PATH = process.env.WIKI_ARCHIVE || path.join(process.env.HOME || "", "Pobrane/westgate-wiki-archive.zip");
const SNAPSHOT_PATH = path.join(__dirname, "prod-url-snapshot.json");

function mockRes(req) {
  const res = {
    req,
    locals: {},
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    send(payload) { this.payload = payload; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    setHeader(k, v) { this.headers[k] = v; return this; },
    type() { return this; },
    attachment() { return this; },
  };
  return res;
}

describe("westgate-wiki production archive oracle", function () {
  this.timeout(600000);

  let user;
  let groups;
  let meta;
  let topicsModule;

  let pluginConfig;
  let wikiPaths;
  let archiveControllers;

  let adminUid;

  before(async function () {
    if (!fs.existsSync(ARCHIVE_PATH)) {
      this.skip();
    }

    user = require(path.join(process.cwd(), "src/user"));
    groups = require(path.join(process.cwd(), "src/groups"));
    meta = require(path.join(process.cwd(), "src/meta"));
    topicsModule = require(path.join(process.cwd(), "src/topics"));

    const pluginRoot = path.join(process.cwd(), "node_modules/nodebb-plugin-westgate-wiki");
    pluginConfig = require(path.join(pluginRoot, "lib/core/config"));
    wikiPaths = require(path.join(pluginRoot, "lib/tree/wiki-paths"));
    archiveControllers = require(path.join(pluginRoot, "lib/controllers/wiki-archive-admin"));

    adminUid = await user.create({ username: "archiveadmin", password: "123456abc" });
    await groups.join("administrators", adminUid);
  });

  let importedSomething = false;

  it("imports the production archive (preview + apply)", async function () {
    const buffer = fs.readFileSync(ARCHIVE_PATH);

    const previewReq = { uid: adminUid, body: { archiveBuffer: buffer, includeSettings: "true" } };
    const previewRes = mockRes(previewReq);
    await archiveControllers.startImportJob(previewReq, previewRes);

    const previewPayload = previewRes.payload && (previewRes.payload.response || previewRes.payload);
    assert.strictEqual(previewRes.statusCode, 200,
      `preview failed (${previewRes.statusCode}): ${JSON.stringify(previewRes.payload && previewRes.payload.status || previewRes.payload).slice(0, 2000)}`);

    const preview = previewPayload.preview;
    const blockers = (preview && preview.blockers) || [];
    assert.ok(!blockers.length, `preview blocked: ${JSON.stringify(blockers).slice(0, 2000)}`);

    const applyReq = {
      uid: adminUid,
      params: { jobId: previewPayload.jobId },
      body: { approved: "true", includeSettings: "true" },
    };
    const applyRes = mockRes(applyReq);
    await archiveControllers.applyImportJob(applyReq, applyRes);
    const applyPayload = applyRes.payload && (applyRes.payload.response || applyRes.payload);
    assert.strictEqual(applyRes.statusCode, 200,
      `apply failed (${applyRes.statusCode}): ${JSON.stringify(applyRes.payload).slice(0, 2000)}`);

    pluginConfig.invalidateSettingsCache();
    importedSomething = true;
    console.log("      applyReport:", JSON.stringify(applyPayload.applyReport && applyPayload.applyReport.summary || applyPayload.applyReport).slice(0, 500));
  });

  it("every imported article has a canonical path that resolves", async function () {
    assert.ok(importedSomething, "import step did not complete");

    const settings = await pluginConfig.getSettings();
    assert.ok(settings.isConfigured, "plugin not configured after import");

    const tids = [...new Set((await Promise.all(
      settings.effectiveCategoryIds.map((cid) => db.getSortedSetRange(`cid:${cid}:tids`, 0, -1))
    )).flat().filter(Boolean))];
    assert.ok(tids.length > 0, "no wiki topics after import");

    const topicRows = await topicsModule.getTopicsData(tids);
    const snapshot = [];
    const failures = [];

    for (const topic of topicRows.filter(Boolean)) {
      if (parseInt(topic.deleted, 10) === 1) {
        continue;
      }
      const canonicalPath = await wikiPaths.getCanonicalPagePath(topic, { uid: adminUid });
      if (!canonicalPath) {
        failures.push({ tid: topic.tid, title: topic.title, reason: "no-canonical-path" });
        continue;
      }
      const requestPath = canonicalPath.replace(/^\/wiki\/?/, "");
      const resolved = await wikiPaths.resolveWikiNode(requestPath, { uid: adminUid });
      const node = resolved && resolved.node;
      const resolvedTid = node && (node.page ? node.page.tid : (node.pageFacet && node.pageFacet.tid));
      if (!node || parseInt(resolvedTid, 10) !== parseInt(topic.tid, 10)) {
        failures.push({ tid: topic.tid, title: topic.title, canonicalPath, reason: resolved && resolved.status || "no-node" });
        continue;
      }
      snapshot.push({ tid: parseInt(topic.tid, 10), title: topic.title, path: canonicalPath });
    }

    snapshot.sort((a, b) => a.path.localeCompare(b.path));
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify({ articleCount: snapshot.length, articles: snapshot }, null, 2));
    console.log(`      snapshot: ${snapshot.length} articles -> ${SNAPSHOT_PATH}`);

    assert.deepStrictEqual(failures, [],
      `${failures.length}/${tids.length} articles failed canonical resolution (first 10): ${JSON.stringify(failures.slice(0, 10), null, 2)}`);
  });
});
