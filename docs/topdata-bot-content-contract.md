# Topdata Bot Content Contract

This contract freezes the storage/API expectations used by the Shadows Over
Westgate topdata wiki deployer.

## Storage Format

Wiki article bodies are stored as sanitized HTML in the first NodeBB post for
the topic. Tiptap JSON is editor-internal state, not the deployed persistence
format.

Generated pages may begin with `sow-topdata-wiki` HTML marker comments. The
wiki plugin must still detect those posts as stored HTML so NodeBB does not run
them through normal Markdown escaping before article rendering.

The create and edit API body field for generated article content is `content`.
The plugin compose path also mirrors sanitized HTML into `sourceContent` where
that is needed for NodeBB edit compatibility, but bot deploys should treat
`content` as the required body field for `POST /api/v3/topics` and
`PUT /api/v3/posts/{pid}`.

## Save Filters

Plugin save validation sanitizes wiki main-post HTML when NodeBB create/edit
data flows through the plugin's topic/post validation hooks. Direct
`PUT /api/v3/posts/{pid}` edits must continue to be verified against those
hooks during live migration because NodeBB API wiring can vary by version and
installed plugin order.

## Generated HTML Subset

The topdata bot may generate:

- HTML comments for `sow-topdata-wiki` page, managed-region, and manual-region
  markers.
- `h1` through `h6`.
- `p`, `ul`, `ol`, `li`.
- `table`, `tbody`, `tr`, `th`, and `td`.
- `a` links with safe `href` values when needed.
- Plain text `[[...]]` Westgate wiki-link markers.
- Status callouts using `class="wiki-callout wiki-callout--status"`.

The generated subset must not use DokuWiki syntax, Markdown comment markers,
unsafe inline event handlers, scripts, iframes, or raw editor-only Tiptap JSON.

During the canonical title-path cutover, generated page markers must keep
topdata page identity separate from public wiki paths. Old stored marker rows
may still carry `wiki_slug=...`; migration reporting must detect them and new
runtime routing must not use them as canonical public path overrides.

New generated page-to-page `[[...]]` markers must target canonical title-path
wiki addresses emitted by the aligned toolkit, not lowercase dash slug leaves,
typed topdata page IDs, or generated dataset key fragments. The authoritative
cross-cutover requirements live in:

- [HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/HARDLINE_WIKI_PATH_STANDARDIZATION_CONTRACT.md)
- [CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/CANONICAL_WIKI_PATH_TREE_AND_TOPDATA_ALIGNMENT_CONTRACT.md)

Until toolkit generation and live stored pages are migrated together, this
document describes storage and sanitizer shape only. It does not authorize old
slug marker compatibility in the new resolver.

## Archive Boundary

The planned wiki archive subsystem may preserve topdata marker comments as part
of exported first-post article HTML and report generated provenance state where
the archive schema needs it. That preservation does not turn topdata page ids,
managed-region marker hashes, old `wiki_slug` marker values, or generated
deploy metadata into archive page matching or public destination path
authority.

Archive import/export must keep this storage contract separate from portable
archive identity and canonical public path placement. Its authority lives in:

- [WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md)
- [WIKI_IMPORT_EXPORT_ARCHIVE_IMPLEMENTATION_ENTRYPOINT_PLAN.md](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/WIKI_IMPORT_EXPORT_ARCHIVE_IMPLEMENTATION_ENTRYPOINT_PLAN.md)

## Fixture

```html
<!-- sow-topdata-wiki:page=feat:power_attack -->
<!-- sow-topdata-wiki:managed:start hash="sha256:fixture" -->
<h1>Power Attack</h1>
<p class="wiki-callout wiki-callout--status">This feat has been altered from vanilla.</p>
<table>
  <tbody>
    <tr><th>Type</th><td>Combat feat</td></tr>
    <tr><th>Required Feats</th><td>[[Cleave]]</td></tr>
  </tbody>
</table>
<!-- sow-topdata-wiki:managed:end -->
<!-- sow-topdata-wiki:manual:start id="user_bottom" -->
<p></p>
<!-- sow-topdata-wiki:manual:end id="user_bottom" -->
```
