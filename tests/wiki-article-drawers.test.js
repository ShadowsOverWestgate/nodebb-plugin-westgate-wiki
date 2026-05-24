"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`ok - ${name}\n`);
  } catch (err) {
    process.stderr.write(`not ok - ${name}\n`);
    throw err;
  }
}

const rootDir = path.join(__dirname, "..");
const pageTemplate = fs.readFileSync(path.join(rootDir, "templates/wiki-page.tpl"), "utf8");
const sectionTemplate = fs.readFileSync(path.join(rootDir, "templates/wiki-section.tpl"), "utf8");
const navDrawerTemplate = fs.readFileSync(path.join(rootDir, "templates/partials/wiki/page-nav-drawer.tpl"), "utf8");
const routeSource = fs.readFileSync(path.join(rootDir, "routes/wiki.js"), "utf8");
const wikiCss = fs.readFileSync(path.join(rootDir, "public/wiki.css"), "utf8");
const tocClient = fs.readFileSync(path.join(rootDir, "public/wiki-article-toc.js"), "utf8");
const pageTemplateWithNavPartial = `${pageTemplate}\n${navDrawerTemplate}`;
const sectionTemplateWithNavPartial = `${sectionTemplate}\n${navDrawerTemplate}`;

function mediaBlock(query) {
  const start = wikiCss.indexOf("@media " + query);
  assert.notEqual(start, -1, "expected media block " + query);
  const next = wikiCss.indexOf("@media ", start + 1);
  return wikiCss.slice(start, next === -1 ? wikiCss.length : next);
}

