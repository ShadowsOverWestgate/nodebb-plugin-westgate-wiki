# Wiki Links Broken in Forum Posts — Investigation Spec

Repos: `sow-nodebb` (host), `sow-nodebb-plugin-wiki` (plugin). Reported by vicky, 2026-07-02,
alongside [`wiki-index-page-bug-spec.md`](./wiki-index-page-bug-spec.md) (same incident window,
different symptom).

## Incident report

Wiki links (`[[Page]]` syntax and rendered `<a href="/wiki/...">` anchors) inside **regular forum
posts** stopped resolving to working links site-wide, and the book icon
(`.wiki-forum-link-icon`, `fa-book`) that normally decorates them is gone. Screenshot: a pinned
post by `xtul` (ADMINISTRATOR) linking "Module Development Setup on Windows" — renders as plain
underlined text, no icon, and (per report) the link no longer navigates anywhere useful.

Same production window as the orphan-topic incident in `wiki-index-page-bug-spec.md`: ACP move +
rename + **privilege change** on the "Codebase documentation" category, nested under the main wiki
category (cid 41).

## Root cause — CONFIRMED via code + live evidence

**Claim: this is two bugs compounding.** One is a pre-existing latent defect in this plugin's
viewer-context handling; the other is the privilege change from the same incident that exposed it.

### Bug A (pre-existing, latent): link resolution always runs as guest, and the result gets cached for everyone

`lib/wiki-links.js` decides whether to render a working link (vs. degrade to plain escaped text)
by checking topic-read privilege for "the current viewer":

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

This reads `data.uid` / `data.req.uid` off the payload passed to the `filter:parse.post` hook
(`transformWikiPostContent`, wired in `plugin.json` at priority 6). **Core never puts a `uid` or
`req` on that payload.** Checked against NodeBB core's `src/posts/parse.js`
(`/home/vicky/Projects/nodebb-dev/forum`) across its full git history — the hook fire has always
been:

```js
({ postData } = await plugins.hooks.fire('filter:parse.post', { postData, type }));
```

`{ postData, type }` only, every version. So `getParseViewerUid` is unconditionally `undefined`,
and `normalizeViewerContext(undefined)` in `wiki-links.js:354-363` silently resolves to
**`{ hasViewerUid: true, viewerUid: 0 }`** — guest — for literally every post parse, regardless of
who requested the page. `canReadTopic` (`wiki-links.js:431-445`) then gates the link on
`privileges.topics.filterTids("topics:read", [tid], 0)`.

**This alone doesn't explain "stopped working"** — it's been true since this code was written.
What turns it from a latent bug into a visible outage is core's own parse cache:
`Posts.parsePost` (`src/posts/parse.js:47-49`) caches rendered content keyed by
**`pid|type` only — not by viewer**:

```js
const cacheKey = `${String(postData.pid)}|${type}`;
const cachedContent = cache.get(cacheKey);
if (postData.pid && cachedContent !== undefined) {
  postData.content = cachedContent;
  return postData;
}
```

Whatever the link resolves to on the *first* parse (always evaluated as guest, per Bug A) is
cached and served to every subsequent viewer — admins included — until this plugin's own
`clearWikiPostParseCache` (`action:topic.post`) or a post edit invalidates it.

### Bug B (trigger): guest lost read access to the wiki category

Live check, 2026-07-02, unauthenticated `GET https://westgate.pw/api/categories`:

```json
{"categories":[{"cid":9,"name":"Information", ...},{"cid":5,"name":"Support", ...}]}
```

Guest currently sees only cid 9 and cid 5 — **cid 41 ("Wiki") is not in the list.** Since Bug A
means link resolution always runs as guest, this alone is enough to break every wiki link in every
forum post: `canReadTopic` returns `false` for guest → `getArticlePathForTopic` returns `""` →
`wiki-links.js:1074-1096` and siblings fall back to `escapeHtml(displayLabel)` — plain text, no
`<a>`, no `wrapForumWikiLinkInner` book icon wrapper. This matches the screenshot exactly.

