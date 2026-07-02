# Wiki Articles in Global Search — Design

Date: 2026-07-02
Status: Approved for planning
Repos touched: `sow-nodebb-plugin-wiki` (indexing + tagging), `sow-nodebb-theme` (result rendering)

## Problem

The global navbar search (theme `topbar.tpl` → `partials/sidebar/search.tpl`,
posting to `/search` plus the quick-search dropdown) is stock NodeBB, backed by
`nodebb-plugin-dbsearch` full-text indexing. The wiki plugin **intentionally
excludes** wiki content from that index today, so wiki articles are unfindable
via global search.

We want global search to return **both** forum posts **and** wiki articles,
with wiki hits visibly marked and linking to their `/wiki/...` path — **without**
making wiki articles appear in forum surfaces (unread, recent, etc.).

## Key facts established during research

- **Search and feeds are already separated.** The "hide wiki from unread/recent"
  behavior lives in `lib/filter-forum-feeds.js`
  (`filterTopicsUpdateRecent`, `filterTopicsGetUnreadTids`,
  `filterTopicsFilterSortedTids`, recent-topics widget cid pinning). It is
  independent of the search path. Re-enabling wiki in search does **not** make
  wiki appear in feeds.
- **dbsearch indexes per-post.** Wiki content is currently stripped in
  `lib/filter-forum-search.js` at three hooks: `filter:search.indexTopics`
  (title index), `filter:search.indexPosts` (content index), and
  `filter:search.inContent` (result pids).
- **A wiki article = a topic in a wiki category; the first post (`mainPid`) is
  the canonical article body.** Articles may also have discussion replies.
- **Post body is stored as text** (`content`, with a separate `sourceContent`
  for Tiptap source), so dbsearch full-text indexing works over article text.
- **A separate wiki search already exists** — `lib/wiki-search-service.js` does
  title/path matching for wiki page/namespace autocomplete. It is a *different
  surface* and is out of scope here (see Non-goals).
- **`filterPostGetPostSummaryByPids` (`lib/filter-forum-feeds.js`) strips all
  wiki posts from every post-summary build** — shared by search **and**
  feeds/widgets. This is the effective query-time blocker and the one shared
  touch-point requiring care.

## Decisions (locked)

| Question | Decision |
|----------|----------|
| Match type | Full-text (body + title) |
| Reply scope | Article body only (first post); replies stay out of search |
| Engine | Reuse dbsearch; no new engine, no new index, no new plugin |
| Presentation | Inline badge/icon, ranked together with forum results, link to `/wiki/...` |
| Backfill | Manual: admin clicks dbsearch ACP "Reindex" once after deploy |
| Home | Wiki plugin (indexing + tagging) + theme (rendering) |

**Rejected alternative:** a standalone search plugin / separate index. It would
duplicate wiki category+path resolution (wiki `AGENTS.md` rule 7) and add a
second search backend for no benefit — dbsearch already does the work.

## Non-goals

- No changes to `wiki-search-service.js` (title/path autocomplete). Different
  surface; leave it untouched. Do **not** attempt to unify the two.
- No change to feed/unread/recent behavior. Wiki stays out of those.
- No indexing of wiki discussion replies.
- No new "wiki-only" search UI. (dbsearch already supports category-scoped
  queries if such a surface is ever wanted; not built here.)

## Design

### 1. Indexing — selective allow instead of blanket block

In `lib/filter-forum-search.js`, invert the three hooks from "strip all wiki" to
"allow wiki *articles* only":

- **`filter:search.indexTopics`** (title index): stop stripping wiki topics.
  Wiki titles become searchable.
- **`filter:search.indexPosts`** (content index): keep a wiki post **only if it
  is its topic's main post** (`pid === topic.mainPid`); drop wiki replies and
  any non-article wiki posts. Forum posts untouched.
- **`filter:search.inContent`** (result pids): stop stripping wiki article pids
  so they survive into results.

Net: dbsearch indexes each wiki article's title + body once; nothing else wiki.

### 2. Query-time result tagging — the careful bit

Search results are built via `posts.getPostSummaryByPids`, which fires
`filter:post.getPostSummaryByPids`. The wiki plugin's handler there currently
strips **all** wiki posts, and it is shared with feeds/widgets.

**Preferred approach — search-scoped, zero feed blast radius:** during planning,
inspect the pinned NodeBB/dbsearch source for a **result-stage search hook**
(a hook fired on assembled search results, distinct from the shared summary
filter). If one exists, tag wiki article results there — set
`isWikiArticle: true` and `wikiPath` — and **leave the shared feed filter
completely untouched**. This is strictly safer and is the first thing planning
must resolve.

**Fallback approach — modify the shared filter:** if no search-scoped hook
exists, change `filterPostGetPostSummaryByPids` to **keep + tag wiki article
main-posts** (`isWikiArticle`, `wikiPath`) while still **stripping wiki replies
and non-article wiki posts**. Feeds stay wiki-free because they already remove
wiki *upstream* at the tid/pid level. This requires a **caller audit**: enumerate
every path that feeds arbitrary pids into `getPostSummaryByPids` without upstream
tid filtering; if any would leak wiki articles, strip wiki there.

Planning MUST decide which approach applies before implementation and record it.

### 3. Presentation (theme)

Wiki result rows carry `isWikiArticle` + `wikiPath` from Section 2. In the
theme's search result templates — **both** the quick-search dropdown and the
`/search` page:

- render a wiki icon/badge on those rows;
- rewrite the result link to `wikiPath` (`/wiki/...`) instead of `/topic/...`.

Results remain a single relevance-ranked list, wiki and forum interleaved
(dbsearch scoring across title + content indexes).

### 4. Backfill

Documented one-time step: after deploy, an admin opens the dbsearch ACP and
clicks **Reindex**. Existing wiki articles then flow into the index through the
now-permissive Section 1 hooks. No new code.

## Testing

Unit/contract tests in the wiki plugin `tests/`:

1. **Index hooks (Section 1):** wiki article main-post is kept for content
   indexing; wiki reply is dropped; wiki title is indexed; forum posts
   untouched.
2. **Result tagging (Section 2):** a wiki article result is tagged
   `isWikiArticle` + `wikiPath`; a wiki reply is not returned; forum results are
   unchanged.
3. **Feed isolation (Section 2 risk):** feeds/widgets still exclude wiki after
   the change (guards against the shared-filter fallback leaking).
4. **Index lifecycle:** editing a wiki article updates its indexed text;
   deleting/purging removes it from results. (Relies on dbsearch's own post
   hooks — verify the wiki plugin no longer strips wiki on those paths.)
5. **Privileges:** a wiki article in a read-restricted category does not surface
   for a user without read access (search inherits NodeBB privilege filtering;
   lock it with a test).

Manual/flagged verification:

- dbsearch indexes the stored `content` as text (markdown/HTML), not opaque
  Tiptap JSON. Low risk (`content` is text), confirm during implementation.
- End-to-end: reindex, search a term from a wiki body, confirm a badged result
  linking to `/wiki/...`.

## Docs

- Wiki plugin docs: note the "wiki = article body only, in search" behavior and
  the one-time dbsearch reindex step.
- Theme: note the search-result wiki badge if the theme documents result
  rendering.

## Open decision for planning

- Section 2: search-scoped hook (preferred) vs shared-filter change (fallback).
  Resolve against pinned NodeBB/dbsearch source before writing implementation
  tasks.
