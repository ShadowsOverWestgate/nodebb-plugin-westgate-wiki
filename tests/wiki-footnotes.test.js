"use strict";

const assert = require("assert");

const footnotes = require("../lib/content/wiki-footnotes");

function countMatches(value, pattern) {
  return (String(value || "").match(pattern) || []).length;
}

{
  const html = footnotes.transformDokuWikiFootnotes("<p>You can add footnotes ((This is a footnote)) by using double parentheses.</p>");
  assert(html.includes('class="wiki-footnote-ref"'), "basic footnote should render an inline reference");
  assert(html.includes('href="#fn__1"'), "inline reference should point to the bottom footnote");
  assert(html.includes('id="fn__1"'), "bottom footnote should have a stable DokuWiki-like id");
  assert(html.includes('data-wiki-footnote-preview-source hidden'), "preview source should be hidden normal HTML, not visible raw text");
  assert(!html.includes("<template"), "preview source should not use template tags that may be stripped by sanitizers");
  assert(html.includes("This is a footnote"), "bottom footnote should include the note body");
}

{
  const html = footnotes.transformDokuWikiFootnotes('<p>You can add footnotes <span class="wiki-entity wiki-entity--footnote" data-wiki-entity="footnote" data-wiki-footnote="This is a footnote">[note]</span> with the editor.</p>');
  assert(html.includes('class="wiki-footnote-ref"'), "editor footnote entity should render an inline reference");
  assert(html.includes("This is a footnote"), "editor footnote entity should populate the bottom note body");
  assert(!html.includes("data-wiki-entity=\"footnote\""), "editor footnote storage span should not leak into read-only output");
}

{
  const html = footnotes.transformDokuWikiFootnotes('<p>Rich entity <span class="wiki-entity wiki-entity--footnote" data-wiki-entity="footnote" data-wiki-footnote="See &lt;a href=&quot;/wiki/page&quot;&gt;Page&lt;/a&gt; and &lt;strong&gt;bold&lt;/strong&gt;">[note]</span>.</p>');
  assert(html.includes('<a href="/wiki/page" target="_blank" rel="noopener noreferrer">Page</a>'), "editor footnote entity should preserve safe links in note body");
  assert(html.includes("<strong>bold</strong>"), "editor footnote entity should preserve safe inline formatting in note body");
  assert(html.includes('class="wiki-footnote-backref" href="#fnt__1"'), "bottom note should link back to the inline reference");
  assert(html.includes('<span class="wiki-footnote-backref-icon" aria-hidden="true">↑</span>'), "bottom note backlink should expose one sanitizer-safe visible icon");
  assert(!html.includes("fa-arrow-up"), "bottom note backlink should not render both an icon font glyph and a text arrow");
  assert(!html.includes("data-wiki-entity"), "stored footnote entity should not leak into read-only output");
}

{
  const body = Buffer.from('See <a href="/wiki/page">Page</a> and <strong>bold</strong>', "utf8").toString("base64");
  const html = footnotes.transformDokuWikiFootnotes(`<p>Rich entity <span class="wiki-entity wiki-entity--footnote" data-wiki-entity="footnote" data-wiki-footnote-b64="${body}">[note]</span>.</p>`);
  assert(html.includes('<a href="/wiki/page" target="_blank" rel="noopener noreferrer">Page</a>'), "base64 editor footnote entity should preserve safe links in note body");
  assert(html.includes("<strong>bold</strong>"), "base64 editor footnote entity should preserve safe inline formatting in note body");
  assert(html.includes('class="wiki-footnote-backref" href="#fnt__1"'), "base64 editor footnote should keep backlink");
  assert(!html.includes("data-wiki-entity"), "base64 editor footnote entity should not leak into read-only output");
}

