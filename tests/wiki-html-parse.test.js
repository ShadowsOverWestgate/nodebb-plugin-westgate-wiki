"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { installNodebbStubs } = require("./helpers/nodebb-stub");

installNodebbStubs();

const wikiHtmlParse = require("../lib/content/wiki-html-parse");

const { test } = require("node:test");

test("looksLikeWikiStoredHtml accepts topdata bot pages that begin with marker comments", function () {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures/topdata-bot/managed-manual-page.html"),
    "utf8"
  );

  assert.equal(wikiHtmlParse.looksLikeWikiStoredHtml(html), true);
});

test("looksLikeWikiStoredHtml accepts infobox articles that begin with aside markup", function () {
  const html = [
    '<aside class="wiki-infobox" data-wiki-node="infobox">',
    '<div class="wiki-infobox__title" data-wiki-infobox-part="title">Shar</div>',
    '</aside>',
    '<p>Article text.</p>'
  ].join("");

  assert.equal(wikiHtmlParse.looksLikeWikiStoredHtml(html), true);
});
