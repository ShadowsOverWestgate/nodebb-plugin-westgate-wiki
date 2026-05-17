# Tiptap Infoboxes Design

Date: 2026-05-17

## Summary

Add first-class infobox authoring to the Westgate wiki Tiptap editor.
Infoboxes are wiki-style right-aligned containers that hold their own local
title, subtitle, image, sections, key/value rows, and freeform content. They
are part of article content but their internal headings are not article
sections and must never appear in article or editor tables of contents.

The product shape is a flexible hybrid: the main editor inserts an infobox
quickly, and the active infobox exposes local tools for building its internal
layout. The saved HTML remains stable enough to copy from source view and paste
into another wiki article.

## Goals

- Provide an easy infobox insertion tool for wiki authors.
- Keep infoboxes flexible enough for character pages, locations, factions,
  items, events, mechanics, and other wiki article types.
- Save infoboxes as explicit plugin-owned HTML that survives sanitizer,
  source editing, copy/paste, Tiptap parsing, save, and reopen.
- Float infoboxes to the right on desktop reading views without disturbing the
  surrounding text block flow.
- Render infoboxes as full-width blocks in source order on narrow reading
  viewports.
- Keep authoring desktop-only. The editor tools may assume a wide viewport,
  keyboard, and pointer.
- Exclude all infobox-local headings and title structures from rendered article
  ToC and editor ToC.
- Follow the existing custom extension pattern used by media rows, image
  figures, callouts, poetry quotes, alignment tables, and table authoring.

## Non-Goals

- Do not build a rigid template engine in the first version.
- Do not require one infobox per article at the schema level, even though the
  UX is optimized for one primary infobox near the top of the page.
- Do not add mobile authoring support for infobox editing tools.
- Do not move infoboxes around at render time. Mobile reading should preserve
  document source order.
- Do not expose arbitrary layout CSS, Flexbox/Grid controls, or unsafe style
  passthrough.
- Do not let toolbar code own the infobox schema or sanitizer policy.

## Authoring Model

The implementation adds a plugin-owned Tiptap block node named `wikiInfobox`,
saved as:

```html
<aside class="wiki-infobox" data-wiki-node="infobox">
  ...
</aside>
```

The infobox node is the stable boundary. Inside it, authors can use normal
editor content plus infobox-specific helper structures. The first version
supports these internal building blocks:

- Title
- Subtitle
- Image slot
- Section heading
- Key/value row
- Freeform content block
- Normal embedded tables, images, lists, links, and inline formatting

The main toolbar exposes one primary action: insert infobox. Slash commands
also expose infobox insertion for keyboard-driven authoring.

When selection is inside or on an infobox, the editor shows a vertical tool rail
hovering along the infobox's left edge. This rail follows the active visible
area of long infoboxes and provides infobox-local actions:

- Add title
- Add subtitle
- Add image slot
- Add section heading
- Add key/value row
- Add freeform block
- Move the active infobox helper block before or after a sibling helper block
- Delete the active infobox helper block
- Unwrap the infobox
- Delete the infobox

Slash commands inside an infobox should expose the same internal insertion
actions as a secondary path. The vertical rail is the discoverable workflow;
slash commands are the fast workflow.

## Saved HTML Contract

The saved HTML is the interoperability contract. Copying an infobox between
articles by copying source HTML should work:

1. The source editor shows stable infobox HTML.
2. The server sanitizer preserves the supported infobox wrapper, helper
   classes, data attributes, and safe inline attributes.
3. Tiptap normalization recognizes saved infobox HTML as plugin-owned content.
4. The editor reparses the infobox as `wikiInfobox`, not as `containerBlock`.
5. Saving and reopening does not manufacture extra wrappers or flatten the
   infobox into ordinary article blocks.

The first version should prefer explicit class/data contracts over fragile
style detection. Example target shape:

```html
<aside class="wiki-infobox" data-wiki-node="infobox">
  <div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene Voss</div>
  <div class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle">Vampire Noble</div>
  <figure class="wiki-infobox__image" data-wiki-infobox-part="image">
    <img src="/assets/uploads/example.png" alt="Selene Voss">
  </figure>
  <div class="wiki-infobox__section" data-wiki-infobox-part="section">Details</div>
  <dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">
    <div class="wiki-infobox__row" data-wiki-infobox-part="row">
      <dt>House</dt>
      <dd>Voss</dd>
    </div>
    <div class="wiki-infobox__row" data-wiki-infobox-part="row">
      <dt>Status</dt>
      <dd>Missing</dd>
    </div>
  </dl>
  <div class="wiki-infobox__content" data-wiki-infobox-part="content">
    <p>Optional freeform notes.</p>
  </div>
</aside>
```

The first version uses this helper tag contract. If implementation discovers a
specific Tiptap parsing constraint, the replacement must preserve the same
class/data contract and the same visible HTML semantics before the plan is
considered complete.

## ToC Behavior

Infobox-local headings are not article headings. They must never appear in:

- Rendered article ToC from `lib/wiki-page-toc.js`
- Editor ToC from `tiptap/src/toolbar/editor-toc.mjs`
- Any later ToC surface that scans article headings

The safest rule is structural exclusion: any heading-like element inside
`.wiki-infobox` or `[data-wiki-node="infobox"]` is ignored. This applies even if
copied or legacy HTML contains real `h2`, `h3`, or `h4` tags inside the
infobox.

## Rendering

