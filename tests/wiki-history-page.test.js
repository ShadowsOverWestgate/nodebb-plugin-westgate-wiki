"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function clearProjectModule(relativePath) {
  const filename = require.resolve(path.join(root, relativePath));
  delete require.cache[filename];
}

async function withStubs(stubs, fn) {
  const originalMainRequire = require.main.require.bind(require.main);
  const patched = [];

  require.main.require = function requireNodebbStub(id) {
    if (Object.prototype.hasOwnProperty.call(stubs.nodebb || {}, id)) {
      return stubs.nodebb[id];
    }
    return originalMainRequire(id);
  };

  function patchProjectModule(relativePath, exports) {
    const filename = require.resolve(path.join(root, relativePath));
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
    [
      "routes/wiki.js",
      "lib/controllers/wiki-revisions.js"
    ].forEach((relativePath) => {
      try {
        clearProjectModule(relativePath);
      } catch (err) {
        if (err.code !== "MODULE_NOT_FOUND") {
          throw err;
        }
      }
    });
  }
}

function makeRouteStubs(routeCalls, ensureLoggedIn) {
  return {
    nodebb: {
      nconf: { get: () => "" },
      "./src/controllers/api": { loadConfig: async () => ({ relative_path: "", csrf_token: "", "cache-buster": "" }) },
      "./src/controllers/helpers": {
        notAllowed: () => {},
        redirect: () => {}
      },
      "./src/middleware": { ensureLoggedIn },
      "./src/routes/helpers": {
        setupPageRoute(router, routePath, middlewareOrHandler, maybeHandler) {
          const middleware = Array.isArray(middlewareOrHandler) ? middlewareOrHandler : [];
          const handler = typeof middlewareOrHandler === "function" ? middlewareOrHandler : maybeHandler;
          routeCalls.push({ routePath, middleware, handler });
        }
      },
      "./src/categories": {},
      "./src/database": {},
      "./src/groups": {},
      "./src/meta": { settings: {} },
      "./src/notifications": {},
      "./src/plugins": { hooks: { on: () => {} } },
      "./src/posts": {},
      "./src/privileges": { categories: {}, topics: {}, posts: {} },
      "./src/slugify": (value) => String(value || "").toLowerCase(),
      "./src/topics": {},
      "./src/user": {},
      "./src/utils": { isNumber: () => true, toISOString: (value) => new Date(value).toISOString() }
    },
    project: {
      "lib/core/compose-assets.js": { register: () => {} },
      "lib/controllers/compose.js": { renderCompose: () => {}, renderEdit: () => {} },
      "lib/controllers/wiki-namespace-create.js": { renderChild: () => {} },
      "lib/core/config.js": {},
      "lib/features/wiki-namespace-creators.js": {},
      "lib/tree/wiki-alphabetical-index.js": {},
      "lib/core/serializer.js": {},
      "lib/read/wiki-service.js": {},
      "lib/read/topic-service.js": {},
      "lib/read/wiki-search-service.js": {},
      "lib/tree/wiki-breadcrumb-trail.js": {},
      "lib/features/wiki-missing-page-create.js": {},
      "lib/pages/wiki-page-actions.js": {},
      "lib/tree/wiki-paths.js": {},
      "lib/pages/wiki-revision-permissions.js": {}
    }
  };
}

test("wiki history page route is registered before the catch-all and requires login", async () => {
  const ensureLoggedIn = function ensureLoggedIn() {};
  const routeCalls = [];

  await withStubs(makeRouteStubs(routeCalls, ensureLoggedIn), async () => {
    clearProjectModule("routes/wiki.js");
    const routes = require("../routes/wiki");
    routes.register({ router: {}, middleware: { ensureLoggedIn } });
  });

  const historyIndex = routeCalls.findIndex((row) => row.routePath === "/wiki/history/:tid");
  const catchAllIndex = routeCalls.findIndex((row) => row.routePath === "/wiki/:path(*)");
  assert.notEqual(historyIndex, -1, "history route should be registered");
  assert.notEqual(catchAllIndex, -1, "catch-all wiki route should be registered");
  assert.ok(historyIndex < catchAllIndex, "history route should be registered before the wiki catch-all");
  assert.deepEqual(routeCalls[historyIndex].middleware, [ensureLoggedIn]);
  assert.equal(typeof routeCalls[historyIndex].handler, "function");
});

