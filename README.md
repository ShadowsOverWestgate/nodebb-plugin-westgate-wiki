# Westgate Wiki Plugin

`nodebb-plugin-westgate-wiki` adds a wiki surface to NodeBB without introducing a second content system. It treats selected NodeBB categories as wiki namespaces and topics inside those categories as wiki pages.

The plugin is deliberately wiki-first in presentation, but it still relies on NodeBB categories, topics, permissions, routing, and the core topic APIs for persistence.

## License

This plugin is distributed under **GPL-3.0-or-later**. The wiki compose flow uses a vendored **Tiptap** bundle built from open-source packages. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `public/vendor/tiptap/`.

## Content Model

- Configured categories are wiki namespaces.
- Topics inside those categories are wiki pages.
- The first post is the canonical wiki article body.
- `/wiki/{namespace path}/{page slug}` is the canonical wiki view.
- `/topic/:slug` remains the discussion thread for the same underlying content.
- NodeBB category permissions remain the source of truth for who can view and create pages.

## What It Currently Does

- Renders a wiki landing page at `/wiki`
- Renders namespace pages at `/wiki/category/:category_id/:slug?`
- Renders wiki article pages at canonical `/wiki/...` namespace/page paths
- Lets admins select wiki namespaces from ACP instead of hand-editing raw IDs
- Optionally includes descendant categories automatically as nested namespaces
- Shows ancestor breadcrumbs and namespace-local navigation
- Exposes `Create Page` and redlink flows via **`/wiki/compose/:cid`** using a plugin-owned **Tiptap** rich editor, including **Paste Markdown**, slash commands, wiki callouts, server-backed image upload to NodeBB’s **`POST /api/post/upload`**, and paste/drop image handling
- Optional namespace topic search API: **`GET /api/v3/plugins/westgate-wiki/namespace/:cid/search?q=`** for the compose “insert wiki link” helper
- Supports first-pass internal wiki links:
  - `[[Page Title]]`
  - `[[Child Namespace/Page Title]]`
  - `[[Root Namespace/Child Namespace/Page Title]]`
  - `[[Target|Custom Label]]`
- Treats unresolved internal links as wiki redlinks that open prefilled page creation in the target namespace
- **Create child namespace** from the wiki (see below), backed by **`POST /api/v3/plugins/westgate-wiki/namespace`** (new categories are always created under an existing wiki namespace, not as forum root categories). **Wiki article pages** show a fixed **floating icon dock** (Font Awesome + native `title` tooltips) for **Edit**, **Discuss**, and **Remove** when permitted—no layout column, and no “new page” / “new namespace” there. **Namespace listing pages** use the same floating pattern for **new page** and **new namespace** when permitted.

## How To Use It

1. Install and activate the plugin in a NodeBB instance.
2. Open `ACP > Plugins > Westgate Wiki`.
3. Select the categories that should behave as wiki namespaces.
4. Decide whether descendant categories should automatically count as wiki namespaces.
5. (Optional) Under **Groups allowed to create wiki namespaces**, choose which NodeBB groups may create **child** namespaces from the wiki. **Administrators** always may; if no groups are selected, only administrators can use **Create child namespace**. If you edit the stored list manually, separate group names with commas or newlines, not spaces.
6. Visit `/wiki`.

### Creating child namespaces from the wiki

- On a **namespace** page (`/wiki/category/...`), use the **folder** icon in the floating dock (same as opening `/wiki/namespace/create/:parentCid`). The new NodeBB category is created **under** the current wiki category, and **category privileges are copied from that parent** (`cloneFromCid`) so group-based locks on the parent apply to the child.
- Additional **root** wiki namespaces (top-level forum categories) are not created from the wiki on purpose: configure one (or more) top-level wiki categories in the ACP and nest everything else beneath them.
- If **Automatically include descendant categories** is **off**, each new child is also appended to the configured category list so it stays visible in the wiki.

Delegated namespace creators (non-administrators in the ACP allowlist) can create real NodeBB categories through these flows only after the plugin’s gate passes; treat the allowlist as a sensitive capability.

