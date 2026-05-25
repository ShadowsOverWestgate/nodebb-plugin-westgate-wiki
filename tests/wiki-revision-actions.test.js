"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const root = process.cwd();

function clearProjectModule(relativePath) {
  const filename = require.resolve(`${root}/${relativePath}`);
  delete require.cache[filename];
}

async function withStubs(stubs, fn) {
  const originalMainRequire = require.main.require.bind(require.main);
  const patched = [];

  require.main.require = function requireNodebbStub(id) {
    if (Object.prototype.hasOwnProperty.call(stubs.nodebb, id)) {
      return stubs.nodebb[id];
    }
    return originalMainRequire(id);
  };

  function patchProjectModule(relativePath, exports) {
    const filename = require.resolve(`${root}/${relativePath}`);
    patched.push([filename, require.cache[filename]]);
    require.cache[filename] = {
      id: filename,
      filename,
      loaded: true,
      exports
    };
  }

  for (const [relativePath, exports] of Object.entries(stubs.project || {})) {
    patchProjectModule(relativePath, exports);
  }

  try {
    return await fn();
  } finally {
    patched.reverse().forEach(([filename, previous]) => {
      if (previous) {
        require.cache[filename] = previous;
      } else {
        delete require.cache[filename];
      }
    });
    require.main.require = originalMainRequire;
    clearProjectModule("lib/wiki-revision-actions.js");
  }
}

