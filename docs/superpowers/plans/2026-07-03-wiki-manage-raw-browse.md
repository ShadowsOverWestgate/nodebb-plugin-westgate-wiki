# Wiki Manager Raw Browse Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/wiki/manage` page where wiki managers (admins + `wikiNamespaceCreateGroups` members) see every wiki topic raw — including orphans invisible to the canonical-tree resolver — with per-row diagnostic flags and delete actions wired to existing endpoints.

**Architecture:** One new uncached listing function in `lib/wiki-directory-service.js` (sibling of `getAllTopicSlugRows`, but keeping deleted/scheduled/tombstoned rows), one new controller + server-rendered template gated by the existing `isWikiNamespaceCreator` check, one new page route registered before the `/wiki/:path(*)` catch-all. Zero new API endpoints: tombstone reuses the global `[data-wiki-tombstone-page]` handler in `public/wiki.js`; restore/hard-purge is reached via each row's `/wiki/history/:tid` link.

**Tech Stack:** NodeBB v4 plugin (CommonJS, Benchpress templates), `node:test`-style tests run by `node scripts/test.mjs` (`npm test`).

**Spec:** `docs/wiki-admin-raw-browse-tool-spec.md` (revised 2026-07-03).

## Global Constraints

- Settings key `wikiNamespaceCreateGroups` must NOT be renamed (ACP label/copy only; no settings migration).
- ACP section label becomes exactly: **"Wiki manager groups"**.
- Page route is exactly `/wiki/manage`; `manage` must be added to every `RESERVED_FIRST_SEGMENTS` set (4 files: `lib/wiki-paths.js`, `lib/wiki-tree-index.js`, `lib/wiki-path-migration.js`, `lib/wiki-archive-manifest.js`).
- The manage listing must never call the canonical-tree resolver (`resolveWikiNode` / `listWikiNodeChildren`).
- No new dependencies. No new API routes. No changes to `plugin.json`.
- Never commit to `main` — all work happens on the feature branch created in Task 1.
- Tests must assert behavior, not incidental wording/ordering (repo `AGENTS.md` rule).
- Manual runtime verification needs a NodeBB instance: restart NodeBB after route changes, rebuild assets after template changes. If unavailable, say so explicitly at the end.

---

### Task 1: Raw topic rows helper (`getRawTopicRows`)

**Files:**
- Modify: `lib/wiki-directory-service.js` (add function after `getAllTopicSlugRows`, ~line 500, and add to `module.exports`)
- Test: `tests/wiki-manage-page.test.js` (new)

**Interfaces:**
- Produces: `wikiDirectory.getRawTopicRows(parsedCid: number) -> Promise<Array<topicRow>>` where `topicRow` has fields `tid, cid, uid, mainPid, title, titleRaw, slug, westgateWikiPageSlug, postcount, timestamp, deleted, scheduled` plus tombstone fields (`wikiTombstones.TOMBSTONE_FIELDS`). Includes deleted, scheduled, and tombstoned rows. Uncached.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feature/wiki-manage-raw-browse
```

- [ ] **Step 2: Write the failing test**

Create `tests/wiki-manage-page.test.js`. The stub pattern is copied from `tests/wiki-directory-stale-count.test.js` (global `require.main.require` interception; stubs must be installed before any project module is required):

```js
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const state = {
  isAdmin: true,
  settings: { categoryIds: "41", includeChildCategories: "1", wikiNamespaceCreateGroups: "" },
  categories: new Map([
    [41, { cid: 41, name: "Codebase", slug: "41/codebase", parentCid: 0 }],
    [78, { cid: 78, name: "xtulmeboy", slug: "78/xtulmeboy", parentCid: 41 }]
  ]),
  childrenByCid: new Map([[41, [78]], [78, []]]),
  topics: new Map([
    [3733, { tid: 3733, cid: 41, title: "Codebase documentation", slug: "3733/codebase-documentation", deleted: 0, scheduled: 0, postcount: 1, timestamp: 1751500000000 }],
    [3734, { tid: 3734, cid: 41, title: "Codebase documentation", slug: "3734/codebase-documentation", deleted: 0, scheduled: 0, postcount: 1, timestamp: 1751500001000 }],
    [3735, { tid: 3735, cid: 41, title: "Codebase documentation", slug: "3735/codebase-documentation", deleted: 0, scheduled: 0, postcount: 1, timestamp: 1751500002000, westgateWikiTombstoned: "1" }],
    [3736, { tid: 3736, cid: 41, title: "Old draft", slug: "3736/old-draft", deleted: 1, scheduled: 0, postcount: 1, timestamp: 1751500003000 }]
  ]),
  tidsByCid: new Map([[41, [3733, 3734, 3735, 3736]], [78, []]]),
  notAllowed: 0,
  render: null
};

