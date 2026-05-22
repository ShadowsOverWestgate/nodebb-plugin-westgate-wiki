# Wiki Import Export Archive Documentation Design

## Scope

This design routes the planned wiki archive subsystem through the repository
documentation before implementation begins. It covers both agent-facing
implementation authority and administrator-facing workflow guidance for the
post-cutover import/export archive feature described in
`docs/superpowers/plans/2026-05-22-wiki-import-export-archive-plan.md`.

The documentation audit must account for:

- the repository `AGENTS.md` and README entrypoints
- the canonical path/tree contract stack that archive work depends on
- the topdata bot content contract where generated identity and stored article
  HTML are already defined
- route/API, ACP/admin, first-post content, article CSS, discussion metadata,
  namespace/configuration, upload, cache/search/listing, and test surfaces that
  later archive implementation must inspect

## Design Choice

Archive work gets its own contract and implementation entrypoint.

The archive subsystem depends on canonical wiki path/tree cutover, but it owns
additional behavior that the canonical contracts should not absorb: ZIP schema
versioning, portable archive identity, private artifacts and jobs, asset
bundling, previewed merge semantics, idempotent apply recovery, administrator
workflow, and archive-specific compatibility policy.

Keep the detailed Superpowers archive plan as the implementation plan input.
Route agents to it from the new archive entrypoint instead of treating the plan
file as the only authority.

## Documentation Architecture

### Root archive contract

Create a root contract that freezes:

- feature timing after canonical tree cutover and diagnostics
- archive scope, exclusions, and administrator-only authority
- archive format and schema/version compatibility policy
- separation of canonical public path identity, topdata generated identity,
  archive portable identity, and destination NodeBB storage identity
- deterministic export behavior
- import validation, preview, conflict, merge, and rerun rules
- local asset portability and upload synchronization rules
- settings snapshot and explicit destination opt-in behavior
- required automated and manual verification families

### Root archive implementation entrypoint

Create a root implementation entrypoint for AI workers that:

- names the owning repository and any cross-scope dependencies
- requires the canonical path/tree contract stack and archive contract before
  archive work begins
- lists concrete plugin audit anchors across current route/API/admin/content
  surfaces
- decomposes implementation into prerequisite, schema, export, preview,
  apply, ACP/API, and verification phases
- states guardrails against public-path regressions, destructive restore
  semantics, public temporary artifacts, and direct storage writes

### Existing entrypoints

Update existing documents with routed summaries:

- `AGENTS.md` must make archive work discoverable to agents and classify it as
  post-cutover work.
- `README.md` must include planned administrator guidance without claiming the
  archive workflow is currently shipped.
- Canonical path/tree documents must point archive workers to canonical tree
  diagnostics and prevent archive identity from reviving retired slug routing.
- The topdata content contract must state that archive preservation of topdata
  markers does not turn generated ids or retired `wiki_slug` metadata into
  archive public-path authority.

## Administrator Guidance

The README guidance must explain the planned operator workflow in product
language:

1. create a private export job from ACP
2. download the completed ZIP and inspect export warnings
3. upload the ZIP on the destination wiki
4. review the deterministic preview of creates, updates, moves, assets,
   warnings, blockers, and optional settings changes
5. explicitly apply an approved merge
6. use the final journal/report to recover from partial apply failure

It must also state that V1 is a previewed merge, not a destructive restore;
discussion replies, permissions, caches, watches, notifications, and search
indexes are not archive payload; and destination NodeBB permissions remain
authoritative.

## Implementation Methodology

The documentation must direct future agents through this order:

1. finish canonical path/tree prerequisites and blocking diagnostics
2. define archive schema, identity, settings policy, limits, validation, and
   deterministic serialization
3. implement deterministic export collection and private artifact storage
4. implement import archive validation and deterministic preview planning
5. implement journaled, idempotent apply with asset rewrite/upload sync and
   cache invalidation
6. expose administrator-only API and ACP workflow
7. complete docs, compatibility notes, automated coverage, and two-instance
   manual verification

## Verification Design

The documentation must require coverage for:

- deterministic archive manifests, paths, checksums, and reports
- schema/version/checksum/ZIP traversal/limit failures
- administrator-only API and ACP workflow boundaries
- namespace hierarchy and first-post-only article round trips
- article CSS, discussion-disabled state, topdata marker state, and opt-in
  settings mapping
- portable page ID matching, canonical-path fallback adoption, conflict
  blocking, and idempotent reruns
- local upload bundling, destination URL rewriting, missing/remote asset
  warnings, and NodeBB upload association synchronization
- canonical tree diagnostics and collision blocker handling
- partial apply recovery reports and cache/search/listing visibility after
  apply

## Non-Goals

- Implementing archive runtime code in this documentation pass.
- Treating archive ZIPs as raw NodeBB backups.
- Adding destructive V1 restore behavior for destination pages or namespaces.
- Expanding canonical path/tree contracts into archive subsystem design docs.
- Reauthoring editor-focused plans that do not affect archive storage scope.