Rendered article CSS lives in `public/wiki-article-body.css`.

Desktop reader behavior:

- Infobox floats right.
- Surrounding prose wraps around it.
- Width is bounded so prose keeps enough measure to remain readable.
- The visual treatment should match the Westgate wiki direction: dark velvet,
  restrained depth, muted gold borders and section accents, and readable
  contrast.

Narrow reader behavior:

- Infobox stops floating.
- Infobox becomes a normal full-width block.
- Infobox stays in document source order.
- There is no collapsed-by-default mobile summary and no client-side movement
  to force it near the title.

Editor CSS lives in `tiptap/src/wiki-editor.css`.

Editor behavior:

- Infobox renders close enough to final article output to be understandable.
- Selection/focus affordances make the active infobox obvious.
- The vertical rail is editor-only chrome and is not saved.
- Long infoboxes keep their local tool rail usable while editing.

## Architecture

Add a focused infobox extension rather than modeling infoboxes as generic
containers with classes.

Expected source responsibilities:

- `tiptap/src/extensions/wiki-infobox.mjs`
  - Owns `wikiInfobox` schema, parse/render behavior, commands, and internal
    helper insertion rules.
- `tiptap/src/wiki-editor-bundle.js`
  - Registers the extension, adds the main insert action, adds slash items, and
    mounts the vertical rail.
- `tiptap/src/toolbar/toolbar-schema.mjs`
  - Adds the top-toolbar button id and any infobox context button ids if the
    project keeps context tool ids centralized.
- `tiptap/src/normalization/legacy-html.mjs`
  - Preserves saved infobox HTML as plugin-owned structure and prevents it from
    being reparsed as `containerBlock`.
- `shared/wiki-html-sanitizer-config.json`
  - Allows the infobox wrapper and helper structures without permitting unsafe
    styles or scripts.
- `lib/wiki-page-toc.js`
  - Excludes heading matches inside infobox HTML.
- `tiptap/src/toolbar/editor-toc.mjs`
  - Excludes Tiptap heading nodes whose positions are inside `wikiInfobox`.
- `public/wiki-article-body.css`
  - Styles rendered infoboxes.
- `tiptap/src/wiki-editor.css`
  - Styles editor infoboxes and the vertical rail.

The bundle should wire UI lifecycle events, but the extension should own the
schema and commands. This keeps infoboxes aligned with the established editor
extension architecture.

## Compatibility And Normalization

Normalization must treat saved infoboxes as plugin-owned structures before
generic wrapper normalization runs. This mirrors the media-row rule that saved
plugin-owned structures must not become generic container blocks on reopen.

Normalize only these safe pasted infobox patterns in the first version:

- `<aside class="infobox">` becomes
  `<aside class="wiki-infobox" data-wiki-node="infobox">`.
- Direct children with classes `title`, `subtitle`, `image`, `section`, `rows`,
  `row`, or `content` gain the matching `wiki-infobox__*` class and
  `data-wiki-infobox-part` value.
- Unsupported scripts, embeds, layout styles, and unsafe attributes are
  stripped by the existing sanitizer pipeline.

Ambiguous pasted markup should remain normal content or fall back to the
existing unsupported-content behavior rather than silently inventing a broken
infobox.

## Testing

Use test-driven development. Required automated coverage:

- Sanitizer preserves supported infobox wrapper, helper classes, `data-wiki-node`
  and `data-wiki-infobox-part` attributes.
- Sanitizer strips unsafe styles and event handlers from infobox content.
- `normalizeLegacyHtmlForTiptap` preserves saved infobox HTML as plugin-owned
  structure.
- `containerBlock` does not capture saved infobox wrappers.
- `wikiInfobox` parses and renders the saved HTML contract.
- Insert command creates a valid starter infobox.
- Internal commands insert title, subtitle, image slot, section heading,
  key/value row, and freeform block.
- Unwrap command replaces the infobox with its child content.
- Delete command removes the selected infobox without deleting surrounding
  article content.
- Source HTML copied from one editor instance can be pasted into another editor
  instance and reopen as `wikiInfobox`.
- Rendered article ToC excludes headings and heading-like content inside
  infoboxes.
- Editor ToC excludes headings inside `wikiInfobox`.
- Article CSS contains desktop float and narrow full-width behavior.
- Editor CSS contains selected-infobox affordances and vertical rail behavior.
- Vendored Tiptap bundle and CSS match source after rebuild.

Manual/browser validation:

- Insert a starter infobox near the top of an article.
- Add every supported internal block through the vertical rail.
- Add internal blocks through slash commands.
- Place a table and image inside an infobox.
- Save, view, edit, and reopen the article.
- Copy infobox source HTML to another article and confirm it reparses as an
  editable infobox.
- Confirm article ToC and editor ToC ignore all infobox-local headings.
- Check desktop reading view with text wrapping around the right-floated
  infobox.
- Check narrow reading view where the infobox is full-width in source order.

## Rollout

Implement in phases:

1. Schema, sanitizer, normalization, and ToC exclusion contract.
2. Basic insertion, rendered CSS, save/reopen, and source copy/paste.
3. Vertical rail and internal insertion tools.
4. Polish for selection affordances, long-infobox rail positioning, and source
   editor formatting.

The primary risk is contract drift between editor schema, sanitizer,
normalization, saved HTML, rendered CSS, and ToC extraction. Treat infoboxes as a
full saved-content contract, like tables and media rows, not as toolbar sugar.
