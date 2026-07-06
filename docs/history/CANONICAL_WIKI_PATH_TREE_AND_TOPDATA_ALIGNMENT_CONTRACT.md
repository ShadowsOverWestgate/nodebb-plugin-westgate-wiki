# Canonical Wiki Path, Tree, and Topdata Alignment Contract

## Purpose

This contract is the umbrella authority for the next Westgate wiki public path
and tree cutover. It aligns two focused contracts that must land together:

- [HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md)
- [CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md)

The hard-line path contract owns URL derivation, lookup tolerance, migration,
and retired compatibility. The tree/index contract owns canonical node
composition, resolver/listing APIs, facet rendering, and structural namespace
index pages.

Use [CANONICAL_WIKI_PATH_TREE_IMPLEMENTATION_ENTRYPOINT_PLAN.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_PATH_TREE_IMPLEMENTATION_ENTRYPOINT_PLAN.md)
to enter implementation.

The later wiki archive subsystem consumes the canonical tree output from this
cutover. Its ZIP format, portable archive identity, previewed merge, assets,
jobs, and administrator workflow are governed separately by
[WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md)
and must not be implemented against the pre-cutover slug resolver.

## Problem Statement

The repository has a working pre-cutover clean-path system, but it encodes
assumptions that block a strict canonical wiki tree:

- namespace public segments currently derive from category slug leaves
- article public leaves currently derive from topic slug leaves or
  `westgateWikiPageSlug`
- route resolution is namespace-first and category-local, so page descendants
  below page-only nodes do not fit the model
- namespace-main-page selection stores `cid -> tid` UI state instead of deriving
  namespace index identity from canonical page/namespace overlap
- topdata generation and deploy markers still describe lowercase dash public
  slug overrides through `wiki_slug` and `page_paths.slug_overrides`
- repository docs and tests still describe old ID wiki routes, dash slugs, and
  slug collisions as forward behavior

These are not isolated refactors. Plugin runtime, migration tooling, toolkit
generation/deploy, module YAML, generated stored content, and docs must agree
before production relies on the new resolver.

## Authority And Ownership

### Plugin repository

`nodebb-plugin-westgate-wiki` owns:

- canonical runtime path/tree resolution and route rendering
- page/namespace authoring validation
- NodeBB permission-aware facet visibility
- ACP migration scan/prepare/apply/verify workflow
- runtime cache invalidation and diagnostics
- wiki-owned search, autocomplete, breadcrumbs, links, directories, and
  templates
- plugin-facing storage migrations through NodeBB APIs

The plugin must not encode topdata dataset-specific path exceptions.

### Toolkit repository

`nwnee-shadowsoverwestgate/toolkit` owns:

- topdata generated page/title/link emission
- generated marker and deploy adoption logic
- generated path declaration validation
- generated path normalization parity tests with the plugin contract

Toolkit implementation must not create a second public path standard for
generated pages.

### Module repository

`nwnee-shadowsoverwestgate/module/topdata/wiki` owns human-authored YAML and
HTML template declarations for generated wiki content. YAML remains the source
of truth for generated path/title exceptions if any remain after title-driven
paths are adopted. Generated JSON manifests and `.cache/wiki` output remain
machine artifacts.

### NodeBB storage

Topics remain page/article storage and categories remain namespace/permission
storage. Generated page ids, deploy manifest rows, and managed HTML comments
remain generated-content identity. None of those identity surfaces may silently
override public canonical title/category paths.

## Required Target State

The final state has one public wiki tree:

- namespace paths derive from configured category name hierarchy
- page paths derive from namespace placement plus page title hierarchy split by
  ` :: `
- canonical public segments preserve title case and encode spaces with `_`
- `/` is the public hierarchy separator
- one canonical node may have page and namespace facets
- strict folded matching supports typed variants only under the new standard
- retired dash, flattened-subpage, old public generated slug, and old ID wiki
  route behavior is not preserved by fallback or redirect tables

Generated pages participate in that same tree. The topdata pipeline may retain
stable generated identity for adoption and managed-region ownership, but links
and public path decisions must use the same canonical path rules as manual
pages.

## Collision Points That Must Be Resolved

### Public identity versus generated identity

The old generated marker form:

```html
<!-- sow-topdata-wiki:page=feat:power_attack wiki_slug=power-attack -->
```