const originalMainRequire = require.main.require.bind(require.main);

function rangeForCid(key) {
  const m = String(key || "").match(/^cid:(\d+):tids$/);
  return m ? (state.tidsByCid.get(parseInt(m[1], 10)) || []) : [];
}

function sortedSetSlice(key, start, stop) {
  const rows = rangeForCid(key);
  const from = Math.max(0, parseInt(start, 10) || 0);
  const parsedStop = parseInt(stop, 10);
  const to = parsedStop === -1 ? rows.length : parsedStop + 1;
  return rows.slice(from, to);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    "./src/categories": {
      getCategoryData: async (cid) => state.categories.get(parseInt(cid, 10)) || null,
      getChildren: async (cids) => (Array.isArray(cids) ? cids : []).map((cid) => {
        const parsedCid = parseInt(cid, 10);
        return [...state.categories.values()].filter((category) => parseInt(category.parentCid, 10) === parsedCid);
      }),
      getChildrenCids: async (cid) => state.childrenByCid.get(parseInt(cid, 10)) || []
    },
    "./src/controllers/helpers": {
      formatApiResponse: () => {},
      notAllowed: () => {
        state.notAllowed += 1;
      }
    },
    "./src/database": {
      getSortedSetRange: async (key, start, stop) => sortedSetSlice(key, start, stop),
      getSortedSetRevRange: async (key, start, stop) => sortedSetSlice(key, start, stop),
      sortedSetCard: async (key) => rangeForCid(key).length,
      getObjectField: async () => null,
      getObject: async () => ({})
    },
    "./src/groups": {
      isMemberOfGroups: async () => []
    },
    "./src/meta": {
      settings: {
        get: async () => state.settings,
        setOnEmpty: async () => {},
        set: async () => {}
      }
    },
    "./src/privileges": {
      categories: {
        get: async () => ({ read: true, "topics:read": true, "topics:create": true })
      },
      topics: {
        filterTids: async (privilege, tids) => (Array.isArray(tids) ? tids : [])
      }
    },
    "./src/slugify": slugify,
    "./src/topics": {
      getTopicData: async (tid) => state.topics.get(parseInt(tid, 10)) || null,
      getTopicsFields: async (tids) => tids.map((tid) => state.topics.get(parseInt(tid, 10))).filter(Boolean)
    },
    "./src/user": {
      isAdministrator: async () => state.isAdmin,
      isGlobalModerator: async () => false
    },
    "./src/utils": {
      isNumber: (value) => value !== "" && !Number.isNaN(parseFloat(value)),
      toISOString: (timestamp) => new Date(parseInt(timestamp, 10)).toISOString()
    },
    "nconf": {
      get: (key) => (key === "relative_path" ? "" : undefined)
    }
  };

  return stubs[id] || originalMainRequire(id);
};

const config = require("../lib/config");
const wikiDirectory = require("../lib/wiki-directory-service");

