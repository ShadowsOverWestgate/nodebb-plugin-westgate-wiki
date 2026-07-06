# Architecture

One page for orienting in this plugin. Read this before anything in
`docs/history/` (finished-work archaeology, references deleted modules).

## The domain in five sentences

A **namespace is a NodeBB category**; the set of wiki categories comes from
plugin settings (`categoryIds` + optional child inheritance →
`effectiveCategoryIds`). A **wiki page is a NodeBB topic** whose main post is
the article body. A page's URL is its **canonical path**: the namespace's
category-name chain plus the normalized topic title (`" :: "` in a title
creates subpage segments), computed by the canonical tree — the single path
engine. An **index page** is a page whose canonical path equals a namespace's
path (it lives in the parent category, titled like the namespace); the linkage
is stored durably on the topic as `westgateWikiNamespaceIndexCid` so title
edits don't demote it. Everything else — links, search, directory listings,
archive import/export — derives from these.

## lib/ layout

| Directory | Responsibility | Start with |
|---|---|---|
| `lib/core/` | settings, slugs/normalization, title-path serializer, cache invalidation, shape contracts | `config.js`, `wiki-slug.js` |
| `lib/tree/` | **the path engine**: canonical tree build + resolution, directory listings, breadcrumbs, diagnostics | `wiki-tree-index.js` (engine), `wiki-paths.js` (facade — use this) |
| `lib/content/` | HTML transforms on article content: `[[link]]` resolution, sanitizer, footnotes, TOC, mentions, per-article CSS | `wiki-links.js` |
| `lib/pages/` | guarded mutations: create/move/save, edit locks, revisions, tombstones, native-mutation guards | `wiki-page-actions.js`, `wiki-topic-mutations.js` |
| `lib/read/` | page/section retrieval and serialization for rendering | `wiki-service.js`, `topic-service.js` |
| `lib/forum/` | keeping wiki content out of forum surfaces (categories, feeds, search) | `forum-exclusion-service.js` |
| `lib/archive/` | ZIP import/export subsystem (self-contained, ~5k lines) | `wiki-archive-import.js` |
| `lib/features/` | leaf features: article watch, mention notifications, autocompletes | — |
| `lib/controllers/` + `routes/wiki.js` | HTTP layer; `library.js` is hook/route wiring only | `routes/wiki.js` |

## The three contracts

Defined and asserted in `lib/core/wiki-shapes.js`; pinned by
`tests/wiki-shapes-contract.test.js`. If you change one of these shapes, the
producer throws with the missing keys — update `wiki-shapes.js` and grep for
consumers in the same change:

1. **Resolver result** — `wikiPaths.resolveWikiNode(path, {uid})` →
   `{status, canonicalPath, wikiPath, redirectToCanonical, node, ancestors, children}`
   where `node` is `{page, namespace, isComposite, isBranchOnly, segments…}`.
2. **Path info** — `getCanonicalPageInfo`/`getCanonicalNamespaceInfo` →
   `{valid, hiddenByPrivileges, canonicalPath, wikiPath}`. `hiddenByPrivileges`
   distinguishes "doesn't exist" from "exists but this viewer can't see it".
3. **Resolver context** — the object `wiki-links.js` threads through its
   helpers (viewer, category maps, memoized lookups).

## The invalidation rule

There is exactly one: **`lib/core/wiki-cache-invalidation.js` clears
everything, always.** All public invalidation entry points delegate to it;
each cache module (settings 30s, tree 30s, directory 15s) exposes only a plain
clear of its own maps and never calls another module. If you add a cache, add
its plain clear to `invalidateAll` and nothing else. Do not reintroduce
scoped/partial invalidation without a profiler in hand — disjoint partial
clears were the plugin's main historical bug factory.

Two related rules for content parsing: `filter:parse.post` runs the transform
chain in fixed priority order (markdown-prep 4 → links 6 → mentions 7 →
footnotes 8), each stage re-parsing the previous stage's HTML; and link
resolution runs as **guest** (uid 0) because core caches parsed posts per-pid,
not per-viewer — per-viewer access is enforced at the `/wiki/*` route instead.

## Tests

- **Unit** (`node scripts/test.mjs`): fast, run against in-memory NodeBB stubs.
  Use `tests/helpers/nodebb-stub.js` — install before requiring lib modules,
  override only what the test asserts on. These CANNOT catch plugin↔NodeBB
  contract bugs.
- **Integration** (`tests/integration/`, run from a NodeBB checkout with
  `test_database`/`test_plugins` configured):
  `npx mocha --no-bail node_modules/nodebb-plugin-westgate-wiki/tests/integration/<spec>`.
  `smoke.spec.js` covers create→link→resolve→HTTP; `lifecycle.spec.js` covers
  rename/move/privilege mutations; `archive-snapshot.spec.js` imports a real
  production export and writes `prod-url-snapshot.json` — **diff that snapshot
  after any path-engine change; deployed URLs must not move.**
