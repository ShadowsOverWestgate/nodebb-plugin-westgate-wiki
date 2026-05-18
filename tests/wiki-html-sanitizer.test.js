"use strict";

const assert = require("node:assert/strict");

const wikiHtmlSanitizer = require("../lib/wiki-html-sanitizer");

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`ok - ${name}\n`);
  } catch (err) {
    process.stderr.write(`not ok - ${name}\n`);
    throw err;
  }
}

test("sanitizeWikiHtml removes script tags and keeps safe markup", function () {
  const html = '<p>Hello <strong>world</strong><script>alert(1)</script></p>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.equal(sanitized, "<p>Hello <strong>world</strong></p>");
});

test("sanitizeWikiHtml normalizes blank target links with rel", function () {
  const html = '<p><a href="https://example.com" target="_blank">Example</a></p>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /rel="noopener noreferrer"/);
});

test("renderReadOnlyWikiHtml disables task list checkboxes for article view", function () {
  const html = '<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><div><p>Task</p></div></li></ul>';
  const rendered = wikiHtmlSanitizer.renderReadOnlyWikiHtml(html);

  assert.match(rendered, /<input type="checkbox" disabled/);
});

test("renderReadOnlyWikiHtml converts stored inert editor links into anchors", function () {
  const html = '<p>A <span class="wiki-editor-link" data-wiki-link-href="https://google.com" data-wiki-link-target="_blank" data-wiki-link-rel="noopener noreferrer">regular link</span>.</p>';
  const rendered = wikiHtmlSanitizer.renderReadOnlyWikiHtml(html);

  assert.equal(rendered, '<p>A <a href="https://google.com" target="_blank" rel="noopener noreferrer" class="wiki-external-link">regular link</a>.</p>');
});

test("renderReadOnlyWikiHtml marks external inert editor links", function () {
  const html = '<p>A <span class="wiki-editor-link" data-wiki-link-href="https://example.com/path">regular link</span>.</p>';
  const rendered = wikiHtmlSanitizer.renderReadOnlyWikiHtml(html);

  assert.equal(rendered, '<p>A <a href="https://example.com/path" rel="noopener noreferrer" class="wiki-external-link">regular link</a>.</p>');
});

test("renderReadOnlyWikiHtml marks raw external anchors but leaves wiki links plain", function () {
  const html = '<p><a href="https://example.com">External</a> <a class="wiki-internal-link" href="/wiki/player-guide">Guide</a></p>';
  const rendered = wikiHtmlSanitizer.renderReadOnlyWikiHtml(html);

  assert.match(rendered, /<a href="https:\/\/example\.com" rel="noopener noreferrer" class="wiki-external-link">External<\/a>/);
  assert.match(rendered, /<a class="wiki-internal-link" href="\/wiki\/player-guide" rel="noopener noreferrer">Guide<\/a>/);
});

test("sanitizeWikiHtml keeps stored inert editor links inert", function () {
  const html = '<p>A <span class="wiki-editor-link" data-wiki-link-href="https://google.com" data-wiki-link-target="_blank" data-wiki-link-rel="noopener noreferrer">regular link</span>.</p>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /<span class="wiki-editor-link" data-wiki-link-href="https:\/\/google\.com"/);
  assert.doesNotMatch(sanitized, /<a\b/);
});

test("sanitizeWikiHtml preserves inert wiki entity spans for editor storage", function () {
  const html = '<p><span class="wiki-entity wiki-entity--page" data-wiki-entity="page" data-wiki-target="Guides/Page" data-wiki-label="Guide" onclick="alert(1)">Guide</span> <span class="wiki-entity wiki-entity--footnote" data-wiki-entity="footnote" data-wiki-footnote="Note <script>alert(1)</script>">[note]</span></p>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /data-wiki-entity="page"/);
  assert.match(sanitized, /data-wiki-target="Guides\/Page"/);
  assert.match(sanitized, /data-wiki-entity="footnote"/);
  assert.doesNotMatch(sanitized, /onclick/);
  assert.doesNotMatch(sanitized, /script/);
});

test("renderReadOnlyWikiHtml leaves wiki entities for parse hooks instead of converting them as links", function () {
  const html = '<p><span class="wiki-entity wiki-entity--page" data-wiki-entity="page" data-wiki-target="Guides/Page">Guide</span></p>';
  const rendered = wikiHtmlSanitizer.renderReadOnlyWikiHtml(html);

  assert.match(rendered, /data-wiki-entity="page"/);
  assert.doesNotMatch(rendered, /<a\b/);
});

test("renderReadOnlyWikiHtml does not convert unsafe inert editor links", function () {
  const html = '<p>A <span class="wiki-editor-link" data-wiki-link-href="javascript:alert(1)">bad link</span>.</p>';
  const rendered = wikiHtmlSanitizer.renderReadOnlyWikiHtml(html);

  assert.equal(rendered, '<p>A <span class="wiki-editor-link">bad link</span>.</p>');
});

