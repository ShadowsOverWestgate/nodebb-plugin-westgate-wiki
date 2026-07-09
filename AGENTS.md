# AGENTS.md

## Purpose

Shadows Over Westgate (SoW) is a Neverwinter Nights persistent-world project.
Its community forum runs on NodeBB (a Node.js forum platform). This plugin
(`nodebb-plugin-westgate-wiki`) gives that forum a wiki: configured forum
categories become wiki namespaces and topics become wiki pages. It is consumed
by sow-nodebb (https://git.westgate.pw/ShadowsOverWestgate/sow-nodebb), which
pins this repo by exact commit in `plugins.lock` and bakes it into the
production forum image. Generated mechanical wiki pages come from sow-topdata
(https://git.westgate.pw/ShadowsOverWestgate/sow-topdata) via the bot content
contract (`docs/topdata-bot-content-contract.md`).

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

## Guidance Map

Which doc to read for which task:

| Task | Read |
|---|---|
| Overview, content model, canonical URL scheme | `README.md` |
| Architecture and module layering | `ARCHITECTURE.md` |
| Canonical path/tree rules (namespaces, ` :: ` title splits, `_` for spaces) | contracts under `docs/history/` (see README links) |
| Wiki ZIP import/export | `docs/WIKI_IMPORT_EXPORT_ARCHIVE_CONTRACT.md` |
| Bot-generated pages from topdata | `docs/topdata-bot-content-contract.md` |
| Open bug/feature specs | `docs/wiki-*-spec.md`, `docs/wiki-links-and-search-followup-spec.md` |
| Editor (Tiptap) changes | `tiptap/` source, rebuild with `npm run build:editors` |
| Third-party licensing | `THIRD_PARTY_NOTICES.md` |

Do not touch `docs/superpowers/` plan/spec archives.

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

For a live forum to test against, sow-nodebb
(https://git.westgate.pw/ShadowsOverWestgate/sow-nodebb) has a
`docker-compose.dev.yml` that bind-mounts a local checkout of this plugin.

## Release

Merge here first. Then update this plugin's commit SHA in `plugins.lock` in
sow-nodebb and rebuild/publish the forum image there. Nothing in this repo
deploys by itself.

## Tests

Tests must survive harmless changes to constants, defaults, wording, ordering, fixture data, and internal implementation details. A test that fails merely because a basic value changed is usually a bad test. Only assert exact values when the value is part of a documented public contract, external protocol, compatibility requirement, security rule, migration, or business rule.
