# AGENTS.md

## Current Agent Guide

This file is the operating guide and roadmap ledger for the Westgate wiki
plugin. It contains current rules first and preserved historical planning later.
Historical phases explain how the repo arrived here; they are not permission to
rebuild completed scaffolding or extend superseded path behavior.

### Required Contract Stack

The repository uses a coordinated public path and canonical tree runtime.
Before changing wiki routing, path generation, generated topdata integration,
namespace index behavior, search/listing path emission, or path migration
tooling, read these root documents in order:

1. [CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md)
2. [HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md)
3. [CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_TREE_INDEX_AND_NAMESPACE_INDEX_PAGES_CONTRACT.md)
4. [CANONICAL_WIKI_PATH_TREE_IMPLEMENTATION_ENTRYPOINT_PLAN.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_PATH_TREE_IMPLEMENTATION_ENTRYPOINT_PLAN.md)

The historical clean-path roadmap later in this file documents the runtime that
existed before the cutover. Where it conflicts with the contract stack, the
contract stack wins. In particular, do not treat topic/category slug leaves,
legacy wiki ID-route redirects, `westgateWikiPageSlug`, generated `wiki_slug`
markers, or namespace-main-page selectors as public wiki path authority.

### Archive Contract Stack

Wiki ZIP import/export is planned downstream from the canonical path/tree
cutover. Before changing archive schema/versioning, export/import jobs, ACP
archive workflow, portable page identity, ZIP/asset handling, preview/apply
merge behavior, or archive operator docs, read:

1. the canonical path/tree contract stack above
2. [WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md)
3. [WIKI_IMPORT_EXPORT_ARCHIVE_IMPLEMENTATION_ENTRYPOINT_PLAN.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/WIKI_IMPORT_EXPORT_ARCHIVE_IMPLEMENTATION_ENTRYPOINT_PLAN.md)
4. [docs/superpowers/plans/2026-05-22-wiki-import-export-archive-plan.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/docs/superpowers/plans/2026-05-22-wiki-import-export-archive-plan.md)

Archive work must consume canonical tree APIs and diagnostics. Do not make
portable archive identity, source NodeBB IDs, topdata page ids, `wiki_slug`, or
`westgateWikiPageSlug` into public wiki path authority.

## Purpose

This repository is a NodeBB plugin that adds a Westgate-specific wiki surface on top of forum content. The package is **GPL-3.0-or-later**. Wiki page creation uses **`/wiki/compose/:cid`** with a vendored **Tiptap** build under `public/vendor/tiptap/` (rebuild with `npm run build:tiptap` or `npm run build:editors`). CKEditor has been removed from the active compose path; unsupported legacy HTML must be normalized into the plugin-owned Tiptap schema before editing.

Current design baseline:

- `Topics` act as wiki pages.
- The first post is the canonical article body.
- Categories act as wiki sections or namespaces.
- The plugin must extend NodeBB instead of replacing core forum behavior.

This plugin is already past initialization. Use this file to route work, keep
current behavior legible, and preserve implementation history. Use focused
contracts and Superpowers plans for new multi-phase implementation work.

## Current Repository State

The repository is a working NodeBB plugin with route, service, template,
client, ACP, editor, search, and test surfaces. Key entrypoints:

- `library.js`: plugin hooks, API route registration, exported services
- `routes/wiki.js`: wiki page routes
- `lib/`: runtime services, authoring validation, path/link/search behavior,
  cache services, controllers
- `templates/`: wiki-facing NodeBB templates
- `public/`: client scripts, wiki CSS, vendored editor assets
- `tiptap/`: plugin-owned Tiptap source and editor extensions
- `tests/`: Node/jsdom contract and runtime service coverage
- `docs/`: focused content contracts and Superpowers specs/plans

Current implemented behavior includes:

- Registers `static:app.load`
- Adds a `/wiki` route
- Adds canonical `/wiki/...` namespace routes derived from configured category names
- Adds canonical `/wiki/...` article routes derived from namespace placement and page title hierarchy
- Renders a landing page from ACP-managed settings
- Treats configured categories as wiki namespaces, with NodeBB category permissions remaining the source of truth for visibility
- Surfaces configured child categories as nested namespaces on section pages
- Builds wiki breadcrumbs through configured parent namespaces
- Ships a first-pass template and stylesheet
- Exposes an ACP settings page for wiki configuration
- Exposes an ACP namespace selector so admins can choose wiki-enabled categories without hand-editing IDs
- Supports automatic descendant namespace inclusion so selecting a parent can expose its nested categories through the wiki
- Exposes wiki-oriented page creation actions that still use NodeBB topic creation under the hood
- Exposes a wiki page navigation rail for namespace-local browsing
- Supports first-pass internal wiki links in article bodies via `[[Page Title]]`, `[[Child Namespace/Page Title]]`, and `[[Root Namespace/Child Namespace/Page Title]]`
- Treats unresolved wiki links as redlinks that open prefilled page creation in the target namespace
- Provides canonical title/category wiki namespace and page paths through `lib/wiki-paths.js`
- Keeps migration reporting for retired ID-route, generated slug, and namespace-main-page state
- Exposes reusable internal services through `plugin.services` for future extension work
- Uses route and service modules instead of placing everything in `library.js`
- Live production checks on 2026-05-01 confirmed clean wiki article and
  namespace paths are working, including internal links such as
  `[[Map Creation Guide]]` resolving to canonical clean paths.
- Surfaces clean-path setup diagnostics in the ACP for duplicate namespace
  paths and reserved namespace route segments.
- Rejects wiki page create/edit titles that would collide with an existing
  canonical page path, a child namespace path, a reserved root route, or an
  ambiguous folded path.
- Exposes a reusable wiki link autocomplete service/API that returns canonical
  wiki paths and server-computed insert text for wiki and forum authoring
  contexts.
- Uses a plugin-owned Tiptap compose editor as the default wiki authoring
  surface. CKEditor references later in this file are legacy migration/history
  context unless an active fallback path is being audited in code.
- Sanitizes wiki main-post HTML on both the compose client and server-side save
  validation so editor swaps do not trust browser HTML.
- Live browser verification on 2026-05-06 confirmed the Tiptap compose/edit
  flow is working for normal page creation, save, and render in the active
  Westgate deployment.

The implementation has a working MVP shape and active phase-two surfaces. Keep
new architecture in focused contracts/plans rather than appending another
unbounded execution plan to this file.

## Current Priority

Use the contract stack and
[CANONICAL_WIKI_PATH_TREE_IMPLEMENTATION_ENTRYPOINT_PLAN.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_PATH_TREE_IMPLEMENTATION_ENTRYPOINT_PLAN.md)
for canonical wiki path/tree work. The old clean-path runtime remains audit
input only; do not expand its slug-leaf or compatibility assumptions as active
architecture.

Use the archive contract stack above for wiki ZIP import/export work. The
archive feature is a previewed administrator merge workflow, not a slug
resolver extension and not a destructive NodeBB backup restore.

Current priority order:

