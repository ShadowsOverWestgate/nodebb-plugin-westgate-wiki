# Wiki Index Page Bugs — Investigation Spec

Repos: `sow-nodebb` (host), `sow-nodebb-plugin-wiki` (plugin). Gitea issues referenced:
[#10](https://git.westgate.pw/ShadowsOverWestgate/sow-nodebb-plugin-wiki/issues/10) (critical, filed by xtul, open),
[#1](https://git.westgate.pw/ShadowsOverWestgate/sow-nodebb-plugin-wiki/issues/1) (separate, links-inside-index-pages bug — not directly implicated here).

## Incident report (from vicky, 2026-07-02)

1. ACP: moved "Codebase documentation" category into the main wiki category. Worked.
2. Renamed it, changed privileges. No index page existed afterward (expected — move disconnects the
   old index-page/namespace association per issue #10's own repro steps).
3. Created a child namespace `xtulmeboy` under it. Worked.
4. Tried to create an index page for `xtulmeboy` from the **full-screen editor**. Clicked Publish
   three times. Nothing appeared to happen.
5. Result: 3 duplicate `xtulmeboy` topics splintered into Documentation's listing (screenshot 1).
6. Separately, index-page creation attempts for "Codebase documentation" itself produced 3 duplicate
   "Codebase documentation" entries in the wiki root sidebar (screenshot 2).
7. Admins have no way to browse/find/delete these orphans: they don't resolve as clean canonical
   tree nodes, so they're invisible to wiki search, breadcrumbs, and directory listings — and there
   is no ACP "browse wiki topics as a forum" fallback.

## Root cause 1 — Full-screen editor: CONFIRMED

**Claim:** the full-screen editor is not "broken" for publishing — it publishes successfully every
time. What's broken is that success/error feedback becomes invisible while full-screen mode is
active, and the create flow has no resubmission guard. Each of the 3 Publish clicks fires a full
`POST /api/v3/topics`, so 3 clicks against a create-mode composer = 3 real topics.

**Evidence chain:**

- `templates/wiki-compose.tpl:76-80` — the Publish button (`#wiki-compose-submit`) lives inside
  `.wiki-compose-actions--floating`. The status/feedback paragraph `#wiki-compose-status`
  (`aria-live="polite"`, used for "Publishing…", "Page saved…", and all error text) is a **sibling**
  of that div, not a child of it:

  ```html
  <div class="wiki-compose-actions wiki-compose-actions--floating d-flex gap-2 flex-wrap">
    <button type="button" class="btn btn-primary" id="wiki-compose-submit">{submitLabel}</button>
  </div>
  <p class="small text-muted mt-2 mb-0" id="wiki-compose-status" aria-live="polite"></p>
  ```

- `tiptap/src/wiki-editor-bundle.js:4086-4113` (`enterActionsPortal` / `exitActionsPortal`) —
  entering full-screen mode finds `.wiki-compose-actions--floating` via
  `document.querySelector` and **moves only that element** (`appendChild`) into a new
  `position: fixed` portal host appended to `document.body`
  (`wiki-editor-fullscreen-actions-portal`, styled in `tiptap/src/wiki-editor.css:50-61`).
  `#wiki-compose-status` is never selected or moved — it stays behind in the original DOM
  location, which full-screen mode now visually covers.

- `public/wiki-compose-page.js:653-928` — the submit click handler:
  - `submitBtn.disabled = true` at the start, `setStatus(statusEl, "Publishing…")` (line 685-687,
    invisible target).
  - On success: `markSaved(...)`, `setStatus(statusEl, "Page saved. Use Return to article...")`
    (also invisible), then **`submitBtn.disabled = false`** (line 914) with **no navigation and no
    "already created" flag**. Nothing prevents the exact same button from re-submitting a brand-new
    `topics.post` on the next click.
  - On error: same — status set (invisible), button re-enabled.

**Net effect:** in full-screen mode, every outcome (success or failure) is silent to the user.
Silence reads as "nothing happened," inviting a re-click; a re-click on a create-mode composer is a
brand-new topic, not a retry. This is the exact shape of the incident (3 clicks → 3 duplicate
topics), independent of anything about namespace moves or index pages specifically — it would
reproduce for *any* full-screen page creation, index page or not.

**Fix shape:** keep `#wiki-compose-status` inside the floating actions so full-screen mode moves the
feedback with the buttons, and keep create-mode Publish disabled once topic creation succeeds. Edit
mode remains resubmittable.

## UPDATE — live evidence from `ovh-main` (production host), read-only

SSH'd to `ovh-main`, found the running stack: `sow-nodebb` container (image tag
`cf3e37b27ed784120ce325ec1cb180703841a49c`), `sow-nodebb-mongo`, `sow-nodebb-redis`. No
crash/error is persisted anywhere server-side — `docker logs` only carries the Express access log
plus daily-digest info lines; NodeBB's own error path never reaches stdout/stderr, and
`/usr/src/app/logs/output.log` inside the container is empty. So the literal
`Cannot read properties of undefined (reading 'category')` text cannot be recovered from server
logs after the fact — only from a live repro (see Next steps).

What the access log **does** show, cross-referenced with `GET /api/wiki/Documentation` (public,
read-only, unauthenticated JSON endpoint — no prod mutation involved in any of the below):

- Every `POST /api/v3/topics` for both `Codebase documentation` (cid 41 root) and `xtulmeboy`
  (cid 78 "Documentation") in the access log returned **400**, small body (116 bytes) — consistent
  with a thrown error being caught and returned as JSON, not a raw crash.
- Timestamps of the `xtulmeboy` attempts: `14:45:00`, `14:45:04`, `14:45:21` — all within a 21s
  window. `Codebase documentation` attempts: `12:46:30`, `12:46:39`, `12:46:43` — within 13s.
- **`GET /api/wiki/Documentation` right now returns 3 real, distinct topics, all titled
  `xtulmeboy`, all with the identical `wikiPath: /wiki/Documentation/xtulmeboy`**
  (tids 3737, 3738, 3739). `GET /api/wiki` similarly shows 3 real topics titled
  `Codebase documentation`, all with identical `wikiPath: /wiki/Codebase_documentation`
  (tids 3733, 3734, 3735).
- So despite the access log showing 400s, **at least 3 of the underlying creates actually
  succeeded** — the canonical-path collision guard did not stop them.
- `GET /api/wiki/Documentation/xtulmeboy` (the now-ambiguous canonical path) returns a clean
  **404**, not a crash — collision resolution degrades to "not found" when viewing, it does not
  throw. So the `.category` TypeError is specific to the **create/validate** request path, not to
  resolving/viewing an already-collided page.

**Earlier duplication hypothesis, superseded:** the 30-second tree-index cache TTL looked suspicious
from the access-log timing, but current code already invalidates the tree through
`action:topic.post -> clearWikiPostParseCache -> wikiDirectory.invalidateNamespace ->
wikiPaths.invalidateWikiTreeIndex`. The real duplicate trigger below is stronger: the create request
persists the topic, then crashes before `action:topic.post` can run and before the client sees a
successful response. The invisible fullscreen status and incomplete resubmission guard then made
re-clicking easy.

## Root cause 2 — `Cannot read properties of undefined (reading 'category')`: still not isolated to a line

This is the crash from issue #10, hit when creating an index page for a namespace whose category was
recently moved in the ACP (disconnecting it from any prior index-page/main-page association).

**What I checked and ruled out** (all reads of `.category` in these files are already null-guarded):

- `routes/wiki.js:360-395` (`getNamespaceIndexCreateData` — computes the parent cid + leaf title used
  to pre-fill the "Create index page" link)
- `lib/wiki-service.js` (`getSection`, `getConfiguredAncestorSections`, `getSections`)
- `lib/wiki-canonical-path-adapter.js` (`getCanonicalNamespaceInfo`, `getCanonicalPageInfo`)
- `lib/wiki-tree-index.js` (`buildNamespaceRecord`, `isNamespaceVisible`, `validateCanonicalPagePlacement`,
  `buildNamespaceCandidate`, `makeNamespaceOutput`)
- `lib/wiki-paths.js` (`validateCanonicalPagePlacement` delegate, `resolveArticlePath`)
- `lib/serializer.js`, `lib/wiki-directory-service.js`, `lib/wiki-namespace-creators.js`

**Two live candidates, unconfirmed:**

1. **NodeBB core, triggered by plugin input.** `lib/controllers/wiki-namespace-create.js:78-86` calls
   core's `categories.create({ name, description, parentCid, cloneFromCid: parentCid, uid })`. If
   `parentCid` is a category that was *just* moved in the ACP and NodeBB's own category cache hasn't
   settled/invalidated yet, core's clone-from-category logic could receive a stale or partially-formed
   source category object and throw internally. This would explain why the error text doesn't match
   any message string in this plugin's codebase — it's a raw `TypeError`, not a thrown
   `new Error(...)` from our validation code (those all have custom messages, see
   `lib/wiki-page-validation.js:29-48`).
2. **Tree-index cache staleness window.** `lib/wiki-tree-index.js` caches the whole canonical tree for
   `TREE_INDEX_CACHE_TTL_MS` and invalidates on `action:category.create/update/delete` and
   `action:topic.move` (wired in `plugin.json` → `library.js:405-441`). I have **not verified** that
   NodeBB 4.13.2's ACP "move category" action actually fires `category.update` (as opposed to, e.g.,
   a raw parentCid write that skips plugin hooks) — if it doesn't, every namespace/index computation
   for that category would run against a stale tree until the TTL naturally expires, which could
   produce inconsistent `namespace`/`category` objects across two calls in the same request.

**What would confirm which one it is:** the actual server-side stack trace from the moment of the
crash — either from existing NodeBB logs on the production host, or a fresh local repro. This is the
next step, now with permission to check the live host (`ssh ovh-main`).

## Root cause 3 — No ACP "browse wiki as forum" tool: confirmed gap, not a bug

Every listing surface this plugin exposes (search, breadcrumbs, `/wiki/:path` resolution, directory
windows) is built on canonical-tree resolution
(`lib/wiki-tree-index.js` `resolveWikiNode`/`listWikiNodeChildren`). A topic whose canonical path is
ambiguous, colliding, or simply not derivable (as happens to the orphans from root cause 1) is
invisible through *all* of these at once, because they all share the same underlying resolver. There
is no raw "list topics in category N regardless of canonical-path validity" admin view. This isn't a
symptom of bugs 1 or 2 — it's why their side effects are hard to clean up, but it's an independent,
pre-existing capability gap.

## Confirmed orphan inventory (via public read-only API, 2026-07-02)

- tid 3733, 3734, 3735 — all "Codebase documentation", all `/wiki/Codebase_documentation`, cid 41
- tid 3737, 3738, 3739 — all "xtulmeboy", all `/wiki/Documentation/xtulmeboy`, cid 78
- tid 3740 — "IndexBackup", cid 78 — **not a duplicate**, a distinct real page from a later,
  differently-titled attempt to work around the collision; leave alone

## UPDATE 2026-07-02 (later session) — Root cause 2 ISOLATED to a line, no repro needed

**Throw site: NodeBB core `src/topics/create.js:273` (v4.13.2), inside `onNewPost()`:**

```js
if (utils.isNumber(postOwner) && postData.category.cid === -1) {
```

`postData` is `undefined` there → `Cannot read properties of undefined (reading 'category')` —
exact error-text match.

**Why it's undefined:** `onNewPost` (create.js:263-267) fetches the just-created post back via
`posts.getPostSummaryByPids([pid], uid, ...)`. That core call fires
`filter:post.getPostSummaryByPids`, which this plugin hooks (`filterPostGetPostSummaryByPids`,
`lib/filter-forum-feeds.js:133-145`, wired in PR #6 "Exclude wiki content from forum feeds",
merged 2026-06-26). The filter strips any post whose cid is in the wiki cid set — **including the
post the create request itself just wrote**. Destructuring `[[postData]]` of an empty array →
`undefined` → line 273 throws. `addParentPosts` and `syncBacklinks` (lines 268-272) tolerate the
undefined entry, so line 273 is deterministically the first crash — verified against the v4.13.2
tag sources.

**Consequences, all matching the incident evidence:**

- `Topics.create` + `posts.create` (create.js:143-149) already persisted the topic/post → orphan.
- The TypeError propagates to the v3 API → 400 whose message is the raw TypeError text
  (the ~116-byte bodies in the access log).
- `action:topic.post` (create.js:176) **never fires** — so no plugin post-create bookkeeping runs
  at all: no create revision recorded, no parse/directory cache invalidation. (This supersedes the
  earlier "add `action:topic.post` to the tree-index invalidation list" framing: that hook never
  even fires on wiki creates while this crash exists. The 30s tree-index TTL analysis above still
  correctly explains why the collision guard passed for the duplicate creates.)

**Second, independent kill point in the same request:** even with the summary filter fixed,
`filterTopicsGet` (`filter:topics.get`, same file/PR) strips the new wiki topic from core's
`Topics.getTopicsByTids([tid])` at create.js:152-155, and core's guard at create.js:157-159 then
throws `[[error:no-topic]]`. Both filters break the create path; both shipped in #6.

**Scope correction to issue #10:** the ACP namespace move is a red herring. **Every** wiki page
creation through `POST /api/v3/topics` has failed this way since #6 deployed (prod image
`cf3e37b2…` pins plugin commit `a5dd291`, which includes #6). The move merely created the "no
index page" state that prompted creation attempts. tid 3740 "IndexBackup" went through the same
crash — it persisted and 400'd too; it only *looks* fine because its title is unique so canonical
resolution works.

**Fix shape:** keep the object-level forum-feed strips in place so PR #6's feed hiding remains
covered, and pair that with client-side create resubmission protection. The client must not re-enable
Publish after the topic create call has succeeded, even if a later follow-up request fails.

## Next steps (in order)

1. Clean up the duplicate orphan topics in production after this fix is deployed.
2. Add a raw admin browse/delete view for wiki-backed topics that cannot resolve through the
   canonical tree.
