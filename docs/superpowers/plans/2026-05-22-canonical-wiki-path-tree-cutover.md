# Canonical Wiki Path Tree Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Westgate wiki slug-leaf public path model with one strict canonical title/category path tree shared by plugin runtime and generated topdata pages.

**Architecture:** The plugin owns runtime canonical path and tree resolution behind `lib/wiki-paths.js`, with a focused canonical tree index service when the facade needs separation. Toolkit and module changes preserve generated page identity for deploy/adoption while switching generated public links and validated YAML declarations onto the same canonical path rules. ACP migration reporting is built before activation so production data never enters a mixed old/new resolver regime.

**Tech Stack:** NodeBB plugin CommonJS services/routes/templates/tests, NodeBB ACP APIs and settings/database abstractions, Go toolkit topdata native/deploy code and tests, YAML module wiki declarations, generated HTML markers, Node test runner scripts, Go tests.

---

## Contract Inputs

Read before every task:

- `CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md`
- `HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md`
- `CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md`
- `CANONICAL_WIKI_PATH_TREE_IMPLEMENTATION_ENTRYPOINT_PLAN.md`

## File Structure

Target file responsibilities:

- Modify `lib/wiki-slug.js` or replace its public API with canonical segment
  normalization owned by plugin path code.
- Modify `lib/wiki-paths.js` as the public path/resolver facade.
- Create `lib/wiki-tree-index.js` for canonical node assembly, folded lookup,
  child listing, and facet collision reporting once path code no longer fits in
  the facade.
- Create focused migration service/controller/template files under existing
  `lib/` and `templates/admin/` patterns after inspecting the current admin
  template/controller shape.
- Modify path consumers already listed in the root entrypoint rather than
  adding parallel per-surface path builders.
- Modify toolkit `internal/topdata/wiki_slug.go`,
  `internal/topdata/wiki_page_paths.go`, `internal/topdata/wiki_native.go`,
  `internal/topdata/wiki_deploy.go`, and their existing tests.
- Modify module `topdata/wiki/wiki.yaml` and
  `topdata/wiki/README.md` only for human-authored generated wiki declarations.

### Task 1: Canonical Segment Parity Fixtures

**Files:**
- Create: `tests/fixtures/canonical-wiki-path-segments.json`
- Modify: `tests/wiki-paths.test.js`
- Modify: `/home/vicky/Projects/nwnee-shadowsoverwestgate/toolkit/internal/topdata/wiki_native_test.go`
- Modify: `/home/vicky/Projects/nwnee-shadowsoverwestgate/toolkit/internal/topdata/wiki_slug.go`
- Modify: `lib/wiki-slug.js`

- [ ] **Step 1: Write plugin fixture-driven failing tests**

Add a fixture table like:

```json
[
  { "source": "Inspire Competence", "canonical": "Inspire_Competence", "folded": "inspire competence" },
  { "source": "Grandmaster's Battle Momentum", "canonical": "Grandmasters_Battle_Momentum", "folded": "grandmasters battle momentum" },
  { "source": "Æther Œuvre Øresund Straße Þorn Łódź Đelta", "canonical": "Aether_Oeuvre_Oresund_Strasse_Thorn_Lodz_Delta", "folded": "aether oeuvre oresund strasse thorn lodz delta" }
]
```

Change `tests/wiki-paths.test.js` to assert a canonical plugin API over this
fixture before keeping old dash-slug assertions only as characterization to
remove:

```js
const canonicalSegments = require("./fixtures/canonical-wiki-path-segments.json");
canonicalSegments.forEach((row) => {
  assert.strictEqual(wikiPaths.normalizeCanonicalSegment(row.source).canonical, row.canonical);
  assert.strictEqual(wikiPaths.normalizeCanonicalSegment(row.source).foldedKey, row.folded);
});
```

- [ ] **Step 2: Run the plugin path test and confirm it fails**

Run:

```bash
node --test tests/wiki-paths.test.js
```

Expected: failure because `normalizeCanonicalSegment` does not exist or still
returns dash/lowercase slug semantics.

- [ ] **Step 3: Add matching toolkit failing assertions**

Add Go cases from the same examples in the closest existing wiki slug/native
test harness:

```go
tests := []struct {
	name string
	in   string
	want string
}{
	{name: "spaces", in: "Inspire Competence", want: "Inspire_Competence"},
	{name: "joiner punctuation", in: "Grandmaster's Battle Momentum", want: "Grandmasters_Battle_Momentum"},
	{name: "latin transliteration", in: "Æther Œuvre Øresund Straße Þorn Łódź Đelta", want: "Aether_Oeuvre_Oresund_Strasse_Thorn_Lodz_Delta"},
}
```

- [ ] **Step 4: Run toolkit wiki tests and confirm failure**

