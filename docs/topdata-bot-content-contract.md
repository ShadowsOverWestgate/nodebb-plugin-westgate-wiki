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

Generated wiki-link markers may use typed topdata page IDs such as
`[[feat:brew:potion]]` or `[[class:fighter]]`. The wiki plugin resolves the
first segment against configured wiki namespaces, including simple singular or
plural aliases, then resolves the remaining colon-separated value as the target
page slug/title inside that namespace. Existing generated content therefore may
keep typed page IDs while public article links render to canonical wiki paths
such as `/wiki/feats/brew-potion`.

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