### Troubleshooting

- **Create namespace on the wiki, then hard-refresh if needed:** The create form binds to `submit` on the document so it works under ajaxify. If you still see a stale script after upgrading the plugin, run `./nodebb build` and hard-refresh the browser.
- **Admin “Create a Category” vs wiki namespaces:** The ACP modal’s parent picker loads categories from NodeBB’s category search (by default it does **not** treat outbound **link** categories like normal parents). If your “Wiki” row is a **link-only** category (it jumps to `/wiki` instead of listing topics), it may **not appear** as a parent there. That does not block the wiki plugin: use **Create child namespace** on the wiki while viewing a real wiki-backed category, or create the child under a normal parent category in ACP and then enable it in **Plugins → Westgate Wiki** if needed.

Practical structure:

- top-level configured categories: top-level wiki namespaces
- configured child categories: nested namespaces
- topics inside a namespace category: pages in that namespace

If you want some wiki areas to be restricted, use normal NodeBB category privileges for those categories. The plugin respects them.

## Authoring Notes

Wiki pages are still NodeBB topics. That means:

- creating a page uses the wiki compose editor and **`POST /api/v3/topics`** (same data model as the forum composer)
- editing article content still means editing the first post (compose editor is create-only for now)
- discussion replies still live in the underlying topic thread

Internal links are resolved against wiki namespaces, not forum routes. Missing targets become redlinks. Clicking a redlink opens a prefilled page create flow in the target namespace.

Wiki page slugs are derived from titles with the same normalization used by the
topdata wiki generator: lowercase ASCII letters and numbers, accented Latin
text normalized to ASCII where possible, common Latin characters such as `Æ`,
`Œ`, `Ø`, `ß`, `Þ`, `Ł`, and `Đ` expanded, symbols and separator punctuation
collapsed to `-`, and quote/apostrophe punctuation dropped inside words so
possessives such as `Grandmaster's` resolve as `grandmasters`.

## Development

### Repository Shape

The plugin is intentionally split by responsibility:

- [library.js](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/library.js): plugin entrypoint and exported service surface
- [routes/wiki.js](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/routes/wiki.js): wiki route registration
- [lib/config.js](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/lib/config.js): settings loading and effective namespace expansion
- [lib/wiki-service.js](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/lib/wiki-service.js): namespace retrieval and serialization preparation
- [lib/topic-service.js](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/lib/topic-service.js): wiki page retrieval
- [lib/wiki-links.js](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/lib/wiki-links.js): internal wiki link parsing and redlink generation
- [lib/serializer.js](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/lib/serializer.js): wiki path and view-model shaping
- [templates/](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/templates): wiki-facing templates
- [public/wiki.js](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/public/wiki.js): client-side create-page and redlink behavior
- [public/wiki.css](/home/vicky/Projects/nodebb-dev/nodebb-plugin-westgate-wiki/public/wiki.css): wiki shell layout + optional `--wiki-chrome-*` hooks (Bootstrap defaults when unset)

### Styling and theme hooks

The plugin ships **layout** and **Bootstrap-aligned defaults** only. The active NodeBB theme supplies brand colors, typography, and panel chrome by setting CSS custom properties on `:root` or `#content` (child themes: import SCSS after your design tokens).

- **`public/wiki.css`** (from `plugin.json` `css`): scopes to `.westgate-wiki`, handles grid/sidebar structure, and documents **shell** variables in the header comment. Read views use Bootstrap **`card` / `card-body`** so surfaces inherit normal forum card styling when variables are not set.
- **`public/wiki-article-body.css`** (served at **`/westgate-wiki/compose/article-body.css`** on article and compose routes): **article prose** (`--wiki-prose-*`) and **compose editable** (`--wiki-compose-editable-*`). The Tiptap toolbar/surface chrome ships through `public/vendor/tiptap/wiki-tiptap.css`.

