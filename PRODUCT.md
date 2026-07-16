# Product

## Register

product

## Platform

web

## Users

Active Shadows Over Westgate players on the community's NodeBB forum. They read lore, rules, and server documentation day to day, and a smaller group of contributors writes and revises pages. Server operators administer namespaces, imports, and revisions through the ACP. Readers vastly outnumber editors; most visits are a quick lookup mid-game or mid-thread.

## Product Purpose

`nodebb-plugin-westgate-wiki` adds a wiki surface to NodeBB without a second content system: configured categories are namespaces, topics are pages, the first post is the article. It exists so the community can maintain a real encyclopedia (canonical `/wiki/...` paths, revisions, history, search, archive import/export) while NodeBB permissions and storage stay the single source of truth. Success is a wiki that feels wiki-first to read and edit, yet never diverges from the forum's data or access model.

## Positioning

The only wiki that IS the forum: every page is a NodeBB topic underneath, so nothing is duplicated, orphaned, or separately permissioned.

## Brand Personality

A neutral host, themed by contract. The plugin's own look is quiet, readable, Bootstrap-default — fully usable and coherent on any NodeBB theme with no overrides. All personality is delegated to themes through the `--wiki-chrome-*` custom-property contract (every token carries a valid Bootstrap/hex fallback). The plugin never depends on a specific theme; themes opt in to restyle it.

## Anti-references

- A generic forum topic view — wiki pages must not read as threads; wiki-first presentation is the point.
- Heavy docs-site chrome (Notion/GitBook-style app shells, dense sidebars, toolbars everywhere).
- Fandom/wikia clutter — ad-shaped modules, badge noise, cramped content wells.

## Design Principles

- Reading is the primary job: prose layout, TOC, and links are optimized for lookup speed, not editing ceremony.
- Theme-independent by contract: defaults must stand alone; expression happens only through overridable tokens.
- One source of truth: every surface reflects NodeBB categories, topics, and privileges — never a parallel model.
- Author intent survives: headings, casing, and structure render as written, without decorative transformation.
- Progressive editor: the Tiptap compose flow stays an enhancement over plain content, never a gate.

## Accessibility & Inclusion

WCAG 2.2 AA: ≥4.5:1 body-text contrast, full keyboard operability (dialogs, drawers, editor), visible focus, and `prefers-reduced-motion` alternatives for all animation.
