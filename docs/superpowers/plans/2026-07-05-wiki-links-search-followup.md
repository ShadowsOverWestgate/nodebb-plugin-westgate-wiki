# Wiki Links + Global Search Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the wiki-link parse transform so one bad link can no longer kill (or silently skip) a whole post render, tag global-search results data-driven so title searches get wiki badges and `/wiki/...` hrefs, and remove the theme's stray "book icon on every result" branch.

**Architecture:** Two repos. Plugin (`sow-nodebb-plugin-wiki`): per-link try/catch inside the two `Promise.all` replacement passes plus a whole-transform try/catch with greppable logging; rewrite `filterSearchContentGetResult` to derive wiki-ness from the post's topic cid instead of the in-memory TTL Map populated only by in-content searches. Theme (`sow-nodebb-theme`): delete the `isMainPost` fallback icon branch in `posts_list_item.tpl`. Both search display modes iterate the same `posts` array (`search-results.tpl:17` is `{{{ each posts }}}`), so tagging `data.result.posts` covers topics mode — no topic-side hook needed.

**Tech Stack:** NodeBB 4.13.2 plugin/theme, plain Node.js, `node:test` + `node:assert` (plugin), plain-node contract scripts (theme).

## Global Constraints

- Spec: `sow-nodebb-plugin-wiki/docs/wiki-links-and-search-followup-spec.md` — read its "Review notes" section; the amendments there are authoritative over the original root-cause text.
- Never commit to `main`. Each repo gets its own feature branch (created in Task 0 / Task 4).
- Do NOT change the guest reference-viewer decision from PR #12 (`getReferenceViewerContext` in parse transform stays).
- Do NOT touch `filterSearchIndexTopics` / `filterSearchIndexPosts` (search indexing is out of scope).
- Keep `filterSearchInContent`'s main-post/tombstone filtering AND its `forumExclusion.grantPidHydration(pid)` call — only the TTL-Map remember/recall machinery gets deleted.
- Search-result tagging must stay viewer-uid-aware: pass the search payload uid (fallback 0) into `resolveWikiPathForTopic`; `getCanonicalPageInfo` does permission checks.
- Log prefix for the transform failure path must be exactly `[westgate-wiki] parse transform failed` (greppable, named in the spec).
- Plugin tests: `npm test` in `sow-nodebb-plugin-wiki` (runs `node scripts/test.mjs`). Theme contract test: `node tests/wiki-search-badge-contract.test.js` in `sow-nodebb-theme`.
- Fixes 2 and the diagnostic step are manual ops for vicky (see "Manual ops steps" at the end) — no code tasks for them.

---

### Task 0: Plugin branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the plugin feature branch**

```bash
cd /home/vicky/Projects/westgate/repositories/migration/sow-nodebb-plugin-wiki
git status --short --branch   # expect: main, only untracked docs/ files
git checkout -b fix/wiki-links-search-followup
```

The untracked spec/plan docs ride along; commit them with the first task's commit.

---

### Task 1: Per-link error isolation in `replaceWikiLinks` and `replaceRenderedWikiAnchors`

Currently both functions build a bare `Promise.all` over per-match async resolvers (`lib/wiki-links.js:936` and `:962`). One rejected resolution rejects the whole `Promise.all`; since NodeBB 4.13.2 does NOT catch filter-hook errors, that errors the entire page render. Degrade the single failing link instead.

**Files:**
- Modify: `lib/wiki-links.js:936-939` (anchor pass) and `lib/wiki-links.js:962-1138` (wiki-link pass)
- Test: `tests/wiki-links-parse-viewer.test.js`

**Interfaces:**
- Consumes: existing `escapeHtml(value)` (`lib/wiki-links.js:149`).
- Produces: no signature changes; `replaceWikiLinks(content, currentCategoryId, settings, viewerUid)` and `replaceRenderedWikiAnchors(...)` behave identically on the happy path, degrade per-link on error.

- [ ] **Step 1: Write the failing test**

