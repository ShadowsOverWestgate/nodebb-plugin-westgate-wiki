# Wiki History Diff View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw-only history diff panel with a rendered before/after comparison, a colorized source diff tab, and fullscreen rendered/source revision viewing.

**Architecture:** Keep the existing revision API and storage model. Update the history template to expose stable compare/source/fullscreen mounts, then teach `public/wiki-history.js` to fetch selected and base revision details, render safe server-provided previews, render source text through text nodes, and manage tab/fullscreen state.

**Tech Stack:** NodeBB Benchpress templates, Node.js CommonJS client script, `node --test` with JSDOM, existing `public/wiki.css`, existing wiki revision REST endpoints.

---

## File Structure

- Modify `templates/wiki-history.tpl`: replace the current two-panel diff/preview grid with a tabbed inspector, before/after preview mounts, source diff mount, fullscreen buttons, and a hidden fullscreen overlay.
- Modify `public/wiki-history.js`: add revision detail caching, base revision loading, rendered compare rendering, colorized source diff rendering, tabs, fullscreen open/close/mode switching, and focus trapping.
- Modify `public/wiki.css`: style the history inspector, rendered compare panes, source diff rows, tabs, and fullscreen overlay.
- Modify `tests/wiki-history-page.test.js`: extend template contract tests and add JSDOM client behavior tests for rendered compare, source safety, initial revision handling, stale responses, and fullscreen behavior.

No backend endpoint changes are expected. The existing detail endpoint returns `source` and `previewHtml`; the existing diff endpoint returns the unified source diff.

---

### Task 1: Template Contract For Rendered Compare, Source Tab, And Fullscreen

**Files:**
- Modify: `tests/wiki-history-page.test.js`
- Modify: `templates/wiki-history.tpl`

- [ ] **Step 1: Write the failing template contract test**

In `tests/wiki-history-page.test.js`, replace the body of `test("wiki history template exposes timeline, diff, preview, restore gate, and back link", () => { ... })` with:

```js
test("wiki history template exposes timeline, rendered compare, source diff, fullscreen controls, restore gate, and back link", () => {
  const template = readProjectFile("templates/wiki-history.tpl");

  assert.match(template, /data-wiki-history-timeline/);
  assert.match(template, /role="tablist"[\s\S]*data-wiki-history-tab="rendered"[\s\S]*data-wiki-history-tab="source"/);
  assert.match(template, /data-wiki-history-tab-panel="rendered"/);
  assert.match(template, /data-wiki-history-tab-panel="source"/);
  assert.match(template, /data-wiki-history-before-preview/);
  assert.match(template, /data-wiki-history-after-preview/);
  assert.match(template, /data-wiki-history-before-label/);
  assert.match(template, /data-wiki-history-after-label/);
  assert.match(template, /data-wiki-history-diff/);
  assert.match(template, /data-wiki-history-fullscreen-open="rendered"/);
  assert.match(template, /data-wiki-history-fullscreen-open="source"/);
  assert.match(template, /data-wiki-history-fullscreen/);
  assert.match(template, /data-wiki-history-fullscreen-rendered/);
  assert.match(template, /data-wiki-history-fullscreen-source/);
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
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --test tests/wiki-history-page.test.js
```

Expected: failure in the template contract test because the template still has only `Diff` and `Preview` panels.

- [ ] **Step 3: Update the history template**

In `templates/wiki-history.tpl`, replace the entire `<div class="wiki-history-panels">...</div>` block with:

```html
      <div class="wiki-history-inspector" data-wiki-history-inspector>
        <div class="wiki-history-inspector__bar">
          <div class="wiki-history-tabs" role="tablist" aria-label="Revision inspection views">
            <button
              type="button"
              id="wiki-history-rendered-tab"
              class="wiki-history-tab active"
              role="tab"
              aria-selected="true"
              aria-controls="wiki-history-rendered-panel"
              data-wiki-history-tab="rendered"
            >
              Rendered Compare
            </button>
            <button
              type="button"
              id="wiki-history-source-tab"
              class="wiki-history-tab"
              role="tab"
              aria-selected="false"
              aria-controls="wiki-history-source-panel"
              data-wiki-history-tab="source"
            >
              Source Diff
            </button>
          </div>

          <div class="wiki-history-inspector__actions">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-wiki-history-fullscreen-open="rendered" disabled>
              <i class="fa fa-fw fa-expand" aria-hidden="true"></i>
              Rendered
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-wiki-history-fullscreen-open="source" disabled>
              <i class="fa fa-fw fa-code" aria-hidden="true"></i>
              Source
            </button>
          </div>
        </div>

        <section
          id="wiki-history-rendered-panel"
          class="wiki-history-tab-panel"
          role="tabpanel"
          tabindex="0"
          aria-labelledby="wiki-history-rendered-tab"
          data-wiki-history-tab-panel="rendered"
        >
          <div class="wiki-history-compare" aria-label="Rendered revision comparison">
            <section class="wiki-history-compare-pane" aria-labelledby="wiki-history-before-title">
              <div class="wiki-history-panel-heading">
                <h3 id="wiki-history-before-title">Before</h3>
                <span class="wiki-history-compare-label" data-wiki-history-before-label>Parent revision</span>
              </div>
              <div class="wiki-history-preview wiki-article-prose" data-wiki-history-before-preview>
                <p>Select a revision to preview the previous page content.</p>
              </div>
            </section>

            <section class="wiki-history-compare-pane" aria-labelledby="wiki-history-after-title">
              <div class="wiki-history-panel-heading">
                <h3 id="wiki-history-after-title">After</h3>
                <span class="wiki-history-compare-label" data-wiki-history-after-label>Selected revision</span>
              </div>
              <div class="wiki-history-preview wiki-article-prose" data-wiki-history-after-preview>
                <p>Select a revision to preview the selected page content.</p>
              </div>
            </section>
          </div>
        </section>

        <section
          id="wiki-history-source-panel"
          class="wiki-history-tab-panel"
          role="tabpanel"
          tabindex="0"
          aria-labelledby="wiki-history-source-tab"
          data-wiki-history-tab-panel="source"
          hidden
        >
          <div class="wiki-history-panel-heading">
            <h3>Source Diff</h3>
          </div>
          <div class="wiki-history-diff" data-wiki-history-diff>Select a revision to load the source diff.</div>
        </section>
      </div>

      <div class="wiki-history-fullscreen" data-wiki-history-fullscreen hidden>
        <div class="wiki-history-fullscreen__backdrop" data-wiki-history-fullscreen-close></div>
        <section
          class="wiki-history-fullscreen__dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wiki-history-fullscreen-title"
        >
          <header class="wiki-history-fullscreen__header">
            <div>
              <h2 id="wiki-history-fullscreen-title">Revision Viewer</h2>
              <p class="wiki-history-fullscreen__meta" data-wiki-history-fullscreen-meta>No revision selected.</p>
            </div>
            <div class="wiki-history-fullscreen__actions">
              <button type="button" class="btn btn-sm btn-outline-secondary active" data-wiki-history-fullscreen-mode="rendered">Rendered</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-wiki-history-fullscreen-mode="source">Source</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-wiki-history-fullscreen-close>
                <i class="fa fa-fw fa-times" aria-hidden="true"></i>
                Close
              </button>
            </div>
          </header>
          <div class="wiki-history-fullscreen__body">
            <article class="wiki-history-fullscreen__rendered wiki-article-prose" data-wiki-history-fullscreen-rendered></article>
            <pre class="wiki-history-fullscreen__source" data-wiki-history-fullscreen-source hidden></pre>
          </div>
        </section>
      </div>
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
node --test tests/wiki-history-page.test.js
```

Expected: template contract passes; existing client tests may still pass because the old `[data-wiki-history-preview]` selector has been removed but no client behavior test exercises loading yet.

- [ ] **Step 5: Commit**

```bash
git add tests/wiki-history-page.test.js templates/wiki-history.tpl
git commit -m "feat: add wiki history compare template"
```

---

### Task 2: Client Data Flow For Rendered Before/After Compare

