import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { rmSync, writeFileSync } from "node:fs";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { installJsdomGlobals } from "./helpers/jsdom-setup.mjs";
import WikiCodeBlock from "../tiptap/src/extensions/wiki-code-block.mjs";

const require = createRequire(import.meta.url);
const wikiHtmlSanitizer = require("../lib/content/wiki-html-sanitizer");

installJsdomGlobals();

async function importEditorBundleForContract() {
  const moduleUrl = new URL(`../tiptap/src/.wiki-code-block-contract-${process.pid}.mjs`, import.meta.url);
  const source = (await import("node:fs/promises"))
    .readFile(new URL("../tiptap/src/wiki-editor-bundle.js", import.meta.url), "utf8")
    .then(text => text.replace(/import\s+["']\.\/wiki-editor\.css["'];\s*/, ""));
  writeFileSync(moduleUrl, await source);
  try {
    return await import(`${moduleUrl.href}?contract=${Date.now()}`);
  } finally {
    rmSync(moduleUrl, { force: true });
  }
}

function createEditor(content) {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const editor = new Editor({
    element: mount,
    extensions: [
      StarterKit.configure({
        codeBlock: false
      }),
      WikiCodeBlock
    ],
    content
  });
  return { editor, mount };
}

import { test } from "node:test";

await test("code blocks preserve registered common language classes", function () {
  const { editor, mount } = createEditor([
    '<pre><code class="language-javascript">const value = 1;</code></pre>',
    '<pre><code class="language-typescript">type Count = number;</code></pre>',
    '<pre><code class="language-json">{"enabled": true}</code></pre>',
    '<pre><code class="language-not-real">ignored()</code></pre>'
  ].join(""));

  const json = editor.getJSON();
  assert.equal(json.content[0].attrs.language, "javascript");
  assert.equal(json.content[1].attrs.language, "typescript");
  assert.equal(json.content[2].attrs.language, "json");
  assert.equal(json.content[3].attrs.language, null);
  assert.ok(
    editor.view.dom.querySelector(".hljs-keyword, .hljs-attr, .hljs-built_in"),
    "lowlight token decorations should render in the editor DOM"
  );

  editor.destroy();
  mount.remove();
});

await test("fullscreen source formatting preserves pre/code whitespace", async function () {
  const { createWikiEditor } = await importEditorBundleForContract();
  const host = document.createElement("div");
  host.className = "westgate-wiki-compose";
  document.body.appendChild(host);

  const wikiEditor = await createWikiEditor(host, {
    initialData: [
      '<pre><code class="language-javascript">',
      "function example() {",
      "\tconst value = 1;",
      "  return value;",
      "}",
      "</code></pre>"
    ].join("\n")
  });

  const toolbarMount = host.querySelector(".wiki-editor__toolbar-mount");
  toolbarMount.__wikiToggleFullscreenSource();
  const sourceTextarea = document.querySelector(".wiki-editor__fullscreen-source-input");

  assert.match(sourceTextarea.value, /function example\(\) \{\n\tconst value = 1;\n  return value;\n\}/);

  wikiEditor.destroy();
  host.remove();
});

await test("read-only wiki rendering applies highlight.js tokens to language code blocks", function () {
  const rendered = wikiHtmlSanitizer.renderReadOnlyWikiHtml([
    '<pre><code class="language-javascript">',
    "function example() {",
    "\tconst value = 1;",
    "  return value;",
    "}",
    "</code></pre>"
  ].join("\n"));

  assert.match(rendered, /data-wiki-code-highlighted="1"/);
  assert.match(rendered, /class="[^"]*\bhljs\b[^"]*"/);
  assert.match(rendered, /class="[^"]*\bhljs-keyword\b[^"]*"/);
  assert.match(
    rendered.replace(/<[^>]*>/g, ""),
    /function example\(\) \{\n\tconst value = 1;\n  return value;/
  );
});
