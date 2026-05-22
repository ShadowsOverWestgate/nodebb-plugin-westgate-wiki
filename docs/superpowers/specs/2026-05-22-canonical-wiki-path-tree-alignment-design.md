# Canonical Wiki Path and Tree Alignment Design

## Scope

This design aligns the Westgate wiki plugin, toolkit topdata pipeline, and
module topdata declarations around a strict canonical public wiki tree. It
documents the contract hierarchy and implementation sequencing needed before
agents make the path resolver, namespace index, migration, and generated-content
changes.

## Design Choice

Keep three contract layers instead of one large contract:

1. The umbrella alignment contract owns cross-repository authority, rollout
   order, generated identity boundaries, and stale-doc interpretation.
2. The hard-line path standardization contract owns canonical path derivation,
   tolerant new-standard lookup, retired URL behavior, and operator migration.
3. The canonical tree/index contract owns canonical node facets, resolver and
   listing behavior, namespace index pages, and permission-aware rendering.

Add a root entrypoint plan for implementation agents and a focused Superpowers
plan for phased decomposition. Existing editor feature specs/plans remain valid
for editor behavior and are not rewritten unless they claim obsolete public path
behavior.

## Architecture

The plugin remains runtime authority. `lib/wiki-paths.js` becomes a path facade
over a canonical tree/index service rather than a category-slug/topic-slug
resolver. NodeBB categories keep namespace storage and category permissions;
topics keep article storage and topic permissions. Canonical nodes can expose
page, namespace, both, or branch-only ancestry derived from title hierarchy.

Toolkit generation remains generated-content authority, but generated page ids,
managed-region markers, and deploy manifests become identity/adoption surfaces
only. They no longer override public paths through old `wiki_slug` metadata or
old lowercase dash slug YAML declarations.

The module remains the YAML authoring owner for generated content exceptions.
Any exception schema that survives the cutover must be explicit, validated, and
title-path-compatible rather than a silent old slug compatibility channel.

## Critical Boundaries

- `/wiki` homepage state is distinct from structural namespace index pages.
- Namespace index pages derive from page+namespace canonical overlap, not stored
  namespace-main-page selector state.
- Route-root exposure must be explicit rather than inferred from a category slug
  named `wiki`.
- Composite nodes retain separate topic and category permission checks.
- Migration reporting comes before resolver activation so live data and
  generated pages do not enter a mixed public path regime.

## Documentation Treatment

The existing README and large `AGENTS.md` describe current clean-path runtime in
many places. Add top-level supersession notes and use the contract stack as the
forward architecture instead of rewriting historical execution detail line by
line. Update the topdata bot content contract because its old generated slug
examples directly conflict with the new cutover.

## Testing And Verification

Implementation must establish:

- canonical plugin/toolkit normalization parity
- migration scan/prepare/apply/verify safety
- canonical resolver/tree ordering and collision coverage
- route/render/index-page permission behavior
- authoring/search/link/navigation emitted-path coverage
- toolkit deploy/adoption and module YAML validation under the new generated
  identity/public path split

Production Apply remains a live operator step after backups and live reports.
