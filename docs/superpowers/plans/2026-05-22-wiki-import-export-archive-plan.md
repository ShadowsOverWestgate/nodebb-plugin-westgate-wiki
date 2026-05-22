# Wiki Import Export Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Build a post-cutover administrator-only archive workflow that exports
portable Westgate wiki ZIPs and imports them through validated previewed merges.

**Architecture:** Archive services consume canonical wiki tree APIs after the
path cutover, serialize deterministic `westgate-wiki-archive/v1` artifacts, and
separate export, preview planning, apply journaling, asset handling, jobs, and
ACP/API workflow surfaces. Portable archive page IDs support cross-instance
matching without overriding canonical public paths or topdata generated
identity.

**Tech Stack:** NodeBB plugin CommonJS services/routes/templates/tests, NodeBB
topic/category/post/upload APIs, ACP/admin workflow code, ZIP plus JSON
manifest/checksum artifacts, sanitized article HTML, canonical wiki tree APIs.

---

## Required Contract Inputs

Read before implementation:

- `CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md`
- `HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md`
- `CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md`
- `WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md`
- `WIKI_IMPORT_EXPORT_ARCHIVE_IMPLEMENTATION_ENTRYPOINT_PLAN.md`

Do not implement runnable export/import work until canonical tree diagnostics,
canonical listing/resolution, and tree invalidation entrypoints exist.

## Summary

Build a post-cutover, administrator-only import/export subsystem for `nodebb-plugin-westgate-wiki` that exports the full wiki into a portable ZIP archive and imports it through a previewed merge workflow.

Planning inputs audited:

- Repository guidance and active contract stack:
  - `AGENTS.md`
  - `README.md`
  - canonical path/tree alignment contract
  - hard-line path standardization contract
  - canonical tree/index contract
  - canonical path/tree implementation entrypoint plan
  - topdata bot content contract
- Current plugin surfaces:
  - route/API registration in `library.js` and `routes/wiki.js`
  - wiki config/admin surfaces
  - page create/edit/move/delete validation
  - first-post HTML storage and sanitization
  - namespace/category services and directory enumeration
  - per-page article CSS and discussion settings
  - topdata marker and retired `wiki_slug` handling
  - cache/search/navigation dependencies
- Local NodeBB integration surfaces:
  - topic creation APIs/hooks
  - category creation APIs
  - upload controller/storage path behavior
  - post upload association sync behavior

The feature must target the canonical wiki tree architecture after the current path migration plan lands. It must not extend the current slug-leaf resolver or preserve retired ID-route/dash-slug behavior in archive identity.

## Key Interfaces

### Archive Format

Create archive format `westgate-wiki-archive/v1` as a ZIP containing:

- `manifest.json`
  - archive schema version
  - exporter plugin version
  - canonical path contract version
  - checksums
  - namespace records
  - page records
  - asset records
  - plugin settings snapshot
  - export report summary
- per-page sanitized HTML files
- bundled asset files addressed by content hash
- deterministic JSON ordering and stable file naming

### Portable Identity

Add one durable plugin-owned topic field for manual imported/exported page identity:

- `westgateWikiArchivePageId`

Rules:

- This ID is archive identity only.
- It must never become a public path override.
- Page matching order is:
  1. portable archive page ID
  2. unambiguous canonical path fallback
  3. conflict requiring preview resolution

Namespace archive records use portable namespace IDs within the archive and map them to destination categories during import.

### Admin API And ACP Surface

Add ACP archive workflows and focused API routes:

- start export job
- fetch job status/report
- download completed export ZIP
- upload archive and start import preview job
- fetch import preview/report
- apply approved import plan

Recommended API shape under the existing plugin API namespace:

- `POST /westgate-wiki/archive/export-jobs`
- `GET /westgate-wiki/archive/jobs/:jobId`
- `GET /westgate-wiki/archive/export-jobs/:jobId/download`
- `POST /westgate-wiki/archive/import-jobs`
- `PUT /westgate-wiki/archive/import-jobs/:jobId/apply`

All routes are administrator-only.

## Implementation Changes

### 1. Canonical Tree Prerequisite

Implement import/export only after the canonical tree/path cutover provides stable resolver and listing APIs.

Archive work must depend on:

- canonical namespace paths from category name hierarchy
- canonical page paths from title hierarchy
- canonical collision/migration diagnostics
- tree cache invalidation entrypoints

Export and import should refuse to proceed when canonical-tree migration diagnostics report blocking ambiguity.

### 2. Archive Services

Add focused services rather than embedding ZIP logic into controllers:

- archive schema validator and deterministic manifest writer
- ZIP reader/writer with size/path/checksum validation
- export collector over canonical namespace/page records
- asset collector for referenced local NodeBB uploads
- import planner that creates a deterministic preview plan
- import apply service with per-item journal and result report
- job service for export/import progress, result state, cleanup, and artifact retention