test("renderReadOnlyWikiHtml removes empty task checkbox spacer spans", function () {
  const html = '<ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>Task</p></div></li></ul>';
  const rendered = wikiHtmlSanitizer.renderReadOnlyWikiHtml(html);

  assert.doesNotMatch(rendered, /<span><\/span>/);
  assert.match(rendered, /<label><input type="checkbox" checked disabled(?:="disabled")? \/><\/label>/);
});

test("renderReadOnlyWikiHtml preserves visible footnote backlink icons", function () {
  const html = '<section class="wiki-footnotes"><ol><li><span class="wiki-footnote-backrefs"><a class="wiki-footnote-backref" href="#fnt__1"><span class="wiki-footnote-backref-icon" aria-hidden="true">↑</span><span class="visually-hidden">Back to footnote reference</span></a></span></li></ol></section>';
  const rendered = wikiHtmlSanitizer.renderReadOnlyWikiHtml(html);

  assert.match(rendered, /class="wiki-footnote-backref-icon"/);
  assert.match(rendered, />↑<\/span>/);
  assert.match(rendered, /href="#fnt__1"/);
});

test("sanitizeWikiHtml preserves safe inline styles and strips unsafe ones", function () {
  const html = '<p style="text-align: center; position: fixed; color: rgb(10, 20, 30)">Styled</p>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /style="[^"]*text-align:center;?[^"]*"/);
  assert.match(sanitized, /style="[^"]*color:rgb\(10, 20, 30\);?[^"]*"/);
  assert.doesNotMatch(sanitized, /position:/);
});

test("sanitizeWikiHtml preserves semantic span markup for legacy inline formatting", function () {
  const html = '<p><span class="legacy-accent" style="font-size: 1.2rem; color: #caa55a">Accent</span></p>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /<span class="legacy-accent" style="font-size:1\.2rem;color:#caa55a">Accent<\/span>/);
});

test("sanitizeWikiHtml preserves safe table alignment styles", function () {
  const html = '<table style="margin-left: auto; margin-right: 0; position: fixed"><tbody><tr><td>Right</td></tr></tbody></table>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /style="[^"]*margin-left:auto;?[^"]*"/);
  assert.match(sanitized, /style="[^"]*margin-right:0;?[^"]*"/);
  assert.doesNotMatch(sanitized, /position:/);
});

test("sanitizeWikiHtml preserves safe table border colors", function () {
  const html = '<table style="width: 50%; border-color: rgb(202, 165, 90); position: fixed"><tbody><tr><td>Gold</td></tr></tbody></table>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);
  const rendered = wikiHtmlSanitizer.renderReadOnlyWikiHtml(sanitized);

  assert.match(sanitized, /style="[^"]*width:50%;?[^"]*"/);
  assert.match(sanitized, /style="[^"]*border-color:rgb\(202, 165, 90\);?[^"]*"/);
  assert.match(rendered, /style="[^"]*border-color:rgb\(202, 165, 90\);?[^"]*"/);
  assert.doesNotMatch(sanitized, /position:/);
});

test("sanitizeWikiHtml preserves safe table cell vertical alignment styles", function () {
  const html = '<table><tbody><tr><td style="vertical-align: middle; position: fixed">Middle</td><td style="vertical-align: bottom">Bottom</td></tr></tbody></table>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /<td style="[^"]*vertical-align:middle;?[^"]*">Middle<\/td>/);
  assert.match(sanitized, /<td style="[^"]*vertical-align:bottom;?[^"]*">Bottom<\/td>/);
  assert.doesNotMatch(sanitized, /position:/);
});

test("sanitizeWikiHtml preserves Tiptap table column width attributes", function () {
  const html = '<table><tbody><tr><td colwidth="82" colspan="1" rowspan="1">Icon</td><th colwidth="94" scope="col">Label</th></tr></tbody></table>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /<td(?=[^>]*\bcolwidth="82")(?=[^>]*\bcolspan="1")(?=[^>]*\browspan="1")[^>]*>Icon<\/td>/);
  assert.match(sanitized, /<th(?=[^>]*\bcolwidth="94")(?=[^>]*\bscope="col")[^>]*>Label<\/th>/);
});

test("sanitizeWikiHtml preserves wiki callout blocks and strips arbitrary styles", function () {
  const html = '<aside class="wiki-callout wiki-callout--danger bad-class" data-callout-type="danger" data-callout-title="Risk" style="position:fixed"><p><strong>Risk</strong></p><p>Check [[Page]].</p></aside>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /<aside class="wiki-callout wiki-callout--danger bad-class" data-callout-type="danger" data-callout-title="Risk">/);
  assert.match(sanitized, /\[\[Page\]\]/);
  assert.doesNotMatch(sanitized, /position:/);
});