The incident report for the orphan-topic bug (`wiki-index-page-bug-spec.md`) independently
confirms an ACP privilege change happened on this category tree during the same session
("Renamed it, changed privileges"). That's the most direct candidate for how guest lost
`topics:read` here — not confirmed from ACP audit history (none available), but consistent with
both the timing and the live privilege state.

## Why this reads as "completely broken, across the board"

Every post containing `[[...]]` syntax or a rendered `/wiki/...` anchor hits the same code path
and the same guest-context privilege check. It doesn't matter who posted it, who's viewing it, or
which forum category the post itself lives in — only whether the *target* wiki topic is
guest-readable. Once guest lost read access to cid 41, every existing cached parse became stale in
the wrong direction (silently correct-looking until re-parsed) and every new parse degrades
immediately. That reads exactly as "stopped working across the board" rather than "broken for some
users."

## Fix shape

Two independent fixes, addressing the two bugs separately — neither alone fully resolves this for
the future:

1. **Immediate unblock (ACP config, not code):** restore whatever read privilege on the wiki
   category tree got removed. This alone fixes the reported symptom, because it makes the
   guest-context result (which is what actually gets cached and served) correct again. Left to
   vicky to apply directly in ACP — not a code change.

2. **Correct the code bug:** the real defect is that this plugin bakes a **viewer-specific**
   privilege decision into **viewer-independent** cached HTML. Passing a real uid into
   `getParseViewerUid` would not fully fix this even if core supported it — whichever viewer
   triggers the first parse still poisons the cache for everyone else. The fix needs to stop
   depending on per-request viewer identity for what gets embedded in cached post content. Two
   candidate approaches, not yet chosen:
   - Resolve visibility against a fixed reference privilege (e.g., "is this topic readable by the
     lowest configured read group for the wiki category," decided once from config rather than a
     specific uid) — link rendering becomes deterministic per-topic instead of per-viewer, and
     actual per-viewer enforcement stays where it already lives: the `/wiki/*` route.
   - Or: always render the link (don't gate on privilege at parse time), and let the existing
     `/wiki/*` route-level privilege check on click-through decide access, same as how the redlink
     path already works for missing pages.
   Either way, `getParseViewerUid` and the `data.uid`/`data.req.uid` reads it depends on should be
   removed — they've never received real data from core and give a false impression that this is
   viewer-aware today.

## Confirmed evidence log (2026-07-02)

- Core hook payload shape (`{ postData, type }`, no uid/req) — verified against full git history of
  `src/posts/parse.js` in `/home/vicky/Projects/nodebb-dev/forum`.
- Core parse cache is keyed `pid|type`, not per-viewer — `src/posts/parse.js:47-49`.
- Live: unauthenticated `/api/categories` omits cid 41 (Wiki) — guest lacks `topics:read` there
  right now.
- Live: `/api/wiki` (the plugin's own public wiki-read endpoint) *does* return cid 41 content for
  guest — confirms the wiki page route itself uses a different, working access path; only the
  forum-embedded-link resolver in `wiki-links.js` is affected.
- No server-side stack traces or errors for this path in `docker logs sow-nodebb --since 48h`
  (checked via `ssh ovh-main`, read-only) — consistent with this being a silent
  privilege-check-fails-closed degradation, not a crash.
- `git log -- lib/wiki-links.js` shows no changes since `9a5dd65` (well before this incident) —
  ruling out a recent code change in this file as the trigger; the trigger is the privilege change,
  not new code.

## Next steps

1. Restore guest (or intended group) `topics:read` on the wiki category tree in ACP — unblocks the
   reported symptom immediately, no deploy needed.
2. Design and implement one of the two code fix shapes above so this can't silently regress again
   the next time category privileges change.
