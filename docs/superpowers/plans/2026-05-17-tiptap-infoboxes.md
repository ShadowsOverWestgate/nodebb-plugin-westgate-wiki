# Tiptap Infoboxes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class, copy/paste-safe wiki infoboxes to the Tiptap editor.

**Architecture:** Implement infoboxes as a plugin-owned Tiptap extension named `wikiInfobox`, with helper nodes for title, subtitle, image slot, section labels, key/value rows, and freeform content. Keep saved HTML, sanitizer, normalization, rendered CSS, editor CSS, toolbar wiring, slash commands, and ToC exclusion aligned as one content contract.

**Tech Stack:** NodeBB plugin, Tiptap 3, ProseMirror schema/commands, vanilla DOM contextual tools, shared sanitizer config, JSDOM contract tests, Vite vendored editor build.

---

## File Structure

- Create `tiptap/src/extensions/wiki-infobox.mjs`
  - Own `wikiInfobox` and helper nodes: title, subtitle, image, section, rows, row, term, value, content.
  - Own insertion, helper insertion, helper movement, unwrap, and delete commands.
- Modify `tiptap/src/wiki-editor-bundle.js`
  - Import/register `WikiInfobox`, add main toolbar action, add slash command items, add vertical rail UI, add icons.
- Modify `tiptap/src/toolbar/toolbar-schema.mjs`
  - Add the main `infobox-insert` top-toolbar button id.
  - Add `INFOBOX_CONTEXT_BUTTON_IDS` for the vertical rail.
- Modify `tiptap/src/extensions/container-block.mjs`
  - Prevent `.wiki-infobox` and `[data-wiki-node="infobox"]` from parsing as generic containers.
- Modify `tiptap/src/normalization/legacy-html.mjs`
  - Treat infoboxes as plugin-owned structures.
  - Normalize the supported pasted `<aside class="infobox">` pattern.
  - Keep `dl`, `dt`, and `dd` supported because infobox key/value rows use them.
- Modify `shared/wiki-html-sanitizer-config.json`
  - Preserve infobox wrapper/helper tags, classes, and data attributes through client/server sanitizer contracts.
- Modify `lib/wiki-page-toc.js`
  - Exclude headings whose HTML range is inside a saved infobox.
- Modify `tiptap/src/toolbar/editor-toc.mjs`
  - Exclude heading nodes whose resolved position is inside `wikiInfobox`.
- Modify `public/wiki-article-body.css`
  - Add rendered article infobox styles, desktop float, and narrow full-width layout.
- Modify `tiptap/src/wiki-editor.css`
  - Add editor infobox styles, active selection affordance, and vertical rail styling.
- Modify `tests/wiki-editor-contract.test.mjs`
  - Add extension parse/render, commands, toolbar/slash wiring, editor ToC, CSS, and vendored parity tests.
- Modify `tests/wiki-html-sanitizer.test.js`
  - Add server sanitizer tests for infobox preservation and unsafe attribute/style removal.
- Modify `tests/wiki-page-toc.test.js`
  - Add article ToC exclusion tests for infobox-local headings.
- Modify `public/vendor/tiptap/wiki-tiptap.bundle.js` and `public/vendor/tiptap/wiki-tiptap.css`
  - Regenerate with `npm run build:tiptap` after source changes pass.

## Task 1: Sanitizer, Normalization, And ToC Contract Tests

**Files:**
- Modify: `tests/wiki-html-sanitizer.test.js`
- Modify: `tests/wiki-page-toc.test.js`
- Modify: `tests/wiki-editor-contract.test.mjs`
- Modify: `shared/wiki-html-sanitizer-config.json`
- Modify: `lib/wiki-page-toc.js`
- Modify: `tiptap/src/normalization/legacy-html.mjs`
- Modify: `tiptap/src/extensions/container-block.mjs`

- [ ] **Step 1: Add server sanitizer tests**

Add these tests to `tests/wiki-html-sanitizer.test.js` after the existing callout sanitizer test:

```js
test("sanitizeWikiHtml preserves wiki infobox structure and helper data attributes", function () {
  const html = [
    '<aside class="wiki-infobox unsafe-extra" data-wiki-node="infobox" onclick="alert(1)">',
    '  <div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene Voss</div>',
    '  <div class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle">Vampire Noble</div>',
    '  <figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img src="https://example.com/selene.png" alt="Selene"></figure>',
    '  <div class="wiki-infobox__section" data-wiki-infobox-part="section">Details</div>',
    '  <dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">',
    '    <div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div>',
    '  </dl>',
    '  <div class="wiki-infobox__content" data-wiki-infobox-part="content"><p>Optional notes.</p></div>',
    '</aside>'
  ].join("");
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /<aside class="wiki-infobox unsafe-extra" data-wiki-node="infobox">/);
  assert.match(sanitized, /class="wiki-infobox__title" data-wiki-infobox-part="title"/);
  assert.match(sanitized, /class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle"/);
  assert.match(sanitized, /class="wiki-infobox__image" data-wiki-infobox-part="image"/);
  assert.match(sanitized, /class="wiki-infobox__section" data-wiki-infobox-part="section"/);
  assert.match(sanitized, /class="wiki-infobox__rows" data-wiki-infobox-part="rows"/);
  assert.match(sanitized, /class="wiki-infobox__row" data-wiki-infobox-part="row"/);
  assert.match(sanitized, /<dt>House<\/dt><dd>Voss<\/dd>/);
  assert.doesNotMatch(sanitized, /onclick/);
});

test("sanitizeWikiHtml strips unsafe styles from wiki infoboxes", function () {
  const html = '<aside class="wiki-infobox" data-wiki-node="infobox" style="position:fixed; color:#caa55a"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Title</div></aside>';
  const sanitized = wikiHtmlSanitizer.sanitizeWikiHtml(html);

  assert.match(sanitized, /class="wiki-infobox"/);
  assert.match(sanitized, /style="color:#caa55a"/);
  assert.doesNotMatch(sanitized, /position:/);
});
```

- [ ] **Step 2: Add article ToC exclusion tests**

Add this test to `tests/wiki-page-toc.test.js` after the existing heading tests:

```js
test("extractHeadingToc ignores headings inside wiki infoboxes", function () {
  const headings = wikiPageToc.extractHeadingToc(`
    <h2>Overview</h2>
    <aside class="wiki-infobox" data-wiki-node="infobox">
      <h2>Infobox Title</h2>
      <div class="wiki-infobox__section" data-wiki-infobox-part="section"><h3>Infobox Details</h3></div>
      <aside class="wiki-callout"><h3>Nested Callout Heading</h3></aside>
    </aside>
    <h2>History</h2>
  `);

  assert.deepStrictEqual(headings, [
    { id: "overview", text: "Overview", level: 2 },
    { id: "history", text: "History", level: 2 }
  ]);
});
```

- [ ] **Step 3: Add client normalization tests**

Add these tests near the existing normalization tests:

```js
await test("normalizeLegacyHtmlForTiptap preserves saved infoboxes as plugin-owned structures", function () {
  const normalized = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene</div><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div></dl></aside>'
  );

  assert.match(normalized, /<aside class="wiki-infobox" data-wiki-node="infobox">/);
  assert.match(normalized, /data-wiki-infobox-part="title"/);
  assert.match(normalized, /<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">/);
  assert.match(normalized, /<dt>House<\/dt><dd>Voss<\/dd>/);
});

await test("normalizeLegacyHtmlForTiptap upgrades simple pasted infobox class names", function () {
  const normalized = normalizeLegacyHtmlForTiptap(
    '<aside class="infobox"><div class="title">Selene</div><div class="subtitle">Vampire Noble</div><div class="section">Details</div><div class="content"><p>Notes</p></div></aside>'
  );

  assert.match(normalized, /<aside class="wiki-infobox" data-wiki-node="infobox">/);
  assert.match(normalized, /class="wiki-infobox__title" data-wiki-infobox-part="title"/);
  assert.match(normalized, /class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle"/);
  assert.match(normalized, /class="wiki-infobox__section" data-wiki-infobox-part="section"/);
  assert.match(normalized, /class="wiki-infobox__content" data-wiki-infobox-part="content"/);
});
```

- [ ] **Step 4: Run focused tests and verify they fail**

Run:

