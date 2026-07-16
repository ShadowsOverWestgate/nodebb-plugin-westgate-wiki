"use strict";

const assert = require("node:assert/strict");

const { test } = require("node:test");

test("package scripts and dependencies are Tiptap-only", function () {
  const pkg = require("../package.json");

  assert.match(pkg.scripts["build:tiptap"], /\bvite build\b/);
  assert.match(pkg.scripts["build:tiptap"], /\btiptap\/vite\.config\.mjs\b/);
  assert.equal(pkg.scripts["build:ckeditor"], undefined);
  assert.match(pkg.scripts["build:editors"], /\bbuild:tiptap\b/);
  assert.equal(pkg.devDependencies.ckeditor5, undefined);
});

test("compose assets expose a stable cache version", function () {
  const composeAssets = require("../lib/core/compose-assets");

  assert.equal(typeof composeAssets.getAssetVersion, "function");
  const first = composeAssets.getAssetVersion();
  assert.equal(typeof first, "string");
  assert.ok(first.length > 0);
  assert.equal(composeAssets.getAssetVersion(), first);
});