function createHarness(overrides = {}) {
  const calls = {
    api: [],
    appendRevision: [],
    assertCanAppendRevision: [],
    assertSaveLock: [],
    canViewHistory: [],
    canRestore: [],
    canHardPurge: [],
    clearTombstone: [],
    clearTombstoneIfRevision: [],
    compareSources: [],
    createRevisionId: [],
    edit: [],
    getPostFields: [],
    setPostFields: [],
    clearCachedPost: [],
    getCanonicalPagePath: [],
    getRevisionPurge: [],
    getRevisionRecord: [],
    getTombstone: [],
    getTombstoneIfRevision: [],
    getWikiPage: [],
    hardPurgeCheckedTombstone: [],
    hardPurgeTombstone: [],
    hardPurgeTombstoneIfRevision: [],
    invalidateNamespace: [],
    invalidateWikiTreeIndex: [],
    listRevisionSummaries: [],
    beginRevisionPurge: [],
    clearRevisionPurge: [],
    markRevisionPurgeTopicPurged: [],
    purgeRevisions: [],
    reconstructRevision: [],
    sanitize: [],
    setTombstone: [],
    validateCanonicalPagePlacement: []
  };
  const state = {
    page: {
      status: "ok",
      topic: {
        tid: 42,
        cid: 7,
        mainPid: 420,
        title: "Moonlit Page",
        titleRaw: "Moonlit Page"
      },
      canDeleteWikiPage: true,
      canEditWikiPage: true,
      topicPrivileges: {
        "topics:delete": true
      }
    },
    postFields: {
      content: "<p>Current rendered</p>",
      sourceContent: "<p>Current source</p>"
    },
    summaries: [
      { revisionId: "rev-2", action: "edit" },
      { revisionId: "rev-1", action: "create" }
    ],
    reconstructed: new Map([
      ["rev-1", { revision: { revisionId: "rev-1", action: "create" }, source: "<p>Old source</p>" }],
      ["rev-2", { revision: { revisionId: "rev-2", action: "edit", patch: "raw patch", checkpointSource: "<p>raw checkpoint</p>" }, source: "<p>New source</p>" }]
    ]),
    permissions: {
      history: true,
      restore: true,
      hardPurge: true
    },
    lockResult: { status: "ok" },
    sanitizedPrefix: "sanitized:",
    preparedRevisionId: "rev-appended",
    appendedRevision: { revisionId: "rev-appended", timestamp: 12345 },
    tombstone: { tombstoned: true, at: 123, uid: 9, revisionId: "rev-tombstone", reason: "stale" },
    tombstoneRevisionRecord: { revisionId: "rev-tombstone", action: "tombstone" },
    canonicalPath: "Lore/Moonlit_Page",
    now: 1000,
    ...overrides.state
  };

  const stubs = {
    nodebb: {
      "./src/controllers/helpers": {
        formatApiResponse(status, res, payload) {
          calls.api.push({ status, payload });
          res.statusCode = status;
          res.payload = payload;
          return payload;
        }
      },
      "./src/posts": {
        getPostFields: async (pid, fields) => {
          calls.getPostFields.push({ pid, fields });
          if (Array.isArray(state.postFieldsSequence) && state.postFieldsSequence.length) {
            return state.postFieldsSequence.shift();
          }
          return state.postFields;
        },
        edit: async (payload) => {
          calls.edit.push(payload);
          if (state.editError) {
            throw state.editError;
          }
          state.postFields = {
            content: payload.content,
            sourceContent: payload.sourceContent
          };
          return { ok: true };
        },
        ...(!state.disableSetPostFields ? {
          setPostFields: async (pid, fields) => {
            calls.setPostFields.push({ pid, fields });
            if (state.setPostFieldsError) {
              throw state.setPostFieldsError;
            }
            state.postFields = { ...state.postFields, ...fields };
          }
        } : {}),
        clearCachedPost: (pid) => calls.clearCachedPost.push({ pid })
      }
    },
    project: {
      "lib/topic-service.js": {
        getWikiPage: async (tid, uid, options) => {
          calls.getWikiPage.push({ tid, uid, options });
          return state.page;
        }
      },
      "lib/wiki-revision-permissions.js": {
        canViewHistory: async (cid, uid) => {
          calls.canViewHistory.push({ cid, uid });
          return state.permissions.history;
        },
        canRestore: async (cid, uid) => {
          calls.canRestore.push({ cid, uid });
          return state.permissions.restore;
        },
        canHardPurge: async (cid, uid) => {
          calls.canHardPurge.push({ cid, uid });
          return state.permissions.hardPurge;
        }
      },
      "lib/wiki-revisions.js": {
        listRevisionSummaries: async (tid) => {
          calls.listRevisionSummaries.push({ tid });
          return state.summaries;
        },
        reconstructRevision: async (tid, revisionId) => {
          calls.reconstructRevision.push({ tid, revisionId });
          const key = String(revisionId);
          const result = state.reconstructed.get(key);
          if (result instanceof Error) {
            throw result;
          }
          return result;
        },
        compareSources: (fromSource, toSource) => {
          calls.compareSources.push({ fromSource, toSource });
          return `diff:${fromSource}->${toSource}`;
        },
        createRevisionId: (input) => {
          calls.createRevisionId.push(input);
          return state.preparedRevisionId;
        },
        appendRevision: async (payload) => {
          calls.appendRevision.push(payload);
          if (state.onAppendRevision) {
            await state.onAppendRevision(payload);
          }
          if (state.appendError) {
            throw state.appendError;
          }
          return state.appendedRevision;
        },
        assertCanAppendRevision: async (payload) => {
          calls.assertCanAppendRevision.push(payload);
          if (state.preflightError) {
            throw state.preflightError;
          }
        },
        getRevisionRecord: async (tid, revisionId) => {
          calls.getRevisionRecord.push({ tid, revisionId });
          return state.tombstoneRevisionRecord;
        },
        getRevisionPurge: async (tid) => {
          calls.getRevisionPurge.push({ tid });
          return state.revisionPurgeMarker || null;
        },
        beginRevisionPurge: async (tid, context) => {
          calls.beginRevisionPurge.push({ tid, context });
          if (state.beginRevisionPurgeError) {
            throw state.beginRevisionPurgeError;
          }
          state.revisionPurgeMarker = {
            tid,
            ...context,
            active: true
          };
          return state.revisionPurgeMarker;
        },
        markRevisionPurgeTopicPurged: async (tid) => {
          calls.markRevisionPurgeTopicPurged.push({ tid });
          state.revisionPurgeMarker = {
            ...(state.revisionPurgeMarker || { tid }),
            topicPurged: true
          };
          return state.revisionPurgeMarker;
        },
        clearRevisionPurge: async (tid) => {
          calls.clearRevisionPurge.push({ tid });
          if (state.clearRevisionPurgeError) {
            throw state.clearRevisionPurgeError;
          }
          state.revisionPurgeMarker = null;
          return { tid, active: false };
        },
        purgeRevisions: async (tid) => {
          calls.purgeRevisions.push({ tid });
          if (state.purgeRevisionsError) {
            throw state.purgeRevisionsError;
          }
          return { tid, purged: true };
        }
      },
      "lib/wiki-edit-locks.js": {
        assertSaveLock: async (tid, uid, token) => {
          calls.assertSaveLock.push({ tid, uid, token });
          return state.lockResult;
        },
        getStatusMessage: () => "lock denied"
      },
      "lib/wiki-page-validation.js": {
        getValidationMessage: () => "invalid canonical placement",
        isBlockingResult: (result) => !!(result && result.blocking),
        sanitizeAndValidateWikiMainBody: (source) => {
          calls.sanitize.push(source);
          return `${state.sanitizedPrefix}${source}`;
        }
      },
      "lib/wiki-tombstones.js": {
        clearTombstone: async (tid) => {
          calls.clearTombstone.push({ tid });
          if (state.clearTombstoneError) {
            throw state.clearTombstoneError;
          }
          return { cleared: true };
        },
        clearTombstoneIfRevision: async (tid, revisionId) => {
          calls.clearTombstoneIfRevision.push({ tid, revisionId });
          if (state.clearTombstoneError) {
            throw state.clearTombstoneError;
          }
          if (state.clearTombstoneResult) {
            return state.clearTombstoneResult;
          }
          const matched = !!(state.tombstone && state.tombstone.revisionId === revisionId);
          if (matched) {
            state.tombstone = null;
          }
          return { tid, cleared: matched, matched };
        },
        setTombstone: async (payload) => {
          calls.setTombstone.push(payload);
          if (state.setTombstoneError) {
            throw state.setTombstoneError;
          }
          state.tombstone = {
            tombstoned: true,
            at: payload.timestamp,
            uid: payload.uid,
            revisionId: payload.revisionId,
            reason: payload.reason
          };
          return state.tombstone;
        },
        getTombstone: async (tid) => {
          calls.getTombstone.push({ tid });
          return state.tombstone;
        },
        getTombstoneIfRevision: async (tid, revisionId) => {
          calls.getTombstoneIfRevision.push({ tid, revisionId });
          if (Array.isArray(state.tombstoneIfRevisionSequence) && state.tombstoneIfRevisionSequence.length) {
            return state.tombstoneIfRevisionSequence.shift();
          }
          if (state.tombstoneIfRevision === undefined) {
            return state.tombstone && state.tombstone.revisionId === revisionId ? state.tombstone : null;
          }
          return state.tombstoneIfRevision;
        },
        hardPurgeTombstone: async (tid, uid) => {
          calls.hardPurgeTombstone.push({ tid, uid });
          return { tid, purged: true };
        },
        hardPurgeCheckedTombstone: async (tid, uid, tombstone) => {
          calls.hardPurgeCheckedTombstone.push({ tid, uid, tombstone });
          if (state.hardPurgeCheckedTombstoneError) {
            throw state.hardPurgeCheckedTombstoneError;
          }
          return { tid, purged: true };
        },
        hardPurgeTombstoneIfRevision: async (tid, uid, revisionId) => {
          calls.hardPurgeTombstoneIfRevision.push({ tid, uid, revisionId });
          if (state.hardPurgeTombstoneIfRevisionError) {
            throw state.hardPurgeTombstoneIfRevisionError;
          }
          return { tid, purged: true };
        }
      },
      "lib/wiki-directory-service.js": {
        invalidateNamespace: (cid) => calls.invalidateNamespace.push({ cid })
      },
      "lib/wiki-paths.js": {
        getCanonicalPagePath: async (topic, options) => {
          calls.getCanonicalPagePath.push({ topic, options });
          return state.canonicalPath;
        },
        invalidateWikiTreeIndex: (payload) => calls.invalidateWikiTreeIndex.push(payload),
        validateCanonicalPagePlacement: async (payload) => {
          calls.validateCanonicalPagePlacement.push(payload);
          return state.placementValidation || { status: "ok" };
        }
      },
      ...(overrides.project || {})
    }
  };

  return { calls, state, stubs };
}

async function loadActions(harness, fn) {
  return withStubs(harness.stubs, async () => {
    const actions = require("../lib/wiki-revision-actions");
    return fn(actions);
  });
}

