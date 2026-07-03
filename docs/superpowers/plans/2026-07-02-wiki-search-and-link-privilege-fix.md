# Wiki Global Search + Link-Privilege Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make wiki articles findable in NodeBB global search without touching feeds/unread, and fix the wiki-forum-link privilege bug so cached link HTML is never poisoned by a viewer-specific decision.

**Architecture:** Two independent parts, sharing one plan because both were designed the same day and cross-checked against each other (see each spec's "Cross-check" section — confirmed no code collision). They touch disjoint files and can be executed, reviewed, and committed independently.

- **Part A (search):** invert the existing "strip all wiki" hooks in `lib/filter-forum-search.js` to "keep wiki article main-posts only," then use a **new, search-scoped result hook** (`filter:search.contentGetResult`) to tag survivors with `isWikiArticle`/`wikiPath` — reusing the plugin's existing short-lived pid-hydration-grant mechanism so the shared `filterPostGetPostSummaryByPids` feed filter needs **zero changes**.
- **Part B (link privilege bug):** `lib/wiki-links.js` decides whether to render a working `/wiki/...` link by checking topic-read privilege for "the current viewer" — but core never populates the uid core hook payload reads, so this has always silently evaluated as guest (uid 0), and that guest-computed result gets baked into NodeBB's per-`pid|type` parse cache for every subsequent viewer. Fix: stop pretending this is viewer-aware. Make the guest-uid reference **explicit and intentional** (a named constant, not an accidental `undefined` fallthrough), delete the dead `data.uid`/`data.req.uid` reads, and document that real per-viewer enforcement already happens correctly at the `/wiki/*` route (confirmed: `routes/wiki.js` passes real `req.uid` into `wikiPaths.resolveWikiNode`, a separate code path from `wiki-links.js`).

**Tech Stack:** Node.js NodeBB plugin, `node:test` + `node:assert/strict`, `require.main.require` stubbing pattern (see `tests/filter-forum-feeds.test.js` for the established convention).

## Global Constraints

- Preserve NodeBB core behavior; wiki logic stays isolated in plugin-owned modules (`AGENTS.md` rules 1, 3).
- Do not change `lib/filter-forum-feeds.js`'s existing wiki-stripping behavior — feeds/unread/recent must stay wiki-free (locked decision in the search design spec).
- Do not touch `lib/wiki-search-service.js` (separate title/path autocomplete surface — explicit non-goal).
- No new dependency, no new search engine, no new index — reuse `nodebb-plugin-dbsearch` (locked decision).
- Reply scope for search indexing is article body only (`topic.mainPid`); wiki discussion replies never indexed (locked decision).
- Bug B (guest lost `topics:read` on cid 41) is an **ACP configuration fix**, not code — out of scope for this plan, left to vicky to apply directly.
- Theme rendering (badge + link rewrite in `sow-nodebb-theme`) is **out of scope for this repo's plan** — Part A ships a data contract (`isWikiArticle`, `wikiPath` on search result post objects); the theme-side consumption is tracked as a follow-up in that repo, not implemented here.

## File Structure

**Part A — search:**
- Modify: `lib/filter-forum-search.js` — invert index hooks from strip-all to keep-article-only; add new `filterSearchContentGetResult` handler for the result-tagging hook.
- Modify: `lib/forum-exclusion-service.js` — no functional change; reused as-is (`getWikiCidSet`, `grantPidHydration`).
- Modify: `plugin.json` — add hook wiring for `filter:search.contentGetResult`.
- Test: `tests/filter-forum-search.test.js` (new file).

**Part B — link privilege fix:**
- Modify: `lib/wiki-links.js` — replace `getParseViewerUid`/`normalizeViewerContext(undefined)` fallthrough with an explicit reference-viewer constant; delete dead uid-reading code.
- Test: `tests/wiki-links-parse-viewer.test.js` (new file).

**Docs:**
- Modify: `docs/superpowers/specs/2026-07-02-wiki-global-search-design.md` — mark the "Open decision for planning" as resolved (already partly done; plan will finalize it in Task 1).
- Modify: `docs/wiki-forum-link-privilege-bug-spec.md` — mark the code-fix decision as chosen.

---

## Part A: Wiki Articles in Global Search

### Task 1: Invert index-time hooks to keep-article-only

**Files:**
- Modify: `lib/filter-forum-search.js`
- Test: `tests/filter-forum-search.test.js` (new)

**Interfaces:**
- Consumes: `forumExclusion.getWikiCidSet()`, `posts.getPostsFields(pids, fields)`, `topics.getTopicsFields(tids, fields)` — all already used elsewhere in this plugin (`lib/forum-exclusion-service.js`, `lib/filter-forum-feeds.js`).
- Produces: `filterSearchIndexTopics(data)`, `filterSearchIndexPosts(data)` — same names/signatures as today, behavior inverted. `filterSearchInContent` and `filterSearchContentGetResult` are defined in Task 2/3 in the same file.

Today, `filterSearchIndexTopics`/`filterSearchIndexPosts` call `forumExclusion.filterParallelArraysByTopics`/`filterParallelArraysByPosts`, which **drop** every row whose topic/post is in a wiki category. We need the opposite for posts: keep a wiki post only when it is its topic's `mainPid`; topics (titles) can stay fully permissive — the design spec's Decisions table says wiki titles become searchable with no reply-scope restriction on titles (only post/body content is reply-scoped).

- [ ] **Step 1: Write the failing test for title indexing (no change) and post-content indexing (keep-mainPid-only)**

```js
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const root = process.cwd();
const originalMainRequire = require.main.require.bind(require.main);

function clearForumSearchModules() {
  [
    "lib/filter-forum-search.js",
    "lib/forum-exclusion-service.js",
    "lib/config.js"
  ].forEach((relativePath) => {
    const filename = require.resolve(`${root}/${relativePath}`);
    delete require.cache[filename];
  });
}

async function withForumSearchStubs(fn) {
  const topicRows = new Map([
    ["10", { tid: 10, cid: 1, mainPid: 100 }], // wiki article topic
    ["20", { tid: 20, cid: 5, mainPid: 200 }] // forum topic
  ]);
  const postRows = new Map([
    ["100", { pid: 100, tid: 10 }], // wiki article main post
    ["101", { pid: 101, tid: 10 }], // wiki reply — must be dropped
    ["200", { pid: 200, tid: 20 }] // forum post
  ]);

  const stubs = {
    "./src/meta": {
      settings: {
        get: async () => ({ categoryIds: "1", includeChildCategories: "0" })
      }
    },
    "./src/posts": {
      getPostsFields: async (pids) => pids.map((pid) => postRows.get(String(pid)) || { pid, tid: undefined })
    },
    "./src/topics": {
      getTopicsFields: async (tids) => tids.map((tid) => topicRows.get(String(tid)) || { tid, cid: undefined })
    }
  };

  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };

  try {
    clearForumSearchModules();
    const forumSearch = require("../lib/filter-forum-search");
    await fn(forumSearch);
  } finally {
    require.main.require = originalMainRequire;
    clearForumSearchModules();
  }
}

test("index topics hook no longer strips wiki topics from title index", async () => {
  await withForumSearchStubs(async (forumSearch) => {
    const result = await forumSearch.filterSearchIndexTopics({
      data: ["wiki title", "forum title"],
      tids: [10, 20]
    });
    assert.deepEqual(result.tids, [10, 20]);
    assert.deepEqual(result.data, ["wiki title", "forum title"]);
  });
});

test("index posts hook keeps only the wiki article main post, drops wiki replies, keeps forum posts", async () => {
  await withForumSearchStubs(async (forumSearch) => {
    const result = await forumSearch.filterSearchIndexPosts({
      data: ["wiki article body", "wiki reply body", "forum post body"],
      pids: [100, 101, 200]
    });
    assert.deepEqual(result.pids, [100, 200]);
    assert.deepEqual(result.data, ["wiki article body", "forum post body"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/filter-forum-search.test.js`
Expected: FAIL — `filterSearchIndexTopics` still strips wiki topics (empty `tids`/`data`), and `filterSearchIndexPosts` has no reply/main-post distinction (`filterParallelArraysByPosts` has no concept of `mainPid`).

- [ ] **Step 3: Implement the inverted hooks**

Replace the full contents of `lib/filter-forum-search.js` with:

```js
"use strict";

const posts = require.main.require("./src/posts");
const topics = require.main.require("./src/topics");

const forumExclusion = require("./forum-exclusion-service");
const wikiCanonicalPathAdapter = require("./wiki-canonical-path-adapter");
const categories = require.main.require("./src/categories");
const config = require("./config");

// 30s TTL, same pattern as forumExclusion's hydration grants: `filter:search.inContent`
// resolves a wiki article's wikiPath once, `filter:search.contentGetResult` (fired a few
// lines later in the same request, see src/search.js) reads it back to tag the result.
const SEARCH_RESULT_TAG_TTL_MS = 30 * 1000;
const wikiSearchResultTags = new Map();

function rememberWikiSearchResult(pid, wikiPath) {
  const now = Date.now();
  wikiSearchResultTags.forEach((entry, key) => {
    if (entry.expiry <= now) {
      wikiSearchResultTags.delete(key);
    }
  });
  wikiSearchResultTags.set(String(pid), { wikiPath, expiry: now + SEARCH_RESULT_TAG_TTL_MS });
}

function recallWikiSearchResult(pid) {
  const entry = wikiSearchResultTags.get(String(pid));
  if (!entry || entry.expiry <= Date.now()) {
    return null;
  }
  return entry.wikiPath;
}

async function resolveWikiPathForTopic(topic, uid) {
  const cid = parseInt(topic && topic.cid, 10);
  if (!Number.isInteger(cid) || cid <= 0) {
    return "";
  }
  const category = await categories.getCategoryData(cid);
  if (!category) {
    return "";
  }
  const settings = await config.getSettings();
  const namespaceInfo = await wikiCanonicalPathAdapter.getCanonicalNamespaceInfo(category, { settings, uid });
  const pageInfo = await wikiCanonicalPathAdapter.getCanonicalPageInfo(topic, { namespaceInfo, uid });
  return pageInfo.wikiPath || "";
}

async function filterSearchInContent(data) {
  if (!data || !Array.isArray(data.pids) || !data.pids.length) {
    return data;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (!wikiCidSet.size) {
    return data;
  }

  const postRows = await posts.getPostsFields(data.pids, ["pid", "tid"]);
  const postByPid = new Map(postRows.map((row) => [String(row && row.pid), row]));
  const tids = [...new Set(
    postRows.map((row) => row && row.tid).filter((tid) => tid !== undefined && tid !== null).map(String)
  )];
  const topicRows = tids.length ? await topics.getTopicsFields(tids, ["tid", "cid", "mainPid"]) : [];
  const topicByTid = new Map(topicRows.map((row) => [String(row && row.tid), row]));

  const searcherUid = (data.data && data.data.uid) || 0;
  const keptPids = [];

  for (const pid of data.pids) {
    const post = postByPid.get(String(pid));
    const topic = post && topicByTid.get(String(post.tid));
    const cid = topic && parseInt(topic.cid, 10);
    const isWiki = Number.isInteger(cid) && wikiCidSet.has(cid);

    if (!isWiki) {
      keptPids.push(pid);
      continue;
    }

    const isMainPost = topic && String(topic.mainPid) === String(pid);
    if (!isMainPost) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const wikiPath = await resolveWikiPathForTopic(topic, searcherUid);
    if (!wikiPath) {
      continue;
    }

    forumExclusion.grantPidHydration(pid);
    rememberWikiSearchResult(pid, wikiPath);
    keptPids.push(pid);
  }

  data.pids = keptPids;
  return data;
}

async function filterSearchIndexTopics(data) {
  if (!data || !Array.isArray(data.data) || !Array.isArray(data.tids)) {
    return data;
  }

  return data;
}

async function filterSearchIndexPosts(data) {
  if (!data || !Array.isArray(data.data) || !Array.isArray(data.pids) || !data.pids.length) {
    return data;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (!wikiCidSet.size) {
    return data;
  }

  const postRows = await posts.getPostsFields(data.pids, ["pid", "tid"]);
  const tids = [...new Set(
    postRows.map((row) => row && row.tid).filter((tid) => tid !== undefined && tid !== null).map(String)
  )];
  const topicRows = tids.length ? await topics.getTopicsFields(tids, ["tid", "cid", "mainPid"]) : [];
  const topicByTid = new Map(topicRows.map((row) => [String(row && row.tid), row]));

  const keptData = [];
  const keptPids = [];

  data.pids.forEach((pid, index) => {
    const post = postRows[index];
    const topic = post && topicByTid.get(String(post.tid));
    const cid = topic && parseInt(topic.cid, 10);
    const isWiki = Number.isInteger(cid) && wikiCidSet.has(cid);

    if (isWiki && String(topic.mainPid) !== String(pid)) {
      return;
    }

    keptData.push(data.data[index]);
    keptPids.push(pid);
  });

  data.data = keptData;
  data.pids = keptPids;
  return data;
}

async function filterSearchContentGetResult(data) {
  const resultPosts = data && data.result && Array.isArray(data.result.posts) ? data.result.posts : [];
  resultPosts.forEach((post) => {
    const wikiPath = post && recallWikiSearchResult(post.pid);
    if (wikiPath) {
      post.isWikiArticle = true;
      post.wikiPath = wikiPath;
    }
  });
  return data;
}

module.exports = {
  filterSearchContentGetResult,
  filterSearchInContent,
  filterSearchIndexPosts,
  filterSearchIndexTopics
};
```

Note: `filterSearchIndexTopics` becomes a no-op pass-through (kept as a named export, not deleted, so `plugin.json`'s existing hook wiring doesn't need to change and the function signature stays documented). Ponytail would delete the function and the hook wiring entirely since it does nothing — do that instead in Step 3b to keep the diff honest:

- [ ] **Step 3b: Delete the now-pointless `filter:search.indexTopics` hook wiring**

In `plugin.json`, find the hook entry with `"hook": "filter:search.indexTopics"` and delete that whole `{ "hook": ..., "method": ... }` block. Remove `filterSearchIndexTopics` from the `module.exports` in `lib/filter-forum-search.js` and delete the function body — a hook that always returns its input unchanged should not be wired at all.

Final `lib/filter-forum-search.js` exports: `filterSearchContentGetResult`, `filterSearchInContent`, `filterSearchIndexPosts`.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/filter-forum-search.test.js`
Expected: PASS (drop the title-index assertion from Step 1's test since that hook no longer exists — see Step 4b).

- [ ] **Step 4b: Update Step 1's test to match the deleted no-op hook**

Remove the `"index topics hook no longer strips wiki topics from title index"` test case entirely (there is no `filterSearchIndexTopics` export anymore — the hook wiring deletion in Step 3b means titles are never filtered by this module at all, so there is nothing plugin-owned to unit test here; title indexing behavior is exercised end-to-end in Task 4's manual verification).

- [ ] **Step 5: Commit**

```bash
git add lib/filter-forum-search.js plugin.json tests/filter-forum-search.test.js
git commit -m "feat: index wiki article bodies in global search, keep replies excluded"
```

---

### Task 2: Wire the new `filter:search.contentGetResult` hook

**Files:**
- Modify: `plugin.json`

**Interfaces:**
- Consumes: `filterSearchContentGetResult` from Task 1.
- Produces: nothing new consumed elsewhere; this is the last task that needs `plugin.json` hook wiring for Part A.

This hook was confirmed to exist in core by reading `/home/vicky/Projects/nodebb-dev/forum/src/search.js:152`:
```js
await plugins.hooks.fire('filter:search.contentGetResult', { result: returnData, data: data });
```
fired **after** `posts.getPostSummaryByPids` (which is where the shared `filterPostGetPostSummaryByPids` feed filter runs) but **within the same search request**. This is the "search-scoped hook, distinct from the shared summary filter" the design spec's Section 2 asked planning to find — resolving that spec's "Open decision for planning" in favor of the **preferred approach**: zero changes to `filterPostGetPostSummaryByPids` / feeds.

- [ ] **Step 1: Add the hook entry to `plugin.json`**

Find the existing `filter:search.inContent` hook block in `plugin.json` (it points at `./lib/filter-forum-search.js:filterSearchInContent` or similar — match the existing entry's `file` field exactly) and add a new block immediately after it:

```json
{
  "hook": "filter:search.contentGetResult",
  "method": "filterSearchContentGetResult",
  "file": "./lib/filter-forum-search.js"
}
```

Use the exact `file` path string already used by the neighboring `filter:search.inContent`/`filter:search.indexPosts` entries in this file (copy it verbatim — do not guess the path format).

- [ ] **Step 2: Verify JSON is well-formed**

Run: `node -e "JSON.parse(require('fs').readFileSync('plugin.json'))"`
Expected: no output (no throw).

- [ ] **Step 3: Commit**

```bash
git add plugin.json
git commit -m "feat: wire filter:search.contentGetResult to tag wiki article search results"
```

---

### Task 3: Feed isolation regression test (Section 2 risk in the design spec)

**Files:**
- Test: `tests/filter-forum-feeds.test.js` (existing — add a case)

**Interfaces:**
- Consumes: `filterPostGetPostSummaryByPids` from `lib/filter-forum-feeds.js` (unchanged).

The design spec's Testing item 3 requires proof that feeds/widgets still exclude wiki after this change, since Part A's safety argument rests entirely on `filterPostGetPostSummaryByPids` being untouched. `forumExclusion.grantPidHydration` (reused from Task 1) has a 30s TTL — this test must confirm a **non-granted** wiki pid is still stripped by the shared filter, proving the search-path grant doesn't leak into arbitrary feed calls for pids it was never granted for.

- [ ] **Step 1: Write the failing/confirming test**

Add to `tests/filter-forum-feeds.test.js` (reuse the file's existing `withForumFeedStubs` helper):

```js
test("post summary feed hook still strips a wiki post that was never granted hydration", async () => {
  await withForumFeedStubs(async (feeds) => {
    const result = await feeds.filterPostGetPostSummaryByPids({
      posts: [
        { pid: 101, cid: 1 }, // wiki category post, no grant
        { pid: 202, cid: 2 } // forum post
      ]
    });
    assert.deepEqual(result.posts.map((p) => p.pid), [202]);
  });
});
```

(This requires `state`'s stub category config to include cid `1` as a wiki cid — check the existing stub's `"./src/meta".settings.get` return value in the test file; if it only sets `categoryIds: "2"`, add a **second** test-local stub scope for cid `1`, or add `1` to the existing `categoryIds` value and adjust the `cid: 2` forum post in this new test to a cid confirmed non-wiki in that stub, e.g. `cid: 3`. Match whatever the file's existing stub actually returns — read it first, don't assume.)

- [ ] **Step 2: Run test to verify it passes (this is a characterization test — the code shouldn't need to change)**

Run: `node --test tests/filter-forum-feeds.test.js`
Expected: PASS. If it fails, that means `filterPostGetPostSummaryByPids` was accidentally touched by Task 1/2 — stop and check the diff for `lib/filter-forum-feeds.js` (it should show zero changes).

- [ ] **Step 3: Commit**

```bash
git add tests/filter-forum-feeds.test.js
git commit -m "test: confirm feed post-summary filter is unaffected by search hydration grants"
```

---

### Task 4: Docs — backfill step and resolved design decision

**Files:**
- Modify: `docs/superpowers/specs/2026-07-02-wiki-global-search-design.md`
- Modify: `AGENTS.md` or a wiki-plugin-owned docs file, if the repo has one for admin-facing operational steps (check `docs/` for an existing "operations"/"admin" doc before creating one — do not create a new docs file for one bullet point).

- [x] **Step 1: Resolve the "Open decision for planning" section**

In `docs/superpowers/specs/2026-07-02-wiki-global-search-design.md`, replace the "## Open decision for planning" section (bottom of file) with:

```markdown
## Planning decision (resolved)

Section 2 uses the **preferred, search-scoped approach**: core's `src/search.js`
fires `filter:search.contentGetResult` (confirmed at `src/search.js:152` in the
pinned NodeBB source) *after* `posts.getPostSummaryByPids` but within the same
request. The plugin's own `filter:search.inContent` hook (fired earlier, at
`src/search.js:123`, before `getPostSummaryByPids`) grants a short-lived pid
hydration (reusing `forumExclusion.grantPidHydration`, the existing write-path
mechanism) for surviving wiki article main-posts, so the untouched shared
`filterPostGetPostSummaryByPids` lets them through. `filter:search.contentGetResult`
then tags those same pids with `isWikiArticle`/`wikiPath`. Zero changes to
`filterPostGetPostSummaryByPids` or any feed path. See
`docs/superpowers/plans/2026-07-02-wiki-search-and-link-privilege-fix.md` Part A.
```

- [x] **Step 2: Note the one-time backfill step** — confirmed no admin/operations doc exists in `docs/`; skipped creating one per the plan's own guidance (single operational bullet, belongs in the deploy runbook outside this repo).

Confirm whether `docs/` already has an admin/operations doc; if yes, add one line there: "After deploying wiki search indexing, an admin must open the dbsearch ACP page once and click Reindex to backfill existing wiki articles into the index." If no such doc exists, skip creating one — this is a single operational bullet, not durable architecture documentation, and belongs in the deploy runbook (outside this repo) rather than a new file here.

- [x] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-02-wiki-global-search-design.md
git commit -m "docs: record resolved search result-tagging hook decision"
```

