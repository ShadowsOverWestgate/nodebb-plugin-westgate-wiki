---
name: Westgate Wiki Plugin
description: Theme-neutral wiki chrome for NodeBB, restyled entirely through CSS custom-property contracts
colors:
  scrim: "rgba(15, 23, 42, 0.5)"
  scrim-strong: "rgba(15, 10, 24, 0.74)"
  editor-night: "#111827"
  editor-ink: "#e5e7eb"
  editor-ash: "#94a3b8"
  editor-rose: "#f472b6"
  callout-slate: "#443b49"
  callout-parchment: "#ece7df"
  code-keyword-gold: "#d9b76f"
  code-string-moss: "#9fca92"
  code-comment-dusk: "#8f8298"
typography:
  body:
    fontFamily: "var(--bs-body-font-family)"
    fontSize: "1rem"
    lineHeight: 1.68
  headline:
    fontFamily: "var(--bs-heading-font-family)"
    fontSize: "1.85rem"
  title:
    fontFamily: "var(--bs-heading-font-family)"
    fontSize: "1.55rem"
  subtitle:
    fontFamily: "var(--bs-heading-font-family)"
    fontSize: "1.3rem"
  subheading:
    fontFamily: "var(--bs-heading-font-family)"
    fontSize: "1.15rem"
  ornament:
    fontFamily: "var(--wiki-prose-quote-ornament-font-family, Georgia, serif)"
    fontSize: "2.4rem"
  compact:
    fontFamily: "var(--bs-body-font-family)"
    fontSize: "0.9375rem"
  small:
    fontFamily: "var(--bs-body-font-family)"
    fontSize: "0.875rem"
  meta:
    fontFamily: "var(--bs-body-font-family)"
    fontSize: "0.8125rem"
  micro:
    fontFamily: "var(--bs-body-font-family)"
    fontSize: "0.75rem"
    letterSpacing: "0.04em"
  code:
    fontFamily: "var(--bs-font-monospace)"
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  pill: "999px"
components:
  panel:
    backgroundColor: "var(--wiki-chrome-surface-bg, var(--bs-card-bg))"
    rounded: "{rounded.md}"
  footnote-popover:
    backgroundColor: "var(--bs-body-bg)"
    rounded: "{rounded.md}"
---

# Design System: Westgate Wiki Plugin

## 1. Overview

**Creative North Star: "The Unfurnished Library"**

Sound structure, good light, empty walls: a reading room built to be furnished by whichever theme moves in. The plugin owns layout, hierarchy, and reading rhythm; it deliberately owns almost no color. Every visual decision routes through a three-tier fallback — `var(--wiki-chrome-*, var(--bs-*, literal))` — so the same markup is complete on stock Bootstrap 5, on NodeBB Harmony, and fully re-skinned under `nodebb-theme-westgate`. The plugin must never reference a theme; themes opt in by setting tokens.

The system rejects the three anti-references named in PRODUCT.md: it must never read as a generic forum topic view, as heavy docs-site chrome, or as Fandom/wikia clutter. Content is always louder than chrome.

**Key Characteristics:**
- Quiet and structural: nothing decorative; every element earns its border.
- ~100-token override contract in three families: `--wiki-chrome-*` (shell), `--wiki-prose-*` (article body), `--wiki-redlink-*` (missing-page links).
- Flat surfaces; shadows only on things that literally float.
- Reading-first: 1rem/1.68 prose, restrained heading scale, TOC and links tuned for lookup speed.

## 2. Colors

The plugin's own palette is intentionally near-empty: Bootstrap semantic variables carry the interface, and the few literal colors it owns belong to self-contained dark surfaces that must work on any theme.

### Primary
- Inherited. Accents, links, and focus rings resolve to `var(--bs-primary)`, `var(--bs-link-color)`, and `var(--bs-focus-ring-color)` unless a theme sets `--wiki-chrome-accent-color` / `--wiki-chrome-link-color`.

### Neutral
- Inherited. Text, surfaces, and borders resolve to `--bs-body-color`, `--bs-card-bg`, `--bs-tertiary-bg`, `--bs-border-color` through the `--wiki-chrome-*` layer.
- **Overlay Scrim** (rgba(15, 23, 42, 0.5)) and **Strong Scrim** (rgba(15, 10, 24, 0.74)): the only owned neutrals; backdrops for drawers, fullscreen history, and dialogs. Override via `--wiki-scrim` / `--wiki-scrim-strong`.