1. Continue the editor migration by expanding Tiptap-side legacy HTML support
   without weakening sanitization.
   - 2026-05-06 live testing confirmed the standard Tiptap authoring path is
     healthy for normal wiki pages.
   - 2026-05-06 source/build hardening added a first preserved legacy
     `figure.image` path in Tiptap. CKEditor-style image figures with
     captions, linked images, width/height attributes, and the existing
     alignment classes now stay as figures instead of being flattened during
     Tiptap import.
   - 2026-05-06 follow-up hardening expanded preserved legacy inline/block
     formatting in Tiptap: safe `class`/`style` attributes now survive through
     the shared sanitizer allowlist, inline `span` formatting is preserved
     through a Tiptap mark instead of forcing fallback, and non-plain
     `div`/`section`/`article` wrappers that only contain inline content are
     normalized into paragraphs so class-based wiki prose styling survives more
     edits.
   - 2026-05-06 presentational-tag normalization now maps basic legacy HTML
     such as `<i>`, `<b>`, `<strike>`, `<center>`, `<font>`, `<small>`,
     `<big>`, and `<tt>` onto schema-safe semantic equivalents or sanitized
     styled spans before unsupported-content detection runs.
   - 2026-05-06 parser hardening fixed the first-pass `figure.image` Tiptap
     import so captionless legacy figures no longer crash editor init, and the
     basic normalization set now also covers adjacent legacy tags such as
     `<del>`, `<ins>`, `<kbd>`, `<cite>`, `<abbr>`, `<acronym>`, `<dfn>`, and
     `<address>`.
   - 2026-05-06 table/list normalization now handles legacy `figure.table`,
     raw `<caption>`, and old `<dir>`/`<menu>` list markup by converting them
     into schema-safe table/list structures that the Tiptap path can save
     without falling straight back to CKEditor. Table captions currently round
     trip as styled wiki paragraphs placed immediately above the table rather
     than as native editable table-caption nodes.
   - 2026-05-06 structural wrapper support added a schema-safe Tiptap
     container block for legacy `div`, `section`, and `article` wrappers when
     they contain block content, so those wrappers no longer trigger immediate
     fallback after normalization leaves them in place.
   - Next editor phase: image and media layout tooling.
     - Current Tiptap support is good enough for importing many legacy image
       shapes, but authoring control is still weak. Authors need explicit tools
       for layout, not just passive preservation of old HTML.
     - Priority layouts to support intentionally:
       `centered image`, `left-aligned image`, `right-aligned image`,
       `side image with text wrap`, `two-up image row`, `multi-image gallery
       row`, and `image next to arbitrary prose or note content`.
     - Treat `image next to image` and `image next to text` as layout
       containers, not as ad-hoc inline styles pasted into random wrappers.
       The editor needs plugin-owned schema support for those containers if the
       content is expected to round-trip safely.
     - Prefer a staged rollout:
       1. expose toolbar commands for the existing single-image alignment
          classes already supported by render CSS
       2. add a plugin-owned media row/container node for side-by-side images
          with bounded class/style options
       3. add a richer mixed-content layout node only if image-plus-prose
          layouts remain common after step 2
     - Do not open up arbitrary Flexbox/Grid authoring through raw style
       passthrough. If Flexbox-backed layouts are needed, model them as
       explicit plugin-owned classes/nodes with sanitized attributes.
     - Keep the server sanitizer, Tiptap import normalization, render CSS, and
       toolbar affordances aligned. A layout is not supported until it can be
       imported, edited, saved, and rendered without silent collapse back to a
       linear block flow.
     - Table formatting is currently in a healthier state than image layout.
       Do not regress tables while adding media layout tools.
   - 2026-05-06 initial image/media layout tooling is now implemented in the
     Tiptap path:
     - toolbar controls for single-image positioning (`center`, `left`,
       `right`, `side`)
     - toolbar controls for image sizing (`small`, `medium`, `large`,
       `full-width`) backed by explicit plugin-owned classes
     - plugin-owned `wiki-media-row` / `wiki-media-cell` schema nodes with
       `2-Up` and `3-Up` insertion commands for side-by-side image or
       mixed image-plus-text layouts
     - normalization of simple legacy flex/grid media wrappers into those
       plugin-owned row/cell classes before sanitization strips raw layout CSS
     - visible selection/focus affordances for images and media cells, plus
       click-to-select behavior on images and click-to-focus behavior on empty
       media cell chrome
     - 2026-05-07 compose UX follow-up: long wiki pages now justify explicit
       toolbar reachability as part of the image/media phase, not just as a
       polish item. The current Tiptap toolbar should remain reachable while
       editing lower-page images/layouts; a sticky toolbar is an acceptable
       interim step, but contextual floating/image-local controls remain part
       of the forward plan if the sticky approach proves insufficient.
   - Live browser verification is still needed for the new media-row authoring
     flow, especially image upload inside cells, keyboard navigation between
     cells, and save/edit round-trip on mixed image-plus-text rows.
   - 2026-05-07 regression hardening fixed a media-row reopen/save bug where
     plugin-owned `wiki-media-row` / `wiki-media-cell` wrappers could be
     reparsed as generic container blocks, manufacturing extra wrapper columns
     on round-trip and shifting image placement. Keep plugin-owned layout nodes
     excluded from generic container parsing.
   - Next image toolkit phase:
     - Add explicit caption authoring for selected images. Prefer a
       plugin-owned figure workflow rather than storing captions in unrelated
       text blocks beside the image.
     - Add image management actions: replace selected image, remove selected
       image, and possibly duplicate/move within a media row if the UX stays
       simple.
     - Review whether the current size presets are enough or whether bounded
       width percentages / resize handles are worth adding. Do not expose free
       arbitrary sizing unless the save/render contract remains predictable.
     - Keep plain-image and figure-image behavior converging, not diverging.
       The long-term image toolkit should not force authors to guess which
       image subtype supports which controls.
  - Extension architecture roadmap:
    - The editor is now past the point where a single `wiki-editor-bundle.js`
      file should keep owning every custom schema decision inline. Future work
      should treat Tiptap features as an explicit extension layer with clear
      ownership boundaries.
    - Guiding rule:
      - use stock/official Tiptap extensions for generic rich-text primitives
      - use plugin-owned custom extensions for wiki semantics, migration
        compatibility, constrained image/layout behavior, and structures that
        must obey the plugin sanitizer and route/link model
    - Core stock extensions to keep as first-class primitives for wiki editing:
      - `StarterKit`
      - `Image`
      - `Link`
      - `Placeholder`
      - `Table`, `TableRow`, `TableHeader`, `TableCell`
      - `TaskList`, `TaskItem`
      - `TextAlign`
      - `Underline`
      - `Subscript`
      - `Superscript`
      - `Typography`
      - `CharacterCount`
      - `Highlight`
    - Plugin-owned extensions that should remain custom because they encode
      Westgate/wiki-specific structure or sanitizer-bound behavior:
      - `preservedNodeAttributes`
      - `styledSpan`
      - `containerBlock`
      - `mediaRow`
      - `mediaCell`
      - `imageFigure`
      - future `wikiImage` extension that extends stock `Image` with plugin
        class/command policy
      - future `wikiEditorInteractions` extension for image-selection,
        media-cell focus, and editor-specific click behavior
      - future `wikiInternalLink` node/mark
      - optional future `wikiRedlink` node/mark
      - future `wikiFootnote` node/mark
      - future callout/admonition/wiki block extensions if those become part of
        the product
    - Stock extensions worth evaluating next, in recommended order, but only
      when they fit the save/render contract:
      - `FileHandler`
        - strongest immediate recommendation for paste/drop image handling
        - better fit than keeping file-pick/upload behavior as the only image
          ingestion path
      - `Details`, `DetailsSummary`, `DetailsContent`
        - strongest medium-term stock block candidate if guides need
          collapsible sections
      - image resize support on `Image`
        - only if width/height persistence, sanitizer behavior, and render CSS
          stay bounded and predictable
      - `DragHandle`
        - useful once media rows and other custom blocks are common enough that
          moving them by cursor alone feels clumsy
      - `Mathematics`
        - only if gameplay/mechanics docs actually need equation authoring
      - `Mention`
        - defer unless editor UX is blocked; forum mention notifications remain
          server-owned
      - collaboration-related extensions only if the product actually moves
        toward real-time multi-user editing
    - Explicit non-goals:
      - do not solve editor gaps by enabling broad arbitrary HTML/CSS authoring
      - do not rely on unstable experimental figure/layout packages without a
        plugin-owned compatibility layer
      - do not let toolbar code become the real owner of schema decisions
  - Recommended extension file structure:
    - Move custom editor schema/tooling into `tiptap/src/extensions/`.
    - Add explicit shared-contract modules first so custom extensions do not
      duplicate sanitizer/class logic.
    - Target structure:
      - `tiptap/src/extensions/image-figure.js`
      - `tiptap/src/extensions/media-row.js`
      - `tiptap/src/extensions/container-block.js`
      - `tiptap/src/extensions/styled-span.js`
      - `tiptap/src/extensions/preserved-node-attributes.js`
      - `tiptap/src/extensions/wiki-image.js`
      - `tiptap/src/extensions/wiki-editor-interactions.js`
      - `tiptap/src/extensions/wiki-internal-link.js`
      - `tiptap/src/extensions/wiki-footnote.js`
      - `tiptap/src/extensions/wiki-callout.js`
    - Shared/support files:
      - `tiptap/src/normalization/legacy-html.js`
      - `tiptap/src/shared/preserved-attrs.js`
      - `tiptap/src/shared/sanitizer-contract.js`
      - `tiptap/src/shared/image-class-contract.js`
      - `tiptap/src/toolbar/toolbar-schema.js`
      - `tiptap/src/toolbar/media-tools.js`
      - `tiptap/src/toolbar/image-tools.js`
      - `tiptap/src/selection/media-selection.js`
    - Keep the top-level bundle file as assembly/composition code only:
      imports, extension registration order, upload wiring, toolbar mounting,
      and editor boot logic.
  - Recommended implementation order for the extension layer:
    - Phase 0: Freeze the current contract before extraction.
      - Add focused client-side tests for:
        - `normalizeLegacyHtmlForTiptap`
        - `detectUnsupportedContent`
        - preserved class/style round-trip
        - `imageFigure`, `mediaRow`, and `mediaCell` parse/render behavior
        - image click-selection and empty media-cell focus behavior
      - Reason:
        - current tests cover the server sanitizer better than the client-side
          Tiptap contract; extraction should not proceed on assumption alone
      - 2026-05-07 implementation status:
        - initial jsdom-backed client contract tests now exist for
          normalization, unsupported-content detection, client sanitization,
          styled-span round-trip, `imageFigure` parse/render, and `mediaRow`
          command/render behavior
        - the bundle now imports extracted modules for shared sanitizer
          contract, legacy HTML normalization, preserved attributes,
          `containerBlock`, `styledSpan`, `mediaRow` / `mediaCell`,
          `imageFigure`, and selection/image class helpers
        - extraction target remains behavior preservation, not a schema/model
          change; interaction-specific tests are still lighter than the
          normalization/render contract and should be expanded before later
          image-toolkit work
    - Phase A: Extract what already exists without changing behavior.
      - Move `imageFigure`, `mediaRow`, `mediaCell`, `containerBlock`,
        preserved attribute logic, styled spans, and normalization helpers into
        separate modules.
      - Extract shared sanitizer/class helpers before per-extension refactors.
      - Keep commands, parse/render logic, and CSS contracts behaviorally
        identical during this extraction.
      - Preserve:
        - same saved HTML where practical
        - same sanitizer contract
        - same unsupported-content detection and CKEditor fallback behavior
        - same image click-selection, link-click suppression, and media-cell
          focus behavior
      - Exit criteria:
        - smaller bundle file
        - same saved HTML contract
        - same fallback/sanitizer contract
        - same focused tests passing
        - easier targeted edits
    - Phase B: Normalize image handling around extensions, not toolbar helpers.
      - Add first-class image toolkit behavior on top of extracted modules.
      - Create a plugin-owned `wikiImage` extension by extending stock `Image`
        so image class vocabulary, bounded sizing, and future insertion helpers
        are extension-owned instead of toolbar-owned.
      - Keep `imageFigure` custom, but align its command surface with
        `wikiImage`.
      - Add:
        - captions for `imageFigure`
        - replace/remove image actions
        - explicit policy decision on bounded resize support vs class-based
          width presets only
      - Unify plain-image and figure-image toolbar behavior, but do not paper
        over real model differences.
      - Required design decision:
        - decide whether plain images remain first-class indefinitely or are
          progressively wrapped/converged toward figures when caption/layout
          metadata appears
      - Exit criteria:
        - image positioning, sizing, captioning, replacement, and import
          behavior feel like one coherent toolkit
    - Phase C: Introduce semantic wiki inline extensions.
      - `wikiInternalLink`
        - strongest recommendation after image toolkit stabilization
        - should own canonical wiki-target metadata instead of relying purely
          on raw `[[...]]` text conventions
      - optional `wikiRedlink`
      - later `wikiFootnote`
      - Those should integrate with existing autocomplete, path resolution,
        mention/footnote processing, and saved HTML rules rather than becoming
        isolated editor-only abstractions.
    - Phase D: Introduce optional wiki block extensions only if demanded by
      actual content needs.
      - `Details`, `DetailsSummary`, `DetailsContent` for collapsible sections
      - callouts/admonitions if the product needs plugin-owned variants rather
        than stock details blocks
      - `Mathematics` for math blocks/inline equations if real content needs it
      - `DragHandle` for custom block layouts once layout complexity is high
        enough
  - Toolbar architecture plan:
    - Keep the toolbar as plugin UI, not editor schema.
    - Replace hard-coded button behavior with command descriptors grouped by
      capability:
      - document/history
      - inline marks
      - links
      - images
      - media rows
      - lists
      - alignment
      - tables
    - Let extensions own commands and active-state semantics.
    - Let the toolbar consume those commands rather than owning layout/image
      policy itself.
    - Show contextual image tools only when `image` or `imageFigure` is
      selected.
    - Show contextual media-row tools only when selection is inside
      `mediaCell` or `mediaRow`.
  - Decision framework for future extension choices:
    - Prefer stock extensions when:
      - the content model is generic
      - the saved HTML is conventional and stable
      - the editor feature does not depend on wiki-specific server logic
      - extending a stock extension gives the needed behavior without forking
        the content model
    - Prefer plugin-owned extensions when:
      - the feature depends on wiki path resolution, redlinks, or ACP-driven
        namespace behavior
      - the feature needs a constrained class/style contract
      - migration safety requires plugin-owned import normalization
      - the rendered structure is a wiki product decision rather than a
        generic editor primitive
      - server sanitizer and client schema must evolve together
    - Reject or defer an extension when:
      - it increases authoring power by producing HTML the sanitizer cannot
        preserve predictably
      - it creates a second competing content model for the same wiki feature
      - it depends on experimental packages without a maintainable fallback
      - it would move notifications, routing, or other server-owned semantics
        into a client-only abstraction
  - Verification expectations for extension work:
    - Every new extension should be treated as a full contract change, not
      just editor UI sugar.
    - Required verification surfaces:
      - legacy HTML import into Tiptap
      - unsupported-content detection and fallback decisions
      - toolbar authoring / command behavior
      - save pipeline through server sanitizer
      - reopen/edit round-trip
      - rendered article output under Westgate theme styles
      - fallback behavior for unsupported legacy content
    - Add focused tests where possible for:
      - sanitizer allowlist alignment
      - normalization rules
      - saved class/style contracts
      - image/media command behavior
      - route/link semantics for wiki-specific inline nodes
      - interaction behavior currently handled through editor DOM events
  - Recommendations on current implementation shape:
    - Current plugin-owned features that are already right to remain custom:
      - preserved node/mark attributes
      - `containerBlock`
      - `mediaRow` / `mediaCell`
      - `imageFigure`
    - Current implementation pieces that should move toward extension-backed
      ownership:
      - image layout/size class logic currently owned by toolbar helper
        functions should move into `wikiImage` / `imageFigure` commands
      - click-selection, link suppression, and media-cell focus behavior should
        move into a `wikiEditorInteractions` extension rather than staying as
        ad hoc bundle-local `editorProps` logic
      - image paste/drop behavior should move toward stock `FileHandler` rather
        than keeping file-picker upload as the only supported ingestion path
    - Current implementation pieces that should stay plugin-UI-owned rather
      than becoming schema:
      - toolbar rendering/layout
      - upload endpoint wiring
      - compose-page fallback/status messaging
  - Anti-patterns to avoid while expanding extensions:
    - do not let arbitrary pasted Flexbox/Grid/CSS become the editor's real
      layout model
    - do not add overlapping image systems where plain images, figures, and
      media cells all expose different incompatible toolbars
    - do not bypass `shared/wiki-html-sanitizer-config.json` when adding new
      editor features
    - do not make client-only schema decisions that the server sanitizer or
      rendered article CSS cannot honor
    - do not replace working conversion code with stock extensions just because
      they exist if the replacement weakens migration safety or route/link
      semantics
   - The remaining editor gap is legacy HTML/CSS round-trip support. Do not
     treat this as a sanitizer-only toggle; changes must preserve content
     safely through the Tiptap schema and save pipeline.
   - Table/media figures, arbitrary raw HTML embeds, and broader unsupported
     layout structures still need deliberate follow-up. Keep CKEditor fallback
     active for unsupported shapes until each one round-trips safely.
   - Prefer small, explicit import/normalization steps first: wrapper tags,
     safe structural markup, then deliberate attribute/style support.
   - Keep CKEditor fallback available until legacy-content editing coverage is
     wide enough to remove it intentionally.
