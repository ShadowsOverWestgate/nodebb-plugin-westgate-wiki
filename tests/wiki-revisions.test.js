"use strict";

const assert = require("node:assert/strict");

const state = {
  now: 1000,
  objects: new Map(),
  lists: new Map()
};

const originalMainRequire = require.main.require.bind(require.main);

function list(key) {
  if (!state.lists.has(key)) {
    state.lists.set(key, []);
  }
  return state.lists.get(key);
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "./src/database": {
      getObject: async (key) => {
        const value = state.objects.get(key);
        return value ? { ...value } : null;
      },
      setObject: async (key, value) => state.objects.set(key, { ...value }),
      delete: async (key) => {
        state.objects.delete(key);
        state.lists.delete(key);
      },
      listPrepend: async (key, value) => list(key).unshift(String(value)),
      listAppend: async (key, value) => list(key).push(String(value)),
      getListRange: async (key, start, stop) => {
        const rows = list(key);
        const from = Math.max(0, parseInt(start, 10) || 0);
        const parsedStop = parseInt(stop, 10);
        const to = parsedStop === -1 ? rows.length : parsedStop + 1;
        return rows.slice(from, to);
      },
      listLength: async (key) => list(key).length
    }
  };
  return stubs[id] || originalMainRequire(id);
};

function reset() {
  state.now = 1000;
  state.objects = new Map();
  state.lists = new Map();
}

(async () => {
  try {
    const revisions = require("../lib/wiki-revisions");

    revisions.setNowProvider(() => state.now);
    revisions.setRevisionIdProvider((input) => `rev-${input.tid}-${input.timestamp}-${input.action}`);

    reset();
    const first = await revisions.appendRevision({
      tid: 10,
      pid: 100,
      cid: 5,
      uid: 2,
      action: "edit",
      title: "Page",
      oldSource: "",
      newSource: "<p>One</p>"
    });
    assert.equal(first.checkpoint, true);
    const firstRecord = state.objects.get(`westgate-wiki:revision:10:${first.revisionId}`);
    assert.equal(firstRecord.checkpoint, "1");
    assert.equal(firstRecord.checkpointSource, "<p>One</p>");
    assert.equal(firstRecord.patch, "");
    assert.match(firstRecord.beforeHash, /^[a-f0-9]{64}$/);
    assert.match(firstRecord.afterHash, /^[a-f0-9]{64}$/);
    assert.notEqual(firstRecord.beforeHash, firstRecord.afterHash);

    state.now += 1;
    const second = await revisions.appendRevision({
      tid: 10,
      pid: 100,
      cid: 5,
      uid: 3,
      action: "edit",
      title: "Page",
      oldSource: "<p>One</p>",
      newSource: "<p>One</p>\n<p>Two</p>"
    });
    assert.equal(second.checkpoint, false);
    const secondRecord = state.objects.get(`westgate-wiki:revision:10:${second.revisionId}`);
    assert.equal(secondRecord.checkpoint, "0");
    assert.notEqual(secondRecord.patch, "");
    assert.equal(secondRecord.checkpointSource, "");
    assert.match(secondRecord.afterHash, /^[a-f0-9]{64}$/);

    const latest = await revisions.reconstructRevision(10, second.revisionId);
    assert.equal(latest.source, "<p>One</p>\n<p>Two</p>");

    const rows = await revisions.listRevisions(10);
    assert.deepEqual(rows.map((row) => row.revisionId), [second.revisionId, first.revisionId]);

    reset();
    await revisions.appendRevision({ tid: 11, pid: 110, cid: 5, uid: 1, action: "edit", title: "Blanked", oldSource: "", newSource: "<p>Safe</p>" });
    state.now += 1;
    const blankRevision = await revisions.appendRevision({ tid: 11, pid: 110, cid: 5, uid: 1, action: "edit", title: "Blanked", oldSource: "<p>Safe</p>", newSource: "" });
    assert.equal(blankRevision.checkpoint, true);
    const blank = await revisions.listRevisions(11);
    assert.equal(blank[0].newBytes, 0);
    assert.equal(blank[0].checkpoint, true);
    const blankRecord = state.objects.get(`westgate-wiki:revision:11:${blankRevision.revisionId}`);
    assert.equal(blankRecord.checkpoint, "1");
    assert.equal(blankRecord.checkpointSource, "");
    assert.equal((await revisions.reconstructRevision(11, blankRevision.revisionId)).source, "");

    reset();
    const base = await revisions.appendRevision({ tid: 12, pid: 120, cid: 5, uid: 1, action: "edit", title: "Broken", oldSource: "", newSource: "<p>A</p>" });
    state.now += 1;
    const edit = await revisions.appendRevision({ tid: 12, pid: 120, cid: 5, uid: 1, action: "edit", title: "Broken", oldSource: "<p>A</p>", newSource: "<p>B</p>" });
    state.objects.get(`westgate-wiki:revision:12:${edit.revisionId}`).afterHash = "bad";
    await assert.rejects(
      () => revisions.reconstructRevision(12, edit.revisionId),
      /revision-hash-mismatch/
    );
    assert.equal((await revisions.reconstructRevision(12, base.revisionId)).source, "<p>A</p>");

    console.log("wiki revisions tests passed");
  } finally {
    require.main.require = originalMainRequire;
  }
})().catch((err) => {
  console.error(err);
  throw err;
});