test("wiki manage raw browse", async (t) => {
  config.invalidateSettingsCache();
  wikiDirectory.invalidateAllWikiCaches();

  await t.test("getRawTopicRows keeps tombstoned and deleted rows", async () => {
    const rows = await wikiDirectory.getRawTopicRows(41);
    assert.deepEqual(
      rows.map((row) => parseInt(row.tid, 10)).sort(),
      [3733, 3734, 3735, 3736],
      "raw listing must include live, tombstoned, and deleted topics"
    );
    const first = rows.find((row) => parseInt(row.tid, 10) === 3733);
    assert.ok(first.slug, "rows must carry the topic slug for /topic links");
    assert.ok(first.timestamp, "rows must carry a creation timestamp");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test tests/wiki-manage-page.test.js`
Expected: FAIL — `wikiDirectory.getRawTopicRows is not a function`.

- [ ] **Step 4: Implement `getRawTopicRows`**

In `lib/wiki-directory-service.js`, directly after `getAllTopicSlugRows` (which ends around line 500):

```js
/**
 * Raw rows for the wiki manager view: every topic in the category's tids set,
 * including deleted, scheduled, and tombstoned topics. Canonical-path
 * independent. ponytail: uncached — diagnostic surface, low traffic.
 */
async function getRawTopicRows(parsedCid) {
  const tids = await db.getSortedSetRange(`cid:${parsedCid}:tids`, 0, -1);
  if (!Array.isArray(tids) || !tids.length) {
    return [];
  }

  const rows = [];
  for (let i = 0; i < tids.length; i += FETCH_BATCH) {
    const slice = tids.slice(i, i + FETCH_BATCH);
    const chunk = await topics.getTopicsFields(slice, [
      "tid",
      "cid",
      "uid",
      "mainPid",
      "title",
      "titleRaw",
      "slug",
      "westgateWikiPageSlug",
      "postcount",
      "timestamp",
      "deleted",
      "scheduled",
      ...wikiTombstones.TOMBSTONE_FIELDS
    ]);
    rows.push(...chunk.filter(Boolean));
  }
  return rows;
}
```

Add `getRawTopicRows` to the file's `module.exports` object (keep alphabetical/local ordering conventions of that export block).

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/wiki-manage-page.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/wiki-directory-service.js tests/wiki-manage-page.test.js
git commit -m "feat: raw topic listing helper for wiki manage view"
```

---

### Task 2: Manage controller (`renderManage`)

**Files:**
- Create: `lib/controllers/wiki-manage.js`
- Test: `tests/wiki-manage-page.test.js` (extend)

**Interfaces:**
- Consumes: `wikiDirectory.getRawTopicRows(parsedCid)` (Task 1); existing `wikiNamespaceCreators.getCanCreateWikiNamespaces(uid)`, `wikiPaths.getTopicSlugLeaf(topic)` / `wikiPaths.getTopicSlugLeafCounts(rows)`, `wikiTombstones.isTombstonedTopic(topic)`, `config.getSettings()`.
- Produces: `renderManage(req, res) -> Promise<void>` rendering template `"wiki-manage"` with data:
  - `title: string`, `isAdmin: boolean`, `hasNamespaces: boolean`
  - `namespaces: Array<{ cid, name, depth: number, indentRem: number, acpUrl: string, rows: Array<row>, hasRows: boolean, rowCount: number }>` ordered parent-first (raw `parentCid` tree, not canonical paths)
  - `row: { tid, title, slugLeaf, topicUrl, historyUrl, postcount, timestampISO, deleted, scheduled, tombstoned, collision, hasFlags }`

- [ ] **Step 1: Extend the test with failing controller subtests**

Append inside the `test("wiki manage raw browse", ...)` block of `tests/wiki-manage-page.test.js` (after the Task 1 subtest):

```js
  const controller = require("../lib/controllers/wiki-manage");
  const resStub = {
    render(tpl, data) {
      state.render = { tpl, data };
    }
  };

  await t.test("non-managers are refused", async () => {
    state.isAdmin = false;
    state.notAllowed = 0;
    state.render = null;
    await controller.renderManage({ uid: 5 }, resStub);
    assert.equal(state.notAllowed, 1);
    assert.equal(state.render, null);
  });

  await t.test("managers see the raw tree with diagnostic flags", async () => {
    state.isAdmin = true;
    state.render = null;
    await controller.renderManage({ uid: 1 }, resStub);

    assert.ok(state.render, "page must render for managers");
    assert.equal(state.render.tpl, "wiki-manage");

    const namespaces = state.render.data.namespaces;
    const ns41 = namespaces.find((ns) => parseInt(ns.cid, 10) === 41);
    const ns78 = namespaces.find((ns) => parseInt(ns.cid, 10) === 78);
    assert.ok(ns41 && ns78, "every effective wiki category appears");
    assert.ok(ns78.depth > ns41.depth, "child namespaces are nested under parents");
    assert.ok(
      namespaces.indexOf(ns78) > namespaces.indexOf(ns41),
      "children are listed after their parent"
    );

    const byTid = new Map(ns41.rows.map((row) => [parseInt(row.tid, 10), row]));
    assert.ok(byTid.has(3735), "tombstoned rows are visible");
    assert.ok(byTid.has(3736), "deleted rows are visible");
    assert.equal(byTid.get(3733).collision, true, "duplicate slug leaves are flagged as collisions");
    assert.equal(byTid.get(3734).collision, true);
    assert.equal(byTid.get(3735).tombstoned, true);
    assert.equal(byTid.get(3735).collision, false, "tombstoned rows do not count toward collisions");
    assert.equal(byTid.get(3736).deleted, true);
    assert.ok(byTid.get(3733).topicUrl.includes("/topic/"), "rows link to the raw forum topic URL");
    assert.ok(byTid.get(3733).historyUrl.includes("/wiki/history/3733"), "rows link to the history page");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/wiki-manage-page.test.js`
Expected: FAIL — `Cannot find module '../lib/controllers/wiki-manage'`.

- [ ] **Step 3: Implement the controller**

Create `lib/controllers/wiki-manage.js`:

```js
"use strict";

const categories = require.main.require("./src/categories");
const helpers = require.main.require("./src/controllers/helpers");
const user = require.main.require("./src/user");
const utils = require.main.require("./src/utils");

const config = require("../config");
const wikiDirectory = require("../wiki-directory-service");
const wikiNamespaceCreators = require("../wiki-namespace-creators");
const wikiPaths = require("../wiki-paths");
const wikiTombstones = require("../wiki-tombstones");

/**
 * Raw parentCid tree over the effective wiki categories — deliberately NOT the
 * canonical-tree resolver, so broken/stray namespaces stay visible.
 */
function orderNamespaceTree(categoryRows) {
  const byCid = new Map();
  const childrenOf = new Map();
  const roots = [];

  categoryRows.forEach((row) => {
    byCid.set(parseInt(row.cid, 10), row);
  });
  categoryRows.forEach((row) => {
    const parentCid = parseInt(row.parentCid, 10) || 0;
    if (byCid.has(parentCid)) {
      childrenOf.set(parentCid, (childrenOf.get(parentCid) || []).concat(row));
    } else {
      roots.push(row);
    }
  });

  const ordered = [];
  const seen = new Set();
  function visit(row, depth) {
    const cid = parseInt(row.cid, 10);
    if (seen.has(cid)) {
      return;
    }
    seen.add(cid);
    ordered.push({ row, depth });
    (childrenOf.get(cid) || []).forEach((child) => visit(child, depth + 1));
  }
  roots.forEach((row) => visit(row, 0));
  return ordered;
}

function serializeRawRow(topic, leafCounts, tombstoned) {
  const slugLeaf = wikiPaths.getTopicSlugLeaf(topic);
  const deleted = !!parseInt(topic.deleted, 10);
  const scheduled = !!parseInt(topic.scheduled, 10);
  const collision = !tombstoned && !deleted && !scheduled &&
    !!slugLeaf && (leafCounts.get(slugLeaf) || 0) > 1;

  return {
    tid: topic.tid,
    title: String(topic.titleRaw || topic.title || ""),
    slugLeaf,
    topicUrl: `/topic/${topic.slug}`,
    historyUrl: `/wiki/history/${topic.tid}`,
    postcount: parseInt(topic.postcount, 10) || 0,
    timestampISO: topic.timestamp ? utils.toISOString(topic.timestamp) : "",
    deleted,
    scheduled,
    tombstoned,
    collision,
    hasFlags: deleted || scheduled || tombstoned || collision
  };
}

async function renderManage(req, res) {
  if (!(await wikiNamespaceCreators.getCanCreateWikiNamespaces(req.uid))) {
    return helpers.notAllowed(req, res);
  }

  const [settings, isAdmin] = await Promise.all([
    config.getSettings(),
    user.isAdministrator(req.uid)
  ]);
  const categoryRows = (await Promise.all(
    settings.effectiveCategoryIds.map((cid) => categories.getCategoryData(cid))
  )).filter(Boolean);

  const namespaces = [];
  for (const { row, depth } of orderNamespaceTree(categoryRows)) {
    const rawRows = await wikiDirectory.getRawTopicRows(parseInt(row.cid, 10));
    const liveRows = rawRows.filter((topic) => !wikiTombstones.isTombstonedTopic(topic));
    const leafCounts = wikiPaths.getTopicSlugLeafCounts(liveRows);
    const rows = rawRows.map((topic) => serializeRawRow(
      topic,
      leafCounts,
      wikiTombstones.isTombstonedTopic(topic)
    ));

    namespaces.push({
      cid: row.cid,
      name: row.name,
      depth,
      indentRem: depth * 1.5,
      acpUrl: `/admin/manage/categories/${row.cid}`,
      rows,
      hasRows: rows.length > 0,
      rowCount: rows.length
    });
  }

  res.render("wiki-manage", {
    title: "Wiki manager | Westgate Wiki",
    isAdmin,
    namespaces,
    hasNamespaces: namespaces.length > 0
  });
}

module.exports = {
  renderManage
};
```

Verify against the real codebase while implementing: `wikiTombstones.isTombstonedTopic` and `wikiPaths.getTopicSlugLeafCounts` are exported (both are — used in `lib/wiki-directory-service.js` and exported from `lib/wiki-paths.js:628`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/wiki-manage-page.test.js`
Expected: PASS (all three subtests).

- [ ] **Step 5: Commit**

```bash
git add lib/controllers/wiki-manage.js tests/wiki-manage-page.test.js
git commit -m "feat: wiki manage controller with raw namespace tree and row flags"
```

---

### Task 3: Route, reserved segment, and template

**Files:**
- Modify: `routes/wiki.js` (import + one route registration before the `/wiki/:path(*)` catch-all at `routes/wiki.js:611`)
- Modify: `lib/wiki-paths.js:11`, `lib/wiki-tree-index.js:8`, `lib/wiki-path-migration.js:9`, `lib/wiki-archive-manifest.js:57` (add `"manage"` to each `RESERVED_FIRST_SEGMENTS` set)
- Create: `templates/wiki-manage.tpl`
- Test: `tests/wiki-manage-page.test.js` (extend)

**Interfaces:**
- Consumes: `renderManage` from Task 2; existing `routeHelpers.setupPageRoute`, `middleware.ensureLoggedIn`; the global `[data-wiki-tombstone-page]` click handler in `public/wiki.js:1237` (fires `PUT /api/v3/plugins/westgate-wiki/page/tombstone` and redirects to `data-redirect-href`).
- Produces: page at `/wiki/manage`; path segment `manage` reserved so namespaces can't shadow it.

- [ ] **Step 1: Extend the test with a failing reserved-segment assertion**

Append inside the `test(...)` block of `tests/wiki-manage-page.test.js`:

```js
  await t.test("the manage route segment is reserved", async () => {
    const wikiPaths = require("../lib/wiki-paths");
    assert.ok(
      wikiPaths.RESERVED_FIRST_SEGMENTS.has("manage"),
      "no wiki namespace may claim the /wiki/manage path"
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/wiki-manage-page.test.js`
Expected: FAIL on the new subtest (`manage` not in the set).

- [ ] **Step 3: Reserve the segment**

Add `"manage",` to the `RESERVED_FIRST_SEGMENTS` set literal in each of the four files (the sets are duplicated constants; keep each file's existing entry ordering style):

- `lib/wiki-paths.js:11`
- `lib/wiki-tree-index.js:8`
- `lib/wiki-path-migration.js:9`
- `lib/wiki-archive-manifest.js:57`

- [ ] **Step 4: Register the route**

In `routes/wiki.js`, add the import near the other controller imports (top of file):

```js
const wikiManageController = require("../lib/controllers/wiki-manage");
```

Register the page next to the history route (`routes/wiki.js:609`), before the `/wiki/:path(*)` catch-all:

```js
routeHelpers.setupPageRoute(router, "/wiki/manage", [middleware.ensureLoggedIn], wikiManageController.renderManage);
```

- [ ] **Step 5: Create the template**

Create `templates/wiki-manage.tpl` (Benchpress legacy syntax to match the repo; `{config.relative_path}` prefixes on all hrefs; the tombstone button reuses the site-wide handler from `public/wiki.js` via `data-wiki-tombstone-page`):

```html
<div class="wiki-manage-page container py-3">
  <h1 class="h3 mb-1">Wiki manager — raw browse</h1>
  <p class="text-muted">
    Diagnostic view of every wiki topic, read straight from category topic sets.
    Rows flagged here may be invisible in normal wiki navigation. Delete actions
    still require the usual topic privileges.
  </p>

  <!-- IF !hasNamespaces -->
  <div class="alert alert-info">No wiki namespaces are configured.</div>
  <!-- ENDIF !hasNamespaces -->

  <!-- BEGIN namespaces -->
  <section class="mb-4" style="margin-left: {./indentRem}rem;">
    <h2 class="h5 d-flex align-items-center gap-2 flex-wrap">
      <span>{./name}</span>
      <span class="text-muted small">cid {./cid} &middot; {./rowCount} topics</span>
      <!-- IF isAdmin -->
      <a class="small" href="{config.relative_path}{./acpUrl}">Manage category (ACP)</a>
      <!-- ENDIF isAdmin -->
    </h2>
    <!-- IF ./hasRows -->
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead>
          <tr>
            <th>tid</th>
            <th>Title</th>
            <th>Slug leaf</th>
            <th>Flags</th>
            <th>Posts</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <!-- BEGIN ./rows -->
          <tr>
            <td>{./tid}</td>
            <td><a href="{config.relative_path}{./topicUrl}">{./title}</a></td>
            <td><code>{./slugLeaf}</code></td>
            <td>
              <!-- IF ./collision --><span class="badge bg-danger">collision</span><!-- ENDIF ./collision -->
              <!-- IF ./tombstoned --><span class="badge bg-secondary">tombstoned</span><!-- ENDIF ./tombstoned -->
              <!-- IF ./deleted --><span class="badge bg-warning text-dark">deleted</span><!-- ENDIF ./deleted -->
              <!-- IF ./scheduled --><span class="badge bg-info text-dark">scheduled</span><!-- ENDIF ./scheduled -->
            </td>
            <td>{./postcount}</td>
            <td><span class="timeago" title="{./timestampISO}"></span></td>
            <td class="text-nowrap">
              <a class="btn btn-sm btn-outline-secondary" href="{config.relative_path}{./historyUrl}">History</a>
              <!-- IF !./tombstoned -->
              <button
                type="button"
                class="btn btn-sm btn-outline-danger"
                data-wiki-tombstone-page="1"
                data-tid="{./tid}"
                data-redirect-href="{config.relative_path}/wiki/manage"
              >Tombstone</button>
              <!-- ENDIF !./tombstoned -->
            </td>
          </tr>
          <!-- END ./rows -->
        </tbody>
      </table>
    </div>
    <!-- ELSE -->
    <p class="text-muted small">No topics.</p>
    <!-- ENDIF ./hasRows -->
  </section>
  <!-- END namespaces -->
</div>
```

No `plugin.json` change is needed: `"templates": "templates"` auto-registers the template, and `public/wiki.js` (which owns the tombstone handler) is already a site-wide script.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS, including `tests/wiki-manage-page.test.js`. If any existing test asserts the exact contents of `RESERVED_FIRST_SEGMENTS`, inspect it — per repo `AGENTS.md` such a test should tolerate additions; fix the test only if it violates that rule, and note it in the commit message.

- [ ] **Step 7: Commit**

```bash
git add routes/wiki.js lib/wiki-paths.js lib/wiki-tree-index.js lib/wiki-path-migration.js lib/wiki-archive-manifest.js templates/wiki-manage.tpl tests/wiki-manage-page.test.js
git commit -m "feat: /wiki/manage raw browse page for wiki managers"
```

---

### Task 4: ACP section rename

**Files:**
- Modify: `templates/admin/plugins/westgate-wiki.tpl:273-277` (label + help copy only)

**Interfaces:**
- Consumes: nothing from other tasks (independent copy change; a reviewer could approve it alone).
- Produces: renamed ACP section. The input id/name `wikiNamespaceCreateGroups`, the `data-wiki-namespace-creator-group` checkbox hooks, and the "Stored group names" textarea are load-bearing for `public/admin.js` — do NOT change them.

- [ ] **Step 1: Update the label and help text**

In `templates/admin/plugins/westgate-wiki.tpl`, replace:

```html
          <label class="form-label mb-2" for="wikiNamespaceCreateGroups">Groups allowed to create wiki namespaces</label>
          <p class="form-text">
            <strong>Administrators</strong> can always create child namespaces from the wiki. Members of the groups selected below
            may also use <strong>Create child namespace</strong>. Leave all unchecked for administrators only.
          </p>
```

with:

```html
          <label class="form-label mb-2" for="wikiNamespaceCreateGroups">Wiki manager groups</label>
          <p class="form-text">
            <strong>Administrators</strong> always have wiki manager rights. Members of the groups selected below can also
            use <strong>Create child namespace</strong> and the raw wiki management view at <code>/wiki/manage</code>.
            Leave all unchecked for administrators only. Destructive actions in the management view still require the
            usual topic privileges.
          </p>
```

- [ ] **Step 2: Confirm nothing else references the old label**

Run: `grep -rn "Groups allowed to create wiki namespaces" lib routes public templates tests`
Expected: no matches.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS (copy-only change; no test asserts ACP wording per repo `AGENTS.md`).

- [ ] **Step 4: Commit**

```bash
git add templates/admin/plugins/westgate-wiki.tpl
git commit -m "docs: rename ACP section to wiki manager groups"
```

---

### Task 5: Final verification and wrap-up

**Files:**
- None new (verification + diff review).

- [ ] **Step 1: Run the full suite one last time**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Review the diff**

Run: `git diff main...HEAD --stat` and read through `git diff main...HEAD`.
Confirm scope: only the files named in Tasks 1–4 changed; no canonical-resolver call was added to the manage path; no `plugin.json` change; no settings-key rename.

- [ ] **Step 3: Manual runtime check (needs a NodeBB instance)**

If a dev/staging NodeBB is available: restart NodeBB (new route + controller) and rebuild assets (new template), then verify:

1. As an admin: `/wiki/manage` renders; cid 41 shows tids 3733–3735 with collision/tombstone badges; cid 78 shows 3737–3739.
2. As a member of a configured manager group (non-admin): page renders; ACP category links are hidden.
3. As a regular user: `/wiki/manage` returns not-allowed.
4. Tombstone button on an orphan row works and redirects back to `/wiki/manage`; the row now shows the tombstoned badge and a History link for hard-purge.
5. A namespace named "Manage" cannot be created at the wiki root (reserved segment).

If no instance is available, state explicitly that runtime verification was not performed and list these five checks as the acceptance script.

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch — do not merge or push without the user's say-so. Suggested PR title: "Wiki manager raw browse tool (/wiki/manage)".

## Self-Review Notes

- Spec coverage: read side → Tasks 1–3; delete side (reuse, no new endpoints) → Task 3 template wiring; scope guard/gating → Task 2; ACP rename → Task 4; reserved segment → Task 3; production cleanup is explicitly out of scope (spec "Next steps #4").
- Known simplifications (deliberate): `getRawTopicRows` is uncached; the page renders the whole tree with no pagination (`ponytail:` ceiling — paginate per-namespace if a wiki outgrows one page); delete buttons render for all managers and rely on the endpoints' server-side 403s rather than per-row privilege checks.
