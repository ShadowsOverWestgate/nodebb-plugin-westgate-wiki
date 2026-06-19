"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const composeTemplate = fs.readFileSync(path.join(__dirname, "..", "templates/wiki-compose.tpl"), "utf8");
const pageTemplate = fs.readFileSync(path.join(__dirname, "..", "templates/wiki-page.tpl"), "utf8");
const composeController = fs.readFileSync(path.join(__dirname, "..", "lib/controllers/compose.js"), "utf8");
const composePageJs = fs.readFileSync(path.join(__dirname, "..", "public/wiki-compose-page.js"), "utf8");
const wikiCss = fs.readFileSync(path.join(__dirname, "..", "public/wiki.css"), "utf8");
const articleBodyCss = fs.readFileSync(path.join(__dirname, "..", "public/wiki-article-body.css"), "utf8");
const libraryJs = fs.readFileSync(path.join(__dirname, "..", "library.js"), "utf8");
const topicService = fs.readFileSync(path.join(__dirname, "..", "lib/topic-service.js"), "utf8");

assert.match(composeTemplate, /id="wiki-compose-css-btn"/);
assert.match(composeTemplate, /id="wiki-compose-css-dialog"/);
assert.match(composeTemplate, /id="wiki-compose-css-input"/);
assert.match(composeTemplate, /wiki-compose-css-lines/);
assert.match(composeTemplate, /wiki-compose-css-highlight/);

assert.match(composeController, /const wikiArticleCss = require\("\.\.\/wiki-article-css"\)/);
assert.match(composeController, /articleCssApiUrl: `\$\{relativePath\}\/api\/v3\/plugins\/westgate-wiki\/article-css`/);
assert.match(composeController, /initialArticleCss/);

assert.match(composePageJs, /const cssButton = document\.getElementById\("wiki-compose-css-btn"\)/);
assert.match(composePageJs, /function\s+highlightCssSource\s*\(/);
assert.match(composePageJs, /function\s+syncCssLineNumbers\s*\(/);
assert.match(composePageJs, /cssDialog\.showModal\(\)/);
assert.match(composePageJs, /articleCssApiUrl/);
assert.match(composePageJs, /css:\s*articleCss/);

assert.match(wikiCss, /\.wiki-compose-css-dialog\s*{/);
assert.match(wikiCss, /\.wiki-compose-css-editor\s*{/);
assert.match(wikiCss, /\.wiki-compose-css-lines\s*{/);
assert.match(wikiCss, /\.wiki-compose-css-highlight\s*{/);
assert.match(wikiCss, /\.wiki-compose-css-input\s*{/);
assert.match(
  articleBodyCss,
  /\.wiki-article-prose :where\(h1, h2, h3, h4, h5, h6\)\s*\{[\s\S]*font-weight:\s*var\(--wiki-prose-heading-font-weight,\s*500\);[\s\S]*\}/,
  "article headings should default to medium weight so bold formatting remains visible"
);
assert.match(
  articleBodyCss,
  /\.wiki-article-prose :where\(h1, h2, h3, h4, h5, h6\)\s*\{[\s\S]*text-shadow:\s*var\(--wiki-prose-heading-text-shadow,\s*2px\s+2px\s+10px\s+rgb\(0,\s*0,\s*0\)\);[\s\S]*\}/,
  "article headings should default to the Westgate shadow treatment"
);
assert.match(
  articleBodyCss,
  /\.wiki-article-prose :where\(h1, h2, h3, h4, h5, h6\) :where\(strong, b\)\s*\{[\s\S]*font-weight:\s*var\(--wiki-prose-heading-bold-font-weight,\s*700\);[\s\S]*\}/,
  "bold text inside article headings should have a distinct heavier weight"
);
assert.match(
  wikiCss,
  /\.wiki-page-heading__title\s*\{[\s\S]*font-weight:\s*var\(--wiki-chrome-page-title-font-weight,\s*500\);[\s\S]*\}/,
  "wiki page titles should default to medium weight instead of theme-heavy headings"
);
assert.match(
  articleBodyCss,
  /\.wiki-article-prose :where\(a\.wiki-external-link, \.wiki-editor-link\.wiki-external-link\)::after\s*\{[\s\S]*content:\s*var\(--wiki-prose-external-link-icon,[\s\S]*\);[\s\S]*margin-inline-start:\s*var\(--wiki-prose-external-link-icon-gap,[\s\S]*\);[\s\S]*\}/,
  "external article and editor links should render a trailing icon"
);
assert.match(
  articleBodyCss,
  /font-family:\s*var\(\s*--wiki-prose-external-link-icon-font-family,\s*var\(--fa-family,\s*var\(--fa-style-family,\s*"Font Awesome 7 Free"\)\)\s*\);/,
  "external-link icons should follow NodeBB's Font Awesome family variables with a Font Awesome 7 fallback"
);
assert.doesNotMatch(
  articleBodyCss,
  /Font Awesome 6 Free/,
  "external-link icons must not hard-code the retired Font Awesome 6 family"
);
assert.match(
  articleBodyCss,
  /\.wiki-article-prose hr\s*\{[\s\S]*background:\s*var\(\s*--wiki-prose-heading-rule,[\s\S]*var\(--wiki-prose-hr-color,[\s\S]*\);[\s\S]*\}/,
  "article and editor horizontal rules should use the same ornamental rule token as major headings"
);
assert.match(
  articleBodyCss,
  /\.wiki-article-prose :where\(td, th\) :where\(img, figure\.image\)\s*\{[\s\S]*float:\s*none\s*!important;[\s\S]*height:\s*auto;[\s\S]*margin:\s*0\.25rem auto;[\s\S]*max-width:\s*100%;[\s\S]*\}/,
  "images inside article tables should stay in normal cell flow instead of floating over adjacent cells"
);
assert.match(
  articleBodyCss,
  /\.wiki-article-prose :where\(td, th\)\.wiki-table-cell-valign-middle\s*\{[\s\S]*vertical-align:\s*middle;[\s\S]*\}/,
  "table cell vertical alignment should have a class fallback for post-render sanitizers that drop the inline style"
);
assert.match(
  articleBodyCss,
  /\.wiki-article-prose :where\(td, th\)\.wiki-table-cell-valign-bottom\s*\{[\s\S]*vertical-align:\s*bottom;[\s\S]*\}/,
  "bottom table cell vertical alignment should render from the durable class fallback"
);
assert.match(
  articleBodyCss,
  /\.wiki-article-prose \.wiki-class-progression :where\(th, td\)\.wiki-class-progression-attack\s*\{[\s\S]*white-space:\s*nowrap;[\s\S]*width:\s*var\(--wiki-class-progression-attack-width,\s*5\.5rem\);[\s\S]*\}/,
  "class progression attack sequences should stay on one line and reserve enough width for long APR values"
);

assert.match(libraryJs, /const wikiArticleCss = require\("\.\/lib\/wiki-article-css"\)/);
assert.match(libraryJs, /"\/westgate-wiki\/article-css"/);
assert.match(libraryJs, /wikiArticleCss\.putArticleCss/);

assert.match(topicService, /const articleCss = await wikiArticleCss\.getArticleCss/);
assert.match(topicService, /articleCss,/);
assert.match(topicService, /scopedArticleCss:\s*wikiArticleCss\.scopeArticleCss/);
assert.match(pageTemplate, /wiki-article-custom-css-scope-\{topic\.tid\}/);
assert.match(pageTemplate, /data-westgate-wiki-article-css/);
assert.match(pageTemplate, /\{scopedArticleCss\}/);

console.log("wiki-article-css client tests passed");