Archive jobs should use private temporary artifact storage, not public wiki upload URLs.

### 3. Export Behavior

Export all live wiki article pages and wiki namespaces available to the administrator from the canonical tree.

Export:

- namespace structure
- first-post article HTML only
- page title and canonical placement
- portable page ID
- article CSS
- discussion-disabled state
- topdata marker state as stored content/provenance
- plugin settings snapshot:
  - namespace roots
  - include-descendant behavior
  - homepage reference by portable page ID
  - namespace creator group names

Do not export:

- discussion replies
- edit locks
- watches
- notifications
- caches
- search indexes
- soft-deleted/scheduled pages
- NodeBB category privilege tables

### 4. Asset Behavior

Bundle referenced local NodeBB upload files from exported article HTML.

Asset handling rules:

- Bundle validated local upload files only.
- Track each asset by hash, size, type, source reference, and referencing pages.
- Preserve remote URLs as links and report them.
- Report missing or unsupported local references as warnings.
- During import, store assets through NodeBB-compatible upload/storage paths.
- Rewrite imported HTML to destination asset URLs before final page save.
- Synchronize NodeBB post upload associations after final imported HTML is stored.

### 5. Import Preview And Merge

Import uses three stages:

1. Validate archive:
   - schema/version
   - ZIP path traversal
   - archive size/count limits
   - checksums
   - asset hashes/types/sizes
   - HTML/CSS sanitization constraints
   - supported canonical contract version
2. Build preview:
   - namespace matches and creates
   - page creates
   - portable-ID matches and updates
   - canonical-path fallback adoptions
   - title/category moves
   - asset imports and rewrites
   - optional plugin settings changes
   - hard conflicts and warnings
3. Apply approved merge plan:
   - parent-first namespace creation
   - asset import
   - create missing pages as importing administrator
   - update matched page body/title/category/plugin metadata
   - persist portable page IDs
   - optionally apply mapped plugin settings
   - invalidate relevant caches
   - emit per-item report

V1 must not delete destination pages or namespaces.

### 6. Conflict And Failure Rules

Block apply when:

- archive structure is invalid
- canonical tree diagnostics are blocking
- page ID and canonical path point at different existing pages
- namespace placement is ambiguous
- imported page placement violates canonical collision rules
- settings references cannot be mapped safely
- asset validation fails for required imported content

Because NodeBB does not provide a cross-topic/category/file transaction, import apply must be idempotent and journaled:

- stable page IDs prevent duplicate updates
- asset hashes reduce duplicate import work
- item-level results show already-applied work
- unexpected hard failures stop the run and leave a rerunnable report

### 7. ACP Workflow

Add an ACP section for:

- export job creation and completed ZIP download
- export report/warnings
- import archive upload
- preview summary:
  - creates
  - updates
  - moves
  - asset operations
  - warnings
  - blockers
- explicit opt-in to apply imported plugin settings
- import apply job progress and final report

Do not mix archive actions into authoring compose flows.

### 8. Documentation

Update plugin docs with:

- archive scope and exclusions
- ZIP schema/version compatibility policy
- dependency on canonical path/tree migration
- administrator workflow
- merge/conflict semantics
- upload portability caveats
- category permission caveat
- rerun/recovery behavior after partial import failure

## Test Plan

Add automated coverage for:

- deterministic archive manifest ordering and checksum output
- schema/version/checksum failures
- ZIP traversal and archive limit rejection
- admin-only API access
- namespace export/import hierarchy mapping
- first-post-only article export
- article CSS and discussion-disabled metadata round trip
- plugin settings export and opt-in mapped application
- portable page ID create/update/idempotent rerun behavior
- canonical-path fallback adoption
- page ID/path mismatch conflict
- canonical-tree collision rejection
- bundled local asset export/import/rewrite
- remote and missing asset warnings
- NodeBB post upload sync after rewritten HTML save
- generated topdata marker preservation without `wiki_slug` public-path reuse
- job status, report retention, cleanup, retry, and failure stop behavior
- cache invalidation after import apply

Manual verification should cover:

- export from a wiki with nested namespaces, generated topdata pages, article CSS, disabled discussions, and local uploads
- import into a second NodeBB instance with partially overlapping content
- preview/apply review in ACP
- imported page rendering, uploads, wiki links, search/listing visibility, and homepage/config mapping

## Assumptions

- Feature implementation is scheduled after canonical wiki path/tree cutover.
- Archive goal is portability across Westgate wiki instances, not raw NodeBB backup fidelity.
- V1 archive format is ZIP plus JSON manifest and subordinate files.
- V1 imports are previewed merges, not destructive restores.
- Full plugin config is exported, but applying imported settings is opt-in.
- NodeBB category permissions are destination-owned and are not imported.
- Created pages are owned by the administrator who applies import.
- Discussion replies are out of scope.
- Local referenced uploads are bundled; remote links remain external references.
