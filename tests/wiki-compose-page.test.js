"use strict";

const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = process.cwd();

test("compose template keeps status inside fullscreen floating actions", () => {
  const template = readFileSync(path.join(root, "templates/wiki-compose.tpl"), "utf8");
  const dom = new JSDOM(template);
  const actions = dom.window.document.querySelector(".wiki-compose-actions--floating");
  const status = dom.window.document.getElementById("wiki-compose-status");
  assert.ok(actions.contains(status));
  assert.ok(status.classList.contains("w-100"));
});