```bash
node tests/wiki-html-sanitizer.test.js
node tests/wiki-page-toc.test.js
node tests/wiki-editor-contract.test.mjs
```

Expected:

- Article ToC tests fail because infobox headings are still scanned.
- Editor tests fail because normalization does not recognize infoboxes.
- Sanitizer tests pass only if the existing shared allowlist already preserves every required infobox tag and attribute.

- [ ] **Step 5: Update sanitizer config for infobox helper tags**

In `shared/wiki-html-sanitizer-config.json`, confirm these tags are present in `allowedTags`:

```json
"aside",
"dd",
"div",
"dl",
"dt",
"figure",
"img"
```

Keep the existing wildcard attributes so these attributes remain allowed:

```json
"class",
"data-*",
"style"
```

No new unsafe style property is needed. Keep using the existing `color`, `background-color`, `border-color`, `border-style`, `border-width`, `width`, and `height` allowlists.

- [ ] **Step 6: Add infobox-aware normalization helpers**

In `tiptap/src/normalization/legacy-html.mjs`, add `dd`, `dl`, and `dt` to `SUPPORTED_TIPTAP_TAGS`:

```js
"dd",
"dl",
"dt",
```

Add helpers before `isInsidePluginOwnedStructure()`:

```js
function isPluginOwnedInfoboxElement(element) {
  if (!element || !element.matches) {
    return false;
  }
  return element.matches('[data-wiki-node="infobox"], .wiki-infobox');
}

function isInsideInfobox(element) {
  return !!(element && element.closest && element.closest('[data-wiki-node="infobox"], .wiki-infobox'));
}

const INFOBOX_PART_CLASS_MAP = new Map([
  ["title", "wiki-infobox__title"],
  ["subtitle", "wiki-infobox__subtitle"],
  ["image", "wiki-infobox__image"],
  ["section", "wiki-infobox__section"],
  ["rows", "wiki-infobox__rows"],
  ["row", "wiki-infobox__row"],
  ["content", "wiki-infobox__content"]
]);

function setInfoboxPart(element, part) {
  const className = INFOBOX_PART_CLASS_MAP.get(part);
  if (!className) {
    return;
  }
  element.className = className;
  element.setAttribute("data-wiki-infobox-part", part);
}

export function normalizeWikiInfoboxes(document, root) {
  root.querySelectorAll("aside.infobox, aside.wiki-infobox, aside[data-wiki-node='infobox']").forEach(function (element) {
    element.className = "wiki-infobox";
    element.setAttribute("data-wiki-node", "infobox");

    Array.from(element.children || []).forEach(function (child) {
      const classList = child.classList ? Array.from(child.classList) : [];
      const part = classList.find(function (className) {
        return INFOBOX_PART_CLASS_MAP.has(className.replace(/^wiki-infobox__/, ""));
      });
      if (part) {
        setInfoboxPart(child, part.replace(/^wiki-infobox__/, ""));
      }
    });
  });
}
```

Update `isInsidePluginOwnedStructure()` to include infoboxes:

```js
return !!(element && element.closest && element.closest('[data-wiki-node="alignment-table"], figure.wiki-poetry-quote, [data-wiki-node="poetry-quote"], [data-wiki-node="infobox"], .wiki-infobox'));
```

Update `isPluginOwnedMediaLayoutElement()` or rename it to a general plugin-owned check by adding:

```js
return element.matches('[data-wiki-node="media-row"], [data-wiki-node="media-cell"], .wiki-media-row, .wiki-media-cell, [data-wiki-node="infobox"], .wiki-infobox');
```

Call `normalizeWikiInfoboxes(doc, root);` in `normalizeLegacyHtmlForTiptap()` before the generic wrapper normalization loop.

Skip definition-list flattening inside infoboxes:

```js
root.querySelectorAll("dt").forEach(function (element) {
  if (isInsideInfobox(element)) {
    return;
  }
  ...
});

root.querySelectorAll("dd").forEach(function (element) {
  if (isInsideInfobox(element)) {
    return;
  }
  renameElement(doc, element, "p");
});

root.querySelectorAll("dl").forEach(function (element) {
  if (isInsideInfobox(element)) {
    return;
  }
  unwrapElement(element);
});
```

- [ ] **Step 7: Prevent generic container parsing of infoboxes**

In `tiptap/src/extensions/container-block.mjs`, update `isPluginOwnedStructuredContainer()`:

```js
return classList.contains("wiki-media-row") ||
  classList.contains("wiki-media-cell") ||
  classList.contains("wiki-infobox") ||
  element.getAttribute("data-wiki-node") === "infobox";
```

- [ ] **Step 8: Exclude infobox headings from rendered article ToC**

In `lib/wiki-page-toc.js`, add helpers before `extractHeadingToc()`:

```js
function parseTagAttributes(source) {
  return {
    className: getHtmlAttribute(source, "class"),
    wikiNode: getHtmlAttribute(source, "data-wiki-node")
  };
}

function isInfoboxOpeningTag(tagSource) {
  const attrs = parseTagAttributes(tagSource);
  return attrs.wikiNode === "infobox" || String(attrs.className || "").split(/\s+/).includes("wiki-infobox");
}

function buildInfoboxRanges(html) {
  const ranges = [];
  const stack = [];
  const tagRe = /<\/?([a-z0-9-]+)\b[^>]*>/gi;
  let match;

  while ((match = tagRe.exec(String(html || "")))) {
    const source = match[0];
    const tagName = String(match[1] || "").toLowerCase();
    const isClosing = /^<\//.test(source);
    const isSelfClosing = /\/>$/.test(source);

    if (isClosing) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const entry = stack[index];
        stack.splice(index, stack.length - index);
        if (entry.tagName === tagName && entry.infoboxStart != null) {
          ranges.push({ start: entry.infoboxStart, end: tagRe.lastIndex });
          break;
        }
        if (entry.tagName === tagName) {
          break;
        }
      }
      continue;
    }

    if (!isSelfClosing) {
      stack.push({
        tagName,
        infoboxStart: tagName === "aside" && isInfoboxOpeningTag(source) ? match.index : null
      });
    }
  }

  return ranges;
}

function isIndexInsideRanges(index, ranges) {
  return ranges.some((range) => index >= range.start && index < range.end);
}
```

In `extractHeadingToc(html)`, add:

```js
const infoboxRanges = buildInfoboxRanges(html);
```

Then skip matched headings inside infoboxes:

```js
if (isIndexInsideRanges(match.index, infoboxRanges)) {
  continue;
}
```

- [ ] **Step 9: Re-run focused contract tests**

Run:

```bash
node tests/wiki-html-sanitizer.test.js
node tests/wiki-page-toc.test.js
node tests/wiki-editor-contract.test.mjs
```

Expected:

- Server sanitizer, article ToC, and normalization contract tests pass.

- [ ] **Step 10: Commit contract groundwork**

Run:

```bash
git add tests/wiki-html-sanitizer.test.js tests/wiki-page-toc.test.js tests/wiki-editor-contract.test.mjs shared/wiki-html-sanitizer-config.json lib/wiki-page-toc.js tiptap/src/normalization/legacy-html.mjs tiptap/src/extensions/container-block.mjs
git commit -m "test: define wiki infobox content contract"
```

## Task 2: Tiptap Infobox Extension And Commands

**Files:**
- Create: `tiptap/src/extensions/wiki-infobox.mjs`
- Modify: `tests/wiki-editor-contract.test.mjs`
- Modify: `tiptap/src/toolbar/editor-toc.mjs`

- [ ] **Step 1: Add parse/render and command tests**

In `tests/wiki-editor-contract.test.mjs`, wire the test editor to the future infobox extension before adding tests:

- Add `import("../tiptap/src/extensions/wiki-infobox.mjs")` to the dynamic source import list.
- Add `WikiInfoboxModule` to the destructured module list in the same position.
- Bind `const WikiInfobox = WikiInfoboxModule.default;`.
- Bind named helper exports from `WikiInfoboxModule`.
- Register helper nodes before `WikiInfobox` in `createEditor()`.

Add these tests to `tests/wiki-editor-contract.test.mjs` after callout or poetry quote extension tests:

```js
await test("wikiInfobox parses and renders the saved HTML contract", function () {
  const editor = createEditor(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene Voss</div><div class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle">Vampire Noble</div><figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img src="/selene.png" alt="Selene"></figure><div class="wiki-infobox__section" data-wiki-infobox-part="section">Details</div><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div></dl><div class="wiki-infobox__content" data-wiki-infobox-part="content"><p>Optional notes.</p></div></aside>'
  );
  const json = editor.getJSON();
  const rendered = editor.getHTML();

  assert.equal(findJsonNode(json, "wikiInfobox").type, "wikiInfobox");
  assert.equal(findJsonNode(json, "wikiInfoboxTitle").type, "wikiInfoboxTitle");
  assert.equal(findJsonNode(json, "wikiInfoboxSubtitle").type, "wikiInfoboxSubtitle");
  assert.equal(findJsonNode(json, "wikiInfoboxImage").type, "wikiInfoboxImage");
  assert.equal(findJsonNode(json, "wikiInfoboxRows").type, "wikiInfoboxRows");
  assert.equal(findJsonNode(json, "wikiInfoboxRow").type, "wikiInfoboxRow");
  assert.match(rendered, /<aside class="wiki-infobox" data-wiki-node="infobox">/);
  assert.match(rendered, /class="wiki-infobox__title" data-wiki-infobox-part="title"/);
  assert.match(rendered, /<dt>House<\/dt><dd>Voss<\/dd>/);
  editor.destroy();
});

await test("wikiInfobox insert command creates a starter infobox", function () {
  const editor = createEditor("<p>Start</p>");

  assert.equal(editor.commands.insertWikiInfobox(), true);
  const rendered = editor.getHTML();

  assert.match(rendered, /data-wiki-node="infobox"/);
  assert.match(rendered, /data-wiki-infobox-part="title"/);
  assert.match(rendered, /Untitled Infobox/);
  assert.match(rendered, /data-wiki-infobox-part="row"/);
  editor.destroy();
});

await test("wikiInfobox internal commands insert supported helper blocks", function () {
  const editor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene</div></aside>');

  editor.commands.setTextSelection(3);
  assert.equal(editor.commands.addWikiInfoboxSubtitle(), true);
  assert.equal(editor.commands.addWikiInfoboxImage(), true);
  assert.equal(editor.commands.addWikiInfoboxSection(), true);
  assert.equal(editor.commands.addWikiInfoboxRow(), true);
  assert.equal(editor.commands.addWikiInfoboxContent(), true);

  const rendered = editor.getHTML();
  assert.match(rendered, /data-wiki-infobox-part="subtitle"/);
  assert.match(rendered, /data-wiki-infobox-part="image"/);
  assert.match(rendered, /data-wiki-infobox-part="section"/);
  assert.match(rendered, /<dt>Label<\/dt><dd>Value<\/dd>/);
  assert.match(rendered, /data-wiki-infobox-part="content"/);
  editor.destroy();
});

await test("wikiInfobox unwrap and delete commands affect only the active infobox", function () {
  const editor = createEditor('<p>Before</p><aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene</div></aside><p>After</p>');

  editor.commands.setTextSelection(10);
  assert.equal(editor.commands.unwrapWikiInfobox(), true);
  let rendered = editor.getHTML();
  assert.doesNotMatch(rendered, /wiki-infobox/);
  assert.match(rendered, /<p>Before<\/p>/);
  assert.match(rendered, /Selene/);
  assert.match(rendered, /<p>After<\/p>/);

  editor.commands.setContent('<p>Before</p><aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene</div></aside><p>After</p>', false);
  editor.commands.setTextSelection(10);
  assert.equal(editor.commands.deleteWikiInfobox(), true);
  rendered = editor.getHTML();
  assert.doesNotMatch(rendered, /Selene/);
  assert.match(rendered, /<p>Before<\/p>/);
  assert.match(rendered, /<p>After<\/p>/);
  editor.destroy();
});
```

Add this test near existing editor ToC tests:

```js
await test("buildHeadingToc excludes headings inside wikiInfobox nodes", function () {
  const editor = createEditor(
    '<h2>Overview</h2><aside class="wiki-infobox" data-wiki-node="infobox"><h2>Infobox Heading</h2><div class="wiki-infobox__section" data-wiki-infobox-part="section">Details</div></aside><h2>History</h2>'
  );
  const toc = buildHeadingToc(editor);

  assert.deepEqual(toc.map(function (item) { return item.text; }), ["Overview", "History"]);
  editor.destroy();
});
```

- [ ] **Step 2: Run tests and verify extension failures**

Run:

```bash
node tests/wiki-editor-contract.test.mjs
```

Expected: FAIL because `tiptap/src/extensions/wiki-infobox.mjs` does not exist and the commands are missing.

- [ ] **Step 3: Create `wiki-infobox.mjs` with schema nodes**

Create `tiptap/src/extensions/wiki-infobox.mjs`:

```js
import { Node, mergeAttributes } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";

function normalizeText(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function findActiveInfoboxContext(state, infoboxTypeName) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === infoboxTypeName) {
      return {
        node,
        pos: $from.before(depth),
        depth
      };
    }
  }
  return null;
}

function setSelectionNear(tr, pos, bias) {
  const selectionPos = Math.max(0, Math.min(pos, tr.doc.content.size));
  return tr.setSelection(Selection.near(tr.doc.resolve(selectionPos), bias || 1));
}

function createTextNode(state, text) {
  return text ? state.schema.text(text) : null;
}

function createParagraph(state, text) {
  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) {
    return null;
  }
  const textNode = createTextNode(state, text);
  return paragraphType.create(null, textNode ? [textNode] : undefined);
}

function createHelperNode(state, typeName, text) {
  const type = state.schema.nodes[typeName];
  if (!type) {
    return null;
  }
  const textNode = createTextNode(state, text);
  return type.create(null, textNode ? [textNode] : undefined);
}

function createInfoboxRowNode(state, label, value) {
  const rowType = state.schema.nodes.wikiInfoboxRow;
  const termType = state.schema.nodes.wikiInfoboxTerm;
  const valueType = state.schema.nodes.wikiInfoboxValue;
  if (!rowType || !termType || !valueType) {
    return null;
  }
  return rowType.create(null, [
    termType.create(null, [state.schema.text(normalizeText(label, "Label"))]),
    valueType.create(null, [state.schema.text(normalizeText(value, "Value"))])
  ]);
}

function createInfoboxRowsNode(state, label, value) {
  const rowsType = state.schema.nodes.wikiInfoboxRows;
  if (!rowsType) {
    return null;
  }
  return rowsType.create(null, [createInfoboxRowNode(state, label, value)].filter(Boolean));
}

function createInfoboxImageNode(state) {
  const imageType = state.schema.nodes.wikiInfoboxImage;
  const paragraph = createParagraph(state, "Add image or caption");
  return imageType && paragraph ? imageType.create(null, [paragraph]) : null;
}

function insertIntoActiveInfobox(state, dispatch, infoboxTypeName, node) {
  const context = findActiveInfoboxContext(state, infoboxTypeName);
  if (!context || !node) {
    return false;
  }

  const insertPos = context.pos + context.node.nodeSize - 1;
  if (dispatch) {
    const tr = state.tr.insert(insertPos, node);
    dispatch(setSelectionNear(tr, insertPos + 1).scrollIntoView());
  }
  return true;
}

function replaceActiveInfobox(state, dispatch, infoboxTypeName, replacement) {
  const context = findActiveInfoboxContext(state, infoboxTypeName);
  if (!context) {
    return false;
  }
  if (dispatch) {
    const tr = replacement
      ? state.tr.replaceWith(context.pos, context.pos + context.node.nodeSize, replacement)
      : state.tr.delete(context.pos, context.pos + context.node.nodeSize);
    dispatch(setSelectionNear(tr, context.pos, -1).scrollIntoView());
  }
  return true;
}

export const WikiInfoboxTitle = Node.create({
  name: "wikiInfoboxTitle",
  group: "block",
  content: "inline*",
  defining: true,
  parseHTML() {
    return [{ tag: '[data-wiki-infobox-part="title"]' }, { tag: ".wiki-infobox__title" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "wiki-infobox__title", "data-wiki-infobox-part": "title" }), 0];
  }
});

export const WikiInfoboxSubtitle = Node.create({
  name: "wikiInfoboxSubtitle",
  group: "block",
  content: "inline*",
  defining: true,
  parseHTML() {
    return [{ tag: '[data-wiki-infobox-part="subtitle"]' }, { tag: ".wiki-infobox__subtitle" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "wiki-infobox__subtitle", "data-wiki-infobox-part": "subtitle" }), 0];
  }
});

export const WikiInfoboxImage = Node.create({
  name: "wikiInfoboxImage",
  group: "block",
  content: "block*",
  defining: true,
  parseHTML() {
    return [{ tag: 'figure[data-wiki-infobox-part="image"]' }, { tag: "figure.wiki-infobox__image" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { class: "wiki-infobox__image", "data-wiki-infobox-part": "image" }), 0];
  }
});

export const WikiInfoboxSection = Node.create({
  name: "wikiInfoboxSection",
  group: "block",
  content: "inline*",
  defining: true,
  parseHTML() {
    return [{ tag: '[data-wiki-infobox-part="section"]' }, { tag: ".wiki-infobox__section" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "wiki-infobox__section", "data-wiki-infobox-part": "section" }), 0];
  }
});

export const WikiInfoboxTerm = Node.create({
  name: "wikiInfoboxTerm",
  content: "inline*",
  defining: true,
  parseHTML() {
    return [{ tag: "dt" }];
  },
  renderHTML() {
    return ["dt", 0];
  }
});

export const WikiInfoboxValue = Node.create({
  name: "wikiInfoboxValue",
  content: "inline*",
  defining: true,
  parseHTML() {
    return [{ tag: "dd" }];
  },
  renderHTML() {
    return ["dd", 0];
  }
});

export const WikiInfoboxRow = Node.create({
  name: "wikiInfoboxRow",
  content: "wikiInfoboxTerm wikiInfoboxValue",
  defining: true,
  parseHTML() {
    return [{ tag: '[data-wiki-infobox-part="row"]' }, { tag: ".wiki-infobox__row" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "wiki-infobox__row", "data-wiki-infobox-part": "row" }), 0];
  }
});

export const WikiInfoboxRows = Node.create({
  name: "wikiInfoboxRows",
  group: "block",
  content: "wikiInfoboxRow+",
  defining: true,
  parseHTML() {
    return [{ tag: 'dl[data-wiki-infobox-part="rows"]' }, { tag: "dl.wiki-infobox__rows" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["dl", mergeAttributes(HTMLAttributes, { class: "wiki-infobox__rows", "data-wiki-infobox-part": "rows" }), 0];
  }
});

export const WikiInfoboxContent = Node.create({
  name: "wikiInfoboxContent",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML() {
    return [{ tag: '[data-wiki-infobox-part="content"]' }, { tag: ".wiki-infobox__content" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "wiki-infobox__content", "data-wiki-infobox-part": "content" }), 0];
  }
});

const WikiInfobox = Node.create({
  name: "wikiInfobox",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  draggable: true,
  parseHTML() {
    return [{ tag: '[data-wiki-node="infobox"]' }, { tag: "aside.wiki-infobox" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes, { class: "wiki-infobox", "data-wiki-node": "infobox" }), 0];
  },
  addCommands() {
    return {
      insertWikiInfobox:
        () =>
        ({ commands, state }) => {
          return commands.insertContent({
            type: this.name,
            content: [
              { type: "wikiInfoboxTitle", content: [{ type: "text", text: "Untitled Infobox" }] },
              { type: "wikiInfoboxRows", content: [{ type: "wikiInfoboxRow", content: [{ type: "wikiInfoboxTerm", content: [{ type: "text", text: "Label" }] }, { type: "wikiInfoboxValue", content: [{ type: "text", text: "Value" }] }] }] }
            ]
          });
        },
      addWikiInfoboxTitle:
        () =>
        ({ state, dispatch }) => insertIntoActiveInfobox(state, dispatch, this.name, createHelperNode(state, "wikiInfoboxTitle", "Title")),
      addWikiInfoboxSubtitle:
        () =>
        ({ state, dispatch }) => insertIntoActiveInfobox(state, dispatch, this.name, createHelperNode(state, "wikiInfoboxSubtitle", "Subtitle")),
      addWikiInfoboxImage:
        () =>
        ({ state, dispatch }) => insertIntoActiveInfobox(state, dispatch, this.name, createInfoboxImageNode(state)),
      addWikiInfoboxSection:
        () =>
        ({ state, dispatch }) => insertIntoActiveInfobox(state, dispatch, this.name, createHelperNode(state, "wikiInfoboxSection", "Section")),
      addWikiInfoboxRow:
        () =>
        ({ state, dispatch }) => insertIntoActiveInfobox(state, dispatch, this.name, createInfoboxRowsNode(state, "Label", "Value")),
      addWikiInfoboxContent:
        () =>
        ({ state, dispatch }) => insertIntoActiveInfobox(state, dispatch, this.name, state.schema.nodes.wikiInfoboxContent.create(null, [createParagraph(state, "Freeform content")].filter(Boolean))),
      unwrapWikiInfobox:
        () =>
        ({ state, dispatch }) => {
          const context = findActiveInfoboxContext(state, this.name);
          return context ? replaceActiveInfobox(state, dispatch, this.name, context.node.content) : false;
        },
      deleteWikiInfobox:
        () =>
        ({ state, dispatch }) => replaceActiveInfobox(state, dispatch, this.name, null)
    };
  }
});

export default WikiInfobox;
```

- [ ] **Step 4: Register helper nodes in test editor**

In `tests/wiki-editor-contract.test.mjs`, import named exports:

```js
const {
  WikiInfoboxContent,
  WikiInfoboxImage,
  WikiInfoboxRow,
  WikiInfoboxRows,
  WikiInfoboxSection,
  WikiInfoboxSubtitle,
  WikiInfoboxTerm,
  WikiInfoboxTitle,
  WikiInfoboxValue
} = WikiInfoboxModule;
```

Register helper nodes before `WikiInfobox`:

```js
WikiInfoboxTitle,
WikiInfoboxSubtitle,
WikiInfoboxImage,
WikiInfoboxSection,
WikiInfoboxRows,
WikiInfoboxRow,
WikiInfoboxTerm,
WikiInfoboxValue,
WikiInfoboxContent,
WikiInfobox,
```

- [ ] **Step 5: Exclude infobox headings from editor ToC**

In `tiptap/src/toolbar/editor-toc.mjs`, add:

```js
function isPositionInsideNodeType(doc, pos, typeName) {
  const resolved = doc.resolve(Math.min(Math.max(pos + 1, 0), doc.content.size));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name === typeName) {
      return true;
    }
  }
  return false;
}
```

Inside `buildHeadingToc(editor)`, before creating a ToC item:

```js
if (isPositionInsideNodeType(editor.state.doc, pos, "wikiInfobox")) {
  return true;
}
```

- [ ] **Step 6: Run extension contract tests**

Run:

```bash
node tests/wiki-editor-contract.test.mjs
```

Expected: PASS for infobox parse/render/command tests with the `dl > div > dt/dd` saved HTML contract.

- [ ] **Step 7: Commit the infobox extension**

Run:

```bash
git add tests/wiki-editor-contract.test.mjs tiptap/src/extensions/wiki-infobox.mjs tiptap/src/toolbar/editor-toc.mjs
git commit -m "feat: add wiki infobox extension"
```

## Task 3: Editor Registration, Toolbar Button, And Slash Commands

**Files:**
- Modify: `tiptap/src/wiki-editor-bundle.js`
- Modify: `tiptap/src/toolbar/toolbar-schema.mjs`
- Modify: `tests/wiki-editor-contract.test.mjs`

- [ ] **Step 1: Add toolbar schema tests**

Update the existing toolbar schema test in `tests/wiki-editor-contract.test.mjs` so the `blocks` group expects `infobox-insert`:

```js
const blocks = TOP_TOOLBAR_GROUPS.find(function (group) { return group.id === "blocks"; });
assert.deepEqual(blocks.buttonIds, ["bullet-list", "ordered-list", "task-list", "blockquote", "code-block", "block-background", "horizontal-rule", "infobox-insert"]);
assert.equal(TOP_TOOLBAR_BUTTON_IDS.includes("infobox-insert"), true);
```