function createControllerHarness(overrides = {}) {
  const calls = {
    canRestore: [],
    canHardPurge: [],
    canViewHistory: [],
    getWikiPage: [],
    getTombstone: [],
    getTombstoneFromFields: [],
    listRevisionSummaries: [],
    listRevisions: [],
    next: [],
    notAllowed: [],
    render: []
  };
  const state = {
    page: {
      status: "ok",
      topic: {
        tid: 42,
        cid: 7,
        mainPid: 420,
        title: "Moonlit Page",
        titleRaw: "Moonlit Page",
        slug: "42/moonlit-page",
        wikiPath: "/wiki/Lore/Moonlit_Page"
      },
      category: {
        cid: 7,
        name: "Lore",
        wikiPath: "/wiki/Lore"
      },
      pageTitlePath: ["Lore", "Moonlit Page"],
      parentPages: []
    },
    canViewHistory: true,
    canRestore: true,
    canHardPurge: true,
    tombstoneFromFields: null,
    tombstone: null,
    revisions: [
      {
        revisionId: "rev-2",
        action: "edit",
        timestamp: 2000,
        patch: "raw patch",
        checkpointSource: "<p>raw checkpoint</p>"
      },
      {
        revisionId: "rev-1",
        action: "create",
        timestamp: 1000
      }
    ],
    useSummaries: true,
    ...overrides.state
  };

  const stubs = {
    nodebb: {
      "./src/controllers/helpers": {
        notAllowed(req, res) {
          calls.notAllowed.push({ req, res });
          res.notAllowed = true;
        }
      }
    },
    project: {
      "lib/read/topic-service.js": {
        getWikiPage: async (tid, uid, options) => {
          calls.getWikiPage.push({ tid, uid, options });
          return state.page;
        }
      },
      "lib/pages/wiki-revision-permissions.js": {
        canViewHistory: async (cid, uid) => {
          calls.canViewHistory.push({ cid, uid });
          return state.canViewHistory;
        },
        canRestore: async (cid, uid) => {
          calls.canRestore.push({ cid, uid });
          return state.canRestore;
        },
        canHardPurge: async (cid, uid) => {
          calls.canHardPurge.push({ cid, uid });
          return state.canHardPurge;
        }
      },
      "lib/pages/wiki-tombstones.js": {
        getTombstoneFromFields: (fields) => {
          calls.getTombstoneFromFields.push(fields);
          return state.tombstoneFromFields;
        },
        getTombstone: async (tid) => {
          calls.getTombstone.push({ tid });
          return state.tombstone;
        }
      },
      "lib/pages/wiki-revisions.js": {
        ...(state.useSummaries ? {
          listRevisionSummaries: async (tid) => {
            calls.listRevisionSummaries.push({ tid });
            return state.revisions;
          }
        } : {}),
        listRevisions: async (tid) => {
          calls.listRevisions.push({ tid });
          return state.revisions;
        }
      },
      "lib/core/serializer.js": {
        getTitleDisplay: (titlePath, fallback) => (Array.isArray(titlePath) && titlePath.length ? titlePath.join(" / ") : fallback),
        escapeTitleHTML: (value) => String(value || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
      },
      "lib/tree/wiki-breadcrumb-trail.js": {
        forArticleView: () => ({ breadcrumbs: [{ text: "Wiki", url: "/wiki" }] })
      }
    }
  };

  async function run(params = { tid: "42" }) {
    const req = { params, query: {}, uid: 9 };
    const res = {
      render(template, data) {
        calls.render.push({ template, data });
      }
    };
    const next = (err) => calls.next.push(err || null);

    await withStubs(stubs, async () => {
      clearProjectModule("lib/controllers/wiki-revisions.js");
      const controller = require("../lib/controllers/wiki-revisions");
      await controller.renderHistory(req, res, next);
    });

    return { req, res };
  }

  return { calls, run, state };
}

test("renderHistory renders revision summaries for authorized viewers without raw revision sources", async () => {
  const harness = createControllerHarness();

  await harness.run();

  assert.deepEqual(harness.calls.getWikiPage, [
    { tid: 42, uid: 9, options: { includeTombstoned: true } }
  ]);
  assert.deepEqual(harness.calls.canViewHistory, [{ cid: 7, uid: 9 }]);
  assert.deepEqual(harness.calls.canRestore, [{ cid: 7, uid: 9 }]);
  assert.deepEqual(harness.calls.canHardPurge, []);
  assert.deepEqual(harness.calls.listRevisionSummaries, [{ tid: 42 }]);
  assert.equal(harness.calls.render.length, 1);

  const render = harness.calls.render[0];
  assert.equal(render.template, "wiki-history");
  assert.equal(render.data.topic.tid, 42);
  assert.equal(render.data.category.cid, 7);
  assert.equal(render.data.canRestoreWikiRevision, true);
  assert.equal(render.data.isWikiTombstoned, false);
  assert.equal(render.data.canHardPurgeWikiTombstone, false);
  assert.equal(render.data.hasRevisions, true);
  assert.equal(render.data.wikiPath, "/wiki/Lore/Moonlit_Page");
  assert.equal(render.data.returnPath, "/wiki/Lore/Moonlit_Page");
  assert.equal(render.data.revisions[0].revisionId, "rev-2");
  assert.equal(Object.hasOwn(render.data.revisions[0], "patch"), false);
  assert.equal(Object.hasOwn(render.data.revisions[0], "checkpointSource"), false);
});

test("renderHistory escapes titleRaw-derived page titles before rendering", async () => {
  const harness = createControllerHarness({
    state: {
      page: {
        status: "ok",
        topic: {
          tid: 42,
          cid: 7,
          mainPid: 420,
          title: "&lt;img src=x&gt;",
          titleRaw: "<img src=x onerror=alert(1)>",
          slug: "42/img",
          wikiPath: "/wiki/Lore/img"
        },
        category: { cid: 7, name: "Lore", wikiPath: "/wiki/Lore" },
        pageTitlePath: ["<img src=x onerror=alert(1)>"],
        parentPages: []
      }
    }
  });

  await harness.run();

  const render = harness.calls.render[0];
  assert.equal(render.data.pageTitle, "&lt;img src=x onerror=alert(1)&gt;");
  assert.ok(!render.data.pageTitle.includes("<"), "pageTitle must never carry raw HTML");
  assert.ok(!render.data.title.includes("<"), "browser title must never carry raw HTML");
});

test("renderHistory exposes hard purge only for tombstoned pages with hard purge permission", async () => {
  const tombstone = { tombstoned: true, at: 1234, uid: 8, revisionId: "rev-tombstone", reason: "stale" };
  const allowed = createControllerHarness({ state: { tombstoneFromFields: tombstone, canHardPurge: true } });

  await allowed.run();

  assert.deepEqual(allowed.calls.getTombstoneFromFields, [allowed.state.page.topic]);
  assert.deepEqual(allowed.calls.getTombstone, []);
  assert.deepEqual(allowed.calls.canHardPurge, [{ cid: 7, uid: 9 }]);
  assert.equal(allowed.calls.render[0].data.isWikiTombstoned, true);
  assert.equal(allowed.calls.render[0].data.canHardPurgeWikiTombstone, true);

  const denied = createControllerHarness({ state: { tombstoneFromFields: tombstone, canHardPurge: false } });
  await denied.run();
  assert.deepEqual(denied.calls.canHardPurge, [{ cid: 7, uid: 9 }]);
  assert.equal(denied.calls.render[0].data.isWikiTombstoned, true);
  assert.equal(denied.calls.render[0].data.canHardPurgeWikiTombstone, false);

  const normalPage = createControllerHarness({ state: { tombstoneFromFields: null, tombstone: null, canHardPurge: true } });
  await normalPage.run();
  assert.deepEqual(normalPage.calls.getTombstone, [{ tid: 42 }]);
  assert.deepEqual(normalPage.calls.canHardPurge, []);
  assert.equal(normalPage.calls.render[0].data.isWikiTombstoned, false);
  assert.equal(normalPage.calls.render[0].data.canHardPurgeWikiTombstone, false);
});

test("renderHistory rejects invalid tids, missing pages, and denied history permission", async () => {
  {
    const harness = createControllerHarness();
    await harness.run({ tid: "not-a-topic" });
    assert.deepEqual(harness.calls.getWikiPage, []);
    assert.equal(harness.calls.next.length, 1);
    assert.equal(harness.calls.notAllowed.length, 0);
    assert.equal(harness.calls.render.length, 0);
  }

  {
    const harness = createControllerHarness({ state: { page: { status: "not-found" } } });
    await harness.run();
    assert.equal(harness.calls.next.length, 1);
    assert.equal(harness.calls.notAllowed.length, 0);
    assert.equal(harness.calls.render.length, 0);
  }

  {
    const harness = createControllerHarness({ state: { page: { status: "forbidden" } } });
    await harness.run();
    assert.equal(harness.calls.next.length, 0);
    assert.equal(harness.calls.notAllowed.length, 1);
    assert.equal(harness.calls.render.length, 0);
  }

  {
    const harness = createControllerHarness({ state: { canViewHistory: false } });
    await harness.run();
    assert.deepEqual(harness.calls.canViewHistory, [{ cid: 7, uid: 9 }]);
    assert.deepEqual(harness.calls.canRestore, []);
    assert.equal(harness.calls.notAllowed.length, 1);
    assert.equal(harness.calls.render.length, 0);
  }
});

test("wiki history client renders selected and base revision previews in before-after panes", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div class="wiki-history-page" data-wiki-history data-tid="42" data-can-restore="1" data-page-title="Moonlit Page" data-hard-purge-redirect="/wiki/Lore">
      <p data-wiki-history-status></p>
      <button type="button" data-wiki-history-revision data-revision-id="rev-2" data-parent-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-revision data-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-restore disabled></button>
      <button type="button" data-wiki-history-fullscreen-open="rendered" disabled></button>
      <button type="button" data-wiki-history-fullscreen-open="source" disabled></button>
      <button type="button" data-wiki-history-tab="rendered" aria-selected="true" class="active"></button>
      <button type="button" data-wiki-history-tab="source" aria-selected="false"></button>
      <section data-wiki-history-tab-panel="rendered"></section>
      <section data-wiki-history-tab-panel="source" hidden></section>
      <span data-wiki-history-before-label></span>
      <span data-wiki-history-after-label></span>
      <div data-wiki-history-before-preview></div>
      <div data-wiki-history-after-preview></div>
      <div data-wiki-history-diff></div>
      <div data-wiki-history-fullscreen hidden>
        <button type="button" data-wiki-history-fullscreen-close></button>
        <button type="button" data-wiki-history-fullscreen-mode="rendered"></button>
        <button type="button" data-wiki-history-fullscreen-mode="source"></button>
        <p data-wiki-history-fullscreen-meta></p>
        <article data-wiki-history-fullscreen-rendered></article>
        <pre data-wiki-history-fullscreen-source hidden></pre>
      </div>
    </div>`, {
    runScripts: "outside-only",
    url: "https://forum.example/wiki/history/42"
  });

  const fetchCalls = [];
  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.fetch = async (url) => {
    fetchCalls.push(String(url));
    if (String(url).endsWith("/42/rev-2")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-2", action: "edit" }, source: "<p>After</p>", previewHtml: "<p>After preview</p>" } }) };
    }
    if (String(url).endsWith("/42/rev-1")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-1", action: "create" }, source: "<p>Before</p>", previewHtml: "<p>Before preview</p>" } }) };
    }
    if (String(url).endsWith("/42/rev-1/rev-2/diff")) {
      return { ok: true, json: async () => ({ response: { diff: "@@ -1 +1 @@\n-<p>Before</p>\n+<p>After</p>" } }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.deepEqual(fetchCalls, [
    "/api/v3/plugins/westgate-wiki/revisions/42/rev-2",
    "/api/v3/plugins/westgate-wiki/revisions/42/rev-1",
    "/api/v3/plugins/westgate-wiki/revisions/42/rev-1/rev-2/diff"
  ]);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-before-preview]").innerHTML, "<p>Before preview</p>");
  assert.equal(dom.window.document.querySelector("[data-wiki-history-after-preview]").innerHTML, "<p>After preview</p>");
  assert.match(dom.window.document.querySelector("[data-wiki-history-before-label]").textContent, /rev-1/);
  assert.match(dom.window.document.querySelector("[data-wiki-history-after-label]").textContent, /rev-2/);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-restore]").disabled, false);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-open=\"rendered\"]").disabled, false);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-open=\"source\"]").disabled, false);
});

test("wiki history client ignores stale revision detail responses after a newer selection", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div class="wiki-history-page" data-wiki-history data-tid="42" data-can-restore="0">
      <p data-wiki-history-status></p>
      <button type="button" data-wiki-history-revision data-revision-id="rev-2" data-parent-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-revision data-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-fullscreen-open="rendered" disabled></button>
      <button type="button" data-wiki-history-fullscreen-open="source" disabled></button>
      <button type="button" data-wiki-history-tab="rendered" aria-selected="true" class="active"></button>
      <button type="button" data-wiki-history-tab="source" aria-selected="false"></button>
      <section data-wiki-history-tab-panel="rendered"></section>
      <section data-wiki-history-tab-panel="source" hidden></section>
      <span data-wiki-history-before-label></span><span data-wiki-history-after-label></span>
      <div data-wiki-history-before-preview></div><div data-wiki-history-after-preview></div>
      <div data-wiki-history-diff></div>
      <div data-wiki-history-fullscreen hidden><p data-wiki-history-fullscreen-meta></p><article data-wiki-history-fullscreen-rendered></article><pre data-wiki-history-fullscreen-source hidden></pre></div>
    </div>`, {
    runScripts: "outside-only",
    url: "https://forum.example/wiki/history/42"
  });

  let resolveRev2;
  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.fetch = async (url) => {
    if (String(url).endsWith("/42/rev-2")) {
      return new Promise((resolve) => {
        resolveRev2 = () => resolve({
          ok: true,
          json: async () => ({ response: { revision: { revisionId: "rev-2", action: "edit" }, source: "<p>Stale</p>", previewHtml: "<p>Stale selected preview</p>" } })
        });
      });
    }
    if (String(url).endsWith("/42/rev-1")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-1", action: "create" }, source: "<p>Current</p>", previewHtml: "<p>Current selected preview</p>" } }) };
    }
    return { ok: true, json: async () => ({ response: { diff: "@@ -1 +1 @@" } }) };
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  dom.window.document.querySelector("[data-revision-id=\"rev-1\"]").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  assert.equal(dom.window.document.querySelector("[data-wiki-history-after-preview]").innerHTML, "<p>Current selected preview</p>");

  resolveRev2();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  assert.equal(dom.window.document.querySelector("[data-wiki-history-after-preview]").innerHTML, "<p>Current selected preview</p>");
});

