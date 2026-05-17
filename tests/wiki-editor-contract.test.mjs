import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { NodeSelection } from "@tiptap/pm/state";

import { installJsdomGlobals } from "./helpers/jsdom-setup.mjs";

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.then(function () {
        process.stdout.write(`ok - ${name}\n`);
      });
    }
    process.stdout.write(`ok - ${name}\n`);
  } catch (err) {
    process.stderr.write(`not ok - ${name}\n`);
    throw err;
  }
  return Promise.resolve();
}

installJsdomGlobals();

const [{ Editor }, StarterKitModule, HighlightModule, ImageModule, TableModule, TableCellModule, TableHeaderModule, TableRowModule, PreservedNodeAttributesModule, StyledSpanModule, ContainerBlockModule, MediaRowModule, ImageFigureModule, WikiAlignmentTableModule, WikiCalloutModule, WikiPoetryQuoteModule, WikiInfoboxModule, WikiEditingKeymapModule, SlashCommandModule, WikiCodeBlockModule, WikiBlockBackgroundModule, WikiLinkModule, WikiEntitiesModule, toolbarSchemaModule, editorTocModule, linkInteractionsModule, imageResizeModule, mediaSelectionModule, mediaCellSelectionModule, legacyHtmlModule, sanitizerContractModule, colorContrastModule] = await Promise.all([
  import("@tiptap/core"),
  import("@tiptap/starter-kit"),
  import("../tiptap/src/extensions/wiki-highlight.mjs"),
  import("@tiptap/extension-image"),
  import("@tiptap/extension-table"),
  import("@tiptap/extension-table-cell"),
  import("@tiptap/extension-table-header"),
  import("@tiptap/extension-table-row"),
  import("../tiptap/src/extensions/preserved-node-attributes.mjs"),
  import("../tiptap/src/extensions/styled-span.mjs"),
  import("../tiptap/src/extensions/container-block.mjs"),
  import("../tiptap/src/extensions/media-row.mjs"),
  import("../tiptap/src/extensions/image-figure.mjs"),
  import("../tiptap/src/extensions/wiki-alignment-table.mjs"),
  import("../tiptap/src/extensions/wiki-callout.mjs"),
  import("../tiptap/src/extensions/wiki-poetry-quote.mjs"),
  import("../tiptap/src/extensions/wiki-infobox.mjs"),
  import("../tiptap/src/extensions/wiki-editing-keymap.mjs"),
  import("../tiptap/src/extensions/slash-command.mjs"),
  import("../tiptap/src/extensions/wiki-code-block.mjs"),
  import("../tiptap/src/extensions/wiki-block-background.mjs"),
  import("../tiptap/src/extensions/wiki-link.mjs"),
  import("../tiptap/src/extensions/wiki-entities.mjs"),
  import("../tiptap/src/toolbar/toolbar-schema.mjs"),
  import("../tiptap/src/toolbar/editor-toc.mjs"),
  import("../tiptap/src/selection/link-interactions.mjs"),
  import("../tiptap/src/selection/image-resize.mjs"),
  import("../tiptap/src/selection/media-selection.mjs"),
  import("../tiptap/src/selection/media-cell-selection.mjs"),
  import("../tiptap/src/normalization/legacy-html.mjs"),
  import("../tiptap/src/shared/sanitizer-contract.mjs"),
  import("../tiptap/src/shared/color-contrast.mjs")
]);

const StarterKit = StarterKitModule.default;
const Highlight = HighlightModule.default;
const Image = ImageModule.default;
const { Table } = TableModule;
const { TableCell } = TableCellModule;
const { TableHeader } = TableHeaderModule;
const { TableRow } = TableRowModule;
const PreservedNodeAttributes = PreservedNodeAttributesModule.default;
const StyledSpan = StyledSpanModule.default;
const ContainerBlock = ContainerBlockModule.default;
const {
  MEDIA_CELL_STYLE_PRESETS,
  MediaCell,
  MediaRow,
  clearMediaCellStyleAttrs,
  getMediaCellStyleAttrs,
  mergeMediaCellColorStyle
} = MediaRowModule;
const ImageFigure = ImageFigureModule.default;
const WikiAlignmentTable = WikiAlignmentTableModule.default;
const WikiCallout = WikiCalloutModule.default;
const WikiPoetryQuote = WikiPoetryQuoteModule.default;
const WikiInfobox = WikiInfoboxModule.default;
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
const WikiEditingKeymap = WikiEditingKeymapModule.default;
const SlashCommand = SlashCommandModule.default;
const WikiCodeBlock = WikiCodeBlockModule.default;
const WikiBlockBackground = WikiBlockBackgroundModule.default;
const WikiLink = WikiLinkModule.default;
const { WikiFootnote, WikiNamespaceLink, WikiPageLink, WikiUserMention } = WikiEntitiesModule;
const { IMAGE_CONTEXT_BUTTON_IDS, TABLE_CELL_POPOVER_COMMAND_IDS, TABLE_CONTEXT_BUTTON_IDS, TABLE_STICKY_COMMAND_IDS, TOP_TOOLBAR_BUTTON_IDS, TOP_TOOLBAR_GROUPS } = toolbarSchemaModule;
const { buildHeadingToc, navigateToHeading } = editorTocModule;
const { installEditorLinkNavigationGuard, selectEditorLink } = linkInteractionsModule;
const { calculateResizedImageWidth, getSelectedImageElement, setSelectedImageWidth } = imageResizeModule;
const {
  focusMediaCell,
  handleMediaCellSelectionClick,
  isMediaCellSurfaceTarget,
  selectClickedImageNode
} = mediaSelectionModule;
const {
  MEDIA_CELL_SELECTION_PLUGIN_KEY,
  default: MediaCellSelection,
  getSelectedMediaCellPositions,
  getTargetMediaCellPositions,
  toggleMediaCellSelectionAt
} = mediaCellSelectionModule;
const {
  detectUnsupportedContent,
  getNormalizationNotice,
  normalizeLegacyHtmlForTiptap
} = legacyHtmlModule;
const { sanitizeHtml, sanitizeStyleAttribute } = sanitizerContractModule;
const { getReadableTextColor, normalizeHexColor } = colorContrastModule;
const articleBodyCss = readFileSync(new URL("../public/wiki-article-body.css", import.meta.url), "utf8");
const pluginJsonSource = readFileSync(new URL("../plugin.json", import.meta.url), "utf8");
const wikiJsSource = readFileSync(new URL("../public/wiki.js", import.meta.url), "utf8");
const editorCss = readFileSync(new URL("../tiptap/src/wiki-editor.css", import.meta.url), "utf8");
const vendoredEditorCss = readFileSync(new URL("../public/vendor/tiptap/wiki-tiptap.css", import.meta.url), "utf8");
const editorBundleSource = readFileSync(new URL("../tiptap/src/wiki-editor-bundle.js", import.meta.url), "utf8");
const vendoredEditorBundleSource = readFileSync(new URL("../public/vendor/tiptap/wiki-tiptap.bundle.js", import.meta.url), "utf8");
const tableAuthoringSource = readFileSync(new URL("../tiptap/src/table/table-authoring-ui.mjs", import.meta.url), "utf8");

let editorBundleContractImportCount = 0;

async function importEditorBundleForContract() {
  editorBundleContractImportCount += 1;
  const moduleUrl = new URL(`../tiptap/src/.wiki-editor-bundle-contract-${process.pid}-${editorBundleContractImportCount}.mjs`, import.meta.url);
  const source = editorBundleSource
    .replace(/import\s+["']\.\/wiki-editor\.css["'];\s*/, "");
  writeFileSync(moduleUrl, source);
  try {
    return await import(`${moduleUrl.href}?contract=${editorBundleContractImportCount}`);
  } finally {
    rmSync(moduleUrl, { force: true });
  }
}

function createEditor(content) {
  const mount = document.createElement("div");
  document.body.appendChild(mount);

  return new Editor({
    element: mount,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        heading: {
          levels: [1, 2, 3, 4]
        }
      }),
      PreservedNodeAttributes,
      StyledSpan,
      ContainerBlock,
      MediaCell,
      MediaRow,
      MediaCellSelection,
      ImageFigure,
      WikiAlignmentTable,
      WikiCallout,
      WikiPoetryQuote,
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
      WikiEditingKeymap,
      WikiCodeBlock,
      WikiBlockBackground,
      Highlight.configure({
        multicolor: true
      }),
      WikiPageLink,
      WikiNamespaceLink,
      WikiUserMention,
      WikiFootnote,
      WikiLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https"
      }),
      SlashCommand.configure({
        getItems: function () {
          return [
            {
              id: "warning-callout",
              label: "Warning callout",
              run: function ({ editor: activeEditor }) {
                activeEditor.chain().focus().insertWikiCallout({ type: "warning", title: "Compatibility" }).run();
              }
            }
          ];
        }
      }),
      Image.configure({
        allowBase64: true,
        HTMLAttributes: {
          "data-wiki-node": "image"
        }
      }),
      Table,
      TableRow,
      TableHeader,
      TableCell
    ],
    content: content || ""
  });
}

function createPartialInfoboxEditor(content) {
  const mount = document.createElement("div");
  document.body.appendChild(mount);

  return new Editor({
    element: mount,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false
      }),
      WikiInfoboxTitle,
      WikiInfobox
    ],
    content: content || ""
  });
}

function findNodePositions(editor, typeName) {
  const positions = [];
  editor.state.doc.descendants(function (node, pos) {
    if (node.type.name === typeName) {
      positions.push(pos);
    }
  });
  return positions;
}

function findJsonNode(node, typeName) {
  if (!node) {
    return null;
  }
  if (node.type === typeName) {
    return node;
  }
  for (const child of node.content || []) {
    const match = findJsonNode(child, typeName);
    if (match) {
      return match;
    }
  }
  return null;
}

function collectJsonNodeTypes(node, types) {
  if (!node) {
    return types;
  }
  types.add(node.type);
  for (const child of node.content || []) {
    collectJsonNodeTypes(child, types);
  }
  return types;
}

function findTextRange(editor, text) {
  let range = null;
  editor.state.doc.descendants(function (node, pos) {
    if (!node.isText || range) {
      return !range;
    }
    const index = node.text.indexOf(text);
    if (index === -1) {
      return true;
    }
    range = {
      from: pos + index,
      to: pos + index + text.length
    };
    return false;
  });
  return range;
}

function nextAnimationFrame() {
  return new Promise(function (resolve) {
    requestAnimationFrame(resolve);
  });
}

function countEditorScrollRequests(editor) {
  let scrollRequests = 0;
  const originalCommand = editor.commands.scrollIntoView;
  editor.commands.scrollIntoView = function () {
    scrollRequests += 1;
    return originalCommand.apply(this, arguments);
  };
  return function getScrollRequests() {
    return scrollRequests;
  };
}

function moveFocusOutsideEditor() {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Outside editor";
  document.body.appendChild(button);
  button.focus();
  return function cleanup() {
    button.remove();
  };
}

await test("normalizeLegacyHtmlForTiptap converts legacy media layouts into wiki media rows", function () {
  const normalized = normalizeLegacyHtmlForTiptap(
    '<div style="display:flex"><img src="/one.png" alt="One"><div style="display:block"><p>Two</p></div></div>'
  );

  assert.match(normalized, /class="wiki-media-row"/);
  assert.match(normalized, /class="wiki-media-cell"/);
  assert.doesNotMatch(normalized, /display:flex/);
});

await test("normalizeLegacyHtmlForTiptap wraps generated media cells in supported cell elements", function () {
  const normalized = normalizeLegacyHtmlForTiptap(
    '<div style="display:flex"><img src="/one.png" alt="One"><p>Text beside it</p></div>'
  );

  assert.match(normalized, /<div class="wiki-media-cell"><p>Text beside it<\/p><\/div>/);
  assert.doesNotMatch(normalized, /<p class="wiki-media-cell"/);
});

await test("normalizeLegacyHtmlForTiptap preserves saved plugin-owned media cell wrappers", function () {
  const normalized = normalizeLegacyHtmlForTiptap(
    '<div class="wiki-media-row" data-wiki-node="media-row"><div class="wiki-media-cell" data-wiki-node="media-cell"><img data-wiki-node="image" src="/a.png"></div><div class="wiki-media-cell" data-wiki-node="media-cell"><p>B</p></div></div>'
  );

  assert.match(normalized, /<div class="wiki-media-cell" data-wiki-node="media-cell"><img data-wiki-node="image" src="\/a\.png"><\/div>/);
  assert.doesNotMatch(normalized, /<p class="wiki-media-cell"/);
});

await test("normalizeLegacyHtmlForTiptap keeps supported image figures and normalizes presentational markup", function () {
  const normalized = normalizeLegacyHtmlForTiptap(
    '<center><figure class="image image-style-side"><a href="/full.png"><img src="/thumb.png" alt="Thumb" width="120"></a><figcaption><font color="#caa55a" size="5">Caption</font></figcaption></figure></center>'
  );

  assert.match(normalized, /<p style="text-align: center">/);
  assert.match(normalized, /<figure class="image image-style-side">/);
  assert.match(normalized, /<span[^>]*style="[^"]*font-size: 1\.5rem[^"]*"[^>]*>Caption<\/span>/);
});

await test("normalizeLegacyHtmlForTiptap converts legacy wiki inline syntax into entity spans", function () {
  const normalized = normalizeLegacyHtmlForTiptap(
    '<p>See [[Guides/Map Creation Guide|Map guide]], [[Guides/Map Creation Guide#Advanced Setup|setup]], [[ns:Guides]], @xtul, and ((Important note)). <code>[[Raw]] @raw ((raw))</code></p>'
  );

  assert.match(normalized, /data-wiki-entity="page"/);
  assert.match(normalized, /data-wiki-target="Guides\/Map Creation Guide"/);
  assert.match(normalized, /data-wiki-target="Guides\/Map Creation Guide#Advanced Setup"/);
  assert.match(normalized, /data-wiki-entity="namespace"/);
  assert.match(normalized, /data-wiki-target="Guides"/);
  assert.match(normalized, /data-wiki-entity="user"/);
  assert.match(normalized, /data-wiki-username="xtul"/);
  assert.match(normalized, /data-wiki-entity="footnote"/);
  assert.match(normalized, /data-wiki-footnote="Important note"/);
  assert.match(normalized, /<code>\[\[Raw\]\] @raw \(\(raw\)\)<\/code>/);
});

await test("detectUnsupportedContent rejects unsupported embeds and accepts supported legacy figure content", function () {
  assert.match(
    detectUnsupportedContent('<p>Video</p><iframe src="https://example.test/embed"></iframe>'),
    /<iframe>/
  );

  assert.equal(
    detectUnsupportedContent('<figure class="image"><img src="/ok.png" alt="Ok"><figcaption><span class="legacy-accent">Safe</span></figcaption></figure>'),
    ""
  );
});

await test("detectUnsupportedContent accepts schema-compatible infobox image helpers", function () {
  assert.equal(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><figure class="wiki-infobox__image" data-wiki-infobox-part="image"></figure></aside>'),
    ""
  );
  assert.equal(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img src="/portrait.png" alt="Portrait"></figure></aside>'),
    ""
  );
});

await test("detectUnsupportedContent rejects schema-incompatible infobox image helpers", function () {
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><figure class="wiki-infobox__image" data-wiki-infobox-part="image"><p>Caption</p></figure></aside>'),
    /figure layout/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img src="/one.png" alt="One"><img src="/two.png" alt="Two"></figure></aside>'),
    /figure layout/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><figure class="wiki-infobox__image" data-wiki-infobox-part="image">Caption</figure></aside>'),
    /figure layout/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img src="/one.png" alt="One"> Caption</figure></aside>'),
    /figure layout/
  );
});

await test("detectUnsupportedContent accepts canonical infobox rows", function () {
  assert.equal(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div></dl></aside>'),
    ""
  );
});

await test("detectUnsupportedContent accepts safe legacy inline formatting in infobox rows", function () {
  const html = '<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt><b>House</b></dt><dd><i>Voss</i> <font color="#caa55a">Gold</font> Line<br>Break</dd></div></dl></aside>';
  const normalized = normalizeLegacyHtmlForTiptap(html);

  assert.equal(detectUnsupportedContent(html), "");
  assert.match(normalized, /<dt><strong>House<\/strong><\/dt>/);
  assert.match(normalized, /<em>Voss<\/em>/);
  assert.match(normalized, /Gold/);
  assert.match(normalized, /Line<br>Break/);
  assert.doesNotMatch(normalized, /<b>|<i>|<font/);
});

await test("detectUnsupportedContent rejects lossy infobox row media", function () {
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd><img src="/seal.png" alt="Seal"></div></dl></aside>'),
    /definition rows/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><img src="/seal.png" alt="Seal"></div></dl></aside>'),
    /definition rows/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><img src="/seal.png" alt="Seal"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div></dl></aside>'),
    /definition rows/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd><hr></div></dl></aside>'),
    /definition rows/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd><input type="checkbox" checked></div></dl></aside>'),
    /definition rows/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd><a><img src="/seal.png" alt="Seal"></a></div></dl></aside>'),
    /definition rows/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd><span><input type="checkbox" checked></span></div></dl></aside>'),
    /definition rows/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss <img src="/seal.png" alt="Seal"></dd></div></dl></aside>'),
    /definition rows/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss <hr></dd></div></dl></aside>'),
    /definition rows/
  );
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House <input type="checkbox" checked></dt><dd>Voss</dd></div></dl></aside>'),
    /definition rows/
  );
});

await test("getNormalizationNotice reports when legacy html changes materially", function () {
  assert.equal(getNormalizationNotice("<p>Plain</p>"), "");
  assert.match(getNormalizationNotice("<center>Centered</center>"), /normalized to the supported Tiptap schema/);
});

await test("sanitizeHtml preserves safe styles and removes unsafe ones on the client contract", function () {
  const sanitized = sanitizeHtml('<p style="text-align: center; position: fixed; color: rgb(10, 20, 30)">Styled</p>');

  assert.match(sanitized, /text-align:\s*center/);
  assert.match(sanitized, /color:\s*rgb\(10, 20, 30\)/);
  assert.doesNotMatch(sanitized, /position:/);
});

await test("sanitizeStyleAttribute collapses Chrome-expanded border side colors", function () {
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function (tagName) {
    if (String(tagName).toLowerCase() !== "span") {
      return originalCreateElement(tagName);
    }

    const properties = [
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color"
    ];
    return {
      setAttribute: function () {},
      style: {
        0: properties[0],
        1: properties[1],
        2: properties[2],
        3: properties[3],
        length: properties.length,
        getPropertyValue: function (propertyName) {
          return properties.includes(propertyName) ? "rgb(212, 177, 106)" : "";
        }
      }
    };
  };

  try {
    assert.equal(
      sanitizeStyleAttribute("border-color: rgb(212, 177, 106)", "div"),
      "border-color: rgb(212, 177, 106)"
    );
  } finally {
    document.createElement = originalCreateElement;
  }
});

await test("sanitizeStyleAttribute collapses Chrome-expanded border side widths", function () {
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = function (tagName) {
    if (String(tagName).toLowerCase() !== "span") {
      return originalCreateElement(tagName);
    }

    const properties = [
      "border-top-width",
      "border-right-width",
      "border-bottom-width",
      "border-left-width"
    ];
    return {
      setAttribute: function () {},
      style: {
        0: properties[0],
        1: properties[1],
        2: properties[2],
        3: properties[3],
        length: properties.length,
        getPropertyValue: function (propertyName) {
          return properties.includes(propertyName) ? "4px" : "";
        }
      }
    };
  };

  try {
    assert.equal(
      sanitizeStyleAttribute("border-width: 4px", "div"),
      "border-width: 4px"
    );
  } finally {
    document.createElement = originalCreateElement;
  }
});

await test("sanitizeHtml preserves table cell vertical alignment on the client contract", function () {
  const sanitized = sanitizeHtml('<table><tbody><tr><td style="vertical-align: middle; position: fixed">Middle</td><td style="vertical-align: bottom">Bottom</td></tr></tbody></table>');

  assert.match(sanitized, /<td style="[^"]*vertical-align:\s*middle;?[^"]*">Middle<\/td>/);
  assert.match(sanitized, /<td style="[^"]*vertical-align:\s*bottom;?[^"]*">Bottom<\/td>/);
  assert.doesNotMatch(sanitized, /position:/);
});

