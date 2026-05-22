# Canonical Wiki Tree Index and Namespace Index Pages

## Summary

Implement this after the hard-line path derivation and migration groundwork is
defined, but before runtime route activation relies on the new resolver. The
refactor should make the canonical wiki tree the shared source for routing,
listings, search, autocomplete, breadcrumbs, and namespace index-page
rendering.

## Contract Role And Dependency

Read the umbrella alignment contract and the hard-line path standardization
contract before this document:

- [CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md)
- [HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md)

This contract owns the canonical node tree after path derivation rules are
settled. It does not reopen compatibility for retired dash slugs, flattened
subpage slugs, legacy article/category ID wiki routes, generated public slug
overrides, or namespace-main-page selectors.

Phases:

1. Audit and remove current slug/main-page assumptions.
2. Build a canonical node index and resolver/listing API.
3. Refactor route/render/authoring flows around page, namespace, and composite facets.
4. Refactor search, autocomplete, breadcrumbs, sidebar, and directory surfaces.
5. Extend ACP migration/reporting, cache invalidation, topdata coordination, and tests.

## 1. Current-State Audit Checklist

Audit these plugin surfaces before implementation:

- Canonical path assumptions in [lib/wiki-paths.js](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/lib/wiki-paths.js), especially:
  - category slug segment use
  - topic slug leaf use
  - `westgateWikiPageSlug`
  - namespace-first then article-last resolution
  - legacy article/namespace path fallbacks
- Route behavior in [routes/wiki.js](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/routes/wiki.js):
  - `/wiki/:path(*)`
  - legacy `/wiki/category/...`
  - legacy numeric topic route
  - section-first rendering order
  - missing-page redlink create behavior
- Data shaping in:
  - `lib/wiki-service.js`
  - `lib/topic-service.js`
  - `lib/serializer.js`
  - `lib/wiki-directory-service.js`
- Search/navigation surfaces:
  - `lib/wiki-search-service.js`
  - `lib/wiki-link-autocomplete.js`
  - `lib/wiki-breadcrumb-trail.js`
  - directory/sidebar templates and client code
- Authoring/lifecycle surfaces:
  - `lib/wiki-page-validation.js`
  - `lib/wiki-page-actions.js`
  - `lib/controllers/compose.js`
  - `lib/controllers/wiki-namespace-create.js`
- Retire current stored namespace-main-page behavior:
  - `lib/wiki-namespace-main-pages.js`
  - compose checkbox/API/template wiring
  - sort/pin logic in wiki service and directory service
- Cache and hook coverage in `library.js`, `lib/cache-service.js`, `plugin.json`.
- Route-root behavior now inferred by `shouldOmitRouteRootSegment()` when the
  first category slug leaf is `wiki`; root exposure must become explicit rather
  than slug-derived.
- ACP/admin diagnostics in `lib/controllers/admin.js` and admin template.
- Coordinated topdata/toolkit surfaces:
  - `toolkit/internal/topdata/wiki_slug.go`
  - `toolkit/internal/topdata/wiki_page_paths.go`
  - `toolkit/internal/topdata/wiki_native.go`
  - `toolkit/internal/topdata/wiki_deploy.go`
  - `module/topdata/wiki/wiki.yaml`
  - generated marker parsing and deploy adoption logic

## 2. Target Architecture

### Canonical data model

Represent every canonical tree node by derived data only:

```js
{
  canonicalPath: "Lore/Deities/Gond",
  foldedKey: "lore/deities/gond",
  segments: ["Lore", "Deities", "Gond"],
  pageFacet: { tid, cid, titlePath, canonicalPath } | null,
  namespaceFacet: { cid, categoryChain, canonicalPath } | null,
  hasDescendants: true | false
}
```

Rules:

- Page path = namespace prefix from topic category + normalized `titleRaw/title` hierarchy from ` :: `.
- Namespace path = normalized configured category name hierarchy.
- Do not store a manual page path on topics.
- A node may be:
  - page-only
  - namespace-only
  - page+namespace composite
  - branch-only ancestor created by descendant page paths
- Page+namespace exact overlap is valid.
- Multiple canonical nodes sharing one folded lookup key are blocking ambiguity, even when facet types differ.
- `/wiki` homepage identity is outside this canonical node index. The homepage
  may link into the tree, but a configured homepage topic is not a namespace
  index page unless its own canonical page path structurally overlaps a
  namespace node.

### Ownership split

- Keep `lib/wiki-paths.js` as resolver/path facade.
- Add or extract a focused canonical tree/index service if `wiki-paths.js` becomes too broad, for example `lib/wiki-tree-index.js`.
- Reuse NodeBB topic/category APIs and plugin caches; do not introduce MongoDB/Redis mutation scripts.

## 3. Resolver and Index API Shape

Refactor resolver entrypoints around canonical nodes rather than “namespace then leaf page” lookup.

Expected API surface:

```js
resolveWikiNode(requestPath, { uid, includeChildren })
listWikiNodeChildren(nodeOrPath, { uid, mode, cursor, limit })
getCanonicalPagePath(topic)
getCanonicalNamespacePath(category)
validateCanonicalPagePlacement({ cid, title, omitTid })
validateCanonicalNamespacePlacement({ category, parentCid })
invalidateWikiTreeIndex(reason)
```

