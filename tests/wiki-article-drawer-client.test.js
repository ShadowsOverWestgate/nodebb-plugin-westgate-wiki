"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`ok - ${name}\n`);
  } catch (err) {
    process.stderr.write(`not ok - ${name}\n`);
    throw err;
  }
}

const script = fs.readFileSync(path.join(__dirname, "..", "public/wiki-article-toc.js"), "utf8");

function createDom(articleBody, options = {}) {
  const smallViewport = options.smallViewport !== false;
  const url = options.url || "https://example.test/wiki/example";
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="wiki-page-shell-with-transform" style="transform: translateZ(0);">
      <div class="westgate-wiki">
        <article class="wiki-page-content wiki-article-prose card">
          <div class="card-body">${articleBody}</div>
        </article>
        <div class="wiki-article-drawers" data-wiki-article-drawers>
          <aside class="wiki-article-drawer wiki-article-drawer--nav" id="wiki-article-drawer-nav" data-wiki-article-drawer="nav">
            <button type="button" id="wiki-article-drawer-nav-toggle" data-wiki-drawer-toggle data-wiki-drawer-target="nav" aria-controls="wiki-article-drawer-nav" aria-expanded="false">Pages</button>
            <div class="wiki-article-drawer__panel"><a href="/wiki/example">Example</a></div>
          </aside>
          <aside class="wiki-article-drawer wiki-article-drawer--toc wiki-article-toc" id="wiki-article-drawer-toc" data-wiki-article-drawer="toc" data-wiki-article-toc-root hidden>
            <button type="button" id="wiki-article-drawer-toc-toggle" data-wiki-drawer-toggle data-wiki-drawer-target="toc" aria-controls="wiki-article-drawer-toc" aria-expanded="false">Contents</button>
            <nav data-wiki-article-toc></nav>
          </aside>
          <button type="button" data-wiki-drawer-backdrop hidden></button>
        </div>
      </div>
    </div>
  </body></html>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url
  });

  dom.window.matchMedia = function (query) {
    return {
      matches: smallViewport && query.indexOf("1199.98px") !== -1,
      media: query,
      addEventListener: function () {},
      removeEventListener: function () {},
      addListener: function () {},
      removeListener: function () {},
      dispatchEvent: function () { return false; }
    };
  };
  Object.defineProperty(dom.window, "innerWidth", { configurable: true, value: smallViewport ? 1024 : 1280 });
  dom.window.HTMLElement.prototype.scrollIntoView = function () {
    this.setAttribute("data-scrolled-into-view", "1");
  };
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

test("drawer root stays inside the wiki shell without article-bound viewport variables", function () {
  const dom = createDom("<h2>Alpha section</h2><p>Text</p>");
  const root = dom.window.document.querySelector("[data-wiki-article-drawers]");
  const shell = dom.window.document.querySelector(".wiki-page-shell-with-transform");

  assert.notEqual(root.parentNode, dom.window.document.body);
  assert.equal(shell.querySelector("[data-wiki-article-drawers]"), root);
  assert.equal(root.style.getPropertyValue("--wiki-article-drawer-viewport-left"), "");
  assert.equal(root.style.getPropertyValue("--wiki-article-drawer-viewport-right"), "");
});

test("drawer toggles update open state, aria, backdrop, and Escape close", function () {
  const dom = createDom("<h2>Alpha section</h2><p>Text</p>");
  const { document, KeyboardEvent } = dom.window;
  const navDrawer = document.getElementById("wiki-article-drawer-nav");
  const navToggle = document.getElementById("wiki-article-drawer-nav-toggle");
  const backdrop = document.querySelector("[data-wiki-drawer-backdrop]");

  assert.equal(document.getElementById("wiki-article-drawer-toc").hasAttribute("hidden"), false);

  navToggle.click();
  assert.equal(navDrawer.classList.contains("wiki-article-drawer--open"), true);
  assert.equal(navToggle.getAttribute("aria-expanded"), "true");
  assert.equal(backdrop.hasAttribute("hidden"), false);
  assert.equal(document.documentElement.classList.contains("wiki-article-drawer-modal-open"), true);

  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(navDrawer.classList.contains("wiki-article-drawer--open"), false);
  assert.equal(navToggle.getAttribute("aria-expanded"), "false");
  assert.equal(backdrop.hasAttribute("hidden"), true);
  assert.equal(document.documentElement.classList.contains("wiki-article-drawer-modal-open"), false);
});

test("ToC drawer stays hidden when the article has no headings", function () {
  const dom = createDom("<p>Text without headings</p>");
  const tocDrawer = dom.window.document.getElementById("wiki-article-drawer-toc");

  assert.equal(tocDrawer.hasAttribute("hidden"), true);
  assert.equal(tocDrawer.getAttribute("aria-hidden"), "true");
});

test("desktop ToC link scrolls and releases focus so focus-within does not pin drawer open", function () {
  const dom = createDom("<h2>Alpha section</h2><p>Text</p>", { smallViewport: false });
  const { document } = dom.window;
  const anchor = document.querySelector(".wiki-article-toc__link");
  const heading = document.getElementById("alpha-section");

  anchor.focus();
  assert.equal(document.activeElement, anchor);

  anchor.click();

  assert.equal(heading.getAttribute("data-scrolled-into-view"), "1");
  assert.equal(dom.window.location.hash, "#alpha-section");
  assert.notEqual(document.activeElement, anchor);
});

test("article ToC headings with children start expanded with an accessible collapse caret", function () {
  const dom = createDom("<h2>Parent</h2><h3>Child</h3><h2>Sibling</h2>");
  const { document } = dom.window;
  const parentItem = document.querySelector(".wiki-article-toc__item");
  const toggle = parentItem.querySelector(".wiki-article-toc__toggle");
  const childList = parentItem.querySelector(".wiki-article-toc__ol--nest");

  assert.ok(toggle, "parent heading should receive a disclosure caret");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(parentItem.classList.contains("wiki-article-toc__item--collapsed"), false);
  assert.equal(childList.hidden, false);

  toggle.click();

  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(parentItem.classList.contains("wiki-article-toc__item--collapsed"), true);
  assert.equal(childList.hidden, true);
});

test("article ToC displays heading labels in title-style casing", function () {
  const dom = createDom([
    "<h2>WORSHIP AND PRACTICE</h2>",
    "<h3>daily practices</h3>",
    "<h4>relations with other faiths</h4>",
    "<h2>THE FAITH ACROSS FAERÛN</h2>",
    "<h3>opening a pr</h3>"
  ].join(""));
  const { document } = dom.window;
  const labels = Array.from(document.querySelectorAll(".wiki-article-toc__link"))
    .map((link) => link.textContent);
  const ids = Array.from(document.querySelectorAll(".wiki-article-toc__heading"))
    .map((heading) => heading.id);

  assert.deepEqual(labels, [
    "Worship and Practice",
    "Daily Practices",
    "Relations with Other Faiths",
    "The Faith Across Faerûn",
    "Opening a PR"
  ]);
  assert.deepEqual(ids, [
    "worship-and-practice",
    "daily-practices",
    "relations-with-other-faiths",
    "the-faith-across-faerun",
    "opening-a-pr"
  ]);
});

test("article headings scroll to the current hash after generated ids are assigned", function () {
  const dom = createDom("<h2>Alpha section</h2><p>Text</p>", {
    url: "https://example.test/wiki/example#alpha-section"
  });
  const heading = dom.window.document.getElementById("alpha-section");

  assert.equal(heading.getAttribute("data-scrolled-into-view"), "1");
});
