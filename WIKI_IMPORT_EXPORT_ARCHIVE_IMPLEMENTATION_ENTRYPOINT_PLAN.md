# Wiki Import Export Archive Implementation Entrypoint Plan

## Purpose

This is the entrypoint for AI agents implementing the planned Westgate wiki
archive subsystem. Start here for archive work rather than from an ACP button,
ZIP library, or one item in the Superpowers plan.

Read in order:

1. [CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md)
2. [HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md)
3. [CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md)
4. [WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md)
5. [docs/superpowers/plans/2026-05-22-wiki-import-export-archive-plan.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/docs/superpowers/plans/2026-05-22-wiki-import-export-archive-plan.md)

## Dependency Gate

Archive export/import is post-cutover work.

Before implementing a runnable export or import path, verify that canonical
wiki tree implementation provides:

- canonical namespace paths from category name hierarchy
- canonical page paths from title hierarchy
- path/tree collision and blocking diagnostics
- permission-aware canonical tree listing/resolution
- tree/cache invalidation entrypoints after content and placement changes

If those surfaces are not present, finish or extend the canonical tree plan
first. Do not make archive services depend on pre-cutover category/topic slug
leaves, legacy numeric wiki routes, or generated public slug metadata as an
interim implementation.

## Scope Routing

Primary owner: `nodebb-plugin-westgate-wiki`.

| Area | Owns |
|---|---|
| plugin | archive schema/services, ACP/API jobs, canonical export collection, preview/apply merge, article metadata, uploads, jobs, reports, tests, docs |
| NodeBB runtime | topic/category/post/upload APIs, permission checks, admin authentication and process storage integration |
| toolkit/topdata | generated HTML marker and deploy semantics that archive preserves as stored content, not archive path authority |
| module topdata YAML | generated wiki source declarations, not archive format or merge policy |

Cross-scope implementation should remain small. Archive code belongs in the
plugin unless a bug in an owning dependency is found and documented.

## Current Audit Anchors

Inspect these plugin surfaces before implementation:

- `library.js`: API route registration, admin route registration, hook and
  exported service boundaries.
- `routes/wiki.js`: wiki route/render dependencies and current canonical path
  consumers.
- `lib/controllers/admin.js`, `templates/admin/plugins/westgate-wiki.tpl`,
  `public/admin.js`: ACP settings patterns and operator diagnostics surfaces.
- `lib/config.js`: namespace roots, descendant inclusion, homepage setting, and
  cache invalidation shape.
- `lib/topic-service.js`, `lib/wiki-service.js`, `lib/wiki-directory-service.js`:
  first-post/article/namespace collection and listing shape.
- `lib/wiki-page-actions.js`, `lib/wiki-page-validation.js`,
  `lib/controllers/compose.js`: create/edit/move validation and save
  boundaries.
- `lib/wiki-article-css.js` and `lib/wiki-discussion-settings.js`: page
  metadata that must round trip.
- `lib/wiki-html-sanitizer.js`, shared sanitizer configuration, editor storage
  tests, and `docs/topdata-bot-content-contract.md`: stored HTML constraints.
- upload integration paths used by Tiptap compose and NodeBB post upload
  association synchronization.
- `lib/wiki-paths.js` and canonical tree/index services delivered by the path
  cutover: canonical placement, diagnostics, and invalidation.
- search, directory, cache, and lifecycle hooks in `plugin.json`,
  `lib/cache-service.js`, search services, and directory services after import
  apply.
- `tests/`: existing service, route, sanitizer, page metadata, directory,
  search, and API test styles.

Audit local NodeBB APIs before choosing integration points for:

- topic and post create/update
- category creation under existing namespace parents
- upload storage and local upload URL recognition
- post upload association updates after HTML rewrite
- administrator-only API middleware and artifact cleanup scheduling

## Target File Shape

Follow local file boundaries. Prefer focused services over embedding archive
logic in route controllers.

Expected responsibilities:

- archive schema/constants/validator: format version, manifest validation,
  compatibility policy, structured errors
- deterministic manifest writer and checksum service
- ZIP reader/writer with path, size, count, hash, and cleanup boundaries
- export collector for canonical namespaces/pages/settings
- asset collector and import asset rewrite/sync service
- import planner producing deterministic preview operations and conflicts
- apply service with item journal, idempotent rerun decisions, and cache
  invalidation calls
- job service for progress, reports, private artifacts, retention, and cleanup
- ACP/API controllers and templates/scripts as thin workflow surfaces
- tests split by schema/ZIP, export, preview planner, apply, API/admin, assets,
  and cache integration risk

Do not introduce one archive god module or duplicate canonical path and HTML
sanitization logic inside controllers.

## Phase Plan

### Phase 0: Recheck prerequisites and characterize boundaries

Goal: prove archive work starts from canonical tree and current storage
contracts, not the retired resolver.

- Confirm canonical diagnostics block unsafe tree states.
- Characterize first-post HTML, article CSS, discussion settings, topdata
  markers, homepage settings, namespace roots, local uploads, and cache hooks.
