# Wiki Revision History Design

## Scope

This design replaces reliance on vanilla NodeBB post diffs for launch-critical
wiki article history, rollback, and delete recovery behavior. Wiki articles
remain NodeBB topics, and the first post remains the canonical article body,
but article revision history becomes plugin-owned.

The design covers:

- durable revision storage for long wiki articles
- readable wiki-native revision review and diff UI
- deterministic restore to older article states
- plugin-owned tombstone delete behavior instead of wiki hard purge by default
- custom category privileges for viewing history, restoring revisions, and
  hard-purging tombstoned pages
- cache, route, listing, search, autocomplete, and forum-exposure behavior for
  deleted wiki pages
- automated and manual validation expectations

This design does not replace the canonical path/tree model, the Tiptap editor,
or NodeBB topic/category storage boundaries.

## Problem

Vanilla NodeBB post history is not robust enough for wiki launch readiness.
It stores post diffs optimized for forum posts and exposes a UI that is poor
for long articles. More importantly, wiki moderation needs stronger guarantees
than the current flow provides:

- a malicious or accidental blanking edit must be easy to inspect and undo
- incorrect edits must be reversible without relying on fragile forum history
- rollback must work for long HTML articles and title changes
- delete must not silently destroy the only recoverable article state
- revision permissions must be separable from ordinary edit permission

The current plugin save path in `lib/wiki-page-actions.js` delegates to
`posts.edit`, so revision history, restore, and delete recovery inherit NodeBB
post behavior. The current delete flow also hard-purges wiki topics for
simplicity, which avoids some NodeBB soft-delete complexity but leaves no clean
way to restore the same wiki page identity after deletion.

## Design Choice

Implement a plugin-owned checkpointed revision journal with plugin-owned
tombstones.

Ordinary edits store git-like patch records instead of a full article copy for
every save. Full checkpoints are stored at controlled boundaries so restore is
not dependent on an unbounded diff chain. Wiki delete becomes a tombstone that
hides the page from public wiki surfaces while preserving the same `tid`,
discussion thread, watches, metadata, and revision journal for staff restore.

Reject these alternatives:

- Wrapping NodeBB post diffs with a better UI. This leaves the core robustness
  issue unresolved.
- Full snapshot on every edit. This is simpler but can become wasteful for
  long articles with frequent edits.
- Pure delta-only event sourcing. This recreates the fragility that checkpoints
  are intended to avoid.

## Revision Storage Model

Create a focused revision service, tentatively `lib/wiki-revisions.js`, that
owns revision IDs, patch creation, checkpoints, reconstruction, and hash
verification.

Each revision record should include:

- stable revision id
- `tid`, `pid`, `cid`, article title, canonical path metadata, and title path
- actor uid and timestamp
- action type: `create`, `edit`, `move`, `restore`, `tombstone`, `undelete`,
  or `repair-checkpoint`
- source hash before and after the change
- source byte counts before and after the change
- patch text for ordinary revisions
- checkpoint source for checkpoint revisions
- pointer to parent revision
- restore source revision id when action type is `restore`
- tombstone metadata when action type is `tombstone` or `undelete`

The stored article source should be the plugin-sanitized source HTML used for
the first post, not rendered read-only HTML after parser transforms.

Checkpoint rules:

- store a full checkpoint for the first tracked revision
- store a checkpoint every configured number of revisions
- store a checkpoint when the patch is larger than the resulting source by a
  configured ratio
- store a checkpoint before tombstone/delete
- store a checkpoint before and after restore
- store a `repair-checkpoint` if reconstruction detects an inconsistent chain
  but the current NodeBB article source can still be trusted

Restore reconstructs from the nearest checkpoint and applies patches forward.
Every reconstructed step must verify the expected hash. Any mismatch fails
closed and returns a repair-needed diagnostic instead of writing article
content.

## Save Integration

Wiki save should continue to use the current wiki action path so validation,
sanitization, edit locks, watches, mentions, path validation, bylines, and
cache invalidation stay aligned.

The save flow should become:

1. Load the current first-post source and current latest wiki revision.
2. Sanitize and validate the proposed article source.
3. Validate title and canonical placement as today.
4. Create a pending revision plan with hashes, patch, and checkpoint decision.
5. Save through `posts.edit`.
6. Verify stored `content` and `sourceContent` match the sanitized source.
7. Commit the revision record.
8. Invalidate wiki caches and return the canonical path.

Where possible, revision planning failures should occur before mutating the
NodeBB post. If NodeBB save succeeds but revision commit fails, the action
must return a hard error and record enough diagnostic state for staff repair.

Page move and owner-change behavior should be audited. Move operations that
change title or namespace should append a revision entry with title/path
metadata even when article body content is unchanged. Owner changes do not need
to create article revisions unless the final implementation chooses to include
administrative audit events in the same timeline.

## Tombstone Lifecycle

Create a tombstone service, tentatively `lib/wiki-tombstones.js`, that stores
hidden/deleted state without using NodeBB topic purge for normal wiki deletion.

Normal wiki delete should:

1. Require the relevant delete permission plus wiki tombstone action authority.
2. Append a tombstone revision with a checkpoint of the current article source.
3. Mark the topic as wiki-tombstoned in plugin-owned storage or a topic field.
4. Invalidate canonical tree, namespace directory, search/listing, and forum
   exclusion caches.
5. Redirect to the parent namespace or `/wiki`.

Tombstoned pages must be absent from normal public wiki behavior:

- canonical article routes return not found or missing-page create behavior
  according to existing path rules
- namespace listings and canonical node listings omit the page
- search, autocomplete, breadcrumbs, and internal link resolution treat the
  page as absent for normal users
- forum recent/unread/search exposure remains suppressed
- the forum topic first-post placeholder must not expose a public article link
  to users without restore/history authority