2. Live-verify the new collision diagnostics, title rejection, and autocomplete
   API in a running NodeBB instance after deployment.
   - Per-namespace duplicate title rejection has been live-checked.
   - Duplicate page names in different namespaces remain allowed by design;
     bare `[[Page]]` links may still need enough namespace context if they are
     ambiguous.
   - Slash namespace links and colon namespace links are both supported for
     wiki page targets, e.g. `[[development/guides/Map Creation Guide]]` and
     `[[development:Map Creation Guide]]`.
   - Forum composer wiki-link insertion now has a toolbar button backed by the
     server-side autocomplete API; live browser verification remains pending.
3. Continue wiki-owned search only through plugin-owned path/tree services; do
   not let client code or templates construct `/wiki/...` manually.
4. Continue Westgate theme alignment and full live smoke checks.

Historical priority items, completed 2026-05-01 under the retired clean-path
model:

- Build the canonical namespace/page path resolver.
- Add canonical clean routes and redirect existing ID-based wiki routes.
- Move wiki-owned link generation for routes, breadcrumbs, redlinks, compose
  redirects, namespace search, sidebars, namespace indexes, and delete redirects
  onto canonical paths.
- Live-verify clean wiki paths in a running NodeBB instance.
- Add focused resolver tests for canonical namespace paths, collisions,
  reserved route segments, page collisions, and namespace/page path collisions.
- Harden create/edit-time rejection for duplicate page slug leaves, reserved
  root page paths, namespace/page path collisions, and ambiguous namespace
  setup.

Architectural rule: search results, redlinks, breadcrumbs, authoring redirects,
and future path-aware features must use one source of truth for wiki paths. New
wiki-facing features must call the plugin path facade/tree service rather than
rebuilding paths locally.

Editor migration rule: changes to Tiptap support must keep the client bundle,
server sanitizer, and stored HTML contract aligned. Do not claim new HTML/CSS
support unless the content can be imported, edited, saved, and re-rendered
without silent data loss.

## Working Rules

When changing this plugin:

1. Preserve NodeBB core behavior.
2. Prefer small, verifiable steps over broad rewrites.
3. Keep wiki logic isolated in plugin-owned modules.
4. Do not hard-code site-specific IDs once configuration exists.
5. Do not assume a specific database backend beyond NodeBB abstractions.
6. Treat `/wiki` as a presentation layer over forum data, not a separate content system.
7. Prefer exposing stable plugin-owned helpers over duplicating wiki resolution logic in future files.
8. Keep human-authored behavior in documented config/contracts where it belongs;
   do not hardcode topdata dataset exceptions into plugin runtime.
9. Update this file by correcting current guidance near the top and labeling
   history below; do not let old roadmaps silently regain authority.

## Local Workflow

From the plugin repo:

```bash
npm install
npm run build:editors
npm test
```

Restart NodeBB after changing `plugin.json`, server hooks, route registration,
or plugin initialization. Rebuild NodeBB assets after changing templates,
client scripts, CSS, or vendored editor output.

## Current Work Routing

- Canonical path/tree/index/topdata alignment: use the required contract stack
  and implementation entrypoint at the top of this file.
- Editor schema, sanitizer, normalization, and vendored Tiptap work: keep
  Tiptap source, sanitizer allowlists, saved HTML, render CSS, and tests aligned.
- Generated topdata wiki content: keep plugin storage/sanitizer expectations in
  [docs/topdata-bot-content-contract.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/docs/topdata-bot-content-contract.md)
  and coordinate public path changes with toolkit/module owners.
- Forum/wiki feed separation, wiki search, revision history, and theme checks:
  use the roadmap sections below only where they are not superseded by a newer
  focused contract or plan.

## Historical Initialization Material

The initialization objective, MVP boundary, repository shape sketch, and phase
plan below are preserved as history. They describe the scaffold-to-MVP path and
contain some pre-cutover path/editor wording. Do not use them as the active
implementation order.

## Initialization Objective

Initialize the plugin so that a developer or agent can take it from scaffold to MVP in a controlled order, with explicit completion criteria and without inventing architecture mid-flight.

## Historical Target MVP

The first usable version of this plugin must support:

- A configurable `/wiki` landing page
- Category-backed wiki sections
- Nested wiki namespaces when configured categories are parent/child in NodeBB
- Topic listings per wiki section
- A dedicated wiki page view at a canonical namespace/page path
- Clean wiki styling that coexists with the active NodeBB theme
- Graceful handling of missing categories, empty sections, and disabled configuration

Anything beyond that is phase-two work, unless a later section of this file explicitly updates the boundary.

## Historical Recommended Project Shape

The plugin can stay small at first, but code should be split once the second route or second data transform appears.

Recommended structure:

```text
nodebb-plugin-westgate-wiki/
├── AGENTS.md
├── package.json
├── plugin.json
├── library.js
├── lib/
│   ├── config.js
│   ├── wiki-service.js
│   ├── topic-service.js
│   └── serializer.js
├── routes/
│   └── wiki.js
├── public/
│   └── wiki.css
└── templates/
    ├── wiki.tpl
    └── wiki-page.tpl
```

This is not mandatory on day one, but it is the intended direction once the landing-page-only prototype grows.

## Historical Step-By-Step Initialization Plan

### Historical Phase 0: Baseline Audit

Goal:
Establish what exists and remove ambiguity before feature work starts.

Tasks:

1. Confirm plugin metadata and NodeBB compatibility in `package.json` and `plugin.json`.
2. Confirm the only active hook is `static:app.load`.
3. Confirm `/wiki` renders successfully with the current template.
4. Identify every hard-coded project assumption, starting with `wikiCids = [12, 13, 14]`.
5. Record missing operational basics such as scripts, linting, and local test instructions.

Exit criteria:

- The current scaffold is understood.
- Hard-coded assumptions are enumerated.
- The next implementation step is configuration, not more route logic.

### Historical Phase 1: Configuration Foundation

Goal:
Replace hard-coded wiki category assumptions with plugin configuration.

Tasks:

1. Add a plugin settings model for wiki category IDs or slugs.
2. Decide whether categories are configured by numeric `cid`, slug, or both.
3. Add config load helpers so route code does not read raw settings directly.
4. Define sane behavior when config is missing:
   - render an empty state for regular users
   - render an admin-facing setup hint if appropriate
5. Remove hard-coded category IDs from `library.js`.

Exit criteria:

- `/wiki` no longer depends on hard-coded category IDs.
- Missing config does not crash the route.
- Config access is centralized.

### Historical Phase 2: Route and Service Separation

Goal:
Stop putting all logic in `library.js`.

Tasks:

1. Keep `library.js` as the plugin entrypoint only.
2. Move route registration into `routes/wiki.js`.
3. Move category/topic retrieval into a service module.
4. Normalize outgoing view data before rendering templates.
5. Ensure every async failure reaches `next(err)` cleanly.

Exit criteria:

- Entry, route, and data concerns are separated.
- The landing page still renders with the same behavior.
- The codebase is ready for a second wiki route without becoming tangled.

### Historical Phase 3: Landing Page Hardening

Goal:
Turn the current `/wiki` page into a reliable MVP surface.

Tasks:

1. Add empty-state rendering when no wiki sections are configured.
2. Handle invalid or deleted categories without breaking the whole page.
3. Limit or paginate listed topics deliberately instead of using implicit defaults.
4. Decide how many topics to show per section and keep that configurable or constant.
5. Improve template semantics so the page is usable on desktop and mobile.
6. Keep CSS scoped to wiki classes to avoid bleeding into forum pages.

Exit criteria:

- `/wiki` behaves predictably with good data and bad data.
- The UI remains readable with zero, few, or many topics.

### Historical Phase 4: Wiki Page Route

Goal:
Add a dedicated wiki article view.

Tasks:

1. Introduce a canonical wiki article route. Current implementation uses
   `/wiki/:topic_id/:slug?` to match NodeBB topic slugs, but the target route is
   `/wiki/:namespace_path_segments/:page_slug`.
2. Resolve the topic through NodeBB APIs, not direct database assumptions.
3. Treat the first post as article content.
4. Fetch enough topic metadata to render title, breadcrumbs, category, author, and timestamps.
5. Decide whether discussion replies are hidden, collapsed, or linked out for MVP.
6. Add `templates/wiki-page.tpl`.

Exit criteria:

- A topic can be viewed through a wiki-oriented route.
- Missing or invalid slugs return proper NodeBB-style errors or 404 behavior.

### Historical Phase 5: Authoring and Navigation Decisions

Goal:
Define the rules that make topics behave like wiki pages.

Tasks:

1. Decide how wiki pages are identified:
   - topic in configured category
   - tag-based inclusion
   - explicit topic setting
2. Decide slug canonicalization rules.
3. Keep `/topic/:slug` as the NodeBB-owned discussion route and make
   `/wiki/:namespace_path_segments/:page_slug` the canonical wiki article route.
4. Add breadcrumb and cross-navigation from landing page to article page.
5. Document what qualifies as wiki content versus normal forum content.
6. Clarify how configured child categories behave as nested wiki namespaces.

Exit criteria:

- The plugin has a clear content model.
- Routing behavior is consistent and documented.

### Historical Phase 6: Admin and Operational Readiness

Goal:
Make the plugin maintainable instead of purely demo-ready.

Tasks:

1. Add basic npm scripts such as `lint` and `test` if the toolchain exists.
2. Add a local development note describing how to install the plugin into a NodeBB instance.
3. Add verification instructions for rebuilding NodeBB assets after plugin changes.
4. Add a short troubleshooting section for empty wiki pages, bad config, and missing categories.
5. Keep this `AGENTS.md` synchronized with actual repository state.

Exit criteria:

- Another developer can stand the plugin up without guessing.
- The plugin has at least a minimal repeatable validation flow.

### Historical Phase 7: Wiki Authoring Behavior

Goal:
Move the plugin further away from forum-shaped navigation and closer to wiki-shaped authoring.

Tasks:

1. Keep `Create Page` and `Create Sibling Page` inside the wiki flow after submit.
2. Support internal wiki links in article bodies.
3. Treat unresolved internal links as redlinks rather than dead text.
4. Make redlinks resolve to the target namespace and launch prefilled page creation.
5. Resolve namespaced links by current namespace, full namespace path, or unique suffix path where safe.
6. Keep discussion-thread access available without making it the primary page flow.

Exit criteria:

- Human authors can navigate between pages through wiki links.
- Missing links provide a create path instead of a dead end.
- Page creation remains namespace-aware.

### Historical Phase 8: Westgate Theme Alignment

Goal:
Bring wiki editor chrome and wiki page containers in line with
`nodebb-theme-westgate` while keeping Westgate-specific visual decisions in the
theme rather than duplicating theme CSS in this plugin.

Assessment, 2026-04-29:

- The plugin already exposes the right theming contract in `public/wiki.css` and
  `public/wiki-article-body.css`: wiki surfaces, prose, floating tools,
  redlinks, and editor-facing chrome route through `--wiki-*` custom
  properties with Bootstrap fallbacks.
- The Westgate theme already consumes that contract in
  `/home/vicky/Projects/nodebb-dev/nodebb-theme-westgate/scss/westgate/_wiki-prose.scss`.
  It sets Westgate palette variables and gives selected wiki cards the same
  shadow as forum cards.
- The plugin templates already provide useful semantic hooks:
  `.westgate-wiki`, `.wiki-page-content`, `.wiki-namespace-index`,
  `.wiki-sidebar-panel`, `.wiki-article-toc`, `.wiki-status-card`,
  `.wiki-card`, `.wiki-topic-card`, `.wiki-compose-form`,
  `.wiki-compose-editor`, and `.wiki-article-prose`.
- Screenshot 1 editor issues were mostly theme-skin issues, not data-flow
  issues: the then-active editor focus presented too much like browser/default
  blue, toolbar button sizing/wrapping was cramped, and the compose form read
  flatter than the forum's velvet category/topic panels.
- Screenshot 2 vs screenshot 3 container mismatch is also mostly theme-side:
  forum category rows use richer `--wg-velvet-panel`, muted gold borders,
  `8px` radius, and `--wg-velvet-shadow`; wiki article and sidebar cards are
  close structurally but flatter and less connected to the forum container
  language.
- The plugin currently uses `.card` on the right elements. That should stay.
  The next step is to make the active theme style those cards more precisely,
  not to hard-code Westgate gradients into plugin CSS.

Ownership decision:

- Plugin owns stable semantic classes, neutral layout, active editor loading,
  and fallback CSS.
- `nodebb-theme-westgate` owns the Westgate visual result in
  `scss/westgate/_wiki-prose.scss`.
- Prefer adding or correcting plugin classes only when the theme lacks a stable
  selector. Do not add one-off Westgate palette values to `public/wiki.css`.

Tasks:

1. Confirm rendered wiki pages use the template hooks expected by the theme:
   article view, namespace view, landing page, redlink missing-page state, and
   compose/edit page.
2. In `nodebb-theme-westgate/scss/westgate/_wiki-prose.scss`, expand the wiki
   surface list to cover all real plugin containers that need forum-style
   depth:
   `.wiki-page-content`, `.wiki-namespace-index`, `.wiki-sidebar-panel`,
   `.wiki-article-toc`, `.wiki-status-card`, `.wiki-card`,
   `.wiki-topic-card`, and `.wiki-compose-form`.
3. Match those surfaces to the forum container contract:
   `background: var(--wg-velvet-panel)`, `border: 1px solid var(--wg-border)`,
   `border-radius: 8px`, `box-shadow: var(--wg-velvet-shadow)`, and the same
   restrained hover/focus treatment where interaction exists.
4. Keep the wiki article body document-like inside the shell: preserve readable
   prose line height and spacing, but use Westgate heading, link, code,
   blockquote, table, and caption variables from the theme.
5. Theme the TOC/sidebar as compact utility panels, not nested decorative
   cards: muted headings, gold links, clear active/current row states, tight
   indentation, and stable sticky/mobile behavior.
6. Theme the floating wiki action dock with the same icon-button language as
   forum tools: fixed dimensions, muted gold icon color, clear hover/focus
   states, and restrained danger treatment for delete.
7. Theme the compose editor in `nodebb-theme-westgate` through the existing
   `--wiki-ck-*` and `--wiki-compose-*` variables:
   toolbar background/border, button hover/on states, disabled state, dropdown
   panels, tooltip colors, input colors, source-editing view, editable
   background, and editable focus ring.
8. Replace the visible blue editor focus with a muted gold focus border/shadow
   that remains accessible.
9. Normalize CKEditor toolbar wrapping and density through theme selectors
   scoped to `.westgate-wiki-compose` or `body:has(#westgate-wiki-compose)`.
   Verify dropdown and balloon panels because CKEditor may mount them outside
   the editor element.
10. Add plugin-side classes only if theme selectors would otherwise have to be
    brittle. Candidate additions, if needed: a class on the article layout root
    for page-vs-namespace composition and a class on the compose card for
    theme-owned editor shell styling.

Exit criteria:

- Wiki page article, TOC, namespace index, status cards, and compose form share
  the forum's container depth and palette without moving Westgate CSS into the
  plugin.
- CKEditor toolbar, dropdowns, focus states, and editable area match the active
  Westgate theme at desktop and mobile widths.
- Forum category styling remains unchanged except for deliberate shared-token
  consistency.
- The plugin still degrades cleanly under non-Westgate themes through its
  Bootstrap-backed `--wiki-*` fallbacks.

## Historical Implemented Foundation: Human-Readable Wiki Paths

This section records the 2026-05-01 clean-path foundation that the current
runtime still exposes before the canonical path/tree cutover. It is not the
future path contract. For new path work, use the contract stack at the top of
this file.

Implementation status, 2026-05-01:

- `lib/wiki-paths.js` is the canonical wiki path service.
- Canonical namespace paths use configured category hierarchy segments:
  `/wiki/{namespace path}`.
- If the configured top-level wiki namespace category itself has slug `wiki`,
  that segment is treated as the route root and is omitted from child namespace
  URLs. Example: category chain `wiki/about` becomes `/wiki/about`, not
  `/wiki/wiki/about`.
- Canonical article paths use namespace path plus the NodeBB topic slug leaf:
  `/wiki/{namespace path}/{page slug}`.
- Legacy article and category routes remain as migration aliases and redirect
  to canonical paths for normal page requests.
- Wiki-owned links now prefer canonical `wikiPath` values through service data,
  breadcrumbs, redlinks, namespace search, compose redirects, page navigation,
  namespace creation responses, and delete redirects.
- The resolver is exposed as `plugin.services.wikiPaths`.
- `npm test` now includes syntax checks plus focused `tests/wiki-paths.test.js`
  fixture coverage for canonical namespace construction, namespace collisions,
  reserved route segments, duplicate page slug leaves, and namespace/page path
  collisions. It currently passes.
- Live production checks on 2026-05-01 confirmed clean article paths such as
  `/wiki/mechanics/classes/acolyte` and
  `/wiki/development/guides/map-creation-guide`, namespace navigation, and
  existing internal links resolving to canonical clean paths.
- Full local NodeBB asset verification is still pending because `./nodebb build`
  currently fails before asset compilation with `theme-not-found`.

Historical guidance: the phases below document the implemented pre-cutover
refactor plan and completion criteria. They should not be repeated or extended
as new path architecture. Use them as audit context only.

Before the refactor, wiki article URLs inherited NodeBB topic slugs:

```text
/wiki/29/map-creation-guide
```

That is stable and easy to resolve because the topic id is embedded in the
path, but it is not wiki-shaped. The desired canonical URL should use configured
wiki namespace/category paths followed by the page slug:

```text
/wiki/development/guides/map-creation-guide
```

This is now implemented as a plugin-owned routing layer over NodeBB categories
and topics. NodeBB category and topic ids remain internal identifiers, not
public wiki path requirements.

Historical priority decision, 2026-05-01:

- This refactor blocks wiki-owned search expansion. Search result URLs,
  namespace filters, redlink create suggestions, and future search snippets must
  all point at canonical wiki paths from the start.
- Do not add new public wiki routes that expose topic ids or category ids except
  backward-compatible redirect routes.
- Existing forum discussion links remain `/topic/{topic.slug}` because those
  are NodeBB-owned, not wiki-owned.
- That implementation kept route compatibility for old wiki URLs as migration
  aliases. The hard-line contract now governs whether compatibility survives
  the next canonical cutover.

### Historical Assessment

The plugin already has the data model needed for this:

- Configured categories are wiki namespaces.
- Child categories can be included as nested namespaces.
- Topic titles and NodeBB slugs already provide page slugs.
- Internal wiki links already resolve namespace paths in
  `lib/wiki-links.js`.
- Serialization previously emitted `/wiki/${topic.slug}`, which preserved the
  topic id because NodeBB topic slugs include it.
- Namespace compose search previously emitted the same ID-shaped wiki path and
  has been updated for canonical paths.
- Future wiki-owned search must call `lib/wiki-paths.js` for both result URLs
  and namespace scope metadata.

The implemented resolver maps:

```text
namespace/category path + page slug -> category + topic
```

without relying on the topic id in the request path.

### Historical Phase 0: Define Clean-Path Rules

Status, 2026-05-01: completed for the pre-cutover runtime. The new canonical
path/tree contracts supersede these rules for future path work.

Goal:
Make URL behavior deterministic before changing routes.

Rules:

1. Namespace segments come from the configured category hierarchy.
2. Page segments come from the NodeBB topic slug leaf with the numeric topic id
   removed.
3. The canonical article path is
   `/wiki/:namespace_path_segments/:page_slug`.
4. The canonical namespace index path is `/wiki/:namespace_path_segments`.
5. `/wiki` remains the wiki home route and cannot be claimed by a namespace.
6. Reserved first path segments are blocked for namespaces and pages:
   `category`, `compose`, `edit`, `namespace`, `search`, `admin`, `api`, and
   any future plugin utility route.
7. Existing ID-based paths continue to resolve and redirect to canonical paths.
8. If a namespace and page would produce the same path, namespace wins for the
   index route and page creation must reject or disambiguate the collision.
9. If two categories normalize to the same namespace path, the configured
   namespace tree is invalid for clean routing and the UI should expose a setup
   error rather than choosing one silently.
10. If two topics in one namespace normalize to the same page slug leaf, the
    route must fail safely and the authoring path should reject the collision
    until a deliberate fallback or alias policy exists.
11. Query strings must survive canonical redirects where they carry meaningful
    authoring/search context.

Exit criteria:

- The pre-cutover runtime gives each clean-path wiki namespace a public path.
- The pre-cutover runtime gives each clean-path wiki page a public path.
- That iteration preserved existing URLs through redirects.
- Collision and reserved-word behavior is documented before route code changes.

### Historical Phase 1: Build A Path Resolver Service

Status, 2026-05-01: Completed for the shippable foundation. Implemented in
`lib/wiki-paths.js` with namespace/article builders, legacy builders,
namespace lookup, article lookup by page slug leaf, reserved first-segment
handling, structured failure statuses, focused fixture tests, and admin-facing
namespace setup diagnostics. The next canonical cutover replaces its slug-leaf
assumptions; do not add alias policy to extend this iteration unless a newer
contract explicitly says so.

Goal:
Centralize URL construction and lookup instead of scattering path logic through
routes and serializers. This service is the blocking foundation for search,
redlinks, breadcrumbs, and authoring redirects.

Tasks:

1. Add a plugin service such as `lib/wiki-paths.js`.
2. Build namespace paths from category ancestors within the effective wiki
   namespace set.
3. Normalize path segments with the same slug rules used by NodeBB for category
   and topic slugs where possible.
4. Expose path builders:
   - `getNamespacePath(categoryOrCid, uid?)`
   - `getArticlePath(topicOrTid, uid?)`
   - `getLegacyNamespacePath(category)`
   - `getLegacyArticlePath(topic)`
5. Resolve a namespace path to a category id.
6. Resolve a full article path to `{ cid, tid, topic }` by finding a topic in
   the resolved category whose slug leaf matches the requested page slug.
7. Resolve the deepest matching namespace first, then treat the remaining final
   segment as the page slug.
8. Return structured failure reasons:
   - namespace not found
   - page not found in namespace
   - ambiguous duplicate page slug
   - hidden or unauthorized content
   - reserved path segment
   - namespace collision
   - page collision
9. Preserve NodeBB category/topic permission checks in the services that call
   path resolution. The resolver may identify candidates, but routes must not
   render unauthorized data.
10. Add focused unit-style tests around normalization, collision detection,
    deepest-namespace matching, and legacy-path construction where the existing
    test harness allows it. Status: partially covered by
    `tests/wiki-paths.test.js`; add more cases as the resolver grows.

Exit criteria:

- Routes, breadcrumbs, internal wiki links, and navigation can ask one service
  for canonical wiki URLs.
- No template needs to manually construct `/wiki/${topic.slug}`.
- Search implementation has a stable path API to depend on.

### Historical Phase 2: Add Clean Routes

Status, 2026-05-01: Completed for route behavior. `routes/wiki.js` now registers
specific utility routes first, redirects legacy ID-based article/category
routes, and resolves clean catch-all paths through `lib/wiki-paths.js`.
Remaining work is live verification in NodeBB once the local theme/build issue
is fixed.

Goal:
Support clean URLs while preserving the current ID-based routes during
migration.

Tasks:

1. Add a catch-all wiki route for canonical paths after more specific routes:
   `/wiki/:path(*)`.
2. Resolve the path first as a namespace index, then as a page within the
   deepest matching namespace.
3. Keep existing routes:
   - `/wiki/category/:category_id/:slug?`
   - `/wiki/:topic_id/:slug?`
4. Change existing routes to redirect to the canonical namespace or page path
   for non-API requests.
5. Ensure utility routes such as `/wiki/compose/:cid`,
   `/wiki/edit/:topic_id`, `/wiki/namespace/create/:parent_cid`, and
   `/wiki/search` are matched before the catch-all route.
6. Return NodeBB-style 404/permission responses without revealing whether a
   hidden namespace or page exists.
7. Keep `/topic/:slug` unchanged and link it only as the discussion view.

Exit criteria:

- `/wiki/development/guides/map-creation-guide` renders the article.
- `/wiki/29/map-creation-guide` redirects to the canonical article URL.
- `/wiki/category/12/development/guides` redirects to the canonical namespace
  URL.
- Compose, edit, delete, and namespace-create routes remain unaffected.

### Historical Phase 3: Update Link Generation

Status, 2026-05-01: Completed for existing wiki-owned links. New link work must
reuse the resolver. A repository search for direct `/wiki/${topic.slug}` or
`/wiki/category/${category.slug}` construction should only find legacy helpers,
utility routes, or documented fallbacks.

