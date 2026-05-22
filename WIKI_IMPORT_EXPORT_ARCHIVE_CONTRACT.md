# Wiki Import Export Archive Contract

## Purpose

This contract governs the planned post-cutover import/export archive subsystem
for `nodebb-plugin-westgate-wiki`.

The archive feature lets an administrator export portable wiki content from one
Westgate wiki instance and import it into another through an explicit previewed
merge. It is not a raw NodeBB backup system and it must not reopen retired wiki
public-path behavior while moving content between instances.

Use
[WIKI_IMPORT_EXPORT_ARCHIVE_IMPLEMENTATION_ENTRYPOINT_PLAN.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/WIKI_IMPORT_EXPORT_ARCHIVE_IMPLEMENTATION_ENTRYPOINT_PLAN.md)
to enter implementation.

## Reading Order

Archive implementation starts only after reading:

1. [CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md)
2. [HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md)
3. [CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md)
4. This contract.
5. [WIKI_IMPORT_EXPORT_ARCHIVE_IMPLEMENTATION_ENTRYPOINT_PLAN.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/WIKI_IMPORT_EXPORT_ARCHIVE_IMPLEMENTATION_ENTRYPOINT_PLAN.md)
6. [docs/superpowers/plans/2026-05-22-wiki-import-export-archive-plan.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/docs/superpowers/plans/2026-05-22-wiki-import-export-archive-plan.md)

The archive contract is downstream from canonical tree work. If canonical path
and tree diagnostics do not exist yet, archive implementation may prepare
isolated schema or service seams only when that work does not depend on the old
slug-leaf resolver. Do not ship archive export/import against the pre-cutover
resolver.

## Feature Boundary

### In scope

V1 archives:

- configured wiki namespace structure visible to an administrator through the
  canonical wiki tree
- live wiki pages backed by NodeBB topics in effective wiki namespaces
- first-post sanitized article HTML
- canonical page title and placement data needed to rebuild the tree
- plugin-owned portable archive page identity
- article CSS and discussion-disabled wiki metadata
- stored topdata marker/provenance state inside exported article content
- referenced validated local NodeBB upload assets from article HTML
- a settings snapshot that can be mapped and applied only by explicit import
  opt-in
- deterministic reports for export, import preview, and import apply

### Out of scope

V1 archives do not carry:

- discussion replies
- edit locks, watches, notifications, and search indexes
- caches or transient directory/search state
- soft-deleted or scheduled wiki pages
- NodeBB category privilege tables or raw database records
- destructive destination deletion plans for pages or namespaces
- a replacement for NodeBB site backups

## Identity Boundaries

Four identity layers stay separate:

| Layer | Owns | Must not own |
|---|---|---|
| canonical wiki path | public wiki URL and tree placement | archive portability or generated ownership |
| topdata generated identity | generated-page adoption and managed HTML ownership | public path override or archive matching override |
| archive portable identity | cross-instance page matching for archived manual/imported content | public route override |
| destination NodeBB identity | destination topic, post, category, asset, and permission records | archive format authority |

### Canonical public paths

Archive paths derive from the canonical title/category tree available after the
path cutover. Archive code must consume canonical tree APIs and diagnostics; it
must not rebuild public paths from topic slug leaves, category slug leaves,
retired numeric wiki routes, generated `wiki_slug` marker values, or
`westgateWikiPageSlug`.

### Topdata generated identity

Topdata page ids and managed-region comments may round trip as stored article
state. They do not become archive page identity and they do not select a public
destination path. Export/import must preserve the generated marker boundary
already defined by
[docs/topdata-bot-content-contract.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/docs/topdata-bot-content-contract.md).

### Portable archive identity

Add one plugin-owned durable topic field for archive matching:

```text
westgateWikiArchivePageId
```

Rules:

- the field identifies exported/imported wiki pages across instances
- the field is stable through rerun and update merges
- the field is not exposed as a public path selector
- new imports persist it on created pages and on approved adopted page matches
- import matching uses it before canonical path fallback