Append to `tests/wiki-links-parse-viewer.test.js`. It needs a second known page whose canonical-path resolution throws. Add a new helper alongside `withWikiLinksStubs` (copy it, don't parameterize the existing one — other tests use it as-is):

```js
async function withThrowingPageStubs(fn) {
  const stubs = {
    "nconf": { get: () => undefined },
    "./src/categories": {
      getCategoryData: async (cid) => ({ cid, name: "Lore", parentCid: 0, slug: "1/lore" }),
      getChildrenCids: async () => []
    },
    "./src/privileges": {
      categories: { get: async () => ({}) },
      topics: {
        filterTids: async (privilege, tids, uid) => (parseInt(uid, 10) === 0 ? tids : [])
      }
    },
    "./src/topics": { getTopicData: async () => null, getTopicsFields: async () => [], getTopicField: async () => null },
    "./src/meta": { settings: { get: async () => ({ categoryIds: "1", includeChildCategories: "0" }), setOnEmpty: async () => {}, set: async () => {} } },
    "./src/database": { getSortedSetRange: async () => [], getSortedSetRevRange: async () => [], getObjectField: async () => null, getObject: async () => ({}) },
    "./src/user": { isAdministrator: async () => false },
    "./src/controllers/helpers": {},
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/utils": { isNumber: () => false }
  };

  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };

  try {
    clearWikiLinksModule();
    require.cache[require.resolve(`${root}/lib/wiki-directory-service.js`)] = {
      exports: {
        normalizeWikiLinkTitle: (value) => String(value || "").trim().toLowerCase(),
        getAllTopicSlugRows: async () => [
          { tid: 10, cid: 1, title: "Public Page", titleRaw: "Public Page", slug: "10/public-page", deleted: 0, scheduled: 0 },
          { tid: 11, cid: 1, title: "Broken Page", titleRaw: "Broken Page", slug: "11/broken-page", deleted: 0, scheduled: 0 }
        ]
      }
    };
    require.cache[require.resolve(`${root}/lib/wiki-canonical-path-adapter.js`)] = {
      exports: {
        getCanonicalNamespaceInfo: async () => ({
          valid: true,
          canonicalPath: "Lore",
          wikiPath: "/wiki/Lore"
        }),
        getCanonicalPageInfo: async (topic) => {
          if (String(topic.tid) === "11") {
            throw new Error("synthetic canonical-path failure");
          }
          return {
            valid: true,
            canonicalPath: "Lore/Public_Page",
            wikiPath: "/wiki/Lore/Public_Page"
          };
        }
      }
    };
    return await fn(require("../lib/wiki-links"));
  } finally {
    require.main.require = originalMainRequire;
    clearWikiLinksModule();
  }
}

test("a single failing link degrades to its label without killing the transform", async () => {
  await withThrowingPageStubs(async (wikiLinks) => {
    const data = {
      postData: {
        cid: 99,
        content: "[[Public Page]] and [[Broken Page|Concentration]]"
      }
    };

    const result = await wikiLinks.transformWikiPostContent(data);

    assert.match(result.postData.content, /href="\/wiki\/Lore\/Public_Page"/);
    assert.ok(result.postData.content.includes("Concentration"), "failing link keeps its label");
    assert.ok(!result.postData.content.includes("[[Broken Page"), "failing link no longer literal [[...]]");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/vicky/Projects/westgate/repositories/migration/sow-nodebb-plugin-wiki
npm test
```

Expected: the new test FAILS — the synthetic throw rejects the whole `Promise.all`, so `transformWikiPostContent` rejects (unhandled error), or once Task 2 lands first it would return content with literal `[[Broken Page|Concentration]]`. Either failure mode is the bug being fixed.

- [ ] **Step 3: Wrap each per-match resolver in try/catch**

In `lib/wiki-links.js`, `replaceWikiLinks` (line 962): wrap the entire body of the `matches.map(async (match) => { ... })` arrow. The existing body (from `const rawTarget = ...` through the final `return { source: match[0], replacement: buildWikiArticleLink(...) };`) moves inside the `try`; indentation aside, no lines change:

```js
  const replacements = await Promise.all(matches.map(async (match) => {
    try {
      // ... existing body of the arrow, unchanged ...
    } catch (err) {
      console.error(`[westgate-wiki] wiki link resolution failed for ${match[0]}: ${err && err.stack || err}`);
      const label = String(match[2] || "").trim() || String(match[1] || "").trim();
      return { source: match[0], replacement: escapeHtml(label) };
    }
  }));
```

(`match[2]` is the pipe label, `match[1]` the target — same precedence the happy path uses.)

In `replaceRenderedWikiAnchors` (line 936), same wrap; an already-rendered anchor degrades to itself, matching the existing "unresolvable anchors returned unchanged" behavior:

```js
  const replacements = await Promise.all(matches.map(async (match) => {
    try {
      return {
        source: match[0],
        replacement: await resolveRenderedWikiAnchor(match[0], match[1], match[2], settings, context, forumBookIcon)
      };
    } catch (err) {
      console.error(`[westgate-wiki] wiki anchor resolution failed for ${match[0]}: ${err && err.stack || err}`);
      return { source: match[0], replacement: match[0] };
    }
  }));
```

Note: the plugin has no existing logger; `console.error` goes to NodeBB's stdout log and is the simplest greppable channel. Do not add a winston require — it breaks the test stubs' `require.main.require` fallback.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: full suite PASSES (176 existing + new).

- [ ] **Step 5: Commit**

```bash
git add lib/wiki-links.js tests/wiki-links-parse-viewer.test.js docs/
git commit -m "fix: degrade single failing wiki link instead of rejecting whole parse"
```

---

### Task 2: Whole-transform guard in `transformWikiPostContent`

Even with per-link guards, anything thrown outside the match loops (`config.getSettings`, `getPostCategoryId`, `buildResolverContext`) still propagates out of the filter hook and errors the request. Catch, log loudly, return original data.

**Files:**
- Modify: `lib/wiki-links.js:1164-1190` (`transformWikiPostContent`)
- Test: `tests/wiki-links-parse-viewer.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `transformWikiPostContent(data)` never rejects; on internal error returns `data` with content untouched and logs `[westgate-wiki] parse transform failed ...`.

- [ ] **Step 1: Write the failing test**

Append to `tests/wiki-links-parse-viewer.test.js`. Force a throw upstream of the link loop by making settings resolution reject — copy `withWikiLinksStubs` usage but override the meta stub. Simplest concrete form (self-contained, mirrors the existing stub helpers):

```js
test("transformWikiPostContent survives an internal throw and returns original content", async () => {
  const stubs = {
    "nconf": { get: () => undefined },
    "./src/meta": { settings: { get: async () => { throw new Error("synthetic settings failure"); }, setOnEmpty: async () => {}, set: async () => {} } },
    "./src/categories": { getCategoryData: async () => null, getChildrenCids: async () => [] },
    "./src/privileges": { categories: { get: async () => ({}) }, topics: { filterTids: async () => [] } },
    "./src/topics": { getTopicData: async () => null, getTopicsFields: async () => [], getTopicField: async () => null },
    "./src/database": { getSortedSetRange: async () => [], getSortedSetRevRange: async () => [], getObjectField: async () => null, getObject: async () => ({}) },
    "./src/user": { isAdministrator: async () => false },
    "./src/controllers/helpers": {},
    "./src/slugify": (value) => String(value || "").toLowerCase(),
    "./src/utils": { isNumber: () => false }
  };
  require.main.require = function requireNodebbStub(id) {
    return Object.prototype.hasOwnProperty.call(stubs, id) ? stubs[id] : originalMainRequire(id);
  };
  try {
    clearWikiLinksModule();
    const wikiLinks = require("../lib/wiki-links");
    const data = { postData: { pid: 42, tid: 7, cid: 99, content: "[[Public Page]]" } };
    const result = await wikiLinks.transformWikiPostContent(data);
    assert.equal(result.postData.content, "[[Public Page]]");
  } finally {
    require.main.require = originalMainRequire;
    clearWikiLinksModule();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: new test FAILS — `transformWikiPostContent` rejects with "synthetic settings failure".

- [ ] **Step 3: Wrap the body**

In `transformWikiPostContent`, keep the cheap null guard outside, wrap everything else:

```js
async function transformWikiPostContent(data) {
  if (!data || !data.postData || !data.postData.content) {
    return data;
  }

  try {
    const settings = await config.getSettings();

    if (!settings.isConfigured) {
      return data;
    }

    const hasSyntaxMarkers = contentHasWikiSyntaxMarkers(data.postData.content);
    const hasRenderedAnchors = contentHasRenderedWikiAnchors(data.postData.content);
    if (!hasSyntaxMarkers && !hasRenderedAnchors) {
      return data;
    }

    const categoryId = await getPostCategoryId(data.postData, settings);
    const referenceViewerUid = getReferenceViewerContext().viewerUid;
    if (hasSyntaxMarkers) {
      data.postData.content = await replaceWikiLinks(data.postData.content, categoryId, settings, referenceViewerUid);
    }
    if (contentHasRenderedWikiAnchors(data.postData.content)) {
      data.postData.content = await replaceRenderedWikiAnchors(data.postData.content, categoryId, settings, referenceViewerUid);
    }
    return data;
  } catch (err) {
    console.error(`[westgate-wiki] parse transform failed pid=${data.postData.pid} tid=${data.postData.tid}: ${err && err.stack || err}`);
    return data;
  }
}
```

Caveat: if `replaceWikiLinks` succeeded but `replaceRenderedWikiAnchors` threw, `data.postData.content` keeps the first pass's output — that is fine (strictly better than raw).

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: full suite PASSES.

- [ ] **Step 5: Commit**

```bash
git add lib/wiki-links.js tests/wiki-links-parse-viewer.test.js
git commit -m "fix: never let the wiki parse transform reject; log and return original content"
```

---

### Task 3: Data-driven search-result tagging (drop the TTL Map)

`filterSearchContentGetResult` (`lib/filter-forum-search.js:173`) currently only tags posts remembered by `filterSearchInContent`'s 30 s Map — which "In titles" searches never populate. Rewrite it to derive wiki-ness from the post's topic cid.

**Files:**
- Modify: `lib/filter-forum-search.js`
- Test: `tests/filter-forum-search.test.js`

**Interfaces:**
- Consumes: existing `forumExclusion.getWikiCidSet()`, `resolveWikiPathForTopic(topic, uid)` (same file, line 36), `posts.getPostsFields`, `topics.getTopicsFields`, `wikiTombstones.isTombstonedTopic` / `TOMBSTONE_FIELDS`.
- Produces: `filterSearchContentGetResult(data)` sets `post.isWikiArticle = true` and `post.wikiPath` on every wiki main-topic result in `data.result.posts`, regardless of search mode. `rememberWikiSearchResult` / `recallWikiSearchResult` / `wikiSearchResultTags` / `SEARCH_RESULT_TAG_TTL_MS` are deleted.

- [ ] **Step 1: Update the tests**

In `tests/filter-forum-search.test.js`, find the existing test(s) covering result tagging (they call `filterSearchInContent` first to prime the Map, then `filterSearchContentGetResult`). Rework/add so the title-search path is covered — the decisive case calls `filterSearchContentGetResult` alone:

```js
test("title-only search results get tagged without a prior inContent call", async () => {
  await withForumSearchStubs(async (forumSearch, state) => {
    const data = {
      data: { uid: 7 },
      result: {
        posts: [
          { pid: 100, tid: 10 },  // wiki article main post (cid 1)
          { pid: 200, tid: 20 }   // forum post (cid 5)
        ]
      }
    };

    await forumSearch.filterSearchContentGetResult(data);

    assert.equal(data.result.posts[0].isWikiArticle, true);
    assert.ok(String(data.result.posts[0].wikiPath).startsWith("/wiki/"));
    assert.equal(data.result.posts[1].isWikiArticle, undefined);
    assert.equal(data.result.posts[1].wikiPath, undefined);
    assert.deepEqual(state.pageInfoUids, [7], "resolution uses the search payload uid");
  });
});
```

Adjust to the helper's actual `(forumSearch, state)` callback signature — read the file's existing tests and mirror them exactly. If result posts in the existing fixtures lack `tid`, that's fine: the implementation below re-fetches `tid` from `posts.getPostsFields`, which the stubs already serve. Keep (or add) a tombstone case: a result post for pid 300/tid 30 (tombstoned wiki topic) must stay untagged. Delete or rewrite any test that asserts the remember/recall Map behavior itself; keep tests asserting `filterSearchInContent`'s pid filtering and `grantPidHydration`.

- [ ] **Step 2: Run tests to verify the new one fails**

```bash
npm test
```

Expected: new test FAILS — posts untagged because the Map is empty.

- [ ] **Step 3: Rewrite `filterSearchContentGetResult`, delete the Map machinery**

In `lib/filter-forum-search.js`:

1. Delete lines 12-34 (`SEARCH_RESULT_TAG_TTL_MS`, `wikiSearchResultTags`, `rememberWikiSearchResult`, `recallWikiSearchResult`) and the stale comment above them.
2. In `filterSearchInContent`, delete the `rememberWikiSearchResult(pid, topic, searcherUid);` call (line 95) and the now-unused `searcherUid` variable (line 71) if nothing else reads it. Keep `forumExclusion.grantPidHydration(pid);` and all filtering.
3. Replace `filterSearchContentGetResult`:

```js
async function filterSearchContentGetResult(data) {
  const resultPosts = data && data.result && Array.isArray(data.result.posts) ? data.result.posts : [];
  if (!resultPosts.length) {
    return data;
  }

  const wikiCidSet = await forumExclusion.getWikiCidSet();
  if (!wikiCidSet.size) {
    return data;
  }

  const viewerUid = (data && data.data && data.data.uid) || (data && data.uid) || 0;

  const pids = resultPosts.map((post) => post && post.pid).filter((pid) => pid !== undefined && pid !== null);
  const postRows = await posts.getPostsFields(pids, ["pid", "tid"]);
  const tidByPid = new Map(postRows.map((row) => [String(row && row.pid), row && row.tid]));
  const tids = [...new Set(postRows.map((row) => row && row.tid).filter((tid) => tid !== undefined && tid !== null).map(String))];
  const topicRows = tids.length ?
    await topics.getTopicsFields(tids, ["tid", "cid", "mainPid"].concat(wikiTombstones.TOMBSTONE_FIELDS)) :
    [];
  const topicByTid = new Map(topicRows.map((row) => [String(row && row.tid), row]));

  await Promise.all(resultPosts.map(async (post) => {
    const topic = post && topicByTid.get(String(tidByPid.get(String(post.pid))));
    const cid = topic && parseInt(topic.cid, 10);
    if (!Number.isInteger(cid) || !wikiCidSet.has(cid)) {
      return;
    }
    if (wikiTombstones.isTombstonedTopic(topic)) {
      return;
    }
    const wikiPath = await resolveWikiPathForTopic(topic, viewerUid);
    if (wikiPath) {
      post.isWikiArticle = true;
      post.wikiPath = wikiPath;
    }
  }));
  return data;
}
```

No topics-mode extension needed: `search-results.tpl` renders topics mode with `{{{ each posts }}}` over this same array.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: full suite PASSES.

- [ ] **Step 5: Commit**

```bash
git add lib/filter-forum-search.js tests/filter-forum-search.test.js
git commit -m "fix: tag wiki search results from topic cid, not the inContent TTL map"
```

---

### Task 4: Theme — remove the `isMainPost` book-icon branch

`templates/partials/posts_list_item.tpl:4` renders `<i class="fa fa-book">` for every main post that isn't a wiki article — every global-search result is a main post, so every title gets a book. Deliberate blast-radius decision (per spec review notes): this partial also serves seven account/profile pages via `partials/posts_list.tpl`; removing the branch strips the marker there too, restoring pre-PR-#14 appearance. Remove it — it was added as a search marker and misfires everywhere.

**Files:**
- Modify: `sow-nodebb-theme/templates/partials/posts_list_item.tpl:4`
- Test: `sow-nodebb-theme/tests/wiki-search-badge-contract.test.js`

**Interfaces:**
- Consumes: `./isWikiArticle` / `./wikiPath` flags delivered by Task 3.
- Produces: only the `westgate-wiki-badge` renders on result titles; plain forum posts get no icon.

- [ ] **Step 1: Create the theme feature branch**

```bash
cd /home/vicky/Projects/westgate/repositories/migration/sow-nodebb-theme
git status --short --branch   # expect: main, clean
git checkout -b fix/search-result-icons
```

- [ ] **Step 2: Extend the contract test (failing)**

Append to `tests/wiki-search-badge-contract.test.js`, before the final `console.log`:

```js
const postsListItem = read('templates/partials/posts_list_item.tpl');
assert(
	!postsListItem.includes('./isMainPost }}}<i class="fa fa-book'),
	'posts_list_item.tpl should not render a book icon for plain main posts'
);
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node tests/wiki-search-badge-contract.test.js
```

Expected: FAIL with "should not render a book icon for plain main posts".

- [ ] **Step 4: Remove the branch**

In `templates/partials/posts_list_item.tpl` line 4, change:

```
    {{{ if ./isWikiArticle }}}<span class="badge westgate-wiki-badge"><i class="fa fa-book-open"></i> [[westgate:wiki-badge]]</span> {{{ else }}}{{{ if ./isMainPost }}}<i class="fa fa-book text-muted" title="[[topic:topic]]"></i> {{{ end }}}{{{ end }}}{./topic.title}
```

to:

```
    {{{ if ./isWikiArticle }}}<span class="badge westgate-wiki-badge"><i class="fa fa-book-open"></i> [[westgate:wiki-badge]]</span> {{{ end }}}{./topic.title}
```

Do NOT touch `search-results.tpl` — its badge markup already lights up once Task 3's flags arrive. Do NOT swap `fa-book` → `fa-books` anywhere (Free FA kit; spec allows it only if a Pro glyph is verified live).

- [ ] **Step 5: Run test to verify it passes**

```bash
node tests/wiki-search-badge-contract.test.js
```

Expected: `wiki search badge contract tests passed`.

- [ ] **Step 6: Commit**

```bash
git add templates/partials/posts_list_item.tpl tests/wiki-search-badge-contract.test.js
git commit -m "fix: drop the every-main-post book icon from search/profile post lists"
```

---

## Manual ops steps (vicky — not code tasks)

**Diagnostic (before/alongside deploy, ~5 min):**
1. Grep NodeBB logs for parse errors mentioning `wiki-links`, `wiki-tree-index`, or `wiki-paths`.
2. Check prod `NODE_ENV` — the parse cache (poisoned-cache theory) is enabled only when it is `production`.
3. Check the plugin's `settings.isConfigured` in ACP, and spot-check live stored content for `data-wiki-entity` attribute-order/quoting variants — `contentHasWikiSyntaxMarkers` requires the literal quoted form and silently skips otherwise. If variants exist, that's a follow-up fix (loosen the marker regex), not covered by this plan.

**Fix 2 (after deploying Tasks 1-2):** restart NodeBB or ACP → Advanced → Clear post cache, then reload `/wiki/Classes/Acolyte` as guest. Links back and staying → cause was the poisoned cache. Still broken → grep for the new `[westgate-wiki]` log lines; they now name the throwing resolver.

**Live verification after Tasks 3-4 deploy:** guest `GET /api/search?term=module&in=titles` shows a wiki result carrying `wikiPath`; clicking a wiki title in both display modes lands on `/wiki/...`; forum results have no icon.

## Out of scope (from spec)

- Guest reference-viewer decision from PR #12.
- Search indexing hooks.
- `/api/categories` visibility of cid 41.
- Loosening the `data-wiki-entity` marker regex (flagged in diagnostics; separate fix if confirmed).
