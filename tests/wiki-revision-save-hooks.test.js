"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const originalMainRequire = require.main.require.bind(require.main);

function clearProjectModule(relativePath) {
  const modulePath = path.join(root, relativePath);
  delete require.cache[require.resolve(modulePath)];
}

function patchProjectModule(relativePath, exports, patches) {
  const modulePath = path.join(root, relativePath);
  const filename = require.resolve(modulePath);
  patches.push([filename, require.cache[filename]]);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports
  };
}

async function withNodebbStubs(stubs, fn) {
  const previousMainRequire = require.main.require;
  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };

  try {
    return await fn();
  } finally {
    require.main.require = previousMainRequire;
  }
}

function createNodebbStubs(state) {
  return {
    nconf: { get: () => "" },
    "./src/categories": {
      buildForSelectAll: async () => [],
      getCategoryData: async () => null,
      getChildrenCids: async () => []
    },
    "./src/controllers/api": {},
    "./src/controllers/helpers": {
      formatApiResponse(status, res, payload) {
        res.statusCode = status;
        res.payload = payload;
        return payload;
      }
    },
    "./src/database": {
      getObject: async () => ({}),
      getObjectField: async () => null,
      getSortedSetRange: async () => [],
      getSortedSetRevRange: async () => []
    },
    "./src/groups": { getNonPrivilegeGroups: async () => [] },
    "./src/meta": { settings: { get: async () => ({}), set: async () => {}, setOnEmpty: async () => {} } },
    "./src/middleware": { ensureLoggedIn: function ensureLoggedIn() {}, checkRequired: function checkRequired() {} },
    "./src/note": {},
    "./src/notifications": {},
    "./src/plugins": { hooks: { on: () => {} } },
    "./src/posts": {
      getPostFields: async (pid) => state.posts.get(parseInt(pid, 10)) || null
    },
    "./src/privileges": { categories: {}, topics: {}, posts: {} },
    "./src/routes/helpers": {
      setupAdminPageRoute: () => {},
      setupApiRoute: () => {},
      setupPageRoute: () => {}
    },
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/topics": {
      getTopicData: async (tid) => state.topics.get(parseInt(tid, 10)) || null
    },
    "./src/user": { isAdministrator: async () => false },
    "./src/utils": { isNumber: () => true }
  };
}

async function loadPlugin(state, revisionCalls, options = {}) {
  const patches = [];
  patchProjectModule("lib/config.js", {
    ensureDefaults: async () => {},
    getSettings: async () => ({ effectiveCategoryIds: [10] })
  }, patches);
  patchProjectModule("lib/wiki-revisions.js", {
    hasRevisions: async (tid) => {
      const existingRevisionTids = options.existingRevisionTids || new Set();
      return existingRevisionTids.has(parseInt(tid, 10));
    },
    appendRevision: async (payload) => {
      revisionCalls.push(payload);
      return { revisionId: `rev-${revisionCalls.length}` };
    }
  }, patches);

  try {
    clearProjectModule("library.js");
    const plugin = require("../library");
    return { plugin, patches };
  } catch (err) {
    patches.reverse().forEach(([filename, previous]) => {
      if (previous) {
        require.cache[filename] = previous;
      } else {
        delete require.cache[filename];
      }
    });
    throw err;
  }
}

function restorePlugin(patches) {
  clearProjectModule("library.js");
  patches.reverse().forEach(([filename, previous]) => {
    if (previous) {
      require.cache[filename] = previous;
    } else {
      delete require.cache[filename];
    }
  });
}

test("records a create revision for wiki topic main posts", async () => {
  const state = {
    topics: new Map([[77, {
      tid: 77,
      cid: 10,
      mainPid: 770,
      title: "New Wiki Page",
      titleRaw: "New Wiki Page",
      slug: "77/new-wiki-page"
    }]]),
    posts: new Map([[770, {
      pid: 770,
      tid: 77,
      content: "<p>Stored body</p>",
      sourceContent: "<p>Stored source</p>"
    }]])
  };
  const revisionCalls = [];

  await withNodebbStubs(createNodebbStubs(state), async () => {
    const { plugin, patches } = await loadPlugin(state, revisionCalls);
    try {
      await plugin.recordWikiCreateRevision({
        uid: 12,
        topic: { tid: 77, cid: 10, mainPid: 770, title: "New Wiki Page", slug: "77/new-wiki-page" },
        post: { pid: 770, tid: 77, sourceContent: "<p>Stored source</p>" }
      });
    } finally {
      restorePlugin(patches);
    }
  });

  assert.deepEqual(revisionCalls, [{
    tid: 77,
    pid: 770,
    cid: 10,
    uid: 12,
    action: "create",
    title: "New Wiki Page",
    oldSource: "",
    newSource: "<p>Stored source</p>",
    canonicalPath: "",
    wikiPath: ""
  }]);
});