**Files:**
- Modify: `tests/wiki-history-page.test.js`
- Modify: `public/wiki-history.js`

- [ ] **Step 1: Add a focused JSDOM test for non-initial rendered comparison**

Append these tests near the existing history client tests in `tests/wiki-history-page.test.js`:

```js
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
      return { ok: true, json: async () => ({ response: { diff: "@@ -1 +1 @@\\n-<p>Before</p>\\n+<p>After</p>" } }) };
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
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node --test tests/wiki-history-page.test.js
```

Expected: failure because `public/wiki-history.js` still looks for `[data-wiki-history-preview]` and does not fetch the base revision detail.

- [ ] **Step 3: Implement revision detail cache and rendered compare rendering**

In `public/wiki-history.js`:

1. Replace `renderPreview(previewMount, previewHtml)` with:

```js
  function renderServerPreview(previewMount, previewHtml) {
    if (previewMount) {
      previewMount.innerHTML = String(previewHtml || "");
    }
  }

  function renderTextMessage(mount, message) {
    if (mount) {
      mount.textContent = message || "";
    }
  }

  function revisionLabel(revision, fallback) {
    return String(revision && revision.revisionId || fallback || "revision");
  }

  async function fetchRevisionDetail(state, revision) {
    if (!revision || !revision.revisionId) {
      return null;
    }
    if (!state.detailsByRevisionId[revision.revisionId]) {
      state.detailsByRevisionId[revision.revisionId] = fetchJson(`${apiBase()}/${encodeURIComponent(state.tid)}/${encodeURIComponent(revision.revisionId)}`);
    }
    return state.detailsByRevisionId[revision.revisionId];
  }
```

2. In `loadRevision`, replace the old `diffMount`/`previewMount` lookup and loading messages with:

```js
    const beforePreview = root.querySelector("[data-wiki-history-before-preview]");
    const afterPreview = root.querySelector("[data-wiki-history-after-preview]");
    const beforeLabel = root.querySelector("[data-wiki-history-before-label]");
    const afterLabel = root.querySelector("[data-wiki-history-after-label]");
    const diffMount = root.querySelector("[data-wiki-history-diff]");
    if (!beforePreview || !afterPreview || !diffMount) {
      return;
    }
```

and:

```js
    setStatus(root, "Loading revision...", "muted");
    renderTextMessage(beforePreview, "Loading previous revision...");
    renderTextMessage(afterPreview, "Loading selected revision...");
    renderDiff(diffMount, "Loading source diff...");
```

3. Replace the body of the `try` block in `loadRevision` with:

```js
      const detail = await fetchRevisionDetail(state, revision);
      const baseRevision = getDiffBaseRevision(state, revision);
      const baseDetail = baseRevision && baseRevision.revisionId ? await fetchRevisionDetail(state, baseRevision) : null;
      if (requestId !== state.requestId) {
        return;
      }

      state.selectedDetail = detail || null;
      state.baseDetail = baseDetail || null;

      if (baseDetail) {
        renderServerPreview(beforePreview, baseDetail.previewHtml || "");
        if (beforeLabel) {
          beforeLabel.textContent = revisionLabel(baseDetail.revision, baseRevision.revisionId);
        }
      } else {
        renderTextMessage(beforePreview, "Initial revision. No earlier rendered version is available.");
        if (beforeLabel) {
          beforeLabel.textContent = "No parent revision";
        }
      }

      renderServerPreview(afterPreview, detail.previewHtml || "");
      if (afterLabel) {
        afterLabel.textContent = revisionLabel(detail.revision, revision.revisionId);
      }

      if (baseRevision && baseRevision.revisionId) {
        const diff = await fetchJson(`${apiBase()}/${encodeURIComponent(state.tid)}/${encodeURIComponent(baseRevision.revisionId)}/${encodeURIComponent(revision.revisionId)}/diff`);
        if (requestId !== state.requestId) {
          return;
        }
        renderDiff(diffMount, diff.diff || "");
      } else {
        renderInitialSource(diffMount, detail.source || "");
      }

      root.querySelectorAll("[data-wiki-history-fullscreen-open]").forEach(function (button) {
        button.disabled = false;
      });

      const action = detail.revision && detail.revision.action ? detail.revision.action : "revision";
      setStatus(root, `Viewing ${action} ${revision.revisionId}`, "muted");
```

