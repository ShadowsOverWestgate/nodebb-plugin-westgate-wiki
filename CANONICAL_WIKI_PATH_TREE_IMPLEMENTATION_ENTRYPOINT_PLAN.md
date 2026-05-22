# Canonical Wiki Path and Tree Implementation Entrypoint Plan

## Purpose

This is the entrypoint for AI agents implementing the canonical Westgate wiki
public path/tree cutover. Do not begin from a single route, test failure, or
search result in historical docs. Read the contract stack first:

1. [CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md)
2. [HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md)
3. [CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md)

The focused Superpowers implementation plan for decomposition lives at
[docs/superpowers/plans/2026-05-22-canonical-wiki-path-tree-cutover.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/docs/superpowers/plans/2026-05-22-canonical-wiki-path-tree-cutover.md).

## Scope Routing

Primary owner: `nodebb-plugin-westgate-wiki`.

Coordinated owners:

| Area | Owns |
|---|---|
| plugin | path facade, canonical tree resolver, route/render flows, migration ACP, validation, links/search/navigation, runtime cache hooks |
| toolkit | topdata path/link generation, marker parsing, deploy adoption and API interaction, parity tests |
| module | `topdata/wiki` YAML declarations and generated-page template expectations |

Keep changes in the owner for the behavior being changed. Do not hide toolkit
path logic inside plugin migration code or hardcode module dataset exceptions in
plugin runtime.

## Current Audit Anchors

Agents must inspect these before implementation:

- `lib/wiki-paths.js`: category slug segments, topic slug leaves,
  `westgateWikiPageSlug`, route-root slug omission, legacy paths.
- `routes/wiki.js`: namespace-first catch-all resolution and legacy wiki route
  handling.
- `lib/wiki-directory-service.js`, `lib/wiki-search-service.js`,
  `lib/wiki-link-autocomplete.js`, `lib/wiki-links.js`: category-local slug
  matching and emitted paths.
- `lib/wiki-namespace-main-pages.js`, compose/controller/template wiring, and
  directory/service sort behavior: stored namespace main-page retirement.
- `plugin.json`, `library.js`, `lib/cache-service.js`: path-affecting hook and
  invalidation coverage.
- `docs/topdata-bot-content-contract.md`: generated content storage contract.
- `toolkit/internal/topdata/wiki_slug.go`,
  `toolkit/internal/topdata/wiki_page_paths.go`,
  `toolkit/internal/topdata/wiki_native.go`,
  `toolkit/internal/topdata/wiki_deploy.go`: generated slug/public path
  assumptions.
- `module/topdata/wiki/wiki.yaml` and `module/topdata/wiki/README.md`: old
  generated slug override declarations.

## Phase Plan

### Phase 0: Lock Authority And Characterization

Goal: make current behavior and target behavior explicit before refactoring.

- Add/adjust characterization tests for old slug-leaf behavior only where they
  expose removal work; rename or rewrite them as target tests when the phase
  lands.
- Add target parity fixtures for title/category canonical normalization shared
  between plugin and toolkit.
- Keep docs clear on current runtime versus target contract.

Exit gate: agents can point to tests/doc sections for every retired behavior.

### Phase 1: Canonical Segment And Generated Identity Contract

Goal: stop mixing public canonical paths with NodeBB/topic slug leaves and
topdata generated identity.

- Introduce the plugin canonical segment/path normalization API.
- Introduce or align toolkit normalization from the same fixture table.
- Design replacement for old `page_paths.slug_overrides` only if generated pages
  still need bounded YAML path/title exceptions.
- Define generated marker parsing that retains generated page identity without
  authorizing `wiki_slug` public routing.

Exit gate: plugin/toolkit parity tests pass and YAML/marker migration rules are
validated before resolver cutover.

### Phase 2: Migration Reporting Before Activation

Goal: let operators see whether live data can enter the new tree.

- Add ACP Scan and Prepare reports for canonical page/namespace paths, folded
  collisions, invalid segments, reserved roots, explicit route-root state,
  namespace-main-page legacy state, and generated public slug state.
- Keep Scan read-only.
- Make Apply refuse while blocking collisions or generated-public-path blockers
  remain.

Exit gate: live data can be previewed without enabling mixed old/new routing.