Run:

```bash
go test ./internal/topdata -run 'Wiki.*(Slug|Native)' -count=1
```

Expected: failure because toolkit still lowercases and dash-separates public
wiki slugs.

- [ ] **Step 5: Implement the minimal canonical segment APIs**

Implement case-preserved `_` canonical output and folded matching while keeping
explicit current-runtime callers named separately until consumers migrate. The
plugin API returned shape must be:

```js
{
  canonical: "Grandmasters_Battle_Momentum",
  foldedKey: "grandmasters battle momentum",
  error: ""
}
```

The toolkit implementation must expose the same public-path rule through a
focused function so deploy/native call sites can be migrated in later tasks.

- [ ] **Step 6: Run parity-focused tests**

Run:

```bash
node --test tests/wiki-paths.test.js
go test ./internal/topdata -run 'Wiki.*(Slug|Native)' -count=1
```

Expected: fixture assertions pass; old assertions that intentionally expose
dash output remain visible for subsequent task edits.

### Task 2: Generated Identity And YAML Migration Shape

**Files:**
- Modify: `/home/vicky/Projects/nwnee-shadowsoverwestgate/toolkit/internal/topdata/wiki_page_paths.go`
- Modify: `/home/vicky/Projects/nwnee-shadowsoverwestgate/toolkit/internal/topdata/wiki_native.go`
- Modify: `/home/vicky/Projects/nwnee-shadowsoverwestgate/toolkit/internal/topdata/wiki_deploy.go`
- Modify tests: `/home/vicky/Projects/nwnee-shadowsoverwestgate/toolkit/internal/topdata/wiki_native_test.go`
- Modify tests: `/home/vicky/Projects/nwnee-shadowsoverwestgate/toolkit/internal/topdata/wiki_deploy_test.go`
- Modify: `/home/vicky/Projects/nwnee-shadowsoverwestgate/module/topdata/wiki/wiki.yaml`
- Modify: `/home/vicky/Projects/nwnee-shadowsoverwestgate/module/topdata/wiki/README.md`
- Modify: `lib/wiki-page-validation.js`

- [ ] **Step 1: Write failing generated marker and YAML tests**

Replace old expectations like:

```go
strings.Contains(text, `wiki_slug=athletics`)
```

with identity-only marker expectations:

```go
strings.Contains(text, `<!-- sow-topdata-wiki:page=skills:athletics -->`)
```

Add a parser/validation case proving old YAML slug declarations are rejected or
migrated by the chosen new schema:

```go
if err == nil || !strings.Contains(err.Error(), "page_paths.slug_overrides is retired") {
	t.Fatalf("expected retired slug override error, got %v", err)
}
```

- [ ] **Step 2: Run focused toolkit tests and confirm old public slug coupling**

Run:

```bash
go test ./internal/topdata -run 'Wiki(Native|Deploy)' -count=1
```

Expected: tests fail where markers, public targets, deploy adoption, or YAML
declarations still depend on old slug overrides.

- [ ] **Step 3: Write failing plugin marker validation test**

Add a plugin test around the marker validator or the nearest existing page
validation test that expects old `wiki_slug` input to be reported for migration
instead of stored as `westgateWikiPageSlug` runtime routing state:

```js
assert.strictEqual(
  wikiPageValidation.getTopdataPublicPathMigrationState(
    "<!-- sow-topdata-wiki:page=feat:power_attack wiki_slug=power-attack -->"
  ).hasRetiredWikiSlug,
  true
);
```

- [ ] **Step 4: Implement identity/public path split**

Update toolkit emission, parser validation, deploy matching, and module YAML
declarations so generated identity remains stable while public links use
canonical title/category paths. Update plugin validation so new runtime
behavior no longer syncs old public slug fields as path authority.

- [ ] **Step 5: Run focused plugin and toolkit tests**

Run:

```bash
node --test tests/wiki-paths.test.js
go test ./internal/topdata -run 'Wiki(Native|Deploy)' -count=1
```

Expected: new identity/public path tests pass and old slug metadata remains
detectable only as migration input.

### Task 3: ACP Scan And Prepare Reports

**Files:**
- Modify: `lib/controllers/admin.js`
- Modify: existing admin template under `templates/admin/`
- Create: `lib/wiki-path-migration.js`
- Create tests: `tests/wiki-path-migration.test.js`
- Modify: `library.js`

- [ ] **Step 1: Write migration service tests**

Create a read-only report fixture:

```js
const report = await migration.scan({
  categories: [wikiRoot, lore, deities],
  topics: [gondTopic],
  namespaceMainPages: { "12": 44 }
});

assert.deepStrictEqual(report.summary, {
  blockingErrors: 0,
  legacyNamespaceMainPages: 1,
  retiredGeneratedSlugRows: 1
});
assert.strictEqual(report.pages[0].canonicalPath, "Lore/Deities/Gond");
```

