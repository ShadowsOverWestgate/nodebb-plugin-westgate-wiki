# Wiki Manager Raw Browse Tool — Spec

Repos: `sow-nodebb-plugin-wiki`. Requested by vicky, 2026-07-02, as a direct consequence of the
orphan topics documented in [`wiki-index-page-bug-spec.md`](./wiki-index-page-bug-spec.md)
("Root cause 3" / "Next steps #2" there). This spec scopes that gap on its own.

Revised 2026-07-03: access model changed from admin-only to **wiki managers** (see below), which
moves the tool from the ACP to a frontend page, and the delete design was simplified to reuse
existing endpoints (no new API routes at all).

## Problem

Confirmed orphan inventory in production (per the linked spec, still present as of 2026-07-02):
tid 3733–3735 ("Codebase documentation", cid 41) and tid 3737–3739 ("xtulmeboy", cid 78), all
duplicates from the composer resubmission bug. There is currently **no way for anyone to find or
delete them.**

Every listing surface this plugin exposes — `/wiki/:path` resolution, wiki search, breadcrumbs,
directory windows — is built on `lib/wiki-tree-index.js`'s canonical-tree resolver
(`resolveWikiNode` / `listWikiNodeChildren`). A topic with an ambiguous or colliding canonical path
is invisible through *all* of them at once, because they all share that same resolver. Checked
`routes/`, `lib/`, and `public/admin.js` for any existing raw/unfiltered browse or delete surface —
none exists.

## Access model (revised 2026-07-03)

The tool is for **wiki managers**: administrators plus members of the groups configured in the
plugin's `wikiNamespaceCreateGroups` setting. The gate already exists —
`lib/wiki-namespace-creators.js` (`isWikiNamespaceCreator` / `getCanCreateWikiNamespaces`), used by
the namespace-create page and endpoint.

Consequences:

- **Not an ACP page.** `/admin/plugins/...` routes are admin-gated by NodeBB core, so non-admin
  wiki managers could never reach a browse view there (the original draft's placement was wrong for
  this audience). The tool is a frontend page at **`/wiki/manage`**, registered before the
  `/wiki/:path(*)` catch-all, following the `/wiki/namespace/create/:parent_cid` gating pattern
  (`middleware.ensureLoggedIn` + `isWikiNamespaceCreator` → `helpers.notAllowed`).
- **ACP section rename.** The ACP section currently labeled "Groups allowed to create wiki
  namespaces" now grants two capabilities (namespace creation + the raw manage view), so it is
  renamed to **"Wiki manager groups"** with copy explaining both. Label/copy only — the stored
  settings key `wikiNamespaceCreateGroups` is unchanged (renaming it would need a settings
  migration for zero benefit).
- `manage` must be added to the `RESERVED_FIRST_SEGMENTS` sets (duplicated in `lib/wiki-paths.js`,
  `lib/wiki-tree-index.js`, `lib/wiki-path-migration.js`, `lib/wiki-archive-manifest.js`) so no
  namespace can claim that path segment.

Future scope (not this spec): "soft-admin" for wiki managers — implicit moderate access over wiki
categories (move/delete/create anything in the wiki without per-category ACP privilege edits). For
now, the manage view grants **visibility** to managers; destructive actions still enforce the
existing per-category/topic privileges server-side.

## What already exists to build on

- `lib/wiki-directory-service.js` (`getAllTopicSlugRows(parsedCid)`) already does exactly the kind
  of canonical-path-independent listing this needs: it reads
  `db.getSortedSetRange('cid:${cid}:tids', 0, -1)` directly and fetches topic fields via
  `topics.getTopicsFields`, with no canonical-tree resolution involved. It filters out tombstoned
  topics and omits fields the manage view wants (uid, mainPid, postcount, timestamp), so the manage
  view needs a sibling function that keeps every row — not a straight reuse.
- `lib/wiki-paths.js` `getTopicSlugLeafCounts(rows)` already computes slug-leaf collision counts —
  a leaf count > 1 among live, non-tombstoned rows is precisely what makes topics invisible to the
  canonical resolver (the known orphan class).
- **Delete already works for orphans.** `PUT /api/v3/plugins/westgate-wiki/page/tombstone` and the
  restore/hard-purge flow on `/wiki/history/:tid` resolve topics **by tid**
  (`topicService.getWikiPage` never touches canonical-path resolution to find the topic), so they
  work for topics the canonical tree cannot see. The global `[data-wiki-tombstone-page]` click
  handler in `public/wiki.js` (a site-wide script per `plugin.json`) works from any page. Permission
  checks stay server-side in those endpoints (`topics:delete`, `wiki:hard-purge` per category).
- Orphan topics unreachable via `/wiki/...` are still reachable at their forum URL
  `/topic/:slug` — the manage view links there for inspection.

## Fix shape

1. **Read side (no new API):** a raw listing function alongside `getAllTopicSlugRows` — same
   `db.getSortedSetRange` + `getTopicsFields` approach, but keeping deleted/scheduled/tombstoned
   rows and adding uid/mainPid/postcount/timestamp. A server-rendered page at `/wiki/manage`
   walks `settings.effectiveCategoryIds`, shows namespaces as a raw parent/child tree keyed by
   `parentCid` (not canonical paths), and lists every topic row per namespace with diagnostic
   flags: `deleted`, `scheduled`, `tombstoned`, `slug collision` (via `getTopicSlugLeafCounts`).
2. **Delete side (no new API):** each row gets a tombstone button reusing the existing
   `[data-wiki-tombstone-page]` handler/endpoint, plus links to `/topic/:slug` (raw view) and
   `/wiki/history/:tid` (existing restore + hard-purge UI). No new deletion path is invented;
   managers without delete privileges on a category get the endpoint's 403.
3. **Scope guard:** this view intentionally bypasses the canonical-tree resolver, so it is gated to
   wiki managers, clearly labeled as a raw/diagnostic tool, and not linked from normal wiki
   navigation. It is mentioned in the renamed ACP section's help text so admins can find it.

## Explicitly out of scope for this spec

- Deleting the currently-known orphan topics (tid 3733–3735, 3737–3739) — a one-time cleanup task
  to run once this tool exists, tracked as "Next steps #1" in `wiki-index-page-bug-spec.md`.
- Fixing the composer resubmission bug that created the orphans — already spec'd
  (`wiki-index-page-bug-spec.md`, "Root cause 1").
- Namespace (category) deletion. Categories are deleted via the core ACP category manager; the
  manage view links each namespace to `/admin/manage/categories/:cid` for admins only.
- Soft-admin / implicit moderation for wiki managers (future scope, above).

## Next steps

Implementation plan: [`superpowers/plans/2026-07-03-wiki-manage-raw-browse.md`](./superpowers/plans/2026-07-03-wiki-manage-raw-browse.md)

1. ~~Design the manage view~~ (this revision).
2. Implement raw listing helper + `/wiki/manage` page (plan tasks 1–3).
3. Rename the ACP section (plan task 4).
4. Use the tool to clean up the confirmed orphan inventory in production.
