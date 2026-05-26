"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const wikiCss = fs.readFileSync(path.join(__dirname, "..", "public/wiki.css"), "utf8");
const redlinkRule = wikiCss.match(/([^{}]+)\{\s*color:\s*var\(--wiki-redlink-color,[^;]+;[\s\S]*?text-decoration:\s*var\(--wiki-redlink-decoration,[^;]+;[\s\S]*?\}/);

assert(redlinkRule, "wiki.css should include a redlink color/decoration rule");

const selectors = redlinkRule[1]
  .split(",")
  .map((selector) => selector.trim())
  .filter(Boolean);

assert(
  selectors.includes("a.wiki-redlink"),
  "forum links marked with wiki-redlink should render as redlinks outside .westgate-wiki"
);
assert(
  selectors.includes('a[href*="/wiki?"][href*="redlink=1"]'),
  "root namespace create links should render as redlinks before client hydration"
);

process.stdout.write("wiki redlink style tests passed\n");