test("listRevisions requires wiki:history and returns revision summaries", async () => {
  const harness = createHarness();

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.listRevisions({ uid: 9, params: { tid: "42" } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, { tid: 42, revisions: harness.state.summaries });
    assert.deepEqual(harness.calls.getWikiPage[0], { tid: 42, uid: 9, options: { includeTombstoned: true } });
    assert.deepEqual(harness.calls.canViewHistory, [{ cid: 7, uid: 9 }]);
    assert.deepEqual(harness.calls.listRevisionSummaries, [{ tid: 42 }]);
  });

  const denied = createHarness({ state: { permissions: { history: false, restore: true, hardPurge: true } } });
  await loadActions(denied, async (actions) => {
    const res = {};
    await actions.listRevisions({ uid: 9, params: { tid: "42" } }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(denied.calls.listRevisionSummaries.length, 0);
  });

  const malformed = createHarness();
  await loadActions(malformed, async (actions) => {
    const res = {};
    await actions.listRevisions({ uid: 9, params: { tid: "42abc" } }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(malformed.calls.getWikiPage.length, 0);
    assert.equal(malformed.calls.listRevisionSummaries.length, 0);
  });
});

test("getRevision requires wiki:history and returns reconstructed detail source without raw patch payloads", async () => {
  const harness = createHarness();

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.getRevision({ uid: 9, params: { tid: "42", revisionId: "rev-2" } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.payload, {
      tid: 42,
      revision: { revisionId: "rev-2", action: "edit" },
      source: "<p>New source</p>"
    });
    assert.equal(Object.hasOwn(res.payload.revision, "patch"), false);
    assert.equal(Object.hasOwn(res.payload.revision, "checkpointSource"), false);
    assert.deepEqual(harness.calls.canViewHistory, [{ cid: 7, uid: 9 }]);
    assert.deepEqual(harness.calls.reconstructRevision, [{ tid: 42, revisionId: "rev-2" }]);
  });

  const denied = createHarness({ state: { permissions: { history: false, restore: true, hardPurge: true } } });
  await loadActions(denied, async (actions) => {
    const res = {};
    await actions.getRevision({ uid: 9, params: { tid: "42", revisionId: "rev-2" } }, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(denied.calls.canViewHistory, [{ cid: 7, uid: 9 }]);
    assert.equal(denied.calls.reconstructRevision.length, 0);
  });
});

test("diffRevisions requires wiki:history and compares reconstructed sources", async () => {
  const harness = createHarness();

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.diffRevisions({
      uid: 9,
      params: { tid: "42", fromRevisionId: "rev-1", toRevisionId: "rev-2" }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(harness.calls.reconstructRevision, [
      { tid: 42, revisionId: "rev-1" },
      { tid: 42, revisionId: "rev-2" }
    ]);
    assert.deepEqual(harness.calls.compareSources, [{
      fromSource: "<p>Old source</p>",
      toSource: "<p>New source</p>"
    }]);
    assert.deepEqual(harness.calls.canViewHistory, [{ cid: 7, uid: 9 }]);
    assert.deepEqual(res.payload, {
      tid: 42,
      fromRevision: { revisionId: "rev-1", action: "create" },
      toRevision: { revisionId: "rev-2", action: "edit" },
      diff: "diff:<p>Old source</p>-><p>New source</p>"
    });
  });

  const denied = createHarness({ state: { permissions: { history: false, restore: true, hardPurge: true } } });
  await loadActions(denied, async (actions) => {
    const res = {};
    await actions.diffRevisions({
      uid: 9,
      params: { tid: "42", fromRevisionId: "rev-1", toRevisionId: "rev-2" }
    }, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(denied.calls.canViewHistory, [{ cid: 7, uid: 9 }]);
    assert.equal(denied.calls.reconstructRevision.length, 0);
    assert.equal(denied.calls.compareSources.length, 0);
  });
});

test("restoreRevision requires wiki:restore", async () => {
  const harness = createHarness({ state: { permissions: { history: true, restore: false, hardPurge: true } } });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.restoreRevision({
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(harness.calls.assertSaveLock.length, 0);
    assert.equal(harness.calls.edit.length, 0);
  });
});

test("restoreRevision validates edit lock before editing", async () => {
  const harness = createHarness({ state: { lockResult: { status: "locked" } } });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.restoreRevision({
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    }, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(harness.calls.assertSaveLock, [{ tid: 42, uid: 9, token: "token" }]);
    assert.equal(harness.calls.reconstructRevision.length, 0);
    assert.equal(harness.calls.edit.length, 0);
  });
});

test("restoreRevision reconstructs, sanitizes, edits, records restore revision, clears tombstone, and invalidates caches", async () => {
  const harness = createHarness();

  await loadActions(harness, async (actions) => {
    const req = {
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    };
    const res = {};
    await actions.restoreRevision(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(harness.calls.assertSaveLock, [{ tid: 42, uid: 9, token: "token" }]);
    assert.deepEqual(harness.calls.getPostFields, [
      { pid: 420, fields: ["content", "sourceContent"] },
      { pid: 420, fields: ["content", "sourceContent"] }
    ]);
    assert.deepEqual(harness.calls.sanitize, ["<p>Old source</p>"]);
    assert.deepEqual(harness.calls.validateCanonicalPagePlacement, [{
      cid: 7,
      title: "Moonlit Page",
      omitTid: 42
    }]);
    assert.deepEqual(harness.calls.assertCanAppendRevision, [{
      tid: 42,
      pid: 420,
      cid: 7,
      uid: 9,
      action: "restore",
      title: "Moonlit Page",
      oldSource: "<p>Current source</p>",
      newSource: "sanitized:<p>Old source</p>",
      restoreSourceRevisionId: "rev-1"
    }]);
    assert.deepEqual(harness.calls.edit, [{
      pid: 420,
      uid: 9,
      title: "Moonlit Page",
      content: "sanitized:<p>Old source</p>",
      sourceContent: "sanitized:<p>Old source</p>",
      req
    }]);
    assert.deepEqual(harness.calls.appendRevision, [{
      tid: 42,
      pid: 420,
      cid: 7,
      uid: 9,
      action: "restore",
      title: "Moonlit Page",
      oldSource: "<p>Current source</p>",
      newSource: "sanitized:<p>Old source</p>",
      restoreSourceRevisionId: "rev-1"
    }]);
    assert.deepEqual(harness.calls.getTombstone, [{ tid: 42 }]);
    assert.deepEqual(harness.calls.clearTombstoneIfRevision, [{ tid: 42, revisionId: "rev-tombstone" }]);
    assert.deepEqual(harness.calls.clearTombstone, []);
    assert.deepEqual(harness.calls.setPostFields, []);
    assert.deepEqual(harness.calls.invalidateNamespace, [{ cid: 7 }]);
    assert.deepEqual(harness.calls.invalidateWikiTreeIndex, [{ reason: "wiki-revision-restored" }]);
    assert.deepEqual(harness.calls.getCanonicalPagePath, [{
      topic: harness.state.page.topic,
      options: { uid: 9 }
    }]);
    assert.deepEqual(res.payload, {
      ok: true,
      tid: 42,
      revisionId: "rev-appended",
      canonicalPath: "Lore/Moonlit_Page",
      wikiPath: "/wiki/Lore/Moonlit_Page"
    });
  });
});

test("restoreRevision blocks invalid canonical placement before editing", async () => {
  const harness = createHarness({
    state: {
      placementValidation: { status: "duplicate", blocking: true }
    }
  });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.restoreRevision({
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.payload.message, /invalid canonical placement/);
    assert.equal(harness.calls.edit.length, 0);
    assert.equal(harness.calls.appendRevision.length, 0);
    assert.equal(harness.calls.clearTombstone.length, 0);
  });
});

test("restoreRevision repairs mismatched post storage before clearing tombstone", async () => {
  const harness = createHarness({
    state: {
      postFieldsSequence: [
        { content: "<p>Current rendered</p>", sourceContent: "<p>Current source</p>" },
        { content: "<p>stale rendered</p>", sourceContent: "<p>stale source</p>" }
      ]
    }
  });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.restoreRevision({
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(harness.calls.setPostFields, [{
      pid: 420,
      fields: {
        content: "sanitized:<p>Old source</p>",
        sourceContent: "sanitized:<p>Old source</p>"
      }
    }]);
    assert.deepEqual(harness.calls.clearCachedPost, [{ pid: "420" }]);
    assert.deepEqual(harness.calls.clearTombstoneIfRevision, [{ tid: 42, revisionId: "rev-tombstone" }]);
    assert.equal(harness.calls.appendRevision.length, 1);
  });
});

test("restoreRevision rolls back and fails when post storage cannot be verified or repaired", async () => {
  const harness = createHarness({
    state: {
      disableSetPostFields: true,
      postFieldsSequence: [
        { content: "<p>Current rendered</p>", sourceContent: "<p>Current source</p>" },
        { content: "<p>stale rendered</p>", sourceContent: "<p>stale source</p>" },
        { content: "sanitized:<p>Old source</p>", sourceContent: "sanitized:<p>Old source</p>" }
      ]
    }
  });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.restoreRevision({
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    }, res);

    assert.equal(res.statusCode, 500);
    assert.match(res.payload.message, /wiki-restore-storage-unverified/);
    assert.deepEqual(harness.calls.edit.map((call) => call.sourceContent), [
      "sanitized:<p>Old source</p>",
      "<p>Current source</p>"
    ]);
    assert.equal(harness.calls.clearTombstoneIfRevision.length, 0);
    assert.equal(harness.calls.appendRevision.length, 0);
    assert.equal(harness.calls.invalidateNamespace.length, 0);
  });
});