test("article template uses overlay drawers instead of a sidebar grid column", function () {
  assert.doesNotMatch(pageTemplate, /wiki-content-layout--sidebar/);
  assert.match(pageTemplate, /data-wiki-article-drawers/);
  assert.match(pageTemplate, /IMPORT partials\/wiki\/page-nav-drawer\.tpl/);
  assert.match(pageTemplateWithNavPartial, /id="wiki-article-drawer-nav"/);
  assert.match(pageTemplateWithNavPartial, /class="wiki-article-drawer wiki-article-drawer--nav/);
  assert.match(pageTemplate, /id="wiki-article-drawer-toc"/);
  assert.match(pageTemplate, /class="wiki-article-drawer wiki-article-drawer--toc/);
  assert.match(pageTemplate, /data-wiki-drawer-backdrop/);
});

test("drawer triggers expose stable accessible controls", function () {
  assert.match(pageTemplateWithNavPartial, /id="wiki-article-drawer-nav-toggle"/);
  assert.match(pageTemplateWithNavPartial, /data-wiki-drawer-target="nav"/);
  assert.match(pageTemplateWithNavPartial, /aria-controls="wiki-article-drawer-nav"/);
  assert.match(pageTemplateWithNavPartial, /aria-expanded="false"/);
  assert.match(pageTemplateWithNavPartial, /<span class="wiki-article-drawer__tab-label">Pages<\/span>/);

  assert.match(pageTemplate, /id="wiki-article-drawer-toc-toggle"/);
  assert.match(pageTemplate, /data-wiki-drawer-target="toc"/);
  assert.match(pageTemplate, /aria-controls="wiki-article-drawer-toc"/);
  assert.match(pageTemplate, /<span class="wiki-article-drawer__tab-label">Contents<\/span>/);
});

test("existing directory and ToC mounts remain compatible", function () {
  assert.match(pageTemplateWithNavPartial, /data-wiki-directory-mount="1"/);
  assert.match(pageTemplateWithNavPartial, /data-wiki-directory-mode="nav"/);
  assert.match(pageTemplateWithNavPartial, /data-around-tid="\{wikiNavCurrentTid\}"/);
  assert.match(pageTemplate, /data-wiki-article-toc-root/);
  assert.match(pageTemplate, /data-wiki-article-toc/);
});

test("namespace routes expose the Pages drawer navigation", function () {
  assert.match(sectionTemplate, /data-wiki-article-drawers/);
  assert.match(sectionTemplate, /IMPORT partials\/wiki\/page-nav-drawer\.tpl/);
  assert.match(sectionTemplateWithNavPartial, /id="wiki-article-drawer-nav"/);
  assert.match(sectionTemplateWithNavPartial, /class="wiki-article-drawer wiki-article-drawer--nav/);
  assert.match(sectionTemplateWithNavPartial, /<span class="wiki-article-drawer__tab-label">Pages<\/span>/);
  assert.match(sectionTemplateWithNavPartial, /data-wiki-directory-mode="nav"/);
  assert.match(sectionTemplateWithNavPartial, /data-cid="\{sectionNavigation\.cid\}"/);
  assert.match(routeSource, /buildWikiNavRenderData\(wikiSection\.section/);
  assert.match(routeSource, /needsRenderableNamespaceListing/);
  assert.match(routeSource, /\.\.\.\(needsRenderableNamespaceListing \? \{ fullDirectoryListing: true \} : \{\}\)/);
  assert.doesNotMatch(sectionTemplate, /data-wiki-article-toc-root/);
});

test("drawer CSS defines desktop hover drawers and mobile bottom sheet drawers", function () {
  assert.match(wikiCss, /\.wiki-article-drawer\s*{/);
  assert.match(wikiCss, /\.wiki-article-drawer__tab\s*{/);
  assert.match(wikiCss, /\.wiki-article-drawer\s*{[^}]*position:\s*fixed/s);
  assert.doesNotMatch(wikiCss, /\.wiki-article-drawers\s*{[^}]*position:\s*fixed/s);
  assert.doesNotMatch(wikiCss, /\.wiki-article-drawers\s*{[^}]*overflow:\s*clip/s);
  assert.match(wikiCss, /\.wiki-article-drawer__tab-label\s*{/);
  assert.match(wikiCss, /--wiki-article-drawer-side-gutter:\s*3\.28rem/);
  assert.match(wikiCss, /--wiki-article-drawer-peek:\s*2\.75rem/);
  assert.match(wikiCss, /\.wiki-article-drawer--nav\s*{[^}]*transform:\s*translateX\(-100%\)/s);
  assert.match(wikiCss, /\.wiki-article-drawer--toc\s*{[^}]*transform:\s*translateX\(100%\)/s);
  assert.match(wikiCss, /\.wiki-article-drawer--nav\s+\.wiki-article-drawer__tab\s*{[^}]*right:\s*calc\(var\(--wiki-article-drawer-peek\)\s*\*\s*-1\)/s);
  assert.match(wikiCss, /\.wiki-article-drawer--toc\s+\.wiki-article-drawer__tab\s*{[^}]*left:\s*calc\(var\(--wiki-article-drawer-peek\)\s*\*\s*-1\)/s);
  assert.match(wikiCss, /z-index:\s*var\(--wiki-article-drawer-layer,\s*8\)/);
  assert.doesNotMatch(wikiCss, /wiki-article-drawer--open\s+\.wiki-article-drawer__tab\s*{[^}]*visibility:\s*hidden/s);
  assert.doesNotMatch(wikiCss, /wiki-article-drawer:hover\s+\.wiki-article-drawer__tab\s*{[^}]*visibility:\s*hidden/s);
  assert.match(wikiCss, /writing-mode:\s*vertical-rl/);
  assert.match(wikiCss, /@media\s*\(min-width:\s*1200px\)/);
  assert.match(wikiCss, /\.wiki-article-drawer--nav:hover/);
  assert.match(wikiCss, /\.wiki-article-drawer--toc:hover/);
  assert.match(wikiCss, /@media\s*\(min-width:\s*1200px\)[\s\S]*?\.wiki-article-drawer__close\s*{[^}]*display:\s*none/);
  assert.match(wikiCss, /@media\s*\(max-width:\s*992px\)/);
  assert.match(wikiCss, /@media\s*\(max-width:\s*992px\)[\s\S]*?\.wiki-article-drawer__close\s*{[^}]*display:\s*inline-flex/);
  assert.match(wikiCss, /\.wiki-article-drawer-backdrop/);
  assert.match(wikiCss, /env\(safe-area-inset-left,\s*0px\)/);
  assert.match(wikiCss, /env\(safe-area-inset-right,\s*0px\)/);
});

test("small drawer viewports become bottom sheets with horizontal trigger buttons", function () {
  const smallDrawerCss = mediaBlock("(max-width: 992px)");

  assert.match(smallDrawerCss, /\.wiki-article-drawer\s*{[^}]*inset:\s*0/);
  assert.match(smallDrawerCss, /\.wiki-article-drawer--nav,\s*\.wiki-article-drawer--toc\s*{[^}]*transform:\s*none/);
  assert.match(smallDrawerCss, /\.wiki-article-drawer__panel\s*{[^}]*bottom:\s*0/);
  assert.match(smallDrawerCss, /\.wiki-article-drawer__panel\s*{[^}]*transform:\s*translateY\(100%\)/);
  assert.match(smallDrawerCss, /\.wiki-article-drawer--open\s+\.wiki-article-drawer__panel\s*{[^}]*transform:\s*translateY\(0\)/);
  assert.match(smallDrawerCss, /--wiki-article-drawer-trigger-bottom:\s*max\(0\.75rem,\s*env\(safe-area-inset-bottom,\s*0px\)\)/);
  assert.match(smallDrawerCss, /--wiki-article-drawer-trigger-gap:\s*0\.35rem/);
  assert.match(smallDrawerCss, /--wiki-article-drawer-trigger-width:\s*calc\(\(100vw\s*-\s*\(var\(--wiki-article-drawer-sheet-gutter\)\s*\*\s*2\)\s*-\s*var\(--wiki-article-drawer-trigger-gap\)\)\s*\/\s*2\)/);
  assert.match(smallDrawerCss, /\.wiki-article-drawers--nav-only\s*{[^}]*--wiki-article-drawer-trigger-width:\s*calc\(100vw\s*-\s*\(var\(--wiki-article-drawer-sheet-gutter\)\s*\*\s*2\)\)/);
  assert.match(smallDrawerCss, /\.wiki-article-drawer__tab\s*{[^}]*bottom:\s*var\(--wiki-article-drawer-trigger-bottom\)/);
  assert.match(smallDrawerCss, /\.wiki-article-drawer__tab\s*{[^}]*width:\s*var\(--wiki-article-drawer-trigger-width\)/);
  assert.match(smallDrawerCss, /\.wiki-article-drawer--nav\s+\.wiki-article-drawer__tab\s*{[^}]*left:\s*var\(--wiki-article-drawer-sheet-gutter\)/);
  assert.match(smallDrawerCss, /\.wiki-article-drawer--toc\s+\.wiki-article-drawer__tab\s*{[^}]*left:\s*calc\(var\(--wiki-article-drawer-sheet-gutter\)\s*\+\s*var\(--wiki-article-drawer-trigger-width\)\s*\+\s*var\(--wiki-article-drawer-trigger-gap\)\)/);
  assert.match(smallDrawerCss, /html\.wiki-article-drawer-modal-open\s+\.wiki-article-drawer__tab\s*{[^}]*visibility:\s*hidden/);
  assert.match(smallDrawerCss, /html\.wiki-article-drawer-modal-open\s+\.wiki-article-drawer\s*{[^}]*z-index:\s*var\(--wiki-article-drawer-modal-layer,\s*1050\)/);
  assert.match(smallDrawerCss, /html\.wiki-article-drawer-modal-open\s+\.wiki-article-drawer-backdrop\s*{[^}]*z-index:\s*var\(--wiki-article-drawer-modal-backdrop-layer,\s*1049\)/);
  assert.match(smallDrawerCss, /\.wiki-article-drawer__tab-label\s*{[^}]*writing-mode:\s*horizontal-tb/);
});

test("ToC client owns drawer state and accessibility updates", function () {
  assert.match(tocClient, /function\s+initArticleDrawers\s*\(/);
  assert.match(tocClient, /data-wiki-drawer-toggle/);
  assert.match(tocClient, /aria-expanded/);
  assert.match(tocClient, /wiki-article-drawer--open/);
  assert.doesNotMatch(tocClient, /updateArticleDrawerBounds/);
  assert.doesNotMatch(tocClient, /appendChild\(root\)/);
  assert.match(tocClient, /keydown/);
  assert.match(tocClient, /Escape/);
});