{
  const html = footnotes.transformDokuWikiFootnotes("<p>A ((Same note)) B ((Same note)) C ((Different note))</p>");
  assert.strictEqual(countMatches(html, /class="wiki-footnote-item"/g), 2, "identical notes should share one bottom entry");
  assert(html.includes(">1)</a>"), "first repeated note should use number 1");
  assert(html.includes(">2)</a>"), "different note should use number 2");
  assert(html.includes('href="#fnt__1"'), "shared note should link back to first occurrence");
  assert(html.includes('href="#fnt__1-2"'), "shared note should link back to second occurrence");
}

{
  const html = footnotes.transformDokuWikiFootnotes(
    '<p>Rich ((See [[Page]] output <a href="/raw">raw link</a> and [Markdown](https://example.com).))</p>'
  );
  assert(html.includes("[[Page]] output"), "already-rendered wiki-link text should be preserved");
  assert(html.includes('<a href="/raw" target="_blank" rel="noopener noreferrer">raw link</a>'), "raw HTML anchors should open in a new tab");
  assert(html.includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer">Markdown</a>'), "Markdown links inside footnotes should open in a new tab");
}

{
  const wikiLink = '<a class="wiki-internal-link" href="/wiki/about/player-guide">Player Guide</a>';
  const html = footnotes.transformDokuWikiFootnotes(`<p>See ((${wikiLink} and [outside](/wiki/about))).</p>`);
  assert(html.includes('<a class="wiki-internal-link" href="/wiki/about/player-guide" target="_blank" rel="noopener noreferrer">Player Guide</a>'), "server-rendered wiki links should remain rich links inside notes and open in a new tab");
  assert(html.includes('<a href="/wiki/about" target="_blank" rel="noopener noreferrer">outside</a>'), "relative Markdown links should render inside notes and open in a new tab");
}

{
  const html = footnotes.transformDokuWikiFootnotes("<p>Open ((not closed</p><p>Empty (()) marker</p>");
  assert(html.includes("((not closed"), "unclosed markers should remain literal");
  assert(html.includes("(())"), "empty markers should remain literal");
  assert(!html.includes("wiki-footnotes"), "malformed/empty-only content should not append a footnote list");
}

{
  const html = footnotes.transformDokuWikiFootnotes('<pre>((code))</pre><code>((inline code))</code><p>((real note))</p>');
  assert(html.includes("<pre>((code))</pre>"), "pre blocks should be protected");
  assert(html.includes("<code>((inline code))</code>"), "code blocks should be protected");
  assert.strictEqual(countMatches(html, /class="wiki-footnote-item"/g), 1, "only the real note should render");
}

{
  const html = footnotes.transformDokuWikiFootnotes('<p><a href="/x">link ((not a note))</a> outside ((real note))</p>');
  assert(html.includes('link ((not a note))'), "markers inside existing links should be left alone");
  assert.strictEqual(countMatches(html, /class="wiki-footnote-item"/g), 1, "outside marker should still render");
}

{
  const html = footnotes.transformDokuWikiFootnotes('<p id="fn__1">Existing</p><p>((Note))</p>');
  assert(html.includes('id="fn__1-2"'), "generated ids should avoid existing id collisions");
}

{
  // Literal ((...)) path must be sanitized like the entity path: this transform
  // runs at filter:parse.post AFTER core sanitize, so its output is not re-cleaned.
  const html = footnotes.transformDokuWikiFootnotes('<p>Boom ((<img src=x onerror=alert(1)> note))</p>');
  assert(!/onerror/i.test(html), "literal footnote body must have inline event handlers stripped");

  const scriptHtml = footnotes.transformDokuWikiFootnotes('<p>X ((<script>alert(1)</script>note))</p>');
  assert(!/<script/i.test(scriptHtml), "literal footnote body must have script tags stripped");

  const jsHref = footnotes.transformDokuWikiFootnotes('<p>Y ((<a href="javascript:alert(1)">click</a>))</p>');
  assert(!/javascript:/i.test(jsHref), "footnote anchor with unsafe href must be dropped");
}

console.log("wiki-footnotes tests passed");
