"use strict";

const assert = require("assert");

const wikiPageToc = require("../lib/content/wiki-page-toc");

const { test } = require("node:test");

test("extractHeadingToc matches article ToC ids for plain and duplicate headings", function () {
  const headings = wikiPageToc.extractHeadingToc(`
    <h2>Advanced Setup</h2>
    <p>Ignored</p>
    <h3>Advanced Setup</h3>
    <h4>Élite &amp; Noble Houses</h4>
    <h4>Grandmaster's Battle Momentum</h4>
    <h4>Æther Œuvre Øresund Straße Þorn Łódź Đelta</h4>
  `);

  assert.deepStrictEqual(headings, [
    { id: "advanced-setup", text: "Advanced Setup", level: 2 },
    { id: "advanced-setup-2", text: "Advanced Setup", level: 3 },
    { id: "elite-noble-houses", text: "Élite & Noble Houses", level: 4 },
    { id: "grandmasters-battle-momentum", text: "Grandmaster's Battle Momentum", level: 4 },
    { id: "aether-oeuvre-oresund-strasse-thorn-lodz-delta", text: "Æther Œuvre Øresund Straße Þorn Łódź Đelta", level: 4 }
  ]);
});

test("extractHeadingToc preserves explicit heading ids and strips nested markup", function () {
  const headings = wikiPageToc.extractHeadingToc(`
    <h2 id="already-there">Named <em>Section</em></h2>
    <h3><a href="/wiki/example">Linked</a> Heading</h3>
  `);

  assert.deepStrictEqual(headings, [
    { id: "already-there", text: "Named Section", level: 2 },
    { id: "linked-heading", text: "Linked Heading", level: 3 }
  ]);
});

test("extractHeadingToc ignores headings inside wiki infoboxes", function () {
  const headings = wikiPageToc.extractHeadingToc(`
    <h2>Overview</h2>
    <aside class="wiki-infobox" data-wiki-node="infobox">
      <h2>Infobox Title</h2>
      <div class="wiki-infobox__section" data-wiki-infobox-part="section"><h3>Infobox Details</h3></div>
      <aside class="wiki-callout"><h3>Nested Callout Heading</h3></aside>
    </aside>
    <h2>History</h2>
  `);

  assert.deepStrictEqual(headings, [
    { id: "overview", text: "Overview", level: 2 },
    { id: "history", text: "History", level: 2 }
  ]);
});

test("extractHeadingToc ignores headings inside legacy infobox wrappers", function () {
  const headings = wikiPageToc.extractHeadingToc(`
    <h2>Overview</h2>
    <aside class="infobox">
      <h2>Legacy Infobox Heading</h2>
    </aside>
    <h2>History</h2>
  `);

  assert.deepStrictEqual(headings, [
    { id: "overview", text: "Overview", level: 2 },
    { id: "history", text: "History", level: 2 }
  ]);
});