- Select explicit configuration points for archive limits, job retention, and
  artifact cleanup.
- Document any NodeBB API/storage constraints before choosing a ZIP or job
  implementation.

Exit gate: every archive payload field has an owning service and every excluded
field has an explicit reason.

### Phase 1: Schema, identity, validation, and fixtures

Goal: define a deterministic portable format before jobs and UI.

- Add format fixtures for `westgate-wiki-archive/v1`.
- Add schema/version/checksum/path traversal/limit tests first.
- Add portable archive page ID storage/matching tests.
- Define stable manifest ordering, subordinate filenames, and report ordering.
- Validate canonical contract marker compatibility and settings snapshot shape.

Exit gate: invalid archives fail before preview and deterministic fixture
serialization is asserted.

### Phase 2: Export collector and private artifacts

Goal: export canonical wiki state without leaking transient NodeBB state.

- Collect namespaces/pages through canonical tree services.
- Export first-post article HTML and page metadata only.
- Collect settings snapshot with homepage by portable page ID.
- Parse article HTML for local upload assets; bundle hash-addressed validated
  assets and report remote/missing references.
- Create export jobs, status, reports, cleanup, and completed ZIP download
  artifacts under private storage.

Exit gate: repeated export of a stable fixture yields deterministic manifest and
checksums, and archive artifacts are not public wiki uploads.

### Phase 3: Import validation and deterministic preview

Goal: convert an uploaded archive into an inspectable merge plan.

- Validate ZIP structure, schema, checksums, HTML/CSS constraints, asset limits,
  and canonical compatibility.
- Plan namespace matches and parent-first creates.
- Match pages by portable ID first and canonical path fallback second.
- Surface create/update/move/adoption/asset/settings operations.
- Block ID/path disagreement, namespace ambiguity, canonical collision, unsafe
  settings mapping, and required asset failures.

Exit gate: preview is deterministic and shows every operation apply could run.

### Phase 4: Journaled apply and recovery

Goal: apply an approved merge without pretending NodeBB offers one broad
transaction.

- Import/reuse validated assets and rewrite HTML to destination URLs.
- Create missing categories/pages through supported NodeBB/plugin boundaries.
- Update matched title, category, first-post HTML, article CSS, discussion
  setting, and archive ID through validated services.
- Synchronize post upload associations after final HTML save.
- Invalidate canonical tree, content, cache, search/listing visibility, and
  dependent state through owning services.
- Record item results, stop on hard failure, and prove rerun idempotency.

Exit gate: a partial failure leaves a useful report and rerun does not duplicate
portable-ID pages or hash-addressed asset work.

### Phase 5: Administrator API and ACP workflow

Goal: expose the proven services through thin admin-only workflow surfaces.

- Register administrator-only API routes for export job start/status/download
  and import upload/preview/apply.
- Add ACP archive panels for progress, reports, warnings, blockers, ZIP
  download/upload, preview review, settings opt-in, and apply status.
- Keep compose/editor flows free of archive actions.
- Add authorization tests and failure-state UI coverage.

Exit gate: non-admin access fails and ACP workflow cannot apply without a valid
approved preview.

### Phase 6: Compatibility docs and verification

Goal: finish the feature with operator guidance and evidence.

- Update README and admin help text from planned to shipped wording only when
  runtime exists.
- Document archive schema compatibility, portability caveats, recovery, and
  settings/permission behavior.
- Run focused tests after each phase and the full plugin suite before merge.
- Manually export from one NodeBB instance and preview/apply into another with
  partial overlap, nested namespaces, uploads, topdata pages, article CSS,
  disabled discussions, and homepage mapping.

Exit gate: automated reports and live two-instance verification agree with the
contract.

## API Direction

Use focused administrator-only routes under the existing plugin API namespace.
The plan currently expects:

```text
POST /westgate-wiki/archive/export-jobs
GET  /westgate-wiki/archive/jobs/:jobId
GET  /westgate-wiki/archive/export-jobs/:jobId/download
POST /westgate-wiki/archive/import-jobs
PUT  /westgate-wiki/archive/import-jobs/:jobId/apply
```

Route controllers must remain thin. Service methods own validation,
deterministic planning, apply journaling, and reports.

## Test Families

Every implementation work package must name and run relevant coverage from:

- schema/manifest/checksum/ZIP validation tests
- export collector and deterministic artifact tests
- portable ID and preview planner conflict tests
- apply idempotency, recovery, cache invalidation, and page metadata tests
- local/remote/missing asset rewrite and post-upload association tests
- admin API authorization and ACP workflow tests
- canonical path/tree diagnostics and topdata marker boundary tests
- full plugin test suite before completion

## Guardrails

- Do not start with ACP UI before schema/preview/apply service tests exist.
- Do not make source NodeBB IDs portable archive IDs.
- Do not infer archive placement from old slug metadata.
- Do not parse HTML asset references with uncontrolled string replacement.
- Do not import permission tables or delete destination content in V1.
- Do not hide archive limits, retention, or compatibility policy in controller
  literals.
- Do not treat import reports as optional logging; they are recovery state.