---

## Part B: Fix Wiki-Forum Link Privilege Bug

### Task 5: Replace the accidental-guest fallthrough with an explicit reference viewer

**Files:**
- Modify: `lib/wiki-links.js:354-373` (the `normalizeViewerContext`/`getParseViewerUid` region) and `lib/wiki-links.js:1162-1187` (`transformWikiPostContent`, the only caller of `getParseViewerUid`).
- Test: `tests/wiki-links-parse-viewer.test.js` (new file).

**Interfaces:**
- Consumes: nothing new.
- Produces: `getReferenceViewerContext()` — replaces `normalizeViewerContext(getParseViewerUid(data))` at both call sites in `transformWikiPostContent`. Returns the same shape `normalizeViewerContext` already produces: `{ hasViewerUid: true, viewerUid: 0 }`.

Chosen approach (confirmed with the user): **fixed reference privilege**. `getParseViewerUid` has never received real data from core — checked against core's `src/posts/parse.js` hook fire, which only ever passes `{ postData, type }`. So `normalizeViewerContext(undefined)` already always resolves to `{ hasViewerUid: true, viewerUid: 0 }` (guest) today; that's what gets cached per-`pid|type` for every viewer. This task makes that intentional instead of accidental: delete the dead uid-reading code, add a named constant/function documenting *why* guest is the reference, and leave every other privilege-gating call site (`canReadTopic`, `filterVisibleTopicMatches`, `getArticlePathForTopic`, etc.) completely unchanged — they all already receive their `viewerUid` from `buildResolverContext`, which is unaffected by this task.

