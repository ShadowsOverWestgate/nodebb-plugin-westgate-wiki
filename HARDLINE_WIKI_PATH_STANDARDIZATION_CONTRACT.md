# Hard-Line Wiki Path Standardization

## Summary

Refactor the Westgate wiki path system into one strict, title-driven canonical tree.

Canonical examples:

```text
/wiki/Lore/Deities/Gond
/wiki/Lore/Deities/Gond/Clerics
/wiki/Feats/Inspire_Competence
```

Hard-line rules:

- `/` is the only wiki hierarchy separator.
- Canonical public path segments preserve title case.
- Spaces in canonical URLs become `_`.
- Page URL paths are always derived from current page titles and title hierarchy.
- Namespace URL paths are always derived from configured category hierarchy and category names.
- ` :: ` remains page-title hierarchy syntax in authored titles.
- Old lowercase dash slug rules are removed from the canonical wiki path model.
- Old flattened subpage slug rules are removed.
- Do not preserve retired path rules with redirects, aliases, fallback resolvers, or compatibility shims.
- Existing wiki data must be migrated into the new standard before relying on the new resolver in production.

## Canonical Model

### Public wiki tree

Every public wiki URL after `/wiki/` is a canonical tree path.

A node may have:

- a **page facet** backed by a NodeBB topic
- a **namespace facet** backed by a NodeBB category
- both

Valid composite node:

```text
page:      /wiki/Lore/Deities/Gond
namespace: /wiki/Lore/Deities/Gond
child:     /wiki/Lore/Deities/Gond/Clerics
```

If a node has both facets:

- render the article page at the canonical URL
- expose child pages and child namespaces from the article node navigation/index

### Backing storage

Keep NodeBB storage boundaries:

- topics remain article/page storage
- categories remain namespace/permission-root storage
- topic permissions govern article read/edit/delete
- category permissions govern namespace visibility and creation scope

The public path model is unified even though NodeBB objects remain distinct.

## Canonical Segment Rules

### Segment source

Page path segments come from current title hierarchy:

```text
Title: Gond :: Clerics
Segments: Gond / Clerics
URL: /wiki/Lore/Deities/Gond/Clerics
```

Namespace path segments come from category names in configured wiki category hierarchy:

```text
Category names: Lore -> Deities
URL: /wiki/Lore/Deities
```

Do not use NodeBB topic slug leaves or category slug leaves as canonical wiki path sources.

### Segment normalization

Replace the current lowercase dash slug contract.

Canonical segment normalization must:

- preserve meaningful ASCII letter case
- keep digits
- transliterate supported accented/common Latin characters consistently across plugin and toolkit
- convert whitespace runs to `_`
- normalize separator punctuation consistently under the new standard
- drop word-joiner punctuation such as apostrophes and quotes where current normalization already does so
- reject empty normalized segments
- reject reserved route-root conflicts
- never flatten multiple title segments into one segment

Examples:

```text
Inspire Competence -> Inspire_Competence
Grandmaster's Battle Momentum -> Grandmasters_Battle_Momentum
Gond :: Clerics -> Gond/Clerics
```

## Lookup Rules

### Canonical output

Wiki-owned links and UI must emit only canonical title-shaped URLs:

```text
/wiki/Feats/Inspire_Competence
```

### Tolerant typed lookup

Typed user input may resolve when unambiguous:

```text
/wiki/Feats/inspire_competence
/wiki/Feats/Inspire_Competence
/wiki/Feats/Inspire%20Competence
```

Successful non-canonical variants redirect to:

```text
/wiki/Feats/Inspire_Competence
```

This tolerance is part of the new standard, not legacy URL compatibility.

### Folded lookup collisions

Maintain a folded lookup key for tolerant matching.

Fold together at least:

- case variants
- `_` and typed space variants
- percent-decoded spaces
- equivalent transliteration forms used by the canonical segment normalizer

Reject ambiguous siblings that fold to the same lookup key.

## Resolver And Routing

### Unified resolver

Refactor `lib/wiki-paths.js` into the canonical tree service.

It resolves:

- namespace facets from category names and category hierarchy
- page facets from page titles and ` :: ` title hierarchy
- folded typed URL variants under the new standard

Expected resolver shape:

```js
{
  status: "ok",
  canonicalPath: "Lore/Deities/Gond",
  wikiPath: "/wiki/Lore/Deities/Gond",
  page: { ... } | null,
  namespace: { ... } | null,
  redirectToCanonical: true | false
}
```

### Route behavior

`/wiki/:path(*)` must:

- parse and decode input segments safely
- resolve exact canonical paths
- resolve folded typed variants only when unique
- redirect variants to canonical title-shaped URLs
- render page-only nodes as articles
- render namespace-only nodes as namespace listings
- render composite nodes as article-primary views
- support descendants under page-only, namespace-only, or composite ancestors

Do not keep the old route assumption that all ancestor segments before a page leaf are category namespaces.

## Collision Policy

### Valid

- page and namespace facet at same canonical path
- page descendants under a page facet
- page descendants under a namespace facet
- page descendants under a composite node

### Blocking

- page/page canonical collision
- page/page folded lookup collision
- namespace/namespace canonical collision
- namespace/namespace folded lookup collision
- invalid title-derived segment
- invalid category-name-derived segment
- reserved route-root conflict

Do not resolve collisions by falling back to NodeBB slug leaves or old lowercase dash slugs.

## Authoring Flows

### Create

Page creation must:

- derive path from current tree context plus title hierarchy
- emit title-case `_` canonical URLs
- create slash-separated descendants from ` :: `
- reject canonical and folded collisions before publish

### Edit

Title edit must:

- recompute canonical URL
- validate collisions before save
- return the new canonical URL
- redirect to the new canonical URL after save when path changes

URL changes after title edits are expected.

### Move and reparent

Move/reparent behavior must be expressed through:

- topic category placement changes
- title hierarchy changes

Do not add an independent stored manual page path source that can drift from title truth.

### Namespace creation

Namespace creation must:

- derive canonical path from category names and hierarchy
- allow page+namespace composite overlap
- reject namespace/namespace canonical or folded collisions
- use the same segment normalizer as page paths

## Links, Search, Navigation

Update all wiki-owned path emission and lookup:

- wiki route handlers
- serializer
- topic/page service
- wiki service
- compose publish redirects
- save/edit/move responses
- delete redirects
- internal links
- redlinks
- autocomplete
- search
- breadcrumbs
- page and namespace directories
- sidebar navigation
- namespace creation responses
- watch/discussion/mention emitted wiki paths
- templates consuming `wikiPath`

## Toolkit And Topdata Standardization

This is a coordinated plugin + toolkit change.

### Required toolkit changes

Update generated wiki public path generation to the same standard:

- case-preserved canonical segments
- `_` for canonical spaces
- slash hierarchy
- shared transliteration and punctuation rules
- folded collision checks where generated public paths share one tree scope

### Remove old generated path assumptions

Audit and update:

- plugin `lib/wiki-slug.js`
- toolkit `internal/topdata/wiki_slug.go`
- generated page marker parsing/validation
- generated public path override YAML
- deploy matching and page lookup
- documentation and tests describing lowercase dash public wiki slugs

Do not keep generated pages on old dash slugs while manual pages use title-case underscore paths.

## Migration Path

## Migration goal

Bring existing live wiki pages and generated wiki content into the new strict title-driven path standard without preserving old URL behavior.

Migration must:

- identify every page and namespace path under the new rules
- detect collisions before activating the new resolver contract
- update old plugin-owned generated path metadata that would keep old slug behavior alive
- rebuild generated wiki output under the new toolkit contract
- invalidate path/index/cache state cleanly
- avoid direct writes to MongoDB or Redis from ad hoc operator scripts

## Persistence rule

Even though the live NodeBB deployment uses MongoDB and Redis, implementation must use NodeBB abstractions:

- `topics.getTopicsFields`
- `topics.setTopicField`
- `topics.deleteTopicField`
- `db` APIs already exposed by NodeBB where plugin-owned records are needed
- plugin cache invalidation hooks/services

Do not implement migration by directly modifying MongoDB collections or Redis keys.

Operationally:

- MongoDB and Redis must both be backed up before migration.
- Redis cache/session effects must be considered during restart and post-migration validation.
- Migration code should invalidate plugin-owned path/directory caches explicitly and rely on NodeBB rebuild/restart for runtime asset/state cutover.

