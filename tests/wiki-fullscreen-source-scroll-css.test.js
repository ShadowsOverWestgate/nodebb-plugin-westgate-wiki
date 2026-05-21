"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readCss(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

function findRules(css, selector) {
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  const bodies = [];
  let match;
  while ((match = rulePattern.exec(css)) !== null) {
    const selectors = match[1].split(",").map(value => value.trim());
    if (selectors.includes(selector)) {
      bodies.push(match[2]);
    }
  }
  return bodies.join("\n");
}

function assertHighlightLayerIsScrollable(css, label) {
  const rule = findRules(css, ".westgate-wiki-compose .wiki-editor__fullscreen-source-highlight");
  assert.ok(rule, `${label} should define fullscreen source highlight styles`);
  assert.match(rule, /overflow:\s*auto/, `${label} highlight layer must be programmatically scrollable`);
  assert.match(rule, /scrollbar-width:\s*none/, `${label} highlight layer should hide its Firefox scrollbar`);
  assert.doesNotMatch(rule, /overflow:\s*hidden/, `${label} highlight layer must not use non-scrollable overflow`);
}

assertHighlightLayerIsScrollable(readCss("tiptap/src/wiki-editor.css"), "source CSS");
assertHighlightLayerIsScrollable(readCss("public/vendor/tiptap/wiki-tiptap.css"), "vendored CSS");
