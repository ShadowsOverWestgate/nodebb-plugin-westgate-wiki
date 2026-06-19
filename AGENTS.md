# AGENTS.md

## Purpose

This repository is a NodeBB plugin that adds a wiki surface on top of forum
content. The package is **GPL-3.0-or-later**. Wiki page creation uses
**`/wiki/compose/:cid`** with a vendored **Tiptap** build under
`public/vendor/tiptap/` (rebuild with `npm run build:tiptap` or
`npm run build:editors`).

Current design baseline:

- `Topics` act as wiki pages.
- The first post is the canonical article body.
- Categories act as wiki sections or namespaces.
- The plugin must extend NodeBB instead of replacing core forum behavior.

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

## Working Rules

When changing this plugin:

1. Preserve NodeBB core behavior.
2. Prefer small, verifiable steps over broad rewrites.
3. Keep wiki logic isolated in plugin-owned modules.
4. Do not hard-code site-specific IDs once configuration exists.
5. Do not assume a specific database backend beyond NodeBB abstractions.
6. Treat `/wiki` as a presentation layer over forum data, not a separate content
   system.
7. Prefer exposing stable plugin-owned helpers over duplicating wiki resolution
   logic in future files.

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