test("restoreRevision returns conflict when observed tombstone clear is stale", async () => {
  const harness = createHarness({
    state: {
      clearTombstoneResult: { tid: 42, cleared: false, matched: false }
    }
  });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.restoreRevision({
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.payload.message, /wiki-page-tombstone-stale/);
    assert.deepEqual(harness.calls.clearTombstoneIfRevision, [{ tid: 42, revisionId: "rev-tombstone" }]);
    assert.equal(harness.calls.appendRevision.length, 0);
    assert.deepEqual(harness.calls.edit.map((call) => call.sourceContent), [
      "sanitized:<p>Old source</p>",
      "<p>Current source</p>"
    ]);
    assert.equal(harness.calls.clearTombstone.length, 0);
    assert.equal(harness.calls.setTombstone.length, 0);
    assert.equal(harness.calls.invalidateNamespace.length, 0);
  });
});

test("restoreRevision rolls back post and repairs tombstone when clearing tombstone throws", async () => {
  const harness = createHarness({
    state: {
      clearTombstoneError: new Error("tombstone-clear-failed")
    }
  });

  await loadActions(harness, async (actions) => {
    const req = {
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    };
    const res = {};
    await actions.restoreRevision(req, res);

    assert.equal(res.statusCode, 500);
    assert.match(res.payload.message, /tombstone-clear-failed/);
    assert.deepEqual(harness.calls.edit.map((call) => call.sourceContent), [
      "sanitized:<p>Old source</p>",
      "<p>Current source</p>"
    ]);
    assert.deepEqual(harness.calls.setTombstone, [{
      tid: 42,
      uid: 9,
      revisionId: "rev-tombstone",
      reason: "stale",
      timestamp: 123
    }]);
    assert.equal(harness.calls.appendRevision.length, 0);
    assert.equal(harness.calls.invalidateNamespace.length, 0);
  });
});

test("restoreRevision returns reconstruction errors and does not edit", async () => {
  const harness = createHarness({
    state: {
      reconstructed: new Map([["rev-bad", new Error("revision-hash-mismatch")]])
    }
  });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.restoreRevision({
      uid: 9,
      params: { tid: "42", revisionId: "rev-bad" },
      body: { wikiEditLockToken: "token" },
      query: {}
    }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.payload.message, /revision-hash-mismatch/);
    assert.equal(harness.calls.edit.length, 0);
    assert.equal(harness.calls.appendRevision.length, 0);
  });
});

test("restoreRevision preflights parent hash before editing", async () => {
  const harness = createHarness({
    state: {
      preflightError: new Error("revision-parent-hash-mismatch")
    }
  });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.restoreRevision({
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.payload.message, /revision-parent-hash-mismatch/);
    assert.equal(harness.calls.assertCanAppendRevision.length, 1);
    assert.equal(harness.calls.edit.length, 0);
    assert.equal(harness.calls.appendRevision.length, 0);
  });
});

test("restoreRevision rolls back post edit when appendRevision fails", async () => {
  const harness = createHarness({
    state: {
      appendError: new Error("db-write-failed")
    }
  });

  await loadActions(harness, async (actions) => {
    const req = {
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    };
    const res = {};
    await actions.restoreRevision(req, res);

    assert.equal(res.statusCode, 500);
    assert.match(res.payload.message, /db-write-failed/);
    assert.deepEqual(harness.calls.edit, [
      {
        pid: 420,
        uid: 9,
        title: "Moonlit Page",
        content: "sanitized:<p>Old source</p>",
        sourceContent: "sanitized:<p>Old source</p>",
        req
      },
      {
        pid: 420,
        uid: 9,
        title: "Moonlit Page",
        content: "<p>Current source</p>",
        sourceContent: "<p>Current source</p>",
        req
      }
    ]);
    assert.deepEqual(harness.calls.clearTombstoneIfRevision, [{ tid: 42, revisionId: "rev-tombstone" }]);
    assert.deepEqual(harness.calls.setTombstone, [{
      tid: 42,
      uid: 9,
      revisionId: "rev-tombstone",
      reason: "stale",
      timestamp: 123
    }]);
    assert.equal(harness.calls.clearTombstone.length, 0);
    assert.equal(harness.calls.invalidateNamespace.length, 0);
  });
});

