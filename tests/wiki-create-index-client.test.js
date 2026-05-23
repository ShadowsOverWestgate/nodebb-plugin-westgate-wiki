"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const rootDir = path.join(__dirname, "..");
const wikiJs = fs.readFileSync(path.join(rootDir, "public/wiki.js"), "utf8");

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createDom() {
  const hooks = {};
  const delegated = [];
  const ajaxifyCalls = [];
  const dom = new JSDOM(`<!doctype html><html><body>
    <a
      id="create-index"
      href="#"
      data-wiki-create-page="1"
      data-cid="20"
      data-title="Gond"
      data-wiki-create-redirect-path="/wiki/Lore/Deities/Gond"
      data-wiki-create-namespace-path="/wiki/Lore/Deities"
    >Create index page</a>
  </body></html>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://example.test/wiki/Lore/Deities/Gond"
  });

  const { window } = dom;
  window.config = { relative_path: "", csrf_token: "csrf" };
  window.ajaxify = {
    go(pathValue) {
      ajaxifyCalls.push(pathValue);
    }
  };
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
  window.matchMedia = function () {
    return {
      matches: false,
      addEventListener: function () {},
      removeEventListener: function () {},
      addListener: function () {},
      removeListener: function () {}
    };
  };
  window.require = function (deps, onLoad) {
    if (typeof onLoad === "function") {
      onLoad({
        on(name, fn) {
          hooks[name] = fn;
        }
      });
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
  JQueryCollection.prototype.on = function (eventName, selector, handler) {
    if (typeof selector === "string" && typeof handler === "function") {
      delegated.push({ eventName, selector, handler });
    }
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
  JQueryCollection.prototype.addClass = function () {
    return this;
  };
  JQueryCollection.prototype.removeClass = function () {
    return this;
  };
  JQueryCollection.prototype.text = function () {
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

  window.document.addEventListener("click", function (event) {
    delegated
      .filter((entry) => entry.eventName === "click" && event.target.matches(entry.selector))
      .forEach((entry) => entry.handler.call(event.target, event));
  });

  window.eval(wikiJs);
  return { window, hooks, ajaxifyCalls };
}

(async () => {
  const { window, hooks, ajaxifyCalls } = createDom();
  const createLink = window.document.getElementById("create-index");

  createLink.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(ajaxifyCalls[0], "wiki/compose/20?title=Gond");

  const submitPayload = {
    action: "topics.post",
    composerData: {},
    postData: {
      _wikiCreate: true,
      title: "Other Page"
    }
  };
  hooks["filter:composer.submit"](submitPayload);
  hooks["action:composer.topics.post"]({
    composerData: submitPayload.composerData,
    data: { slug: "88/other-page" }
  });

  assert.equal(
    ajaxifyCalls[1],
    "wiki/Lore/Deities/Other_Page",
    "edited namespace-index titles should redirect under the parent namespace path using canonical wiki segments"
  );

  process.stdout.write("wiki create index client tests passed\n");
})().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
