# Wiki Links + Global Search Follow-up — Fix Spec

Repos: `sow-nodebb-plugin-wiki` (plugin), `sow-nodebb-theme` (theme), `sow-nodebb` (host).
Reported by vicky, 2026-07-05. Follows up on `wiki-forum-link-privilege-bug-spec.md` and
PR #12 (`230cf3a`, plugin) / PR #14 (`96f8386`, theme).

## Symptoms

1. **REGRESSION** — forum-post links to wiki pages render as plain anchors with no
   `fa-book` wiki icon.
2. **REGRESSION** — wiki article links don't render at all:
   - Manually authored pages (e.g. `/wiki` Main Page): links are gone, only external
     links show.
   - Topdata-generated pages (e.g. `/wiki/Classes/Acolyte`): literal
     `[[Skills/Concentration|Concentration]]` text is displayed.
3. Global search:
   - "Show results as posts": a book icon appears on **every** result title, wiki or not.
   - "Show results as topics": no wiki indicator at all.
   - Wiki results link to `/post/<pid>` instead of `/wiki/<path>` (observed with
     "In titles" search).

## Evidence collected (2026-07-05, live + repo)

- `GET /api/wiki` (guest): Main Page `mainPost.content` still contains **unconverted**
  `<span data-wiki-entity="page" data-wiki-target="...">` tiptap spans — 0 wiki anchors.
- `GET /api/wiki/Classes/Acolyte` (guest): `mainPost.content` contains **116 literal
  `[[...]]`** occurrences, 0 anchors.
- Guest privileges are NOT the blocker: unauthenticated `GET /api/topic/3690/community-charter`
  and `GET /api/category/41/wiki` both return 200. (Guest still doesn't see cid 41 on
  `/api/categories`, but read works.)
- The transform pipeline is a single entry point: `transformWikiPostContent`
  (`lib/wiki-links.js:1164`), wired to `filter:parse.post` at priority 6
  (`plugin.json`). It first converts entity spans → `[[...]]`
  (`replaceWikiEntityLinksWithLegacySyntax`, line 948→266), then resolves. On resolution
  failure it degrades to **escaped label text** — it never leaves spans or `[[...]]`
  intact. Live content has both intact ⇒ **the hook is not executing (or throwing) in
  production**, not failing per-link.
- The whole plugin test suite passes locally (176/176), including
  `wiki-links-parse-viewer.test.js`. The code path is correct in isolation.
- PR #12's `wiki-links.js` change (hardcoded guest reference viewer) is behavior-neutral
  at runtime: pre-#12, `getParseViewerUid` always returned `undefined` (core never passes
  uid on `filter:parse.post`), and `normalizeViewerContext(undefined)` already resolved to
  `{ viewerUid: 0 }`. So #12 did not change link resolution semantics.
- The book icon (`wrapForumWikiLinkInner`, `wiki-links.js:574`) is emitted server-side
  only when an anchor is actually built. Symptom 1 is therefore the same failure as
  symptom 2, seen from a forum post.

### Root cause, issue 1+2

`transformWikiPostContent` is not running (or is erroring) on production parses. NodeBB
core catches filter-hook errors, logs them, and continues with unmodified content — which
matches exactly what is served: fully parsed HTML minus the wiki transform. Two candidate
triggers, distinguishable only server-side:

- **(a) Poisoned parse cache.** Core caches parsed content per `pid|type`
  (`src/posts/parse.js`), in memory. If posts were parsed during a window where the
  plugin was broken/not loaded (the July 2 incident, or a partial deploy of #12/#13),
  the raw renders are cached and served until restart / post edit / cache clear.
- **(b) Live runtime throw** inside the transform (e.g. tree-index/canonical-path
  resolution hitting inconsistent data, such as the orphan topics from issue #10), which
  core swallows per-parse.

**Diagnostic step (vicky, manual):**
1. Grep NodeBB logs for `filter:parse.post` / `parse` hook errors and any stack traces
   mentioning `wiki-links`, `wiki-tree-index`, or `wiki-paths`.
2. Restart NodeBB (or ACP → Advanced → Clear post cache), then reload
   `/wiki/Classes/Acolyte` as guest.
   - Links come back and stay → cause was (a); code hardening below still applies.
   - Still broken → cause is (b); the logged stack from step 1 identifies the throwing
     resolver and becomes a targeted sub-fix.

### Root cause, issue 3

- **Book icon on every posts-mode title:** theme `templates/partials/posts_list_item.tpl:4`
  has an `{{{ else }}}` branch rendering `<i class="fa fa-book">` for every `./isMainPost`
  — a generic "opening post" marker added in PR #14. Every global-search result is a main
  post, so every title gets a book. Unrelated to wiki data.
- **No badge in topics mode + `/post/` hrefs:** the templates
  (`posts_list_item.tpl:3`, `search-results.tpl:20-21`) already branch on
  `./isWikiArticle` / `./wikiPath` correctly. The flags never arrive: the plugin sets them
  in `filterSearchContentGetResult` (`lib/filter-forum-search.js:173`) **only** if the pid
  was remembered by `filterSearchInContent` in an in-memory 30 s TTL Map. `filter:search.inContent`
  fires only for in-content searches — **"In titles" searches (what the screenshots show)
  never populate the Map**, so no result is ever tagged. The `fa-book` that "weirdly works"
  on the topic page is different code (`wiki-discussion-placeholder.js`), not search.

## Fixes

### Fix 1 (plugin): harden the parse transform — never lose the whole post

File: `lib/wiki-links.js`.

- Wrap each per-match replacement in `replaceWikiLinks` (and the anchor pass in
  `replaceRenderedWikiAnchors`) so a single failing resolution degrades **that one link**
  to escaped label text instead of rejecting the whole `Promise.all` and killing the
  entire transform.
- Wrap the body of `transformWikiPostContent` in try/catch: on error, `winston.error`
  with pid/tid and return the original data. Core already swallows the error; the point
  is to log it loudly under a greppable prefix (`[westgate-wiki] parse transform failed`).
- No behavior change on the happy path; keeps the guest reference-viewer decision from
  PR #12 (it is correct — see prior spec).

Verification: extend `tests/wiki-links-parse-viewer.test.js` with a case where the
resolver context throws for one target — assert other links in the same post still
render and the failing one degrades to its label.

### Fix 2 (ops): clear the poisoned parse cache

After deploying Fix 1: restart NodeBB or ACP-clear the post cache so all posts re-parse.
(Also re-check that guest "Find Category" on cid 41 being absent from `/api/categories`
is intentional; read works, so links resolve either way.)

### Fix 3 (plugin): tag search results data-driven, drop the TTL-Map coupling

File: `lib/filter-forum-search.js`.

- In `filterSearchContentGetResult`, stop depending on `recallWikiSearchResult`. For each
  result post: load its topic's `cid`; if `cid` is in the wiki cid set, resolve
  `wikiPath` via the existing `resolveWikiPathForTopic` (same
  `wikiCanonicalPathAdapter.getCanonicalPageInfo` the working discussion-placeholder link
  uses) and set `post.isWikiArticle = true`, `post.wikiPath`. Batch the topic-field
  lookups; keep the guest (uid 0) reference viewer for consistency with parse-time links.
- Confirm the same tagged objects feed both "posts" and "topics" display modes (theme
  `search-results.tpl` already reads `./isWikiArticle` on topic rows; if topics mode is
  fed from a different object, attach the same flags there).
- Delete the now-unused `rememberWikiSearchResult`/`recallWikiSearchResult` Map machinery
  (keep `filterSearchInContent`'s main-post filtering — that part is still needed to keep
  replies out of results).

Verification: update `tests/filter-forum-search.test.js` — title-only search path (no
`inContent` call) must still yield `isWikiArticle`/`wikiPath` on wiki results and leave
forum results untagged. Live: guest `GET /api/search?term=module&in=titles` shows wiki
result with `wikiPath`; clicking a wiki title in both display modes lands on `/wiki/...`.

### Fix 4 (theme): search result icons

File: `templates/partials/posts_list_item.tpl`.

- Remove the `{{{ else }}}{{{ if ./isMainPost }}}<i class="fa fa-book" ...>{{{ end }}}{{{ end }}}`
  branch (line 4). Only the `isWikiArticle` badge remains; plain forum posts get no icon.
- Topics mode (`search-results.tpl`) needs no template change — the badge markup exists
  and lights up once Fix 3 delivers the flag.
- Icon choice: forum→wiki inline links keep `fa-book` (restored by Fixes 1+2 — the icon
  code at `wiki-links.js:574` is intact and gated on rendering outside a wiki category).
  If the installed FA kit is Pro, `fa-books` may be substituted in
  `wrapForumWikiLinkInner` and the search badge for a nicer look; verify the glyph
  renders before switching (Free kits don't ship `fa-books`).

Verification: update `tests/wiki-search-badge-contract.test.js` to assert the
`isMainPost` book branch is gone.

## Order of work

1. Diagnostic step (manual, 5 min) — decides whether Fix 1 alone restores links or a
   targeted resolver fix is also needed.
2. Fix 1 + tests → deploy → Fix 2 (restart/cache clear) → confirm issues 1 & 2 gone.
3. Fix 3 + Fix 4 + tests → deploy → confirm issue 3 gone.

## Review notes (2026-07-05, code-verified)

Findings from a code-level review of this spec against `sow-nodebb-plugin-wiki`,
`sow-nodebb-theme`, and NodeBB 4.13.2 (the version pinned in sow-nodebb's Dockerfile).
The four fixes stand; the diagnostic reasoning and two fix details need amendment.

### Corrections to "Root cause, issue 1+2"

- **WRONG premise: core does NOT swallow filter-hook errors.** In NodeBB 4.13.2,
  `fireFilterHook` has no try/catch for async hook methods — a throw inside
  `transformWikiPostContent` propagates out of `parsePost` and the request errors.
  The log-and-continue behavior exists only for *action* hooks. Since `/api/wiki`
  returns 200 with raw spans (not a 500), candidate **(b) live runtime throw cannot
  explain the observed symptom** as written. Rewrite the diagnostic branch
  "still broken after restart → cause is (b)".
- **"Intact spans ⇒ hook not executing" has two more explanations** the spec misses,
  both silent skips inside the transform:
  - `settings.isConfigured` false → returns content unchanged (`wiki-links.js:1171`).
  - `contentHasWikiSyntaxMarkers` (`wiki-links.js:1149`) requires the literal quoted
    form `data-wiki-entity="page"` / `"namespace"` — any attribute-order or quoting
    variant in stored content silently skips the whole transform.
  Given the first correction rules out swallowed throws, a silent guard skip is now a
  leading candidate alongside the poisoned cache. Diagnostic step should also check
  `isConfigured` and grep live content for attribute variants.
- **"Never leaves spans or `[[...]]` intact" is only true for spans/`[[...]]`** —
  `resolveRenderedWikiAnchors` deliberately returns unresolvable anchors unchanged
  (`wiki-links.js:882-923`).
- **Parse cache facts** (Fix 2): per `pid|type`, all users (no guest distinction),
  no TTL, invalidated on post edit / restart / ACP cache reset — and **enabled only
  when `NODE_ENV === 'production'`**. Check prod's `NODE_ENV`; the poisoned-cache
  theory requires it. This also explains why local tests can't reproduce.
- Fix 1 stands and is *more* urgent than stated: with bare `Promise.all`
  (`wiki-links.js:936`, `:962`) and no core catch, a single bad link currently
  errors the whole page render, not just degrades content.

### Amendments to Fix 3

- **Topics mode has no existing attach point.** `filterSearchContentGetResult` only
  touches `data.result.posts`; the plugin's only topic-side search hook is index-time
  tombstone removal. Replace "confirm the same tagged objects feed both modes" with a
  concrete plan: extend the handler to `data.result.topics` if core populates it,
  otherwise use the plugin's existing `filter:topics.get` hook (`plugin.json:178`).
- **Two carve-outs when deleting the Map machinery:**
  - `filterSearchInContent` also calls `forumExclusion.grantPidHydration(pid)`
    (`filter-forum-search.js:95`) — that grant must survive.
  - Current uid precedence is `payloadUid || tag.uid || 0`; keep viewer-uid-aware
    resolution (`getCanonicalPageInfo` does permission checks) rather than hardcoding
    uid 0.

### Amendments to Fix 4

- **Blast radius: `posts_list_item.tpl` is not search-only.** The base theme
  (harmony) imports it via `partials/posts_list.tpl` → `account/posts.tpl`, serving
  seven profile pages (posts, bookmarks, upvoted, downvoted, best, controversial,
  watched). Removing the `isMainPost` book branch strips the "opening post" marker
  from all of them. Acceptable, but decide deliberately — or gate the icon on a
  search-context flag instead.
- `wiki-search-badge-contract.test.js` currently asserts nothing about `isMainPost`,
  so the planned test update is additive; the current suite would not catch a
  regression there.

### Minor

- `replaceWikiEntityLinksWithLegacySyntax` is defined at `wiki-links.js:265` and
  called at `:949` (spec's "948→266" reads as a definition site).
- Unmentioned interaction: `filter:markdown.beforeParse`
  (`wiki-html-parse.js:14`) sets `env.parse = false` for wiki-category HTML posts;
  keep in mind for any fix relying on the markdown pipeline.

## Out of scope

- Any change to the guest reference-viewer decision from PR #12 (correct as designed).
- Search indexing changes (`filterSearchIndexTopics/Posts`) — untouched.
- The `/api/categories` visibility of cid 41 (flagged for review, not a code change).