test("sanitizeWikiHtml preserves wiki infobox structure and helper data attributes", function () {
  const html = [
    '<aside class="wiki-infobox unsafe-extra" data-wiki-node="infobox" onclick="alert(1)">',
    '  <div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene Voss</div>',
    '  <div class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle">Vampire Noble</div>',
    '  <figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img src="https://example.com/selene.png" alt="Selene"></figure>',
    '  <div class="wiki-infobox__section" data-wiki-infobox-part="section">Details</div>',
    '  <dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">',
    '    <div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div>',
    '  </dl>',
    '  <div class="wiki-infobox__content" data-wiki-infobox-part="content"><p>Optional notes.</p></div>',
    '</aside>'
  ].join("");
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /<aside class="wiki-infobox unsafe-extra" data-wiki-node="infobox">/);
  assert.match(sanitized, /class="wiki-infobox__title" data-wiki-infobox-part="title"/);
  assert.match(sanitized, /class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle"/);
  assert.match(sanitized, /class="wiki-infobox__image" data-wiki-infobox-part="image"/);
  assert.match(sanitized, /class="wiki-infobox__section" data-wiki-infobox-part="section"/);
  assert.match(sanitized, /class="wiki-infobox__rows" data-wiki-infobox-part="rows"/);
  assert.match(sanitized, /class="wiki-infobox__row" data-wiki-infobox-part="row"/);
  assert.match(sanitized, /<dt>House<\/dt><dd>Voss<\/dd>/);
  assert.doesNotMatch(sanitized, /onclick/);
});

test("sanitizeWikiHtml hoists top-level infoboxes before article blocks", function () {
  const html = [
    '<p>Intro text.</p>',
    '<aside class="wiki-infobox" data-wiki-node="infobox">',
    '<div class="wiki-infobox__title" data-wiki-infobox-part="title">Shar</div>',
    '</aside>',
    '<p>Body text.</p>'
  ].join("");
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.ok(sanitized.indexOf('<aside class="wiki-infobox"') < sanitized.indexOf("<p>Intro text.</p>"));
});

test("renderReadOnlyWikiHtml hoists top-level infoboxes before article blocks", function () {
  const html = [
    '<p>Intro text.</p>',
    '<aside class="wiki-infobox" data-wiki-node="infobox">',
    '<div class="wiki-infobox__title" data-wiki-infobox-part="title">Shar</div>',
    '</aside>',
    '<p>Body text.</p>'
  ].join("");
  const rendered = wikiHtmlSanitizer.renderReadOnlyWikiHtml(html);

  assert.ok(rendered.indexOf('<aside class="wiki-infobox"') < rendered.indexOf("<p>Intro text.</p>"));
});

test("sanitizeWikiHtml strips unsafe styles from wiki infoboxes", function () {
  const html = '<aside class="wiki-infobox" data-wiki-node="infobox" style="position:fixed; color:#caa55a"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Title</div></aside>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /class="wiki-infobox"/);
  assert.match(sanitized, /style="color:#caa55a"/);
  assert.doesNotMatch(sanitized, /position:/);
});

test("sanitizeWikiHtml preserves topdata bot markers and generated HTML subset", function () {
  const html = [
    "<!-- sow-topdata-wiki:page=feat:power_attack -->",
    '<!-- sow-topdata-wiki:managed:start hash="sha256:fixture" -->',
    "<h1>Power Attack</h1>",
    '<p class="wiki-callout wiki-callout--status">This feat has been altered from vanilla.</p>',
    "<table><tbody><tr><th>Required Feats</th><td>[[Cleave]]</td></tr></tbody></table>",
    "<!-- sow-topdata-wiki:managed:end -->",
    '<!-- sow-topdata-wiki:manual:start id="notes" -->',
    "<h2>Notes</h2><p></p>",
    '<!-- sow-topdata-wiki:manual:end id="notes" -->',
    '<script>alert(1)</script>'
  ].join("\n");
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /<!-- sow-topdata-wiki:page=feat:power_attack -->/);
  assert.match(sanitized, /<!-- sow-topdata-wiki:managed:start hash="sha256:fixture" -->/);
  assert.match(sanitized, /<!-- sow-topdata-wiki:manual:start id="notes" -->/);
  assert.match(sanitized, /class="wiki-callout wiki-callout--status"/);
  assert.match(sanitized, /\[\[Cleave\]\]/);
  assert.doesNotMatch(sanitized, /script/);
});

test("hasMeaningfulWikiHtml accepts image-only content", function () {
  const html = '<img src="https://example.com/example.png" alt="Example" />';
  assert.equal(wikiHtmlSanitizer.hasMeaningfulWikiHtml(html), true);
});

test("hasMeaningfulWikiHtml rejects empty content", function () {
  assert.equal(wikiHtmlSanitizer.hasMeaningfulWikiHtml("  "), false);
  assert.equal(wikiHtmlSanitizer.hasMeaningfulWikiHtml("<script>alert(1)</script>"), false);
});