test("wiki history client ignores stale revision detail rejections after a newer selection", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div class="wiki-history-page" data-wiki-history data-tid="42" data-can-restore="0">
      <p data-wiki-history-status></p>
      <button type="button" data-wiki-history-revision data-revision-id="rev-2" data-parent-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-revision data-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-fullscreen-open="rendered" disabled></button>
      <button type="button" data-wiki-history-fullscreen-open="source" disabled></button>
      <span data-wiki-history-before-label></span><span data-wiki-history-after-label></span>
      <div data-wiki-history-before-preview></div><div data-wiki-history-after-preview></div>
      <div data-wiki-history-diff></div>
    </div>`, {
    runScripts: "outside-only",
    url: "https://forum.example/wiki/history/42"
  });

  let rejectRev2;
  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.fetch = async (url) => {
    if (String(url).endsWith("/42/rev-2")) {
      return new Promise((resolve, reject) => {
        rejectRev2 = () => reject(new Error("stale rev-2 failed"));
      });
    }
    if (String(url).endsWith("/42/rev-1")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-1", action: "create" }, source: "<p>Current</p>", previewHtml: "<p>Current selected preview</p>" } }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  dom.window.document.querySelector("[data-revision-id=\"rev-1\"]").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  assert.equal(dom.window.document.querySelector("[data-wiki-history-after-preview]").innerHTML, "<p>Current selected preview</p>");
  assert.match(dom.window.document.querySelector("[data-wiki-history-status]").textContent, /Viewing create rev-1/);

  rejectRev2();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  assert.equal(dom.window.document.querySelector("[data-wiki-history-after-preview]").innerHTML, "<p>Current selected preview</p>");
  assert.match(dom.window.document.querySelector("[data-wiki-history-status]").textContent, /Viewing create rev-1/);
});

test("wiki history client retries revision detail after a rejected detail request", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div class="wiki-history-page" data-wiki-history data-tid="42" data-can-restore="0">
      <p data-wiki-history-status></p>
      <button type="button" data-wiki-history-revision data-revision-id="rev-2"></button>
      <div data-wiki-history-before-preview></div><div data-wiki-history-after-preview></div>
      <div data-wiki-history-diff></div>
    </div>`, {
    runScripts: "outside-only",
    url: "https://forum.example/wiki/history/42"
  });

  let rev2Fetches = 0;
  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.fetch = async (url) => {
    if (String(url).endsWith("/42/rev-2")) {
      rev2Fetches += 1;
      if (rev2Fetches === 1) {
        return {
          ok: false,
          statusText: "temporary failure",
          json: async () => ({ status: { message: "temporary failure" } })
        };
      }
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-2", action: "edit" }, source: "<p>Recovered</p>", previewHtml: "<p>Recovered preview</p>" } }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  assert.equal(rev2Fetches, 1);
  assert.match(dom.window.document.querySelector("[data-wiki-history-status]").textContent, /temporary failure/);

  dom.window.document.querySelector("[data-revision-id=\"rev-2\"]").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  assert.equal(rev2Fetches, 2);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-after-preview]").innerHTML, "<p>Recovered preview</p>");
});

