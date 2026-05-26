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
      "lib/compose-assets.js": { register: () => {} },
      "lib/controllers/compose.js": { renderCompose: () => {}, renderEdit: () => {} },
      "lib/controllers/wiki-namespace-create.js": { renderChild: () => {} },
      "lib/config.js": {},
      "lib/wiki-namespace-creators.js": {},
      "lib/wiki-alphabetical-index.js": {},
      "lib/serializer.js": {},
      "lib/wiki-service.js": {},
      "lib/topic-service.js": {},
      "lib/wiki-search-service.js": {},
      "lib/wiki-breadcrumb-trail.js": {},
      "lib/wiki-missing-page-create.js": {},
      "lib/wiki-page-actions.js": {},
      "lib/wiki-paths.js": {},
      "lib/wiki-revision-permissions.js": {}
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
      "lib/topic-service.js": {
        getWikiPage: async (tid, uid, options) => {
          calls.getWikiPage.push({ tid, uid, options });
          return state.page;
        }
      },
      "lib/wiki-revision-permissions.js": {
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
      "lib/wiki-tombstones.js": {
        getTombstoneFromFields: (fields) => {
          calls.getTombstoneFromFields.push(fields);
          return state.tombstoneFromFields;
        },
        getTombstone: async (tid) => {
          calls.getTombstone.push({ tid });
          return state.tombstone;
        }
      },
      "lib/wiki-revisions.js": {
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
      "lib/serializer.js": {
        getTitleDisplay: (titlePath, fallback) => (Array.isArray(titlePath) && titlePath.length ? titlePath.join(" / ") : fallback)
      },
      "lib/wiki-breadcrumb-trail.js": {
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

test("wiki page template exposes history FAB only when history permission is present", () => {
  const template = readProjectFile("templates/wiki-page.tpl");

  assert.match(
    template,
    /<!-- IF canViewWikiHistory -->[\s\S]*href="\{config\.relative_path\}\/wiki\/history\/\{topic\.tid\}"[\s\S]*<!-- ENDIF canViewWikiHistory -->/,
    "history FAB should link to the history page inside a canViewWikiHistory gate"
  );
  assert.doesNotMatch(template, /hard-purge|data-wiki-history-hard-purge/i);
});

test("wiki history template exposes timeline, diff, preview, restore gate, and back link", () => {
  const template = readProjectFile("templates/wiki-history.tpl");

  assert.match(template, /data-wiki-history-timeline/);
  assert.match(template, /data-wiki-history-diff/);
  assert.match(template, /data-wiki-history-preview/);
  assert.match(template, /wiki-article-prose/);
  assert.match(
    template,
    /<!-- IF canRestoreWikiRevision -->[\s\S]*data-wiki-history-restore[\s\S]*<!-- ENDIF canRestoreWikiRevision -->/,
    "restore control should be gated by canRestoreWikiRevision"
  );
  assert.match(
    template,
    /<!-- IF isWikiTombstoned -->[\s\S]*<!-- IF canHardPurgeWikiTombstone -->[\s\S]*data-wiki-history-hard-purge[\s\S]*<!-- ENDIF canHardPurgeWikiTombstone -->[\s\S]*<!-- ENDIF isWikiTombstoned -->/,
    "hard purge control should be gated by both tombstone state and hard purge permission"
  );
  assert.match(template, /href="\{config\.relative_path\}\{returnPath\}"/);
});

test("wiki history client is loaded and renders unsafe surfaces defensively", () => {
  const plugin = JSON.parse(readProjectFile("plugin.json"));
  const template = fs.existsSync(path.join(root, "templates/wiki-history.tpl")) ?
    readProjectFile("templates/wiki-history.tpl") :
    "";
  const client = readProjectFile("public/wiki-history.js");

  assert.ok(
    (plugin.scripts || []).includes("public/wiki-history.js") || template.includes("public/wiki-history.js"),
    "history client should be loaded through plugin.json or the template"
  );
  assert.match(client, /api\/v3\/plugins\/westgate-wiki\/revisions/);
  assert.match(client, /textContent\s*=\s*[^;]*diff/);
  assert.match(client, /querySelector\("\[data-wiki-history-preview\]"\)/);
  assert.doesNotMatch(client, /\beval\s*\(/);
  assert.doesNotMatch(client, /new Function\s*\(/);
});

test("wiki history client uses server preview html and restores through an acquired edit lock", () => {
  const client = readProjectFile("public/wiki-history.js");

  assert.match(client, /api\/v3\/plugins\/westgate-wiki\/edit-lock/);
  assert.match(client, /method:\s*"PUT"[\s\S]*x-csrf-token/);
  assert.match(client, /method:\s*"DELETE"[\s\S]*x-csrf-token/);
  assert.match(client, /wikiEditLockToken:\s*lock\.token/);
  assert.match(client, /renderPreview\(previewMount,\s*detail\.previewHtml\s*\|\|\s*""\)/);
  assert.doesNotMatch(client, /renderPreview\(previewMount,\s*detail\.source/);
  assert.doesNotMatch(client, /removeDangerousPreviewMarkup/);
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