test("restoreRevision does not roll back when content changed after failed append", async () => {
  const harness = createHarness({
    state: {
      appendError: new Error("db-write-failed"),
      postFieldsSequence: [
        { content: "<p>Current rendered</p>", sourceContent: "<p>Current source</p>" },
        { content: "sanitized:<p>Old source</p>", sourceContent: "sanitized:<p>Old source</p>" },
        { content: "<p>Newer content</p>", sourceContent: "<p>Newer content</p>" }
      ]
    }
  });

  await loadActions(harness, async (actions) => {
    const req = {
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    };
    const res = {};
    await actions.restoreRevision(req, res);

    assert.equal(res.statusCode, 500);
    assert.match(res.payload.message, /db-write-failed/);
    assert.deepEqual(harness.calls.getPostFields, [
      { pid: 420, fields: ["content", "sourceContent"] },
      { pid: 420, fields: ["content", "sourceContent"] },
      { pid: 420, fields: ["content", "sourceContent"] }
    ]);
    assert.deepEqual(harness.calls.edit, [{
      pid: 420,
      uid: 9,
      title: "Moonlit Page",
      content: "sanitized:<p>Old source</p>",
      sourceContent: "sanitized:<p>Old source</p>",
      req
    }]);
    assert.equal(harness.calls.clearTombstone.length, 0);
    assert.deepEqual(harness.calls.clearTombstoneIfRevision, [{ tid: 42, revisionId: "rev-tombstone" }]);
    assert.deepEqual(harness.calls.setTombstone, [{
      tid: 42,
      uid: 9,
      revisionId: "rev-tombstone",
      reason: "stale",
      timestamp: 123
    }]);
  });
});

test("tombstonePage requires delete authority, appends tombstone revision, sets tombstone, and invalidates caches", async () => {
  const harness = createHarness();

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.tombstonePage({
      uid: 9,
      body: { tid: "42", reason: "duplicate" }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(harness.calls.assertCanAppendRevision.length, 1);
    assert.equal(harness.calls.setTombstone.length, 1);
    assert.equal(harness.calls.appendRevision.length, 1);
    assert.deepEqual(
      { ...harness.calls.appendRevision[0], timestamp: undefined },
      {
        tid: 42,
        pid: 420,
        cid: 7,
        uid: 9,
        action: "tombstone",
        title: "Moonlit Page",
        oldSource: "<p>Current source</p>",
        newSource: "<p>Current source</p>",
        tombstoneReason: "duplicate",
        revisionId: "rev-appended",
        timestamp: undefined
      }
    );
    assert.equal(Number.isSafeInteger(harness.calls.appendRevision[0].timestamp), true);
    assert.deepEqual(harness.calls.setTombstone[0], {
      tid: 42,
      uid: 9,
      revisionId: "rev-appended",
      reason: "duplicate",
      timestamp: harness.calls.appendRevision[0].timestamp
    });
    assert.deepEqual(harness.calls.invalidateNamespace, [{ cid: 7 }]);
    assert.deepEqual(harness.calls.invalidateWikiTreeIndex, [{ reason: "wiki-page-tombstoned" }]);
  });

  const denied = createHarness({
    state: {
      page: {
        ...harness.state.page,
        canDeleteWikiPage: false,
        canEditWikiPage: false,
        topicPrivileges: { "topics:delete": false }
      }
    }
  });
  await loadActions(denied, async (actions) => {
    const res = {};
    await actions.tombstonePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(denied.calls.appendRevision.length, 0);
    assert.equal(denied.calls.setTombstone.length, 0);
  });
});

test("tombstonePage does not append a tombstone revision when setTombstone fails", async () => {
  const harness = createHarness({
    state: {
      setTombstoneError: new Error("tombstone-write-failed")
    }
  });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.tombstonePage({ uid: 9, body: { tid: "42", reason: "duplicate" } }, res);

    assert.equal(res.statusCode, 500);
    assert.equal(harness.calls.assertCanAppendRevision.length, 1);
    assert.equal(harness.calls.setTombstone.length, 1);
    assert.equal(harness.calls.appendRevision.length, 0);
    assert.equal(harness.calls.invalidateNamespace.length, 0);
  });
});

test("tombstonePage clears tombstone when appendRevision fails after setTombstone", async () => {
  const harness = createHarness({
    state: {
      tombstone: null,
      appendError: new Error("db-write-failed")
    }
  });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.tombstonePage({ uid: 9, body: { tid: "42", reason: "duplicate" } }, res);

    assert.equal(res.statusCode, 500);
    assert.equal(harness.calls.setTombstone.length, 1);
    assert.equal(harness.calls.appendRevision.length, 1);
    assert.deepEqual(harness.calls.clearTombstoneIfRevision, [{ tid: 42, revisionId: "rev-appended" }]);
    assert.deepEqual(harness.calls.clearTombstone, []);
    assert.equal(harness.state.tombstone, null);
    assert.equal(harness.calls.invalidateNamespace.length, 0);
  });
});

test("tombstonePage restores previous tombstone when retombstone append fails", async () => {
  const previousTombstone = { tombstoned: true, at: 321, uid: 8, revisionId: "rev-previous", reason: "old reason" };
  const harness = createHarness({
    state: {
      tombstone: previousTombstone,
      appendError: new Error("db-write-failed")
    }
  });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.tombstonePage({ uid: 9, body: { tid: "42", reason: "duplicate" } }, res);

    assert.equal(res.statusCode, 500);
    assert.equal(harness.calls.appendRevision.length, 1);
    assert.equal(harness.calls.clearTombstoneIfRevision.length, 0);
    assert.deepEqual(harness.calls.setTombstone, [
      {
        tid: 42,
        uid: 9,
        revisionId: "rev-appended",
        reason: "duplicate",
        timestamp: harness.calls.appendRevision[0].timestamp
      },
      {
        tid: 42,
        uid: 8,
        revisionId: "rev-previous",
        reason: "old reason",
        timestamp: 321
      }
    ]);
    assert.deepEqual(harness.state.tombstone, previousTombstone);
    assert.equal(harness.calls.invalidateNamespace.length, 0);
  });
});

test("tombstonePage append failure does not clear a newer tombstone revision", async () => {
  const harness = createHarness({
    state: {
      tombstone: null,
      appendError: new Error("db-write-failed"),
      onAppendRevision: async () => {
        harness.state.tombstone = { tombstoned: true, at: 456, uid: 10, revisionId: "newer-tombstone", reason: "newer" };
      }
    }
  });

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.tombstonePage({ uid: 9, body: { tid: "42", reason: "duplicate" } }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(harness.calls.clearTombstoneIfRevision, [{ tid: 42, revisionId: "rev-appended" }]);
    assert.equal(harness.calls.clearTombstone.length, 0);
    assert.deepEqual(harness.state.tombstone, { tombstoned: true, at: 456, uid: 10, revisionId: "newer-tombstone", reason: "newer" });
    assert.equal(harness.calls.invalidateNamespace.length, 0);
  });
});

