"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const rootDir = path.join(__dirname, "..");
const composePageJs = fs.readFileSync(path.join(rootDir, "public/wiki-compose-page.js"), "utf8");
const wikiCss = fs.readFileSync(path.join(rootDir, "public/wiki.css"), "utf8");

function encodePayloadB64(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function tick() {
  return new Promise(function (resolve) {
    setTimeout(resolve, 0);
  });
}

async function createComposeDom(fetchImpl) {
  const payload = {
    relativePath: "",
    csrfToken: "csrf",
    cid: 1,
    mode: "edit",
    tid: 12,
    mainPid: 34,
    postEditUrl: "/api/v3/posts/34",
    wikiPageSaveApiUrl: "/api/v3/plugins/westgate-wiki/page/save",
    pageTitleCheckUrl: "/api/v3/plugins/westgate-wiki/page-title",
    initialContent: "<p>Existing body</p>"
  };
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="westgate-wiki-compose" class="westgate-wiki-compose">
      <div id="westgate-wiki-compose-data" data-payload-b64="${encodePayloadB64(payload)}"></div>
      <label for="wiki-compose-title">Title</label>
      <input id="wiki-compose-title" value="CKEditor Page">
      <div id="wiki-compose-editor"></div>
      <button id="wiki-compose-submit" type="button">Save</button>
      <p id="wiki-compose-status" class="text-muted"></p>
      <a id="wiki-compose-return" href="/wiki/ckeditor-page">Return</a>
    </div>
  </body></html>`, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "https://example.test/wiki/ckeditor-page/edit"
  });

  const { window } = dom;
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.WestgateWikiEditor = {
    createWikiEditor: async function () {
      return {
        getHTML: function () {
          return "<p>Existing body</p>";
        },
        hasPendingUploads: function () {
          return false;
        },
        destroy: async function () {},
        focus: function () {}
      };
    }
  };
  window.fetch = fetchImpl;
  window.eval(composePageJs);
  await window.westgateWikiInitComposePage();
  return dom;
}

(async function run() {
  const calls = [];
  const message = "A wiki page with this URL already exists in this namespace. Rename the page before publishing.";
  const dom = await createComposeDom(async function (url, options) {
    calls.push({ url: String(url), options: options || {} });
    return {
      ok: false,
      status: 304,
      statusText: "Not Modified",
      json: async function () {
        return {
          status: {
            code: "ok",
            message: "OK"
          },
          response: {
            ok: false,
            status: "page-collision",
            message: message,
            pageSlug: "ckeditor-page",
            wikiPath: "/wiki/ckeditor-page"
          }
        };
      }
    };
  });

  const { document } = dom.window;
  const submit = document.getElementById("wiki-compose-submit");
  submit.click();
  await tick();
  await tick();
  await tick();

  const dialog = document.querySelector(".wiki-compose-error-dialog");
  assert.ok(dialog, "page collisions should open a blocking compose error dialog");
  assert.equal(dialog.getAttribute("role"), "dialog");
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.match(dialog.textContent, /Page cannot be saved/);
  assert.match(dialog.textContent, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(dialog.textContent, /\/wiki\/ckeditor-page/);
  assert.equal(document.getElementById("wiki-compose-status").textContent, message);
  assert.equal(submit.disabled, false);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/v3\/plugins\/westgate-wiki\/page-title\?/);
  assert.equal(calls[0].options.cache, "no-store");

  assert.match(wikiCss, /\.wiki-compose-error-dialog-shell\s*{/);
  assert.match(wikiCss, /\.wiki-compose-error-dialog\s*{/);

  process.stdout.write("wiki-compose save client tests passed\n");
})().catch(function (err) {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
