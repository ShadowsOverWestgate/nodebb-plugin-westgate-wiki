"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const originalMainRequire = require.main.require.bind(require.main);

require.main.require = function requireNodebbStub(id) {
  const stubs = {
    nconf: {
      get: () => ""
    },
    "./src/categories": {
      getChildrenCids: async () => []
    },
    "./src/meta": {
      settings: {
        get: async () => ({}),
        setOnEmpty: async () => {},
        set: async () => {}
      }
    },
    "./src/topics": {},
    "./src/slugify": (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  };

  if (!stubs[id]) {
    return originalMainRequire(id);
  }
  return stubs[id];
};

const wikiHtmlParse = require("../lib/wiki-html-parse");

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`ok - ${name}\n`);
  } catch (err) {
    process.stderr.write(`not ok - ${name}\n`);
    throw err;
  }
}

test("looksLikeWikiStoredHtml accepts topdata bot pages that begin with marker comments", function () {
  const html = fs.readFileSync(
    path.join(__dirname, "fixtures/topdata-bot/managed-manual-page.html"),
    "utf8"
  );

  assert.equal(wikiHtmlParse.looksLikeWikiStoredHtml(html), true);
});