test("mutation handlers for the same topic run serially", async () => {
  let restoreAppendStarted;
  const restoreAppendStartedPromise = new Promise((resolve) => {
    restoreAppendStarted = resolve;
  });
  let releaseRestoreAppend;
  const releaseRestoreAppendPromise = new Promise((resolve) => {
    releaseRestoreAppend = resolve;
  });
  const harness = createHarness({
    state: {
      onAppendRevision: async (payload) => {
        if (payload.action === "restore") {
          restoreAppendStarted();
          await releaseRestoreAppendPromise;
        }
      }
    }
  });

  await loadActions(harness, async (actions) => {
    const restoreRes = {};
    const restorePromise = actions.restoreRevision({
      uid: 9,
      params: { tid: "42", revisionId: "rev-1" },
      body: { wikiEditLockToken: "token" },
      query: {}
    }, restoreRes);
    await restoreAppendStartedPromise;

    const tombstoneRes = {};
    const tombstonePromise = actions.tombstonePage({ uid: 9, body: { tid: "42", reason: "queued" } }, tombstoneRes);
    await Promise.resolve();

    assert.equal(harness.calls.setTombstone.length, 0);
    releaseRestoreAppend();
    await Promise.all([restorePromise, tombstonePromise]);

    assert.equal(restoreRes.statusCode, 200);
    assert.equal(tombstoneRes.statusCode, 200);
    assert.deepEqual(harness.calls.appendRevision.map((payload) => payload.action), ["restore", "tombstone"]);
  });
});