### Owned dark surfaces (theme-independent by design)
- **Editor Night** (#111827) with **Editor Ink** (#e5e7eb), **Editor Ash** (#94a3b8), **Editor Rose** accent (#f472b6): the CSS-source editor is a deliberately dark, self-contained surface on every theme; overridable via `--wiki-chrome-editor-*`.
- **Code token palette** (19 muted hues on a dark well: keyword gold #d9b76f, string moss #9fca92, comment dusk #8f8298, ...): syntax colors need contrast more than branding; overridable via `--wiki-code-token-*`.
- **Callout Slate** (#443b49) with **Callout Parchment** text (#ece7df): article callout panels, via `--wiki-callout-*`.

### Named Rules
**The Three-Tier Rule.** Every color in plugin CSS is written `var(--wiki-*, var(--bs-*, literal))`. A bare literal color outside the owned dark surfaces is a defect. A reference to any theme-specific variable (e.g. `--wg-*`) is forbidden.

**The Tenant's Rule.** The plugin never sets a token a theme is meant to own; themes never need to touch plugin selectors — tokens only.

## 3. Typography

**Display Font:** inherited (`--bs-heading-font-family`)
**Body Font:** inherited (`--bs-body-font-family`)
**Mono Font:** inherited (`--bs-font-monospace`)

**Character:** No opinion of its own — the wiki speaks in the host theme's voice. What the plugin does own is scale and rhythm, tuned for long-form reference reading.

### Hierarchy
- **Headline / article h1** (1.85rem): page titles; overridable via `--wiki-prose-h1-size`. Inside the article body, an author-written h1 renders at the h2 slot — the page header owns the only full-size h1.
- **Title / article h2** (1.55rem), h3 (1.3rem), h4 (1.15rem): section structure, each with a `--wiki-prose-h*-size` hook. Chrome headings (index titles, dialog titles, subsection cards) reuse the h3/h4 steps; they never invent sizes between steps.
- **Body** (1rem, line-height 1.68): article prose; the generous leading is the reading-room signature. Prose flow is capped at a reading measure of 70ch (`--wiki-prose-measure`); tables, code wells, media, and infoboxes may run full width.
- **Compact** (0.9375rem): dense UI text — TOC links, card links, section stats, dialog paths.
- **Small** (0.875rem): metadata rows, breadcrumbs, leads, captions, footnotes.
- **Meta** (0.8125rem): secondary metadata, jump links, disclosure summaries, FAB labels.
- **Micro** (0.75rem, letter-spacing 0.04–0.06em when uppercase): badges, drawer-tab labels, compare labels. The only tier that may pair tracking with uppercase, and only on plugin-owned labels — never on author content.
- **Code** (mono): inline code and pre blocks on the dark code well.

### Named Rules
**The Author's Casing Rule.** Headings, TOC labels, and titles render exactly as written. No JS or CSS recasing, ever.

**The Four-Tier Chrome Rule.** UI chrome text uses exactly four sub-body sizes — 0.9375 / 0.875 / 0.8125 / 0.75rem. A font-size between or below these steps is drift, not nuance.

## 4. Elevation

Flat by doctrine: surfaces are distinguished by 1px borders (`--bs-border-color`) and background tints (`--bs-tertiary-bg`), never by resting shadows. `box-shadow` is reserved for elements that literally float above the page — the footnote popover, article drawers, the FAB dock, and fullscreen dialogs — and defaults to `var(--bs-box-shadow)` so themes control its weight.

### Named Rules
**The Floating-Only Rule.** If it doesn't overlap other content, it doesn't get a shadow.

## 5. Components

Quiet and structural throughout: controls read as infrastructure, and the wiki-specific affordances are the only signatures.

### Panels / Containers
- **Corner Style:** gently rounded (`--wiki-chrome-radius`, default 0.375rem).
- **Background:** `--wiki-chrome-surface-bg` → `--bs-card-bg`.
- **Border:** 1px `--wiki-chrome-surface-border` → `--bs-card-border-color`.
- **Shadow Strategy:** none at rest (see Elevation).

### Buttons
- Bootstrap buttons as-is; danger actions use `--wiki-chrome-danger` → `--bs-danger`. No custom button system.

### Inputs / Fields
- Bootstrap form controls; focus uses `--bs-focus-ring-color`. The CSS-source editor is the one custom input: a dark mono `<textarea>` surface on `--wiki-chrome-editor-*` tokens.

### Redlinks (signature)
- Links to missing pages: colored via `--wiki-redlink-color` with its own decoration/offset tokens. The classic wiki affordance — must stay visually distinct from normal links on every theme.

### Callouts (signature)
- Full-border slate panels with an icon well and a parchment text tone (`--wiki-callout-*`). Accent is carried by background and icon, not by a side stripe.

### Article drawers / TOC
- Below 1200px: off-canvas panels over the scrim tokens; TOC is a plain link list whose labels keep author casing (The Author's Casing Rule).
- At ≥1200px the Contents panel docks open in the right margin: in-flow, sticky (`--wiki-chrome-toc-top`, default 5rem), width `--wiki-chrome-toc-width` (default 16rem), 1px border, no shadow (The Floating-Only Rule — docked panels don't float). The PAGES drawer stays a drawer at every width.

### Footnote popover (signature)
- Hover/focus popover on `--wiki-prose-footnote-popover-*` tokens; body background, 1px border, floating shadow.

## 6. Do's and Don'ts

### Do:
- **Do** write every color as `var(--wiki-*, var(--bs-*, literal))` — The Three-Tier Rule.
- **Do** add a `--wiki-chrome-*` / `--wiki-prose-*` token whenever a theme could plausibly want to restyle a new element; ship it with a valid Bootstrap or literal default.
- **Do** keep body prose at 1rem/1.68 and headings on the documented scale.
- **Do** meet WCAG 2.2 AA: ≥4.5:1 body contrast, keyboard-operable drawers/dialogs/editor, `prefers-reduced-motion` alternatives.

### Don't:
- **Don't** reference theme variables (`--wg-*` or any theme's tokens) or theme class names in plugin CSS — the plugin must stay theme-independent.
- **Don't** let wiki pages read as "a generic forum topic view" (PRODUCT.md): no post bylines, reply affordances, or thread chrome inside the article surface.
- **Don't** build "heavy docs-site chrome" (PRODUCT.md): no persistent multi-rail app shell, breadcrumb ribbons, or toolbars everywhere.
- **Don't** add "Fandom/wikia clutter" (PRODUCT.md): no ad-shaped modules, badge noise, or cramped content wells.
- **Don't** recase headings or TOC labels; author intent survives.
- **Don't** put resting shadows on panels, or side-stripe `border-left` accents on callouts and alerts. Structural left borders are the three documented exceptions: the blockquote quote-bar, the compose-guide indent (both neutral `--bs-border-color`, never an accent hue), and the callout's icon-well rail (`--wiki-callout-rail`, which carries the icon, not a color accent).