**Shell (wiki chrome):** `--wiki-chrome-surface-bg`, `--wiki-chrome-surface-border`, `--wiki-chrome-radius`, `--wiki-chrome-heading-color`, `--wiki-chrome-page-title-font-family`, `--wiki-chrome-muted-color`, `--wiki-chrome-link-color`, `--wiki-chrome-link-hover-color`, `--wiki-chrome-hero-bg`, `--wiki-chrome-accent-color`, `--wiki-chrome-warning-border`, `--wiki-chrome-danger`, `--wiki-chrome-danger-hover`, `--wiki-redlink-color`, `--wiki-redlink-decoration`, `--wiki-redlink-underline-offset`, `--wiki-redlink-border-color`, `--wiki-redlink-action-color`. **Legacy article panel:** `--wiki-panel-bg` and `--wiki-panel-border-color` are checked first for the article card and otherwise fall back through `--wiki-chrome-*` to Bootstrap card tokens.

### Exposed Service Surface

The plugin entrypoint exposes reusable internals through `require("nodebb-plugin-westgate-wiki").services`:

- `config`
- `serializer`
- `topicService`
- `wikiLinks`
- `wikiService`

That is useful if another local plugin or future extension wants to inspect namespace behavior without duplicating the logic.

### Local Workflow

From the plugin directory:

```bash
npm install
npm run build:editors
npm test
```

`npm test` now also runs a jsdom-backed client contract suite for the Tiptap
editor extraction work, covering normalization, unsupported-content detection,
client sanitization, and media/image extension round-trip behavior.

The Tiptap bundle is written to `public/vendor/tiptap/`. Commit those artifacts or rebuild after dependency upgrades.

From the NodeBB instance:

```bash
./nodebb build
```

Restart NodeBB after changing any of these:

- `plugin.json`
- server-side route registration
- hook registration
- plugin initialization logic

Rebuild is enough for:

- templates
- client-side JS
- CSS

### Manual Verification

Check these flows after meaningful changes:

1. `/wiki` renders only configured top-level namespaces.
2. Namespace pages show child namespaces and recent pages.
3. Wiki article pages render the first post as article content.
4. `Create Page` opens `/wiki/compose/:cid` and a successful publish redirects to the canonical `/wiki/...` article path.
5. `Create Sibling Page` still opens the compose route with the sibling namespace `cid` when linked from the article template.
6. Existing `[[...]]` links resolve to `/wiki/...`.
7. Missing `[[...]]` links are styled as redlinks and open creation in the correct namespace.
8. Nested namespace links resolve correctly when written as full paths or unique suffix paths.
9. Namespace visibility matches NodeBB category privileges.

## Troubleshooting

- `/wiki` is empty:
  The selected categories may be empty, unreadable to the current user, or invalid.
- A namespace page 404s:
  Confirm the category is included in the effective wiki namespace set and the URL uses the current category slug.
- A wiki article 404s:
  Confirm the topic belongs to an effective wiki namespace.
- Redlinks look normal:
  The running NodeBB instance is likely serving stale client assets. Rebuild and restart the live process.
- Redlinks open the namespace page but not the compose editor:
  The live process likely did not pick up the new client script or route/template state. Rebuild and restart the actual process serving the site.
- Changes do not appear:
  Rebuild NodeBB assets, then restart the process if the change is server-side or initialization-related.
- Wiki compose scripts/CSS fail to load:
  Rebuild the vendored editor bundle from the plugin repo with **`npm run build:editors`**, confirm `public/vendor/tiptap/` exists in the installed plugin copy, then rerun **`./nodebb build`** in NodeBB.
- Wiki compose still looks like plain Bootstrap:
  Article typography lives in **`/westgate-wiki/compose/article-body.css`**. The Tiptap toolbar/surface chrome lives in **`/westgate-wiki/compose/editor.css`**. Confirm both return **200** in the network tab after **`./nodebb build`** and a process restart. Child themes should set **`--wiki-prose-*`**, **`--wiki-compose-*`**, **`--wiki-editor-*`**, and **`--wiki-chrome-*`** for full parity.
- **127.0.0.1 vs localhost**: open the forum using the same host as **`url` in `config.json`**. Mixing them breaks websockets, CORP on some plugin assets, and CSRF/session expectations.
