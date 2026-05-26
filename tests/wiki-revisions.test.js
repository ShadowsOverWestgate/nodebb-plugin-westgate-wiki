"use strict";

const assert = require("node:assert/strict");

const state = {
  now: 1000,
  deleteAllCalls: [],
  failListPrependKey: "",
  failSetObjectKey: "",
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
      setObject: async (key, value) => {
        if (key === state.failSetObjectKey) {
          throw new Error(`failed-setObject-${key}`);
        }
        state.objects.set(key, { ...value });
      },
      delete: async (key) => {
        state.objects.delete(key);
        state.lists.delete(key);
      },
      deleteAll: async (keys) => {
        state.deleteAllCalls.push(keys.slice());
        keys.forEach((key) => {
          state.objects.delete(key);
          state.lists.delete(key);
        });
      },
      listPrepend: async (key, value) => {
        if (key === state.failListPrependKey) {
          throw new Error(`failed-listPrepend-${key}`);
        }
        list(key).unshift(String(value));
      },
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
  state.deleteAllCalls = [];
  state.failListPrependKey = "";
  state.failSetObjectKey = "";
  state.objects = new Map();
  state.lists = new Map();
}

(async () => {
  try {
    const revisions = require("../lib/wiki-revisions");

    revisions.setNowProvider(() => state.now);
    revisions.setRevisionIdProvider((input) => `rev-${input.tid}-${input.timestamp}-${input.action}`);

    reset();
    assert.equal(await revisions.hasRevisions(10), false);
    assert.equal(await revisions.hasRevisions("not-a-topic"), false);
    const originalSource = Array.from({ length: 80 }, (_, i) => `<p>Line ${i}</p>`).join("\n");
    const updatedSource = `${originalSource}\n<p>Line 80</p>`;
    const first = await revisions.appendRevision({
      tid: 10,
      pid: 100,
      cid: 5,
      uid: 2,
      action: "edit",
      title: "Page",
      oldSource: "",
      newSource: originalSource
    });
    assert.equal(await revisions.hasRevisions(10), true);
    assert.equal(first.checkpoint, true);
    const firstRecord = state.objects.get(`westgate-wiki:revision:10:${first.revisionId}`);
    assert.equal(firstRecord.checkpoint, "1");
    assert.equal(firstRecord.checkpointSource, originalSource);
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
      oldSource: originalSource,
      newSource: updatedSource
    });
    assert.equal(second.checkpoint, false);
    const secondRecord = state.objects.get(`westgate-wiki:revision:10:${second.revisionId}`);
    assert.equal(secondRecord.checkpoint, "0");
    assert.notEqual(secondRecord.patch, "");
    assert.equal(secondRecord.checkpointSource, "");
    assert.match(secondRecord.afterHash, /^[a-f0-9]{64}$/);

    const latest = await revisions.reconstructRevision(10, second.revisionId);
    assert.equal(latest.source, updatedSource);

    const rows = await revisions.listRevisions(10);
    assert.deepEqual(rows.map((row) => row.revisionId), [second.revisionId, first.revisionId]);
    assert.notEqual(rows[0].patch, "");
    assert.equal(rows[0].checkpointSource, "");

    const summaries = await revisions.listRevisionSummaries(10);
    assert.deepEqual(summaries.map((row) => row.revisionId), [second.revisionId, first.revisionId]);
    assert.equal(Object.hasOwn(summaries[0], "patch"), false);
    assert.equal(Object.hasOwn(summaries[0], "checkpointSource"), false);
    assert.equal(Object.hasOwn(summaries[1], "patch"), false);
    assert.equal(Object.hasOwn(summaries[1], "checkpointSource"), false);

    const fullSecondRecord = await revisions.getRevisionRecord(10, second.revisionId);
    assert.notEqual(fullSecondRecord.patch, "");
    assert.equal(fullSecondRecord.checkpointSource, "");

    await revisions.purgeRevisions(10);
    assert.equal(await revisions.hasRevisions(10), false);
    assert.deepEqual(list("westgate-wiki:revisions:10"), []);
    assert.equal(state.objects.has("westgate-wiki:revisions:10:meta"), false);
    assert.equal(state.objects.has(`westgate-wiki:revision:10:${first.revisionId}`), false);
    assert.equal(state.objects.has(`westgate-wiki:revision:10:${second.revisionId}`), false);
    assert.deepEqual(state.deleteAllCalls, [[
      `westgate-wiki:revision:10:${second.revisionId}`,
      `westgate-wiki:revision:10:${first.revisionId}`,
      "westgate-wiki:revisions:10",
      "westgate-wiki:revisions:10:meta"
    ]]);

    reset();
    const tinyBase = await revisions.appendRevision({ tid: 13, pid: 130, cid: 5, uid: 1, action: "edit", title: "Tiny", oldSource: "", newSource: "<p>A</p>" });
    state.now += 1;
    const tinyEdit = await revisions.appendRevision({ tid: 13, pid: 130, cid: 5, uid: 1, action: "edit", title: "Tiny", oldSource: "<p>A</p>", newSource: "<p>B</p>" });
    assert.equal(tinyBase.checkpoint, true);
    assert.equal(tinyEdit.checkpoint, true);
    const tinyEditRecord = state.objects.get(`westgate-wiki:revision:13:${tinyEdit.revisionId}`);
    assert.equal(tinyEditRecord.checkpoint, "1");
    assert.equal(tinyEditRecord.patch, "");
    assert.equal(tinyEditRecord.checkpointSource, "<p>B</p>");

    reset();
    const baseline = await revisions.ensureRevisionBaseline({
      tid: 20,
      pid: 200,
      cid: 5,
      uid: 1,
      title: "Imported Page",
      source: "<p>Pre-existing body</p>",
      canonicalPath: "Lore/Imported_Page",
      wikiPath: "/wiki/Lore/Imported_Page"
    });
    assert.equal(baseline.action, "repair-checkpoint");
    assert.equal(baseline.checkpoint, true);
    assert.equal(baseline.parentRevisionId, "");
    state.now += 1;
    const firstEditAfterBaseline = await revisions.appendRevision({
      tid: 20,
      pid: 200,
      cid: 5,
      uid: 2,
      action: "edit",
      title: "Imported Page",
      oldSource: "<p>Pre-existing body</p>",
      newSource: "<p>Edited body</p>"
    });
    assert.equal(firstEditAfterBaseline.parentRevisionId, baseline.revisionId);
    const repairedRows = await revisions.listRevisions(20);
    assert.deepEqual(
      repairedRows.map((row) => row.action),
      ["edit", "repair-checkpoint"]
    );
    assert.equal((await revisions.reconstructRevision(20, baseline.revisionId)).source, "<p>Pre-existing body</p>");
    assert.equal((await revisions.reconstructRevision(20, firstEditAfterBaseline.revisionId)).source, "<p>Edited body</p>");
    assert.equal(await revisions.ensureRevisionBaseline({
      tid: 20,
      pid: 200,
      cid: 5,
      uid: 1,
      title: "Imported Page",
      source: "<p>Pre-existing body</p>"
    }), null);

    reset();
    assert.equal(await revisions.ensureRevisionBaseline({
      tid: 21,
      pid: 210,
      cid: 5,
      uid: 1,
      title: "Blank Imported Page",
      source: " \n "
    }), null);
    assert.equal(await revisions.hasRevisions(21), false);

    reset();
    const parentBase = await revisions.appendRevision({ tid: 14, pid: 140, cid: 5, uid: 1, action: "edit", title: "Parent", oldSource: "", newSource: "<p>Fresh</p>" });
    const parentObjectCount = state.objects.size;
    const parentListLength = list("westgate-wiki:revisions:14").length;
    const parentMeta = { ...state.objects.get("westgate-wiki:revisions:14:meta") };
    state.now += 1;
    await assert.rejects(
      () => revisions.assertCanAppendRevision({ tid: 14, pid: 140, cid: 5, uid: 1, action: "edit", title: "Parent", oldSource: "<p>Stale</p>", newSource: "<p>Next</p>" }),
      /revision-parent-hash-mismatch/
    );
    assert.equal(state.objects.size, parentObjectCount);
    assert.equal(list("westgate-wiki:revisions:14").length, parentListLength);
    assert.deepEqual(state.objects.get("westgate-wiki:revisions:14:meta"), parentMeta);
    await assert.rejects(
      () => revisions.appendRevision({ tid: 14, pid: 140, cid: 5, uid: 1, action: "edit", title: "Parent", oldSource: "<p>Stale</p>", newSource: "<p>Next</p>" }),
      /revision-parent-hash-mismatch/
    );
    assert.equal(state.objects.size, parentObjectCount);
    assert.equal(list("westgate-wiki:revisions:14").length, parentListLength);
    assert.deepEqual(state.objects.get("westgate-wiki:revisions:14:meta"), parentMeta);
    assert.equal((await revisions.reconstructRevision(14, parentBase.revisionId)).source, "<p>Fresh</p>");

    reset();
    await assert.rejects(
      () => revisions.assertCanAppendRevision({ tid: 15, pid: 150, cid: 5, uid: 1, action: "edit", title: "Missing Parent", parentRevisionId: "missing-parent", oldSource: "<p>Missing</p>", newSource: "<p>Next</p>" }),
      /revision-parent-not-found/
    );
    assert.equal(state.objects.size, 0);
    assert.equal(list("westgate-wiki:revisions:15").length, 0);
    await assert.rejects(
      () => revisions.appendRevision({ tid: 15, pid: 150, cid: 5, uid: 1, action: "edit", title: "Missing Parent", parentRevisionId: "missing-parent", oldSource: "<p>Missing</p>", newSource: "<p>Next</p>" }),
      /revision-parent-not-found/
    );
    assert.equal(state.objects.size, 0);
    assert.equal(list("westgate-wiki:revisions:15").length, 0);

    reset();
    const staleParent = await revisions.appendRevision({ tid: 16, pid: 160, cid: 5, uid: 1, action: "edit", title: "Branch", oldSource: "", newSource: "<p>Base</p>" });
    state.now += 1;
    await revisions.appendRevision({ tid: 16, pid: 160, cid: 5, uid: 1, action: "edit", title: "Branch", oldSource: "<p>Base</p>", newSource: "<p>Latest</p>" });
    state.now += 1;
    await assert.rejects(
      () => revisions.assertCanAppendRevision({ tid: 16, pid: 160, cid: 5, uid: 1, action: "edit", title: "Branch", parentRevisionId: staleParent.revisionId, oldSource: "<p>Base</p>", newSource: "<p>Branched</p>" }),
      /revision-parent-not-latest/
    );
    assert.equal(list("westgate-wiki:revisions:16").length, 2);
    assert.equal(state.objects.get("westgate-wiki:revisions:16:meta").revisionCount, "2");
    await assert.rejects(
      () => revisions.appendRevision({ tid: 16, pid: 160, cid: 5, uid: 1, action: "edit", title: "Branch", parentRevisionId: staleParent.revisionId, oldSource: "<p>Base</p>", newSource: "<p>Branched</p>" }),
      /revision-parent-not-latest/
    );
    assert.equal(list("westgate-wiki:revisions:16").length, 2);
    assert.equal(state.objects.get("westgate-wiki:revisions:16:meta").revisionCount, "2");

    reset();
    const marker = await revisions.beginRevisionPurge(17, {
      uid: 7,
      cid: 5,
      tombstoneRevisionId: "rev-tombstone"
    });
    assert.equal(marker.uid, 7);
    assert.equal(marker.cid, 5);
    assert.equal(marker.tombstoneRevisionId, "rev-tombstone");
    assert.equal(marker.topicPurged, false);
    assert.equal(await revisions.isRevisionPurgeActive(17), true);
    assert.deepEqual(await revisions.getRevisionPurge(17), {
      tid: 17,
      uid: 7,
      cid: 5,
      tombstoneRevisionId: "rev-tombstone",
      topicPurged: false,
      startedAt: "1000"
    });
    state.now += 1;
    const topicPurgedMarker = await revisions.markRevisionPurgeTopicPurged(17);
    assert.equal(topicPurgedMarker.topicPurged, true);
    assert.equal(topicPurgedMarker.uid, 7);
    assert.deepEqual(await revisions.getRevisionPurge(17), {
      tid: 17,
      uid: 7,
      cid: 5,
      tombstoneRevisionId: "rev-tombstone",
      topicPurged: true,
      startedAt: "1000",
      topicPurgedAt: "1001"
    });
    await assert.rejects(
      () => revisions.assertCanAppendRevision({ tid: 17, pid: 170, cid: 5, uid: 1, action: "edit", title: "Purging", oldSource: "", newSource: "<p>Blocked</p>" }),
      /revision-purge-active/
    );
    await assert.rejects(
      () => revisions.appendRevision({ tid: 17, pid: 170, cid: 5, uid: 1, action: "edit", title: "Purging", oldSource: "", newSource: "<p>Blocked</p>" }),
      /revision-purge-active/
    );
    assert.equal(list("westgate-wiki:revisions:17").length, 0);
    await revisions.clearRevisionPurge(17);
    assert.equal(await revisions.isRevisionPurgeActive(17), false);
    assert.equal(await revisions.getRevisionPurge(17), null);
    const unblocked = await revisions.appendRevision({ tid: 17, pid: 170, cid: 5, uid: 1, action: "edit", title: "Purging", oldSource: "", newSource: "<p>Allowed</p>" });
    assert.equal(list("westgate-wiki:revisions:17")[0], unblocked.revisionId);

    reset();
    state.failSetObjectKey = "westgate-wiki:revisions:18:meta";
    await assert.rejects(
      () => revisions.appendRevision({ tid: 18, pid: 180, cid: 5, uid: 1, action: "edit", title: "Partial", oldSource: "", newSource: "<p>Blocked</p>" }),
      /failed-setObject-westgate-wiki:revisions:18:meta/
    );
    assert.equal(state.objects.has("westgate-wiki:revision:18:rev-18-1000-edit"), false);
    assert.equal(state.objects.has("westgate-wiki:revisions:18:meta"), false);
    assert.deepEqual(list("westgate-wiki:revisions:18"), []);

    reset();
    const previous = await revisions.appendRevision({ tid: 19, pid: 190, cid: 5, uid: 1, action: "edit", title: "Partial", oldSource: "", newSource: "<p>Previous</p>" });
    const previousMeta = { ...state.objects.get("westgate-wiki:revisions:19:meta") };
    state.now += 1;
    state.failListPrependKey = "westgate-wiki:revisions:19";
    await assert.rejects(
      () => revisions.appendRevision({ tid: 19, pid: 190, cid: 5, uid: 1, action: "edit", title: "Partial", oldSource: "<p>Previous</p>", newSource: "<p>Blocked</p>" }),
      /failed-listPrepend-westgate-wiki:revisions:19/
    );
    assert.equal(state.objects.has("westgate-wiki:revision:19:rev-19-1001-edit"), false);
    assert.deepEqual(state.objects.get("westgate-wiki:revisions:19:meta"), previousMeta);
    assert.deepEqual(list("westgate-wiki:revisions:19"), [previous.revisionId]);

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