Goal:
Make every wiki-facing link prefer canonical paths.

Tasks:

1. Update `lib/serializer.js` to emit canonical `wikiPath` values for sections
   and topics.
2. Update `lib/wiki-links.js` so `[[Page]]`, `[[Namespace/Page]]`, and
   `[[ns:Namespace]]` render clean wiki URLs.
3. Update breadcrumbs in `lib/wiki-breadcrumb-trail.js`.
4. Update namespace search results in `lib/wiki-namespace-search.js`.
5. Update compose cancel/redirect targets so authors return to clean URLs after
   create or edit.
6. Update redlink creation targets so unresolved links carry the intended
   namespace and title while the eventual successful submit lands on the clean
   article URL.
7. Update wiki sidebar, namespace index, landing-page sections, parent-page
   links, and home-page links to use resolver output.
8. Keep forum discussion links pointed at `/topic/{topic.slug}` because the
   forum view is still NodeBB-owned.

Exit criteria:

- New links generated by the wiki no longer expose topic ids or category ids.
- Forum discussion links still use normal NodeBB topic URLs.
- A repository search for `/wiki/${topic.slug}` and
  `/wiki/category/${category.slug}` only finds legacy redirect helpers or tests.

### Historical Phase 4: Collision And Rename Handling

Status, 2026-05-01: Implemented for collision prevention and setup surfacing.
The resolver returns structured statuses for namespace collisions, page
collisions, namespace/page path collisions, and reserved first path segments.
The ACP surfaces duplicate namespace paths and reserved namespace route
segments. Wiki topic create/edit flows reject duplicate page slug leaves,
reserved root page paths, namespace/page path collisions, and ambiguous
namespace setup through `filter:topic.post`, `filter:topic.edit`, and the wiki
compose preflight endpoint. The next hard-line path contract supersedes the
alias discussion for path cutover work.

Goal:
Handle the cases that numeric ids used to make trivial.

Tasks:

1. Detect duplicate page slug leaves inside the same namespace.
2. On collision, either reject the new page title or route the duplicate through
   a deterministic fallback until renamed.
3. Detect namespace segment collisions caused by category rename/move,
   configured descendant inclusion, or reserved route names.
4. Redirect old clean paths after topic or category renames where practical.
5. Consider storing lightweight alias records for renamed wiki pages and
   namespaces if real content frequently changes names.
6. Keep redirects loop-safe and bounded.
7. Do not implement a broad alias table in the first pass unless clean-path
   redirects after rename become a product requirement. Prefer predictable
   canonical behavior over hidden magic.

Exit criteria:

- Clean URLs remain predictable when pages are renamed.
- Duplicate titles do not silently point to the wrong page.
- Bad namespace configuration is surfaced as an admin/setup problem instead of
  producing ambiguous public routes.

### Historical Phase 4A: Search And Authoring Dependency Update

Status, 2026-05-01: Completed for existing authoring flows. Existing namespace
compose search, compose success/cancel redirects, redlink flows, and page title
validation now use canonical paths or resolver-backed services. Full wiki-owned
search remains a follow-up and must consume the resolver.

Goal:
Make later wiki-side search and authoring work depend on canonical paths rather
than ID-shaped routes.

Tasks:

1. Treat wiki-owned search as blocked until `lib/wiki-paths.js` can build and
   resolve canonical namespace/page URLs.
2. Update the planned search result contract to require:
   - canonical `wikiPath`
   - namespace path display text
   - stable internal `cid`/`tid` for API consumers that need it
   - separate `topicPath` only for discussion links
3. Update compose success redirects and cancel links before exposing search
   suggestions that create pages.
4. Update redlink create flows before adding search "create page" suggestions.
5. Keep namespace compose autocomplete title-only if needed, but route its link
   serialization through the path resolver.

Exit criteria:

- No search or authoring plan asks templates or client code to build wiki URLs.
- The path resolver becomes the required interface for all wiki URL generation.

### Historical Phase 4B: Wiki Link Autocomplete Helper

Status, 2026-05-01: Implemented for the shippable authoring helper. `lib/wiki-link-autocomplete.js`
backs `/api/v3/plugins/westgate-wiki/link-autocomplete`, returns compact page
and namespace results with canonical `wikiPath` values, respects category read
privileges, and computes `insertText` for `forum` and `wiki` contexts. The old
namespace-local compose search now wraps this service, and the wiki compose page
uses the new endpoint for its insert-link picker. The normal NodeBB composer now
gets an `Insert wiki link` toolbar action that opens a small picker and inserts
canonical Markdown links. Still open: richer keyboard/typeahead behavior and
live browser verification.

Goal:
Expand the lightweight autocomplete helper into a reusable link-picker surface
for two authoring contexts:

- Forum composer: find a wiki page and insert a normal link to its canonical
  wiki URL.
- Wiki composer/editor: find a wiki page and insert an internal wiki link that
  can remain namespace-aware.

This is not the full wiki search experience. It is a low-latency authoring
helper that depends on canonical paths and returns small, predictable result
objects.

Tasks:

1. Replace or wrap `lib/wiki-namespace-search.js` with a reusable service such
   as `lib/wiki-link-autocomplete.js`. Status: done.
2. Expose one API that can serve both contexts, for example
   `/api/v3/plugins/westgate-wiki/link-autocomplete`, with parameters.
   Status: done.
   - `q`: normalized title query
   - `context`: `forum` or `wiki`
   - `cid`: current wiki namespace when known
   - `scope`: `current-namespace`, `descendants`, or `all-wiki`
   - `limit`: capped server-side
3. Preserve the existing namespace-local compose flow by mapping it to
   `context=wiki&scope=current-namespace`. Status: done.
4. Return a compact result shape. Status: done:
   - `type`: `page` or `namespace`
   - `title`
   - `titleLeaf`
   - `namespacePath`
   - `wikiPath`
   - `cid`
   - `tid`, for page results only
   - `insertText`, computed server-side for the requested context
5. For forum composer results, `insertText` should be a normal forum-safe link
   to the canonical wiki URL, such as Markdown or the active composer format's
   equivalent. Do not insert `[[...]]` syntax into normal forum posts unless a
   later parser deliberately supports it outside wiki article bodies.
6. For wiki composer results, `insertText` should prefer internal wiki-link
   syntax:
   - same namespace: `[[Page Title]]`
   - child or sibling namespace: `[[Namespace/Page Title]]`
   - ambiguous title leaf: include enough namespace path to disambiguate
   - optional label support can come later as `[[Target|Label]]` if the parser
     supports it
7. Use the canonical path resolver for every returned `wikiPath`. Client code
   should never assemble `/wiki/...` manually. Status: done for the service.
8. Respect NodeBB read privileges for all returned pages and namespaces. A
   hidden wiki page must be indistinguishable from a non-match. Status: done
   through category `topics:read` checks.
9. Keep creation suggestions context-sensitive:
   - forum composer should not offer to create wiki pages unless the user is in
     an explicit wiki-link picker with a selected target namespace
   - wiki composer may offer a redlink/create suggestion when the current
     namespace allows topic creation
10. Keep the helper fast:
    - title and namespace-name matching only
    - minimum query length unless showing recent/current namespace suggestions
    - capped candidate reads per namespace
    - no body snippets
    - no full post HTML
11. Add client integration only after the API contract is stable. Status:
    wiki compose integration and first-pass forum composer integration are done:
    - forum composer button opens a wiki link picker and inserts canonical
      Markdown links
    - wiki composer toolbar action/typeahead that inserts internal wiki links
    - richer keyboard navigation and typeahead behavior remain follow-up work
12. Keep UI labels clear so forum authors understand they are linking to the
    wiki, while wiki authors understand they are creating internal page links.

Exit criteria:

- Forum posts can link to wiki pages through canonical URLs without exposing
  topic ids.
- Wiki pages can link to other wiki pages through internal wiki-link syntax
  without authors manually typing namespace paths.
- The same server-side helper controls result permissions, ranking, and URL
  generation for both authoring contexts.
- The helper remains distinct from full wiki search and does bounded work.

### Historical Phase 5: Verification

Status, 2026-05-01: Partially complete. `npm test` passes, including focused
resolver fixture tests. Route patterns were checked against NodeBB's installed
`path-to-regexp`. Live production checks confirmed clean article paths,
namespace navigation, and internal links resolving to canonical clean paths.
Full local running-NodeBB verification is still blocked by the local
`./nodebb build` failure: `theme-not-found`.

Run these checks before considering clean paths complete:

1. Root namespace, child namespace, and deeply nested namespace URLs render.
   Status: live production spot checks passed for nested namespaces.
2. Article URLs render at `/wiki/{namespace path}/{page slug}`. Status: live
   production spot checks passed.
3. Current ID-based article and category URLs redirect to canonical paths.
4. Internal wiki links generate canonical URLs. Status: live production spot
   check passed for `[[Map Creation Guide]]`.
5. Redlinks still open page creation in the intended namespace.
6. Private or unauthorized namespaces do not leak through path lookup.
7. Slug collisions fail safely. Status: fixture tests cover duplicate page slug
   leaves and namespace/page path collisions; live verification still pending.
8. NodeBB `/topic/...` forum routes continue to work.
9. `/wiki/search`, `/wiki/compose/:cid`, `/wiki/edit/:tid`, and
   `/wiki/namespace/create/:parent_cid` are not swallowed by the catch-all
   route.
10. Search/compose namespace helper results use canonical wiki paths. Status:
    implemented through `lib/wiki-link-autocomplete.js`; live verification
    pending.
11. Create/edit flows redirect to canonical wiki article URLs. Status:
    existing compose redirects are implemented; new title collision preflight
    live verification pending.
12. Forum composer wiki-link autocomplete inserts canonical wiki URLs. Status:
    implemented; live verification pending.
13. Wiki composer autocomplete inserts namespace-aware internal wiki links.
    Status: implemented for the compose link picker; live verification pending.

## Future Work: Wiki-Aware Revision History

This roadmap remains future work. Any route/path examples in it must be adapted
to the active canonical path contract at implementation time.

NodeBB's built-in post edit history is forum-shaped. The current core path is:

- `forum/src/posts/diffs.js` stores reverse unified patches for each edit and
  reconstructs a full historical post snapshot on demand.
- `forum/src/api/posts.js#getDiffs` returns all revision metadata at once.
- `forum/public/src/client/topic/diffs.js` opens a Bootbox modal, renders a
  single `<select>`, and loads one full reconstructed post into
  `partials/posts_list`.
- `forum/src/views/modals/post-history.tpl` is designed around selecting and
  viewing an entire post revision.

That works acceptably for short forum posts, but it is a poor default for wiki
articles because a single article revision can be several screens long and the
most useful question is usually "what changed?", not "show the whole page at
this timestamp."

### Assessment

The apparent "only the most recent revision is visible" issue should be treated
as a UI and data-flow problem until proven otherwise. NodeBB currently returns a
full revision list, but the modal collapses that list into a normal single-row
select and immediately fills the modal with the full current post. For large
wiki articles, the revision navigation is visually dominated by the rendered
article and can become slow or hard to use.

The larger issue is architectural: `GET /posts/:pid/diffs/:since` returns a
full post snapshot and the client renders it as a forum post. That means wiki
history inherits forum presentation, including the entire article body, author
row, image layout, and topic-post chrome.

### Phase 0: Verify The Current Failure Mode

Goal:
Confirm whether NodeBB is losing revisions or only presenting them poorly.

Tasks:

1. Inspect the API response for a large wiki article through
   `/api/v3/posts/:pid/diffs` or the existing write route used by
   `forum/topic/diffs`.
2. Count `timestamps`, `revisions`, and the rendered `<select> option` nodes in
   the modal DOM.
3. Record article content size, revision count, modal render time, and whether
   `posts.diffs.load` reconstruction becomes slow.
4. Repeat the same checks with a normal forum post to avoid breaking the forum
   use case while optimizing wiki behavior.

Exit criteria:

- We know whether the data layer returns every revision.
- We know whether the problem is select usability, full-post rendering cost, or
  an actual truncation bug.

### Phase 1: Low-Risk Modal Improvements

Goal:
Improve the existing NodeBB history modal without changing the diff storage
format or forum restore/delete semantics.

Tasks:

1. Replace the single-row revision `<select>` with a scrollable revision list or
   compact table showing timestamp, editor, current/original markers, and
   deleted state.
