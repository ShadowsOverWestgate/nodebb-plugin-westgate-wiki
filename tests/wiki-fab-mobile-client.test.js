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

const rootDir = path.join(__dirname, "..");
const wikiJs = fs.readFileSync(path.join(rootDir, "public/wiki.js"), "utf8");

function createDom(isMobile) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="westgate-wiki">
      <nav class="wiki-fab-dock wiki-fab-dock--floating" aria-label="Page tools">
        <button type="button" data-wiki-scroll-top="1">Top</button>
      </nav>
    </div>
  </body></html>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://example.test/wiki/example"
  });

  const { window } = dom;
  window.config = { relative_path: "", csrf_token: "csrf" };
  window.ajaxify = { go: function () {} };
  window.app = { alert: function () {} };
  window.fetch = async function () {
    return {
      ok: true,
      headers: { get: function () { return "application/json"; } },
      json: async function () { return { response: {} }; },
      statusText: "OK"
    };
  };
  window.confirm = function () { return false; };
  window.alert = function () {};
  window.requestAnimationFrame = function (fn) {
    fn();
    return 1;
  };
  window.cancelAnimationFrame = function () {};
  window.matchMedia = function (query) {
    return {
      matches: query.indexOf("991px") !== -1 ? isMobile : false,
      media: query,
      addEventListener: function () {},
      removeEventListener: function () {},
      addListener: function () {},
      removeListener: function () {},
      dispatchEvent: function () { return false; }
    };
  };
  window.require = function (deps, onLoad) {
    if (typeof onLoad === "function") {
      onLoad({ on: function () {} });
    }
  };

  function JQueryCollection(nodes) {
    this.nodes = nodes || [];
    this.length = this.nodes.length;
  }
  JQueryCollection.prototype.ready = function (fn) {
    fn();
    return this;
  };
  JQueryCollection.prototype.on = function () {
    return this;
  };
  JQueryCollection.prototype.each = function (fn) {
    this.nodes.forEach(function (node, index) {
      fn.call(node, index, node);
    });
    return this;
  };
  JQueryCollection.prototype.first = function () {
    return new JQueryCollection(this.nodes.slice(0, 1));
  };
  JQueryCollection.prototype.attr = function (name) {
    return this.nodes[0] ? this.nodes[0].getAttribute(name) : undefined;
  };
  JQueryCollection.prototype.addClass = function (className) {
    this.nodes.forEach(function (node) {
      node.classList.add(className);
    });
    return this;
  };

  window.$ = function (arg) {
    if (arg === window.document || arg === window) {
      return new JQueryCollection([arg]);
    }
    if (typeof arg === "string") {
      return new JQueryCollection(Array.from(window.document.querySelectorAll(arg)));
    }
    return new JQueryCollection(arg ? [arg] : []);
  };
  window.jQuery = window.$;
  window.jQuery.fn = JQueryCollection.prototype;

  window.eval(wikiJs);
  return dom;
}

function setScrollY(window, value) {
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: value
  });
  window.dispatchEvent(new window.Event("scroll"));
}

test("mobile page tools hide on downward scroll and return on upward scroll", function () {
  const dom = createDom(true);
  const dock = dom.window.document.querySelector(".wiki-fab-dock--floating");

  setScrollY(dom.window, 10);
  assert.equal(dock.classList.contains("wiki-fab-dock--mobile-hidden"), false);

  setScrollY(dom.window, 90);
  assert.equal(dock.classList.contains("wiki-fab-dock--mobile-hidden"), true);
  assert.equal(dock.getAttribute("aria-hidden"), "true");

  setScrollY(dom.window, 40);
  assert.equal(dock.classList.contains("wiki-fab-dock--mobile-hidden"), false);
  assert.equal(dock.getAttribute("aria-hidden"), "false");
});

test("desktop page tools do not hide on downward scroll", function () {
  const dom = createDom(false);
  const dock = dom.window.document.querySelector(".wiki-fab-dock--floating");

  setScrollY(dom.window, 120);
  assert.equal(dock.classList.contains("wiki-fab-dock--mobile-hidden"), false);
});
