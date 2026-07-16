# Public Release Readiness Audit

The plugin is already legally publishable under GPL-3.0-or-later, and its core
model is broadly reusable. It is not yet ready to publish as a clean, generic
npm/NodeBB package.

The largest obstacles are packaging leakage, Westgate identifiers embedded in
durable interfaces, the SoW/topdata integration, and a few theme/editor
leftovers.

## Release blockers

### 1. The npm package currently publishes internal repository material

`npm pack --dry-run` includes:

- 388 files
- 6.56 MB unpacked
- `.agents/` skills and tooling
- `.impeccable/` configuration and a Gond critique
- `docs/superpowers/` implementation plans
- tests and production integration snapshots
- repository-only instructions

Add a strict `files` allowlist to `package.json`. Publish only runtime code,
templates, languages, built assets, the README, the license, and third-party
notices.

### 2. Public package metadata is incomplete and branded

`package.json` lacks:

- a generic package name and description
- repository URL
- homepage
- bugs URL
- author or maintainers
- useful keywords
- Node.js `engines`
- explicit release/build validation
- an npm publishing allowlist

`plugin.json` likewise exposes `nodebb-plugin-westgate-wiki`, `Westgate Wiki`,
and `/admin/plugins/westgate-wiki`.

### 3. The plugin contains a site-specific privilege rule

`lib/forum/wiki-topdata-bot-privileges.js` recognizes
`sow-topdata-wiki:*` HTML markers and changes edit privileges for matching
posts.

That does not belong in a generic wiki plugin. Remove it from the generic
package. If Westgate still needs it, keep it in the deployment plugin or bot
integration that owns the topdata contract.

### 4. The package carries branded durable interfaces

`westgate-wiki` is embedded in:

- API routes
- ACP routes and module names
- the settings key
- database keys and topic fields
- CSS root classes
- browser globals
- log prefixes
- static asset paths
- revision, edit-lock, and cache keys
- archive schema identifiers
- templates and tests

Examples include `library.js`, `lib/core/config.js`, and
`lib/pages/wiki-tombstones.js`.

A global search-and-replace would break existing Westgate data and archives.
Treat this as a migration or a new package identity.

## Site and theme coupling

The styling is substantially more generic than the name suggests. It primarily
uses plugin-owned CSS variables with Bootstrap fallbacks, which is the right
public-plugin contract.

Remaining coupling:

- `public/wiki.css` explicitly assumes Harmony's `#content.container-lg`.
- `public/wiki-article-body.css` calls out Harmony specificity.
- The root selector remains `.westgate-wiki`.
- Page titles hard-code `Westgate Wiki` in `routes/wiki.js`.
- Default callouts use fantasy-themed Game-icons assets such as scrolls, masks,
  and stabbed notes.
- Some default callout colors and styling remain deliberately gothic/fantasy
  rather than neutral Bootstrap styling.

Recommended generic baseline:

- Rename the shell class to something package-neutral.
- Remove Harmony-specific assumptions and test against stock NodeBB behavior.
- Use Font Awesome, simple CSS symbols, or neutral bundled SVGs for callout
  defaults.
- Keep the fantasy icons and palette in the Westgate theme through the existing
  CSS variables.
- Make the displayed wiki name a setting, defaulting to `Wiki`.
- Continue exposing tokens; do not introduce a separate theming framework.

## Content and protocol coupling

These are not merely visible branding:

- Archive identity is `westgate-wiki-archive/v1`.
- Portable IDs and stored topic fields use `westgateWiki*`.
- Generated-content handling recognizes `sow-topdata-wiki` comments.
- Historical migrations understand categories whose slug leaf is `wiki`.
- Documentation describes Neverwinter Nights, SoW deployment, topdata
  ownership, and Westgate URLs.
- Tests contain Gond, game-oriented fixtures, topdata fixtures, and a production
  URL snapshot.

For a generic release:

- Define a neutral archive format such as `nodebb-wiki-archive/v1`.
- Continue accepting `westgate-wiki-archive/v1` on import for migration
  compatibility.
- Stop writing retired `westgateWiki*` fields; read them only during migration
  where necessary.
- Move the topdata content contract and fixtures out of the generic package.
- Replace domain fixtures with neutral pages such as `Getting Started` and
  `Reference`.
