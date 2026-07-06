"use strict";

const assert = require("assert");

const actions = require("../lib/pages/wiki-page-actions");

assert.strictEqual(
  actions.buildSubpageDraftTitle(["Mechanics", "Feats"], "Fallback"),
  "Mechanics :: Feats :: Subpage",
  "nested pages should append the dummy subpage leaf to the full title path"
);

assert.strictEqual(
  actions.buildSubpageDraftTitle([], "Single Page"),
  "Single Page :: Subpage",
  "single pages should append the dummy subpage leaf to the page title"
);

assert.deepStrictEqual(
  actions.normalizeMovePayload({
    cid: "42",
    title: " New Leaf ",
    parentTitle: " Mechanics :: Feats "
  }),
  {
    cid: 42,
    title: "Mechanics :: Feats :: New Leaf",
    parentTitle: "Mechanics :: Feats",
    titleLeaf: "New Leaf"
  },
  "move payload should combine parent title and leaf title"
);

assert.deepStrictEqual(
  actions.normalizeMovePayload({
    cid: 42,
    title: "Mechanics :: Feats :: Epic Prowess",
    parentTitle: ""
  }),
  {
    cid: 42,
    title: "Mechanics :: Feats :: Epic Prowess",
    parentTitle: "",
    titleLeaf: "Epic Prowess"
  },
  "move payload should preserve a full explicit title when no parent is supplied"
);

assert.deepStrictEqual(
  actions.getGeneratedPageValidationOptions({
    getTopdataWikiPageSlug() {
      return "";
    }
  }, "<!-- sow-topdata-wiki:page=spells:pdk:fear wiki_slug=pdk-fear -->", {
    westgateWikiPageSlug: "stored-fear"
  }, 42),
  {
    omitTid: 42,
    pageSlug: ""
  },
  "save validation should not use retired generated wiki_slug markers as public path authority"
);

assert.deepStrictEqual(
  actions.getGeneratedPageValidationOptions({
    getTopdataWikiPageSlug() {
      return "";
    }
  }, null, {
    westgateWikiPageSlug: "spectre-shadow-attack"
  }, 43),
  {
    omitTid: 43,
    pageSlug: ""
  },
  "move validation should not retain persisted generated page slug routing state"
);

assert.strictEqual(
  typeof actions.saveWikiPage,
  "function",
  "wiki page save action should be exported"
);

