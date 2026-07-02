"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const rootDir = path.join(__dirname, "..");
const composePageJs = fs.readFileSync(path.join(rootDir, "public/wiki-compose-page.js"), "utf8");

function encodePayloadB64(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function tick() {
  return new Promise(function (resolve) {
    setTimeout(resolve, 0);
  });
}

async function createComposeDom(fetchImpl, overrides = {}) {
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
    initialContent: "<p>Existing body</p>",
    ...overrides.payload
  };
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="westgate-wiki-compose" class="westgate-wiki-compose">
      <div id="westgate-wiki-compose-data" data-payload-b64="${encodePayloadB64(payload)}"></div>
      <label for="wiki-compose-title">Title</label>
      <input id="wiki-compose-title" value="${overrides.title || "CKEditor Page"}">
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

  const editCalls = [];
  const editDom = await createComposeDom(async function (url, options) {
    editCalls.push({ url: String(url), options: options || {} });
    if (String(url).includes("/page-title")) {
      return {
        ok: true,
        statusText: "OK",
        json: async function () {
          return {
            status: { code: "ok", message: "OK" },
            response: { ok: true, status: "ok" }
          };
        }
      };
    }
    return {
      ok: true,
      statusText: "OK",
      json: async function () {
        return {
          status: { code: "ok", message: "OK" },
          response: { tid: 12, wikiPath: "/wiki/Edited_Page" }
        };
      }
    };
  }, {
    title: "Edited Page"
  });

  editDom.window.document.getElementById("wiki-compose-submit").click();
  await tick();
  await tick();
  await tick();

  assert.equal(editCalls.length, 2);
  assert.equal(editCalls[1].url, "/api/v3/plugins/westgate-wiki/page/save");
  assert.equal(editCalls[1].options.method, "PUT");
  assert.equal(editCalls[1].options.headers["Content-Type"], undefined);
  assert.ok(editCalls[1].options.body instanceof editDom.window.FormData);
  assert.equal(editCalls[1].options.body.get("content"), "<p>Existing body</p>");
  assert.equal(editCalls[1].options.body.get("title"), "Edited Page");

  const publishCalls = [];
  const publishDom = await createComposeDom(async function (url, options) {
    publishCalls.push({ url: String(url), options: options || {} });
    if (String(url).includes("/page-title/check")) {
      return {
        ok: true,
        statusText: "OK",
        json: async function () {
          return {
            status: { code: "ok", message: "OK" },
            response: { ok: true, status: "ok" }
          };
        }
      };
    }
    return {
      ok: true,
      statusText: "OK",
      json: async function () {
        return {
          status: { code: "ok", message: "OK" },
          response: {
            tid: 99,
            slug: "99/alignment-lawful-good"
          }
        };
      }
    };
  }, {
    title: "Alignment :: Lawful Good",
    payload: {
      mode: "create",
      tid: undefined,
      mainPid: undefined,
      postEditUrl: undefined,
      sectionWikiPath: "/wiki/Guides"
    }
  });

  const publishSubmit = publishDom.window.document.getElementById("wiki-compose-submit");
  publishSubmit.click();
  await tick();
  await tick();
  await tick();

  assert.equal(
    publishDom.window.document.getElementById("wiki-compose-return").getAttribute("href"),
    "/wiki/Guides/Alignment/Lawful_Good",
    "standalone compose fallback redirects should use canonical title-path segments instead of flattened NodeBB slugs"
  );
  assert.equal(publishCalls.length, 2);
  assert.equal(publishSubmit.disabled, true);
  publishSubmit.click();
  await tick();
  assert.equal(publishCalls.length, 2);

  const cssFailureCalls = [];
  const cssFailureDom = await createComposeDom(async function (url, options) {
    cssFailureCalls.push({ url: String(url), options: options || {} });
    if (String(url).includes("/page-title/check")) {
      return {
        ok: true,
        statusText: "OK",
        json: async function () {
          return {
            status: { code: "ok", message: "OK" },
            response: { ok: true, status: "ok" }
          };
        }
      };
    }
    if (String(url).includes("/article-css")) {
      return {
        ok: false,
        statusText: "Bad Request",
        json: async function () {
          return { status: { message: "CSS rejected" } };
        }
      };
    }
    return {
      ok: true,
      statusText: "OK",
      json: async function () {
        return {
          status: { code: "ok", message: "OK" },
          response: {
            tid: 100,
            slug: "100/css-failure"
          }
        };
      }
    };
  }, {
    title: "CSS Failure",
    payload: {
      mode: "create",
      tid: undefined,
      mainPid: undefined,
      postEditUrl: undefined,
      sectionWikiPath: "/wiki/Guides",
      articleCssApiUrl: "/api/v3/plugins/westgate-wiki/article-css"
    }
  });

  const cssFailureSubmit = cssFailureDom.window.document.getElementById("wiki-compose-submit");
  cssFailureSubmit.click();
  await tick();
  await tick();
  await tick();

  assert.match(
    cssFailureDom.window.document.getElementById("wiki-compose-status").textContent,
    /Page saved, but article CSS was not updated/
  );
  assert.equal(cssFailureCalls.length, 3);
  assert.equal(cssFailureSubmit.disabled, true);
  cssFailureSubmit.click();
  await tick();
  assert.equal(cssFailureCalls.length, 3);

  process.stdout.write("wiki-compose save client tests passed\n");
})().catch(function (err) {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