4. Add `detailsByRevisionId`, `selectedDetail`, and `baseDetail` to the `state` object in `initHistory`:

```js
      selectedRevision: null,
      selectedDetail: null,
      baseDetail: null,
      detailsByRevisionId: Object.create(null),
```

5. In the `catch` block, replace `previewMount.textContent = "";` with:

```js
      renderTextMessage(beforePreview, "");
      renderTextMessage(afterPreview, "");
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
node --test tests/wiki-history-page.test.js
```

Expected: all focused history-page tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/wiki-history-page.test.js public/wiki-history.js
git commit -m "feat: render wiki history before-after previews"
```

---

### Task 3: Colorized Source Diff And Initial Revision Source Mode

**Files:**
- Modify: `tests/wiki-history-page.test.js`
- Modify: `public/wiki-history.js`

- [ ] **Step 1: Add source safety and initial revision tests**

Append these tests to `tests/wiki-history-page.test.js`:

```js
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
      <div data-wiki-history-diff></div>
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
    return { ok: true, json: async () => ({ response: { diff: "Index: wiki-article.html\\n@@ -1 +1 @@\\n-<p>Before</p>\\n+<script>after()</script>" } }) };
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  const diffMount = dom.window.document.querySelector("[data-wiki-history-diff]");
  assert.equal(diffMount.querySelector("script"), null);
  assert.match(diffMount.textContent, /<script>after\(\)<\/script>/);
  assert.ok(diffMount.querySelector(".wiki-history-diff-line--meta"));
  assert.ok(diffMount.querySelector(".wiki-history-diff-line--remove"));
  assert.ok(diffMount.querySelector(".wiki-history-diff-line--add"));
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
    return { ok: true, json: async () => ({ response: { revision: { revisionId: "rev-1", action: "create" }, source: "<p>Initial</p>", previewHtml: "<p>Initial preview</p>" } }) };
  };

  dom.window.eval(client);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));

  assert.deepEqual(fetchCalls, ["/api/v3/plugins/westgate-wiki/revisions/42/rev-1"]);
  assert.match(dom.window.document.querySelector("[data-wiki-history-before-preview]").textContent, /Initial revision/);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-after-preview]").innerHTML, "<p>Initial preview</p>");
  assert.match(dom.window.document.querySelector("[data-wiki-history-diff]").textContent, /<p>Initial<\/p>/);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test tests/wiki-history-page.test.js