Real per-viewer enforcement is unaffected: `routes/wiki.js:617` calls `wikiPaths.resolveWikiNode(requestPath, { uid: req.uid, ... })` with the actual per-request uid — a separate resolution path from `wiki-links.js`, already confirmed correct in the spec's evidence log (`/api/wiki` returns guest-visible content correctly; only the forum-embedded-link resolver is affected).

- [x] **Step 1: Write the failing test**

Create `tests/wiki-links-parse-viewer.test.js`:

```js
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const root = process.cwd();

function clearWikiLinksModule() {
  const filename = require.resolve(`${root}/lib/wiki-links.js`);
  delete require.cache[filename];
}

test("transformWikiPostContent never reads data.uid or data.req.uid (core never populates them)", () => {
  clearWikiLinksModule();
  const wikiLinks = require("../lib/wiki-links");
  const source = require("node:fs").readFileSync(`${root}/lib/wiki-links.js`, "utf8");

  // The bug this guards: getParseViewerUid read data.uid / data.req.uid, which
  // core's filter:parse.post hook (src/posts/parse.js) never populates — that
  // dead code gave a false impression this was viewer-aware. It must be gone.
  assert.equal(source.includes("getParseViewerUid"), false);
  assert.equal(/data\s*&&\s*data\.uid/.test(source), false);
  assert.equal(/data\.req\.uid/.test(source), false);
  assert.equal(typeof wikiLinks.transformWikiPostContent, "function");
});
```

