"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pluginJson = fs.readFileSync(path.join(root, "plugin.json"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
const testRunner = fs.readFileSync(path.join(root, "scripts/test.mjs"), "utf8");
const libraryJs = fs.readFileSync(path.join(root, "library.js"), "utf8");
const routesWikiJs = fs.readFileSync(path.join(root, "routes/wiki.js"), "utf8");
const wikiCss = fs.readFileSync(path.join(root, "public/wiki.css"), "utf8");
const wikiSearchTpl = fs.readFileSync(path.join(root, "templates/wiki-search.tpl"), "utf8");
const wikiTpl = fs.readFileSync(path.join(root, "templates/wiki.tpl"), "utf8");
const wikiSectionTpl = fs.readFileSync(path.join(root, "templates/wiki-section.tpl"), "utf8");
const wikiPageTpl = fs.readFileSync(path.join(root, "templates/wiki-page.tpl"), "utf8");

assert.match(pluginJson, /"public\/wiki-search\.js"/, "plugin.json should ship the wiki search client");

assert.match(libraryJs, /const wikiSearchService = require\("\.\/lib\/wiki-search-service"\)/);
assert.match(libraryJs, /"\/westgate-wiki\/search"/);
assert.match(libraryJs, /wikiSearchService\.apiSearch/);
assert.match(libraryJs, /wikiSearchService,/);

assert.match(routesWikiJs, /const wikiSearchService = require\("\.\.\/lib\/wiki-search-service"\)/);
assert.match(routesWikiJs, /routeHelpers\.setupPageRoute\(router, "\/wiki\/search"/);
assert.match(routesWikiJs, /res\.render\("wiki-search"/);

assert(fs.existsSync(path.join(root, "templates/wiki-search.tpl")), "wiki-search.tpl should exist");
assert(fs.existsSync(path.join(root, "templates/partials/wiki/search-chrome.tpl")), "search chrome partial should exist");
assert.doesNotMatch(wikiSearchTpl, /IMPORT partials\/wiki\/breadcrumb-trail\.tpl/, "search page should not render wiki breadcrumbs");
assert.match(wikiSearchTpl, /Results for\s*\{wikiSearchQuery\}/, "search page heading should show the active query");

assert.match(wikiTpl, /IMPORT partials\/wiki\/search-chrome\.tpl/);
assert.match(wikiSectionTpl, /IMPORT partials\/wiki\/search-chrome\.tpl/);
assert.match(wikiPageTpl, /IMPORT partials\/wiki\/search-chrome\.tpl/);

assert.match(packageJson, /"test": "node scripts\/test\.mjs"/);
assert.match(testRunner, /const jsFilePattern =/);
assert.match(testRunner, /const testFilePattern =/);
assert.match(testRunner, /--check/);
assert.match(testRunner, /--test/);

assert.match(
  wikiCss,
  /\.wiki-search-suggestions__link:hover,[\s\S]*\.wiki-search-suggestions__link:focus,[\s\S]*\.wiki-search-suggestions__all:hover,[\s\S]*\.wiki-search-suggestions__all:focus[\s\S]*text-decoration: none;/,
  "search suggestion rows and all-results link should not underline on hover/focus"
);
assert.match(
  wikiCss,
  /\.wiki-search-page\s*\{[\s\S]*width: 100%;[\s\S]*\}/,
  "search page should use the available page width"
);
assert.match(
  wikiCss,
  /\.wiki-search-suggestions\s*\{[\s\S]*background:\s*var\(--wiki-search-suggestions-bg,\s*var\(--bs-dropdown-bg,\s*var\(--bs-body-bg,\s*#fff\)\)\);[\s\S]*\}/,
  "search suggestions dropdown should use an opaque dropdown background instead of translucent panel chrome"
);
assert.match(
  wikiCss,
  /\.wiki-search-suggestions\s*\{[\s\S]*z-index:\s*var\(--wiki-search-suggestions-layer,\s*1045\);[\s\S]*\}/,
  "search suggestions dropdown should sit above mobile drawers and page tools"
);
assert.doesNotMatch(
  wikiCss.match(/\.wiki-search-suggestions\s*\{[\s\S]*?\}/)[0],
  /--wiki-chrome-surface-bg/,
  "search suggestions dropdown should not inherit generic wiki panel background"
);
assert.match(
  wikiCss,
  /@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.wiki-search-chrome\s*{[^}]*z-index:\s*var\(--wiki-search-mobile-layer,\s*1046\)/,
  "mobile search chrome should create a high stacking context"
);
assert.match(
  wikiCss,
  /@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.wiki-search-suggestions\s*{[^}]*max-height:\s*min\(60vh,\s*28rem\)/,
  "mobile search suggestions should stay bounded inside the viewport"
);
assert.match(
  wikiCss,
  /@media\s*\(max-width:\s*767\.98px\)[\s\S]*?\.wiki-search-suggestions\s*{[^}]*background:\s*var\(--wiki-search-suggestions-bg,\s*var\(--bs-dropdown-bg,\s*var\(--bs-body-bg,\s*#fff\)\)\)/,
  "mobile search suggestions should keep the same opaque dropdown background"
);
assert.match(
  wikiCss,
  /\.wiki-page-header--search \.wiki-page-heading__title\s*\{[\s\S]*overflow: hidden;[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;[\s\S]*\}/,
  "search page heading should stay on one line with ellipsis"
);

console.log("wiki-search wiring tests passed");