Staff with revision permissions may still access a tombstoned page's history
and restore it. Restore should clear tombstone state and preserve the same
`tid`, first post, discussion thread, watches, article CSS, discussion-disabled
state, archive identity, and canonical path metadata when valid.

Hard purge becomes a separate destructive cleanup action. It should only be
available for tombstoned wiki pages, use a stronger confirmation, require a
dedicated privilege, and remove both NodeBB content and plugin-owned revision
state. The normal delete button must never call NodeBB hard purge.

## Permissions

Register custom category privileges with NodeBB through
`static:privileges.categories.init`:

- `wiki:history`: view wiki revision timeline, revision details, and diffs
- `wiki:restore`: restore a revision and undelete a tombstoned page
- `wiki:hard-purge`: permanently remove tombstoned wiki content and revision
  history

Ordinary editing can continue to use existing `posts:edit` checks. History and
restore are stronger wiki capabilities and should not be implied by edit
permission.

Permission checks should live behind a small service, tentatively
`lib/wiki-revision-permissions.js`, so route handlers, render data, and tests
do not duplicate category privilege logic.

## UI And API

Add a wiki-native history surface rather than extending the NodeBB post-history
modal.

Routes and actions:

- article FAB button: revision history, shown only with `wiki:history`
- `GET /wiki/history/:tid`: long-article revision timeline
- `GET /api/v3/plugins/westgate-wiki/revisions/:tid`: list revisions
- `GET /api/v3/plugins/westgate-wiki/revisions/:tid/:revisionId`: load one
  revision
- `GET /api/v3/plugins/westgate-wiki/revisions/:tid/:fromRevisionId/:toRevisionId/diff`:
  compare two revisions
- `PUT /api/v3/plugins/westgate-wiki/revisions/:tid/:revisionId/restore`:
  restore one revision
- `PUT /api/v3/plugins/westgate-wiki/page/tombstone`: tombstone a page
- `DELETE /api/v3/plugins/westgate-wiki/page/hard-purge`: hard purge a
  tombstoned page, if implemented in the first pass

The history UI should be optimized for long articles:

- chronological timeline with action, actor, timestamp, title, path, size
  delta, and tombstone/restore markers
- selectable revision comparison
- readable line diff for source review
- rendered preview for reconstructed revision content
- clear restore affordance only when `wiki:restore` is allowed
- explicit warnings when viewing or restoring tombstoned pages

Restore should:

1. Require `wiki:restore`.
2. Acquire or validate the wiki edit lock.
3. Reconstruct the selected revision from the nearest checkpoint.
4. Verify hashes at every step.
5. Sanitize the reconstructed source.
6. Validate title and canonical placement before writing.
7. Save through `posts.edit`.
8. Append a new `restore` revision pointing back to the source revision.
9. Clear tombstone state if needed.
10. Invalidate all affected wiki caches.
11. Return the canonical wiki path visible to the actor.

## Architecture

Suggested file boundaries:

- `lib/wiki-revisions.js`: storage model, revision ids, patches,
  checkpoints, reconstruction, hash verification
- `lib/wiki-tombstones.js`: deleted state, visibility checks, restore/clear
  behavior, cache invalidation helpers
- `lib/wiki-revision-permissions.js`: custom privilege registration and
  permission checks
- `lib/wiki-revision-actions.js`: API handlers for list, detail, diff,
  restore, tombstone, and hard purge
- `lib/controllers/wiki-revisions.js`: server-rendered history route
- `templates/wiki-history.tpl`: revision timeline and compare UI
- `public/wiki-history.js`: client behavior for diff loading, preview, restore,
  and confirmations
- `public/wiki-history.css` or existing wiki CSS entry if the project chooses
  to keep CSS co-located with current wiki styles

The canonical tree and directory services must learn to exclude tombstoned
topics. Prefer a small tombstone visibility predicate used by tree input
collection, directory scans, search/autocomplete services, and route
resolution instead of spreading topic-field checks throughout the codebase.

## Testing Requirements

This feature must be well tested before it is launch-ready.

Automated coverage should include:

- patch creation and reconstruction for long HTML articles
- checkpoint selection by first revision, revision interval, large patch ratio,
  tombstone, and restore
- hash mismatch failure and repair-needed diagnostics
- blank-content or near-blank malicious edits
- title-only and namespace move revisions
- restore from a checkpoint and restore across several patch revisions
- restore of a tombstoned page to the same `tid`
- permission gates for history, restore, tombstone, and hard purge
- normal delete uses tombstone and cannot hard purge
- hard purge requires tombstone state and dedicated authority
- tombstoned pages are absent from canonical routes, tree index, namespace
  listings, directory APIs, search, autocomplete, link resolution, breadcrumbs,
  and public forum placeholder links
- cache invalidation after save, move, tombstone, restore, and hard purge
- watch notifications and mention notifications continue to behave correctly
  for normal saves and restores
- article CSS, discussion-disabled state, archive page id, and other page
  metadata survive tombstone restore

Manual validation should cover:

- desktop and mobile history page layout for a long article
- comparing two large revisions
- restoring a pre-blanking revision
- deleting a page, confirming it disappears from public wiki surfaces, and
  restoring it as staff
- confirming normal users cannot discover tombstoned pages through search,
  autocomplete, route guesses, or forum topic views
- hard purge confirmation and post-purge absence of both NodeBB content and
  revision records

## Non-Goals

- Replacing NodeBB topic/category storage.
- Reusing the vanilla NodeBB post-history modal as the wiki history UI.
- Blocking edits based only on size or deletion guardrails.
- Adding arbitrary public path overrides.
- Making ordinary wiki edit permission automatically grant restore authority.
- Treating hard purge as the normal wiki delete behavior.