Page match order is:

1. existing destination page with the portable archive page ID
2. one unambiguous destination page at the imported canonical path
3. hard conflict needing preview resolution or source/destination remediation

If page ID and canonical path select different existing destination pages, apply
must stop.

Namespace records use archive-local portable namespace IDs for parent/child
relationships. Import maps those records to destination categories through the
approved preview plan; it must not assume source category IDs are portable.

## Archive Format

The first format is:

```text
westgate-wiki-archive/v1
```

It is a ZIP archive with a deterministic manifest and subordinate files:

- `manifest.json`
- per-page sanitized article HTML files
- bundled local asset files addressed by content hash
- any subordinate machine-readable report or checksum records required by the
  schema

`manifest.json` owns:

- archive schema id and version
- exporter plugin version
- supported canonical path contract version or equivalent compatibility marker
- stable checksum records
- namespace records
- page records
- asset records
- exported settings snapshot
- export report summary

Archive writing must be deterministic for the same logical source state:

- stable record sorting
- stable subordinate filenames
- stable JSON key ordering and serialization rules
- stable checksum calculation inputs
- stable report ordering where practical

Implementation must document and validate size, count, type, retention, and
cleanup policy before ZIP work runs. Any limits or retention values that vary
by deployment must be surfaced through documented configuration rather than
hidden in controllers. Human-authored repository configuration must not be
introduced as generated JSON.

## Export Rules

Export is administrator-only and must run as a private job with private
temporary artifacts.

Export must:

- refuse to run while canonical tree diagnostics report blocking ambiguity
- collect namespaces and pages through canonical tree/runtime services
- export only the first post as the article body
- preserve article CSS and discussion-disabled metadata
- assign or reuse portable archive page IDs through plugin-owned APIs
- record warnings for remote, missing, or unsupported assets
- produce a downloadable ZIP only after manifest/checksum/report completion

Export must not:

- publish temporary archive artifacts as wiki upload URLs
- include discussion replies as article data
- expose caches, locks, watches, notifications, or search state
- claim to preserve destination permissions

## Asset Rules

The archive bundles referenced local NodeBB uploads from exported article HTML.

Asset collection must:

- parse stored HTML through structured HTML handling rather than ad hoc string
  replacement
- bundle only validated local upload references
- store hash, size, type, source reference, and referencing page records
- preserve remote asset URLs as remote references and report them
- report missing or unsupported local references as warnings or blockers
  according to schema policy

Import asset application must:

- validate path, hash, size, type, and configured limits before use
- write assets through NodeBB-compatible upload/storage APIs or documented
  plugin-compatible storage boundaries
- rewrite imported HTML to destination asset URLs before final page save
- synchronize NodeBB post upload associations after final HTML persistence

## Import Workflow

Import is administrator-only and has three stages.

### Validate

Validation must complete before preview:

- schema/version compatibility
- ZIP traversal and unsafe path rejection
- archive size, file count, page count, and asset count limits
- checksum and asset hash verification
- asset type and size policy
- HTML and CSS sanitization constraints
- canonical path contract compatibility
- manifest reference completeness

### Preview

Preview produces a deterministic merge plan and report. It must show:

- namespace matches and creates
- page creates, portable-ID updates, canonical-path adoptions, moves, and
  metadata changes
- asset imports and URL rewrites
- optional mapped settings changes
- warnings and hard blockers

Preview must expose conflict causes. It must not silently choose between page
ID/path disagreement, ambiguous namespace placement, canonical tree collision,
unsafe settings mapping, or required asset validation failure.

### Apply

Apply runs only against an approved preview plan. It must:

- create namespaces parent-first
- import/reuse assets before final article HTML save
- create missing pages as the administrator applying the import
- update matched page body, title, category, article CSS, discussion metadata,
  and archive identity when approved
