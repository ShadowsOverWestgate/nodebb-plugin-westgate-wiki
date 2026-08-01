"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const { installConfirmStub } = require("./helpers/wiki-confirm-dom");

const root = path.resolve(__dirname, "..");
const client = fs.readFileSync(path.join(root, "public", "wiki-manage.js"), "utf8");

function row(tid, tombstoned) {
  return `
    <tr data-wiki-manage-row="${tid}" data-title="Page ${tid}" data-tombstoned="${tombstoned ? "1" : "0"}" data-purgeable="1">
      <td data-wiki-manage-flags>${tombstoned ? '<span class="badge bg-secondary" data-wiki-manage-tombstone-badge="1">tombstoned</span>' : ""}</td>
      <td>
        <a href="/wiki/history/${tid}">History</a>
        ${tombstoned ?
    `<button type="button" data-wiki-manage-restore="1" data-tid="${tid}">Restore</button>` :
    `<button type="button" data-wiki-manage-tombstone="1" data-tid="${tid}">Tombstone</button>`}
      </td>
    </tr>`;
}

function createDom(options = {}) {
  const rows = (options.rows || [[101, false], [102, true]]).map(([tid, tombstoned]) => row(tid, tombstoned)).join("");
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="wiki-manage-page" data-wiki-manage="1" data-busy="0" data-purge-chunk="${options.chunk || 2}">
      <section data-wiki-manage-namespace="7">
        <h2>
          <span data-wiki-manage-staged-count>0</span>
          ${options.canPurge === false ? "" : '<button type="button" data-wiki-manage-purge="7" data-name="Lore">Purge tombstoned (<span data-wiki-manage-purge-count>0</span>)</button>'}
        </h2>
        <table><tbody>${rows}</tbody></table>
      </section>
      <div class="wiki-manage-purge-bar">
        <span data-wiki-manage-status role="status" aria-live="polite"></span>
        <button type="button" data-wiki-manage-cancel="1" hidden>Cancel</button>
        <button type="button" data-wiki-manage-purge="0" data-name="the whole wiki">Purge all (<span data-wiki-manage-purge-count>0</span>)</button>
      </div>
    </div>
  </body></html>`, { runScripts: "outside-only", url: "https://forum.example/wiki/manage" });

  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  return dom;
}

function tick(dom, times = 3) {
  let chain = Promise.resolve();
  for (let i = 0; i < times; i += 1) {
    chain = chain.then(() => new Promise((resolve) => dom.window.setTimeout(resolve, 0)));
  }
  return chain;
}

function start(dom, fetchImpl) {
  const calls = [];
  dom.window.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
    return fetchImpl ? fetchImpl(String(url), JSON.parse(init.body), calls.length) : { ok: true, json: async () => ({ response: { ok: true } }) };
  };
  dom.window.eval(client);
  return calls;
}

function click(dom, selector) {
  const node = dom.window.document.querySelector(selector);
  assert.ok(node, `expected ${selector} in the manage page`);
  node.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  return node;
}

test("tombstone and restore swap the row in place, with no confirmation and no navigation", async () => {
  const dom = createDom();
  const modal = installConfirmStub(dom);
  const calls = start(dom);
  const before = dom.window.location.href;

  click(dom, '[data-wiki-manage-row="101"] [data-wiki-manage-tombstone]');
  await tick(dom);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/v3/plugins/westgate-wiki/page/tombstone");
  assert.equal(calls[0].method, "PUT");
  assert.deepEqual(calls[0].body, { tid: 101 });
  assert.equal(modal.calls.length, 0, "a reversible action never prompts");
  assert.equal(dom.window.location.href, before, "the row updates without navigating");

  const updated = dom.window.document.querySelector('[data-wiki-manage-row="101"]');
  assert.equal(updated.getAttribute("data-tombstoned"), "1");
  assert.ok(updated.querySelector("[data-wiki-manage-tombstone-badge]"), "the row shows its tombstoned flag");
  const button = updated.querySelector("[data-wiki-manage-restore]");
  assert.ok(button, "the same button position now offers the undo");
  assert.equal(button.textContent, "Restore");

  button.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await tick(dom);

  assert.equal(calls[1].url, "/api/v3/plugins/westgate-wiki/page/restore");
  assert.equal(modal.calls.length, 0, "restore is symmetric and just as cheap");
  assert.equal(updated.getAttribute("data-tombstoned"), "0");
  assert.equal(updated.querySelector("[data-wiki-manage-tombstone-badge]"), null);
  assert.ok(updated.querySelector("[data-wiki-manage-tombstone]"), "the button flips back");
});

test("a failed action says so instead of pretending the page was tombstoned", async () => {
  const dom = createDom();
  installConfirmStub(dom);
  start(dom, async () => ({ ok: false, statusText: "Conflict", json: async () => ({ status: { message: "wiki-page-locked" } }) }));

  click(dom, '[data-wiki-manage-row="101"] [data-wiki-manage-tombstone]');
  await tick(dom);

  const target = dom.window.document.querySelector('[data-wiki-manage-row="101"]');
  assert.equal(target.getAttribute("data-tombstoned"), "0", "a refused action does not mark the row");
  assert.match(dom.window.document.querySelector("[data-wiki-manage-status]").textContent, /wiki-page-locked/);
});

test("the purge control counts what is staged and is disabled when nothing is", async () => {
  const dom = createDom({ rows: [[101, false]] });
  installConfirmStub(dom);
  const calls = start(dom);
  await tick(dom);

  const namespaceButton = dom.window.document.querySelector('[data-wiki-manage-purge="7"]');
  assert.equal(namespaceButton.disabled, true, "no work to do, no control to press");
  assert.equal(namespaceButton.querySelector("[data-wiki-manage-purge-count]").textContent, "0");

  click(dom, '[data-wiki-manage-row="101"] [data-wiki-manage-tombstone]');
  await tick(dom);

  assert.equal(namespaceButton.disabled, false);
  assert.equal(namespaceButton.querySelector("[data-wiki-manage-purge-count]").textContent, "1");
  assert.equal(dom.window.document.querySelector("[data-wiki-manage-staged-count]").textContent, "1");
  assert.equal(
    dom.window.document.querySelector('[data-wiki-manage-purge="0"] [data-wiki-manage-purge-count]').textContent,
    "1",
    "the wiki-wide control counts every namespace"
  );

  namespaceButton.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
  await tick(dom);
  assert.equal(calls.filter((call) => call.method === "DELETE").length, 0, "a disabled-then-enabled control still needs confirmation");
});

test("purge asks once for the whole batch, only fires when confirmed, and clears the rows it purged", async () => {
  const dom = createDom({ rows: [[101, true], [102, true], [103, true]], chunk: 2 });
  const modal = installConfirmStub(dom, { typed: null });
  const chunks = [
    { purged: [101, 102], failed: [], remaining: 1, done: false },
    { purged: [103], failed: [], remaining: 0, done: true }
  ];
  const calls = start(dom, async () => ({ ok: true, json: async () => ({ response: chunks.shift() }) }));

  click(dom, '[data-wiki-manage-purge="7"]');
  await tick(dom);

  assert.equal(modal.calls.length, 1, "one dialog for the batch");
  assert.match(modal.calls[0].message, /Lore/, "the confirmation names the namespace");
  assert.match(modal.calls[0].message, /3 tombstoned/, "the confirmation names the exact count");
  assert.match(modal.calls[0].message, /cannot be undone/i);
  assert.equal(calls.length, 0, "nothing fires until the typed confirmation matches");

  modal.typed = "Lore";
  click(dom, '[data-wiki-manage-purge="7"]');
  await tick(dom, 6);

  assert.equal(modal.calls.length, 2, "still exactly one dialog per batch");
  assert.deepEqual(calls.map((call) => call.method), ["DELETE", "DELETE"], "long batches run in bounded chunks");
  assert.deepEqual(calls[0].body, { cid: 7, limit: 2 });
  assert.equal(dom.window.document.querySelectorAll("[data-wiki-manage-row]").length, 0, "purged rows disappear without a reload");
  assert.match(dom.window.document.querySelector("[data-wiki-manage-status]").textContent, /Purged 3 page\(s\)/);
});

test("a partly failed batch names the pages that failed and why", async () => {
  const dom = createDom({ rows: [[101, true], [102, true]] });
  installConfirmStub(dom, { typed: "Lore" });
  // The locked page stays tombstoned, so the next chunk hits it again.
  const chunks = [
    { purged: [101], failed: [{ tid: 102, reason: "topic-locked" }], remaining: 1, done: false },
    { purged: [], failed: [{ tid: 102, reason: "topic-locked" }], remaining: 1, done: false }
  ];
  start(dom, async () => ({ ok: true, json: async () => ({ response: chunks.shift() }) }));

  click(dom, '[data-wiki-manage-purge="7"]');
  await tick(dom, 8);

  const status = dom.window.document.querySelector("[data-wiki-manage-status]").textContent;
  assert.match(status, /Purged 1 page\(s\)/);
  assert.match(status, /102/);
  assert.match(status, /topic-locked/);
  assert.ok(dom.window.document.querySelector('[data-wiki-manage-row="102"]'), "a failed page stays in the list to retry");
});

test("controls are disabled while a batch runs and cancelling stops further chunks", async () => {
  const dom = createDom({ rows: [[101, true], [102, true], [103, true]], chunk: 1 });
  installConfirmStub(dom, { typed: "Lore" });

  let release = null;
  const pending = [];
  const calls = start(dom, () => new Promise((resolve) => {
    pending.push(resolve);
    release = resolve;
  }));

  click(dom, '[data-wiki-manage-purge="7"]');
  await tick(dom);

  const scope = dom.window.document.querySelector("[data-wiki-manage]");
  assert.equal(scope.getAttribute("data-busy"), "1");
  assert.equal(dom.window.document.querySelector('[data-wiki-manage-purge="0"]').disabled, true, "no second overlapping batch");
  assert.equal(dom.window.document.querySelector("[data-wiki-manage-restore]").disabled, true);
  assert.equal(dom.window.document.querySelector("[data-wiki-manage-cancel]").hidden, false);

  click(dom, "[data-wiki-manage-cancel]");
  release({ ok: true, json: async () => ({ response: { purged: [101], failed: [], remaining: 2, done: false } }) });
  await tick(dom, 6);

  assert.equal(calls.length, 1, "cancelling stops further chunks");
  assert.equal(pending.length, 1);
  assert.equal(scope.getAttribute("data-busy"), "0");
  assert.equal(dom.window.document.querySelector('[data-wiki-manage-row="101"]'), null, "work already committed stands");
  assert.ok(dom.window.document.querySelector('[data-wiki-manage-row="102"]'), "the rest is left tombstoned, not half-purged");
  assert.match(dom.window.document.querySelector("[data-wiki-manage-status]").textContent, /Cancelled after purging 1/);
});

test("a manager who cannot purge still sees the staged count and the outcome of each click", async () => {
  const dom = createDom({ rows: [[101, false]], canPurge: false });
  installConfirmStub(dom);
  start(dom);
  await tick(dom);

  click(dom, '[data-wiki-manage-row="101"] [data-wiki-manage-tombstone]');
  await tick(dom);

  assert.equal(
    dom.window.document.querySelector("[data-wiki-manage-staged-count]").textContent,
    "1",
    "the count does not depend on holding the purge privilege"
  );
  assert.match(
    dom.window.document.querySelector("[data-wiki-manage-status]").textContent,
    /Tombstoned/,
    "the outcome is announced even with no purge controls on the page"
  );
});

test("no destructive wiki client action depends on the browser's native dialogs", () => {
  const clientScripts = fs.readdirSync(path.join(root, "public"))
    .filter((name) => name.endsWith(".js"));

  clientScripts.forEach((name) => {
    const source = fs.readFileSync(path.join(root, "public", name), "utf8");
    assert.equal(
      /window\.(confirm|prompt)\s*\(/.test(source),
      false,
      `${name} must confirm through the forum modal: a browser dialog can be permanently suppressed by the user's "prevent additional dialogs" checkbox`
    );
  });
});