Add source contract assertions:

```js
await test("editor bundle wires infobox extension, toolbar action, and slash command", function () {
  assert.match(editorBundleSource, /import\s+WikiInfobox/);
  assert.match(editorBundleSource, /WikiInfoboxTitle/);
  assert.match(editorBundleSource, /infobox-insert/);
  assert.match(editorBundleSource, /insertWikiInfobox\(\)/);
  assert.match(editorBundleSource, /label:\s*"Infobox"/);
});
```

- [ ] **Step 2: Run tests and verify toolbar failures**

Run:

```bash
node tests/wiki-editor-contract.test.mjs
```

Expected: FAIL because the toolbar schema and bundle do not include infobox wiring.

- [ ] **Step 3: Update toolbar schema**

In `tiptap/src/toolbar/toolbar-schema.mjs`, append `infobox-insert` to the `blocks` group:

```js
{
  id: "blocks",
  label: "Blocks",
  buttonIds: ["bullet-list", "ordered-list", "task-list", "blockquote", "code-block", "block-background", "horizontal-rule", "infobox-insert"]
}
```

- [ ] **Step 4: Import and register infobox nodes in the editor bundle**

In `tiptap/src/wiki-editor-bundle.js`, add:

```js
import WikiInfobox, {
  WikiInfoboxContent,
  WikiInfoboxImage,
  WikiInfoboxRow,
  WikiInfoboxRows,
  WikiInfoboxSection,
  WikiInfoboxSubtitle,
  WikiInfoboxTerm,
  WikiInfoboxTitle,
  WikiInfoboxValue
} from "./extensions/wiki-infobox.mjs";
```

Add button icons:

```js
"infobox-insert": "fa-info-circle",
```

Register nodes after `WikiPoetryQuote`:

```js
WikiInfoboxTitle,
WikiInfoboxSubtitle,
WikiInfoboxImage,
WikiInfoboxSection,
WikiInfoboxRows,
WikiInfoboxRow,
WikiInfoboxTerm,
WikiInfoboxValue,
WikiInfoboxContent,
WikiInfobox,
```

- [ ] **Step 5: Add slash item and action**

Add to `BASE_SLASH_ITEMS`:

```js
{ id: "infobox-insert", label: "Infobox", aliases: ["info box", "sidebar", "wiki box"] },
```

Add to `createWikiSlashItems()` actions:

```js
"infobox-insert": function () {
  editor.chain().focus().insertWikiInfobox().run();
}
```

- [ ] **Step 6: Add the main toolbar button**

In `createToolbar()`, in the `blocks` group, add:

```js
{
  id: "infobox-insert",
  title: "Insert infobox",
  action: function () {
    editor.chain().focus().insertWikiInfobox().run();
  }
}
```

- [ ] **Step 7: Run focused editor contract tests**

Run:

```bash
node tests/wiki-editor-contract.test.mjs
```

Expected: PASS for toolbar schema and bundle source assertions.

- [ ] **Step 8: Commit editor insertion wiring**

Run:

```bash
git add tests/wiki-editor-contract.test.mjs tiptap/src/wiki-editor-bundle.js tiptap/src/toolbar/toolbar-schema.mjs
git commit -m "feat: wire infobox insertion into editor"
```

## Task 4: Vertical Infobox Rail And Internal Tools

**Files:**
- Modify: `tiptap/src/wiki-editor-bundle.js`
- Modify: `tiptap/src/toolbar/toolbar-schema.mjs`
- Modify: `tiptap/src/extensions/wiki-infobox.mjs`
- Modify: `tests/wiki-editor-contract.test.mjs`

- [ ] **Step 1: Add rail source and command tests**

Add to `tests/wiki-editor-contract.test.mjs`:

```js
await test("infobox vertical rail source exposes all internal helper actions", function () {
  assert.match(editorBundleSource, /function\s+createInfoboxContextToolbar\s*\(/);
  assert.match(editorBundleSource, /wiki-editor-infobox-rail/);
  [
    "infobox-add-title",
    "infobox-add-subtitle",
    "infobox-add-image",
    "infobox-add-section",
    "infobox-add-row",
    "infobox-add-content",
    "infobox-move-helper-up",
    "infobox-move-helper-down",
    "infobox-delete-helper",
    "infobox-unwrap",
    "infobox-delete"
  ].forEach(function (id) {
    assert.match(editorBundleSource, new RegExp(id));
  });
});

await test("wikiInfobox helper movement commands reorder helper blocks", function () {
  const editor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Title</div><div class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle">Subtitle</div></aside>');

  editor.commands.setTextSelection(9);
  assert.equal(editor.commands.moveWikiInfoboxHelperDown(), true);
  let rendered = editor.getHTML();
  assert.ok(rendered.indexOf("Subtitle") < rendered.indexOf("Title"));

  editor.commands.setTextSelection(9);
  assert.equal(editor.commands.moveWikiInfoboxHelperUp(), true);
  rendered = editor.getHTML();
  assert.ok(rendered.indexOf("Title") < rendered.indexOf("Subtitle"));
  editor.destroy();
});

await test("wikiInfobox delete helper command removes only the active helper block", function () {
  const editor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Title</div><div class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle">Subtitle</div></aside>');

  editor.commands.setTextSelection(9);
  assert.equal(editor.commands.deleteWikiInfoboxHelper(), true);
  const rendered = editor.getHTML();
  assert.doesNotMatch(rendered, /Title/);
  assert.match(rendered, /Subtitle/);
  assert.match(rendered, /wiki-infobox/);
  editor.destroy();
});
```

- [ ] **Step 2: Run tests and verify rail/helper failures**

Run:

```bash
node tests/wiki-editor-contract.test.mjs
```

Expected: FAIL because rail source and helper movement/delete commands are missing.

- [ ] **Step 3: Add helper context functions to `wiki-infobox.mjs`**

In `tiptap/src/extensions/wiki-infobox.mjs`, add:

```js
const INFOBOX_HELPER_NODE_NAMES = new Set([
  "wikiInfoboxTitle",
  "wikiInfoboxSubtitle",
  "wikiInfoboxImage",
  "wikiInfoboxSection",
  "wikiInfoboxRows",
  "wikiInfoboxContent"
]);

function findActiveInfoboxHelperContext(state, infoboxTypeName) {
  const infobox = findActiveInfoboxContext(state, infoboxTypeName);
  if (!infobox) {
    return null;
  }
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > infobox.depth; depth -= 1) {
    const node = $from.node(depth);
    if (INFOBOX_HELPER_NODE_NAMES.has(node.type.name)) {
      return {
        infobox,
        node,
        pos: $from.before(depth),
        depth
      };
    }
  }
  return null;
}

function moveNode(state, dispatch, from, to, insertPos) {
  const node = state.doc.nodeAt(from);
  if (!node) {
    return false;
  }
  if (dispatch) {
    let tr = state.tr.delete(from, to);
    const mappedInsertPos = insertPos > from ? insertPos - node.nodeSize : insertPos;
    tr = tr.insert(mappedInsertPos, node);
    dispatch(setSelectionNear(tr, mappedInsertPos + 1).scrollIntoView());
  }
  return true;
}
```

Add commands:

```js
moveWikiInfoboxHelperUp:
  () =>
  ({ state, dispatch }) => {
    const context = findActiveInfoboxHelperContext(state, this.name);
    if (!context) {
      return false;
    }
    const resolved = state.doc.resolve(context.pos);
    const parent = resolved.node(resolved.depth);
    const index = resolved.index(resolved.depth);
    if (!parent || index <= 0) {
      return false;
    }
    const previous = parent.child(index - 1);
    if (!INFOBOX_HELPER_NODE_NAMES.has(previous.type.name)) {
      return false;
    }
    return moveNode(state, dispatch, context.pos, context.pos + context.node.nodeSize, context.pos - previous.nodeSize);
  },
moveWikiInfoboxHelperDown:
  () =>
  ({ state, dispatch }) => {
    const context = findActiveInfoboxHelperContext(state, this.name);
    if (!context) {
      return false;
    }
    const resolved = state.doc.resolve(context.pos);
    const parent = resolved.node(resolved.depth);
    const index = resolved.index(resolved.depth);
    if (!parent || index >= parent.childCount - 1) {
      return false;
    }
    const next = parent.child(index + 1);
    if (!INFOBOX_HELPER_NODE_NAMES.has(next.type.name)) {
      return false;
    }
    return moveNode(state, dispatch, context.pos, context.pos + context.node.nodeSize, context.pos + context.node.nodeSize + next.nodeSize);
  },
deleteWikiInfoboxHelper:
  () =>
  ({ state, dispatch }) => {
    const context = findActiveInfoboxHelperContext(state, this.name);
    if (!context) {
      return false;
    }
    if (dispatch) {
      const tr = state.tr.delete(context.pos, context.pos + context.node.nodeSize);
      dispatch(setSelectionNear(tr, context.pos, -1).scrollIntoView());
    }
    return true;
  }
```