Add a failure case:

```js
assert.strictEqual(report.collisions.foldedPages[0].foldedKey, "lore/deities/gond");
```

- [ ] **Step 2: Run migration tests and confirm failure**

Run:

```bash
node --test tests/wiki-path-migration.test.js
```

Expected: module/service does not exist.

- [ ] **Step 3: Implement read-only Scan and Prepare**

Use NodeBB category/topic APIs and existing settings/cache patterns. The service
must return structured page, namespace, route-root, folded collision, old
namespace-main-page, and retired generated public slug sections without writing
settings/topic fields.

- [ ] **Step 4: Wire ACP report endpoints/UI**

Follow existing admin controller/template conventions. Expose Scan and Prepare
actions only to administrators and render blocking status clearly before any
Apply control is added.

- [ ] **Step 5: Verify read-only reporting**

Run:

```bash
node --test tests/wiki-path-migration.test.js
```

Expected: Scan/Prepare report tests pass and no Apply behavior exists yet.

### Task 4: Canonical Tree Index And Resolver Facade

**Files:**
- Create: `lib/wiki-tree-index.js`
- Modify: `lib/wiki-paths.js`
- Modify tests: `tests/wiki-paths.test.js`
- Create tests: `tests/wiki-tree-index.test.js`
- Modify: `lib/config.js`

- [ ] **Step 1: Write canonical node fixtures**

Add tests for one composite:

```js
const result = await tree.resolveWikiNode("Lore/Deities/Gond", { uid: 1, includeChildren: true });
assert.strictEqual(result.status, "ok");
assert.strictEqual(result.node.isComposite, true);
assert.strictEqual(result.node.page.tid, 77);
assert.strictEqual(result.node.namespace.cid, 42);
assert.deepStrictEqual(result.children.directNodes.map((row) => row.canonicalPath), [
  "Lore/Deities/Gond/Clerics"
]);
```

Add branch-only, folded collision, deterministic child order, and explicit
route-root state cases.

- [ ] **Step 2: Run tree tests and confirm failure**

Run:

```bash
node --test tests/wiki-tree-index.test.js
```

Expected: canonical tree module does not exist.

- [ ] **Step 3: Implement tree index and facade APIs**

Implement facade calls named in the tree contract:

```js
resolveWikiNode(requestPath, options)
listWikiNodeChildren(nodeOrPath, options)
getCanonicalPagePath(topic)
getCanonicalNamespacePath(category)
validateCanonicalPagePlacement(input)
validateCanonicalNamespacePlacement(input)
invalidateWikiTreeIndex(reason)
```

Keep NodeBB hydration and permission filtering explicit so tree data does not
leak hidden facets.

- [ ] **Step 4: Invalidate settings/path caches through one boundary**

Replace namespace-index-only invalidation for canonical callers with the tree
invalidator and keep any old invalidator only while current runtime consumers
remain.

- [ ] **Step 5: Run resolver/tree tests**

Run:

```bash
node --test tests/wiki-tree-index.test.js tests/wiki-paths.test.js
```

Expected: canonical node fixtures pass without enabling retired URL fallback.

### Task 5: Canonical Route And Namespace Index Rendering

**Files:**
- Modify: `routes/wiki.js`
- Modify: `lib/topic-service.js`
- Modify: `lib/wiki-service.js`
- Modify: `lib/wiki-breadcrumb-trail.js`
- Modify: relevant `templates/wiki*.tpl`
- Modify tests: `tests/wiki-route-collision.test.js`
- Create tests: `tests/wiki-canonical-node-route.test.js`

- [ ] **Step 1: Write route rendering tests**

Add a composite route test:

```js
assert.equal(renderCalls[0].template, "wiki");
assert.equal(renderCalls[0].data.article.topic.tid, 77);
assert.equal(renderCalls[0].data.nodeListing.rows[0].wikiPath, "/wiki/Lore/Deities/Gond/Clerics");
```

Add visibility-split tests for readable article/hidden namespace and visible
namespace/unreadable article.

- [ ] **Step 2: Run route tests and confirm failure**

Run:

```bash
node --test tests/wiki-canonical-node-route.test.js
```

Expected: route still resolves namespace first and article last.

- [ ] **Step 3: Render from one canonical node result**

Update `/wiki/:path(*)` route handling to resolve one canonical node and render
article-primary composite, namespace-only, page-only, or branch-only data.
Extract a shared listing partial if both namespace and article views need the
same row model.

- [ ] **Step 4: Retire active namespace-main-page UI hooks**

Remove route/template/compose/service reliance on stored namespace main-page
selection from active render paths while keeping migration reporting reads.