test("hardPurgePage requires wiki:hard-purge, only purges complete tombstones, and invalidates caches", async () => {
  const harness = createHarness();

  await loadActions(harness, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(harness.calls.canHardPurge, [{ cid: 7, uid: 9 }]);
    assert.deepEqual(harness.calls.getTombstone, [{ tid: 42 }]);
    assert.deepEqual(harness.calls.getRevisionRecord, [{ tid: 42, revisionId: "rev-tombstone" }]);
    assert.deepEqual(harness.calls.beginRevisionPurge, [{
      tid: 42,
      context: { uid: 9, cid: 7, tombstoneRevisionId: "rev-tombstone" }
    }]);
    assert.deepEqual(harness.calls.getTombstoneIfRevision, [
      { tid: 42, revisionId: "rev-tombstone" },
      { tid: 42, revisionId: "rev-tombstone" }
    ]);
    assert.deepEqual(harness.calls.purgeRevisions, [{ tid: 42 }]);
    assert.deepEqual(harness.calls.hardPurgeCheckedTombstone, [{
      tid: 42,
      uid: 9,
      tombstone: { tombstoned: true, at: 123, uid: 9, revisionId: "rev-tombstone", reason: "stale" }
    }]);
    assert.deepEqual(harness.calls.markRevisionPurgeTopicPurged, [{ tid: 42 }]);
    assert.deepEqual(harness.calls.hardPurgeTombstoneIfRevision, []);
    assert.deepEqual(harness.calls.clearRevisionPurge, [{ tid: 42 }]);
    assert.deepEqual(harness.calls.hardPurgeTombstone, []);
    assert.deepEqual(harness.calls.invalidateNamespace, [{ cid: 7 }]);
    assert.deepEqual(harness.calls.invalidateWikiTreeIndex, [{ reason: "wiki-page-hard-purged" }]);
  });

  const notTombstoned = createHarness({ state: { tombstone: null } });
  await loadActions(notTombstoned, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(notTombstoned.calls.hardPurgeTombstone.length, 0);
    assert.equal(notTombstoned.calls.purgeRevisions.length, 0);
  });

  const incomplete = createHarness({ state: { tombstone: { tombstoned: true, revisionId: "", uid: 9, at: 1 } } });
  await loadActions(incomplete, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(incomplete.calls.hardPurgeTombstone.length, 0);
    assert.equal(incomplete.calls.purgeRevisions.length, 0);
  });

  const missingTombstoneRevision = createHarness({ state: { tombstoneRevisionRecord: null } });
  await loadActions(missingTombstoneRevision, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.payload.message, /wiki-page-tombstone-incomplete/);
    assert.deepEqual(missingTombstoneRevision.calls.getRevisionRecord, [{ tid: 42, revisionId: "rev-tombstone" }]);
    assert.equal(missingTombstoneRevision.calls.beginRevisionPurge.length, 0);
    assert.equal(missingTombstoneRevision.calls.hardPurgeCheckedTombstone.length, 0);
    assert.equal(missingTombstoneRevision.calls.purgeRevisions.length, 0);
  });

  const nonTombstoneRevision = createHarness({ state: { tombstoneRevisionRecord: { revisionId: "rev-tombstone", action: "edit" } } });
  await loadActions(nonTombstoneRevision, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.payload.message, /wiki-page-tombstone-incomplete/);
    assert.deepEqual(nonTombstoneRevision.calls.getRevisionRecord, [{ tid: 42, revisionId: "rev-tombstone" }]);
    assert.equal(nonTombstoneRevision.calls.beginRevisionPurge.length, 0);
    assert.equal(nonTombstoneRevision.calls.hardPurgeCheckedTombstone.length, 0);
    assert.equal(nonTombstoneRevision.calls.purgeRevisions.length, 0);
  });

  const missingActionRevision = createHarness({ state: { tombstoneRevisionRecord: { revisionId: "rev-tombstone" } } });
  await loadActions(missingActionRevision, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.payload.message, /wiki-page-tombstone-incomplete/);
    assert.deepEqual(missingActionRevision.calls.getRevisionRecord, [{ tid: 42, revisionId: "rev-tombstone" }]);
    assert.equal(missingActionRevision.calls.beginRevisionPurge.length, 0);
    assert.equal(missingActionRevision.calls.hardPurgeCheckedTombstone.length, 0);
    assert.equal(missingActionRevision.calls.purgeRevisions.length, 0);
  });

  const denied = createHarness({ state: { permissions: { history: true, restore: true, hardPurge: false } } });
  await loadActions(denied, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(denied.calls.hardPurgeTombstone.length, 0);
    assert.equal(denied.calls.beginRevisionPurge.length, 0);
    assert.equal(denied.calls.purgeRevisions.length, 0);
  });

  const purgeFailure = createHarness({ state: { purgeRevisionsError: new Error("revision-purge-failed") } });
  await loadActions(purgeFailure, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(purgeFailure.calls.purgeRevisions, [{ tid: 42 }]);
    assert.deepEqual(purgeFailure.calls.getTombstoneIfRevision, [
      { tid: 42, revisionId: "rev-tombstone" },
      { tid: 42, revisionId: "rev-tombstone" }
    ]);
    assert.deepEqual(purgeFailure.calls.hardPurgeCheckedTombstone, [{
      tid: 42,
      uid: 9,
      tombstone: { tombstoned: true, at: 123, uid: 9, revisionId: "rev-tombstone", reason: "stale" }
    }]);
    assert.deepEqual(purgeFailure.calls.markRevisionPurgeTopicPurged, [{ tid: 42 }]);
    assert.equal(purgeFailure.calls.hardPurgeTombstoneIfRevision.length, 0);
    assert.equal(purgeFailure.calls.hardPurgeTombstone.length, 0);
    assert.deepEqual(purgeFailure.calls.clearRevisionPurge, []);
    assert.equal(purgeFailure.state.revisionPurgeMarker.topicPurged, true);
  });

  const recovery = createHarness({
    state: {
      page: { status: "not-found" },
      revisionPurgeMarker: {
        tid: 42,
        uid: 9,
        cid: 7,
        tombstoneRevisionId: "rev-tombstone",
        topicPurged: true
      }
    }
  });
  await loadActions(recovery, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(recovery.calls.getRevisionPurge, [{ tid: 42 }]);
    assert.equal(recovery.calls.getWikiPage.length, 0);
    assert.deepEqual(recovery.calls.purgeRevisions, [{ tid: 42 }]);
    assert.deepEqual(recovery.calls.clearRevisionPurge, [{ tid: 42 }]);
    assert.deepEqual(recovery.calls.invalidateNamespace, [{ cid: 7 }]);
  });

  const recoveryWithoutTopicPurgedFlag = createHarness({
    state: {
      page: { status: "not-found" },
      revisionPurgeMarker: {
        tid: 42,
        uid: 9,
        cid: 7,
        tombstoneRevisionId: "rev-tombstone",
        topicPurged: false
      }
    }
  });
  await loadActions(recoveryWithoutTopicPurgedFlag, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(recoveryWithoutTopicPurgedFlag.calls.getRevisionPurge, [{ tid: 42 }]);
    assert.deepEqual(recoveryWithoutTopicPurgedFlag.calls.getWikiPage, [{ tid: 42, uid: 9, options: { includeTombstoned: true } }]);
    assert.deepEqual(recoveryWithoutTopicPurgedFlag.calls.purgeRevisions, [{ tid: 42 }]);
    assert.deepEqual(recoveryWithoutTopicPurgedFlag.calls.clearRevisionPurge, [{ tid: 42 }]);
    assert.deepEqual(recoveryWithoutTopicPurgedFlag.calls.invalidateNamespace, [{ cid: 7 }]);
  });

  const recoveryWithoutTopicPurgedFlagAuthorized = createHarness({
    state: {
      page: { status: "not-found" },
      revisionPurgeMarker: {
        tid: 42,
        uid: 9,
        cid: 7,
        tombstoneRevisionId: "rev-tombstone",
        topicPurged: false
      }
    }
  });
  await loadActions(recoveryWithoutTopicPurgedFlagAuthorized, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 10, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(recoveryWithoutTopicPurgedFlagAuthorized.calls.canHardPurge, [{ cid: 7, uid: 10 }]);
    assert.deepEqual(recoveryWithoutTopicPurgedFlagAuthorized.calls.purgeRevisions, [{ tid: 42 }]);
    assert.deepEqual(recoveryWithoutTopicPurgedFlagAuthorized.calls.clearRevisionPurge, [{ tid: 42 }]);
  });

  const recoveryWithoutTopicPurgedFlagDenied = createHarness({
    state: {
      page: { status: "not-found" },
      permissions: { history: true, restore: true, hardPurge: false },
      revisionPurgeMarker: {
        tid: 42,
        uid: 9,
        cid: 7,
        tombstoneRevisionId: "rev-tombstone",
        topicPurged: false
      }
    }
  });
  await loadActions(recoveryWithoutTopicPurgedFlagDenied, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 10, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(recoveryWithoutTopicPurgedFlagDenied.calls.getRevisionPurge, [{ tid: 42 }]);
    assert.deepEqual(recoveryWithoutTopicPurgedFlagDenied.calls.getWikiPage, [{ tid: 42, uid: 10, options: { includeTombstoned: true } }]);
    assert.deepEqual(recoveryWithoutTopicPurgedFlagDenied.calls.canHardPurge, [{ cid: 7, uid: 10 }]);
    assert.equal(recoveryWithoutTopicPurgedFlagDenied.calls.purgeRevisions.length, 0);
    assert.equal(recoveryWithoutTopicPurgedFlagDenied.calls.clearRevisionPurge.length, 0);
  });

  const recoveryAuthorized = createHarness({
    state: {
      page: { status: "not-found" },
      revisionPurgeMarker: {
        tid: 42,
        uid: 9,
        cid: 7,
        tombstoneRevisionId: "rev-tombstone",
        topicPurged: true
      }
    }
  });
  await loadActions(recoveryAuthorized, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 10, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(recoveryAuthorized.calls.getRevisionPurge, [{ tid: 42 }]);
    assert.deepEqual(recoveryAuthorized.calls.canHardPurge, [{ cid: 7, uid: 10 }]);
    assert.deepEqual(recoveryAuthorized.calls.purgeRevisions, [{ tid: 42 }]);
    assert.deepEqual(recoveryAuthorized.calls.clearRevisionPurge, [{ tid: 42 }]);
  });

  const recoveryDenied = createHarness({
    state: {
      page: { status: "not-found" },
      permissions: { history: true, restore: true, hardPurge: false },
      revisionPurgeMarker: {
        tid: 42,
        uid: 9,
        cid: 7,
        tombstoneRevisionId: "rev-tombstone",
        topicPurged: true
      }
    }
  });
  await loadActions(recoveryDenied, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 10, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(recoveryDenied.calls.getRevisionPurge, [{ tid: 42 }]);
    assert.deepEqual(recoveryDenied.calls.canHardPurge, [{ cid: 7, uid: 10 }]);
    assert.equal(recoveryDenied.calls.purgeRevisions.length, 0);
    assert.equal(recoveryDenied.calls.clearRevisionPurge.length, 0);
  });

  const topicPurgeFailure = createHarness({
    state: {
      hardPurgeCheckedTombstoneError: new Error("topic-purge-failed")
    }
  });
  await loadActions(topicPurgeFailure, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 500);
    assert.match(res.payload.message, /topic-purge-failed/);
    assert.deepEqual(topicPurgeFailure.calls.hardPurgeCheckedTombstone, [{
      tid: 42,
      uid: 9,
      tombstone: { tombstoned: true, at: 123, uid: 9, revisionId: "rev-tombstone", reason: "stale" }
    }]);
    assert.equal(topicPurgeFailure.calls.purgeRevisions.length, 0);
    assert.deepEqual(topicPurgeFailure.calls.clearRevisionPurge, []);
    assert.equal(topicPurgeFailure.state.revisionPurgeMarker.active, true);
  });

  const topicPurgeFailureRecovery = createHarness({
    state: {
      page: { status: "not-found" },
      revisionPurgeMarker: {
        tid: 42,
        uid: 9,
        cid: 7,
        tombstoneRevisionId: "rev-tombstone",
        topicPurged: false
      }
    }
  });
  await loadActions(topicPurgeFailureRecovery, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(topicPurgeFailureRecovery.calls.purgeRevisions, [{ tid: 42 }]);
    assert.deepEqual(topicPurgeFailureRecovery.calls.clearRevisionPurge, [{ tid: 42 }]);
  });

  const staleBeforeRevisionPurge = createHarness({ state: { tombstoneIfRevision: null } });
  await loadActions(staleBeforeRevisionPurge, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.payload.message, /wiki-page-tombstone-stale/);
    assert.deepEqual(staleBeforeRevisionPurge.calls.getTombstone, [{ tid: 42 }]);
    assert.deepEqual(staleBeforeRevisionPurge.calls.getTombstoneIfRevision, [{ tid: 42, revisionId: "rev-tombstone" }]);
    assert.deepEqual(staleBeforeRevisionPurge.calls.beginRevisionPurge, [{
      tid: 42,
      context: { uid: 9, cid: 7, tombstoneRevisionId: "rev-tombstone" }
    }]);
    assert.deepEqual(staleBeforeRevisionPurge.calls.clearRevisionPurge, [{ tid: 42 }]);
    assert.equal(staleBeforeRevisionPurge.calls.purgeRevisions.length, 0);
    assert.equal(staleBeforeRevisionPurge.calls.hardPurgeTombstoneIfRevision.length, 0);
  });

  const staleBeforeTopicPurge = createHarness({
    state: {
      tombstoneIfRevisionSequence: [
        { tombstoned: true, at: 123, uid: 9, revisionId: "rev-tombstone", reason: "stale" },
        null
      ]
    }
  });
  await loadActions(staleBeforeTopicPurge, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.payload.message, /wiki-page-tombstone-stale/);
    assert.deepEqual(staleBeforeTopicPurge.calls.getTombstoneIfRevision, [
      { tid: 42, revisionId: "rev-tombstone" },
      { tid: 42, revisionId: "rev-tombstone" }
    ]);
    assert.equal(staleBeforeTopicPurge.calls.purgeRevisions.length, 0);
    assert.equal(staleBeforeTopicPurge.calls.hardPurgeTombstoneIfRevision.length, 0);
    assert.equal(staleBeforeTopicPurge.calls.hardPurgeTombstone.length, 0);
    assert.deepEqual(staleBeforeTopicPurge.calls.clearRevisionPurge, [{ tid: 42 }]);
  });

  const staleCompareAfterRevisionPurge = createHarness({
    state: {
      hardPurgeTombstoneIfRevisionError: new Error("wiki-page-tombstone-stale")
    }
  });
  await loadActions(staleCompareAfterRevisionPurge, async (actions) => {
    const res = {};
    await actions.hardPurgePage({ uid: 9, body: { tid: "42" } }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(staleCompareAfterRevisionPurge.calls.purgeRevisions, [{ tid: 42 }]);
    assert.deepEqual(staleCompareAfterRevisionPurge.calls.hardPurgeCheckedTombstone, [{
      tid: 42,
      uid: 9,
      tombstone: { tombstoned: true, at: 123, uid: 9, revisionId: "rev-tombstone", reason: "stale" }
    }]);
    assert.equal(staleCompareAfterRevisionPurge.calls.hardPurgeTombstoneIfRevision.length, 0);
  });
});