(This is a characterization test on the source text rather than behavior, because `transformWikiPostContent`'s externally-observable behavior — rendering guest-visible links, degrading others to plain text — does not change at all in this task; only the internal justification does. A pure source-text assertion is the smallest thing that fails if the dead code silently comes back. Per the plugin's own `AGENTS.md` testing rule ("only assert exact values when the value is part of a documented... business rule") this is acceptable here specifically because the *absence* of this dead code is the security-relevant contract this task establishes, not an incidental implementation detail.)

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/wiki-links-parse-viewer.test.js`
Expected: FAIL — `getParseViewerUid` is still present in the source.

- [x] **Step 3: Implement the fix**

In `lib/wiki-links.js`, replace:

```js
function getParseViewerUid(data) {
  if (data && data.uid !== undefined && data.uid !== null) {
    return data.uid;
  }
  if (data && data.req && data.req.uid !== undefined && data.req.uid !== null) {
    return data.req.uid;
  }
  return undefined;
}
```

with:

```js
// Rendering a wiki link inline in a forum post bakes the decision into content
// that core caches per pid|type (src/posts/parse.js), not per viewer — there is
// no way to make this genuinely viewer-aware without poisoning the cache for
// every other viewer who hits it next. Core's filter:parse.post hook has never
// passed a real uid/req here either (checked against its full history), so this
// was always guest in practice; this makes that explicit instead of accidental.
// Real per-viewer access is enforced separately and correctly at the /wiki/*
// route (routes/wiki.js passes the actual req.uid into wikiPaths.resolveWikiNode).
function getReferenceViewerContext() {
  return { hasViewerUid: true, viewerUid: 0 };
}
```

Then update `transformWikiPostContent` (both call sites) from:

```js
  const categoryId = await getPostCategoryId(data.postData, settings);
  if (hasSyntaxMarkers) {
    data.postData.content = await replaceWikiLinks(data.postData.content, categoryId, settings, getParseViewerUid(data));
  }
  if (contentHasRenderedWikiAnchors(data.postData.content)) {
    data.postData.content = await replaceRenderedWikiAnchors(data.postData.content, categoryId, settings, getParseViewerUid(data));
  }