- [ ] **Step 5: Run route/render tests**

Run:

```bash
node --test tests/wiki-canonical-node-route.test.js tests/wiki-route-collision.test.js tests/wiki-breadcrumb-trail.test.js
```

Expected: new canonical node render tests pass; old collision test is rewritten
to assert folded canonical ambiguity behavior or removed when it only protects
retired slug routing.

### Task 6: Authoring, Search, Links, And Lifecycle Consumers

**Files:**
- Modify: `lib/wiki-page-validation.js`
- Modify: `lib/wiki-page-actions.js`
- Modify: `lib/wiki-links.js`
- Modify: `lib/wiki-link-autocomplete.js`
- Modify: `lib/wiki-search-service.js`
- Modify: `lib/wiki-directory-service.js`
- Modify: `lib/wiki-mention-notifications.js`
- Modify: `lib/wiki-discussion-placeholder.js`
- Modify: `lib/serializer.js`
- Modify corresponding tests under `tests/`

- [ ] **Step 1: Write emitted-path regression tests**

Add cases to current consumer tests asserting canonical output:

```js
assert.strictEqual(result.wikiPath, "/wiki/Feats/Inspire_Competence");
assert.match(renderedLink, /href="\/wiki\/Lore\/Deities\/Gond\/Clerics"/);
assert.strictEqual(searchRows[0].facets.page, true);
assert.strictEqual(searchRows[0].facets.namespace, true);
```

- [ ] **Step 2: Run focused consumer tests and confirm failure**

Run:

```bash
node --test tests/wiki-link-autocomplete.test.js tests/wiki-search-service.test.js tests/wiki-page-actions.test.js
```

Expected: consumers still emit old slug/path output or lack composite facets.

- [ ] **Step 3: Move consumers to canonical path/tree APIs**

Delete local path recomposition from consumer services. Use canonical placement
validation before create/edit/move saves and canonical tree row models for
search/autocomplete/directory/breadcrumb consumers.

- [ ] **Step 4: Wire lifecycle invalidation**

Update `plugin.json`, `library.js`, and cache services so path-affecting topic,
post, topic move, category create/update/delete, settings, migration, and
generated deploy hook paths invalidate canonical tree-dependent caches.

- [ ] **Step 5: Run consumer and cache tests**

Run:

```bash
node --test tests/wiki-link-autocomplete.test.js tests/wiki-search-service.test.js tests/wiki-page-actions.test.js tests/wiki-paths-cache.test.js tests/wiki-cache-metrics-service.test.js
```

Expected: emitted paths are canonical and cache metrics/invalidation behavior is
covered for new tree state.

### Task 7: Apply, Verify, Documentation, And Cross-Repo Validation

**Files:**
- Modify: `lib/wiki-path-migration.js`
- Modify: `lib/controllers/admin.js`
- Modify: admin migration templates/tests
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/topdata-bot-content-contract.md`
- Modify: `/home/vicky/Projects/nwnee-shadowsoverwestgate/module/topdata/wiki/README.md`

- [ ] **Step 1: Write Apply refusal and Verify tests**

Add refusal behavior:

```js
await assert.rejects(
  () => migration.apply({ scan: blockingScan }),
  /canonical wiki migration has blocking collisions/
);
```

Add Verify state:

```js
assert.strictEqual(verify.treeIndex.status, "ok");
assert.strictEqual(verify.activeNamespaceMainPageOverrides, 0);
assert.strictEqual(verify.activeGeneratedPublicSlugRouting, 0);
```

- [ ] **Step 2: Run migration tests and confirm failure**

Run:

```bash
node --test tests/wiki-path-migration.test.js
```

Expected: Apply/Verify behavior is missing or incomplete.

- [ ] **Step 3: Implement guarded Apply and Verify**

Use NodeBB APIs to mark migration version, clear retired plugin-owned generated
public slug fields where required, invalidate canonical caches, and refuse
activation on blockers. Do not rewrite human titles/content or mutate MongoDB or
Redis directly.

- [ ] **Step 4: Update final docs**

Replace remaining forward-looking slug-leaf instructions with canonical
title/category tree language. Keep a concise current-runtime/migration note only
where operators still need to recognize pre-Apply behavior.

- [ ] **Step 5: Run repository validation**

Run plugin:

```bash
npm test
```

Run toolkit:

```bash
go test ./internal/topdata -count=1
```

Run module topdata validation with the coordinated toolkit binary when toolkit
changes are local:

```bash
SOW_TOOLS_DEV_BINARY=../toolkit/tools/sow-toolkit ./validate-topdata.sh
```

Expected: all relevant automated tests pass. Manual live migration Scan,
Prepare, backup, Apply, and Verify remain required before production cutover.
