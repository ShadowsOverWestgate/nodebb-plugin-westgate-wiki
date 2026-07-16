"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const script = fs.readFileSync(path.join(__dirname, "..", "public/wiki-directory.js"), "utf8");

const { test } = require("node:test");

function createDom(options = {}) {
  const currentTidAttr = options.currentTid ? `data-current-tid="${options.currentTid}"` : "";
  const grandchildRow = options.includeNestedRows ? `
        <li class="wiki-sidebar-nav-row wiki-sidebar-nav-row--page" data-wiki-nav-tid="103">
          <a class="wiki-sidebar-nav-page" href="/wiki/lore/parent/child/grandchild">
            <span class="wiki-sidebar-parent-path">
              <span class="wiki-sidebar-parent-path__part">Parent</span>
              <span class="wiki-topic-title-separator" aria-hidden="true">/</span>
              <span class="wiki-sidebar-parent-path__part">Child</span>
            </span>
            <span class="wiki-topic-title-separator" aria-hidden="true">/</span>
            <span class="wiki-sidebar-page-title">Grandchild</span>
          </a>
        </li>` : "";
  const nieceRow = options.includeNestedRows ? `
        <li class="wiki-sidebar-nav-row wiki-sidebar-nav-row--page" data-wiki-nav-tid="104">
          <a class="wiki-sidebar-nav-page" href="/wiki/lore/sibling/niece">
            <span class="wiki-sidebar-parent-path">
              <span class="wiki-sidebar-parent-path__part">Sibling</span>
            </span>
            <span class="wiki-topic-title-separator" aria-hidden="true">/</span>
            <span class="wiki-sidebar-page-title">Niece</span>
          </a>
        </li>` : "";
  const dom = new JSDOM(`<!doctype html><html><body>
    <div
      class="wiki-sidebar-directory"
      data-wiki-directory-mount="1"
      data-cid="12"
      data-wiki-directory-endpoint="pages"
      data-wiki-directory-mode="nav"
      data-initial-has-more="0"
      ${currentTidAttr}
    >
      <ul class="wiki-sidebar-nav-rows wiki-sidebar-nav-rows--child-pages" data-wiki-directory-list role="list">
        <li class="wiki-sidebar-nav-row wiki-sidebar-nav-row--page" data-wiki-nav-tid="100">
          <a class="wiki-sidebar-nav-page" href="/wiki/lore/parent">
            <span class="wiki-sidebar-page-title">Parent</span>
          </a>
        </li>
        <li class="wiki-sidebar-nav-row wiki-sidebar-nav-row--page" data-wiki-nav-tid="101">
          <a class="wiki-sidebar-nav-page" href="/wiki/lore/parent/child">
            <span class="wiki-sidebar-parent-path">
              <span class="wiki-sidebar-parent-path__part">Parent</span>
            </span>
            <span class="wiki-topic-title-separator" aria-hidden="true">/</span>
            <span class="wiki-sidebar-page-title">Child</span>
          </a>
        </li>
        ${grandchildRow}
        <li class="wiki-sidebar-nav-row wiki-sidebar-nav-row--page" data-wiki-nav-tid="102">
          <a class="wiki-sidebar-nav-page" href="/wiki/lore/sibling">
            <span class="wiki-sidebar-page-title">Sibling</span>
          </a>
        </li>
        ${nieceRow}
      </ul>
      <p data-wiki-directory-status></p>
    </div>
  </body></html>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://example.test/wiki/lore/parent"
  });

  dom.window.config = { relative_path: "" };
  dom.window.jQuery = function () {
    return {
      on: function () {}
    };
  };
  dom.window.jQuery.fn = {};
  dom.window.console = console;
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded", { bubbles: true }));
  return dom;
}

test("dynamic directory renderers guard rows with blank wikiPath", function () {
  assert.match(script, /page\.hasWikiPath !== false && page\.wikiPath/);
  assert.match(script, /<span class=\\"wiki-index-entry-title wiki-index-entry-title--disabled\\"/);
  assert.match(script, /<span class=\\"wiki-sidebar-nav-page wiki-sidebar-nav-page--disabled\\"/);
});

test("navigation directory requests ask the API for pinned home ordering", function () {
  assert.match(script, /if \(navMode\) \{\s*params\.nav = "1";\s*\}/);
});

test("directory navigation rows with descendants get a caret that hides child rows", function () {
  const dom = createDom();
  const { document } = dom.window;
  const parentRow = document.querySelector('[data-wiki-nav-tid="100"]');
  const childRow = document.querySelector('[data-wiki-nav-tid="101"]');
  const siblingRow = document.querySelector('[data-wiki-nav-tid="102"]');
  const toggle = parentRow.querySelector(".wiki-directory-tree-toggle");

  assert.ok(toggle, "parent row should receive a disclosure caret");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(parentRow.classList.contains("wiki-directory-row--collapsed"), true);
  assert.equal(childRow.hidden, true);

  toggle.click();

  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(parentRow.classList.contains("wiki-directory-row--collapsed"), false);
  assert.equal(childRow.hidden, false);
  assert.equal(siblingRow.hidden, false);
});

test("navigation expands ancestor rows for the current subpage only", function () {
  const dom = createDom({ currentTid: 103, includeNestedRows: true });
  const { document } = dom.window;
  const parentRow = document.querySelector('[data-wiki-nav-tid="100"]');
  const childRow = document.querySelector('[data-wiki-nav-tid="101"]');
  const siblingRow = document.querySelector('[data-wiki-nav-tid="102"]');
  const grandchildRow = document.querySelector('[data-wiki-nav-tid="103"]');
  const nieceRow = document.querySelector('[data-wiki-nav-tid="104"]');
  const parentToggle = parentRow.querySelector(".wiki-directory-tree-toggle");
  const childToggle = childRow.querySelector(".wiki-directory-tree-toggle");
  const siblingToggle = siblingRow.querySelector(".wiki-directory-tree-toggle");

  assert.equal(grandchildRow.classList.contains("is-active"), true);
  assert.equal(parentToggle.getAttribute("aria-expanded"), "true");
  assert.equal(parentRow.classList.contains("wiki-directory-row--collapsed"), false);
  assert.equal(childRow.hidden, false);

  assert.equal(childToggle.getAttribute("aria-expanded"), "true");
  assert.equal(childRow.classList.contains("wiki-directory-row--collapsed"), false);
  assert.equal(grandchildRow.hidden, false);

  assert.equal(siblingToggle.getAttribute("aria-expanded"), "false");
  assert.equal(siblingRow.classList.contains("wiki-directory-row--collapsed"), true);
  assert.equal(nieceRow.hidden, true);
});