```

to:

```js
  const categoryId = await getPostCategoryId(data.postData, settings);
  const referenceViewerUid = getReferenceViewerContext().viewerUid;
  if (hasSyntaxMarkers) {
    data.postData.content = await replaceWikiLinks(data.postData.content, categoryId, settings, referenceViewerUid);
  }
  if (contentHasRenderedWikiAnchors(data.postData.content)) {
    data.postData.content = await replaceRenderedWikiAnchors(data.postData.content, categoryId, settings, referenceViewerUid);
  }
```

Note: `replaceWikiLinks`/`replaceRenderedWikiAnchors` still receive a plain `viewerUid` argument (unchanged signatures) and internally call `normalizeViewerContext(viewerUid)` (unchanged, still needed — it's also used by the legitimate per-viewer paths like `wiki-link-autocomplete.js`). Only the *source* of the uid fed into that at parse time changes, from a dead read to an explicit constant.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/wiki-links-parse-viewer.test.js`
Expected: PASS.

- [x] **Step 5: Run the full existing wiki-links-adjacent test suite to confirm no regression**

Run: `node --test tests/wiki-link-resolver-cache.test.js tests/wiki-paths.test.js`
Expected: PASS (unchanged — these tests don't exercise `transformWikiPostContent`/`getParseViewerUid`, confirmed by the earlier grep showing zero references to either name in the existing test suite; this run is a regression guard on the surrounding module, not new coverage).

- [x] **Step 6: Commit**

```bash
git add lib/wiki-links.js tests/wiki-links-parse-viewer.test.js
git commit -m "fix: make wiki link parse-time viewer context an explicit guest reference, not a dead uid read"
```

---

### Task 6: Docs — record the chosen fix shape and the ACP action item

**Files:**
- Modify: `docs/wiki-forum-link-privilege-bug-spec.md`

- [x] **Step 1: Replace the "Fix shape" section's undecided code-fix bullet**

In `docs/wiki-forum-link-privilege-bug-spec.md`, under "## Fix shape", item 2, replace the two "candidate approaches, not yet chosen" bullets with:

```markdown
   **Chosen approach:** resolve visibility against a fixed reference privilege —
   guest (uid 0) — made explicit rather than accidental. `getParseViewerUid` and
   the dead `data.uid`/`data.req.uid` reads it depended on are removed. Every
   other privilege-gating call site in `wiki-links.js` (`canReadTopic`,
   disambiguation matching, `getArticlePathForTopic`) is untouched — they
   already resolve `viewerUid` from `buildResolverContext`, not from parse-time
   context. Real per-viewer enforcement continues to live at the `/wiki/*`
   route (`routes/wiki.js` → `wikiPaths.resolveWikiNode` with the real
   `req.uid`), confirmed independent of this code path. See
   `docs/superpowers/plans/2026-07-02-wiki-search-and-link-privilege-fix.md`
   Part B, Task 5.
```

- [x] **Step 2: Add a one-line status note to "Next steps" item 1**

Change "1. Restore guest (or intended group) `topics:read` on the wiki category tree in ACP..." to append: " — **not done as of this plan**; this remains a manual ACP action for vicky, tracked separately from the code fix in Task 5 above."

- [ ] **Step 3: Commit**

```bash
git add docs/wiki-forum-link-privilege-bug-spec.md
git commit -m "docs: record chosen link-privilege fix shape"
```

---

## Testing Summary (maps to each spec's Testing section)

| Spec requirement | Task |
|---|---|
| Index hooks: wiki main-post kept, reply dropped, forum untouched | Task 1 |
| Result tagging: wiki result tagged, reply absent, forum unchanged | Task 1 (drop-in-loop) + Task 2 (hook wiring) |
| Feed isolation | Task 3 |
| Index lifecycle (edit/delete) | Not covered by a new unit test — relies on dbsearch's own post hooks per the design spec ("verify the wiki plugin no longer strips wiki on those paths"); covered by Task 1's inverted hooks having no lifecycle-specific logic to break. Manual verification in Task 4. |
| Privileges (restricted category doesn't surface) | Covered structurally: `filterSearchInContent` only ever sees `data.pids` that core's `privileges.posts.filter('topics:read', allPids, data.uid)` (src/search.js:120) already filtered — no plugin-side privilege check is bypassed. No new unit test added because this is an assertion about core's own filter running before the plugin hook fires, not plugin logic; flagged here for the manual end-to-end check in Task 4/spec's "Manual/flagged verification." |
| Bug A code fix removes dead uid reads | Task 5 |
| Bug A doesn't change other viewer-aware paths | Task 5, Step 5 regression run |
| Bug B (ACP fix) | Explicitly out of scope — Task 6 documents this |

## Explicitly Not Done (per Global Constraints / non-goals)

- No theme-repo changes (badge rendering, link rewrite in `/search` and quick-search dropdown templates) — tracked as a follow-up in `sow-nodebb-theme`, consuming the `isWikiArticle`/`wikiPath` fields Task 1/2 now put on search result post objects.
- No ACP privilege restoration for cid 41 (Bug B) — manual, left to vicky.
- No change to `wiki-search-service.js`.
- No indexing of wiki discussion replies.