- optionally apply mapped plugin settings only after explicit operator opt-in
- invalidate relevant wiki tree, content, directory, search/index visibility,
  and upload-association dependent state through existing runtime boundaries
- emit an item-level journal and final report

V1 apply does not delete destination pages or namespaces.

## Conflict And Recovery Rules

Apply must stop on hard blockers including:

- invalid archive structure or unsupported schema/version
- blocking canonical tree diagnostics
- archive page ID and canonical path selecting different destination pages
- ambiguous namespace placement
- canonical/folded path collision under the destination tree
- settings mapping that cannot be resolved safely when settings apply is
  requested
- required asset validation or storage failure

NodeBB does not provide one transaction spanning categories, topics, posts, and
files. Apply must therefore be journaled and rerunnable:

- item-level results show completed, skipped, already-applied, warning, and
  failed operations
- stable page IDs prevent duplicate page creation on rerun
- asset hashes and result journals reduce duplicate asset work
- unexpected hard failure stops remaining apply work and preserves the report
- a rerun starts from a fresh validation/preview decision against current
  destination state unless implementation can prove the stored plan is still
  valid

## Settings Snapshot

Export may snapshot plugin settings relevant to wiki portability:

- namespace roots
- descendant namespace inclusion
- homepage reference by portable archive page ID
- namespace creator group names

Destination settings remain operator-owned. Import preview must show mapped
settings changes, unresolved references, and permission caveats. Import apply
must require explicit opt-in before writing settings.

## Administrator Surface

Archive controls live in ACP/admin archive workflow surfaces and focused
administrator-only API routes under the existing plugin API namespace.

The ACP flow must provide:

- export start, status, report, warning review, and completed ZIP download
- import upload and validation status
- preview summary for creates, updates, moves, asset operations, settings,
  warnings, and blockers
- explicit settings-apply opt-in
- apply progress, final journal/report, and failure recovery guidance

Do not mix archive actions into wiki authoring compose flows.

## Compatibility Policy

- Archive compatibility is schema-versioned and explicit.
- Readers must fail clearly on unsupported newer schemas.
- Readers may support older schema migrations only through tested migration
  paths that preserve deterministic preview behavior.
- Canonical path contract compatibility must be checked before applying public
  placement changes.
- Existing wiki pages without archive IDs remain importable through
  unambiguous canonical path fallback; once adopted, persist the portable ID.
- Destination NodeBB category permissions remain authoritative after import.

## Verification Requirements

Automated coverage must include:

- deterministic manifest, subordinate filename, checksum, and report ordering
- schema/version/checksum failures and ZIP traversal/limit rejection
- administrator-only API authorization
- namespace hierarchy mapping and first-post-only round trips
- article CSS and discussion-disabled metadata round trips
- exported settings snapshot and opt-in mapped settings apply
- portable ID create/update/rerun behavior
- canonical-path fallback adoption and ID/path mismatch conflicts
- canonical tree blocker and collision rejection
- local asset bundle/import/rewrite/upload-association sync behavior
- remote and missing asset warning behavior
- topdata marker preservation without retired public path reuse
- job progress, private artifact retention/cleanup, retry, and failure stop
  behavior
- cache/search/listing visibility after apply

Manual verification must include:

- export from a source wiki with nested namespaces, topdata generated pages,
  article CSS, disabled discussion, local uploads, remote asset links, and a
  homepage
- import preview and apply into a second NodeBB instance with partial content
  overlap
- destination rendering, uploads, wiki links, search/listing visibility,
  homepage mapping, and report-based rerun recovery

## Guardrails

- Do not implement archive work against retired slug-leaf public identity.
- Do not use source NodeBB topic/category/post IDs as portable archive IDs.
- Do not store archives in public wiki upload URLs.
- Do not mutate MongoDB or Redis directly for archive apply.
- Do not make V1 import a destructive restore.
- Do not import category permission tables.
- Do not duplicate HTML sanitization, canonical path, or upload logic when a
  focused plugin/NodeBB service owns that boundary.