(async () => {
  const originalMainRequire = require.main.require.bind(require.main);
  const events = [];
  const revisionCalls = [];
  const baselineCalls = [];
  const preflightCalls = [];
  let storedPostFields = { content: "<p>Old</p>", sourceContent: "<p>Old Source</p>" };
  let postData = { content: "<p>Move Source</p>", sourceContent: "<p>Move Source</p>" };
  const movedPayloads = [];
  let appendError = null;
  let storageCannotBeRepaired = false;
  let canonicalPathImpl = (topic, options) => (
    options && parseInt(options.uid, 10) === 9 ? "" : "Hidden_Root/Readable_Child/Hidden_Page"
  );
  let topicData = {
    tid: 70,
    cid: 71,
    mainPid: 700,
    title: "Hidden Page",
    titleRaw: "Hidden Page",
    slug: "70/hidden-page"
  };
  let wikiPageTopic = {
    tid: 70,
    cid: 71,
    mainPid: 700,
    title: "Hidden Page",
    titleRaw: "Hidden Page"
  };
  require.main.require = function requireNodebbStub(id) {
    const postsStub = {
      edit: async (payload) => {
        events.push(`post.edit:${payload.pid}:${payload.title}:${payload.content}`);
        if (!storageCannotBeRepaired) {
          storedPostFields = {
            content: payload.content,
            sourceContent: payload.sourceContent
          };
          postData = {
            content: payload.content,
            sourceContent: payload.sourceContent
          };
        }
        topicData = {
          ...topicData,
          title: payload.title,
          titleRaw: payload.title
        };
        wikiPageTopic = {
          ...wikiPageTopic,
          title: payload.title,
          titleRaw: payload.title
        };
      },
      getPostData: async () => postData,
      getPostFields: async () => storedPostFields,
      clearCachedPost: () => {}
    };
    if (!storageCannotBeRepaired) {
      postsStub.setPostFields = async (pid, fields) => {
        events.push(`post.setFields:${pid}:${fields.content}`);
        storedPostFields = { ...storedPostFields, ...fields };
      };
    }
    const stubs = {
      "./src/controllers/helpers": {
        formatApiResponse: (status, res, payload) => {
          res.statusCode = status;
          res.payload = payload;
          return payload;
        }
      },
      "./src/posts": postsStub,
      "./src/privileges": {
        categories: {
          get: async () => ({ read: true, "topics:read": true, "topics:create": true })
        }
      },
      "./src/topics": {
        getTopicData: async () => topicData,
        tools: {
          move: async (tid, payload) => {
            events.push(`topic.move:${tid}:${payload.cid}`);
            movedPayloads.push({ tid, payload });
            topicData = { ...topicData, cid: payload.cid };
            wikiPageTopic = { ...wikiPageTopic, cid: payload.cid };
          }
        }
      }
    };
    return stubs[id] || originalMainRequire(id);
  };

  const patchedModules = [];
  function patchModule(request, exports) {
    const filename = require.resolve(request);
    patchedModules.push([filename, require.cache[filename]]);
    require.cache[filename] = {
      id: filename,
      filename,
      loaded: true,
      exports
    };
  }

  patchModule("../lib/read/topic-service", {
    getWikiPage: async () => ({
      status: "ok",
      canEditWikiPage: true,
      topic: wikiPageTopic
    })
  });
  patchModule("../lib/tree/wiki-directory-service", {
    invalidateNamespace: () => {}
  });
  patchModule("../lib/pages/wiki-edit-locks", {
    assertSaveLock: async () => ({ status: "ok" }),
    getStatusMessage: () => "locked"
  });
  patchModule("../lib/pages/wiki-page-validation", {
    getValidationMessage: () => "",
    isBlockingResult: () => false,
    sanitizeAndValidateWikiMainBody: (content) => content
  });
  patchModule("../lib/tree/wiki-paths", {
    getCanonicalPagePath: async (topic, options) => canonicalPathImpl(topic, options),
    getNamespaceEntry: async () => ({ status: "ok" }),
    invalidateWikiTreeIndex: () => {},
    validateCanonicalPagePlacement: async () => ({ status: "ok" })
  });
  patchModule("../lib/pages/wiki-revisions", {
    assertCanAppendRevision: async (payload) => {
      events.push(`revision.preflight:${payload.action}:${payload.title}`);
      preflightCalls.push(payload);
      return true;
    },
    appendRevision: async (payload) => {
      events.push(`revision.append:${payload.action}:${payload.title}`);
      if (appendError) {
        throw appendError;
      }
      revisionCalls.push(payload);
      return { revisionId: `rev-${revisionCalls.length}` };
    },
    ensureRevisionBaseline: async (payload) => {
      events.push(`revision.baseline:${payload.title}`);
      baselineCalls.push(payload);
      return { revisionId: `baseline-${baselineCalls.length}` };
    }
  });

  try {
    const res = {};
    await actions.saveWikiPage({
      uid: 9,
      body: {
        tid: 70,
        pid: 700,
        title: "Hidden Page",
        content: "<p>Saved</p>",
        wikiEditLockToken: "token"
      },
      query: {}
    }, res);

    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(
      events.slice(0, 4),
      [
        "revision.baseline:Hidden Page",
        "revision.preflight:edit:Hidden Page",
        "post.edit:700:Hidden Page:<p>Saved</p>",
        "revision.append:edit:Hidden Page"
      ],
      "save should repair the baseline and preflight the edit before mutating the post"
    );
    assert.deepStrictEqual(
      baselineCalls[0],
      {
        tid: 70,
        pid: 700,
        cid: 71,
        uid: 9,
        title: "Hidden Page",
        source: "<p>Old Source</p>",
        canonicalPath: "",
        wikiPath: ""
      },
      "first save on a no-journal page should seed a repair checkpoint from the old source"
    );
    assert.strictEqual(preflightCalls.length, 1, "save should preflight the actual edit revision");
    assert.strictEqual(
      res.payload.wikiPath,
      "",
      "save response should not emit a canonical wikiPath hidden from the request user"
    );
    assert.deepStrictEqual(
      revisionCalls[0],
      {
        tid: 70,
        pid: 700,
        cid: 71,
        uid: 9,
        action: "edit",
        title: "Hidden Page",
        oldSource: "<p>Old Source</p>",
        newSource: "<p>Saved</p>",
        canonicalPath: "",
        wikiPath: ""
      },
      "successful wiki page saves should append an edit revision from previous source to sanitized source"
    );

    events.length = 0;
    revisionCalls.length = 0;
    baselineCalls.length = 0;
    preflightCalls.length = 0;
    storedPostFields = { content: "<p>Old Title Source</p>", sourceContent: "<p>Old Title Source</p>" };
    postData = { content: "<p>Old Title Source</p>", sourceContent: "<p>Old Title Source</p>" };
    wikiPageTopic = {
      tid: 70,
      cid: 71,
      mainPid: 700,
      title: "Old Title",
      titleRaw: "Old Title"
    };
    topicData = {
      tid: 70,
      cid: 71,
      mainPid: 700,
      title: "Old Title",
      titleRaw: "Old Title",
      slug: "70/old-title"
    };
    canonicalPathImpl = (topic) => `Lore/${String(topic && (topic.titleRaw || topic.title) || "").replace(/\s+/g, "_")}`;

    const titleChangeRes = {};
    await actions.saveWikiPage({
      uid: 5,
      body: {
        tid: 70,
        pid: 700,
        title: "New Title",
        content: "<p>New Title Source</p>",
        wikiEditLockToken: "token"
      },
      query: {}
    }, titleChangeRes);

    assert.strictEqual(titleChangeRes.statusCode, 200);
    assert.strictEqual(
      preflightCalls[0].canonicalPath,
      "Lore/Old_Title",
      "save preflight may use pre-save path metadata because it only validates source/hash lineage"
    );
    assert.deepStrictEqual(
      {
        canonicalPath: revisionCalls[0].canonicalPath,
        wikiPath: revisionCalls[0].wikiPath
      },
      {
        canonicalPath: "Lore/New_Title",
        wikiPath: "/wiki/Lore/New_Title"
      },
      "save that changes title should append the edit revision with post-save path metadata"
    );
    assert.strictEqual(
      titleChangeRes.payload.wikiPath,
      "/wiki/Lore/New_Title",
      "save response should match the path metadata recorded on the appended edit revision"
    );
    canonicalPathImpl = (topic, options) => (
      options && parseInt(options.uid, 10) === 9 ? "" : "Hidden_Root/Readable_Child/Hidden_Page"
    );

    events.length = 0;
    revisionCalls.length = 0;
    baselineCalls.length = 0;
    preflightCalls.length = 0;
    appendError = new Error("append failed");
    storedPostFields = { content: "<p>Rollback Old</p>", sourceContent: "<p>Rollback Old</p>" };
    postData = { content: "<p>Rollback Old</p>", sourceContent: "<p>Rollback Old</p>" };
    wikiPageTopic = {
      tid: 70,
      cid: 71,
      mainPid: 700,
      title: "Hidden Page",
      titleRaw: "Hidden Page"
    };
    topicData = {
      tid: 70,
      cid: 71,
      mainPid: 700,
      title: "Hidden Page",
      titleRaw: "Hidden Page",
      slug: "70/hidden-page"
    };

    const appendFailRes = {};
    await actions.saveWikiPage({
      uid: 9,
      body: {
        tid: 70,
        pid: 700,
        title: "Hidden Page",
        content: "<p>Attempted</p>",
        wikiEditLockToken: "token"
      },
      query: {}
    }, appendFailRes);

    assert.strictEqual(appendFailRes.statusCode, 500);
    assert.deepStrictEqual(storedPostFields, {
      content: "<p>Rollback Old</p>",
      sourceContent: "<p>Rollback Old</p>"
    });
    assert.deepStrictEqual(
      events,
      [
        "revision.baseline:Hidden Page",
        "revision.preflight:edit:Hidden Page",
        "post.edit:700:Hidden Page:<p>Attempted</p>",
        "revision.append:edit:Hidden Page",
        "post.edit:700:Hidden Page:<p>Rollback Old</p>"
      ],
      "save should roll the post back when revision append fails"
    );
    appendError = null;

    events.length = 0;
    revisionCalls.length = 0;
    baselineCalls.length = 0;
    preflightCalls.length = 0;
    storageCannotBeRepaired = true;
    storedPostFields = { content: "<p>Verify Old</p>", sourceContent: "<p>Verify Old</p>" };
    postData = { content: "<p>Verify Old</p>", sourceContent: "<p>Verify Old</p>" };

    const originalStoredPostFields = storedPostFields;
    const storageFailRes = {};
    await actions.saveWikiPage({
      uid: 9,
      body: {
        tid: 70,
        pid: 700,
        title: "Hidden Page",
        content: "<p>Unverified</p>",
        wikiEditLockToken: "token"
      },
      query: {}
    }, storageFailRes);

    assert.strictEqual(storageFailRes.statusCode, 500);
    assert.match(storageFailRes.payload.message, /wiki-save-storage-unverified/);
    assert.deepStrictEqual(storedPostFields, originalStoredPostFields);
    assert.strictEqual(revisionCalls.length, 0, "unverified storage should not append a success revision");
    storageCannotBeRepaired = false;

    revisionCalls.length = 0;
    baselineCalls.length = 0;
    preflightCalls.length = 0;
    events.length = 0;
    movedPayloads.length = 0;
    storedPostFields = { content: "<p>Move Source</p>", sourceContent: "<p>Move Source</p>" };
    postData = { content: "<p>Move Source</p>", sourceContent: "<p>Move Source</p>" };
    wikiPageTopic = {
      tid: 70,
      cid: 71,
      mainPid: 700,
      title: "Hidden Page",
      titleRaw: "Hidden Page"
    };
    topicData = {
      tid: 70,
      cid: 72,
      mainPid: 700,
      title: "Renamed Page",
      titleRaw: "Renamed Page",
      slug: "70/renamed-page"
    };

    const moveRes = {};
    await actions.moveWikiPage({
      uid: 5,
      body: {
        tid: 70,
        cid: 72,
        title: "Renamed Page"
      }
    }, moveRes);

    assert.strictEqual(moveRes.statusCode, 200, String(moveRes.payload && moveRes.payload.stack || moveRes.payload));
    assert.deepStrictEqual(
      events,
      [
        "revision.baseline:Hidden Page",
        "revision.preflight:move:Renamed Page",
        "topic.move:70:72",
        "post.edit:700:Renamed Page:<p>Move Source</p>",
        "revision.append:move:Renamed Page"
      ],
      "move should repair the baseline and preflight the move before mutating topic state"
    );
    assert.strictEqual(movedPayloads.length, 1, "category changes should move the topic before revision append");
    assert.deepStrictEqual(
      baselineCalls[0],
      {
        tid: 70,
        pid: 700,
        cid: 71,
        uid: 5,
        title: "Hidden Page",
        source: "<p>Move Source</p>",
        canonicalPath: "Hidden_Root/Readable_Child/Hidden_Page",
        wikiPath: "/wiki/Hidden_Root/Readable_Child/Hidden_Page"
      },
      "first move on a no-journal page should seed a repair checkpoint from the old source and path"
    );
    assert.deepStrictEqual(
      revisionCalls[0],
      {
        tid: 70,
        pid: 700,
        cid: 72,
        uid: 5,
        action: "move",
        title: "Renamed Page",
        oldSource: "<p>Move Source</p>",
        newSource: "<p>Move Source</p>",
        canonicalPath: "Hidden_Root/Readable_Child/Hidden_Page",
        wikiPath: "/wiki/Hidden_Root/Readable_Child/Hidden_Page"
      },
      "wiki page moves should append a move revision with unchanged source"
    );

    revisionCalls.length = 0;
    baselineCalls.length = 0;
    preflightCalls.length = 0;
    events.length = 0;
    movedPayloads.length = 0;
    appendError = new Error("move append failed");
    storedPostFields = { content: "<p>Move Rollback</p>", sourceContent: "<p>Move Rollback</p>" };
    postData = { content: "<p>Move Rollback</p>", sourceContent: "<p>Move Rollback</p>" };
    wikiPageTopic = {
      tid: 70,
      cid: 71,
      mainPid: 700,
      title: "Hidden Page",
      titleRaw: "Hidden Page"
    };
    topicData = {
      tid: 70,
      cid: 71,
      mainPid: 700,
      title: "Hidden Page",
      titleRaw: "Hidden Page",
      slug: "70/hidden-page"
    };

    const moveAppendFailRes = {};
    await actions.moveWikiPage({
      uid: 5,
      body: {
        tid: 70,
        cid: 72,
        title: "Renamed Page"
      }
    }, moveAppendFailRes);

    assert.strictEqual(moveAppendFailRes.statusCode, 500);
    assert.deepStrictEqual(storedPostFields, {
      content: "<p>Move Rollback</p>",
      sourceContent: "<p>Move Rollback</p>"
    });
    assert.strictEqual(topicData.cid, 71);
    assert.strictEqual(topicData.title, "Hidden Page");
    assert.deepStrictEqual(
      events,
      [
        "revision.baseline:Hidden Page",
        "revision.preflight:move:Renamed Page",
        "topic.move:70:72",
        "post.edit:700:Renamed Page:<p>Move Rollback</p>",
        "revision.append:move:Renamed Page",
        "post.edit:700:Hidden Page:<p>Move Rollback</p>",
        "topic.move:70:71"
      ],
      "move should roll title and category back when revision append fails"
    );
    appendError = null;

    revisionCalls.length = 0;
    baselineCalls.length = 0;
    preflightCalls.length = 0;
    events.length = 0;
    movedPayloads.length = 0;
    wikiPageTopic = {
      tid: 70,
      cid: 72,
      mainPid: 700,
      title: "Renamed Page",
      titleRaw: "Renamed Page"
    };
    topicData = {
      tid: 70,
      cid: 72,
      mainPid: 700,
      title: "Renamed Page",
      titleRaw: "Renamed Page",
      slug: "70/renamed-page"
    };

    const noopMoveRes = {};
    await actions.moveWikiPage({
      uid: 5,
      body: {
        tid: 70,
        cid: 72,
        title: "Renamed Page"
      }
    }, noopMoveRes);

    assert.strictEqual(noopMoveRes.statusCode, 200);
    assert.strictEqual(revisionCalls.length, 0, "unchanged move payloads should not append a move revision");
  } finally {
    patchedModules.reverse().forEach(([filename, previous]) => {
      if (previous) {
        require.cache[filename] = previous;
      } else {
        delete require.cache[filename];
      }
    });
    require.main.require = originalMainRequire;
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