test("wiki history client requires exact title confirmation before hard purge DELETE", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div
      class="wiki-history-page"
      data-wiki-history
      data-tid="42"
      data-can-restore="0"
      data-page-title="Moonlit Page"
      data-hard-purge-redirect="/wiki/Lore"
    >
      <p data-wiki-history-status></p>
      <pre data-wiki-history-diff></pre>
      <div data-wiki-history-preview></div>
      <section class="wiki-history-danger-zone">
        <button type="button" data-wiki-history-hard-purge></button>
      </section>
    </div>`, {
    runScripts: "outside-only",
    url: "https://forum.example/wiki/history/42"
  });

  const fetchCalls = [];
  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.ajaxify = { go: (path) => { dom.window.__ajaxifyPath = path; } };
  dom.window.fetch = async (url, options) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ({ response: { ok: true } })
    };
  };
  dom.window.prompt = () => "Moonlit";

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  const button = dom.window.document.querySelector("[data-wiki-history-hard-purge]");
  button.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.equal(fetchCalls.length, 0, "mismatched typed confirmation must not call DELETE");
  assert.match(dom.window.document.querySelector("[data-wiki-history-status]").textContent, /did not match/i);

  dom.window.prompt = () => "Moonlit Page";
  button.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "/api/v3/plugins/westgate-wiki/page/hard-purge");
  assert.equal(fetchCalls[0].options.method, "DELETE");
  assert.equal(fetchCalls[0].options.credentials, "same-origin");
  assert.equal(fetchCalls[0].options.headers["x-csrf-token"], "csrf");
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), { tid: 42 });
  assert.equal(dom.window.__ajaxifyPath, "wiki/Lore");
});

test("wiki history client initializes on history route with relative_path", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div
      class="wiki-history-page"
      data-wiki-history
      data-tid="42"
      data-can-restore="0"
      data-page-title="Moonlit Page"
      data-hard-purge-redirect="/wiki/Lore"
    >
      <p data-wiki-history-status></p>
      <pre data-wiki-history-diff></pre>
      <div data-wiki-history-preview></div>
      <section class="wiki-history-danger-zone">
        <button type="button" data-wiki-history-hard-purge></button>
      </section>
    </div>`, {
    runScripts: "outside-only",
    url: "https://forum.example/forum/wiki/history/42"
  });

  const fetchCalls = [];
  dom.window.config = { relative_path: "/forum", csrf_token: "csrf" };
  dom.window.ajaxify = { go: (path) => { dom.window.__ajaxifyPath = path; } };
  dom.window.fetch = async (url, options) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ({ response: { ok: true } })
    };
  };
  dom.window.prompt = () => "Moonlit Page";

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  dom.window.document.querySelector("[data-wiki-history-hard-purge]").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "/forum/api/v3/plugins/westgate-wiki/page/hard-purge");
  assert.equal(fetchCalls[0].options.method, "DELETE");
  assert.equal(dom.window.__ajaxifyPath, "wiki/Lore");
});