await test("article prose css renders Tiptap task lists without list bullets", function () {
  assert.match(articleBodyCss, /\.wiki-article-prose\s+ul\[data-type="taskList"\]/);
  assert.match(articleBodyCss, /ul\[data-type="taskList"\]\s*{[^}]*list-style:\s*none/);
  assert.match(articleBodyCss, /ul\[data-type="taskList"\]\s*>\s*li\s*{[^}]*display:\s*flex/);
  assert.doesNotMatch(articleBodyCss, /ul\[data-type="taskList"\]\s*>\s*li\s*{[^}]*align-items:\s*center/);
  assert.match(articleBodyCss, /ul\[data-type="taskList"\]\s*>\s*li\s*>\s*label\s*{[^}]*margin-top:\s*0\.35rem/);
  assert.match(articleBodyCss, /ul\[data-type="taskList"\]\s*>\s*li\s*>\s*div\s*>\s*p\s*{[^}]*margin-bottom:\s*0/);
  assert.match(articleBodyCss, /ul\[data-type="taskList"\]\s+ul\[data-type="taskList"\]\s*{[^}]*margin-top:\s*0/);
  assert.match(articleBodyCss, /ul\[data-type="taskList"\]\s+ul\[data-type="taskList"\]\s*{[^}]*margin-bottom:\s*0/);
});