test("registers revision API routes with ensureLoggedIn middleware", async () => {
  const routes = [];
  const ensureLoggedIn = function ensureLoggedIn() {};
  const checkRequired = function checkRequired() {};
  const harness = createHarness({
    project: {
      "routes/wiki.js": { register: () => {} },
      "lib/cache-service.js": {},
      "lib/config.js": { ensureDefaults: async () => {}, getSettings: async () => ({}) },
      "lib/controllers/admin.js": {},
      "lib/controllers/wiki-archive-admin.js": {},
      "lib/serializer.js": {},
      "lib/topic-service.js": {},
      "lib/wiki-link-autocomplete.js": {},
      "lib/wiki-search-service.js": {},
      "lib/wiki-user-autocomplete.js": {},
      "lib/wiki-links.js": {},
      "lib/wiki-footnotes.js": {},
      "lib/wiki-html-parse.js": {},
      "lib/wiki-discussion-placeholder.js": {},
      "lib/wiki-user-mentions.js": {},
      "lib/wiki-mention-notifications.js": {},
      "lib/wiki-topdata-bot-privileges.js": {},
      "lib/wiki-revision-permissions.js": {},
      "lib/wiki-revisions.js": {},
      "lib/wiki-service.js": {},
      "lib/wiki-page-validation.js": {},
      "lib/wiki-topic-purge.js": {},
      "lib/filter-categories-forum.js": {},
      "lib/filter-forum-feeds.js": {},
      "lib/filter-forum-search.js": {},
      "lib/forum-exclusion-service.js": { removeWikiTopicsFromRecentSet: async () => {} },
      "lib/wiki-namespace-search.js": {},
      "lib/wiki-homepage.js": {},
      "lib/wiki-page-toc.js": {},
      "lib/controllers/wiki-namespace-create.js": {},
      "lib/controllers/wiki-directory.js": {},
      "lib/wiki-page-actions.js": {},
      "lib/wiki-edit-locks.js": {},
      "lib/wiki-article-watch.js": {},
      "lib/wiki-discussion-settings.js": {},
      "lib/wiki-article-css.js": {}
    }
  });
  harness.stubs.nodebb["./src/routes/helpers"] = {
    setupAdminPageRoute: () => {},
    setupApiRoute(router, method, routePath, middleware, handler) {
      routes.push({ method, routePath, middleware, handler });
    }
  };

  await withStubs(harness.stubs, async () => {
    clearProjectModule("library.js");
    const plugin = require("../library");
    await plugin.registerApiRoutes({
      router: {},
      middleware: { ensureLoggedIn, checkRequired }
    });
    clearProjectModule("library.js");
  });

  const expected = [
    ["get", "/westgate-wiki/revisions/:tid"],
    ["get", "/westgate-wiki/revisions/:tid/:revisionId"],
    ["get", "/westgate-wiki/revisions/:tid/:fromRevisionId/:toRevisionId/diff"],
    ["put", "/westgate-wiki/revisions/:tid/:revisionId/restore"],
    ["put", "/westgate-wiki/page/tombstone"],
    ["delete", "/westgate-wiki/page/hard-purge"]
  ];

  for (const [method, routePath] of expected) {
    const route = routes.find((row) => row.method === method && row.routePath === routePath);
    assert.ok(route, `${method.toUpperCase()} ${routePath} should be registered`);
    assert.deepEqual(route.middleware, [ensureLoggedIn]);
    assert.equal(typeof route.handler, "function");
  }
});