## ACP migration workflow

Add administrator-only ACP migration tooling:

1. **Scan**
2. **Prepare**
3. **Apply**
4. **Verify**

### 1. Scan

Scan computes the path map from existing live data using the new rules.

Inputs:

- configured wiki namespace categories
- effective descendant categories
- category names and hierarchy
- wiki topic titles and titleRaw values
- generated wiki markers/fields currently persisted on topics
- current topdata-generated path metadata where visible to the plugin

Report:

- canonical page paths derived from existing titles
- canonical namespace paths derived from category names
- page/page canonical collisions
- page/page folded collisions
- namespace/namespace canonical collisions
- namespace/namespace folded collisions
- invalid title-derived page segments
- invalid category-name-derived namespace segments
- reserved route conflicts
- valid composite page+namespace nodes
- pages with current generated `westgateWikiPageSlug` fields that represent the old public slug contract
- pages whose generated marker content still carries old lowercase dash public path metadata
- page titles that will produce materially different public URLs under the new standard

Scan must not write data.

### 2. Prepare

Prepare is a migration preview/export step.

It should produce a structured ACP report downloadable or copyable by operators, containing at least:

- topic id
- category id
- current title
- old emitted wiki path if the old resolver can compute it
- new canonical wiki path
- collision/error status
- whether the page is generated/topdata-managed
- whether old generated slug metadata must be cleared or refreshed

Prepare exists so operators can repair data before apply:

- rename page titles
- fix ` :: ` title hierarchy where it is wrong
- rename namespace categories where folded paths collide
- update topdata wiki config/overrides before generated redeploy

### 3. Apply

Apply should run only when Scan has no blocking errors.

Apply must:

- mark the wiki path standard version in plugin-owned settings/migration metadata
- remove or clear old plugin-owned generated slug metadata that would force old public wiki path behavior, where the new generated standard no longer uses it
- update any plugin-owned migration bookkeeping required to prevent old/new resolver mixing
- invalidate plugin path indexes and wiki directory caches
- return a post-apply verification report

Apply must not:

- preserve old URL aliases
- write old-to-new redirects
- create a durable manual canonical path field for title-driven pages
- rewrite page titles automatically
- rewrite human-authored article content automatically
- directly mutate MongoDB or Redis outside NodeBB APIs

### 4. Verify

Verify recomputes the new canonical map after Apply and reports:

- clean migration version state
- zero blocking path collisions
- no remaining old plugin-owned generated slug behavior active in resolver code paths
- pages whose content still contains hardcoded retired wiki URLs for manual repair where detectable

## Generated page migration

Generated topdata content needs a coordinated migration path:

1. Update toolkit slug/path generation to new standard.
2. Update topdata YAML declarations and overrides to the new standard.
3. Rebuild generated wiki pages.
4. Redeploy generated pages to NodeBB.
5. Ensure generated page markers/metadata no longer feed old lowercase dash wiki path behavior into the plugin.

If a generated page title should produce a different public segment than default normalization, use the new standardized topdata override mechanism, not old dash-slug compatibility.

## Existing manual page migration

Manual pages should migrate primarily through their current titles.

Examples:

```text
Old title: Asdf :: A sub page :: Baby page
New URL:   /wiki/<Namespace>/Asdf/A_sub_page/Baby_page
```

Operators fix data before Apply if existing titles are structurally wrong.

Migration should not guess alternate hierarchy for titles that lack ` :: `.

## No URL compatibility migration

Do not add:

- old-to-new redirect tables
- Redis alias maps for retired paths
- MongoDB alias documents for retired paths
- fallback resolvers for dash slugs
- fallback resolvers for flattened subpages
- old lowercase public wiki slug acceptance

Retired examples may break:

```text
/wiki/lore/deities/gond-clerics
/wiki/feats/inspire-competence
```

That is intentional.

## Explicitly Retired Behavior

Remove from canonical wiki behavior:

- lowercase dash public wiki slug emission
- lookup by flattened full-title slug
- subpage flattening like `gond-clerics`
- old generated/manual public path divergence
- old URL aliasing
- old fallback matching

## Test Plan

### Plugin path tests

Cover:

- title-case canonical segment generation
- spaces -> `_`
- nested `::` page hierarchy -> `/`
- category-name namespace hierarchy -> title-shaped URLs
- transliteration parity with toolkit
- empty segment rejection
- reserved path rejection

### Lookup tests

Cover:

- exact canonical URL resolves
- lowercase new-standard variant redirects canonical
- typed-space variant redirects canonical
- percent-encoded space variant redirects canonical
- folded collisions reject
- old dash URL does not resolve
- old flattened subpage URL does not resolve

### Tree resolver tests

Cover:

- page-only node
- namespace-only node
- page+namespace composite node
- article-first composite rendering
- child page under page-only ancestor
- child page under namespace ancestor
- child page under composite ancestor

### Lifecycle tests

Cover:

- create ordinary page
- create nested subpage
- title edit changes canonical URL
- title edit collision rejects save
- category move changes namespace prefix
- redlink creation follows new title-derived rule
- “Make Subpage” emits slash-tree URL

### Migration tests

Cover:

- scan is read-only
- scan derives new canonical paths from existing titles
- scan derives namespace paths from category names
- scan detects canonical and folded collisions
- scan detects old generated slug metadata
- prepare report includes old/new path comparison
- apply refuses on blocking scan errors
- apply clears old active generated slug metadata only through NodeBB APIs
- apply invalidates plugin path and directory caches
- apply is idempotent
- verify confirms clean standardized state
- no aliases or redirects are created

### Toolkit/topdata tests

Cover:

- new generated public path segment contract
- generated marker/config validation under new standard
- YAML override migration/validation
- generated page-to-page canonical links
- deploy matching under title-case `_` public paths
- removal of old lowercase dash assumptions

## Live VPS Runbook

### Before deployment

1. Schedule a wiki/forum maintenance window.
2. Back up MongoDB.
3. Back up Redis or capture the Redis persistence state required for recovery.
4. Preserve current plugin and toolkit revisions for rollback.
5. Capture the current Westgate Wiki ACP namespace configuration.

### Deploy code

1. Deploy updated wiki plugin code.
2. Deploy updated toolkit code used for generated wiki builds/deploys.
3. Rebuild plugin editor assets only if touched by implementation.
4. Rebuild NodeBB assets.
5. Restart NodeBB.

### Migrate data

1. Open `ACP > Plugins > Westgate Wiki`.
2. Run **Scan**.
3. Run **Prepare** and save the report.
4. Fix blocking source data:
   - conflicting page titles
   - conflicting ` :: ` title hierarchies
   - conflicting category names/hierarchy
   - outdated topdata wiki path overrides
5. Re-run **Scan** until no blocking errors remain.
6. Run **Apply**.
7. Run **Verify**.

### Migrate generated wiki content

1. Rebuild topdata wiki output with the updated toolkit.
2. Review generated URLs/markers under the new standard.
3. Deploy generated wiki output to NodeBB.
4. Re-run ACP **Verify** if generated deploy changes page titles or generated path metadata.

### Manual cleanup

Fix broken references manually:

- hardcoded old wiki URLs in forum posts
- old announcements/docs
- bookmarks where practical
- external references where controlled
- human-authored article links that bypass `[[...]]` resolution and point directly to retired URLs

### Live verification

Verify:

```text
/wiki/Feats/Inspire_Competence
/wiki/Feats/inspire_competence
/wiki/Feats/Inspire%20Competence
```

Also verify:

- namespace-only node
- page-only node
- composite page+namespace node
- nested subpage node
- internal links
- redlinks
- search/autocomplete
- breadcrumbs
- compose create
- edit/save path changes
- delete flow
- generated topdata wiki links

## Assumptions

- Standardization is prioritized over compatibility.
- Retired public wiki path rules are removed, not bridged.
- Slash hierarchy remains canonical.
- Emitted canonical URLs preserve title case.
- Emitted canonical spaces become `_`.
- Page URLs are always title-driven.
- Namespace URLs are category-name-driven.
- New-standard typed variants may canonicalize when uniquely resolvable.
- Page+namespace same-path overlap is valid.
- Live NodeBB persistence includes MongoDB and Redis, but migration code uses NodeBB APIs rather than backend-specific writes.