2. Keep restore and delete wired to the existing NodeBB endpoints and privilege
   checks.
3. Avoid loading full post content until a revision is selected intentionally.
4. Add a "View full revision" action instead of making full snapshot rendering
   the default.
5. Add a content-length threshold so long posts default to compact history while
   short forum posts can keep the existing behavior.

Exit criteria:

- Forum history remains familiar.
- Wiki history no longer opens directly into a full article wall.
- All existing permissions and restore/delete behavior are preserved.

### Phase 2: Diff-First API Surface

Goal:
Add a non-breaking way to ask "what changed?" instead of "render the whole post
at this revision."

Tasks:

1. Add or propose a NodeBB endpoint such as
   `GET /posts/:pid/diffs/compare?from=&to=&mode=text|html|wiki`.
2. Return structured data:
   - revision endpoints and timestamps
   - editor metadata
   - title/tag changes
   - added, removed, and changed counts
   - changed hunks with limited surrounding context
   - collapsed unchanged block counts
3. Preserve the existing `GET /posts/:pid/diffs/:since` snapshot endpoint for
   compatibility.
4. Escape or sanitize all diff output before rendering because wiki articles
   are HTML-heavy.
5. Reuse `diffsPrivilegeCheck` and existing post history privileges.

Exit criteria:

- Consumers can render compact revision comparisons without loading a full
  post partial.
- Existing NodeBB clients continue to work.

### Phase 3: Wiki-Specific History UI

Goal:
Give wiki pages their own revision history experience while still using NodeBB's
post history as the source of truth.

Tasks:

1. Add a wiki-owned history route under the active canonical article path. Do
   not add history-specific legacy ID redirects unless the active path contract
   permits them.
2. Treat the first post `pid` as the article revision target.
3. Build a two-pane layout:
   - left: paginated or virtualized revision list
   - right: selected comparison, defaulting to selected revision versus previous
     revision or current revision
4. Render title/tag changes separately from body changes.
5. Group body changes by wiki section heading when possible.
6. Provide "View full revision" and "Restore this revision" as secondary
   actions, not the primary view.
7. Link from the wiki article byline or tools area to the wiki history route.

Exit criteria:

- Wiki users see a history page that answers what changed first.
- Full historical snapshots remain available but no longer dominate the flow.
- The implementation remains a presentation layer over NodeBB post diffs.

### Phase 4: Plugin Integration Strategy

Goal:
Keep the wiki plugin independent enough to ship locally while identifying which
parts should become NodeBB core improvements.

Tasks:

1. Start plugin-side by wrapping existing NodeBB diff services where practical.
2. If direct access to `posts.diffs` is not clean from the plugin, add the
   smallest NodeBB hook or API extension needed for revision comparison.
3. Candidate core hooks:
   - `filter:post.getDiffs` for metadata enrichment already exists.
   - A new load/compare hook for compact diff output.
   - A client hook before `forum/topic/diffs` opens its modal, allowing plugins
     to substitute a custom history UI for wiki main posts.
4. Avoid storing separate wiki revision records in phase one. NodeBB post
   history should remain authoritative.

Exit criteria:

- The plugin can provide a wiki-first history UI without forking the whole topic
  history implementation.
- Any NodeBB core change is small, reusable for forums, and not Westgate-only.

### Phase 5: Large Article Performance

Goal:
Make revision history usable for long wiki articles with many edits.

Tasks:

1. Add pagination or cursor support to revision metadata instead of loading all
   revisions forever.
2. Cache reconstructed snapshots or comparison summaries by `pid`, revision
   pair, and current edit timestamp.
3. Lazy-render diff hunks and collapse unchanged content by default.
4. Consider a wiki-only section index that stores heading anchors or block hashes
   at save time, but only after the basic diff-first UI proves insufficient.

Exit criteria:

- A large wiki article with dozens of revisions opens quickly.
- Comparing revisions does not require rendering the entire article body.

### Phase 6: Verification

Run these checks before considering the feature complete:

1. Large wiki article with many revisions shows every revision in the history
   list.
2. Opening history defaults to compact diff output, not full article output.
3. Full revision view still works when requested.
4. Restore and delete still respect NodeBB privileges.
5. A normal forum post still has a reasonable history experience.
6. HTML-heavy article diffs do not produce unsafe or broken markup.
7. Mobile history view remains navigable.

## Future Work And Status: Forum/Wiki Feed Separation

This roadmap includes implemented feed-separation work plus remaining live
verification, socket filtering, recent-post API/feed gaps, and wiki-search
follow-up. Public wiki path examples must follow the active path contract when
search work resumes.

Current wiki categories are hidden from the forum category tree by
`lib/filter-categories-forum.js`, but their topics can still appear in global
forum activity surfaces because NodeBB stores topic ids in shared topic sets:

- `/recent`, `/top`, and `/popular` are backed by `topics.getSortedTopics`.
- `/unread` and the header unread count are backed by
  `topics.getUnreadTids`.
- Global search is backed by `filter:search.query` providers such as
  `nodebb-plugin-dbsearch`, then filtered through NodeBB post/topic privilege
  checks.

Assessment, 2026-04-30:

- Current NodeBB source exposes `filter:topics.updateRecent` in
  `src/topics/recent.js`. Returning a falsey or incomplete payload prevents a
  topic from being added to the global `topics:recent` sorted set. This is the
  best low-cost way to keep future wiki edits and replies out of `/recent`.
- Current NodeBB source exposes `filter:topics.filterSortedTids` in
  `src/topics/sorted.js` after normal privilege, ignored-topic, category, tag,
  and user-block filtering. This is the best presentation filter for existing
  wiki topics already present in `topics:recent`, and for `/top` and
  `/popular`, which use the same sorted-topic pipeline.
- Current NodeBB source exposes `filter:topics.getUnreadTids` in
  `src/topics/unread.js` after unread candidate calculation and before counts
  are returned. This hook can remove wiki topics from all unread filters and
  recompute counts so the `/unread` page and header unread count agree.
- Current NodeBB source exposes `filter:search.inContent` and
  `filter:search.contentGetResult` in `src/search.js`. For global forum search
  hiding, `filter:search.inContent` is the safest generic post-id filter
  because it runs after privilege filtering and before pagination/result
  rendering.
- Bundled `nodebb-plugin-dbsearch` already supports an ACP
  `excludeCategories` list and also fires `filter:search.indexTopics` and
  `filter:search.indexPosts` before writing its index. If dbsearch remains the
  active search provider, wiki categories can be excluded either by syncing its
  configuration or by filtering those indexing hook payloads. The generic
  global-search filter is still needed for non-dbsearch providers.

Ownership decision:

- This plugin owns deciding which category ids are wiki namespaces through
  `config.getSettings().effectiveCategoryIds`.
- This plugin should hide wiki topics from forum-owned global activity surfaces
  by filtering topic ids, not by changing NodeBB category privileges. Category
  permissions remain the source of truth for whether a user may read or edit a
  wiki page.
- `/topic/:slug` should remain reachable for direct discussion access unless a
  later product decision explicitly disables it. The separation goal is to keep
  wiki content out of forum discovery surfaces, not to make wiki topics
  unreadable.
- Wiki-owned search should be implemented as a `/wiki` feature that searches
  only effective wiki namespaces. It should not depend on main forum search
  including wiki categories.
- The existing `lib/wiki-namespace-search.js` endpoint is an authoring helper,
  not a general wiki search surface. It supports compose/autocomplete for one
  namespace, only searches topic titles, scans a bounded namespace topic list,
  and now wraps `lib/wiki-link-autocomplete.js` so result URLs and insert text
  come from resolver-backed canonical paths. Keep it small rather than
  stretching it into the full user-facing search implementation.

Implementation status, 2026-04-30:

- `lib/forum-exclusion-service.js` centralizes effective wiki cid checks and
  ordered tid/pid filtering through NodeBB topic/post APIs.
- Plugin startup removes current wiki topic ids from the global
  `topics:recent` sorted set, and the update hook removes wiki tids again if a
  future edit/reply attempts to re-add them.
- `lib/filter-forum-feeds.js` now handles:
  - `filter:topics.updateRecent`
  - `filter:topics.filterSortedTids`
  - `filter:topics.getUnreadTids`
- `lib/filter-forum-search.js` now handles:
  - `filter:search.inContent`
  - `filter:search.indexTopics`
  - `filter:search.indexPosts`
- `lib/wiki-namespace-search.js` exposes a limited namespace-local topic-title
  search for compose/edit flows and delegates result serialization to
  `lib/wiki-link-autocomplete.js`. It is not enough for wiki-wide title/body
  search.
- `plugin.json` registers those hooks, so deployment requires a NodeBB restart;
  no asset rebuild is required for the server-side hook changes alone.
- `npm test` passed after the hook implementation.
- No NodeBB core files were changed.
- Known remaining gap: `/api/recent/posts` and `/recentposts.rss` call
  `posts.getRecentPosts`, and current NodeBB source does not expose a clean
  plugin hook in that method. The startup `topics:recent` cleanup does not
  affect the global `posts:pid` set. Avoid monkey-patching for the first
  shippable pass; if those surfaces matter in production, propose a small
  NodeBB core hook after `privileges.posts.filter` and before
  `getPostSummaryByPids`, or add a carefully-scoped route/controller wrapper as
  a separate task.
- Known remaining live-socket gap, observed during bulk wiki bot deployment:
  wiki topics can be correctly filtered from `/unread` and persisted header
  unread counts, but online users may still see transient unread badge bumps
  because NodeBB emits `event:new_post` / `event:new_topic` immediately after
  `POST /api/v3/topics`. The client header increments from that socket event
  before the next filtered unread query corrects it. Treat this as a
  plugin-owned "stealth wiki post" follow-up, not a toolkit workaround. The
  likely fix is to register `filter:sockets.sendNewPostToUids`,
  `filter:sockets.sendNewPostToUid`, and/or
  `filter:sockets.sendNewTopicToUid`; when the post/topic cid is an effective
  wiki namespace, suppress the recipient list or emitted payload so wiki bot
  creates do not produce live unread popups. Do not mark topics read for every
  user from the deployer; that is user-specific, races the socket event, and
  would couple wiki publication to global forum user state.

Live verification, 2026-05-01:

- Confirmed on the live server that wiki posts no longer appear in Recent.
- Confirmed on the live server that main forum search no longer returns wiki
  posts.
- Remaining live checks: `/top`, `/popular`, `/unread`, header unread count,
  live socket unread badge behavior during wiki bot topic creation,
  `/recent.rss`, `/api/recent/posts`, and `/recentposts.rss`.

### Phase 0: Confirm Surface Inventory

Goal:
Identify every global forum surface that currently leaks wiki topics before
adding filters.

Tasks:

1. Verify `/categories` and direct `/category/:cid` behavior still uses
   `filter:categories.build` and `filter:category.build` as expected.
2. Check `/recent`, `/top`, `/popular`, `/unread`, header unread count,
   `/recent.rss`, `/recentposts.rss`, and main `/search`.
3. Record whether the active production search provider is bundled dbsearch,
   Elasticsearch, Solr, or another plugin.
4. Capture a test wiki topic id and category id, then confirm where that topic
   appears before filtering.

Exit criteria:

- The leak surfaces are known and split into topic-list, unread, feed, and
  search categories.
- The active search provider and its hook behavior are known.

### Phase 1: Add A Shared Forum-Exclusion Service

Goal:
Avoid duplicating category checks across hooks.

Tasks:

1. Add a plugin-owned helper, for example `lib/forum-exclusion-service.js`.
2. Reuse `config.getSettings().effectiveCategoryIds` and expose:
   - `getWikiCidSet()`
   - `isWikiCid(cid)`
   - `filterNonWikiTopics(topicData)`
   - `filterNonWikiTids(tids, uid)`
   - `filterNonWikiPids(pids, uid)`
3. Use NodeBB APIs (`topics.getTopicsFields`, `posts.getPostsFields`) for cid
   lookups instead of direct database assumptions.
4. Preserve input ordering and tolerate missing/deleted topics or posts.
5. Treat missing config as no filtering.

Exit criteria:

- All future feed/search hooks can use one helper to remove wiki-backed forum
  content.

### Phase 2: Hide Wiki Topics From Recent, Top, And Popular

Goal:
Keep wiki topics out of forum topic-list discovery.

Tasks:

1. Register `filter:topics.updateRecent` and return no `tid`/`timestamp` when
   the topic's cid is a wiki cid.
2. Register `filter:topics.filterSortedTids` and remove wiki topic ids from
   `data.tids`.
3. Keep filtering conditional: if `params.cids` explicitly targets a wiki cid
   through a core forum route, prefer redirecting the category route to `/wiki`
   rather than returning mixed behavior.
4. Remove existing wiki tids from `topics:recent` on plugin startup, and keep
   the cleanup idempotent so restarts are safe.
5. Re-run topic creation, reply, edit, and move flows to ensure a topic moved
   into a wiki category disappears from forum lists, and a topic moved out of a
   wiki category can appear again.

Exit criteria:

- New wiki topics and replies do not enter `/recent`.
- Existing wiki topics are filtered out of `/recent`, `/top`, and `/popular`.
- Forum topics outside wiki namespaces are unaffected.

### Phase 3: Hide Wiki Topics From Unread

Goal:
Make `/unread` and unread counts ignore wiki-backed topics.

Tasks:

1. Register `filter:topics.getUnreadTids`.
2. Remove wiki tids from `data.tids`.
3. Remove wiki tids from every `data.tidsByFilter` array.
4. Recompute `data.counts` from the filtered `tidsByFilter` values.
5. Remove wiki cids from `data.unreadCids`.
6. Verify the hook handles both full unread-list calls and `count: true` calls
   used by `topics.getTotalUnread` and `topics.pushUnreadCount`.
7. Decide whether opening a wiki page should mark its backing topic read. If
   not, unread filtering must remain permanent so hidden unread wiki topics do
   not keep inflating header counters.
8. Add live-socket filtering for wiki topics so `event:new_post` and
   `event:new_topic` do not transiently increment online users' header unread
   badges before `filter:topics.getUnreadTids` has a chance to correct counts.

Exit criteria:

- Wiki topics do not appear on `/unread`.
- Header unread counts do not include wiki topics.
- Mark-all-read behavior for forums remains unchanged.

### Phase 4: Hide Wiki Content From Main Search

Goal:
Keep global forum search scoped to forum content while leaving room for
wiki-specific search.

Tasks:

1. Register `filter:search.inContent` and remove pids whose topic cid is a
   wiki cid from `data.pids`.
2. Do not register `filter:search.filterAndSort` for the first shippable pass:
   merely having a listener forces NodeBB to load matched post/topic metadata
   during relevance searches. Add it only if a provider-specific ordering path
   is proven to reintroduce wiki posts before `filter:search.inContent`.
3. For bundled dbsearch, register `filter:search.indexTopics` and
   `filter:search.indexPosts` to avoid indexing wiki topic titles and post
   bodies in the main search index.
4. If using dbsearch in production, either:
   - sync its ACP `excludeCategories` with wiki effective cids, or
   - keep the plugin-side indexing filters authoritative and trigger a dbsearch
     reindex after deployment.
5. For Elasticsearch/Solr providers, confirm whether they expose equivalent
   indexing hooks or honor `filter:search.query` cid restrictions. If not,
   rely on `filter:search.inContent` for result hiding and document that index
   storage may still contain wiki content until provider-specific exclusion is
   added.
6. Keep `filter:topic.search` behavior in mind: in-topic search inside a wiki
   discussion should either be allowed as direct topic functionality or routed
   to a wiki-owned search UI.

Exit criteria:

- Main forum search does not return wiki posts or wiki topic-title matches.
- Existing search index contents are either purged/reindexed or filtered at
  query time until a reindex is completed.
- The chosen behavior for direct in-topic search is documented.

### Phase 5: Add Wiki-Owned Search

Goal:
Replace main-search visibility with an intentional `/wiki` search surface.
Search must consume the active plugin path/tree services instead of emitting
ID-shaped wiki URLs or rebuilding public paths locally.

Tasks:

1. Add a plugin-owned search service, for example `lib/wiki-search-service.js`,
   instead of growing route code or reusing forum search result objects
   directly in templates.
2. Expose a route/API pair:
   - page route: `/wiki/search`
   - API route: `/api/v3/plugins/westgate-wiki/search`
3. Search only `config.getSettings().effectiveCategoryIds`, then run NodeBB
   category/topic/post privilege checks before returning any hit. Do not leak
   hidden namespace names, topic titles, excerpts, tids, pids, or result counts
   for unauthorized content.
4. MVP result types:
   - wiki pages, backed by topics whose first post is the article body
   - namespaces, backed by configured categories
   - optional redlink/create suggestion when the query has no exact page match
     and the current namespace allows topic creation
5. Return canonical wiki URLs for all wiki results. Keep `/topic/...` as a
   secondary discussion link only when the UI explicitly labels it as
   discussion.
6. Start with title and namespace-name ranking before body search:
   - exact title or title-leaf match
   - prefix match
   - word-boundary contains match
   - namespace match
   - recent article update as a tie-breaker
7. Add first-post body search only after the title/namespace result shape is
   stable. Keep snippets short, sanitized, and generated from plain text rather
   than raw HTML.
8. Keep the existing namespace compose search as a separate authoring helper
   until the new service can provide the same low-latency result shape, but
   move its URL serialization onto the canonical path resolver first.
9. Add a search input to wiki templates only after API behavior is stable. Use
   progressive enhancement: normal form submission to `/wiki/search`, then
   optional typeahead once the page route works.
10. Add empty, loading, and error states that keep users inside the wiki surface:
    no results, search unavailable, namespace hidden, and query too short.

Exit criteria:

- Users can find wiki content from the wiki UI.
- Main forum search remains forum-only.
- Search results are permission-safe, canonical-link-safe, and usable without
  client-side JavaScript.

### Phase 5A: Wiki Search Performance Plan

Goal:
Make wiki search responsive without turning every request into a full content
scan.

Tasks:

1. Enforce query normalization and limits:
   - trim whitespace
   - case-fold consistently
   - reject or return an empty state for queries shorter than two useful
     characters, except exact namespace shortcuts
   - cap query length, page size, and maximum scanned candidates
2. Prefer category/topic indexes already maintained by NodeBB for candidate
   discovery. Avoid scanning every post body on each request.
3. For the first implementation, use a two-stage query:
   - load configured readable namespaces
   - collect bounded topic candidates per namespace from category topic sorted
     sets, then score titles in memory
4. When body search is added, choose one of these deliberate paths:
   - maintain a plugin-owned lightweight index for first-post plain text by
     `tid`, `pid`, `cid`, slug leaf, title leaf, and update timestamp
   - or call the active search provider through a constrained cid query and
     re-filter with wiki privileges and canonical serializers
5. Do not let main forum dbsearch indexing become the wiki search dependency.
   The current feed-separation plan intentionally removes wiki content from
   forum search indexing where possible.
6. Cache only stable, permission-neutral pieces:
   - effective wiki cid set
   - namespace path metadata
   - topic title/slug/cid rows for configured namespaces
   Do not cache user-specific readable result sets without a uid/group-aware
   cache key.
7. Invalidate or tolerate stale cache on:
   - wiki category configuration change
   - topic create/edit/delete/restore
   - topic move between namespaces
   - category rename, move, delete, or privilege change
8. Keep result payloads small:
   - default page size: 10 or 20
   - max page size: 50
   - snippets: one or two short fragments
   - no full post HTML in search responses
9. Add timing logs or debug counters during development for candidate count,
   filtered count, returned count, and slow searches.

Exit criteria:

- A normal wiki search does bounded work proportional to configured namespaces
  and page size, not total forum post count.
- Body-search expansion has a chosen indexing/provider strategy before it is
  exposed in the UI.

### Phase 5B: Wiki Search UX And Edge Cases

Goal:
Make search behavior predictable for authors and readers.

Tasks:

1. Define result grouping before building UI:
   - exact page match
   - pages
   - namespaces
   - create suggestion, when allowed
2. Preserve namespace context. A search launched from a namespace should support
   both "this namespace" and "all wiki" scopes, with the narrower scope selected
   by default only when that is visible in the UI.
3. Handle duplicate page title leaves across namespaces by always showing the
   namespace path beside the page title. Never route a duplicate title by title
   alone.
4. Handle duplicate or renamed public path cases through the active path/tree
   resolver. Do not ship user-facing wiki search against ID-shaped wiki URLs.
5. Treat deleted, scheduled, shadow, moved, or hidden topics as non-results
   unless NodeBB permissions and product requirements explicitly allow a
   moderator/admin state.
6. Respect configured descendant namespace inclusion. If a parent namespace is
   selected and child inclusion is enabled, child namespace content can appear;
   otherwise only explicitly configured cids should appear.
7. Avoid confusing redlinks:
   - show a create suggestion only for a valid page title
   - choose the current namespace if one exists
   - otherwise require the user to pick a namespace before composing
8. Keep snippets safe:
   - strip HTML to text before matching
   - escape rendered highlights
   - do not show hidden embeds, scripts, raw attributes, or oversized tables
9. Provide useful no-result states:
   - query too short
   - no readable wiki namespaces
   - no matches in current scope
   - wiki not configured
10. Mobile UI should be a plain results list with compact filters, not a dense
    table. Keyboard users should be able to submit, refine, and open the first
    result without typeahead.

Exit criteria:

- Search stays inside the wiki mental model and does not send users into forum
  discovery surfaces by surprise.
- Edge cases fail closed for privacy and fail clearly for usability.

### Phase 6: Feed And API Follow-Up

Goal:
Close non-page leaks after the primary surfaces are handled.

Tasks:

1. Check `/recent.rss`; it uses recent topic data and may be covered by
   `filter:topics.filterSortedTids`.
2. Check `/recentposts.rss`; it uses recent posts and may need a post/pid
   filter or a small NodeBB hook if none exists.
3. Check `/api/recent`, `/api/unread`, and any mobile/client consumers of the
   same controllers.
4. Check widgets or plugins that call `topics.getLatestTopics` directly,
   because that helper reads `topics:recent` without the sorted-topic filter.
   If needed, add cleanup of `topics:recent` and propose a NodeBB hook for
   `getLatestTopics`.

Exit criteria:

- RSS/API/widget surfaces do not leak wiki topics in normal operation.
- Any remaining core hook gap is documented with the smallest proposed NodeBB
  change.

### Phase 7: Verification

Run these checks before considering forum/wiki feed separation complete:

1. Create a normal forum topic and a wiki topic; only the normal topic appears
   in `/recent`.
2. Reply to a wiki topic; it still does not appear in `/recent`.
3. `/top` and `/popular` do not show wiki topics.
4. `/unread` and the header unread count exclude unread wiki topics.
5. A user with direct wiki permissions can still open the wiki article and its
   `/topic/...` discussion link.
6. Main `/search` does not return wiki title or body matches.
7. Wiki search returns wiki title/body matches with canonical `/wiki` links.
8. Moving a topic into a wiki namespace removes it from forum discovery after
   the next relevant update/reindex.
9. Moving a topic out of a wiki namespace allows it to participate in forum
   discovery again.
10. Rebuild NodeBB assets only if templates/client assets change; restart
    NodeBB after changing `plugin.json` hooks or server-side hook handlers.

## Deferred Work

These items are intentionally out of initialization scope unless the project explicitly expands:

- Infobox or template systems
- API publishing endpoints
- Dedicated wiki search indexing beyond the first bounded MVP
- Compare or revert views
- Custom editor workflows
- Wiki-only namespaces created directly from plugin ACP
- Hiding wiki namespaces from standard forum category surfaces without breaking NodeBB assumptions
- Full DokuWiki-style sidebar/tree navigation
- Semantic section-level revision storage beyond NodeBB's patch history

Do not start on these until the relevant active contract or roadmap makes them
part of current scope.

## Historical Verification Checklist

This checklist mixes scaffold-era and pre-cutover clean-path checks. Use it as a
manual audit aid, not as the sole acceptance gate for canonical path/tree work.
The current contract stack owns cutover verification.

Run or manually verify these after each major step:

1. Plugin loads without NodeBB startup errors.
2. `/wiki` renders when configuration exists.
3. `/wiki` renders an empty state when configuration is absent.
4. Invalid configured category IDs do not crash the route.
5. Wiki CSS only affects wiki pages.
6. `/wiki/:namespace_path_segments` resolves a configured namespace.
7. The active wiki article route resolves a valid configured wiki topic.
8. Any compatibility route still permitted by the active path contract behaves
   as documented.