await test("editor toolbar renders as a bordered self-contained sticky panel", function () {
  [editorCss, vendoredEditorCss].forEach(function (css) {
    assert.match(css, /\.wiki-editor__toolbar-mount\s*{[^}]*border:\s*1px\s+solid\s+var\(--wiki-editor-toolbar-border/);
    assert.match(css, /\.wiki-editor__toolbar-mount\s*{[^}]*border-radius:\s*var\(--bs-border-radius/);
    assert.match(css, /\.wiki-editor__toolbar-mount\s*{[^}]*margin:\s*(?:0\.75rem|\.75rem)\s+(?:0\.75rem|\.75rem)\s+0/);
    assert.doesNotMatch(css, /\.wiki-editor__toolbar-mount\s*{[^}]*box-shadow:\s*0\s+calc\(-1\s*\*/);
  });
});

await test("editor toolbar active buttons keep icon color readable", function () {
  [editorCss, vendoredEditorCss].forEach(function (css) {
    assert.match(css, /\.wiki-editor-toolbar__button\s*{[^}]*--bs-btn-active-color:\s*var\(--bs-btn-color,\s*currentColor\)/);
    assert.match(css, /\.wiki-editor-toolbar__button\.active\s*{[^}]*color:\s*var\(--bs-btn-active-color\)/);
    assert.doesNotMatch(css, /(?:^|\n)\s*color:\s*var\(--bs-btn-active-bg\)/);
  });
});

await test("editor image resize handles are scoped and draggable from the corners", function () {
  [editorCss, vendoredEditorCss].forEach(function (css) {
    assert.match(css, /\.westgate-wiki-compose \.wiki-editor-image-resize\s*{/);
    assert.match(css, /\.westgate-wiki-compose \.wiki-editor-image-resize__handle--nw\s*{[^}]*cursor:\s*nwse-resize/);
    assert.match(css, /\.westgate-wiki-compose \.wiki-editor-image-resize__handle--ne\s*{[^}]*cursor:\s*nesw-resize/);
    assert.match(css, /\.wiki-editor--resizing-image\s*{[^}]*user-select:\s*none/);
    assert.match(css, /figure\.image \.wiki-image-figure__media\s*{[^}]*cursor:\s*pointer;[^}]*user-select:\s*none/);
  });
});

await test("editor image mousedown selection preserves native drag start", function () {
  const sourceMousedownHandler = editorBundleSource.match(/mousedown:\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\},\n\s*click:/);
  const vendoredMousedownHandler = vendoredEditorBundleSource.match(/mousedown:function\([^)]*\)\{([\s\S]*?)\},click:function/);

  assert.ok(sourceMousedownHandler, "source editor bundle should expose a mousedown DOM handler before the click handler");
  assert.match(
    sourceMousedownHandler[1],
    /selectClickedImageNode\(editor,\s*target,\s*editorMount\)[\s\S]*return\s+false;/,
    "image mousedown should select the node but return false so ProseMirror/native drag can continue"
  );
  assert.doesNotMatch(
    sourceMousedownHandler[1],
    /event\.preventDefault\(\)/,
    "image mousedown must not prevent default because that cancels drag-to-reposition"
  );

  assert.ok(vendoredMousedownHandler, "vendored editor bundle should expose a mousedown DOM handler before the click handler");
  assert.match(
    vendoredMousedownHandler[1],
    /const\s+\w+=\w+\.target;return\s+\w+\(\w+,\s*\w+,\s*\w+\),!1/,
    "vendored image mousedown should select the node but return false so ProseMirror/native drag can continue"
  );
  assert.doesNotMatch(
    vendoredMousedownHandler[1],
    /preventDefault/,
    "vendored image mousedown must not prevent default because that cancels drag-to-reposition"
  );
});

await test("editor toolbar group labels stay visually subdued", function () {
  [editorCss, vendoredEditorCss].forEach(function (css) {
    assert.match(css, /\.wiki-editor-toolbar__group-label\s*{[^}]*font-size:\s*(?:0)?\.62rem/);
    assert.match(css, /\.wiki-editor-toolbar__group-label\s*{[^}]*font-weight:\s*600/);
    assert.match(css, /\.wiki-editor-toolbar__group-label\s*{[^}]*opacity:\s*(?:0)?\.62/);
  });
});

await test("editor toolbar labels do not force oversized group spacing", function () {
  [editorCss, vendoredEditorCss].forEach(function (css) {
    assert.match(css, /\.wiki-editor-toolbar\s*{[^}]*column-gap:\s*(?:0)?\.7rem/);
    assert.match(css, /\.wiki-editor-toolbar__group\s*{[^}]*flex-direction:\s*column/);
    assert.match(css, /\.wiki-editor-toolbar__group-controls\s*{[^}]*display:\s*flex/);
    assert.match(css, /\.wiki-editor-toolbar__separator\s*{[^}]*margin:\s*0/);
  });
});

await test("editor toolbar separators follow adjacent group rows", function () {
  assert.match(editorBundleSource, /previousGroup\.offsetTop\s*===\s*nextGroup\.offsetTop/);
  assert.doesNotMatch(editorBundleSource, /previousGroup\.offsetTop\s*===\s*separator\.offsetTop/);
});

await test("fullscreen source textarea captures Tab as source indentation", function () {
  assert.match(editorBundleSource, /sourceTextarea\.addEventListener\("keydown",\s*handleSourceKeydown\)/);
  assert.match(editorBundleSource, /event\.key\s*!==\s*"Tab"/);
  assert.match(editorBundleSource, /event\.preventDefault\(\)/);
  assert.match(editorBundleSource, /sourceTextarea\.setRangeText\("\\t"/);
  assert.match(vendoredEditorBundleSource, /addEventListener\("keydown"/);
  assert.match(vendoredEditorBundleSource, /setRangeText\("\\t"|setRangeText\("\t"/);
});

await test("styled span classes and styles round-trip through the extracted extension layer", function () {
  const editor = createEditor('<p><span class="legacy-accent" style="font-size: 1.2rem; color: #caa55a">Accent</span></p>');
  const rendered = editor.getHTML();

  assert.match(rendered, /<span class="legacy-accent" style="font-size: 1\.2rem; color: rgb\(202, 165, 90\);">Accent<\/span>/);
  editor.destroy();
});

await test("stripStyledSpanSelection removes pasted span styling without removing semantic marks", async function () {
  const { selectionHasStyledSpan, stripStyledSpanSelection } = await importEditorBundleForContract();
  const editor = createEditor('<p><span class="legacy-accent" style="color: #bbb"><a href="https://example.com"><strong>Styled link</strong></a></span></p>');
  const range = findTextRange(editor, "Styled link");

  assert.ok(range, "expected styled link text range");
  editor.commands.setTextSelection(range);
  assert.equal(selectionHasStyledSpan(editor), true);
  assert.equal(stripStyledSpanSelection(editor), true);

  const rendered = editor.getHTML();
  assert.match(rendered, /<strong>Styled link<\/strong>|<strong><span class="wiki-editor-link wiki-external-link"[^>]*>Styled link<\/span><\/strong>/);
  assert.match(rendered, /class="wiki-editor-link wiki-external-link"/);
  assert.match(rendered, /data-wiki-link-href="https:\/\/example\.com"/);
  assert.doesNotMatch(rendered, /legacy-accent/);
  assert.doesNotMatch(rendered, /<span[^>]*style="[^"]*color[^"]*"[^>]*>/);
  editor.destroy();
});

await test("stripStyledSpanSelection expands a cursor inside pasted span styling", async function () {
  const { selectionHasStyledSpan, stripStyledSpanSelection } = await importEditorBundleForContract();
  const editor = createEditor('<p>Before <span style="color: #bbb">styled cursor text</span> after</p>');
  const range = findTextRange(editor, "cursor");
  const cursor = range.from + 2;

  editor.commands.setTextSelection(cursor);
  assert.equal(selectionHasStyledSpan(editor), true);
  assert.equal(stripStyledSpanSelection(editor), true);

  const rendered = editor.getHTML();
  assert.match(rendered, /Before styled cursor text after/);
  assert.doesNotMatch(rendered, /<span[^>]*style="[^"]*color[^"]*"[^>]*>styled cursor text<\/span>/);
  assert.equal(editor.state.selection.from, cursor);
  assert.equal(editor.state.selection.empty, true);
  editor.destroy();
});

await test("highlight colors render as sanitized multicolor marks", function () {
  const editor = createEditor("<p>Colored highlight</p>");

  editor.commands.setTextSelection({ from: 1, to: 8 });
  editor.commands.toggleHighlight({ color: "#bfdbfe" });
  const rendered = editor.getHTML();

  assert.match(rendered, /<mark[^>]*style="[^"]*background-color: rgb\(191, 219, 254\);[^"]*"[^>]*>Colored<\/mark>/);
  assert.match(rendered, /<mark[^>]*style="[^"]*color: rgb\(17, 24, 39\);[^"]*"[^>]*>Colored<\/mark>/);
  editor.destroy();
});

await test("highlight colors auto-select a legible foreground for custom dark backgrounds", function () {
  const editor = createEditor("<p>Custom highlight</p>");

  editor.commands.setTextSelection({ from: 1, to: 7 });
  editor.commands.toggleHighlight({ color: "#3b0764" });
  const rendered = editor.getHTML();

  assert.match(rendered, /<mark[^>]*style="[^"]*background-color: rgb\(59, 7, 100\);[^"]*"[^>]*>Custom<\/mark>/);
  assert.match(rendered, /<mark[^>]*style="[^"]*color: rgb\(249, 250, 251\);[^"]*"[^>]*>Custom<\/mark>/);
  editor.destroy();
});

await test("block background command applies and removes sanitized text block color styles", function () {
  const editor = createEditor('<p style="text-align: center">Block background</p>');

  editor.commands.setTextSelection(3);
  assert.equal(editor.commands.setWikiBlockBackground({ backgroundColor: "#dcfce7" }), true);
  assert.match(editor.getHTML(), /<p style="text-align: center; background-color: rgb\(220, 252, 231\); color: rgb\(17, 24, 39\);?">Block background<\/p>/);

  assert.equal(editor.commands.unsetWikiBlockBackground(), true);
  assert.match(editor.getHTML(), /<p style="text-align: center;">Block background<\/p>/);
  editor.destroy();
});

await test("block background command auto-selects a legible foreground for custom dark backgrounds", function () {
  const editor = createEditor("<p>Dark block</p>");

  editor.commands.setTextSelection(3);
  assert.equal(editor.commands.setWikiBlockBackground({ backgroundColor: "#111827" }), true);
  assert.match(editor.getHTML(), /<p style="background-color: rgb\(17, 24, 39\); color: rgb\(249, 250, 251\);?">Dark block<\/p>/);
  editor.destroy();
});

await test("editor color contrast helpers normalize custom hex colors and choose readable text", function () {
  assert.equal(normalizeHexColor("abc"), "#aabbcc");
  assert.equal(normalizeHexColor("#3B0764"), "#3b0764");
  assert.equal(normalizeHexColor("not-a-color"), "");
  assert.equal(getReadableTextColor("#3b0764"), "#f9fafb");
  assert.equal(getReadableTextColor("#fef08a"), "#111827");
});

await test("editor toolbar exposes highlight and text block background color palettes", function () {
  assert.match(editorBundleSource, /const HIGHLIGHT_COLOR_OPTIONS = \[/);
  assert.match(editorBundleSource, /label:\s*"Magenta"[\s\S]*backgroundColor:\s*"#f5d0fe"/);
  assert.match(editorBundleSource, /Highlight\.configure\(\{[\s\S]*multicolor:\s*true[\s\S]*\}\)/);
  assert.match(editorBundleSource, /getReadableTextColor\(backgroundColor\)/);
  assert.match(editorBundleSource, /normalizeHexColor\(customColor\.value\)/);
  assert.match(editorBundleSource, /toggleHighlight\(\{ color: backgroundColor, textColor \}\)/);
  assert.match(editorBundleSource, /const BLOCK_BACKGROUND_COLOR_OPTIONS = \[/);
  assert.match(editorBundleSource, /setWikiBlockBackground\(\{ backgroundColor, textColor \}\)/);
  assert.match(editorBundleSource, /unsetWikiBlockBackground\(\)/);
  assert.match(editorCss, /\.wiki-editor-color-menu\s*\{/);
  assert.match(editorCss, /\.wiki-editor-color-swatch\s*\{/);
  assert.match(editorCss, /\.wiki-editor-color-custom\s*\{/);
  assert.match(vendoredEditorCss, /\.wiki-editor-color-menu\s*\{/);
  assert.match(vendoredEditorCss, /\.wiki-editor-color-swatch\s*\{/);
  assert.match(vendoredEditorCss, /\.wiki-editor-color-custom\s*\{/);
});

await test("paragraph block backgrounds shrink to the text width in article and editor prose", function () {
  assert.match(articleBodyCss, /\.wiki-article-prose p\[style\*="background-color"\]\s*\{[^}]*display:\s*table/s);
  assert.match(articleBodyCss, /\.wiki-article-prose p\[style\*="background-color"\]\s*\{[^}]*width:\s*fit-content/s);
});

await test("media cell style css exists in article and editor prose", function () {
  [articleBodyCss, editorCss].forEach(function (css) {
    assert.match(css, /\.wiki-media-cell--shadow\s*\{/);
    assert.match(css, /\.wiki-media-cell--gilded\s*\{/);
    assert.match(css, /\.wiki-media-cell--custom\s*\{/);
    assert.match(css, /\.wiki-media-cell--well\s*\{/);
  });
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-media-cell\.wiki-media-cell--shadow\s*\{[^}]*position:\s*relative/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-media-cell\.wiki-media-cell--shadow::after\s*\{[^}]*filter:\s*blur\(25px\)/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-media-cell\.wiki-media-cell--shadow \.wiki-media-cell__shadow-content\s*\{[^}]*z-index:\s*1/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-media-cell\.wiki-media-cell--well\s*\{[^}]*background:\s*linear-gradient\(145deg,\s*rgba\(31,\s*18,\s*35,\s*0\.82\),\s*rgba\(8,\s*7,\s*10,\s*0\.92\)\)/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-media-cell\.wiki-media-cell--well\s*\{[^}]*box-shadow:\s*inset\s+0\s+1px\s+0\s+rgba\(255,\s*244,\s*214,\s*0\.045\),\s*0\s+0\.85rem\s+2rem\s+rgba\(0,\s*0,\s*0,\s*0\.34\)/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-media-cell\[style\*="color"\] :where\(p,\s*li\)\s*\{[^}]*color:\s*inherit/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-media-cell\.wiki-media-cell--shadow\s*\{[^}]*position:\s*relative/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-media-cell\.wiki-media-cell--shadow::after\s*\{[^}]*filter:\s*blur\(60px\)/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-media-cell\.wiki-media-cell--shadow \.wiki-media-cell__shadow-content\s*\{[^}]*z-index:\s*1/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-media-cell\.wiki-media-cell--well\s*\{[^}]*border-color:\s*color-mix\(in srgb,\s*var\(--wiki-editor-focus-border,\s*var\(--bs-primary,\s*#0d6efd\)\)\s*36%,\s*transparent\)/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-media-cell\.wiki-media-cell--well\s*\{[^}]*background:\s*linear-gradient\(145deg,\s*rgba\(31,\s*18,\s*35,\s*0\.82\),\s*rgba\(8,\s*7,\s*10,\s*0\.92\)\)/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-media-cell\.wiki-media-cell--well\s*\{[^}]*box-shadow:\s*inset\s+0\s+1px\s+0\s+rgba\(255,\s*244,\s*214,\s*0\.045\),\s*0\s+0\.85rem\s+2rem\s+rgba\(0,\s*0,\s*0,\s*0\.34\)/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-media-cell\[style\*="color"\] :where\(p,\s*li\)\s*\{[^}]*color:\s*inherit/);
  assert.match(editorCss, /\.wiki-media-cell--multi-selected\s*\{/);
  assert.match(editorCss, /\.wiki-editor-media-cell-color-menu\s*\{/);
  assert.match(editorCss, /\.wiki-editor-media-cell-color-menu__field\s*\{/);
  assert.match(editorCss, /\.wiki-editor-media-cell-color-menu__input\s*\{/);
  assert.match(editorCss, /\.wiki-editor-media-cell-color-menu__value\s*\{/);
});

await test("table cell block backgrounds keep their paired foreground color", function () {
  const editor = createEditor("<table><tbody><tr><td><p>Cell background</p></td></tr></tbody></table>");

  editor.commands.setTextSelection(5);
  assert.equal(editor.commands.setWikiBlockBackground({ backgroundColor: "#dbeafe" }), true);
  assert.match(editor.getHTML(), /<td[^>]*style="background-color: rgb\(219, 234, 254\); color: rgb\(17, 24, 39\);"[^>]*><p>Cell background<\/p><\/td>/);
  assert.match(articleBodyCss, /\.wiki-article-prose :where\(td, th\)\[style\*="color"\] :where\(p, li\)\s*\{[^}]*color:\s*inherit/s);
  editor.destroy();
});

await test("table cell paragraphs have no margins in article and editor prose", function () {
  assert.match(articleBodyCss, /\.wiki-article-prose\s+:where\(td,\s*th\)\s*>\s*p\s*\{[^}]*margin:\s*0/s);
  [editorCss, vendoredEditorCss].forEach(function (css) {
    assert.match(css, /\.westgate-wiki-compose\s+\.wiki-editor__content\s+:where\(td,\s*th\)\s*>\s*p\s*\{[^}]*margin:\s*0/s);
  });
});

await test("saved table colgroup widths reload into Tiptap column width attrs", function () {
  const savedHtml = '<table class="wiki-table-borderless wiki-table-layout-fixed" style="width:100%"><colgroup><col style="width:82px"><col style="width:94px"><col></colgroup><tbody><tr><td style="width:64px" colspan="1" rowspan="1"><p>Icon</p></td><td class="wiki-table-cell-valign-top" style="text-align:right" colspan="1" rowspan="1"><p><strong>Bull Rush:</strong></p></td><td class="wiki-table-cell-valign-top" colspan="1" rowspan="1"><p>pushes the enemy away.</p></td></tr></tbody></table>';
  const normalized = normalizeLegacyHtmlForTiptap(savedHtml);
  const editor = createEditor(sanitizeHtml(normalized));
  const rendered = editor.getHTML();

  assert.match(normalized, /<td(?=[^>]*\bcolwidth="82")(?=[^>]*\bstyle="width:64px")[^>]*>/);
  assert.match(normalized, /<td(?=[^>]*\bcolwidth="94")(?=[^>]*\bclass="wiki-table-cell-valign-top")(?=[^>]*\bstyle="text-align:right")[^>]*>/);
  assert.match(rendered, /<col style="width: 82px/);
  assert.match(rendered, /<col style="width: 94px/);
  editor.destroy();
});

await test("table styles preserve flexible size and border controls", function () {
  const editor = createEditor('<table><tbody><tr><td><p>Flexible</p></td></tr></tbody></table>');

  editor.commands.setTextSelection(5);
  assert.equal(editor.commands.updateAttributes("table", {
    class: "wiki-table-borderless wiki-table-layout-auto",
    style: "width: 50%; border-color: #caa55a"
  }), true);
  assert.equal(editor.commands.updateAttributes("tableCell", {
    style: "width: 12rem; border-color: #caa55a"
  }), true);
  assert.equal(editor.commands.updateAttributes("tableRow", {
    style: "height: 3rem"
  }), true);

  const rendered = editor.getHTML();
  assert.match(rendered, /<table[^>]*class="wiki-table-borderless wiki-table-layout-auto"[^>]*style="width: 50%; border-color: rgb\(202, 165, 90\);?"/);
  assert.match(rendered, /<tr style="height: 3rem;?">/);
  assert.match(rendered, /<td[^>]*style="width: 12rem; border-color: rgb\(202, 165, 90\);?"/);
  assert.match(sanitizeHtml(rendered), /border-color: rgb\(202, 165, 90\)/);
  [editorCss, vendoredEditorCss].forEach(function (css) {
    assert.match(css, /\.westgate-wiki-compose\s+\.wiki-editor__content\s+table\.wiki-table-layout-fixed\s*\{[^}]*table-layout:\s*fixed/s);
    assert.match(css, /\.westgate-wiki-compose\s+\.wiki-editor__content\s+table\[style\*=(?:"border-color"|border-color)\]\s+:where\(thead,\s*tbody,\s*tfoot,\s*tr,\s*th,\s*td\)\s*\{[^}]*border-color:\s*inherit/s);
    assert.match(css, /\.westgate-wiki-compose\s+\.wiki-editor__content\s+\.column-resize-handle\s*\{[^}]*cursor:\s*col-resize/s);
    assert.match(css, /\.westgate-wiki-compose\s+\.wiki-editor-table-resize-handle--width\s*\{[^}]*cursor:\s*ew-resize/s);
    assert.match(css, /\.westgate-wiki-compose\s+\.wiki-editor-table-resize-handle--row\s*\{[^}]*cursor:\s*ns-resize/s);
  });
  assert.match(articleBodyCss, /\.wiki-article-prose\s+table\[style\*=(?:"border-color"|border-color)\]\s+:where\(thead,\s*tbody,\s*tfoot,\s*tr,\s*th,\s*td\)\s*\{[^}]*border-color:\s*inherit/s);
  assert.match(editorBundleSource, /import\s+\{\s*createTableAuthoring\s*\}\s+from\s+["']\.\/table\/table-authoring-ui\.mjs["']/);
  assert.match(editorBundleSource, /import\s+\{\s*WestgateTableView\s*\}\s+from\s+["']\.\/table\/table-view\.mjs["']/);
  assert.match(editorBundleSource, /View:\s*WestgateTableView/);
  assert.match(editorBundleSource, /createTableAuthoring\(editorMount,\s*editor\)/);
  assert.doesNotMatch(editorBundleSource, /function\s+getTableToolDefs/);
  assert.doesNotMatch(editorBundleSource, /function\s+createTableContextToolbar/);
  assert.doesNotMatch(editorBundleSource, /function\s+createTableDimensionHandles/);
  editor.destroy();
});

await test("createWikiEditor mounts table authoring UI on the editor surface and cleans it up", async function () {
  const { createWikiEditor } = await importEditorBundleForContract();
  const host = document.createElement("div");
  host.className = "westgate-wiki-compose";
  document.body.appendChild(host);

  const wikiEditor = await createWikiEditor(host, {
    initialData: '<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table>'
  });

  const surface = host.querySelector(".wiki-editor__surface");
  const content = host.querySelector(".wiki-editor__content.ProseMirror, .wiki-editor__content");
  const editorRoot = host.querySelector(".wiki-editor");
  const toolbarMount = host.querySelector(".wiki-editor__toolbar-mount");
  const stickyRow = surface && surface.querySelector(".wiki-editor-table-sticky-row");
  const cellPopover = surface && surface.querySelector(".wiki-editor-table-cell-popover");

  assert.ok(editorRoot, "editor root should exist");
  assert.ok(toolbarMount, "toolbar mount should exist");
  assert.ok(surface, "editor surface should exist");
  assert.ok(content, "ProseMirror content should exist");
  assert.ok(stickyRow, "table sticky row should mount under the editor surface");
  assert.ok(cellPopover, "table cell popover should mount under the editor surface");
  assert.equal(content.contains(stickyRow), false, "table sticky row must not mount inside ProseMirror content");
  assert.equal(content.contains(cellPopover), false, "table cell popover must not mount inside ProseMirror content");

  toolbarMount.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 640, height: 96, right: 640, bottom: 96 };
  };
  window.dispatchEvent(new Event("resize"));
  assert.equal(editorRoot.style.getPropertyValue("--wiki-editor-main-toolbar-height"), "96px");

  toolbarMount.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 640, height: 124, right: 640, bottom: 124 };
  };
  editorRoot.dispatchEvent(new CustomEvent("wiki-editor-fullscreen-source-change"));
  assert.equal(editorRoot.style.getPropertyValue("--wiki-editor-main-toolbar-height"), "124px");

  wikiEditor.destroy();
  assert.equal(host.querySelector(".wiki-editor-table-sticky-row"), null);
  assert.equal(host.querySelector(".wiki-editor-table-cell-popover"), null);
  assert.equal(editorRoot.style.getPropertyValue("--wiki-editor-main-toolbar-height"), "");
  host.remove();
});

await test("alignment table node renders selected DnD alignments as a dedicated grid", function () {
  const editor = createEditor("");

  assert.equal(editor.commands.insertWikiAlignmentTable({ highlighted: ["lg", "tn", "ce", "bad"] }), true);
  const rendered = editor.getHTML();

  assert.match(rendered, /data-wiki-node="alignment-table"/);
  assert.match(rendered, /data-alignments="lg tn ce"/);
  assert.match(rendered, /data-mode="compact"/);
  assert.match(rendered, />LG<\/div>/);
  assert.match(rendered, />TN<\/div>/);
  assert.match(rendered, />CE<\/div>/);
  assert.doesNotMatch(rendered, /Lawful Good/);
  assert.match(rendered, /wiki-alignment-table__cell--active/);
  assert.doesNotMatch(rendered, /<td/);
  editor.destroy();
});

await test("alignment table full mode preserves full labels as secondary display", function () {
  const editor = createEditor("");

  assert.equal(editor.commands.insertWikiAlignmentTable({ highlighted: ["ng"], mode: "full" }), true);
  const rendered = editor.getHTML();

  assert.match(rendered, /data-mode="full"/);
  assert.match(rendered, /Neutral Good/);
  assert.doesNotMatch(rendered, />NG<\/div>/);
  editor.destroy();
});

await test("normalizeLegacyHtmlForTiptap preserves saved alignment tables as plugin-owned structures", function () {
  const savedHtml = '<div class="wiki-alignment-table wiki-alignment-table--compact" data-wiki-node="alignment-table" data-alignments="lg tn" data-mode="compact" contenteditable="false"><div class="wiki-alignment-table__cell wiki-alignment-table__cell--active" data-alignment="lg">LG</div><div class="wiki-alignment-table__cell" data-alignment="ng">NG</div></div>';
  const normalized = normalizeLegacyHtmlForTiptap(savedHtml);

  assert.match(normalized, /data-wiki-node="alignment-table"/);
  assert.match(normalized, /<div class="wiki-alignment-table__cell wiki-alignment-table__cell--active" data-alignment="lg">LG<\/div>/);
  assert.doesNotMatch(normalized, /<p class="wiki-alignment-table__cell/);
});

await test("normalizeLegacyHtmlForTiptap preserves saved infoboxes as plugin-owned structures", function () {
  const normalized = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene</div><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div></dl></aside>'
  );

  assert.match(normalized, /<aside class="wiki-infobox" data-wiki-node="infobox">/);
  assert.match(normalized, /data-wiki-infobox-part="title"/);
  assert.match(normalized, /<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">/);
  assert.match(normalized, /<dt>House<\/dt><dd>Voss<\/dd>/);
});

await test("normalizeLegacyHtmlForTiptap preserves saved infobox image helpers", function () {
  const normalized = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img src="/selene.png" alt="Selene"></figure></aside>'
  );

  assert.match(normalized, /<figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img src="\/selene\.png" alt="Selene"><\/figure>/);
  assert.doesNotMatch(normalized, /<figure class="image"/);
});

await test("normalizeLegacyHtmlForTiptap only preserves canonical infobox definition rows", function () {
  const canonical = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div></dl></aside>'
  );
  const genericContent = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__content" data-wiki-infobox-part="content"><dl><dt>Loose</dt><dd>Value</dd></dl></div></aside>'
  );
  const malformedRows = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><dt>Loose</dt><dd>Value</dd></dl></aside>'
  );

  assert.match(canonical, /<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House<\/dt><dd>Voss<\/dd><\/div><\/dl>/);
  assert.doesNotMatch(genericContent, /<dl/);
  assert.doesNotMatch(genericContent, /<dt/);
  assert.doesNotMatch(genericContent, /<dd/);
  assert.match(genericContent, /<p><strong>Loose<\/strong><\/p><p>Value<\/p>/);
  assert.match(malformedRows, /<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>Loose<\/dt><dd>Value<\/dd><\/div><\/dl>/);
});

await test("normalizeLegacyHtmlForTiptap repairs malformed infobox rows without dropping visible text", function () {
  const valueOnly = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><dd>Value</dd></dl></aside>'
  );
  const rowWithProse = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><p>Text</p></div></dl></aside>'
  );
  const rowWithExtraContent = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd><p>Lost note</p></div></dl></aside>'
  );
  const rowsWithDirectText = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">Loose text<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div></dl></aside>'
  );
  const termOnlyWithExtraContent = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><p>Lost note</p></div></dl></aside>'
  );
  const valueOnlyWithExtraContent = normalizeLegacyHtmlForTiptap(
    '<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dd>Value</dd><p>Lost note</p></div></dl></aside>'
  );
  const prettyPrintedDirectRows = [
    '<aside class="wiki-infobox" data-wiki-node="infobox">',
    '<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">',
    '  <dt>House</dt>',
    '  <dd>Voss</dd>',
    '</dl>',
    '</aside>'
  ].join("\n");
  const prettyPrintedRows = normalizeLegacyHtmlForTiptap(prettyPrintedDirectRows);

  assert.match(valueOnly, /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt><\/dt><dd>Value<\/dd><\/div>/);
  assert.match(rowWithProse, /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>Text<\/dt><dd><\/dd><\/div>/);
  assert.match(rowWithExtraContent, /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House<\/dt><dd>Voss Lost note<\/dd><\/div>/);
  assert.match(rowsWithDirectText, /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>Loose text<\/dt><dd><\/dd><\/div><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House<\/dt><dd>Voss<\/dd><\/div>/);
  assert.match(termOnlyWithExtraContent, /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House<\/dt><dd>Lost note<\/dd><\/div>/);
  assert.match(valueOnlyWithExtraContent, /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt><\/dt><dd>Value Lost note<\/dd><\/div>/);
  assert.match(prettyPrintedRows, /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House<\/dt>\s*<dd>Voss<\/dd><\/div>/);
  assert.equal(detectUnsupportedContent(prettyPrintedDirectRows), "");
});

await test("detectUnsupportedContent rejects empty infobox rows helpers", function () {
  assert.match(
    detectUnsupportedContent('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"></dl></aside>'),
    /definition rows/
  );
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

await test("normalizeLegacyHtmlForTiptap upgrades pasted infobox rows nested under rows helpers", function () {
  const normalized = normalizeLegacyHtmlForTiptap(
    '<aside class="infobox"><dl class="rows"><div class="row"><dt>House</dt><dd>Voss</dd></div></dl></aside>'
  );

  assert.match(normalized, /<aside class="wiki-infobox" data-wiki-node="infobox">/);
  assert.match(normalized, /<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">/);
  assert.match(normalized, /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House<\/dt><dd>Voss<\/dd><\/div>/);
});

await test("normalizeLegacyHtmlForTiptap preserves generic row classes inside infobox content", function () {
  const normalized = normalizeLegacyHtmlForTiptap(
    '<aside class="infobox"><div class="content"><div class="row"><p>Nested layout row</p></div></div></aside>'
  );

  assert.match(normalized, /<aside class="wiki-infobox" data-wiki-node="infobox">/);
  assert.match(normalized, /<div class="wiki-infobox__content" data-wiki-infobox-part="content"><div class="row"><p>Nested layout row<\/p><\/div><\/div>/);
  assert.doesNotMatch(normalized, /wiki-infobox__row/);
  assert.doesNotMatch(normalized, /data-wiki-infobox-part="row"/);
});

await test("normalizeLegacyHtmlForTiptap preserves saved poetry quotes as plugin-owned structures", function () {
  const savedHtml = '<figure class="wiki-poetry-quote wiki-poetry-quote--plain" data-wiki-node="poetry-quote" data-wiki-quote-container="false"><blockquote class="wiki-poetry-quote__body"><p>Spoken words.</p><p class="wiki-poetry-quote__attribution">- Author</p></blockquote></figure>';
  const normalized = normalizeLegacyHtmlForTiptap(savedHtml);

  assert.match(normalized, /<figure class="wiki-poetry-quote wiki-poetry-quote--plain" data-wiki-node="poetry-quote" data-wiki-quote-container="false">/);
  assert.match(normalized, /<blockquote class="wiki-poetry-quote__body">/);
  assert.match(normalized, /<p class="wiki-poetry-quote__attribution">- Author<\/p>/);
});

await test("normalizeLegacyHtmlForTiptap preserves saved poetry quote positioning", function () {
  const savedHtml = '<figure class="wiki-poetry-quote wiki-poetry-quote--right" data-wiki-node="poetry-quote" data-wiki-quote-position="right"><blockquote class="wiki-poetry-quote__body"><p>Spoken words.</p><p class="wiki-poetry-quote__attribution">- Author</p></blockquote></figure>';
  const normalized = normalizeLegacyHtmlForTiptap(savedHtml);

  assert.match(normalized, /data-wiki-quote-position="right"/);
  assert.match(normalized, /wiki-poetry-quote--right/);
});

await test("saved containerless poetry quotes reopen as editable quote widgets", function () {
  const savedHtml = '<figure class="wiki-poetry-quote wiki-poetry-quote--plain" data-wiki-node="poetry-quote" data-wiki-quote-container="false"><blockquote class="wiki-poetry-quote__body"><p>Spoken words.</p><p class="wiki-poetry-quote__attribution">- Author</p></blockquote></figure>';
  const editor = createEditor(normalizeLegacyHtmlForTiptap(savedHtml));
  const rendered = editor.getHTML();

  assert.equal(editor.state.doc.child(0).type.name, "wikiPoetryQuote");
  assert.equal(editor.getJSON().content[0].attrs.container, false);
  assert.match(rendered, /data-wiki-quote-container="false"/);
  assert.match(rendered, /wiki-poetry-quote--plain/);
  editor.destroy();
});

await test("saved positioned poetry quotes reopen with their block position", function () {
  const savedHtml = '<figure class="wiki-poetry-quote wiki-poetry-quote--center" data-wiki-node="poetry-quote" data-wiki-quote-position="center"><blockquote class="wiki-poetry-quote__body"><p>Spoken words.</p><p class="wiki-poetry-quote__attribution">- Author</p></blockquote></figure>';
  const editor = createEditor(normalizeLegacyHtmlForTiptap(savedHtml));
  const rendered = editor.getHTML();

  assert.equal(editor.state.doc.child(0).type.name, "wikiPoetryQuote");
  assert.equal(editor.getJSON().content[0].attrs.position, "center");
  assert.match(rendered, /data-wiki-quote-position="center"/);
  assert.match(rendered, /wiki-poetry-quote--center/);
  editor.destroy();
});

await test("saved alignment tables reopen as atomic editable widgets", function () {
  const savedHtml = '<div class="wiki-alignment-table wiki-alignment-table--compact" data-wiki-node="alignment-table" data-alignments="lg tn" data-mode="compact" contenteditable="false"><div class="wiki-alignment-table__cell wiki-alignment-table__cell--active" data-alignment="lg">LG</div><div class="wiki-alignment-table__cell" data-alignment="ng">NG</div></div>';
  const editor = createEditor(normalizeLegacyHtmlForTiptap(savedHtml));
  const rendered = editor.getHTML();

  assert.equal(editor.state.doc.child(0).type.name, "wikiAlignmentTable");
  assert.match(rendered, /data-wiki-node="alignment-table"/);
  assert.match(rendered, />LG<\/div>/);
  assert.doesNotMatch(rendered, /<p class="wiki-alignment-table__cell/);
  editor.destroy();
});

await test("alignment table css keeps compact cells square and full labels unwrapped", function () {
  assert.match(articleBodyCss, /\.wiki-article-prose\s+\.wiki-alignment-table--compact\s+\.wiki-alignment-table__cell\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
  assert.match(articleBodyCss, /\.wiki-article-prose\s+\.wiki-alignment-table--full\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*max-content\)/s);
  assert.match(articleBodyCss, /\.wiki-article-prose\s+\.wiki-alignment-table--full\s+\.wiki-alignment-table__cell\s*\{[^}]*white-space:\s*nowrap/s);
});

await test("alignment table cells suppress paragraph wrapper spacing in article prose", function () {
  assert.match(articleBodyCss, /\.wiki-article-prose\s+\.wiki-alignment-table\s+\.wiki-alignment-table__cell\s*>\s*p\s*\{[^}]*margin-block:\s*0\s*!important/s);
  assert.match(articleBodyCss, /\.wiki-article-prose\s+\.wiki-alignment-table\s+\.wiki-alignment-table__cell\s*>\s*p\s*\{[^}]*padding:\s*0\s*!important/s);
});

await test("imageFigure parses and renders linked figures with captions intact", function () {
  const editor = createEditor(
    '<figure class="image image-style-align-right wiki-image-size-md" id="hero"><a href="/full.png" target="_blank" rel="noopener noreferrer"><img src="/thumb.png" alt="Thumb" width="240"></a><figcaption><p>Caption</p></figcaption></figure>'
  );
  const rendered = editor.getHTML();
  const figureDom = editor.view.dom.querySelector('figure[data-wiki-node="image-figure"]');

  assert.match(rendered, /<figure class="image image-style-align-right wiki-image-size-md" data-wiki-node="image-figure" id="hero">/);
  assert.match(rendered, /<a href="\/full\.png" target="_blank" rel="noopener noreferrer"><img src="\/thumb\.png" alt="Thumb" width="240"><\/a>/);
  assert.match(rendered, /<figcaption><p>Caption<\/p><\/figcaption>/);
  assert.equal(figureDom.querySelector(".wiki-image-figure__media").getAttribute("contenteditable"), "false");
  assert.equal(figureDom.querySelector("figcaption").getAttribute("contenteditable"), null);
  editor.destroy();
});

await test("regular image can be converted into a plugin-owned image figure", function () {
  const editor = createEditor('<p><img src="/plain.png" alt="Plain" title="Plain title" width="320" class="wiki-image-align-right wiki-image-size-md"></p>');
  const image = editor.view.dom.querySelector("img");
  const selectionPos = editor.view.posAtDOM(image, 0);

  editor.chain().focus().setNodeSelection(selectionPos).convertImageToFigure().run();
  const rendered = editor.getHTML();

  assert.match(rendered, /<figure class="image image-style-align-right wiki-image-size-md" data-wiki-node="image-figure">/);
  assert.match(rendered, /<img src="\/plain\.png" alt="Plain" title="Plain title" width="320">/);
  assert.match(rendered, /<figcaption><p><\/p><\/figcaption>/);
  assert.doesNotMatch(rendered, /<p><figure/);
  assert.equal(editor.state.selection.node && editor.state.selection.node.type.name, "imageFigure");
  assert.equal(setSelectedImageWidth(editor, 280), true);
  assert.match(editor.getHTML(), /<img src="\/plain\.png" alt="Plain" title="Plain title" width="280">/);
  editor.destroy();
});

await test("image figure can be converted back into a regular editable image", function () {
  const editor = createEditor('<figure class="image image-style-align-right wiki-image-size-md" id="hero"><img src="/plain.png" alt="Plain" title="Plain title" width="320"><figcaption><p>Caption</p></figcaption></figure>');
  const figure = editor.view.dom.querySelector("figure.image");
  const selectionPos = editor.view.posAtDOM(figure, 0);

  editor.chain().focus().setNodeSelection(selectionPos).convertFigureToImage().run();
  const rendered = editor.getHTML();

  assert.match(rendered, /<img[^>]*src="\/plain\.png"[^>]*>/);
  assert.match(rendered, /<img[^>]*alt="Plain"[^>]*>/);
  assert.match(rendered, /<img[^>]*title="Plain title"[^>]*>/);
  assert.match(rendered, /<img[^>]*width="320"[^>]*>/);
  assert.match(rendered, /class="wiki-image-align-right wiki-image-size-md"/);
  assert.doesNotMatch(rendered, /<figure/);
  assert.equal(editor.state.selection.node && editor.state.selection.node.type.name, "image");
  editor.destroy();
});

await test("selected image width updates as a bounded resize attribute", function () {
  const editor = createEditor('<p><img src="/plain.png" alt="Plain" width="320" class="wiki-image-size-md"></p>');
  const image = editor.view.dom.querySelector("img");
  const selectionPos = editor.view.posAtDOM(image, 0);

  editor.chain().focus().setNodeSelection(selectionPos).run();
  assert.equal(calculateResizedImageWidth({ startWidth: 320, deltaX: 90, directionX: 1, minWidth: 96, maxWidth: 380 }), 380);
  assert.equal(setSelectedImageWidth(editor, 380), true);

  const rendered = editor.getHTML();
  assert.match(rendered, /<img[^>]*src="\/plain\.png"[^>]*>/);
  assert.match(rendered, /<img[^>]*width="380"[^>]*>/);
  assert.doesNotMatch(rendered, /wiki-image-size-md/);
  editor.destroy();
});

await test("selected image figure width updates through the same resize contract", function () {
  const editor = createEditor('<figure class="image wiki-image-size-lg"><img src="/figure.png" alt="Figure" width="420"><figcaption><p>Caption</p></figcaption></figure>');
  const figure = editor.view.dom.querySelector("figure.image");
  const selectionPos = editor.view.posAtDOM(figure, 0);

  editor.chain().focus().setNodeSelection(selectionPos).run();
  assert.equal(setSelectedImageWidth(editor, 260), true);

  const rendered = editor.getHTML();
  assert.match(rendered, /<figure class="image" data-wiki-node="image-figure">/);
  assert.match(rendered, /<img src="\/figure\.png" alt="Figure" width="260">/);
  assert.doesNotMatch(rendered, /wiki-image-size-lg/);
  editor.destroy();
});

await test("full-width image figures can be reselected by clicking the figure surface", function () {
  const editor = createEditor('<figure class="image image-style-block wiki-image-size-full"><img src="/full.png" alt="Full"><figcaption><p>Caption</p></figcaption></figure><p>After</p>');
  const figure = editor.view.dom.querySelector('[data-wiki-node="image-figure"]');

  editor.commands.setTextSelection(editor.state.doc.content.size);
  assert.equal(selectClickedImageNode(editor, figure, editor.view.dom), true);
  assert.equal(editor.state.selection.node.type.name, "imageFigure");
  editor.destroy();
});

await test("click-selecting image figures does not request editor scroll", async function () {
  const editor = createEditor('<figure class="image image-style-block wiki-image-size-full"><img src="/full.png" alt="Full"><figcaption><p>Caption</p></figcaption></figure><p>After</p>');
  const figure = editor.view.dom.querySelector('[data-wiki-node="image-figure"]');

  editor.commands.setTextSelection(editor.state.doc.content.size);
  const cleanupFocus = moveFocusOutsideEditor();
  const getScrollRequests = countEditorScrollRequests(editor);

  assert.equal(selectClickedImageNode(editor, figure, editor.view.dom), true);
  await nextAnimationFrame();

  assert.equal(editor.state.selection.node.type.name, "imageFigure");
  assert.equal(getScrollRequests(), 0);
  cleanupFocus();
  editor.destroy();
});

await test("image figure captions remain editable instead of selecting the whole figure", function () {
  const editor = createEditor('<figure class="image"><img src="/full.png" alt="Full"><figcaption><p>Caption</p></figcaption></figure><p>After</p>');
  const captionText = editor.view.dom.querySelector("figcaption p").firstChild;
  const image = editor.view.dom.querySelector("figure.image img");

  editor.commands.setTextSelection(editor.state.doc.content.size);
  assert.equal(selectClickedImageNode(editor, captionText, editor.view.dom), false);
  assert.notEqual(editor.state.selection.node && editor.state.selection.node.type.name, "imageFigure");

  assert.equal(selectClickedImageNode(editor, image, editor.view.dom), true);
  assert.equal(editor.state.selection.node.type.name, "imageFigure");
  editor.destroy();
});

await test("saved aligned image figures can be selected from the image element", function () {
  const editor = createEditor('<figure class="image image-style-align-right" data-wiki-node="image-figure"><img src="/assets/uploads/files/1778247064628-fire.gif" alt="fire.gif" width="755"><figcaption><p>Figure 1: me irl</p></figcaption></figure>');
  const image = editor.view.dom.querySelector('figure.image img[width="755"]');

  editor.commands.setTextSelection(editor.state.doc.content.size);
  assert.equal(selectClickedImageNode(editor, image, editor.view.dom), true);
  assert.equal(editor.state.selection.node && editor.state.selection.node.type.name, "imageFigure");
  assert.equal(getSelectedImageElement(editor, editor.view.dom), image);
  assert.equal(setSelectedImageWidth(editor, 512), true);
  assert.match(editor.getHTML(), /<img src="\/assets\/uploads\/files\/1778247064628-fire\.gif" alt="fire\.gif" width="512">/);
  editor.destroy();
});

await test("image figure selection is handled on mousedown before ProseMirror click selection", function () {
  assert.match(
    editorBundleSource,
    /handleDOMEvents:\s*\{[\s\S]*mousedown:\s*function \(_view, event\)[\s\S]*selectClickedImageNode\(editor, target, editorMount\)[\s\S]*click:\s*function \(_view, event\)/
  );
});

await test("image toolbar sync does not reference table-only state", function () {
  const match = editorBundleSource.match(/function createImageContextToolbar\(surface, editor\) \{[\s\S]*?\nfunction getSelectionElement/);
  assert.ok(match, "image context toolbar source should be present");
  assert.doesNotMatch(match[0], /activeTable\s*=\s*table/);
});

await test("mediaRow insert command renders bounded two- and three-cell layouts", function () {
  const editor = createEditor("<p>Start</p>");

  editor.commands.insertMediaRow(99);
  const rendered = editor.getHTML();
  const cellCount = (rendered.match(/data-wiki-node="media-cell"/g) || []).length;

  assert.match(rendered, /data-wiki-node="media-row"/);
  assert.equal(cellCount, 3);
  editor.destroy();
});

await test("mediaCell parses and renders supported style presets", function () {
  const editor = createEditor(
    '<div class="wiki-media-row"><div class="wiki-media-cell wiki-media-cell--shadow" data-wiki-node="media-cell"><p>Portrait</p></div><div class="wiki-media-cell wiki-media-cell--gilded" data-wiki-node="media-cell"><p>Frame</p></div><div class="wiki-media-cell wiki-media-cell--well" data-wiki-node="media-cell"><p>Notes</p></div></div>'
  );
  const json = editor.getJSON();
  const rendered = editor.getHTML();

  assert.equal(MEDIA_CELL_STYLE_PRESETS.includes("gilded"), true);
  assert.equal(json.content[0].content[0].attrs.stylePreset, "shadow");
  assert.equal(json.content[0].content[1].attrs.stylePreset, "gilded");
  assert.equal(json.content[0].content[2].attrs.stylePreset, "well");
  assert.match(rendered, /class="wiki-media-cell wiki-media-cell--shadow"[^>]*><div class="wiki-media-cell__shadow-content"><p>Portrait<\/p><\/div><\/div>/);
  assert.match(rendered, /class="wiki-media-cell wiki-media-cell--gilded"/);
  assert.match(rendered, /class="wiki-media-cell wiki-media-cell--well"/);
  editor.destroy();
});

await test("mediaCell shadow content wrapper reparses without extra content nodes", function () {
  const firstOpen = createEditor(
    '<div class="wiki-media-row"><div class="wiki-media-cell wiki-media-cell--shadow" data-wiki-node="media-cell"><p>Shadowed</p></div></div>'
  );
  const rendered = firstOpen.getHTML();
  firstOpen.destroy();

  assert.match(rendered, /wiki-media-cell__shadow-content/);

  const reopened = createEditor(sanitizeHtml(rendered));
  const cell = findJsonNode(reopened.getJSON(), "mediaCell");

  assert.ok(cell);
  assert.equal(cell.attrs.stylePreset, "shadow");
  assert.equal(cell.content[0].type, "paragraph");
  assert.equal(cell.content[0].content[0].text, "Shadowed");
  assert.doesNotMatch(JSON.stringify(cell), /containerBlock/);
  reopened.destroy();
});

await test("mediaCell parses and renders custom background, text, and border colors", function () {
  const editor = createEditor(
    '<div class="wiki-media-row"><div class="wiki-media-cell wiki-media-cell--custom" data-wiki-node="media-cell" style="background-color: #22172d; border-color: #7b617f; border-width: 4px; position: fixed"><p>Custom</p></div></div>'
  );
  const json = editor.getJSON();
  const rendered = editor.getHTML();

  assert.equal(json.content[0].content[0].attrs.stylePreset, "custom");
  assert.equal(json.content[0].content[0].attrs.backgroundColor, "rgb(34, 23, 45)");
  assert.equal(json.content[0].content[0].attrs.textColor, "rgb(249, 250, 251)");
  assert.equal(json.content[0].content[0].attrs.borderColor, "rgb(123, 97, 127)");
  assert.equal(json.content[0].content[0].attrs.borderWidth, "4px");
  assert.match(rendered, /class="wiki-media-cell wiki-media-cell--custom"/);
  assert.match(rendered, /style="[^"]*background-color: rgb\(34, 23, 45\)/);
  assert.match(rendered, /style="[^"]*color: rgb\(249, 250, 251\)/);
  assert.match(rendered, /style="[^"]*border-color: rgb\(123, 97, 127\)/);
  assert.match(rendered, /style="[^"]*border-width: 4px/);
  assert.doesNotMatch(rendered, /position:/);
  editor.destroy();
});

await test("mediaCell style helpers clear presets and custom colors", function () {
  assert.deepEqual(getMediaCellStyleAttrs({ stylePreset: "shadow" }), {
    stylePreset: "shadow",
    backgroundColor: null,
    textColor: null,
    borderColor: null,
    borderWidth: null,
    style: null
  });
  assert.deepEqual(getMediaCellStyleAttrs({
    stylePreset: "custom",
    backgroundColor: "#22172d",
    borderColor: "#7b617f",
    borderWidth: "4px"
  }), {
    stylePreset: "custom",
    backgroundColor: "rgb(34, 23, 45)",
    textColor: "rgb(249, 250, 251)",
    borderColor: "rgb(123, 97, 127)",
    borderWidth: "4px",
    style: "background-color: rgb(34, 23, 45); color: rgb(249, 250, 251); border-color: rgb(123, 97, 127); border-width: 4px"
  });
  assert.deepEqual(clearMediaCellStyleAttrs(), {
    stylePreset: null,
    backgroundColor: null,
    textColor: null,
    borderColor: null,
    borderWidth: null,
    style: null
  });
  assert.equal(mergeMediaCellColorStyle("position: fixed; background-color: #111827", "#22172d", "#7b617f", "4px"), "background-color: rgb(34, 23, 45); color: rgb(249, 250, 251); border-color: rgb(123, 97, 127); border-width: 4px");
  assert.equal(mergeMediaCellColorStyle("border-width: 3px", "#22172d", "#7b617f"), "background-color: rgb(34, 23, 45); color: rgb(249, 250, 251); border-color: rgb(123, 97, 127); border-width: 3px");
});

await test("media cell selection toggles individual cell positions", function () {
  const editor = createEditor('<div class="wiki-media-row"><div class="wiki-media-cell"><p>A</p></div><div class="wiki-media-cell"><p>B</p></div></div>');
  const cells = findNodePositions(editor, "mediaCell");

  assert.ok(MEDIA_CELL_SELECTION_PLUGIN_KEY.getState(editor.state), "selection plugin state should be registered");

  editor.view.dispatch(toggleMediaCellSelectionAt(editor.state.tr, cells[0]));
  assert.deepEqual(getSelectedMediaCellPositions(editor.state), [cells[0]]);

  editor.view.dispatch(toggleMediaCellSelectionAt(editor.state.tr, cells[1]));
  assert.deepEqual(getSelectedMediaCellPositions(editor.state), [cells[0], cells[1]]);

  editor.view.dispatch(toggleMediaCellSelectionAt(editor.state.tr, cells[0]));
  assert.deepEqual(getSelectedMediaCellPositions(editor.state), [cells[1]]);
  editor.destroy();
});

await test("media cell command targets selected cells before active cell", function () {
  const editor = createEditor('<div class="wiki-media-row"><div class="wiki-media-cell"><p>A</p></div><div class="wiki-media-cell"><p>B</p></div></div>');
  const cells = findNodePositions(editor, "mediaCell");

  editor.view.dispatch(toggleMediaCellSelectionAt(editor.state.tr, cells[0]));
  editor.view.dispatch(toggleMediaCellSelectionAt(editor.state.tr, cells[1]));
  assert.deepEqual(getTargetMediaCellPositions(editor.state), cells);

  assert.equal(editor.commands.setMediaCellStyle("shadow"), true);
  const rendered = editor.getHTML();
  assert.equal((rendered.match(/wiki-media-cell--shadow/g) || []).length, 2);
  editor.destroy();
});

await test("media cell custom colors can apply to captured cells after selection moves", function () {
  const editor = createEditor('<p>Intro</p><div class="wiki-media-row"><div class="wiki-media-cell"><p>A</p></div><div class="wiki-media-cell"><p>B</p></div></div><p>Outro</p>');
  const cells = findNodePositions(editor, "mediaCell");
  const outro = findTextRange(editor, "Outro");

  editor.commands.setTextSelection(outro);

  assert.equal(editor.commands.setMediaCellColorsAtPositions([cells[0]], {
    backgroundColor: "#26a269",
    borderColor: "#d4b16a",
    borderWidth: "5px"
  }), true);

  const rendered = editor.getHTML();
  assert.match(rendered, /<div class="wiki-media-cell wiki-media-cell--custom" data-wiki-node="media-cell" style="(?=[^"]*background-color: rgb\(38, 162, 105\))(?=[^"]*color: rgb\(17, 24, 39\))(?=[^"]*border-color: rgb\(212, 177, 106\))(?=[^"]*border-width: 5px)[^"]*"><p>A<\/p><\/div>/);
  assert.match(rendered, /<div class="wiki-media-cell" data-wiki-node="media-cell"><p>B<\/p><\/div>/);
  editor.destroy();
});

await test("media cell custom colors update the node style attribute directly", function () {
  const editor = createEditor('<div class="wiki-media-row"><div class="wiki-media-cell wiki-media-cell--custom" data-wiki-node="media-cell" style="background-color: #26a269"><p>A</p></div></div>');
  const cells = findNodePositions(editor, "mediaCell");

  assert.equal(editor.commands.setMediaCellColorsAtPositions([cells[0]], {
    borderColor: "#d4b16a",
    borderWidth: "5px"
  }), true);

  const attrs = editor.getJSON().content[0].content[0].attrs;
  assert.match(attrs.style, /background-color: rgb\(38, 162, 105\)/);
  assert.match(attrs.style, /color: rgb\(17, 24, 39\)/);
  assert.match(attrs.style, /border-color: rgb\(212, 177, 106\)/);
  assert.match(attrs.style, /border-width: 5px/);
  assert.match(editor.getHTML(), /style="(?=[^"]*background-color: rgb\(38, 162, 105\))(?=[^"]*color: rgb\(17, 24, 39\))(?=[^"]*border-color: rgb\(212, 177, 106\))(?=[^"]*border-width: 5px)[^"]*"/);
  editor.destroy();
});

await test("media cell color picker input updates the source without a separate apply click", async function () {
  const { createWikiEditor } = await importEditorBundleForContract();
  const host = document.createElement("div");
  host.className = "westgate-wiki-compose";
  document.body.appendChild(host);

  const wikiEditor = await createWikiEditor(host, {
    initialData: '<div class="wiki-media-row"><div class="wiki-media-cell wiki-media-cell--custom" data-wiki-node="media-cell" style="background-color: rgb(34, 23, 45)"><p>colorful</p></div></div>'
  });

  const cell = host.querySelector('[data-wiki-node="media-cell"]');
  cell.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  await nextAnimationFrame();

  const colorButton = host.querySelector('[data-toolbar-id="media-cell-style-colors"]');
  assert.ok(colorButton, "media cell color button should exist");
  colorButton.click();

  const inputs = Array.from(document.querySelectorAll(".wiki-editor-media-cell-color-menu input[type='color']"));
  assert.equal(inputs.length, 2);
  inputs[1].value = "#d4b16a";
  inputs[1].dispatchEvent(new window.Event("input", { bubbles: true }));

  const widthInputs = Array.from(document.querySelectorAll(".wiki-editor-media-cell-color-menu input[type='number']"));
  assert.equal(widthInputs.length, 1);
  widthInputs[0].value = "6";
  widthInputs[0].dispatchEvent(new window.Event("input", { bubbles: true }));

  assert.match(wikiEditor.getHTML(), /style="(?=[^"]*background-color: rgb\(34, 23, 45\))(?=[^"]*color: rgb\(249, 250, 251\))(?=[^"]*border-color: rgb\(212, 177, 106\))(?=[^"]*border-width: 6px)[^"]*"/);

  wikiEditor.destroy();
  document.querySelector(".wiki-editor-media-cell-color-menu")?.remove();
  host.remove();
});

await test("editor bundle wires media cell selection helpers and style controls", function () {
  assert.match(editorBundleSource, /import\s+MediaCellSelection,\s*\{\s*getTargetMediaCellPositions\s*\}/);
  assert.match(editorBundleSource, /handleMediaCellSelectionClick\(editor,\s*mediaCell,\s*event\)/);
  assert.match(editorBundleSource, /id:\s*"media-cell-style-shadow"/);
  assert.match(editorBundleSource, /id:\s*"media-cell-style-gilded"/);
  assert.match(editorBundleSource, /id:\s*"media-cell-style-well"/);
  assert.match(editorBundleSource, /id:\s*"media-cell-style-colors"/);
  assert.match(editorBundleSource, /id:\s*"media-cell-style-clear"/);
  assert.match(editorBundleSource, /setMediaCellStyle\("shadow"\)/);
  assert.match(editorBundleSource, /textColor:\s*getReadableTextColor\(backgroundInput\.value\)/);
  assert.match(editorBundleSource, /setMediaCellColorsAtPositions\(targetPositions,/);
  assert.match(editorBundleSource, /clearMediaCellStyleAtPositions\(targetPositions\)/);
});

await test("media cell color menu uses labelled color picker fields", function () {
  const match = editorBundleSource.match(/function createMediaCellColorMenu\(button, editor\) \{[\s\S]*?\nfunction createMediaRowContextToolbar/);
  assert.ok(match, "media cell color menu source should be present");
  assert.match(editorBundleSource, /function createMediaCellColorField/);
  assert.match(editorBundleSource, /wiki-editor-media-cell-color-menu__field/);
  assert.match(editorBundleSource, /wiki-editor-media-cell-color-menu__input/);
  assert.match(editorBundleSource, /wiki-editor-media-cell-color-menu__number/);
  assert.match(editorBundleSource, /wiki-editor-media-cell-color-menu__value/);
  assert.match(match[0], /Background color/);
  assert.match(match[0], /Border color/);
  assert.match(match[0], /Border size/);
  assert.doesNotMatch(match[0], /className\s*=\s*"wiki-editor-color-custom"/);
});

await test("media cell style click helper toggles multi-selection on modified click", function () {
  const editor = createEditor('<div class="wiki-media-row"><div class="wiki-media-cell"><p>A</p></div><div class="wiki-media-cell"><p>B</p></div></div>');
  const firstCell = editor.view.dom.querySelector('[data-wiki-node="media-cell"]');
  const handled = handleMediaCellSelectionClick(editor, firstCell, {
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    preventDefault: function () {},
    stopPropagation: function () {}
  });

  assert.equal(handled, true);
  assert.deepEqual(getSelectedMediaCellPositions(editor.state), [findNodePositions(editor, "mediaCell")[0]]);
  editor.destroy();
});

await test("mediaRow two-up html round-trips without containerBlock wrappers manufacturing extra cells", function () {
  const savedHtml = '<div class="wiki-media-row" data-wiki-node="media-row"><div class="wiki-media-cell" data-wiki-node="media-cell"><img data-wiki-node="image" src="/a.png"></div><div class="wiki-media-cell" data-wiki-node="media-cell"><img data-wiki-node="image" src="/b.png"></div></div>';
  const firstOpen = createEditor(savedHtml);
  const firstRender = firstOpen.getHTML();

  assert.equal((firstRender.match(/data-wiki-node="media-row"/g) || []).length, 1);
  assert.equal((firstRender.match(/data-wiki-node="media-cell"/g) || []).length, 2);

  const reopened = createEditor(sanitizeHtml(firstRender));
  const secondRender = reopened.getHTML();

  assert.equal((secondRender.match(/data-wiki-node="media-row"/g) || []).length, 1);
  assert.equal((secondRender.match(/data-wiki-node="media-cell"/g) || []).length, 2);
  assert.doesNotMatch(secondRender, /<div class="wiki-media-row"><div class="wiki-media-row"/);

  firstOpen.destroy();
  reopened.destroy();
});

await test("mediaRow commands add, delete, unwrap, and remove rows from an active cell", function () {
  const editor = createEditor('<p>Before</p><div class="wiki-media-row"><div class="wiki-media-cell"><p>A</p></div><div class="wiki-media-cell"><p>B</p></div></div><p>After</p>');

  editor.commands.setTextSelection(findNodePositions(editor, "mediaCell")[0] + 2);
  assert.equal(editor.commands.addMediaCellAfter(), true);
  assert.equal((editor.getHTML().match(/data-wiki-node="media-cell"/g) || []).length, 3);
  assert.equal(editor.commands.deleteMediaCell(), true);
  assert.equal((editor.getHTML().match(/data-wiki-node="media-cell"/g) || []).length, 2);
  assert.equal(editor.commands.unwrapMediaRow(), true);
  assert.doesNotMatch(editor.getHTML(), /data-wiki-node="media-row"/);
  assert.match(editor.getHTML(), /<p>A<\/p>/);
  assert.match(editor.getHTML(), /<p>B<\/p>/);

  editor.destroy();
});

await test("mediaRow delete command removes the active row without deleting surrounding content", function () {
  const editor = createEditor('<p>Before</p><div class="wiki-media-row"><div class="wiki-media-cell"><p>A</p></div><div class="wiki-media-cell"><p>B</p></div></div><p>After</p>');

  editor.commands.setTextSelection(findNodePositions(editor, "mediaCell")[0] + 2);
  assert.equal(editor.commands.deleteMediaRow(), true);

  const rendered = editor.getHTML();
  assert.doesNotMatch(rendered, /data-wiki-node="media-row"/);
  assert.match(rendered, /<p>Before<\/p>/);
  assert.match(rendered, /<p>After<\/p>/);
  assert.doesNotMatch(rendered, /<p>A<\/p>/);
  editor.destroy();
});

await test("media row contextual toolbar exposes explicit row and cell editing actions", function () {
  [editorBundleSource, vendoredEditorBundleSource].forEach(function (source) {
    assert.match(source, /media-cell-add-before/);
    assert.match(source, /media-cell-add-after/);
    assert.match(source, /media-cell-delete/);
    assert.match(source, /media-row-unwrap/);
    assert.match(source, /media-row-delete/);
  });

  assert.match(editorBundleSource, /function createMediaRowContextToolbar\(surface, editor\)/);
  assert.match(editorBundleSource, /addMediaCellBefore/);
  assert.match(editorBundleSource, /addMediaCellAfter/);
  assert.match(editorBundleSource, /deleteMediaCell/);
  assert.match(editorBundleSource, /unwrapMediaRow/);
  assert.match(editorBundleSource, /deleteMediaRow/);
});

await test("populated media cell chrome clicks do not force the cursor to the cell start", function () {
  const editor = createEditor('<div class="wiki-media-row"><div class="wiki-media-cell"><p>First cell text</p></div><div class="wiki-media-cell"><p>Second cell text</p></div></div><p>After</p>');
  const firstCell = editor.view.dom.querySelector('[data-wiki-node="media-cell"]');

  editor.commands.setTextSelection(editor.state.doc.content.size);
  const initialSelection = editor.state.selection.from;

  assert.equal(focusMediaCell(editor, firstCell), false);
  assert.equal(editor.state.selection.from, initialSelection);
  editor.destroy();
});

await test("media cell chrome clicks can select an outer cell that only contains nested media rows", function () {
  const editor = createEditor('<div class="wiki-media-row"><div class="wiki-media-cell"><div class="wiki-media-row"><div class="wiki-media-cell"><p>Nested A</p></div><div class="wiki-media-cell"><p>Nested B</p></div></div></div><div class="wiki-media-cell"><p>Sibling</p></div></div><p>After</p>');
  const outerCell = editor.view.dom.querySelector('[data-wiki-node="media-cell"]');

  editor.commands.setTextSelection(editor.state.doc.content.size);

  assert.equal(focusMediaCell(editor, outerCell), true);
  assert.equal(editor.state.selection.node && editor.state.selection.node.type.name, "mediaCell");
  assert.equal(editor.state.selection.from, findNodePositions(editor, "mediaCell")[0]);
  editor.destroy();
});

await test("click-selecting nested media cells does not request editor scroll", async function () {
  const editor = createEditor('<div class="wiki-media-row"><div class="wiki-media-cell"><div class="wiki-media-row"><div class="wiki-media-cell"><p>Nested A</p></div><div class="wiki-media-cell"><p>Nested B</p></div></div></div><div class="wiki-media-cell"><p>Sibling</p></div></div><p>After</p>');
  const outerCell = editor.view.dom.querySelector('[data-wiki-node="media-cell"]');

  editor.commands.setTextSelection(editor.state.doc.content.size);
  const cleanupFocus = moveFocusOutsideEditor();
  const getScrollRequests = countEditorScrollRequests(editor);

  assert.equal(focusMediaCell(editor, outerCell), true);
  await nextAnimationFrame();

  assert.equal(editor.state.selection.node && editor.state.selection.node.type.name, "mediaCell");
  assert.equal(getScrollRequests(), 0);
  cleanupFocus();
  editor.destroy();
});

await test("direct nested media row chrome is treated as the containing media cell surface", function () {
  const editor = createEditor('<div class="wiki-media-row"><div class="wiki-media-cell"><div class="wiki-media-row"><div class="wiki-media-cell"><p>Nested A</p></div><div class="wiki-media-cell"><p>Nested B</p></div></div></div><div class="wiki-media-cell"><p>Sibling</p></div></div><p>After</p>');
  const outerCell = editor.view.dom.querySelector('[data-wiki-node="media-cell"]');
  const nestedRow = outerCell.querySelector('[data-wiki-node="media-row"]');
  const nestedCell = nestedRow.querySelector('[data-wiki-node="media-cell"]');

  assert.equal(isMediaCellSurfaceTarget(outerCell, nestedRow), true);
  assert.equal(isMediaCellSurfaceTarget(outerCell, nestedCell), false);
  editor.destroy();
});

await test("empty media cell chrome clicks still provide a caret fallback", function () {
  const editor = createEditor('<div class="wiki-media-row"><div class="wiki-media-cell"><p></p></div><div class="wiki-media-cell"><p>Second cell text</p></div></div><p>After</p>');
  const firstCell = editor.view.dom.querySelector('[data-wiki-node="media-cell"]');

  editor.commands.setTextSelection(editor.state.doc.content.size);

  assert.equal(focusMediaCell(editor, firstCell), true);
  assert(editor.state.selection.from < editor.state.doc.content.size);
  editor.destroy();
});

await test("wiki link mark stores regular links as inert spans in the editor contract", function () {
  const editor = createEditor('<p>A <a target="_blank" rel="noopener noreferrer" href="https://google.com">regular link</a>.</p>');
  const rendered = editor.getHTML();

  assert.match(rendered, /<span class="wiki-editor-link wiki-external-link" data-wiki-link-href="https:\/\/google\.com"/);
  assert.match(rendered, /data-wiki-link-target="_blank"/);
  assert.match(rendered, /data-wiki-link-rel="noopener noreferrer"/);
  assert.doesNotMatch(rendered, /<a\b[^>]*href="https:\/\/google\.com"/);
  editor.commands.setTextSelection(5);
  assert.equal(editor.getAttributes("link").href, "https://google.com");

  editor.destroy();
});

await test("wiki link mark does not consume separators typed after existing links", function () {
  const firstUrl = "https://one.example";
  const secondUrl = "https://two.example";
  const editor = createEditor(`<p><a href="${firstUrl}">${firstUrl}</a><a href="${secondUrl}">${secondUrl}</a></p>`);
  const firstRange = findTextRange(editor, firstUrl);

  assert.ok(firstRange, "expected to find the first link text");
  editor.commands.setTextSelection(firstRange.to);
  editor.commands.insertContent(" ");

  const rendered = editor.getHTML();
  assert.match(rendered, /data-wiki-link-href="https:\/\/one\.example"[^>]*>https:\/\/one\.example<\/span> /);
  assert.match(rendered, /data-wiki-link-href="https:\/\/two\.example"[^>]*>https:\/\/two\.example<\/span>/);
  assert.doesNotMatch(rendered, /data-wiki-link-href="https:\/\/one\.example"[^>]*>https:\/\/one\.example /);

  const reopened = createEditor(sanitizeHtml(rendered));
  const reopenedHtml = reopened.getHTML();
  assert.equal((reopenedHtml.match(/data-wiki-link-href=/g) || []).length, 2);
  assert.match(reopenedHtml, /data-wiki-link-href="https:\/\/one\.example"[^>]*>https:\/\/one\.example<\/span> /);
  assert.match(reopenedHtml, /data-wiki-link-href="https:\/\/two\.example"[^>]*>https:\/\/two\.example<\/span>/);

  editor.destroy();
  reopened.destroy();
});

await test("external link dialog state uses selected text as the default link text", async function () {
  const { getExternalLinkDialogState, applyExternalLinkEdit } = await importEditorBundleForContract();
  const editor = createEditor("<p>Turn this into a link.</p>");
  const selectedRange = findTextRange(editor, "Turn this");

  assert.ok(selectedRange, "expected selected text range");
  editor.commands.setTextSelection(selectedRange);

  assert.deepEqual(getExternalLinkDialogState(editor), {
    href: "",
    text: "Turn this"
  });

  assert.equal(applyExternalLinkEdit(editor, {
    href: "https://example.com/page",
    text: "Example page"
  }), true);

  const rendered = editor.getHTML();
  assert.match(rendered, /data-wiki-link-href="https:\/\/example\.com\/page"[^>]*>Example page<\/span>/);
  assert.doesNotMatch(rendered, /Turn this/);

  editor.destroy();
});

await test("external link dialog state and save can replace existing link text", async function () {
  const { getExternalLinkDialogState, applyExternalLinkEdit } = await importEditorBundleForContract();
  const editor = createEditor('<p><a href="https://old.example">Old link text</a> remains.</p>');
  const oldLinkRange = findTextRange(editor, "Old link text");

  assert.ok(oldLinkRange, "expected old link text range");
  editor.commands.setTextSelection(oldLinkRange.from + 2);

  assert.deepEqual(getExternalLinkDialogState(editor), {
    href: "https://old.example",
    text: "Old link text"
  });

  assert.equal(applyExternalLinkEdit(editor, {
    href: "https://new.example",
    text: "New link text"
  }), true);

  const rendered = editor.getHTML();
  assert.match(rendered, /data-wiki-link-href="https:\/\/new\.example"[^>]*>New link text<\/span>/);
  assert.doesNotMatch(rendered, /Old link text/);

  editor.destroy();
});

await test("external link creation uses the shared dialog instead of URL prompts", function () {
  assert.doesNotMatch(editorBundleSource, /window\.prompt\("Link URL"/);
  assert.doesNotMatch(vendoredEditorBundleSource, /window\.prompt\("Link URL"/);
  assert.match(editorBundleSource, /function openExternalLinkDialog/);
});

await test("wiki entity marks and nodes round-trip as inert editor spans", function () {
  const editor = createEditor('<p>See <span class="wiki-entity wiki-entity--page" data-wiki-entity="page" data-wiki-target="Guides/Map Creation Guide" data-wiki-label="Map guide">Map guide</span>, <span class="wiki-entity wiki-entity--namespace" data-wiki-entity="namespace" data-wiki-target="Guides">Guides</span>, <span class="wiki-entity wiki-entity--user" data-wiki-entity="user" data-wiki-username="xtul" data-wiki-userslug="xtul">@xtul</span>, and <span class="wiki-entity wiki-entity--footnote" data-wiki-entity="footnote" data-wiki-footnote="Important note">[note]</span>.</p>');
  const rendered = editor.getHTML();

  assert.match(rendered, /data-wiki-entity="page"/);
  assert.match(rendered, /data-wiki-target="Guides\/Map Creation Guide"/);
  assert.match(rendered, /data-wiki-entity="namespace"/);
  assert.match(rendered, /data-wiki-entity="user"/);
  assert.match(rendered, /data-wiki-entity="footnote"/);
  assert.match(rendered, /data-wiki-footnote-b64="/);
  assert.doesNotMatch(rendered, /data-wiki-footnote="Important note"/);
  assert.doesNotMatch(rendered, /<a\b/);

  editor.destroy();
});

await test("wiki entity insert commands create page, namespace, user, and footnote entities", function () {
  const editor = createEditor("<p>Start</p>");

  editor.commands.insertWikiPageLink({ target: "Guides/Map Creation Guide#Advanced Setup", label: "Map guide" });
  editor.commands.insertContent(" ");
  editor.commands.insertWikiNamespaceLink({ target: "Guides", label: "Guides" });
  editor.commands.insertContent(" ");
  editor.commands.insertWikiUserMention({ username: "xtul", userslug: "xtul", uid: "1" });
  editor.commands.insertContent(" ");
  editor.commands.insertWikiFootnote({ body: "Important note" });

  const rendered = editor.getHTML();
  assert.match(rendered, /data-wiki-entity="page"[^>]*>Map guide<\/span>/);
  assert.match(rendered, /data-wiki-target="Guides\/Map Creation Guide#Advanced Setup"/);
  assert.match(rendered, /data-wiki-entity="namespace"[^>]*>Guides<\/span>/);
  assert.match(rendered, /data-wiki-entity="user"[^>]*>@xtul<\/span>/);
  assert.match(rendered, /wiki-entity--user-good/);
  assert.match(rendered, /spellcheck="false"/);
  assert.match(rendered, /data-wiki-entity="footnote"[^>]*data-wiki-footnote-b64="[^"]+"[^>]*>\[note\]<\/span>/);

  editor.destroy();
});

await test("page link dialog can discover and insert namespace autocomplete results", function () {
  assert.doesNotMatch(
    editorBundleSource,
    /params\.set\("scope",\s*type === "namespace" \? "all-wiki" : "current-namespace"\)/
  );
  assert.doesNotMatch(
    editorBundleSource,
    /params\.set\("type",\s*type === "namespace" \? "namespace" : "page"\)/
  );
  assert.match(
    editorBundleSource,
    /if \(type === "page"\) \{[\s\S]*selected && selected\.type === "namespace"[\s\S]*insertWikiNamespaceLink/
  );
  assert.match(
    vendoredEditorBundleSource,
    /==="page"[\s\S]*\.type==="namespace"[\s\S]*insertWikiNamespaceLink/
  );
});

await test("page link dialog fetches selected article sections and appends the chosen fragment", function () {
  assert.match(
    editorBundleSource,
    /pageTocUrl[\s\S]*page-toc/
  );
  assert.match(
    editorBundleSource,
    /fetchPageSectionsForResult[\s\S]*selected\.tid[\s\S]*URLSearchParams\(\{ tid: String\(selected\.tid\) \}\)/
  );
  assert.match(
    editorBundleSource,
    /appendWikiSectionFragment\(target, selectedSection\)/
  );
  assert.match(
    vendoredEditorBundleSource,
    /pageTocUrl[\s\S]*page-toc/
  );
});

await test("typed wiki user mentions render as unresolved until autocomplete confirms them", function () {
  const editor = createEditor("<p>Start</p>");

  editor.commands.insertWikiUserMention({ username: "missing", resolved: false });

  const rendered = editor.getHTML();
  assert.match(rendered, /data-wiki-entity="user"[^>]*>@missing<\/span>/);
  assert.match(rendered, /data-wiki-resolved="0"/);
  assert.match(rendered, /wiki-entity--user-bad/);

  editor.destroy();
});

await test("editor link navigation guard cancels link clicks before page handlers run", function () {
  const editorMount = document.createElement("div");
  const link = document.createElement("a");
  const linkText = document.createTextNode("Westgate");
  let selectedLink = null;
  let toolbarLink = null;
  let bubbled = false;
  function recordBubble() {
    bubbled = true;
  }

  link.href = "https://example.test/wiki/westgate";
  link.appendChild(linkText);
  editorMount.appendChild(link);
  document.body.appendChild(editorMount);
  document.body.addEventListener("click", recordBubble);

  const destroyGuard = installEditorLinkNavigationGuard({
    editorMount,
    editor: {
      view: {
        posAtDOM: function (target) {
          assert.equal(target, linkText);
          return 7;
        }
      },
      chain: function () {
        return {
          focus: function () {
            return this;
          },
          setTextSelection: function (pos) {
            assert.equal(pos, 7);
            selectedLink = link;
            return this;
          },
          extendMarkRange: function (markName) {
            assert.equal(markName, "link");
            return this;
          },
          run: function () {
            return true;
          }
        };
      }
    },
    getLinkContextToolbar: function () {
      return {
        showForLink: function (activeLink) {
          toolbarLink = activeLink;
        }
      };
    }
  });

  const event = new window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0
  });
  const notCanceled = link.dispatchEvent(event);

  assert.equal(notCanceled, false);
  assert.equal(event.defaultPrevented, true);
  assert.equal(bubbled, false);
  assert.equal(selectedLink, link);
  assert.equal(toolbarLink, link);

  destroyGuard();
  document.body.removeEventListener("click", recordBubble);
  editorMount.remove();
});

await test("editor link navigation guard opens link tools for inert editor link spans", function () {
  const editorMount = document.createElement("div");
  const link = document.createElement("span");
  const linkText = document.createTextNode("essential");
  let selectedLink = null;
  let toolbarLink = null;

  link.className = "wiki-editor-link";
  link.setAttribute("data-wiki-link-href", "https://google.com");
  link.appendChild(linkText);
  editorMount.appendChild(link);
  document.body.appendChild(editorMount);

  const destroyGuard = installEditorLinkNavigationGuard({
    editorMount,
    editor: {
      view: {
        posAtDOM: function (target) {
          assert.equal(target, linkText);
          return 4;
        }
      },
      chain: function () {
        return {
          focus: function () {
            return this;
          },
          setTextSelection: function (pos) {
            assert.equal(pos, 4);
            selectedLink = link;
            return this;
          },
          extendMarkRange: function (markName) {
            assert.equal(markName, "link");
            return this;
          },
          run: function () {
            return true;
          }
        };
      }
    },
    getLinkContextToolbar: function () {
      return {
        showForLink: function (activeLink) {
          toolbarLink = activeLink;
        }
      };
    }
  });

  const event = new window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0
  });
  const notCanceled = link.dispatchEvent(event);

  assert.equal(notCanceled, false);
  assert.equal(event.defaultPrevented, true);
  assert.equal(selectedLink, link);
  assert.equal(toolbarLink, link);

  destroyGuard();
  editorMount.remove();
});

await test("editor link navigation guard opens link tools when clicking inert link text nodes", function () {
  const editorMount = document.createElement("div");
  const link = document.createElement("span");
  const linkText = document.createTextNode("https://github.com/gitextensions/gitextensions/releases/latest");
  let selectedLink = null;
  let toolbarLink = null;

  link.className = "wiki-editor-link";
  link.setAttribute("data-wiki-link-href", "https://github.com/gitextensions/gitextensions/releases/latest");
  link.setAttribute("data-wiki-link-target", "_blank");
  link.setAttribute("data-wiki-link-rel", "noopener noreferrer nofollow");
  link.appendChild(linkText);
  editorMount.appendChild(link);
  document.body.appendChild(editorMount);

  const destroyGuard = installEditorLinkNavigationGuard({
    editorMount,
    editor: {
      view: {
        posAtDOM: function (target) {
          assert.equal(target, linkText);
          return 12;
        }
      },
      chain: function () {
        return {
          focus: function () {
            return this;
          },
          setTextSelection: function (pos) {
            assert.equal(pos, 12);
            selectedLink = link;
            return this;
          },
          extendMarkRange: function (markName) {
            assert.equal(markName, "link");
            return this;
          },
          run: function () {
            return true;
          }
        };
      }
    },
    getLinkContextToolbar: function () {
      return {
        showForLink: function (activeLink) {
          toolbarLink = activeLink;
        }
      };
    }
  });

  const event = new window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0
  });
  const notCanceled = linkText.dispatchEvent(event);

  assert.equal(notCanceled, false);
  assert.equal(event.defaultPrevented, true);
  assert.equal(selectedLink, link);
  assert.equal(toolbarLink, link);

  destroyGuard();
  editorMount.remove();
});

await test("editor link navigation guard opens link tools on mousedown before text selection changes", function () {
  const editorMount = document.createElement("div");
  const link = document.createElement("span");
  const linkText = document.createTextNode("https://git-scm.com/download/win");
  let selectedLink = null;
  let toolbarLink = null;

  link.className = "wiki-editor-link";
  link.setAttribute("data-wiki-link-href", "https://git-scm.com/download/win");
  link.appendChild(linkText);
  editorMount.appendChild(link);
  document.body.appendChild(editorMount);

  const destroyGuard = installEditorLinkNavigationGuard({
    editorMount,
    editor: {
      view: {
        posAtDOM: function (target) {
          assert.equal(target, linkText);
          return 16;
        }
      },
      chain: function () {
        return {
          focus: function () {
            return this;
          },
          setTextSelection: function (pos) {
            assert.equal(pos, 16);
            selectedLink = link;
            return this;
          },
          extendMarkRange: function (markName) {
            assert.equal(markName, "link");
            return this;
          },
          run: function () {
            return true;
          }
        };
      }
    },
    getLinkContextToolbar: function () {
      return {
        showForLink: function (activeLink) {
          toolbarLink = activeLink;
        }
      };
    }
  });

  const event = new window.MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0
  });
  const notCanceled = linkText.dispatchEvent(event);

  assert.equal(notCanceled, false);
  assert.equal(event.defaultPrevented, true);
  assert.equal(selectedLink, link);
  assert.equal(toolbarLink, link);

  destroyGuard();
  editorMount.remove();
});

await test("selectEditorLink activates the link mark for long inert URL spans", function () {
  const editor = createEditor('<p><span class="wiki-editor-link" data-wiki-link-href="https://github.com/gitextensions/gitextensions/releases/latest" data-wiki-link-target="_blank" data-wiki-link-rel="noopener noreferrer nofollow">https://github.com/gitextensions/gitextensions/releases/latest</span></p>');
  const link = editor.view.dom.querySelector("[data-wiki-link-href]");

  assert.ok(link, "expected rendered inert link span");
  assert.equal(selectEditorLink(editor, link), true);
  assert.equal(editor.isActive("link"), true);
  assert.equal(editor.getAttributes("link").href, "https://github.com/gitextensions/gitextensions/releases/latest");

  editor.destroy();
});

await test("editor link navigation guard cancels links before document capture navigation handlers", function () {
  const editorMount = document.createElement("div");
  const link = document.createElement("a");
  const linkText = document.createTextNode("essential");
  let documentCaptureSawNavigation = false;

  link.href = "https://google.com/";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.appendChild(linkText);
  editorMount.appendChild(link);
  document.body.appendChild(editorMount);

  function recordDocumentCapture(event) {
    if (!event.defaultPrevented) {
      documentCaptureSawNavigation = true;
    }
  }

  document.addEventListener("click", recordDocumentCapture, true);

  const destroyGuard = installEditorLinkNavigationGuard({
    editorMount,
    editor: {
      view: {
        posAtDOM: function () {
          return 3;
        }
      },
      chain: function () {
        return {
          focus: function () {
            return this;
          },
          setTextSelection: function () {
            return this;
          },
          extendMarkRange: function () {
            return this;
          },
          run: function () {
            return true;
          }
        };
      }
    },
    getLinkContextToolbar: function () {
      return null;
    }
  });

  const event = new window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0
  });
  link.dispatchEvent(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(documentCaptureSawNavigation, false);

  destroyGuard();
  document.removeEventListener("click", recordDocumentCapture, true);
  editorMount.remove();
});

await test("wikiCallout parses and renders safe callout HTML", function () {
  const editor = createEditor('<aside class="wiki-callout wiki-callout--warning" data-callout-type="warning" data-callout-title="Compatibility"><p><strong>Compatibility</strong></p><p>Test custom CSS.</p></aside>');
  const rendered = editor.getHTML();

  assert.match(rendered, /<aside class="wiki-callout wiki-callout--warning" data-callout-type="warning" data-callout-title="Compatibility">/);
  assert.match(rendered, /<p><strong>Compatibility<\/strong><\/p>/);
  assert.match(rendered, /<p>Test custom CSS\.<\/p>/);
  editor.destroy();
});

await test("wikiCallout unwraps nested callouts when loading saved HTML", function () {
  const editor = createEditor('<aside class="wiki-callout wiki-callout--warning" data-callout-type="warning"><p>Outer before.</p><aside class="wiki-callout wiki-callout--info" data-callout-type="info"><p>Nested content.</p></aside><p>Outer after.</p></aside>');
  const rendered = editor.getHTML();

  assert.equal((rendered.match(/class="wiki-callout/g) || []).length, 1);
  assert.match(rendered, /<p>Outer before\.<\/p>/);
  assert.match(rendered, /<p>Nested content\.<\/p>/);
  assert.match(rendered, /<p>Outer after\.<\/p>/);
  assert.doesNotMatch(rendered, /wiki-callout--info/);
  editor.destroy();
});

await test("wikiCallout unwraps callouts inserted inside an existing callout", function () {
  const editor = createEditor('<aside class="wiki-callout wiki-callout--warning" data-callout-type="warning"><p>Outer text.</p></aside>');

  editor.commands.setTextSelection(7);
  editor.commands.insertContent('<aside class="wiki-callout wiki-callout--info" data-callout-type="info"><p>Pasted callout.</p></aside>');
  const rendered = editor.getHTML();

  assert.equal((rendered.match(/class="wiki-callout/g) || []).length, 1);
  assert.match(rendered, /<p>Pasted callout\.<\/p>/);
  assert.doesNotMatch(rendered, /wiki-callout--info/);
  editor.destroy();
});

await test("wikiCallout insert command creates a warning callout", function () {
  const editor = createEditor("<p>Start</p>");

  editor.commands.insertWikiCallout({ type: "warning", title: "Compatibility" });
  const rendered = editor.getHTML();

  assert.match(rendered, /data-callout-type="warning"/);
  assert.match(rendered, /<strong>Compatibility<\/strong>/);
  editor.destroy();
});

await test("wikiCallout unset command unwraps the selected callout content", function () {
  const editor = createEditor('<aside class="wiki-callout wiki-callout--warning" data-callout-type="warning" data-callout-title="Compatibility"><p><strong>Compatibility</strong></p><p>Test custom CSS.</p></aside>');

  editor.commands.setTextSelection(18);
  assert.equal(editor.commands.unsetWikiCallout(), true);
  const rendered = editor.getHTML();

  assert.doesNotMatch(rendered, /wiki-callout/);
  assert.match(rendered, /<p><strong>Compatibility<\/strong><\/p>/);
  assert.match(rendered, /<p>Test custom CSS\.<\/p>/);
  editor.destroy();
});

await test("wikiCallout Backspace shortcut unwraps a callout from an empty paragraph", function () {
  const editor = createEditor('<aside class="wiki-callout wiki-callout--warning" data-callout-type="warning" data-callout-title="Compatibility"><p><strong>Compatibility</strong></p><p></p></aside>');

  editor.commands.setTextSelection(17);
  editor.commands.keyboardShortcut("Backspace");
  const rendered = editor.getHTML();

  assert.doesNotMatch(rendered, /wiki-callout/);
  assert.match(rendered, /<p><strong>Compatibility<\/strong><\/p>/);
  editor.destroy();
});

await test("wikiCallout css uses themed icon callout bars in articles and editor", function () {
  const pluginJson = JSON.parse(pluginJsonSource);
  assert.equal(pluginJson.staticDirs["game-icons"], "public/game-icons");
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout\s*\{[\s\S]*--wiki-callout-icon:\s*url\("\/assets\/plugins\/nodebb-plugin-westgate-wiki\/game-icons\/scroll-unfurled\.svg"\)/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout\s*\{[\s\S]*display:\s*block/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout\s*\{[\s\S]*min-height:\s*calc\(3\.5rem\s*\+\s*1\.9rem\)/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout\s*\{[\s\S]*border-left:\s*0\.85rem\s+solid\s+var\(--wiki-callout-rail\)/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout\s*\{[\s\S]*background:\s*var\(--wiki-callout-bg\)/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout\s*\{[\s\S]*padding:\s*0\.95rem\s+1\.1rem/);
  assert.doesNotMatch(articleBodyCss, /\.wiki-article-prose \.wiki-callout\s*\{[\s\S]*background:\s*linear-gradient/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout::before\s*\{[\s\S]*float:\s*left/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout::before\s*\{[\s\S]*margin:\s*0\s+1rem\s+0\.45rem\s+0/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout::before\s*\{[\s\S]*width:\s*[0-9.]+rem/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout::before\s*\{[\s\S]*height:\s*[0-9.]+rem/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout::after\s*\{[\s\S]*mask:\s*var\(--wiki-callout-icon\)\s+center\s*\/\s*1\.75rem\s+1\.75rem\s+no-repeat/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout--success\s*\{[\s\S]*candle-flame\.svg/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout--warning\s*\{[\s\S]*stabbed-note\.svg/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout--danger\s*\{[\s\S]*duality-mask\.svg/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout > p\s*\{[\s\S]*display:\s*block/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout > p:empty::before\s*\{[\s\S]*content:\s*"\\00a0"/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout > :where\(ul, ol\)\s*\{[^}]*clear:\s*left/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout > :where\(ul, ol\)\s*\{[^}]*margin:\s*0\.35rem\s+0\s+0\.35rem\s+1\.1rem/);
  assert.doesNotMatch(articleBodyCss, /\.wiki-article-prose \.wiki-callout > :where\(ul, ol\):first-child\s*\{/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout :where\(li, li > p\)\s*\{[\s\S]*color:\s*inherit/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout > :where\(ul, ol\) > li::marker\s*\{[\s\S]*color:\s*currentColor/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-callout li > p\s*\{[\s\S]*display:\s*inline/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-callout\s*\{[\s\S]*--wiki-callout-icon:\s*url\("\/assets\/plugins\/nodebb-plugin-westgate-wiki\/game-icons\/scroll-unfurled\.svg"\)/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-callout\s*\{[\s\S]*min-height:\s*calc\(3\.5rem\s*\+\s*1\.9rem\)/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-callout::before\s*\{[\s\S]*float:\s*left/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-callout > p\s*\{[\s\S]*display:\s*block/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-callout > p:empty::before\s*\{[\s\S]*content:\s*"\\00a0"/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-callout > :where\(ul, ol\)\s*\{[^}]*clear:\s*left/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-callout > :where\(ul, ol\)\s*\{[^}]*margin:\s*0\.35rem\s+0\s+0\.35rem\s+1\.1rem/);
  assert.doesNotMatch(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-callout > :where\(ul, ol\):first-child\s*\{/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-callout :where\(li, li > p\)\s*\{[\s\S]*color:\s*inherit/);
  assert.match(editorCss, /\.westgate-wiki-compose \.wiki-editor__content \.wiki-callout--success\s*\{[\s\S]*candle-flame\.svg/);
});

await test("wikiInfobox parses and renders saved infobox helper structure", function () {
  const savedHtml = [
    '<aside class="wiki-infobox" data-wiki-node="infobox">',
    '<div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene Voss</div>',
    '<div class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle">Vampire Noble</div>',
    '<figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img src="/uploads/selene.png" alt="Selene"></figure>',
    '<div class="wiki-infobox__section" data-wiki-infobox-part="section">Details</div>',
    '<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">',
    '<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div>',
    '</dl>',
    '<div class="wiki-infobox__content" data-wiki-infobox-part="content"><p>Optional notes.</p></div>',
    '</aside>'
  ].join("");
  const editor = createEditor(savedHtml);
  const types = collectJsonNodeTypes(editor.getJSON(), new Set());
  const rendered = editor.getHTML();

  [
    "wikiInfobox",
    "wikiInfoboxTitle",
    "wikiInfoboxSubtitle",
    "wikiInfoboxImage",
    "wikiInfoboxSection",
    "wikiInfoboxRows",
    "wikiInfoboxRow",
    "wikiInfoboxTerm",
    "wikiInfoboxValue",
    "wikiInfoboxContent"
  ].forEach(function (typeName) {
    assert.ok(types.has(typeName), `${typeName} should be present in editor JSON`);
  });
  assert.match(rendered, /<aside class="wiki-infobox" data-wiki-node="infobox">/);
  assert.match(rendered, /class="wiki-infobox__title" data-wiki-infobox-part="title"/);
  assert.match(rendered, /class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle"/);
  assert.match(rendered, /<figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img[^>]+src="\/uploads\/selene\.png"[^>]*><\/figure>/);
  assert.match(rendered, /class="wiki-infobox__section" data-wiki-infobox-part="section"/);
  assert.match(rendered, /class="wiki-infobox__rows" data-wiki-infobox-part="rows"/);
  assert.match(rendered, /class="wiki-infobox__row" data-wiki-infobox-part="row"/);
  assert.match(rendered, /class="wiki-infobox__content" data-wiki-infobox-part="content"/);
  assert.match(rendered, /<dt>House<\/dt><dd>Voss<\/dd>/);
  editor.destroy();
});

await test("normalized saved infoboxes round trip through the Tiptap editor", function () {
  const savedHtml = [
    '<aside class="wiki-infobox" data-wiki-node="infobox">',
    '<div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene Voss</div>',
    '<figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img src="/uploads/selene.png" alt="Selene"></figure>',
    '<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">',
    '<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div>',
    '</dl>',
    '</aside>'
  ].join("");
  const editor = createEditor(normalizeLegacyHtmlForTiptap(savedHtml));
  const rendered = editor.getHTML();

  assert.match(rendered, /<aside class="wiki-infobox" data-wiki-node="infobox">/);
  assert.match(rendered, /class="wiki-infobox__title" data-wiki-infobox-part="title"/);
  assert.match(rendered, /<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">/);
  assert.match(rendered, /<dt>House<\/dt><dd>Voss<\/dd>/);
  assert.match(rendered, /<figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img[^>]+src="\/uploads\/selene\.png"[^>]*><\/figure>/);
  editor.destroy();
});

await test("orphan infobox helper markup does not parse as a top-level helper node", function () {
  const editor = createEditor('<div class="wiki-infobox__title" data-wiki-infobox-part="title">Orphan Title</div><p>Article text.</p>');
  const json = editor.getJSON();
  const rendered = editor.getHTML();

  assert.equal(findJsonNode(json, "wikiInfoboxTitle"), null);
  assert.doesNotMatch(rendered, /data-wiki-infobox-part="title"/);
  assert.doesNotMatch(rendered, /wiki-infobox__title/);
  assert.match(rendered, /Orphan Title/);
  assert.match(rendered, /Article text\./);
  editor.destroy();
});

await test("direct infobox prose is preserved through content helpers", function () {
  const editor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><p>Direct prose.</p></aside>');
  const rendered = editor.getHTML();

  assert.equal(findJsonNode(editor.getJSON(), "wikiInfoboxContent").content[0].type, "paragraph");
  assert.doesNotMatch(rendered, /<aside class="wiki-infobox" data-wiki-node="infobox"><p>Direct prose\.<\/p>/);
  assert.match(rendered, /<div class="wiki-infobox__content" data-wiki-infobox-part="content"><p>Direct prose\.<\/p><\/div>/);
  editor.destroy();
});

await test("malformed raw infobox rows parse as repaired row helpers", function () {
  const editor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><dt>Loose</dt><dd>Value</dd></dl></aside>');
  const prettyPrintedEditor = createEditor([
    '<aside class="wiki-infobox" data-wiki-node="infobox">',
    '<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">',
    '  <dt>House</dt>',
    '  <dd>Voss</dd>',
    '</dl>',
    '</aside>'
  ].join("\n"));
  const rendered = editor.getHTML();
  const prettyPrintedRendered = prettyPrintedEditor.getHTML();

  assert.match(rendered, /<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>Loose<\/dt><dd>Value<\/dd><\/div><\/dl>/);
  assert.doesNotMatch(rendered, /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt><\/dt><dd><\/dd><\/div>/);
  assert.doesNotMatch(rendered, /class="wiki-infobox__title" data-wiki-infobox-part="title">Loose<\/div>/);
  assert.doesNotMatch(rendered, /class="wiki-infobox__title" data-wiki-infobox-part="title">Value<\/div>/);
  assert.match(prettyPrintedRendered, /<dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House<\/dt><dd>Voss<\/dd><\/div><\/dl>/);
  assert.equal((prettyPrintedRendered.match(/class="wiki-infobox__row"/g) || []).length, 1);
  editor.destroy();
  prettyPrintedEditor.destroy();
});

await test("malformed raw infobox rows preserve visible content instead of empty rows", function () {
  const valueOnlyEditor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><dd>Value</dd></dl></aside>');
  const emptyRowsEditor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"></dl></aside>');
  const proseRowEditor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><p>Text</p></div></dl></aside>');
  const extraContentEditor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd><p>Lost note</p></div></dl></aside>');
  const directTextEditor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows">Loose text<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div></dl></aside>');
  const termOnlyExtraEditor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><p>Lost note</p></div></dl></aside>');
  const valueOnlyExtraEditor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dd>Value</dd><p>Lost note</p></div></dl></aside>');

  assert.match(valueOnlyEditor.getHTML(), /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt><\/dt><dd>Value<\/dd><\/div>/);
  assert.doesNotMatch(emptyRowsEditor.getHTML(), /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt><\/dt><dd><\/dd><\/div>/);
  assert.match(proseRowEditor.getHTML(), /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>Text<\/dt><dd><\/dd><\/div>/);
  assert.match(extraContentEditor.getHTML(), /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House<\/dt><dd>Voss Lost note<\/dd><\/div>/);
  assert.match(directTextEditor.getHTML(), /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>Loose text<\/dt><dd><\/dd><\/div><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House<\/dt><dd>Voss<\/dd><\/div>/);
  assert.match(termOnlyExtraEditor.getHTML(), /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House<\/dt><dd>Lost note<\/dd><\/div>/);
  assert.match(valueOnlyExtraEditor.getHTML(), /<div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt><\/dt><dd>Value Lost note<\/dd><\/div>/);
  valueOnlyEditor.destroy();
  emptyRowsEditor.destroy();
  proseRowEditor.destroy();
  extraContentEditor.destroy();
  directTextEditor.destroy();
  termOnlyExtraEditor.destroy();
  valueOnlyExtraEditor.destroy();
});

await test("wikiInfobox insert command creates starter infobox HTML", function () {
  const editor = createEditor("<p>Start</p>");

  assert.equal(editor.commands.insertWikiInfobox(), true);
  const rendered = editor.getHTML();

  assert.match(rendered, /data-wiki-node="infobox"/);
  assert.match(rendered, /class="wiki-infobox__title" data-wiki-infobox-part="title">Untitled Infobox<\/div>/);
  assert.match(rendered, /class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>Label<\/dt><dd>Value<\/dd><\/div>/);
  editor.destroy();
});

await test("wikiInfobox helper commands insert supported helper blocks inside the active infobox", function () {
  const editor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene</div></aside>');

  const titleRange = findTextRange(editor, "Selene");
  editor.commands.setTextSelection(titleRange.from);
  assert.equal(editor.commands.addWikiInfoboxSubtitle(), true);
  assert.equal(editor.commands.addWikiInfoboxImage(), true);
  assert.equal(editor.commands.addWikiInfoboxSection(), true);
  assert.equal(editor.commands.addWikiInfoboxRow(), true);
  assert.equal(editor.commands.addWikiInfoboxContent(), true);
  const rendered = editor.getHTML();

  assert.match(rendered, /class="wiki-infobox__subtitle" data-wiki-infobox-part="subtitle"/);
  assert.match(rendered, /class="wiki-infobox__image" data-wiki-infobox-part="image"/);
  assert.doesNotMatch(rendered, /<figure class="wiki-infobox__image" data-wiki-infobox-part="image"><p>/);
  assert.match(rendered, /class="wiki-infobox__section" data-wiki-infobox-part="section"/);
  assert.match(rendered, /class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>Label<\/dt><dd>Value<\/dd><\/div>/);
  assert.match(rendered, /class="wiki-infobox__content" data-wiki-infobox-part="content"/);
  editor.destroy();
});

await test("wikiInfobox command-authored HTML passes unsupported content detection", function () {
  const editor = createEditor("<p>Start</p>");

  assert.equal(editor.commands.insertWikiInfobox(), true);
  editor.commands.setTextSelection(findTextRange(editor, "Untitled Infobox").from);
  assert.equal(editor.commands.addWikiInfoboxSubtitle(), true);
  assert.equal(editor.commands.addWikiInfoboxImage(), true);
  assert.equal(editor.commands.addWikiInfoboxSection(), true);
  assert.equal(editor.commands.addWikiInfoboxRow(), true);
  assert.equal(editor.commands.addWikiInfoboxContent(), true);
  assert.equal(detectUnsupportedContent(editor.getHTML()), "");
  editor.destroy();
});

await test("wikiInfobox commands return false outside an active infobox", function () {
  const editor = createEditor("<p>Outside</p>");

  editor.commands.setTextSelection(3);
  [
    "addWikiInfoboxTitle",
    "addWikiInfoboxSubtitle",
    "addWikiInfoboxImage",
    "addWikiInfoboxSection",
    "addWikiInfoboxRow",
    "addWikiInfoboxContent",
    "unwrapWikiInfobox",
    "deleteWikiInfobox"
  ].forEach(function (commandName) {
    assert.equal(editor.commands[commandName](), false, `${commandName} should return false outside an infobox`);
  });
  assert.equal(editor.getHTML(), "<p>Outside</p>");
  editor.destroy();
});

await test("wikiInfobox insert command returns false when helper schema nodes are not registered", function () {
  const editor = createPartialInfoboxEditor("<p>Start</p>");

  assert.equal(editor.commands.insertWikiInfobox(), false);
  assert.equal(editor.getHTML(), "<p>Start</p>");
  editor.destroy();
});

await test("wikiInfobox unwrap and delete commands only affect the active infobox", function () {
  const unwrapEditor = createEditor('<p>Before</p><aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene</div><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div></dl></aside><p>After</p>');

  unwrapEditor.commands.setTextSelection(findTextRange(unwrapEditor, "Selene").from);
  assert.equal(unwrapEditor.commands.unwrapWikiInfobox(), true);
  const unwrapped = unwrapEditor.getHTML();
  assert.doesNotMatch(unwrapped, /<aside class="wiki-infobox"/);
  assert.match(unwrapped, /<p>Before<\/p>/);
  assert.match(unwrapped, /Selene/);
  assert.match(unwrapped, /House/);
  assert.match(unwrapped, /Voss/);
  assert.match(unwrapped, /<p>After<\/p>/);
  unwrapEditor.destroy();

  const deleteEditor = createEditor('<p>Before</p><aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene</div></aside><p>After</p>');
  deleteEditor.commands.setTextSelection(findTextRange(deleteEditor, "Selene").from);
  assert.equal(deleteEditor.commands.deleteWikiInfobox(), true);
  const deleted = deleteEditor.getHTML();
  assert.doesNotMatch(deleted, /<aside class="wiki-infobox"/);
  assert.doesNotMatch(deleted, /Selene/);
  assert.match(deleted, /<p>Before<\/p>/);
  assert.match(deleted, /<p>After<\/p>/);
  deleteEditor.destroy();
});

await test("wikiInfobox unwrap preserves image helper content", function () {
  const editor = createEditor('<p>Before</p><aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene</div><figure class="wiki-infobox__image" data-wiki-infobox-part="image"><img src="/uploads/selene.png" alt="Selene portrait"></figure><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd>Voss</dd></div></dl></aside><p>After</p>');

  editor.commands.setTextSelection(findTextRange(editor, "Selene").from);
  assert.equal(editor.commands.unwrapWikiInfobox(), true);
  const rendered = editor.getHTML();

  assert.doesNotMatch(rendered, /<aside class="wiki-infobox"/);
  assert.match(rendered, /<p>Before<\/p>/);
  assert.match(rendered, /Selene/);
  assert.match(rendered, /House/);
  assert.match(rendered, /Voss/);
  assert.match(rendered, /<img[^>]+src="\/uploads\/selene\.png"[^>]+alt="Selene portrait"[^>]*>/);
  assert.match(rendered, /<p>After<\/p>/);
  editor.destroy();
});

await test("wikiInfobox unwrap preserves inline marks from helper text", function () {
  const editor = createEditor('<p>Before</p><aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title"><strong>Selene</strong></div><dl class="wiki-infobox__rows" data-wiki-infobox-part="rows"><div class="wiki-infobox__row" data-wiki-infobox-part="row"><dt>House</dt><dd><em>Voss</em></dd></div></dl></aside><p>After</p>');

  editor.commands.setTextSelection(findTextRange(editor, "Selene").from);
  assert.equal(editor.commands.unwrapWikiInfobox(), true);
  const rendered = editor.getHTML();

  assert.doesNotMatch(rendered, /<aside class="wiki-infobox"/);
  assert.match(rendered, /<p>Before<\/p>/);
  assert.match(rendered, /<p><strong>Selene<\/strong><\/p>/);
  assert.match(rendered, /<em>Voss<\/em>/);
  assert.match(rendered, /<p>After<\/p>/);
  editor.destroy();
});

await test("wikiInfobox unwrap and delete commands support whole-node selections", function () {
  const unwrapEditor = createEditor('<p>Before</p><aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene</div></aside><p>After</p>');
  const unwrapPos = findNodePositions(unwrapEditor, "wikiInfobox")[0];
  unwrapEditor.view.dispatch(unwrapEditor.state.tr.setSelection(NodeSelection.create(unwrapEditor.state.doc, unwrapPos)));

  assert.equal(unwrapEditor.commands.unwrapWikiInfobox(), true);
  const unwrapped = unwrapEditor.getHTML();
  assert.doesNotMatch(unwrapped, /<aside class="wiki-infobox"/);
  assert.match(unwrapped, /<p>Before<\/p>/);
  assert.match(unwrapped, /Selene/);
  assert.match(unwrapped, /<p>After<\/p>/);
  unwrapEditor.destroy();

  const deleteEditor = createEditor('<p>Before</p><aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Selene</div></aside><p>After</p>');
  const deletePos = findNodePositions(deleteEditor, "wikiInfobox")[0];
  deleteEditor.view.dispatch(deleteEditor.state.tr.setSelection(NodeSelection.create(deleteEditor.state.doc, deletePos)));

  assert.equal(deleteEditor.commands.deleteWikiInfobox(), true);
  const deleted = deleteEditor.getHTML();
  assert.doesNotMatch(deleted, /<aside class="wiki-infobox"/);
  assert.doesNotMatch(deleted, /Selene/);
  assert.match(deleted, /<p>Before<\/p>/);
  assert.match(deleted, /<p>After<\/p>/);
  deleteEditor.destroy();
});

await test("wikiInfobox delete command removes only the active infobox", function () {
  const editor = createEditor('<aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">First</div></aside><p>Between</p><aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__title" data-wiki-infobox-part="title">Second</div></aside>');

  editor.commands.setTextSelection(findTextRange(editor, "Second").from);
  assert.equal(editor.commands.deleteWikiInfobox(), true);
  const rendered = editor.getHTML();

  assert.match(rendered, /First/);
  assert.match(rendered, /<p>Between<\/p>/);
  assert.doesNotMatch(rendered, /Second/);
  assert.equal((rendered.match(/<aside class="wiki-infobox"/g) || []).length, 1);
  editor.destroy();
});

await test("wikiPoetryQuote insert command creates an attributed quote", function () {
  const editor = createEditor("<p>Start</p>");

  editor.commands.insertWikiPoetryQuote({
    quote: "I am nothing. I am the empty room.",
    attribution: "Shar"
  });
  const rendered = editor.getHTML();

  assert.match(rendered, /<figure class="wiki-poetry-quote" data-wiki-node="poetry-quote">/);
  assert.match(rendered, /<blockquote class="wiki-poetry-quote__body">/);
  assert.match(rendered, /<p>I am nothing\. I am the empty room\.<\/p>/);
  assert.match(rendered, /<p class="wiki-poetry-quote__attribution">— Shar<\/p>/);
  editor.destroy();
});

await test("wikiPoetryQuote insert command moves selected text into the quote body", function () {
  const editor = createEditor("<p>Before selected words after.</p>");

  const text = editor.state.doc.textContent;
  const from = text.indexOf("selected");
  const to = from + "selected words".length;
  editor.commands.setTextSelection({ from: from + 1, to: to + 1 });
  editor.commands.insertWikiPoetryQuote({ attribution: "Speaker" });
  const rendered = editor.getHTML();

  assert.match(rendered, /<p>selected words<\/p>/);
  assert.match(rendered, /<p class="wiki-poetry-quote__attribution">— Speaker<\/p>/);
  assert.doesNotMatch(rendered, /Spoken words/);
  editor.destroy();
});

await test("wikiPoetryQuote parses saved quote markup as a plugin-owned node", function () {
  const editor = createEditor('<figure class="wiki-poetry-quote" data-wiki-node="poetry-quote"><blockquote class="wiki-poetry-quote__body"><p>Spoken words.</p><p class="wiki-poetry-quote__attribution">- Author</p></blockquote></figure>');
  const rendered = editor.getHTML();

  assert.equal(editor.getJSON().content[0].type, "wikiPoetryQuote");
  assert.match(rendered, /<figure class="wiki-poetry-quote" data-wiki-node="poetry-quote">/);
  assert.match(rendered, /<p class="wiki-poetry-quote__attribution">- Author<\/p>/);
  editor.destroy();
});

await test("wikiPoetryQuote can toggle its visual container and unwrap its content", function () {
  const editor = createEditor('<figure class="wiki-poetry-quote" data-wiki-node="poetry-quote"><blockquote class="wiki-poetry-quote__body"><p>Spoken words.</p><p class="wiki-poetry-quote__attribution">- Author</p></blockquote></figure>');

  editor.commands.setTextSelection(3);
  assert.equal(editor.commands.toggleWikiPoetryQuoteContainer(), true);
  assert.match(editor.getHTML(), /data-wiki-quote-container="false"/);
  assert.match(editor.getHTML(), /wiki-poetry-quote--plain/);

  assert.equal(editor.commands.unsetWikiPoetryQuote(), true);
  const rendered = editor.getHTML();
  assert.doesNotMatch(rendered, /<figure class="wiki-poetry-quote/);
  assert.doesNotMatch(rendered, /<blockquote class="wiki-poetry-quote__body"/);
  assert.match(rendered, /<p>Spoken words\.<\/p>/);
  assert.match(rendered, /<p class="wiki-poetry-quote__attribution">- Author<\/p>/);
  editor.destroy();
});

await test("wikiPoetryQuote preserves and can retoggle container state after reopening saved html", function () {
  const editor = createEditor('<figure class="wiki-poetry-quote wiki-poetry-quote--plain" data-wiki-node="poetry-quote" data-wiki-quote-container="false"><blockquote class="wiki-poetry-quote__body"><p>Spoken words.</p><p class="wiki-poetry-quote__attribution">- Author</p></blockquote></figure>');

  assert.equal(editor.getJSON().content[0].attrs.container, false);
  assert.match(editor.getHTML(), /data-wiki-quote-container="false"/);

  editor.commands.setTextSelection(3);
  assert.equal(editor.commands.toggleWikiPoetryQuoteContainer(), true);
  const rendered = editor.getHTML();
  assert.doesNotMatch(rendered, /data-wiki-quote-container="false"/);
  assert.doesNotMatch(rendered, /wiki-poetry-quote--plain/);
  assert.match(rendered, /<figure class="wiki-poetry-quote" data-wiki-node="poetry-quote">/);
  editor.destroy();
});

await test("wikiPoetryQuote stores horizontal block position without changing paragraph alignment", function () {
  const editor = createEditor('<figure class="wiki-poetry-quote" data-wiki-node="poetry-quote"><blockquote class="wiki-poetry-quote__body"><p>Spoken words.</p><p class="wiki-poetry-quote__attribution">- Author</p></blockquote></figure>');

  editor.commands.setTextSelection(3);
  assert.equal(editor.commands.setWikiPoetryQuotePosition("right"), true);
  assert.equal(editor.getJSON().content[0].attrs.position, "right");
  assert.match(editor.getHTML(), /data-wiki-quote-position="right"/);
  assert.match(editor.getHTML(), /wiki-poetry-quote--right/);
  assert.doesNotMatch(editor.getHTML(), /text-align:\s*right/);

  assert.equal(editor.commands.setWikiPoetryQuotePosition("left"), true);
  assert.equal(editor.getJSON().content[0].attrs.position, "left");
  assert.doesNotMatch(editor.getHTML(), /data-wiki-quote-position="right"/);
  assert.doesNotMatch(editor.getHTML(), /wiki-poetry-quote--right/);
  editor.destroy();
});

await test("poetry quote css renders a speech-like quote panel with attribution", function () {
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote\s*\{[\s\S]*margin:\s*1rem\s+0/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote\s*\{[\s\S]*width:\s*fit-content/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--center\s*\{[\s\S]*margin-left:\s*auto/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--center\s*\{[\s\S]*margin-right:\s*auto/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--right\s*\{[\s\S]*margin-left:\s*auto/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--right\s*\{[\s\S]*margin-right:\s*0/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote__body\s*\{[\s\S]*background:\s*var\(--wiki-poetry-quote-bg,[\s\S]*#1b101d/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote__body\s*\{[\s\S]*border:\s*1px\s+solid\s+var\(--wiki-poetry-quote-border/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote__body::before\s*\{[\s\S]*content:\s*"\\201C"/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote__body::after\s*\{[\s\S]*content:\s*"\\201D"/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote__attribution\s*\{[\s\S]*text-align:\s*left/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--plain\s*\{[\s\S]*position:\s*relative/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--plain\s*\{[\s\S]*overflow:\s*hidden/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--plain::before\s*\{[\s\S]*content:\s*""/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--plain::before\s*\{[\s\S]*inset:\s*-5%\s+1%/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--plain::before\s*\{[\s\S]*background:\s*#00000059/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--plain::before\s*\{[\s\S]*filter:\s*blur\(60px\)/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--plain \.wiki-poetry-quote__body\s*\{[\s\S]*border:\s*0/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--plain \.wiki-poetry-quote__body\s*\{[\s\S]*background:\s*transparent/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--plain \.wiki-poetry-quote__body\s*\{[\s\S]*box-shadow:\s*none\s*!important/);
  assert.match(articleBodyCss, /\.wiki-article-prose \.wiki-poetry-quote--plain \.wiki-poetry-quote__body\s*\{[\s\S]*z-index:\s*1/);
});

await test("blockquote toolbar action inserts the attributed quote tool instead of toggling default blockquote", function () {
  assert.match(editorBundleSource, /id:\s*"blockquote"[\s\S]*title:\s*"Poetry quote"[\s\S]*insertWikiPoetryQuote/);
  assert.doesNotMatch(editorBundleSource, /id:\s*"blockquote"[\s\S]{0,260}toggleBlockquote/);
});

await test("poetry quote floating toolbar exposes container toggle and unwrap actions", function () {
  assert.match(editorBundleSource, /wiki-editor-poetry-quote-tools/);
  assert.match(editorBundleSource, /poetry-quote-align-left/);
  assert.match(editorBundleSource, /poetry-quote-align-center/);
  assert.match(editorBundleSource, /poetry-quote-align-right/);
  assert.match(editorBundleSource, /setWikiPoetryQuotePosition\("left"\)/);
  assert.match(editorBundleSource, /setWikiPoetryQuotePosition\("center"\)/);
  assert.match(editorBundleSource, /setWikiPoetryQuotePosition\("right"\)/);
  assert.match(editorBundleSource, /toggleWikiPoetryQuoteContainer/);
  assert.match(editorBundleSource, /unsetWikiPoetryQuote/);
  assert.match(editorBundleSource, /figure\.wiki-poetry-quote/);
  assert.match(editorBundleSource, /selectPoetryQuote/);
  assert.match(editorBundleSource, /closest\("p, h1, h2, h3, h4, h5, h6, li"\)/);
});

await test("Backspace after a list removes the trailing empty paragraph instead of creating extra gaps", function () {
  const editor = createEditor("<ul><li><p>Forums</p></li><li><p>Discord Server</p></li></ul><p></p>");

  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  for (let i = 0; i < 5; i += 1) {
    editor.commands.keyboardShortcut("Backspace");
  }
  const rendered = editor.getHTML();

  assert.equal(rendered, "<ul><li><p>Forums</p></li><li><p>Discord Server</p></li></ul><p></p>");
  assert.doesNotMatch(rendered, /<li><p>Discord Server<\/p><p><\/p><\/li>/);
  editor.destroy();
});

await test("slash command extension exposes keyboard-selectable command state", function () {
  const editor = createEditor("<p>/</p>");

  assert.equal(typeof editor.commands.openWikiSlashMenu, "function");
  editor.chain().setTextSelection(2).run();
  editor.commands.insertContent(" ");
  editor.commands.deleteRange({ from: 2, to: 3 });
  assert.equal(editor.storage.slashCommand.isOpen, true);
  assert.equal(editor.storage.slashCommand.activeIndex, 0);

  editor.destroy();
});

await test("slash command arrow navigation scrolls the selected menu item into view", function () {
  const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;
  const scrolledItems = [];
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  window.HTMLElement.prototype.scrollIntoView = function (options) {
    if (this.classList && this.classList.contains("wiki-tiptap-slash-menu__item")) {
      scrolledItems.push({
        id: this.getAttribute("data-slash-command-id"),
        options
      });
    }
  };

  const editor = new Editor({
    element: mount,
    extensions: [
      StarterKit,
      SlashCommand.configure({
        getItems: function () {
          return Array.from({ length: 12 }, function (_value, index) {
            return {
              id: `item-${index}`,
              label: `Item ${index}`,
              run: function () {}
            };
          });
        }
      })
    ],
    content: "<p>/</p>"
  });

  try {
    editor.chain().setTextSelection(2).run();
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));

    assert.equal(editor.storage.slashCommand.activeIndex, 1);
    assert.equal(scrolledItems.at(-1).id, "item-1");
    assert.deepEqual(scrolledItems.at(-1).options, { block: "nearest" });
  } finally {
    editor.destroy();
    mount.remove();
    window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

await test("main toolbar slash items are curated editor commands with aliases", async function () {
  const { createWikiSlashItems } = await importEditorBundleForContract();
  const editor = createEditor("<p>Slash menu</p>");
  const root = document.createElement("div");
  root.__wikiEditorOptions = {};
  const items = createWikiSlashItems({
    root,
    editor,
    uploadImage: function () {}
  });
  const ids = items.map(function (item) { return item.id; });
  const expectedIds = TOP_TOOLBAR_GROUPS
    .filter(function (group) { return !["history", "view"].includes(group.id); })
    .flatMap(function (group) { return group.buttonIds; });

  assert.deepEqual(ids, expectedIds);
  assert.equal(ids.includes("undo"), false);
  assert.equal(ids.includes("redo"), false);
  assert.equal(ids.includes("fullscreen-source"), false);
  assert.deepEqual(items.find(function (item) { return item.id === "dnd-alignment-table"; }).aliases, ["dnd", "alignment", "alignment table", "dungeons dragons"]);
  assert.equal(items.every(function (item) { return item.label && typeof item.run === "function"; }), true);
  editor.destroy();
});

await test("slash command menu filters by shorthand aliases and removes the full slash query", function () {
  let ran = false;
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const editor = new Editor({
    element: mount,
    extensions: [
      StarterKit,
      SlashCommand.configure({
        getItems: function () {
          return [
            {
              id: "paragraph",
              label: "Paragraph",
              run: function () {}
            },
            {
              id: "dnd-alignment-table",
              label: "D&D alignment table",
              aliases: ["dnd", "alignment table"],
              run: function () {
                ran = true;
              }
            }
          ];
        }
      })
    ],
    content: "<p>/dnd</p>"
  });

  editor.chain().setTextSelection(5).run();
  const menu = mount.querySelector(".wiki-tiptap-slash-menu");
  assert.equal(menu.querySelectorAll(".wiki-tiptap-slash-menu__item").length, 1);
  assert.equal(menu.querySelector(".wiki-tiptap-slash-menu__item").getAttribute("data-slash-command-id"), "dnd-alignment-table");

  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  editor.view.dom.dispatchEvent(event);

  assert.equal(ran, true);
  assert.equal(editor.getHTML(), "<p></p>");
  editor.destroy();
  mount.remove();
});

await test("slash command actions receive the active menu button as context", function () {
  let receivedButton = null;
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const editor = new Editor({
    element: mount,
    extensions: [
      StarterKit,
      SlashCommand.configure({
        getItems: function () {
          return [
            {
              id: "probe",
              label: "Probe",
              run: function ({ button }) {
                receivedButton = button;
              }
            }
          ];
        }
      })
    ],
    content: "<p>/</p>"
  });

  editor.chain().setTextSelection(2).run();
  editor.commands.insertContent(" ");
  editor.commands.deleteRange({ from: 2, to: 3 });
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  editor.view.dom.dispatchEvent(event);

  assert.ok(receivedButton, "expected slash command to receive its menu button");
  assert.equal(receivedButton.classList.contains("wiki-tiptap-slash-menu__item"), true);
  editor.destroy();
  mount.remove();
});

await test("wiki code block preserves only supported syntax language classes", function () {
  const editor = createEditor([
    '<pre><code class="language-bash">echo "$HOME"</code></pre>',
    '<pre><code class="language-javascript">console.log("nope")</code></pre>'
  ].join(""));

  const json = editor.getJSON();
  assert.equal(json.content[0].attrs.language, "bash");
  assert.equal(json.content[1].attrs.language, null);

  const rendered = editor.getHTML();
  assert.match(rendered, /<code class="language-bash">echo "\$HOME"<\/code>/);
  assert.doesNotMatch(rendered, /language-javascript/);
  editor.destroy();
});

await test("wiki code block language command updates the active code block", function () {
  const editor = createEditor('<pre><code>Get-ChildItem</code></pre>');

  editor.commands.setTextSelection(3);
  assert.equal(editor.commands.setCodeBlockLanguage("powershell"), true);
  assert.equal(editor.getJSON().content[0].attrs.language, "powershell");
  assert.match(editor.getHTML(), /<code class="language-powershell">Get-ChildItem<\/code>/);

  assert.equal(editor.commands.setCodeBlockLanguage("c#"), true);
  assert.equal(editor.getJSON().content[0].attrs.language, "csharp");
  assert.match(editor.getHTML(), /<code class="language-csharp">Get-ChildItem<\/code>/);

  assert.equal(editor.commands.setCodeBlockLanguage("javascript"), true);
  assert.equal(editor.getJSON().content[0].attrs.language, null);
  assert.doesNotMatch(editor.getHTML(), /language-javascript|language-csharp/);
  editor.destroy();
});

await test("wiki code block language applies editor syntax token decorations", function () {
  const editor = createEditor('<pre><code class="language-csharp">public static void Main() { return 0; }</code></pre>');

  assert.equal(editor.view.dom.querySelectorAll(".wiki-code-token--keyword").length >= 4, true);
  assert.equal(editor.view.dom.querySelectorAll(".wiki-code-token--number").length, 1);
  assert.match(editor.getHTML(), /<code class="language-csharp">public static void Main\(\) \{ return 0; \}<\/code>/);
  assert.doesNotMatch(editor.getHTML(), /wiki-code-token/);
  editor.destroy();
});

await test("wiki code block syntax highlighting avoids selection-only rebuilds", function () {
  const wikiCodeBlockSource = readFileSync(new URL("../tiptap/src/extensions/wiki-code-block.mjs", import.meta.url), "utf8");

  assert.match(wikiCodeBlockSource, /function\s+transactionTouchesCodeBlock\s*\(/);
  assert.match(wikiCodeBlockSource, /if\s*\(\s*!transaction\.docChanged\s*\|\|\s*!transactionTouchesCodeBlock/);
  assert.doesNotMatch(wikiCodeBlockSource, /transaction\.selectionSet/);
});

await test("read-only wiki pages apply syntax token highlighting to language code blocks", function () {
  assert.match(wikiJsSource, /function\s+highlightReadOnlyWikiCodeBlocks\s*\(/);
  assert.match(wikiJsSource, /wiki-code-token wiki-code-token--/);
  assert.match(wikiJsSource, /querySelectorAll\('\.wiki-article-prose pre code\[class\*="language-"\]'\)/);
  assert.match(wikiJsSource, /highlightReadOnlyWikiCodeBlocks\(\)/);
  assert.match(articleBodyCss, /\.wiki-article-prose\s+pre\s+code\s+\.wiki-code-token--keyword/);
});

await test("top toolbar schema excludes contextual image layout and size controls", function () {
  IMAGE_CONTEXT_BUTTON_IDS.forEach(function (id) {
    assert.equal(TOP_TOOLBAR_BUTTON_IDS.includes(id), false);
  });

  assert.equal(TOP_TOOLBAR_BUTTON_IDS.includes("image-upload"), true);
  assert.equal(IMAGE_CONTEXT_BUTTON_IDS.includes("image-size-md"), true);
  assert.equal(IMAGE_CONTEXT_BUTTON_IDS.includes("image-align-right"), true);
  assert.equal(IMAGE_CONTEXT_BUTTON_IDS.includes("image-convert-figure"), true);
});

await test("top toolbar schema keeps wiki entity tools and table creation tools in the always-visible toolbar", function () {
  const groupIds = TOP_TOOLBAR_GROUPS.map(function (group) {
    return group.id;
  });
  assert.deepEqual(groupIds, [
    "history",
    "structure",
    "inline-formatting",
    "links-media",
    "blocks",
    "callouts",
    "alignment",
    "tables",
    "view"
  ]);

  const history = TOP_TOOLBAR_GROUPS.find(function (group) { return group.id === "history"; });
  const inlineFormatting = TOP_TOOLBAR_GROUPS.find(function (group) { return group.id === "inline-formatting"; });
  const callouts = TOP_TOOLBAR_GROUPS.find(function (group) { return group.id === "callouts"; });
  const media = TOP_TOOLBAR_GROUPS.find(function (group) { return group.id === "links-media"; });
  const tables = TOP_TOOLBAR_GROUPS.find(function (group) { return group.id === "tables"; });
  const view = TOP_TOOLBAR_GROUPS.find(function (group) { return group.id === "view"; });

  assert.deepEqual(history.buttonIds, ["undo", "redo"]);
  assert.deepEqual(inlineFormatting.buttonIds, ["bold", "italic", "underline", "strike", "inline-code", "highlight", "strip-span-styling", "subscript", "superscript"]);
  assert.equal(TOP_TOOLBAR_BUTTON_IDS.includes("strip-span-styling"), true);
  assert.deepEqual(callouts.buttonIds, ["callout-info", "callout-success", "callout-warning", "callout-danger"]);
  assert.deepEqual(media.buttonIds, ["link", "wiki-page-link", "wiki-user-mention", "wiki-footnote", "image-upload", "media-row-2", "media-row-3"]);
  assert.equal(TOP_TOOLBAR_BUTTON_IDS.includes("wiki-namespace-link"), false);
  assert.deepEqual(tables.buttonIds, ["table-insert", "dnd-alignment-table"]);
  assert.deepEqual(view.buttonIds, ["fullscreen-source"]);
  assert.equal(TOP_TOOLBAR_BUTTON_IDS.includes("fullscreen-source"), true);
});

await test("fullscreen source mode has guarded editable source synchronization", function () {
  assert.match(editorBundleSource, /function\s+escapeSourceHtml\s*\(/);
  assert.match(editorBundleSource, /function\s+formatSourceHtml\s*\(/);
  assert.match(editorBundleSource, /function\s+normalizeSourceHtmlForEditor\s*\(/);
  assert.match(editorBundleSource, /function\s+removeSourceWhitespaceTextNodes\s*\(/);
  assert.match(editorBundleSource, /function\s+plainSourceHeadingText\s*\(/);
  assert.match(editorBundleSource, /function\s+scrollSourceToHeading\s*\(/);
  assert.match(editorBundleSource, /function\s+highlightSourceHtml\s*\(/);
  assert.match(editorBundleSource, /function\s+createFullscreenSourceMode\s*\(/);
  assert.match(editorBundleSource, /data-wiki-editor-source-wrap/);
  assert.match(editorBundleSource, /const\s+sourceWrap\s*=\s*sourcePanel\.querySelector\("\[data-wiki-editor-source-wrap\]"\)/);
  assert.match(editorBundleSource, /let\s+sourceWrapEnabled\s*=\s*false/);
  assert.match(editorBundleSource, /function\s+setSourceWrap\s*\(/);
  assert.match(editorBundleSource, /sourcePanel\.classList\.toggle\("wiki-editor__fullscreen-source-panel--wrap",\s*sourceWrapEnabled\)/);
  assert.match(editorBundleSource, /sourceTextarea\.setAttribute\("wrap",\s*sourceWrapEnabled\s*\?\s*"soft"\s*:\s*"off"\)/);
  assert.match(editorBundleSource, /sourceWrap\.addEventListener\("click",\s*function \(\) \{[\s\S]*setSourceWrap\(!sourceWrapEnabled\)/);
  assert.match(editorBundleSource, /let\s+syncingSource\s*=\s*false/);
  assert.match(editorBundleSource, /let\s+sourceDirty\s*=\s*false/);
  assert.match(editorBundleSource, /SOURCE_SYNC_DELAY_MS\s*=\s*500/);
  assert.match(editorBundleSource, /function\s+scheduleSourceFromEditor\s*\(/);
  assert.match(editorBundleSource, /window\.setTimeout\(function \(\) \{[\s\S]*syncSourceFromEditor\(\);[\s\S]*\},\s*SOURCE_SYNC_DELAY_MS\)/);
  assert.match(editorBundleSource, /syncingSource\s*\|\|\s*sourceDirty\s*\|\|\s*!fullscreen\s*\|\|\s*sourceHidden/);
  assert.match(editorBundleSource, /new DOMParser\(\)\.parseFromString/);
  assert.match(editorBundleSource, /sourceTextarea\.value\s*=\s*formatSourceHtml\(sanitizeHtml\(editor\.getHTML\(\)\)\)/);
  assert.match(editorBundleSource, /normalizeSourceHtmlForEditor\(sourceTextarea\.value\)/);
  assert.match(editorBundleSource, /function\s+applySourceToEditor\s*\(/);
  assert.match(editorBundleSource, /editor\.commands\.setContent\([^,]+,\s*false\)/);
  assert.match(editorBundleSource, /sourceApply\.addEventListener\("click",\s*applySourceToEditor\)/);
  assert.match(editorBundleSource, /sourceTextarea\.addEventListener\("input",\s*function \(\) \{[\s\S]*setSourceDirty\(true\)/);
  assert.match(editorBundleSource, /sourceTextarea\.addEventListener\("input",\s*function \(\) \{[\s\S]*renderSourceHighlight\(\)/);
  assert.doesNotMatch(editorBundleSource, /sourceTextarea\.addEventListener\("input",\s*function \(\) \{[\s\S]*syncEditorFromSource\(\)/);
  assert.match(editorBundleSource, /editor\.on\("update",\s*scheduleSourceFromEditor\)/);
  assert.doesNotMatch(editorBundleSource, /editor\.on\("update",\s*syncSourceFromEditor\)/);
  assert.match(editorBundleSource, /root\.addEventListener\("wiki-editor-toc-navigate",\s*handleTocNavigate\)/);
  assert.match(editorBundleSource, /root\.removeEventListener\("wiki-editor-toc-navigate",\s*handleTocNavigate\)/);
  assert.match(editorBundleSource, /sourceTextarea\.scrollTo\(\{[\s\S]*behavior:\s*"smooth"/);
});

await test("editor ToC updates are debounced and avoid transaction-only DOM rewrites", function () {
  assert.match(editorBundleSource, /function\s+scheduleTocSync\s*\(/);
  assert.match(editorBundleSource, /window\.setTimeout\(syncToc,\s*250\)/);
  assert.match(editorBundleSource, /signature\s*===\s*lastTocSignature/);
  assert.doesNotMatch(editorBundleSource, /editor\.on\("transaction",\s*syncToc\)/);
});

await test("editor ToC child sections start expanded", function () {
  assert.doesNotMatch(editorBundleSource, /row\.classList\.add\("wiki-editor-toc__entry--collapsed"\)/);
  assert.doesNotMatch(editorBundleSource, /childList\.hidden\s*=\s*true/);
  assert.match(editorBundleSource, /toggle\.setAttribute\("aria-expanded",\s*"true"\)/);
  assert.match(editorBundleSource, /toggle\.setAttribute\("aria-label",\s*"Collapse "\s*\+\s*\(item\.text\s*\|\|\s*"heading"\)\)/);
});

await test("editor ToC navigation dispatches a source sync event", function () {
  assert.match(editorBundleSource, /new CustomEvent\("wiki-editor-toc-navigate"/);
  assert.match(editorBundleSource, /detail:\s*\{\s*item/);
  assert.match(editorBundleSource, /bubbles:\s*true/);
});

await test("fullscreen source toolbar action is bridged onto the toolbar mount", function () {
  assert.match(editorBundleSource, /toolbarMount\.__wikiToggleFullscreenSource\s*=/);
  assert.match(editorBundleSource, /toolbarMount\.__wikiIsFullscreenSourceActive\s*=/);
});

await test("code block syntax dropdown is contextual to active code blocks", function () {
  assert.match(editorBundleSource, /function\s+createCodeBlockLanguageToolbar\s*\(/);
  assert.match(editorBundleSource, /wiki-editor-code-language-tools/);
  assert.match(editorBundleSource, /setCodeBlockLanguage\(select\.value\)/);
  assert.match(editorBundleSource, /editor\.isActive\("codeBlock"\)/);
});

await test("fullscreen source mode portals above NodeBB page stacking contexts", function () {
  assert.match(editorBundleSource, /wiki-editor-fullscreen-portal/);
  assert.match(editorBundleSource, /wiki-editor-fullscreen-actions-portal/);
  assert.match(editorBundleSource, /querySelector\("\.wiki-compose-actions--floating"\)/);
  assert.match(editorBundleSource, /document\.body\.appendChild\(portalHost\)/);
  assert.match(editorBundleSource, /document\.body\.appendChild\(actionsPortalHost\)/);
  assert.match(editorBundleSource, /placeholder\.parentNode\.insertBefore\(root,\s*placeholder\)/);
  assert.match(editorBundleSource, /actionsPlaceholder\.parentNode\.insertBefore\(actionsDock,\s*actionsPlaceholder\)/);
});

await test("fullscreen source highlighting escapes raw source before adding syntax spans", function () {
  assert.match(editorBundleSource, /escapeSourceHtml\(source\)/);
  assert.match(editorBundleSource, /\.replace\(/);
  assert.match(editorBundleSource, /wiki-editor-source-token--tag/);
  assert.match(editorBundleSource, /wiki-editor-source-token--script/);
});

await test("fullscreen source mode css supports resize and source hiding", function () {
  [editorCss, vendoredEditorCss].forEach(function (css) {
    assert.match(css, /\.wiki-editor-fullscreen-portal\s*{[^}]*z-index:\s*1040/);
    assert.match(css, /\.wiki-editor-fullscreen-actions-portal\s*{[^}]*z-index:\s*1065/);
    assert.match(css, /\.wiki-editor-fullscreen-actions-portal\s*>\s*\.wiki-compose-actions--floating\s*{[^}]*pointer-events:\s*auto/);
    assert.match(css, /\.wiki-editor--fullscreen-source\s*{[^}]*z-index:\s*1040/);
    assert.match(css, /\.wiki-editor--fullscreen-source\s*{[^}]*background:\s*var\(--bs-body-bg,\s*#fff\)/);
    assert.match(css, /\.wiki-editor--fullscreen-source\s+\.wiki-editor__fullscreen-editor-panel[^{}]*{[^}]*background:\s*var\(--bs-body-bg,\s*#fff\)/);
    assert.match(css, /\.wiki-editor--fullscreen-source\s+\.wiki-editor__surface[^{}]*{[^}]*background:\s*var\(--bs-body-bg,\s*#fff\)/);
    assert.match(css, /\.wiki-editor-fullscreen-source-active\s+\.wiki-compose-actions--floating\s*{[^}]*z-index:\s*1060/);
    assert.match(css, /\.wiki-editor-fullscreen-source-active\s+\.wiki-compose-actions--floating\s*{[^}]*right:\s*max\(1rem,\s*env\(safe-area-inset-right,\s*0px\)\)/);
    assert.match(css, /\.wiki-editor-fullscreen-source-active\s+\.wiki-compose-actions--floating\s*{[^}]*justify-content:\s*flex-end/);
    assert.match(css, /\.wiki-editor--fullscreen-source\s+\.wiki-editor-toc\s*{[^}]*right:\s*0/);
    assert.match(css, /\.wiki-editor--fullscreen-source\s+\.wiki-editor-toc\s*{[^}]*transform:\s*translate(?:X)?\(calc\(100%\s*-\s*2\.6rem\)\)/);
    assert.match(css, /--wiki-editor-source-panel-width:\s*clamp\(22rem,\s*38vw,\s*70vw\)/);
    assert.match(css, /\.wiki-editor__fullscreen-layout\s*{[^}]*grid-template-columns:\s*var\(--wiki-editor-source-panel-current-width/);
    assert.match(css, /\.wiki-editor--fullscreen-source-hidden\s+\.wiki-editor__fullscreen-source-panel[^{}]*{[^}]*display:\s*none/);
    assert.match(css, /\.wiki-editor--fullscreen-source-hidden\s+\.wiki-editor__fullscreen-layout\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.match(css, /\.wiki-editor__fullscreen-resizer\s*{[^}]*cursor:\s*col-resize/);
    assert.match(css, /\.wiki-editor__fullscreen-source-actions\s*{[^}]*display:\s*flex/);
    assert.match(css, /\.wiki-editor__fullscreen-source-toggle,\s*\.westgate-wiki-compose\s+\.wiki-editor__fullscreen-source-wrap\s*{[^}]*width:\s*2rem/);
    assert.match(css, /\.wiki-editor__fullscreen-source-panel--wrap\s+\.wiki-editor__fullscreen-source-highlight,\s*\.westgate-wiki-compose\s+\.wiki-editor__fullscreen-source-panel--wrap\s+\.wiki-editor__fullscreen-source-input\s*{[^}]*white-space:\s*pre-wrap/);
    assert.match(css, /\.wiki-editor__fullscreen-source-panel--wrap\s+\.wiki-editor__fullscreen-source-highlight,\s*\.westgate-wiki-compose\s+\.wiki-editor__fullscreen-source-panel--wrap\s+\.wiki-editor__fullscreen-source-input\s*{[^}]*overflow-wrap:\s*break-word/);
    assert.doesNotMatch(css, /\.wiki-editor__fullscreen-source-panel--dirty\s+\.wiki-editor__fullscreen-source-highlight\s*{[^}]*visibility:\s*hidden/);
    assert.doesNotMatch(css, /\.wiki-editor__fullscreen-source-panel--dirty\s+\.wiki-editor__fullscreen-source-input\s*{[^}]*color:\s*#f9fafb/);
  });
});

await test("contextual table schema exposes row, column, cell merge, and delete tools", function () {
  assert.deepEqual(TABLE_CONTEXT_BUTTON_IDS, TABLE_STICKY_COMMAND_IDS);
  assert.ok(TABLE_CELL_POPOVER_COMMAND_IDS.includes("table-cell-background"));
  assert.ok(TABLE_CELL_POPOVER_COMMAND_IDS.includes("table-cell-valign-top"));
  assert.ok(TABLE_CELL_POPOVER_COMMAND_IDS.includes("table-cell-valign-middle"));
  assert.ok(TABLE_CELL_POPOVER_COMMAND_IDS.includes("table-cell-valign-bottom"));
  assert.match(editorBundleSource, /createTableAuthoring\(editorMount,\s*editor\)/);
  assert.match(editorBundleSource, /openAlignmentTableDialog\(\{ editor \}\)/);
  assert.match(tableAuthoringSource, /placement:\s*["']bottom["']/);
  assert.match(editorCss, /\.wiki-editor-context-tools__group\s*\{/);
  assert.match(vendoredEditorCss, /\.wiki-editor-context-tools__group\s*\{/);
  assert.match(editorCss, /\.westgate-wiki-compose\s+\.wiki-editor-table-sticky-row\s*\{/);
  assert.match(editorCss, /\.westgate-wiki-compose\s+\.wiki-editor-table-cell-popover__color\s*\{/);
});

await test("buildHeadingToc nests smaller headings under the nearest larger heading", function () {
  const editor = createEditor(
    "<h1>Root</h1><p>Intro</p><h2>Child</h2><h3>Grandchild</h3><h2>Second Child</h2><h4>Deep Direct</h4><h1>Next Root</h1>"
  );
  const toc = buildHeadingToc(editor);

  assert.equal(toc.length, 2);
  assert.equal(toc[0].text, "Root");
  assert.equal(toc[0].children.length, 2);
  assert.equal(toc[0].children[0].text, "Child");
  assert.equal(toc[0].children[0].children[0].text, "Grandchild");
  assert.equal(toc[0].children[1].text, "Second Child");
  assert.equal(toc[0].children[1].children[0].text, "Deep Direct");
  assert.equal(toc[1].text, "Next Root");
  assert.match(toc[0].id, /^wiki-editor-heading-/);
  editor.destroy();
});

await test("buildHeadingToc excludes headings inside wiki infobox nodes", function () {
  const editor = createEditor(
    '<h1>Overview</h1><aside class="wiki-infobox" data-wiki-node="infobox"><div class="wiki-infobox__content" data-wiki-infobox-part="content"><h2>Infobox Heading</h2><p>Details.</p></div></aside><h1>History</h1>'
  );
  const toc = buildHeadingToc(editor);

  assert.equal(toc.length, 2);
  assert.equal(toc[0].text, "Overview");
  assert.equal(toc[1].text, "History");
  assert.deepEqual(toc[0].children, []);
  assert.deepEqual(toc[1].children, []);
  editor.destroy();
});

await test("navigateToHeading scrolls the ProseMirror heading position without refocusing the editor", function () {
  const originalScrollTo = window.scrollTo;
  const originalPageYOffset = window.pageYOffset;
  let scrollOptions = null;
  let focusCount = 0;
  const heading = document.createElement("h2");
  heading.id = "wiki-editor-heading-1-target";
  heading.getBoundingClientRect = function () {
    return { top: 240, left: 0, right: 0, bottom: 270, width: 100, height: 30 };
  };
  heading.scrollIntoView = function () {
    throw new Error("navigateToHeading should use deterministic scroll coordinates");
  };
  Object.defineProperty(window, "pageYOffset", { configurable: true, value: 100 });
  window.scrollTo = function (options) {
    scrollOptions = options;
  };

  const surface = document.createElement("div");
  surface.appendChild(heading);

  try {
    navigateToHeading({
      item: { id: heading.id, pos: 7 },
      surface,
      editor: {
        view: {
          nodeDOM: function (pos) {
            return pos === 7 ? heading : null;
          }
        },
        commands: {
          focus: function () {
            focusCount += 1;
          }
        }
      }
    });

    assert.deepEqual(scrollOptions, { top: 328, behavior: "smooth" });
    assert.equal(focusCount, 0);
  } finally {
    window.scrollTo = originalScrollTo;
    Object.defineProperty(window, "pageYOffset", { configurable: true, value: originalPageYOffset });
  }
});