- Keep canonical title/tree behavior: it is generic functionality despite its
  history.

## Licensing and publication hygiene

The GPL declaration and license file are present. The third-party notice needs
tightening before redistribution:

- Add the bundled Game-icons.net SVGs and CC BY 3.0 attribution to
  `THIRD_PARTY_NOTICES.md`, rather than leaving attribution only in the asset
  directory.
- Account for all runtime or bundled dependencies, including `diff`,
  `highlight.js`/lowlight, `jsdom`, and `transliteration`.
- Ensure the built Tiptap bundle retains required license notices.
- Add project copyright and maintainer attribution.
- Confirm GPL-3.0-or-later is the intended public package license. It is valid,
  but consumers need to understand the copyleft terms.

## Compatibility gaps

Before calling the plugin generally supported:

- Compatibility is declared only as NodeBB `^4.0.0`; document the actually
  tested NodeBB versions.
- Add a Node.js engine matching NodeBB and `jsdom` requirements.
- Test installation through a clean packed tarball, not only from the checkout.
- Test against a stock NodeBB theme and configuration without Westgate's theme
  or companion plugins.
- Verify install, activation, ACP setup, first page creation, editing, search,
  permissions, asset upload, and uninstall/reinstall.
- Define upgrade behavior for settings, database keys, and archive formats.
- Add public release notes or a changelog.
- Confirm the intended npm package name is available before renaming.

The current repository tests are healthy: 475 passed. They emit repeated
Tiptap warnings about duplicate `underline` extensions, which should be fixed
before release because duplicate extension registration can produce ambiguous
editor behavior.

## Slop audit

Ranked by the largest useful cut first:

- `delete:` npm publication of `.agents`, `.impeccable`, archived plans, tests,
  fixtures, and integration snapshots. Replace with a `files` allowlist.
- `delete:` retired topdata slug synchronization always computes `""` and
  writes an empty `westgateWikiPageSlug`. Remove the hook and dead write path.
- `delete:` generic runtime privilege changes based on SoW HTML markers. Move
  them to Westgate-owned integration code.
- `shrink:` duplicate Tiptap underline registration. Register it once.
- `delete:` direct `highlight.js` dependency appears to have no direct source
  import; lowlight already owns highlighting. Verify with build/tests, then
  remove it if the lockfile confirms it is transitive.
- `yagni:` the exported `.services` API is documented mainly for another local
  plugin or a future extension. Confirm `sow-nodebb` has a consumer; otherwise
  do not establish it as a public compatibility contract.
- `shrink:` hard-coded `Westgate Wiki` page titles are repeated across route
  branches. Load one configured/default wiki name once.
- `delete:` committed/generated review artifacts such as
  `.superpowers/sdd/*.diff` and the Gond critique should not be part of the
  product repository or package.
- `shrink:` fantasy callout assets and their static directory can disappear
  from the generic plugin if neutral native icons replace them.

Possible net reduction: roughly 100-200 runtime/test lines, one direct
dependency, and more than 300 non-runtime files from the npm artifact.

## Lowest-risk route to a generic plugin

Do not rename this production plugin in place. The lowest-risk path is:

1. Freeze the current Westgate package identity as the compatibility source.
2. Create a generic package identity, for example `nodebb-plugin-wiki`.
3. Copy the working runtime, then remove topdata privileges, retired slug
   writes, fantasy defaults, and private artifacts.
4. Rename public/runtime identifiers to neutral names in the new package.
5. Add narrowly scoped compatibility importers for old settings and
   `westgate-wiki-archive/v1`; avoid dual names throughout the runtime.
6. Keep Westgate-specific styling in the Westgate theme.
7. Keep topdata behavior in the bot or deployment integration.
8. Validate the packed tarball on a clean stock NodeBB 4 instance.
9. Publish an initial prerelease, then migrate Westgate using archive
   export/import or a documented one-time settings/data migration.

This avoids turning every generic code path into a permanent `old name or new
name` branch. The existing production plugin remains stable while the public
package starts with clean interfaces.

## Audit verification

- Repository branch at audit time: `main`, tracking `origin/main`, clean.
- `npm pack --dry-run`: 388 files, 1.66 MB compressed, 6.56 MB unpacked.
- `npm test`: 475 passed, 0 failed.

