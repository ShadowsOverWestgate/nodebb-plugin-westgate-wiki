"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const plugin = require("../plugin.json");
const wikiSearchTpl = fs.readFileSync(path.join(root, "templates/wiki-search.tpl"), "utf8");
const searchChromeTpl = fs.readFileSync(path.join(root, "templates/partials/wiki/search-chrome.tpl"), "utf8");
const wikiTpl = fs.readFileSync(path.join(root, "templates/wiki.tpl"), "utf8");
const wikiSectionTpl = fs.readFileSync(path.join(root, "templates/wiki-section.tpl"), "utf8");
const wikiPageTpl = fs.readFileSync(path.join(root, "templates/wiki-page.tpl"), "utf8");

assert.ok(plugin.scripts.includes("public/wiki-search.js"), "plugin should ship the search client");
assert.match(searchChromeTpl, /data-wiki-search-form/);
assert.match(searchChromeTpl, /data-wiki-search-input/);
assert.match(searchChromeTpl, /data-wiki-search-suggestions/);
assert.match(wikiSearchTpl, /data-wiki-search-page/);
assert.match(wikiSearchTpl, /data-wiki-search-page-results/);
assert.doesNotMatch(wikiSearchTpl, /IMPORT partials\/wiki\/breadcrumb-trail\.tpl/, "search page should not render wiki breadcrumbs");

assert.match(wikiTpl, /IMPORT partials\/wiki\/search-chrome\.tpl/);
assert.match(wikiSectionTpl, /IMPORT partials\/wiki\/search-chrome\.tpl/);
assert.match(wikiPageTpl, /IMPORT partials\/wiki\/search-chrome\.tpl/);

console.log("wiki-search wiring tests passed");