```

Expected: failure because `renderDiff` still writes plain text and `renderInitialSource` does not exist.

- [ ] **Step 3: Implement text-safe source rendering**

In `public/wiki-history.js`, replace `renderDiff(diffMount, diff)` with:

```js
  function clearNode(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function diffLineClass(line) {
    if (/^(Index:|={3,}|--- |\+\+\+ |@@ )/.test(line)) {
      return "wiki-history-diff-line--meta";
    }
    if (line.indexOf("-") === 0) {
      return "wiki-history-diff-line--remove";
    }
    if (line.indexOf("+") === 0) {
      return "wiki-history-diff-line--add";
    }
    return "";
  }

  function appendDiffLine(diffMount, line, lineNumber) {
    const row = document.createElement("div");
    const klass = diffLineClass(line);
    row.className = `wiki-history-diff-line${klass ? ` ${klass}` : ""}`;

    const gutter = document.createElement("span");
    gutter.className = "wiki-history-diff-line__gutter";
    gutter.textContent = String(lineNumber);

    const marker = document.createElement("span");
    marker.className = "wiki-history-diff-line__marker";
    marker.textContent = /^[+-]/.test(line) ? line.charAt(0) : "";

    const content = document.createElement("span");
    content.className = "wiki-history-diff-line__content";
    content.textContent = line;

    row.appendChild(gutter);
    row.appendChild(marker);
    row.appendChild(content);
    diffMount.appendChild(row);
  }

  function renderDiff(diffMount, diff) {
    if (!diffMount) {
      return;
    }
    clearNode(diffMount);
    const lines = String(diff || "").split(/\r?\n/);
    if (!String(diff || "").trim()) {
      diffMount.textContent = "No source changes.";
      return;
    }
    lines.forEach(function (line, index) {
      appendDiffLine(diffMount, line, index + 1);
    });
  }

  function renderInitialSource(diffMount, source) {
    renderDiff(diffMount, `Initial revision source\n${String(source || "")}`);
  }
```

- [ ] **Step 4: Run focused tests and verify they pass**

Run:

```bash
node --test tests/wiki-history-page.test.js
```

Expected: all focused history-page tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/wiki-history-page.test.js public/wiki-history.js
git commit -m "feat: colorize wiki history source diffs"
```

---

### Task 4: Tabs And Fullscreen Revision Viewer

**Files:**
- Modify: `tests/wiki-history-page.test.js`
- Modify: `public/wiki-history.js`

- [ ] **Step 1: Add tab and fullscreen behavior test**

Append this test to `tests/wiki-history-page.test.js`:

```js
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
  dom.window.fetch = async () => ({
    ok: true,
    json: async () => ({ response: { revision: { revisionId: "rev-1", action: "create" }, source: "<p>Initial source</p>", previewHtml: "<p>Initial preview</p>" } })
  });

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

  overlay.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(overlay.hidden, true);
  assert.equal(dom.window.document.activeElement, sourceOpen);

  const renderedOpen = dom.window.document.querySelector("[data-wiki-history-fullscreen-open=\"rendered\"]");
  renderedOpen.focus();
  renderedOpen.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(overlay.hidden, false);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-rendered]").hidden, false);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-rendered]").innerHTML, "<p>Initial preview</p>");

  dom.window.document.querySelector("[data-wiki-history-fullscreen-mode=\"source\"]").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-rendered]").hidden, true);
  assert.equal(dom.window.document.querySelector("[data-wiki-history-fullscreen-source]").hidden, false);

  dom.window.document.querySelector("[data-wiki-history-fullscreen-close]").dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  assert.equal(overlay.hidden, true);
  assert.equal(dom.window.document.activeElement, renderedOpen);
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
node --test tests/wiki-history-page.test.js
```

Expected: failure because tab handlers and fullscreen handlers are not implemented.

- [ ] **Step 3: Implement tabs and fullscreen**

In `public/wiki-history.js`, add these helpers before `loadRevision`:

```js
  function setActiveTab(root, activeTab) {
    const tabName = activeTab === "source" ? "source" : "rendered";
    root.querySelectorAll("[data-wiki-history-tab]").forEach(function (button) {
      const active = button.getAttribute("data-wiki-history-tab") === tabName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    root.querySelectorAll("[data-wiki-history-tab-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-wiki-history-tab-panel") !== tabName;
    });
  }

  function setFullscreenMode(root, mode) {
    const sourceMode = mode === "source";
    const rendered = root.querySelector("[data-wiki-history-fullscreen-rendered]");
    const source = root.querySelector("[data-wiki-history-fullscreen-source]");
    if (rendered) {
      rendered.hidden = sourceMode;
    }
    if (source) {
      source.hidden = !sourceMode;
    }
    root.querySelectorAll("[data-wiki-history-fullscreen-mode]").forEach(function (button) {
      const active = button.getAttribute("data-wiki-history-fullscreen-mode") === (sourceMode ? "source" : "rendered");
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function focusableElements(container) {
    return Array.from(container.querySelectorAll("a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex=\"-1\"])"))
      .filter(function (element) {
        return !element.hidden && element.offsetParent !== null || element.getAttribute("data-wiki-history-fullscreen-close") !== null;
      });
  }

  function closeFullscreen(root, state) {
    const overlay = root.querySelector("[data-wiki-history-fullscreen]");
    if (!overlay || overlay.hidden) {
      return;
    }
    overlay.hidden = true;
    document.body.classList.remove("wiki-history-fullscreen-open");
    const opener = state.fullscreenOpener;
    state.fullscreenOpener = null;
    if (opener && typeof opener.focus === "function") {
      opener.focus();
    }
  }

  function openFullscreen(root, state, mode, opener) {
    if (!state.selectedDetail) {
      return;
    }
    const overlay = root.querySelector("[data-wiki-history-fullscreen]");
    const rendered = root.querySelector("[data-wiki-history-fullscreen-rendered]");
    const source = root.querySelector("[data-wiki-history-fullscreen-source]");
    const meta = root.querySelector("[data-wiki-history-fullscreen-meta]");
    if (!overlay || !rendered || !source) {
      return;
    }
    state.fullscreenOpener = opener || document.activeElement;
    renderServerPreview(rendered, state.selectedDetail.previewHtml || "");
    source.textContent = String(state.selectedDetail.source || "");
    if (meta) {
      meta.textContent = `Viewing ${revisionLabel(state.selectedDetail.revision, state.selectedRevision && state.selectedRevision.revisionId)}`;
    }
    setFullscreenMode(root, mode);
    overlay.hidden = false;
    document.body.classList.add("wiki-history-fullscreen-open");
    const focusables = focusableElements(overlay);
    (focusables[0] || overlay).focus();
  }

  function handleFullscreenKeydown(root, state, event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeFullscreen(root, state);
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const overlay = root.querySelector("[data-wiki-history-fullscreen]");
    const focusables = overlay ? focusableElements(overlay) : [];
    if (!focusables.length) {
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
```

Then in `initHistory`, after restore/hard-purge handlers, add:

```js
    root.querySelectorAll("[data-wiki-history-tab]").forEach(function (button) {
      button.addEventListener("click", function () {
        setActiveTab(root, button.getAttribute("data-wiki-history-tab"));
      });
    });

    root.querySelectorAll("[data-wiki-history-fullscreen-open]").forEach(function (button) {
      button.addEventListener("click", function () {
        openFullscreen(root, state, button.getAttribute("data-wiki-history-fullscreen-open"), button);
      });
    });

    root.querySelectorAll("[data-wiki-history-fullscreen-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        setFullscreenMode(root, button.getAttribute("data-wiki-history-fullscreen-mode"));
      });
    });

    root.querySelectorAll("[data-wiki-history-fullscreen-close]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeFullscreen(root, state);
      });
    });

    const fullscreen = root.querySelector("[data-wiki-history-fullscreen]");
    if (fullscreen) {
      fullscreen.addEventListener("keydown", function (event) {
        handleFullscreenKeydown(root, state, event);
      });
    }
```

Add `fullscreenOpener: null` to the `state` object.

- [ ] **Step 4: Run focused tests and fix any JSDOM focus edge**

Run:

```bash
node --test tests/wiki-history-page.test.js
```

Expected: all focused history-page tests pass. If JSDOM reports `offsetParent` as always null and focusables are missed, simplify `focusableElements` to filter only `!element.hidden && !element.disabled`.

- [ ] **Step 5: Commit**

```bash
git add tests/wiki-history-page.test.js public/wiki-history.js
git commit -m "feat: add wiki history fullscreen viewer"
```

---

### Task 5: Westgate History Diff Styles

**Files:**
- Modify: `tests/wiki-history-page.test.js`
- Modify: `public/wiki.css`

- [ ] **Step 1: Add CSS contract assertions**

Append this test to `tests/wiki-history-page.test.js`:

```js
test("wiki history css styles compare tabs source diff rows and fullscreen viewer", () => {
  const css = readProjectFile("public/wiki.css");

  assert.match(css, /\.wiki-history-inspector\b/);
  assert.match(css, /\.wiki-history-tab\b/);
  assert.match(css, /\.wiki-history-compare\b/);
  assert.match(css, /\.wiki-history-compare-pane\b/);
  assert.match(css, /\.wiki-history-diff-line--add\b/);
  assert.match(css, /\.wiki-history-diff-line--remove\b/);
  assert.match(css, /\.wiki-history-diff-line--meta\b/);
  assert.match(css, /\.wiki-history-fullscreen\b/);
  assert.match(css, /\.wiki-history-fullscreen__dialog\b/);
  assert.match(css, /@media \(max-width: 991px\)[\s\S]*\.wiki-history-compare/);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
node --test tests/wiki-history-page.test.js
```

Expected: CSS contract test fails because the new selectors are not present.

- [ ] **Step 3: Replace the old history panel CSS**

In `public/wiki.css`, replace the existing `.wiki-history-panels`, `.wiki-history-panel`, `.wiki-history-diff, .wiki-history-preview`, and `.wiki-history-diff` rules with:

```css
.wiki-history-inspector {
  min-width: 0;
  padding: 1rem;
}

.wiki-history-inspector__bar,
.wiki-history-tabs,
.wiki-history-inspector__actions {
  align-items: center;
  display: flex;
  gap: 0.5rem;
}

.wiki-history-inspector__bar {
  border: 1px solid var(--wiki-chrome-surface-border, var(--bs-border-color, #dee2e6));
  border-bottom: 0;
  border-radius: var(--wiki-chrome-radius, var(--bs-border-radius, 0.375rem)) var(--wiki-chrome-radius, var(--bs-border-radius, 0.375rem)) 0 0;
  justify-content: space-between;
  padding: 0.65rem 0.75rem 0;
}

.wiki-history-tab {
  background: transparent;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: var(--wiki-chrome-radius, var(--bs-border-radius, 0.375rem)) var(--wiki-chrome-radius, var(--bs-border-radius, 0.375rem)) 0 0;
  color: var(--wiki-chrome-muted-color, var(--bs-secondary-color, inherit));
  padding: 0.55rem 0.75rem;
}

.wiki-history-tab:hover,
.wiki-history-tab:focus,
.wiki-history-tab.active {
  background: color-mix(in srgb, var(--wiki-chrome-link-color, var(--bs-link-color, #0d6efd)) 8%, transparent);
  border-color: var(--wiki-chrome-surface-border, var(--bs-border-color, #dee2e6));
  color: inherit;
  outline: none;
}

.wiki-history-tab-panel,
.wiki-history-compare-pane {
  border: 1px solid var(--wiki-chrome-surface-border, var(--bs-border-color, #dee2e6));
  min-width: 0;
}

.wiki-history-tab-panel {
  border-radius: 0 0 var(--wiki-chrome-radius, var(--bs-border-radius, 0.375rem)) var(--wiki-chrome-radius, var(--bs-border-radius, 0.375rem));
  overflow: hidden;
}

.wiki-history-compare {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  padding: 1rem;
}

.wiki-history-compare-pane {
  border-radius: var(--wiki-chrome-radius, var(--bs-border-radius, 0.375rem));
  overflow: hidden;
}

.wiki-history-compare-label {
  color: var(--wiki-chrome-muted-color, var(--bs-secondary-color, inherit));
  font-size: 0.75rem;
}

.wiki-history-diff,
.wiki-history-preview,
.wiki-history-fullscreen__source {
  margin: 0;
  overflow: auto;
}

.wiki-history-diff,
.wiki-history-preview {
  max-height: min(48rem, 72vh);
  min-height: 20rem;
  padding: 1rem;
}

.wiki-history-diff,
.wiki-history-fullscreen__source {
  background: color-mix(in srgb, var(--wiki-chrome-surface-bg, var(--bs-card-bg, #fff)) 92%, var(--bs-body-color, #212529) 4%);
  font-size: 0.8125rem;
}

.wiki-history-diff-line {
  display: grid;
  grid-template-columns: 3.25rem 1.5rem minmax(0, 1fr);
  margin-inline: -1rem;
  min-height: 1.45rem;
  padding-inline: 0.25rem 1rem;
}

.wiki-history-diff-line__gutter,
.wiki-history-diff-line__marker {
  color: var(--wiki-chrome-muted-color, var(--bs-secondary-color, inherit));
  user-select: none;
}

.wiki-history-diff-line__gutter {
  padding-right: 0.5rem;
  text-align: right;
}

.wiki-history-diff-line__content {
  font-family: var(--bs-font-monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.wiki-history-diff-line--meta {
  background: color-mix(in srgb, var(--wiki-chrome-link-color, var(--bs-link-color, #0d6efd)) 7%, transparent);
}

.wiki-history-diff-line--remove {
  background: color-mix(in srgb, var(--wiki-chrome-danger, var(--bs-danger, #dc3545)) 20%, transparent);
}

.wiki-history-diff-line--add {
  background: color-mix(in srgb, var(--bs-success, #198754) 22%, transparent);
}

.wiki-history-fullscreen[hidden] {
  display: none;
}

.wiki-history-fullscreen {
  inset: 0;
  position: fixed;
  z-index: 1080;
}

.wiki-history-fullscreen__backdrop {
  background: rgba(0, 0, 0, 0.74);
  inset: 0;
  position: absolute;
}

.wiki-history-fullscreen__dialog {
  background: var(--wiki-chrome-surface-bg, var(--bs-body-bg, #fff));
  border: 1px solid var(--wiki-chrome-surface-border, var(--bs-border-color, #dee2e6));
  border-radius: var(--wiki-chrome-radius, var(--bs-border-radius, 0.375rem));
  bottom: 2rem;
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  left: 2rem;
  min-width: 0;
  overflow: hidden;
  position: absolute;
  right: 2rem;
  top: 2rem;
}

.wiki-history-fullscreen__header {
  align-items: center;
  border-bottom: 1px solid var(--wiki-chrome-surface-border, var(--bs-border-color, #dee2e6));
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  padding: 1rem;
}

.wiki-history-fullscreen__header h2 {
  font-size: 1rem;
  margin: 0;
}

.wiki-history-fullscreen__meta {
  color: var(--wiki-chrome-muted-color, var(--bs-secondary-color, inherit));
  font-size: 0.8125rem;
  margin: 0.25rem 0 0;
}

.wiki-history-fullscreen__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.wiki-history-fullscreen__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.wiki-history-fullscreen__rendered,
.wiki-history-fullscreen__source {
  min-height: 100%;
  padding: clamp(1rem, 2vw, 2rem);
}

body.wiki-history-fullscreen-open {
  overflow: hidden;
}
```

Then update the existing mobile media block so it includes:

```css
  .wiki-history-compare {
    grid-template-columns: minmax(0, 1fr);
  }

  .wiki-history-inspector__bar,
  .wiki-history-fullscreen__header {
    align-items: stretch;
    flex-direction: column;
  }

  .wiki-history-fullscreen__dialog {
    bottom: 0.5rem;
    left: 0.5rem;
    right: 0.5rem;
    top: 0.5rem;
  }
```

- [ ] **Step 4: Run focused tests and verify they pass**

Run:

```bash
node --test tests/wiki-history-page.test.js
```

Expected: all focused history-page tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/wiki-history-page.test.js public/wiki.css
git commit -m "style: polish wiki history diff viewer"
```

---

### Task 6: Final Regression Verification

**Files:**
- Verify only unless failures require fixes.

- [ ] **Step 1: Run full plugin test suite**

Run:

```bash
npm test
```

Expected: syntax check passes and all tests pass.

- [ ] **Step 2: Rebuild NodeBB assets**

From the local NodeBB checkout:

```bash
cd /home/xtul/repos/nodebb
./nodebb build
```

Expected: asset compilation successful.

- [ ] **Step 3: Manual browser validation**

In the running local forum, visit a history page such as:

```text
http://localhost:4567/wiki/history/<tid>
```

Validate:

- selecting a non-initial revision shows before/after rendered previews
- source diff tab shows colored additions, removals, and metadata rows
- initial revision shows no-parent message and selected source
- fullscreen rendered view opens, closes, and shows the selected revision render
- fullscreen source view opens, closes, and shows raw source as text
- restore button still works after switching tabs and fullscreen modes
- mobile width stacks before/after panes without horizontal layout breakage

- [ ] **Step 4: Final status**

Run:

```bash
git status --short --branch
```

Expected: clean working tree on the implementation branch after commits.
