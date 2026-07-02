# Admin Raw Wiki Topic Browser — Investigation Spec

Repos: `sow-nodebb-plugin-wiki`. Requested by vicky, 2026-07-02, as a direct consequence of the
orphan topics documented in [`wiki-index-page-bug-spec.md`](./wiki-index-page-bug-spec.md)
("Root cause 3" / "Next steps #2" there). This spec scopes that gap on its own.

## Problem

Confirmed orphan inventory in production (per the linked spec, still present as of 2026-07-02):
tid 3733–3735 ("Codebase documentation", cid 41) and tid 3737–3739 ("xtulmeboy", cid 78), all
duplicates from the composer resubmission bug. There is currently **no way for an admin to find or
delete them.**

Every listing surface this plugin exposes — `/wiki/:path` resolution, wiki search, breadcrumbs,
directory windows — is built on `lib/wiki-tree-index.js`'s canonical-tree resolver
(`resolveWikiNode` / `listWikiNodeChildren`). A topic with an ambiguous or colliding canonical path
is invisible through *all* of them at once, because they all share that same resolver. Checked
`routes/`, `lib/`, and `public/admin.js` for any existing raw/unfiltered browse or delete surface —
none exists (`grep` for "raw browse", "admin browse", "browseWiki", "orphan" across those
directories returns nothing relevant).

## What already exists to build on

- `lib/wiki-directory-service.js:458` (`getAllTopicSlugRows(parsedCid)`) already does exactly the
  kind of canonical-path-independent listing this needs: it reads
  `db.getSortedSetRange('cid:${cid}:tids', 0, -1)` directly and fetches topic fields via
  `topics.getTopicsFields`, with no canonical-tree resolution involved. It currently only returns
  fields relevant to slug-collision validation (`tid`, `cid`, `title`, `titleRaw`, `slug`,
  `westgateWikiPageSlug`, `deleted`, `scheduled`, tombstone fields) and filters out tombstoned
  topics — an admin browse view would want tombstoned/deleted rows visible too, so this needs a
  sibling function or an option flag, not a straight reuse.
- `library.js:49-53` already registers an admin page at `/admin/plugins/westgate-wiki` via
  `routeHelpers.setupAdminPageRoute` + `adminControllers.renderAdminPage`. A new browse view is a
  natural extension of this existing admin surface (new tab/section), not a new route family.
- `library.js:58+` (`plugin.registerApiRoutes`) shows the established pattern for admin-only API
  endpoints: `routeHelpers.setupApiRoute(router, method, path, [middleware.ensureLoggedIn], handler)`.
  Note this only checks `ensureLoggedIn`, not admin — need to confirm whether `adminControllers.*`
  handlers do their own admin-privilege check internally (likely, given this is mounted under
  `/admin/plugins/...`, but a raw delete endpoint needs to verify this explicitly, not assume it).

## Fix shape (not yet implemented — diagnosis/scoping only)

1. **Read side:** add a raw listing function alongside `getAllTopicSlugRows` — same
   `db.getSortedSetRange` + `getTopicsFields` approach, but including deleted/tombstoned rows and
   whatever fields the admin view needs (post count, timestamps, canonical-path validation status
   per row, so admins can see *why* a row is orphaned). Expose it via a new admin API route
   (`GET /westgate-wiki/admin/topics/:cid` or similar) and a new section on the existing
   `/admin/plugins/westgate-wiki` page.
2. **Delete side:** reuse existing topic deletion (core `topics.purge` / this plugin's own
   `onWikiTopicsPurge` / `wikiFilterTopicDelete` hooks already handle wiki-aware cleanup for normal
   deletes — check `library.js` wiring for `action:topics.purge` and `filter:topic.delete`) rather
   than inventing a new deletion path. The admin browse view's delete action should call the same
   topic-delete flow a normal admin topic-delete would use, just discoverable from a view that
   doesn't depend on canonical-path resolution to find the topic in the first place.
3. **Scope guard:** this view intentionally bypasses the canonical-tree resolver, so it must be
   admin-only and clearly labeled as a raw/diagnostic tool — not linked from normal wiki navigation
   — to avoid becoming a second, competing listing surface that drifts from canonical-tree behavior.

## Explicitly out of scope for this spec

- Actually implementing the deletion of the currently-known orphan topics (tid 3733-3735,
  3737-3739) — that's a one-time cleanup task to run once this tool (or a one-off script) exists,
  tracked as "Next steps #1" in `wiki-index-page-bug-spec.md`.
- Fixing the composer resubmission bug that created the orphans in the first place — already
  spec'd (`wiki-index-page-bug-spec.md`, "Root cause 1").

## Next steps

1. Design the admin view (fields shown, filters, pagination — likely reuse existing admin page
   CSS/JS conventions in `public/admin.js`).
2. Implement read-side listing endpoint + page section.
3. Implement delete action wired to existing topic-delete flow.
4. Use it to clean up the confirmed orphan inventory in production.