9. Missing or ambiguous public paths fail cleanly without leaking hidden
   content.
10. Restart NodeBB when changing `plugin.json`, server-side route registration, or plugin initialization code.
11. Rebuild NodeBB assets when changing plugin templates or CSS.
12. For Westgate theme alignment, rebuild assets after theme SCSS changes and
    compare `/categories`, a wiki article page, a wiki namespace page, and a
    wiki compose/edit page at desktop and mobile widths.
13. Check the active editor toolbar, dropdowns, floating panels, focus rings,
    source-editing mode, and editable prose styling on the compose page.

## Content Model Ledger

This ledger describes the active content model. Historical route details remain
below in the completed-steps ledger only as audit history.

- Configured categories are wiki namespaces.
- Topics inside configured categories are wiki pages.
- Configured child categories remain normal NodeBB categories underneath, but are surfaced in the wiki as nested namespaces.
- Category visibility and posting/editing behavior still come from NodeBB category permissions, so group-based access can be managed with the existing category privilege system.
- The `/wiki` landing page should prefer root configured namespaces; child namespaces are reached from their parent namespace pages.
- Wiki namespace enablement is plugin-specific configuration layered on top of normal NodeBB categories.
- Automatic descendant inclusion is a quality-of-life layer on top of explicit namespace selection, not a replacement for NodeBB category permissions.
- Canonical namespace paths derive from configured category names.
- Canonical article paths derive from namespace placement plus page title
  hierarchy split by ` :: `.
- Retired ID wiki routes, slug leaves, generated public slug fields, and
  namespace-main-page selectors are migration-reporting concerns, not active
  public path sources.
- `/topic/:slug` remains the discussion thread view for the same underlying
  topic.

## Completed Steps Ledger

- Configuration is ACP-backed through `westgate-wiki` settings.
- Landing-page and article route logic live outside `library.js`.
- Wiki section navigation now stays within the plugin surface instead of sending users directly to the core category view.
- The plugin now has a minimal `npm test` syntax-check script and a local development README.
- ACP now exposes a category tree selector for wiki namespaces instead of relying on raw category ID entry alone.
- Wiki navigation now supports configured namespace hierarchy across root namespaces, child namespaces, and article breadcrumbs.
- Parent namespaces can now automatically include descendant categories as effective wiki namespaces.
- Wiki namespaces now expose page-creation affordances when NodeBB category permissions allow topic creation.
- Wiki article pages now expose namespace-local navigation for sibling pages and child namespaces.
- Forum/wiki feed separation now hides wiki topics from `/recent`, `/top`,
  `/popular`, `/unread`, unread counts, and main search results through
  plugin-owned NodeBB hooks.

Mark items here as work lands in the repository.

- [x] Minimal plugin scaffold exists.
- [x] `static:app.load` hook is registered.
- [x] `/wiki` route exists.
- [x] Initial landing page template exists.
- [x] Initial wiki stylesheet exists.
- [x] Initialization plan has been documented in this file.
- [x] Hard-coded wiki category IDs have been replaced with ACP-managed settings.
- [x] Plugin configuration for wiki categories exists.
- [x] Route logic has been split out of `library.js`.
- [x] Service helpers exist for category and topic loading.
- [x] `/wiki` now handles setup-required and invalid-category states.
- [x] ACP navigation for plugin settings exists.
- [x] A first `/wiki/:topic_id/:slug?` article route exists for configured wiki categories.
- [x] `wiki-page.tpl` exists.
- [x] Root wiki namespaces are separated from nested configured namespaces on the landing page.
- [x] ACP provides a category tree UI for selecting wiki-enabled namespaces.
- [x] Wiki topic ids are filtered out of forum sorted-topic discovery through
  `filter:topics.updateRecent` and `filter:topics.filterSortedTids`.
- [x] Existing wiki topic ids are removed from `topics:recent` during plugin
  startup so direct recent-set consumers are less likely to leak wiki topics.
- [x] Wiki topic ids are filtered out of unread lists and unread-count buckets
  through `filter:topics.getUnreadTids`.
- [x] Wiki post ids are filtered out of main forum search result rendering
  through `filter:search.inContent`.
- [x] Wiki topics/posts are filtered from bundled dbsearch indexing through
  `filter:search.indexTopics` and `filter:search.indexPosts`.
- [x] Live server check confirmed wiki posts no longer appear in Recent.
- [x] Live server check confirmed wiki posts no longer appear in main forum
  search.

## Pending Steps Ledger

- [x] Highest priority: implement the human-readable namespace/page path
  resolver and canonical route refactor before expanding wiki-owned search,
  wiki history, or additional feed/API follow-ups.
- [x] Add `lib/wiki-paths.js` with canonical namespace/page path construction,
  path resolution, reserved segment handling, and collision detection.
- [x] Add canonical clean wiki routes and convert existing ID-based wiki article
  and category routes into redirects for normal page requests.
- [x] Move serializers, breadcrumbs, internal links, redlinks, compose
  redirects, sidebar links, and namespace compose search results onto canonical
  wiki paths.
- [x] Expand the namespace compose search into a reusable wiki link
  autocomplete helper that supports forum composer canonical links and wiki
  composer internal links.
  - [x] Server-side helper/API exists and supports `forum` and `wiki`
    `insertText`.
  - [x] Namespace-local wiki compose picker uses the helper.
  - [x] Forum composer toolbar picker uses the helper and inserts canonical
    Markdown links.
- [x] Add operational scripts or documented manual checks.
- [x] Restart the live NodeBB server after deploying the forum/wiki feed
  separation hook changes in `plugin.json`.
- [-] Manually verify `/recent`, `/top`, `/popular`, `/unread`, header unread
  count, and main `/search` on the live server with at least one normal topic
  and one wiki topic.
  - [x] `/recent` no longer shows wiki posts.
  - [x] Main `/search` no longer returns wiki posts.
  - [ ] `/top`, `/popular`, `/unread`, and header unread count still need live
    confirmation.
- [ ] If dbsearch is the live search provider, run a search reindex when
  convenient so wiki content is removed from the stored search index, not only
  filtered from result rendering.
- [ ] Decide whether `/api/recent/posts` and `/recentposts.rss` need a NodeBB
  core hook or separate wrapper to filter recent post summaries from wiki
  categories.
- [ ] Add live socket filtering for wiki bot page creation so wiki-backed
  `event:new_post` / `event:new_topic` fanout does not create transient header
  unread badge popups for online users.
- [ ] Continue wiki-owned search work only through the active path/tree
  contracts and current search services under `/wiki/search` and
  `/api/v3/plugins/westgate-wiki/search`.
- [x] The pre-cutover clean-path pass updated the existing namespace compose
  search to share link and privilege-safe result serialization with the wiki
  link autocomplete service.
- [x] Add resolver fixture tests for canonical namespace construction,
  namespace collisions, reserved segments, duplicate page slug leaves, and
  namespace/page path collisions.
- [x] Surface namespace clean-path setup diagnostics in the ACP.
- [x] Reject duplicate/reserved/colliding clean wiki page titles in wiki
  create/edit flows.
- [ ] Verify the plugin in a live NodeBB development instance.
- [-] Implement the Westgate theme alignment plan in
  `nodebb-theme-westgate/scss/westgate/_wiki-prose.scss`, using this plugin's
  existing `--wiki-*` hooks and semantic classes.
  - [x] Added a neutral `--wiki-compose-editable-focus-shadow` hook in
    `public/wiki-article-body.css` so themes can own CKEditor editable focus
    styling.
  - [x] Expanded `nodebb-theme-westgate/scss/westgate/_wiki-prose.scss` to
    style wiki page, namespace, sidebar/TOC, status, card, floating action, and
    compose/editor surfaces through the plugin's existing semantic classes.
  - [x] `npm test` passes in this plugin.
  - [x] `./nodebb build` succeeds in `/home/vicky/Projects/nodebb-dev/forum`.
  - [-] Local anonymous Playwright smoke checks passed for `/wiki`,
    `/wiki/30/big-test-1`, mobile `/wiki/30/big-test-1`, and `/categories`.
    Authenticated CKEditor visual validation remains pending because
    `/wiki/edit/30` redirects to login in the test session.
  - [x] Follow-up editor pass tightened wiki composer CKEditor button theming
    in `nodebb-theme-westgate/scss/westgate/_wiki-prose.scss`: toolbar
    buttons, split buttons, text buttons, color/input-color buttons, dropdown
    panel buttons, dialog buttons, hover/focus/on/disabled states, icon fill,
    and body-mounted CKEditor panel variables now use Westgate dark/gold
    styling instead of CKEditor's light defaults.
  - [x] `./nodebb build` still succeeds after the editor button pass.
  - [ ] Authenticated visual validation still needs to confirm the hover/on
    state shown in the reported composer screenshot no longer flashes a light
    button background.
  - [x] Follow-up source/code block pass updated
    `nodebb-theme-westgate/scss/westgate/_wiki-prose.scss` so CKEditor source
    editing areas use dark Westgate editor colors and wiki code blocks render
    as raised dark wells with gold-edged borders, themed code text, and dark
    language labels.
  - [x] `./nodebb build` still succeeds after the source/code block pass.
  - [ ] Authenticated visual validation still needs to confirm source editing
    mode and code block widgets in the composer no longer use light/Harmony
    defaults.
  - [x] Follow-up CKEditor popup pass updated the Westgate theme selectors for
    the insert-table grid and emoji picker so popup cells, labels, search
    fields, category buttons, and hover/focus states stay on dark Westgate
    panel colors instead of CKEditor's light/default floating text.
  - [x] `./nodebb build` still succeeds after the popup theming pass.
  - [x] Follow-up color-grid pass excluded CKEditor color selector tiles from
    the generic dark popup button overrides so marker/font color swatches keep
    their actual colors while still using Westgate focus rings and labels.
  - [x] `./nodebb build` still succeeds after the color-grid pass.
  - [x] Follow-up article media pass updated `public/wiki-article-body.css`
    with neutral image figure hooks and shrink-to-content centered figure
    layout so captions stay contained with their images, while direct
    article-child image paragraphs are centered without interfering with custom
    div/flexbox image layouts.
  - [x] `npm test` and `./nodebb build` still succeed after the article media
    pass.
  - [x] Follow-up article container pass tightened
    `nodebb-theme-westgate/scss/westgate/_wiki-prose.scss` so the article body
    card, sidebar table of contents, and sidebar navigation panels resolve to
    the same Westgate velvet surface, border, radius, shadow, and font stacks
    used by forum category containers.
  - [x] Local Playwright computed-style check confirmed the wiki body, TOC,
    and navigation cards match the forum category container surface tokens.
  - [x] Follow-up CKEditor form/dialog pass added global wiki-composer rules
    for body-mounted CKEditor forms plus explicit find/replace overrides so
    headers, labels, counters, inputs, placeholders, disabled states, and action
    buttons inherit Westgate dark panels and UI fonts.
  - [x] `./nodebb build` still succeeds after the CKEditor form/dialog pass.
  - [ ] Authenticated visual validation still needs to confirm CKEditor
    body-mounted popups inside the wiki composer match the reported table and
    emoji picker screenshots.

## Agent Execution Order

When an agent starts work in this repo:

1. Read the current guide and required contract stack at the top of this file.
2. Route canonical path/tree/index/topdata work through
   [CANONICAL_WIKI_PATH_TREE_IMPLEMENTATION_ENTRYPOINT_PLAN.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_PATH_TREE_IMPLEMENTATION_ENTRYPOINT_PLAN.md).
3. For editor work, inspect the current Tiptap source, sanitizer, saved HTML
   contract, editor tests, and any focused Superpowers plan before editing.
4. For feed/search/history follow-up, use the future-work sections above only
   after checking whether a newer focused contract or plan supersedes them.
5. Update the current guide near the top when repository authority changes;
   label historical notes instead of allowing them to become active by
   accident.

## Initialization Completion Record

Initialization is already complete. The record remains useful because it
explains the baseline now assumed by later roadmaps:

- The plugin no longer relies on hard-coded wiki category IDs.
- `/wiki` is configuration-driven and resilient.
- Route logic is modular enough to support growth.
- Wiki article, namespace, authoring, ACP, editor, search helper, and test
  surfaces exist.
- Manual verification steps are documented and usable.
- Namespace configuration and navigation are manageable without hand-editing
  IDs.

Future definition-of-done criteria belong in the contract or focused plan for
the work being implemented.