Representative resolution result:

```js
{
  status: "ok",
  requestedPath: "lore/Deities/Gond",
  canonicalPath: "Lore/Deities/Gond",
  wikiPath: "/wiki/Lore/Deities/Gond",
  redirectToCanonical: true,
  node: {
    page: { tid, cid, topic } | null,
    namespace: { cid, category } | null,
    isComposite: true,
    isBranchOnly: false
  },
  ancestors: [],
  children: {
    directNodes: [],
    childNamespaces: [],
    childPages: []
  }
}
```

Required resolver behavior:

- Decode and normalize typed paths safely.
- Resolve exact canonical paths first.
- Resolve folded variants only when unique.
- Redirect new-standard typed variants to canonical output.
- Do not resolve retired dash or flattened-subpage URLs.
- Build children from both:
  - category child namespaces
  - title-tree descendants under the resolved canonical prefix
- Support children below page-only and composite ancestors.

Collision outputs should distinguish:

- page/page canonical collision
- page/page folded collision
- namespace/namespace canonical collision
- namespace/namespace folded collision
- cross-facet folded ambiguity across different canonical nodes
- invalid canonical segment
- reserved route-root conflict

## 4. Rendering Behavior

Refactor `/wiki/:path(*)` to resolve one canonical node and then render by available visible facets.

| Node state | Render |
|---|---|
| Namespace-only | Namespace header plus automatic listing |
| Page-only | Article page; child page listing/navigation if descendants exist |
| Page+namespace | Article first, automatic namespace listing below |
| Branch-only | Listing/create context if descendants exist; otherwise missing |
| Missing namespace index page | Namespace listing with create-index affordance if allowed |

Rendering rules:

- Composite node article content is primary.
- Automatic listing is rendered below authored content for composite/index nodes.
- Namespace-only nodes do not fabricate article content.
- Missing index page means “namespace exists without page facet,” not an error.
- Child page under page-only ancestor must resolve and breadcrumb correctly.
- Child page under composite ancestor must resolve and show the composite ancestor as one canonical breadcrumb node.
- If the page facet is unreadable but namespace facet is visible, render namespace listing only.
- If namespace facet is hidden but page facet is readable, render article without namespace listing.

Templates likely need consolidation around a shared listing partial used by section and composite/article views.

## 5. Authoring and Lifecycle Behavior

### Namespace index page identity

Detect namespace index pages structurally:

- A namespace index article is any page facet whose canonical path exactly equals a namespace facet canonical path.
- Do not keep `cid -> tid` namespace main-page selection as an override.
- Migration reports existing stored namespace-main selections for remediation, then Apply removes them from active behavior.
- Retire the namespace-main-page API, compose checkbox/template state,
  directory pin/sort use, tests, and DB-key reads from active runtime behavior.
  Retained migration reporting may read the old key until Apply remediation is
  complete.

### Create

- Namespace listing UI exposes `Create index page` only when no page facet exists and a valid topic creation scope exists.
- Create action pre-fills the title/category placement needed to derive the namespace path.
- Ordinary page create continues to derive path from namespace placement plus title hierarchy.
- Do not derive an index-page title from a public URL string. Use the namespace
  category chain and canonical segment/title rules so create validation and
  later title edits use one source of truth.

### Edit

- Edit index page using normal page editing.
- Title edits recompute canonical path and may turn an index page into a normal page.
- Reject save when the new canonical or folded placement collides.

### Move

- Moving topic category or title hierarchy recomputes path.
- Moving a page onto an existing namespace path may intentionally create a composite node if no page collision exists.
- Category rename/move recomputes namespace paths and composite overlaps.

### Delete

- Deleting an index page removes only the page facet.
- The namespace facet and its automatic listing remain.
- Deleting/moving a namespace category invalidates namespace facets and affected descendant paths.

## 6. Search, Listing, Breadcrumbs, and Navigation

### Listings

Use the canonical tree index for:

- namespace child namespaces
- direct child page nodes
- descendant page directory windows under a canonical node prefix
- page-only and composite subtree browsing

Listing rows should carry:

```js
{
  canonicalPath,
  wikiPath,
  displayTitle,
  namespaceContext,
  facets: { page: true, namespace: false },
  relativePath,
  tid,
  cid
}
```

### Search and autocomplete

Search results should display:

- canonical path
- namespace context
- facet type: page, namespace, or composite
- title leaf and parent title context for page descendants

Behavior:

- Coalesce composite page+namespace at the same canonical node rather than showing conflicting duplicate results.
- Search only emits canonical wiki URLs.
- Autocomplete insertion text continues to respect wiki/forum context but derives targets from canonical path/tree data.
- Namespace autocomplete and page autocomplete should share folded matching rules with the resolver.

### Breadcrumbs and navigation

Breadcrumbs should follow canonical segments, not old category+slug assumptions.