mixes generated identity with a public path override. Migration must detect that
old form. New runtime path resolution must not read `wiki_slug` or the topic
field `westgateWikiPageSlug` as public URL authority.

Implementation must decide whether the replacement marker drops the public path
field entirely or replaces it with validated non-routing metadata needed by
toolkit migration reports. Do not add a new plugin runtime manual path override
under another name.

### YAML declarations

Current module YAML uses `page_paths.slug_overrides`. That name and value model
belongs to the old dash public slug contract. If generated pages still need
exceptions after title/category-derived paths are applied, replace it with a
new YAML schema that is explicit about the bounded exception it represents and
validate it in toolkit before generation/deploy.

Do not let toolkit code keep consuming old slug override YAML while plugin
runtime claims title-path truth.

### Namespace index versus homepage

The wiki homepage configured for `/wiki` is separate from canonical namespace
index pages. A namespace index page is a page facet whose canonical page path
equals a namespace facet canonical path. Retire namespace-main-page selector
state from active runtime behavior; report it during migration only as legacy
state needing remediation.

### Route root assumptions

The current implementation omits the first namespace segment when its category
slug leaf is `wiki`. A slug-derived omission is incompatible with category-name
canonical segments. Route-root behavior must be explicit, validated, and visible
in migration reports before `/wiki` tree resolution changes.

### Permission boundaries

Composite nodes do not merge topic and category permissions. Rendering, search,
breadcrumbs, autocomplete, listing children, and diagnostics must handle:

- readable page facet with hidden namespace facet
- visible namespace facet with unreadable page facet
- branch-only ancestry that is usable for a visible descendant without leaking
  hidden sibling facets

### Cache and lifecycle breadth

The current code invalidates selected namespace-directory state. The canonical
tree requires one invalidation boundary that covers topic path changes, category
path changes, configured/effective namespace changes, migration apply/verify,
and topdata deploy-created topic/post updates.

## Rollout Order

Implementation must not start from route rendering. Use this order:

1. Freeze docs/contracts and add audit tests that expose current slug/path
   assumptions.
2. Define the shared canonical segment/path normalization contract and establish
   plugin/toolkit parity fixtures.
3. Add ACP migration scan/prepare reporting before destructive or activating
   work.
4. Replace plugin internals with canonical tree/index and resolver APIs behind
   focused tests.
5. Move route/render/listing/index-page behavior onto canonical nodes.
6. Move authoring, search, autocomplete, links, breadcrumbs, watches,
   discussions, and emitted wiki paths onto the canonical path facade.
7. Align toolkit generation/deploy and module YAML, rebuild generated pages,
   and clear old generated public slug influence.
8. Apply and verify production migration only when plugin and generated
   topdata output agree.

## Documentation Authority

Documents describing the pre-cutover clean-path implementation remain useful
audit evidence, but they are not forward architecture when they conflict with
this contract stack. In particular:

- README/AGENTS slug-leaf language describes current runtime unless explicitly
  marked as target contract language
- `docs/topdata-bot-content-contract.md` owns HTML storage/sanitizer shape, not
  old public slug compatibility
- editor-focused Superpowers specs and plans remain historical/current for their
  editor scopes and are not superseded unless they discuss wiki public paths

New implementation planning for this cutover must cite this contract stack and
must not implement from isolated search hits in old docs.

Archive planning is downstream: it may preserve canonical paths and topdata
marker state in portable records, but it must keep archive portable identity
separate from generated identity and from public path authority.

## Non-Goals

- Direct MongoDB/Redis migration scripts.
- A manual per-topic canonical public path field.
- Old URL redirect tables or compatibility alias maps.
- A new generated-only wiki resolver.
- Replacing NodeBB topic/category storage boundaries.
- Reopening editor feature plans unrelated to public path/tree semantics.

## Completion Gate

The alignment is complete only when:

- plugin and toolkit normalization/path fixtures agree
- migration Scan/Prepare expose every blocking path, folded-key, route-root,
  legacy namespace-main-page, and old generated public slug issue
- runtime routes and emitted wiki links use canonical tree results
- generated topdata content is regenerated/deployed without old public slug
  authority
- caches invalidate on all path-affecting topic/category/settings/deploy events
- docs no longer instruct implementation agents to expand the old slug resolver
  as the target architecture