- [ ] **Step 4: Add context button ids**

In `tiptap/src/toolbar/toolbar-schema.mjs`, add:

```js
export const INFOBOX_CONTEXT_BUTTON_IDS = [
  "infobox-add-title",
  "infobox-add-subtitle",
  "infobox-add-image",
  "infobox-add-section",
  "infobox-add-row",
  "infobox-add-content",
  "infobox-move-helper-up",
  "infobox-move-helper-down",
  "infobox-delete-helper",
  "infobox-unwrap",
  "infobox-delete"
];
```

- [ ] **Step 5: Add active infobox DOM lookup and rail positioning**

In `tiptap/src/wiki-editor-bundle.js`, import `INFOBOX_CONTEXT_BUTTON_IDS`:

```js
import { IMAGE_CONTEXT_BUTTON_IDS, INFOBOX_CONTEXT_BUTTON_IDS, TOP_TOOLBAR_BUTTON_IDS, TOP_TOOLBAR_GROUPS } from "./toolbar/toolbar-schema.mjs";
```

Add button icons:

```js
"infobox-add-title": "fa-header",
"infobox-add-subtitle": "fa-text-height",
"infobox-add-image": "fa-image",
"infobox-add-section": "fa-bookmark",
"infobox-add-row": "fa-list-alt",
"infobox-add-content": "fa-paragraph",
"infobox-move-helper-up": "fa-arrow-up",
"infobox-move-helper-down": "fa-arrow-down",
"infobox-delete-helper": "fa-minus",
"infobox-unwrap": "fa-outdent",
"infobox-delete": "fa-trash",
```

Add lookup helper near existing context helpers:

```js
function getActiveInfoboxElement(editor, surface) {
  const selectedDom = editor.view.nodeDOM(editor.state.selection.from);
  if (selectedDom && selectedDom.nodeType === 1 && selectedDom.matches('[data-wiki-node="infobox"]') && surface.contains(selectedDom)) {
    return selectedDom;
  }
  const selectionElement = getSelectionElement(editor);
  const infobox = selectionElement && typeof selectionElement.closest === "function" ? selectionElement.closest('[data-wiki-node="infobox"]') : null;
  return infobox && surface.contains(infobox) ? infobox : null;
}

function positionInfoboxRail(panel, infobox, surface) {
  const surfaceRect = surface.getBoundingClientRect();
  const boxRect = infobox.getBoundingClientRect();
  const panelWidth = panel.offsetWidth || 38;
  const left = Math.max(8, boxRect.left - surfaceRect.left - panelWidth - 8);
  const visibleTop = Math.max(boxRect.top, surfaceRect.top + 8);
  const visibleBottom = Math.min(boxRect.bottom, window.innerHeight - 12);
  const top = Math.max(8, visibleTop - surfaceRect.top + Math.max(0, Math.min(48, (visibleBottom - visibleTop) / 4)));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}
```

- [ ] **Step 6: Add `createInfoboxContextToolbar()`**

Add this function near `createMediaRowContextToolbar()`:

```js
function createInfoboxContextToolbar(surface, editor) {
  const panel = document.createElement("div");
  panel.className = "wiki-editor-context-tools wiki-editor-infobox-rail";
  panel.setAttribute("role", "toolbar");
  panel.setAttribute("aria-label", "Infobox tools");
  panel.hidden = true;

  function addRailButton(def) {
    if (!INFOBOX_CONTEXT_BUTTON_IDS.includes(def.id)) {
      throw new Error(`Unknown infobox context button: ${def.id}`);
    }
    const button = createButton(def);
    panel.appendChild(button);
    return button;
  }

  const buttons = [
    addRailButton({ id: "infobox-add-title", title: "Add infobox title", action: function () { editor.chain().focus().addWikiInfoboxTitle().run(); } }),
    addRailButton({ id: "infobox-add-subtitle", title: "Add infobox subtitle", action: function () { editor.chain().focus().addWikiInfoboxSubtitle().run(); } }),
    addRailButton({ id: "infobox-add-image", title: "Add infobox image slot", action: function () { editor.chain().focus().addWikiInfoboxImage().run(); } }),
    addRailButton({ id: "infobox-add-section", title: "Add infobox section", action: function () { editor.chain().focus().addWikiInfoboxSection().run(); } }),
    addRailButton({ id: "infobox-add-row", title: "Add infobox row", action: function () { editor.chain().focus().addWikiInfoboxRow().run(); } }),
    addRailButton({ id: "infobox-add-content", title: "Add infobox content block", action: function () { editor.chain().focus().addWikiInfoboxContent().run(); } }),
    addRailButton({ id: "infobox-move-helper-up", title: "Move infobox block up", action: function () { editor.chain().focus().moveWikiInfoboxHelperUp().run(); } }),
    addRailButton({ id: "infobox-move-helper-down", title: "Move infobox block down", action: function () { editor.chain().focus().moveWikiInfoboxHelperDown().run(); } }),
    addRailButton({ id: "infobox-delete-helper", title: "Delete infobox block", action: function () { editor.chain().focus().deleteWikiInfoboxHelper().run(); } }),
    addRailButton({ id: "infobox-unwrap", title: "Unwrap infobox", action: function () { editor.chain().focus().unwrapWikiInfobox().run(); } }),
    addRailButton({ id: "infobox-delete", title: "Delete infobox", action: function () { editor.chain().focus().deleteWikiInfobox().run(); } })
  ];

  function syncInfoboxTools() {
    const infobox = editor.isActive("wikiInfobox") ? getActiveInfoboxElement(editor, surface) : null;
    panel.hidden = !infobox;
    if (!infobox) {
      return;
    }
    buttons.forEach(function (button) {
      button.disabled = false;
    });
    positionInfoboxRail(panel, infobox, surface);
  }

  editor.on("create", syncInfoboxTools);
  editor.on("selectionUpdate", syncInfoboxTools);
  editor.on("transaction", syncInfoboxTools);
  editor.on("focus", syncInfoboxTools);
  editor.on("blur", syncInfoboxTools);
  window.addEventListener("resize", syncInfoboxTools);
  window.addEventListener("scroll", syncInfoboxTools, true);
  surface.appendChild(panel);
  syncInfoboxTools();

  return {
    destroy: function () {
      window.removeEventListener("resize", syncInfoboxTools);
      window.removeEventListener("scroll", syncInfoboxTools, true);
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }
  };
}
```

- [ ] **Step 7: Mount and destroy the rail with other editor tools**

In editor boot code where image/media/table tools are created, add:

```js
const infoboxContextToolbar = createInfoboxContextToolbar(editorMount, editor);
```

In destroy cleanup, add:

```js
infoboxContextToolbar.destroy();
```

- [ ] **Step 8: Run focused editor tests**

Run:

```bash
node tests/wiki-editor-contract.test.mjs
```

Expected: PASS for rail source checks and helper command tests.

- [ ] **Step 9: Commit vertical rail behavior**

Run:

```bash
git add tests/wiki-editor-contract.test.mjs tiptap/src/wiki-editor-bundle.js tiptap/src/toolbar/toolbar-schema.mjs tiptap/src/extensions/wiki-infobox.mjs
git commit -m "feat: add infobox vertical editor rail"
```

## Task 5: Rendered And Editor CSS

**Files:**
- Modify: `public/wiki-article-body.css`
- Modify: `tiptap/src/wiki-editor.css`
- Modify: `tests/wiki-editor-contract.test.mjs`

- [ ] **Step 1: Add CSS contract tests**