- Link each ancestor when it resolves to a visible node or usable listing context.
- Render branch-only unresolved ancestors as text when no routable node exists.
- Composite crumbs use one canonical URL.
- Sidebar/directory navigation should show child nodes relative to current canonical node, including subpage descendants below page-only ancestors.

## 7. Migration Considerations

Extend ACP migration tooling from the path-standardization contract with index/index-page reporting.

### Scan additions

Report:

- canonical tree node counts by facet type
- composite page+namespace nodes
- branch-only page-tree ancestors
- namespace-only nodes missing page facets
- existing stored namespace-main-page selections
- index-page candidates created by canonical overlap
- folded tree lookup ambiguities across all node types
- old generated slug metadata still influencing plugin path logic

### Prepare additions

Export per affected node:

- canonical path
- page topic/category IDs if present
- namespace category ID if present
- old namespace-main-page selection if present
- index-page status: exact overlap, missing, invalid, collision
- old/new search/listing visibility impact where detectable

### Apply additions

Apply should:

- refuse on blocking canonical/folded collisions
- mark canonical index/index-page migration version
- invalidate canonical tree/search/directory caches
- disable and remove active namespace-main-page selector behavior
- clear retired generated slug metadata through NodeBB APIs where required
- avoid redirects, aliases, old slug lookup, and direct database mutation

### Verify additions

Verify should confirm:

- tree index rebuild succeeds
- resolver has zero blocking ambiguity
- ACP reports no active namespace-main-page override behavior
- generated page deploy output no longer depends on old public slug topic metadata
- namespace index pages are recognized only by canonical overlap

## 8. Cache Invalidation Strategy

Create one central invalidation path for canonical tree-dependent caches.

Invalidate tree/index/search/listing state on:

- page create: `action:topic.post`
- page edit/content save where marker/path metadata changes: `action:post.edit`
- title change: `action:topic.edit`
- page delete/purge: `action:topic.delete`
- topic category move: `action:topic.move`
- category create: `action:category.create`
- category rename/move/update: `action:category.update`
- category delete: `action:category.delete`
- settings changes that alter configured/effective namespaces
- generated topdata deploy operations, via their normal topic/post hooks and explicit marker/path invalidation coverage
- ACP migration Apply and Verify rebuild paths

Cache policy:

- Namespace/category structure changes invalidate descendants, not just one category.
- Topic title/category changes invalidate the affected old and new canonical prefixes.
- Bulk migration Apply may invalidate all wiki tree, directory, search, autocomplete, and folded lookup caches.

## 9. Test Plan

### Canonical tree/index tests

Cover:

- page-only node
- namespace-only node
- composite node
- branch-only ancestor from descendant title path
- child page under page-only ancestor
- child page under composite ancestor
- child namespace under namespace/composite node
- canonical and folded collision rejection
- reserved segment rejection
- deterministic tree ordering

### Resolver/route tests

Cover:

- canonical route resolves
- folded typed variant redirects canonical
- typed spaces and percent-encoded spaces redirect canonical
- retired dash URL fails
- retired flattened subpage URL fails
- composite route renders article plus listing
- namespace-only route renders listing
- unread page facet vs visible namespace facet
- visible page facet vs hidden namespace facet

### Authoring tests

Cover:

- create normal page
- create namespace index page
- edit index page without path change
- title edit removing composite overlap
- move page onto namespace path to form composite
- delete index page while namespace remains
- collision rejection before save/move/create
- namespace create and rename folded collision validation

### Search/navigation tests

Cover:

- canonical path display
- namespace context display
- facet badge/type display
- composite deduplication
- autocomplete canonical targets
- breadcrumbs for page-only, namespace-only, composite, and branch-only ancestors
- sidebar/directory children for canonical prefixes

### Migration/cache tests

Cover:

- Scan read-only behavior
- Prepare report index-page additions
- Apply refusal on blocking collisions
- Apply retirement of namespace-main-page active behavior
- Verify clean canonical index state
- invalidation hooks for topic/category changes
- generated deploy path invalidation behavior

### Toolkit/topdata tests

Cover:

- new title/category-derived canonical path normalization parity
- no old `wiki_slug`/dash public-path dependence in plugin lookup
- generated marker and deploy adoption behavior under canonical paths
- YAML/config validation for any retained generated path declarations
- generated links emit canonical title-shaped wiki paths

## 10. Risks, Open Questions, and Defaults

### Risks

- Current directory/search code is category-local; canonical page descendants require path-prefix tree queries without reintroducing slug flattening.
- Category rename/move can change many descendant canonical namespace paths at once.
- Root namespace index-page creation may need explicit handling when the canonical parent storage category is not obvious.
- Search/autocomplete performance may regress if the canonical index rebuild path repeatedly hydrates all readable topics.
- NodeBB article visibility and category visibility can diverge at composite
  nodes; permission-aware indexing/listing cannot assume one facet makes the
  other facet visible.

### Defaults Chosen

- Retire stored namespace-main-page selectors rather than preserving override behavior.
- Namespace index-page identity is canonical page+namespace overlap only.
- Automatic listings render below authored article content.
- Composite search results are coalesced at one canonical node.
- No retired URL fallback, redirect table, alias map, or old lowercase dash compatibility is added.