test("wires the create revision hook to action:topic.post", () => {
  const pluginJson = JSON.parse(fs.readFileSync(path.join(root, "plugin.json"), "utf8"));
  assert.ok(
    pluginJson.hooks.some((hook) => (
      hook.hook === "action:topic.post" &&
      hook.method === "recordWikiCreateRevision"
    )),
    "plugin.json should register the wiki create revision hook"
  );
});

test("skips create revisions when the main post source is unavailable", async () => {
  const state = {
    topics: new Map([[77, {
      tid: 77,
      cid: 10,
      mainPid: 770,
      title: "Empty Wiki Page",
      titleRaw: "Empty Wiki Page",
      slug: "77/empty-wiki-page"
    }]]),
    posts: new Map([[770, {
      pid: 770,
      tid: 77,
      content: "",
      sourceContent: ""
    }]])
  };
  const revisionCalls = [];

  await withNodebbStubs(createNodebbStubs(state), async () => {
    const { plugin, patches } = await loadPlugin(state, revisionCalls);
    try {
      await plugin.recordWikiCreateRevision({
        uid: 12,
        topic: { tid: 77, cid: 10, mainPid: 770, title: "Empty Wiki Page", slug: "77/empty-wiki-page" },
        post: { pid: 770, tid: 77 }
      });
    } finally {
      restorePlugin(patches);
    }
  });

  assert.equal(revisionCalls.length, 0);
});

test("skips create revisions when the topic already has revisions", async () => {
  const state = {
    topics: new Map([[77, {
      tid: 77,
      cid: 10,
      mainPid: 770,
      title: "Existing Wiki Page",
      titleRaw: "Existing Wiki Page",
      slug: "77/existing-wiki-page"
    }]]),
    posts: new Map([[770, {
      pid: 770,
      tid: 77,
      sourceContent: "<p>Stored source</p>"
    }]])
  };
  const revisionCalls = [];

  await withNodebbStubs(createNodebbStubs(state), async () => {
    const { plugin, patches } = await loadPlugin(state, revisionCalls, {
      existingRevisionTids: new Set([77])
    });
    try {
      await plugin.recordWikiCreateRevision({
        uid: 12,
        topic: { tid: 77, cid: 10, mainPid: 770, title: "Existing Wiki Page", slug: "77/existing-wiki-page" },
        post: { pid: 770, tid: 77, sourceContent: "<p>Stored source</p>" }
      });
    } finally {
      restorePlugin(patches);
    }
  });

  assert.equal(revisionCalls.length, 0);
});

test("skips create revisions for non-wiki topics and replies", async () => {
  const state = {
    topics: new Map([
      [77, { tid: 77, cid: 10, mainPid: 770, title: "Wiki Page", slug: "77/wiki-page" }],
      [88, { tid: 88, cid: 99, mainPid: 880, title: "Forum Topic", slug: "88/forum-topic" }]
    ]),
    posts: new Map([
      [770, { pid: 770, tid: 77, sourceContent: "<p>Wiki Page</p>" }],
      [771, { pid: 771, tid: 77, sourceContent: "<p>Reply</p>" }],
      [880, { pid: 880, tid: 88, sourceContent: "<p>Forum Topic</p>" }]
    ])
  };
  const revisionCalls = [];

  await withNodebbStubs(createNodebbStubs(state), async () => {
    const { plugin, patches } = await loadPlugin(state, revisionCalls);
    try {
      await plugin.recordWikiCreateRevision({
        uid: 12,
        topic: { tid: 88, cid: 99, mainPid: 880, title: "Forum Topic", slug: "88/forum-topic" },
        post: { pid: 880, tid: 88, sourceContent: "<p>Forum Topic</p>" }
      });
      await plugin.recordWikiCreateRevision({
        uid: 12,
        topic: { tid: 77, cid: 10, mainPid: 770, title: "Wiki Page", slug: "77/wiki-page" },
        post: { pid: 771, tid: 77, sourceContent: "<p>Reply</p>" }
      });
    } finally {
      restorePlugin(patches);
    }
  });

  assert.equal(revisionCalls.length, 0);
});