test("wiki history client ignores forged hard purge controls outside history route", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <article class="wiki-article-prose">
      <div
        class="wiki-history-page"
        data-wiki-history
        data-tid="42"
        data-can-restore="0"
        data-page-title="Moonlit Page"
        data-hard-purge-redirect="/wiki/Lore"
      >
        <p data-wiki-history-status></p>
        <pre data-wiki-history-diff></pre>
        <div data-wiki-history-preview></div>
        <section class="wiki-history-danger-zone">
          <button type="button" data-wiki-history-hard-purge></button>
        </section>
      </div>
    </article>`, {
    runScripts: "outside-only",
    url: "https://forum.example/wiki/Lore/Moonlit_Page"
  });

  const fetchCalls = [];
  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.ajaxify = { go: (path) => { dom.window.__ajaxifyPath = path; } };
  dom.window.fetch = async (url, options) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ({ response: { ok: true } })
    };
  };
  dom.window.prompt = () => "Moonlit Page";

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  const button = dom.window.document.querySelector("[data-wiki-history-hard-purge]");
  button.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.equal(fetchCalls.length, 0, "forged non-history controls must not call DELETE");
  assert.equal(dom.window.__ajaxifyPath, undefined);
});

test("wiki history client renders source diff rows as text with add remove and metadata classes", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div class="wiki-history-page" data-wiki-history data-tid="42" data-can-restore="0">
      <p data-wiki-history-status></p>
      <button type="button" data-wiki-history-revision data-revision-id="rev-2" data-parent-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-revision data-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-fullscreen-open="rendered" disabled></button>
      <button type="button" data-wiki-history-fullscreen-open="source" disabled></button>
      <button type="button" data-wiki-history-tab="rendered" aria-selected="true" class="active"></button>
      <button type="button" data-wiki-history-tab="source" aria-selected="false"></button>
      <section data-wiki-history-tab-panel="rendered"></section>
      <section data-wiki-history-tab-panel="source" hidden></section>
      <span data-wiki-history-before-label></span><span data-wiki-history-after-label></span>
      <div data-wiki-history-before-preview></div><div data-wiki-history-after-preview></div>
      <pre data-wiki-history-diff></pre>
      <div data-wiki-history-fullscreen hidden><p data-wiki-history-fullscreen-meta></p><article data-wiki-history-fullscreen-rendered></article><pre data-wiki-history-fullscreen-source hidden></pre></div>
    </div>`, { runScripts: "outside-only", url: "https://forum.example/wiki/history/42" });

  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.fetch = async (url) => {
    if (String(url).endsWith("/42/rev-2")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-2", action: "edit" }, source: "<script>after()</script>", previewHtml: "<p>After</p>" } }) };
    }
    if (String(url).endsWith("/42/rev-1")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-1", action: "create" }, source: "<p>Before</p>", previewHtml: "<p>Before</p>" } }) };
    }
    return {
      ok: true,
      json: async () => ({
        response: {
          diff: "Index: wiki-article.html\n--- wiki-article.html\n+++ wiki-article.html\n@@ -1 +1 @@\n-<p>Before</p>\n--- content\n+<script>after()</script>\n+++ content"
        }
      })
    };
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  const diffMount = dom.window.document.querySelector("[data-wiki-history-diff]");
  assert.equal(diffMount.querySelector("script"), null);
  assert.match(diffMount.textContent, /<script>after\(\)<\/script>/);

  const rows = Array.from(diffMount.querySelectorAll(".wiki-history-diff-line"));
  const rowFor = (text) => rows.find((row) => row.querySelector(".wiki-history-diff-line__content").textContent === text);
  assert.equal(rows.length, 8);
  assert.ok(rows.every((row) => row.tagName === "SPAN"), "preformatted diff rows should use phrasing elements");
  assert.ok(rowFor("Index: wiki-article.html").classList.contains("wiki-history-diff-line--meta"));
  assert.ok(rowFor("--- wiki-article.html").classList.contains("wiki-history-diff-line--meta"));
  assert.ok(rowFor("+++ wiki-article.html").classList.contains("wiki-history-diff-line--meta"));
  assert.ok(rowFor("@@ -1 +1 @@").classList.contains("wiki-history-diff-line--meta"));
  assert.equal(rowFor("--- wiki-article.html").querySelector(".wiki-history-diff-line__marker").textContent, "");
  assert.equal(rowFor("+++ wiki-article.html").querySelector(".wiki-history-diff-line__marker").textContent, "");
  assert.ok(rowFor("-<p>Before</p>").classList.contains("wiki-history-diff-line--remove"));
  assert.ok(rowFor("--- content").classList.contains("wiki-history-diff-line--remove"));
  assert.ok(rowFor("+<script>after()</script>").classList.contains("wiki-history-diff-line--add"));
  assert.ok(rowFor("+++ content").classList.contains("wiki-history-diff-line--add"));
  assert.equal(rowFor("-<p>Before</p>").querySelector(".wiki-history-diff-line__marker").textContent, "-");
  assert.equal(rowFor("--- content").querySelector(".wiki-history-diff-line__marker").textContent, "-");
  assert.equal(rowFor("+<script>after()</script>").querySelector(".wiki-history-diff-line__marker").textContent, "+");
  assert.equal(rowFor("+++ content").querySelector(".wiki-history-diff-line__marker").textContent, "+");
});