Add to `tests/wiki-editor-contract.test.mjs` near existing CSS contract tests:

```js
await test("wikiInfobox css defines reader float, narrow full-width layout, and editor rail", function () {
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-infobox\s*\{[\s\S]*float:\s*right/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-infobox\s*\{[\s\S]*width:\s*min\(22rem,\s*42%\)/);
  assert.match(articleBodyCss, /@media\s*\(max-width:\s*767\.98px\)\s*\{[\s\S]*\.wiki-article-prose \.wiki-infobox\s*\{[\s\S]*float:\s*none/);
  assert.match(articleBodyCss, /@media\s*\(max-width:\s*767\.98px\)\s*\{[\s\S]*\.wiki-article-prose \.wiki-infobox\s*\{[\s\S]*width:\s*100%/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-infobox__title\s*\{/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-infobox__row\s*\{/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-infobox\s*\{/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor-infobox-rail\s*\{[\s\S]*position:\s*absolute/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor-infobox-rail\s*\{[\s\S]*flex-direction:\s*column/);
});
```

- [ ] **Step 2: Run tests and verify CSS failures**

Run:

```bash
node tests/wiki-editor-contract.test.mjs
```

Expected: FAIL because infobox CSS is not present.

- [ ] **Step 3: Add rendered article CSS**

Append this section to `public/wiki-article-body.css` before the poetry quote section:

```css
.wiki-article-prose .wiki-infobox {
  box-sizing: border-box;
  float: right;
  clear: right;
  width: min(22rem, 42%);
  margin: 0.25rem 0 1rem 1.25rem;
  border: 1px solid var(--wiki-infobox-border, rgba(194, 163, 90, 0.38));
  border-radius: var(--wiki-infobox-radius, var(--bs-border-radius, 0.5rem));
  background: var(--wiki-infobox-bg, linear-gradient(145deg, rgba(31, 18, 35, 0.94), rgba(8, 7, 10, 0.96)));
  box-shadow: var(--wiki-infobox-shadow, inset 0 1px 0 rgba(255, 244, 214, 0.06), 0 0.85rem 2rem rgba(0, 0, 0, 0.3));
  color: var(--wiki-infobox-color, var(--wiki-prose-color, var(--bs-body-color, inherit)));
  overflow: hidden;
}

.wiki-article-prose .wiki-infobox > :first-child {
  margin-top: 0;
}

.wiki-article-prose .wiki-infobox > :last-child {
  margin-bottom: 0;
}

.wiki-article-prose .wiki-infobox__title {
  background: var(--wiki-infobox-title-bg, rgba(194, 163, 90, 0.12));
  border-bottom: 1px solid var(--wiki-infobox-border, rgba(194, 163, 90, 0.32));
  color: var(--wiki-infobox-title-color, var(--wiki-prose-heading-color, inherit));
  font-family: var(--wiki-prose-heading-font-family, var(--bs-heading-font-family, inherit));
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.25;
  padding: 0.65rem 0.8rem;
  text-align: center;
}

.wiki-article-prose .wiki-infobox__subtitle {
  color: var(--wiki-prose-caption-color, var(--bs-secondary-color, inherit));
  font-size: 0.88rem;
  padding: 0.45rem 0.8rem 0;
  text-align: center;
}

.wiki-article-prose .wiki-infobox__image {
  background: transparent;
  border: 0;
  box-shadow: none;
  margin: 0;
  max-width: 100%;
  padding: 0.75rem 0.75rem 0;
  width: 100%;
}

.wiki-article-prose .wiki-infobox__image img {
  display: block;
  height: auto;
  max-width: 100%;
  margin: 0 auto;
}

.wiki-article-prose .wiki-infobox__section {
  background: var(--wiki-infobox-section-bg, rgba(194, 163, 90, 0.1));
  border-top: 1px solid var(--wiki-infobox-border, rgba(194, 163, 90, 0.22));
  border-bottom: 1px solid var(--wiki-infobox-border, rgba(194, 163, 90, 0.18));
  color: var(--wiki-infobox-section-color, var(--wiki-prose-link-color, inherit));
  font-family: var(--wiki-prose-heading-font-family, var(--bs-heading-font-family, inherit));
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0.75rem 0 0;
  padding: 0.35rem 0.8rem;
  text-align: center;
}

.wiki-article-prose .wiki-infobox__rows {
  margin: 0;
}

.wiki-article-prose .wiki-infobox__row {
  display: grid;
  grid-template-columns: minmax(6.5rem, 42%) minmax(0, 1fr);
  border-bottom: 1px solid var(--wiki-infobox-row-border, rgba(194, 163, 90, 0.12));
}

.wiki-article-prose .wiki-infobox__row > dt,
.wiki-article-prose .wiki-infobox__row > dd {
  margin: 0;
  padding: 0.45rem 0.65rem;
}

.wiki-article-prose .wiki-infobox__row > dt {
  color: var(--wiki-infobox-label-color, var(--wiki-prose-caption-color, inherit));
  font-weight: 700;
}

.wiki-article-prose .wiki-infobox__row > dd {
  min-width: 0;
}

.wiki-article-prose .wiki-infobox__content {
  padding: 0.75rem 0.85rem;
}

.wiki-article-prose .wiki-infobox__content > :first-child {
  margin-top: 0;
}

.wiki-article-prose .wiki-infobox__content > :last-child {
  margin-bottom: 0;
}

@media (max-width: 767.98px) {
  .wiki-article-prose .wiki-infobox {
    float: none;
    clear: both;
    width: 100%;
    margin: 1rem 0;
  }
}
```

- [ ] **Step 4: Add editor CSS and rail styling**

Append this section to `tiptap/src/wiki-editor.css` near other custom block styles:

```css
.westgate-wiki-compose .wiki-editor__content .wiki-infobox {
  position: relative;
  box-sizing: border-box;
  float: right;
  clear: right;
  width: min(22rem, 42%);
  margin: 0.25rem 0 1rem 1.25rem;
  border: 1px solid var(--wiki-infobox-border, rgba(194, 163, 90, 0.38));
  border-radius: var(--wiki-infobox-radius, var(--bs-border-radius, 0.5rem));
  background: var(--wiki-infobox-bg, linear-gradient(145deg, rgba(31, 18, 35, 0.94), rgba(8, 7, 10, 0.96)));
  box-shadow: var(--wiki-infobox-shadow, inset 0 1px 0 rgba(255, 244, 214, 0.06), 0 0.85rem 2rem rgba(0, 0, 0, 0.3));
  color: var(--wiki-infobox-color, var(--wiki-prose-color, var(--bs-body-color, inherit)));
  overflow: hidden;
}

.westgate-wiki-compose .wiki-editor__content .wiki-infobox.ProseMirror-selectednode,
.westgate-wiki-compose .wiki-editor__content .wiki-infobox:focus-within {
  outline: 2px solid var(--wiki-editor-focus-border, var(--bs-primary, #0d6efd));
  outline-offset: 2px;
}

.westgate-wiki-compose .wiki-editor__content .wiki-infobox__title,
.westgate-wiki-compose .wiki-editor__content .wiki-infobox__section,
.westgate-wiki-compose .wiki-editor__content .wiki-infobox__subtitle,
.westgate-wiki-compose .wiki-editor__content .wiki-infobox__content {
  min-height: 1.45em;
}

.westgate-wiki-compose .wiki-editor__content .wiki-infobox__title {
  background: var(--wiki-infobox-title-bg, rgba(194, 163, 90, 0.12));
  border-bottom: 1px solid var(--wiki-infobox-border, rgba(194, 163, 90, 0.32));
  color: var(--wiki-infobox-title-color, var(--wiki-prose-heading-color, inherit));
  font-family: var(--wiki-prose-heading-font-family, var(--bs-heading-font-family, inherit));
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.25;
  padding: 0.65rem 0.8rem;
  text-align: center;
}

.westgate-wiki-compose .wiki-editor__content .wiki-infobox__subtitle {
  color: var(--wiki-prose-caption-color, var(--bs-secondary-color, inherit));
  font-size: 0.88rem;
  padding: 0.45rem 0.8rem 0;
  text-align: center;
}

.westgate-wiki-compose .wiki-editor__content .wiki-infobox__image {
  margin: 0;
  padding: 0.75rem 0.75rem 0;
}

.westgate-wiki-compose .wiki-editor__content .wiki-infobox__section {
  background: var(--wiki-infobox-section-bg, rgba(194, 163, 90, 0.1));
  border-top: 1px solid var(--wiki-infobox-border, rgba(194, 163, 90, 0.22));
  border-bottom: 1px solid var(--wiki-infobox-border, rgba(194, 163, 90, 0.18));
  color: var(--wiki-infobox-section-color, var(--wiki-prose-link-color, inherit));
  font-family: var(--wiki-prose-heading-font-family, var(--bs-heading-font-family, inherit));
  font-size: 0.88rem;
  font-weight: 700;
  margin: 0.75rem 0 0;
  padding: 0.35rem 0.8rem;
  text-align: center;
}

.westgate-wiki-compose .wiki-editor__content .wiki-infobox__rows {
  margin: 0;
}

.westgate-wiki-compose .wiki-editor__content .wiki-infobox__row {
  display: grid;
  grid-template-columns: minmax(6.5rem, 42%) minmax(0, 1fr);
  border-bottom: 1px solid var(--wiki-infobox-row-border, rgba(194, 163, 90, 0.12));
}

.westgate-wiki-compose .wiki-editor__content .wiki-infobox__row > dt,
.westgate-wiki-compose .wiki-editor__content .wiki-infobox__row > dd {
  margin: 0;
  min-height: 1.45em;
  padding: 0.45rem 0.65rem;
}

.westgate-wiki-compose .wiki-editor__content .wiki-infobox__row > dt {
  color: var(--wiki-infobox-label-color, var(--wiki-prose-caption-color, inherit));
  font-weight: 700;
}

.westgate-wiki-compose .wiki-editor__content .wiki-infobox__content {
  padding: 0.75rem 0.85rem;
}

.westgate-wiki-compose .wiki-editor-infobox-rail {
  position: absolute;
  z-index: 22;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: center;
  padding: 0.3rem;
  border: 1px solid var(--wiki-editor-toolbar-border, var(--bs-border-color, #dee2e6));
  border-radius: var(--bs-border-radius, 0.5rem);
  background: var(--wiki-editor-toolbar-background, var(--bs-body-bg, #fff));
  box-shadow: 0 0.45rem 1.25rem color-mix(in srgb, #000 22%, transparent);
}

.westgate-wiki-compose .wiki-editor-infobox-rail[hidden] {
  display: none;
}
```