// public/wiki.js binds its handlers with jQuery delegation. This is the
// smallest stub that actually delivers a delegated click.
function installDelegatingJQuery(dom) {
  function collection(nodes) {
    return {
      length: nodes.length,
      ready(fn) { fn(); return this; },
      on(type, selector, handler) {
        const listener = typeof selector === "function" ? selector : handler;
        nodes.forEach((node) => node.addEventListener(type, (event) => {
          const match = typeof selector === "string" ?
            (event.target.closest ? event.target.closest(selector) : null) :
            node;
          if (match) {
            listener.call(match, Object.create(event, {
              currentTarget: { value: match },
              preventDefault: { value: () => event.preventDefault() }
            }));
          }
        }));
        return this;
      },
      each() { return this; },
      first() { return collection(nodes.slice(0, 1)); },
      attr(name) { return nodes[0] ? nodes[0].getAttribute(name) : undefined; },
      addClass() { return this; }
    };
  }

  dom.window.$ = function query(arg) {
    if (typeof arg === "string") {
      return collection(Array.from(dom.window.document.querySelectorAll(arg)));
    }
    return collection(arg ? [arg] : []);
  };
  dom.window.jQuery = dom.window.$;
  dom.window.jQuery.fn = {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  dom.window.requestAnimationFrame = (fn) => { fn(); return 1; };
  dom.window.require = (deps, onLoad) => { if (typeof onLoad === "function") { onLoad({ on() {} }); } };
}

test("the article page tombstone confirms through the forum modal, not a browser dialog", async () => {
  const wikiClient = fs.readFileSync(path.join(root, "public", "wiki.js"), "utf8");
  const dom = new JSDOM(`<!doctype html><html><body>
    <button type="button" data-wiki-tombstone-page="1" data-tid="55" data-redirect-href="/wiki/Lore">Hide</button>
  </body></html>`, { runScripts: "outside-only", url: "https://forum.example/wiki/Lore/Page" });

  dom.window.config = { relative_path: "", csrf_token: "csrf" };
  installDelegatingJQuery(dom);
  const modal = installConfirmStub(dom, { confirmed: false });

  const calls = [];
  dom.window.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method });
    return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ response: { ok: true } }) };
  };

  dom.window.eval(wikiClient);
  await tick(dom);

  click(dom, "[data-wiki-tombstone-page]");
  await tick(dom);

  assert.equal(modal.calls.length, 1, "the page-level tombstone still confirms, since it navigates away");
  assert.equal(calls.length, 0, "a declined confirmation tombstones nothing");

  modal.confirmed = true;
  click(dom, "[data-wiki-tombstone-page]");
  await tick(dom, 5);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/v3/plugins/westgate-wiki/page/tombstone");
});