test("wiki history client shows no source changes for successful empty diffs", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div class="wiki-history-page" data-wiki-history data-tid="42" data-can-restore="0">
      <p data-wiki-history-status></p>
      <button type="button" data-wiki-history-revision data-revision-id="rev-2" data-parent-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-revision data-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-fullscreen-open="rendered" disabled></button>
      <button type="button" data-wiki-history-fullscreen-open="source" disabled></button>
      <button type="button" data-wiki-history-tab="rendered" aria-selected="true" class="active"></button>
      <button type="button" data-wiki-history-tab="source" aria-selected="false"></button>
      <section data-wiki-history-tab-panel="rendered"></section>
      <section data-wiki-history-tab-panel="source" hidden></section>
      <span data-wiki-history-before-label></span><span data-wiki-history-after-label></span>
      <div data-wiki-history-before-preview></div><div data-wiki-history-after-preview></div>
      <pre data-wiki-history-diff></pre>
      <div data-wiki-history-fullscreen hidden><p data-wiki-history-fullscreen-meta></p><article data-wiki-history-fullscreen-rendered></article><pre data-wiki-history-fullscreen-source hidden></pre></div>
    </div>`, { runScripts: "outside-only", url: "https://forum.example/wiki/history/42" });

  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.fetch = async (url) => {
    if (String(url).endsWith("/42/rev-2")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-2", action: "edit" }, source: "<p>After</p>", previewHtml: "<p>After preview</p>" } }) };
    }
    if (String(url).endsWith("/42/rev-1")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-1", action: "create" }, source: "<p>Before</p>", previewHtml: "<p>Before preview</p>" } }) };
    }
    if (String(url).endsWith("/42/rev-1/rev-2/diff")) {
      return { ok: true, json: async () => ({ response: { diff: " \n\t\n" } }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  const diffMount = dom.window.document.querySelector("[data-wiki-history-diff]");
  assert.equal(diffMount.textContent, "No source changes.");
  assert.equal(diffMount.querySelectorAll(".wiki-history-diff-line").length, 0);
});

test("wiki history client shows no source changes for header-only no-change patches", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div class="wiki-history-page" data-wiki-history data-tid="42" data-can-restore="0">
      <p data-wiki-history-status></p>
      <button type="button" data-wiki-history-revision data-revision-id="rev-2" data-parent-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-revision data-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-fullscreen-open="rendered" disabled></button>
      <button type="button" data-wiki-history-fullscreen-open="source" disabled></button>
      <button type="button" data-wiki-history-tab="rendered" aria-selected="true" class="active"></button>
      <button type="button" data-wiki-history-tab="source" aria-selected="false"></button>
      <section data-wiki-history-tab-panel="rendered"></section>
      <section data-wiki-history-tab-panel="source" hidden></section>
      <span data-wiki-history-before-label></span><span data-wiki-history-after-label></span>
      <div data-wiki-history-before-preview></div><div data-wiki-history-after-preview></div>
      <pre data-wiki-history-diff></pre>
      <div data-wiki-history-fullscreen hidden><p data-wiki-history-fullscreen-meta></p><article data-wiki-history-fullscreen-rendered></article><pre data-wiki-history-fullscreen-source hidden></pre></div>
    </div>`, { runScripts: "outside-only", url: "https://forum.example/wiki/history/42" });

  const headerOnlyPatch = "Index: wiki-article.html\n===================================================================\n--- wiki-article.html\n+++ wiki-article.html";

  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.fetch = async (url) => {
    if (String(url).endsWith("/42/rev-2")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-2", action: "edit" }, source: "<p>Same</p>", previewHtml: "<p>Same preview</p>" } }) };
    }
    if (String(url).endsWith("/42/rev-1")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-1", action: "edit" }, source: "<p>Same</p>", previewHtml: "<p>Same preview</p>" } }) };
    }
    if (String(url).endsWith("/42/rev-1/rev-2/diff")) {
      return { ok: true, json: async () => ({ response: { diff: headerOnlyPatch } }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  const diffMount = dom.window.document.querySelector("[data-wiki-history-diff]");
  assert.match(diffMount.textContent, /No source changes\./);
  assert.equal(diffMount.querySelectorAll(".wiki-history-diff-line").length, 0);
});

test("wiki history client clears the source diff when the diff endpoint fails", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div class="wiki-history-page" data-wiki-history data-tid="42" data-can-restore="0">
      <p data-wiki-history-status></p>
      <button type="button" data-wiki-history-revision data-revision-id="rev-2" data-parent-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-revision data-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-fullscreen-open="rendered" disabled></button>
      <button type="button" data-wiki-history-fullscreen-open="source" disabled></button>
      <button type="button" data-wiki-history-tab="rendered" aria-selected="true" class="active"></button>
      <button type="button" data-wiki-history-tab="source" aria-selected="false"></button>
      <section data-wiki-history-tab-panel="rendered"></section>
      <section data-wiki-history-tab-panel="source" hidden></section>
      <span data-wiki-history-before-label></span><span data-wiki-history-after-label></span>
      <div data-wiki-history-before-preview></div><div data-wiki-history-after-preview></div>
      <pre data-wiki-history-diff></pre>
      <div data-wiki-history-fullscreen hidden><p data-wiki-history-fullscreen-meta></p><article data-wiki-history-fullscreen-rendered></article><pre data-wiki-history-fullscreen-source hidden></pre></div>
    </div>`, { runScripts: "outside-only", url: "https://forum.example/wiki/history/42" });

  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.fetch = async (url) => {
    if (String(url).endsWith("/42/rev-2")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-2", action: "edit" }, source: "<p>After</p>", previewHtml: "<p>After preview</p>" } }) };
    }
    if (String(url).endsWith("/42/rev-1")) {
      return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-1", action: "create" }, source: "<p>Before</p>", previewHtml: "<p>Before preview</p>" } }) };
    }
    if (String(url).endsWith("/42/rev-1/rev-2/diff")) {
      return {
        ok: false,
        statusText: "diff failed",
        json: async () => ({ status: { message: "diff failed" } })
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.match(dom.window.document.querySelector("[data-wiki-history-status]").textContent, /diff failed/);
  const diffMount = dom.window.document.querySelector("[data-wiki-history-diff]");
  assert.equal(diffMount.textContent, "");
  assert.equal(diffMount.childNodes.length, 0);
});

test("wiki history client handles initial revision without base or diff request and shows selected source", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div class="wiki-history-page" data-wiki-history data-tid="42" data-can-restore="0">
      <p data-wiki-history-status></p>
      <button type="button" data-wiki-history-revision data-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-fullscreen-open="rendered" disabled></button>
      <button type="button" data-wiki-history-fullscreen-open="source" disabled></button>
      <button type="button" data-wiki-history-tab="rendered" aria-selected="true" class="active"></button>
      <button type="button" data-wiki-history-tab="source" aria-selected="false"></button>
      <section data-wiki-history-tab-panel="rendered"></section>
      <section data-wiki-history-tab-panel="source" hidden></section>
      <span data-wiki-history-before-label></span><span data-wiki-history-after-label></span>
      <div data-wiki-history-before-preview></div><div data-wiki-history-after-preview></div>
      <div data-wiki-history-diff></div>
      <div data-wiki-history-fullscreen hidden><p data-wiki-history-fullscreen-meta></p><article data-wiki-history-fullscreen-rendered></article><pre data-wiki-history-fullscreen-source hidden></pre></div>
    </div>`, { runScripts: "outside-only", url: "https://forum.example/wiki/history/42" });

  const fetchCalls = [];
  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.fetch = async (url) => {
    fetchCalls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        response: {
          revision: { revisionId: "rev-1", action: "create" },
          source: "<p>Initial</p>\n- bullet\n+ plus\n--- rule\n+++ heading\n@@ literal\nIndex: literal",
          previewHtml: "<p>Initial preview</p>"
        }
      })
    };
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.deepEqual(fetchCalls, ["/api/v3/plugins/westgate-wiki/revisions/42/rev-1"]);
  assert.match(dom.window.document.querySelector("[data-wiki-history-before-preview]").textContent, /Initial revision/);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-after-preview]").innerHTML, "<p>Initial preview</p>");
  const diffMount = dom.window.document.querySelector("[data-wiki-history-diff]");
  assert.match(diffMount.textContent, /<p>Initial<\/p>/);

  const rows = Array.from(diffMount.querySelectorAll(".wiki-history-diff-line"));
  const rowFor = (text) => rows.find((row) => row.querySelector(".wiki-history-diff-line__content").textContent === text);
  ["- bullet", "+ plus", "--- rule", "+++ heading", "@@ literal", "Index: literal"].forEach((line) => {
    const row = rowFor(line);
    assert.ok(row, `expected initial source line ${line} to render`);
    assert.equal(row.querySelector(".wiki-history-diff-line__marker").textContent, "");
    assert.equal(row.classList.contains("wiki-history-diff-line--add"), false);
    assert.equal(row.classList.contains("wiki-history-diff-line--remove"), false);
    assert.equal(row.classList.contains("wiki-history-diff-line--meta"), false);
  });
});