### Phase 3: Canonical Tree Index And Resolver

Goal: replace namespace-first then page-leaf internals with canonical nodes.

- Keep `lib/wiki-paths.js` as facade.
- Extract canonical tree/index responsibility when facade width demands it.
- Resolve exact canonical paths first and folded variants only when unique.
- List children from category namespace descendants and title-tree descendants.
- Preserve NodeBB permissions per facet.
- Add one canonical tree invalidation boundary.

Exit gate: page-only, namespace-only, composite, and branch-only fixture trees
resolve and list deterministically.

### Phase 4: Route, Render, And Namespace Index Pages

Goal: render canonical nodes rather than old section/article alternatives.

- Refactor `/wiki/:path(*)` to one node resolver.
- Render article-primary composites with automatic listing below content.
- Render namespace-only listing views and branch-only listing/create context.
- Retire namespace-main-page active API/UI behavior.
- Keep `/wiki` homepage behavior distinct from namespace index pages.

Exit gate: route tests cover composite, visibility-split, branch-only,
namespace-only, canonical redirects for typed variants, and retired URL failure.

### Phase 5: Authoring And Emitted Paths

Goal: stop peripheral code from rebuilding old paths.

- Move create/edit/move/delete validation and redirects onto canonical placement.
- Move internal links, redlinks, autocomplete, search, breadcrumb trail,
  sidebar, directory, watch, discussion, mention, serializer, and templates
  onto canonical path/tree outputs.
- Reject canonical/folded collisions before persistence.

Exit gate: repository searches for old public slug helpers find only migration
reporting/removal coverage or explicitly current-to-retire characterization.

### Phase 6: Toolkit, Module YAML, And Generated Page Refresh

Goal: make generated content an equal participant in the new tree.

- Align toolkit generated links/public targets with canonical title paths.
- Replace old module YAML slug declaration shape if still needed.
- Rebuild generated wiki output and deploy/adoption tests.
- Clear old plugin-owned generated public slug metadata through NodeBB APIs in
  migration Apply where required.

Exit gate: generated page links, markers, deploy adoption, and plugin routing no
longer depend on lowercase dash public slugs.

### Phase 7: Verify Cutover And Remove Stale Authority

Goal: activate only after the system agrees.

- Verify migration state and tree rebuild.
- Verify zero blocking path/folded ambiguities.
- Verify caches invalidate on topic, post, category, settings, migration, and
  generated deploy path-affecting events.
- Remove or mark stale docs/tests that still instruct agents to preserve the old
  resolver as forward behavior.

Exit gate: operator verification report and automated tests agree on canonical
tree behavior.

## Agent Guardrails

- Do not implement fallback redirects for retired dash, flattened, generated
  slug, or ID wiki paths.
- Do not migrate with direct MongoDB or Redis writes.
- Do not make generated JSON output the human-authored config source.
- Do not preserve namespace-main-page selectors behind hidden compatibility.
- Do not assume page facet visibility implies namespace facet visibility.
- Do not start with route UI work before the path/migration/tree fixtures exist.

## Verification Families

Each implementation work package must name and run relevant verification from:

- plugin resolver/tree/path tests
- plugin route/render/permission tests
- plugin authoring/lifecycle tests
- plugin search/link/navigation tests
- plugin migration/cache-hook tests
- toolkit topdata native/deploy/path tests
- module topdata YAML validation and generated output checks

Manual live verification is required before production Apply because NodeBB API
hook order, deployed category permissions, stored generated markers, and cache
state cannot be proven by local fixtures alone.

## Downstream Archive Consumer

Wiki ZIP import/export is not a phase of this cutover. It starts after this
plan provides canonical tree paths, permission-aware listing/resolution,
blocking diagnostics, and tree invalidation entrypoints.

When working on that later subsystem, switch to:

- [WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md)
- [WIKI_IMPORT_EXPORT_ARCHIVE_IMPLEMENTATION_ENTRYPOINT_PLAN.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/WIKI_IMPORT_EXPORT_ARCHIVE_IMPLEMENTATION_ENTRYPOINT_PLAN.md)

Do not add archive-specific public path fallback or portable identity behavior
to this canonical cutover to make archive work start earlier.