- [ ] **Step 5: Run CSS contract tests**

Run:

```bash
node tests/wiki-editor-contract.test.mjs
```

Expected: PASS for CSS contract tests.

- [ ] **Step 6: Commit CSS**

Run:

```bash
git add tests/wiki-editor-contract.test.mjs public/wiki-article-body.css tiptap/src/wiki-editor.css
git commit -m "style: add wiki infobox presentation"
```

## Task 6: Source Copy/Paste Round Trip And Build Output

**Files:**
- Modify: `tests/wiki-editor-contract.test.mjs`
- Modify: `public/vendor/tiptap/wiki-tiptap.bundle.js`
- Modify: `public/vendor/tiptap/wiki-tiptap.css`

- [ ] **Step 1: Add source copy/paste round-trip test**

Add to `tests/wiki-editor-contract.test.mjs`:

```js
await test("wikiInfobox source HTML copies between editor instances", function () {
  const sourceEditor = createEditor("<p>Before</p>");
  sourceEditor.commands.insertWikiInfobox();
  const copiedHtml = sanitizeHtml(sourceEditor.getHTML()).match(/<aside class="wiki-infobox"[\s\S]*?<\/aside>/)[0];

  const targetEditor = createEditor("<p>Target</p>");
  targetEditor.commands.insertContent(copiedHtml);
  const rendered = targetEditor.getHTML();

  assert.match(rendered, /<aside class="wiki-infobox" data-wiki-node="infobox">/);
  assert.equal(findJsonNode(targetEditor.getJSON(), "wikiInfobox").type, "wikiInfobox");

  sourceEditor.destroy();
  targetEditor.destroy();
});
```

- [ ] **Step 2: Run focused round-trip test**

Run:

```bash
node tests/wiki-editor-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Rebuild vendored Tiptap assets**

Run:

```bash
npm run build:tiptap
```

Expected: Vite rebuilds `public/vendor/tiptap/wiki-tiptap.bundle.js` and `public/vendor/tiptap/wiki-tiptap.css`.

- [ ] **Step 4: Run full automated verification**

Run:

```bash
npm test
```

Expected: PASS for syntax checks and all Node test files.

- [ ] **Step 5: Inspect changed files**

Run:

```bash
git status --short
git diff --stat
```

Expected changed files include source, tests, sanitizer config, CSS, and vendored Tiptap assets. There should be no unrelated files.

- [ ] **Step 6: Commit built assets and round-trip coverage**

Run:

```bash
git add tests/wiki-editor-contract.test.mjs public/vendor/tiptap/wiki-tiptap.bundle.js public/vendor/tiptap/wiki-tiptap.css
git commit -m "build: update tiptap infobox assets"
```

## Task 7: Manual Browser Validation

**Files:**
- No source edits expected unless validation finds a bug.

- [ ] **Step 1: Rebuild NodeBB assets**

From the local NodeBB install, run:

```bash
cd /home/xtul/repos/nodebb
./nodebb build
```

Expected: NodeBB asset build completes without errors.

- [ ] **Step 2: Start or confirm the local forum is running**

If the forum is not already running at `http://localhost:4567`, start it from the NodeBB install:

```bash
cd /home/xtul/repos/nodebb
./nodebb start
```

Expected: `http://localhost:4567` responds.

- [ ] **Step 3: Validate desktop authoring**

In a desktop browser at `http://localhost:4567`:

1. Open a wiki compose page.
2. Insert an infobox from the main toolbar.
3. Confirm the vertical rail appears along the left edge of the active infobox.
4. Add title, subtitle, image slot, section, key/value row, and content block through the rail.
5. Add at least one internal block through slash commands.
6. Insert a normal table inside the infobox content block.
7. Insert or paste an image into the infobox image/content area.
8. Save the article.

Expected:

- The rail remains usable on a tall infobox.
- The main toolbar remains usable.
- The editor does not produce accidental generic container wrappers.
- Saving succeeds.

- [ ] **Step 4: Validate read and reopen**

Open the saved article:

1. Confirm desktop reading view floats the infobox right and wraps prose around it.
2. Confirm article ToC omits every infobox-local title/section/heading.
3. Reopen the page for editing.
4. Confirm the infobox is still editable as an infobox and the rail returns.
5. Confirm editor ToC omits every infobox-local title/section/heading.

Expected: infobox content round-trips without flattening or duplicate wrappers.

- [ ] **Step 5: Validate source copy/paste**

In the editor source view:

1. Copy the full `<aside class="wiki-infobox" ...>` block.
2. Open another wiki compose page.
3. Paste the source HTML into the new page.
4. Return to WYSIWYG editing.
5. Save and reopen.

Expected: the copied source reparses as a `wikiInfobox`, not as generic container blocks.

- [ ] **Step 6: Validate narrow reader view**

Open the saved article at a narrow viewport.

Expected:

- Infobox is full-width.
- Infobox remains in source order.
- Article text is readable.
- No mobile authoring controls are expected.

- [ ] **Step 7: Record validation result**

Record the manual validation result in the implementation summary. If validation finds a bug, return to the task that introduced that behavior, add a focused failing test for the bug, fix it, rerun automated tests, and make a normal source commit from that task.

## Final Verification

Run:

```bash
npm test
npm run build:tiptap
git status --short
```

Expected:

- `npm test` passes.
- `npm run build:tiptap` completes.
- `git status --short` is clean or contains only intentional uncommitted manual-validation notes requested by the user.

## Self-Review Checklist

- The plan covers schema, sanitizer, normalization, article ToC, editor ToC, toolbar, slash commands, vertical rail, CSS, copy/paste, build output, and browser validation.
- Every implementation task starts with a failing test or source assertion.
- Each commit boundary leaves the repository in a meaningful, reviewable state.
- No task asks the worker to enable arbitrary CSS or generic HTML passthrough.
- Mobile authoring remains out of scope; mobile reading remains in scope.