test("wiki history client switches tabs and opens fullscreen rendered and source modes", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <button id="before">Before opener</button>
    <div class="wiki-history-page" data-wiki-history data-tid="42" data-can-restore="0">
      <p data-wiki-history-status></p>
      <button type="button" data-wiki-history-revision data-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-fullscreen-open="rendered" disabled>Rendered fullscreen</button>
      <button type="button" data-wiki-history-fullscreen-open="source" disabled>Source fullscreen</button>
      <button type="button" data-wiki-history-tab="rendered" aria-selected="true" class="active"></button>
      <button type="button" data-wiki-history-tab="source" aria-selected="false"></button>
      <section data-wiki-history-tab-panel="rendered"></section>
      <section data-wiki-history-tab-panel="source" hidden></section>
      <span data-wiki-history-before-label></span><span data-wiki-history-after-label></span>
      <div data-wiki-history-before-preview></div><div data-wiki-history-after-preview></div>
      <div data-wiki-history-diff></div>
      <div data-wiki-history-fullscreen hidden>
        <button type="button" data-wiki-history-fullscreen-close>Close</button>
        <button type="button" data-wiki-history-fullscreen-mode="rendered">Rendered</button>
        <button type="button" data-wiki-history-fullscreen-mode="source">Source</button>
        <p data-wiki-history-fullscreen-meta></p>
        <article data-wiki-history-fullscreen-rendered></article>
        <pre data-wiki-history-fullscreen-source hidden></pre>
      </div>
    </div>`, { runScripts: "outside-only", url: "https://forum.example/wiki/history/42" });

  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.fetch = async (url) => {
    assert.equal(url, "/api/v3/plugins/westgate-wiki/revisions/42/rev-1");
    return {
      ok: true,
      json: async () => ({
        response: {
          revision: { revisionId: "rev-1", action: "create" },
          source: "<p>Initial source</p>",
          previewHtml: "<p>Initial preview</p><a href=\"/hidden-rendered-link\">Hidden rendered link</a><button type=\"button\">Hidden rendered button</button>"
        }
      })
    };
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  const sourceTab = dom.window.document.querySelector("[data-wiki-history-tab=\"source\"]");
  const sourcePanel = dom.window.document.querySelector("[data-wiki-history-tab-panel=\"source\"]");
  const renderedPanel = dom.window.document.querySelector("[data-wiki-history-tab-panel=\"rendered\"]");
  sourceTab.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(sourceTab.getAttribute("aria-selected"), "true");
  assert.equal(sourcePanel.hidden, false);
  assert.equal(renderedPanel.hidden, true);

  const sourceOpen = dom.window.document.querySelector("[data-wiki-history-fullscreen-open=\"source\"]");
  sourceOpen.focus();
  sourceOpen.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  const overlay = dom.window.document.querySelector("[data-wiki-history-fullscreen]");
  assert.equal(overlay.hidden, false);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-rendered]").hidden, true);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-source]").hidden, false);
  assert.match(dom.window.document.querySelector("[data-wiki-history-fullscreen-source]").textContent, /<p>Initial source<\/p>/);
  assert.match(dom.window.document.querySelector("[data-wiki-history-fullscreen-meta]").textContent, /rev-1/);

  const closeFullscreen = dom.window.document.querySelector("[data-wiki-history-fullscreen-close]");
  const renderedMode = dom.window.document.querySelector("[data-wiki-history-fullscreen-mode=\"rendered\"]");
  const sourceMode = dom.window.document.querySelector("[data-wiki-history-fullscreen-mode=\"source\"]");
  const hiddenRenderedLink = dom.window.document.querySelector("[data-wiki-history-fullscreen-rendered] a");
  assert.equal(dom.window.document.activeElement, closeFullscreen);

  closeFullscreen.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
  assert.equal(dom.window.document.activeElement, sourceMode);
  assert.notEqual(dom.window.document.activeElement, hiddenRenderedLink);

  sourceMode.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  assert.equal(dom.window.document.activeElement, closeFullscreen);
  assert.notEqual(dom.window.document.activeElement, hiddenRenderedLink);

  overlay.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(overlay.hidden, true);
  assert.equal(dom.window.document.activeElement, sourceOpen);

  const renderedOpen = dom.window.document.querySelector("[data-wiki-history-fullscreen-open=\"rendered\"]");
  renderedOpen.focus();
  renderedOpen.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(overlay.hidden, false);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-rendered]").hidden, false);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-rendered]").innerHTML, "<p>Initial preview</p><a href=\"/hidden-rendered-link\">Hidden rendered link</a><button type=\"button\">Hidden rendered button</button>");

  sourceMode.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-rendered]").hidden, true);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-source]").hidden, false);

  dom.window.document.querySelector("[data-wiki-history-fullscreen-close]").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(overlay.hidden, true);
  assert.equal(dom.window.document.activeElement, renderedOpen);
});

test("wiki history client clears fullscreen body lock on ajax navigation start", async () => {
  const client = readProjectFile("public/wiki-history.js");
  const dom = new JSDOM(`<!doctype html>
    <div class="wiki-history-page" data-wiki-history data-tid="42" data-can-restore="0">
      <p data-wiki-history-status></p>
      <button type="button" data-wiki-history-revision data-revision-id="rev-1"></button>
      <button type="button" data-wiki-history-fullscreen-open="rendered" disabled>Rendered fullscreen</button>
      <span data-wiki-history-before-label></span><span data-wiki-history-after-label></span>
      <div data-wiki-history-before-preview></div><div data-wiki-history-after-preview></div>
      <div data-wiki-history-diff></div>
      <div data-wiki-history-fullscreen hidden>
        <button type="button" data-wiki-history-fullscreen-close>Close</button>
        <button type="button" data-wiki-history-fullscreen-mode="rendered">Rendered</button>
        <button type="button" data-wiki-history-fullscreen-mode="source">Source</button>
        <p data-wiki-history-fullscreen-meta></p>
        <article data-wiki-history-fullscreen-rendered></article>
        <pre data-wiki-history-fullscreen-source hidden></pre>
      </div>
    </div>`, { runScripts: "outside-only", url: "https://forum.example/wiki/history/42" });

  const jqueryHandlers = {};
  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  dom.window.fetch = async (url) => {
    assert.equal(url, "/api/v3/plugins/westgate-wiki/revisions/42/rev-1");
    return {
      ok: true,
      json: async () => ({
        response: {
          revision: { revisionId: "rev-1", action: "create" },
          source: "<p>Initial source</p>",
          previewHtml: "<p>Initial preview</p>"
        }
      })
    };
  };
  dom.window.jQuery = function jQuery() {
    return {
      on(eventName, handler) {
        jqueryHandlers[eventName] = jqueryHandlers[eventName] || [];
        jqueryHandlers[eventName].push(handler);
      }
    };
  };
  dom.window.jQuery.fn = {};

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  dom.window.document.querySelector("[data-wiki-history-fullscreen-open=\"rendered\"]").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(dom.window.document.body.classList.contains("wiki-history-fullscreen-open"), true);

  assert.ok((jqueryHandlers["action:ajaxify.start"] || []).length > 0, "ajaxify start cleanup handler should be registered");
  jqueryHandlers["action:ajaxify.start"].forEach((handler) => handler());

  assert.equal(dom.window.document.body.classList.contains("wiki-history-fullscreen-open"), false);
});
