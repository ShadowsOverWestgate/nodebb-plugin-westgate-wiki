import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import { CellSelection } from "@tiptap/pm/tables";

import PreservedNodeAttributes from "../tiptap/src/extensions/preserved-node-attributes.mjs";
import { installJsdomGlobals } from "./helpers/jsdom-setup.mjs";

import { test } from "node:test";

installJsdomGlobals();

const wikiEditorCss = readFileSync(new URL("../tiptap/src/wiki-editor.css", import.meta.url), "utf8");
const tableAuthoringSource = readFileSync(new URL("../tiptap/src/table/table-authoring-ui.mjs", import.meta.url), "utf8");

const [
  tableContextModule,
  tableDomModule,
  tableViewModule,
  tableCommandsModule,
  tablePropertiesDialogModule,
  tableAuthoringUiModule,
  toolbarSchemaModule
] = await Promise.all([
  import("../tiptap/src/table/table-context.mjs"),
  import("../tiptap/src/table/table-dom.mjs"),
  import("../tiptap/src/table/table-view.mjs"),
  import("../tiptap/src/table/table-commands.mjs"),
  import("../tiptap/src/table/table-properties-dialog.mjs"),
  import("../tiptap/src/table/table-authoring-ui.mjs"),
  import("../tiptap/src/toolbar/toolbar-schema.mjs")
]);

const { deriveTableContext } = tableContextModule;
const {
  getSelectionElement,
  getActiveTableElement,
  getActiveTableRowElement,
  getActiveTableCellElement,
  getTableNodePosition,
  setClassToken,
  setStyleValue,
  getStyleValue,
  updateNodeAttributesAtPos,
  updateNodeStyleAtPos,
  positionContextPanel
} = tableDomModule;
const { WestgateTableView, applyTableNodeAttributesToView } = tableViewModule;
const {
  TABLE_COMMANDS,
  TABLE_COMMAND_IDS,
  TABLE_STICKY_COMMAND_IDS,
  TABLE_CELL_POPOVER_COMMAND_IDS,
  getTableCommand,
  isTableCommandEnabled,
  executeTableCommand
} = tableCommandsModule;
const { applyActiveTableProperties } = tablePropertiesDialogModule;
const { createTableAuthoring } = tableAuthoringUiModule;
const { TABLE_CONTEXT_BUTTON_IDS } = toolbarSchemaModule;

function createTableEditor(content) {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return new Editor({
    element: mount,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false
      }),
      PreservedNodeAttributes,
      Table,
      TableRow,
      TableHeader,
      TableCell
    ],
    content
  });
}

function createEditorShell(editor) {
  const shell = document.createElement("div");
  shell.className = "wiki-editor__surface";
  document.body.appendChild(shell);
  shell.appendChild(editor.view.dom);
  return shell;
}

// update() is rAF-coalesced, so event-driven repositioning lands next frame.
function nextFrame() {
  return new Promise(function (resolve) {
    requestAnimationFrame(function () {
      resolve();
    });
  });
}

function findCellPositions(editor) {
  const positions = [];
  editor.state.doc.descendants(function (node, pos) {
    if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
      positions.push(pos);
    }
  });
  return positions;
}

function getCellStyles(editor) {
  return findCellPositions(editor).map(function (pos) {
    const node = editor.state.doc.nodeAt(pos);
    return node && node.attrs ? node.attrs.style || "" : "";
  });
}

function getFirstTableStyle(editor) {
  const table = editor.state.doc.nodeAt(0);
  return table && table.attrs ? table.attrs.style || "" : "";
}

function getDialogFieldByLabel(dialog, labelText) {
  return Array.from(dialog.querySelectorAll(".wiki-editor-dialog__field")).find(function (field) {
    const label = field.querySelector("span");
    return label && label.textContent === labelText;
  }) || null;
}

function createSelectionEditorStub(selectionNode) {
  return {
    view: {
      domAtPos: function () {
        return { node: selectionNode };
      }
    },
    state: {
      selection: { from: 1 }
    }
  };
}

function createPositionEditorStub(nodeAtResult) {
  return {
    view: {
      posAtDOM: function () {
        return 9;
      }
    },
    state: {
      doc: {
        nodeAt: function (pos) {
          return pos === 8 ? nodeAtResult : null;
        }
      }
    }
  };
}

function createAttributeEditorStub(nodeAtResult) {
  const calls = [];
  const tr = {
    scrolled: false,
    setNodeMarkup: function (pos, type, attrs, marks) {
      calls.push({ pos, type, attrs, marks });
      return tr;
    },
    scrollIntoView: function () {
      tr.scrolled = true;
      return tr;
    }
  };
  const editor = {
    dispatched: null,
    state: {
      doc: {
        nodeAt: function (pos) {
          return pos === 4 ? nodeAtResult : null;
        }
      },
      tr
    },
    view: {
      dispatch: function (transaction) {
        editor.dispatched = transaction;
      }
    }
  };
  editor.calls = calls;
  return editor;
}

await test("table DOM helpers preserve class tokens and style values", function () {
  assert.equal(setClassToken("one two", "three", true), "one two three");
  assert.equal(setClassToken("one two", "two", false), "one");
  assert.equal(setStyleValue("width: 50%; color: red", "width", "75%"), "width: 75%; color: red");
  assert.equal(setStyleValue("width: 50%; color: red", "color", ""), "width: 50%");
  assert.equal(getStyleValue("width: 50%; color: red", "width"), "50%");
  assert.equal(getStyleValue("width: 50%; color: red", "height"), "");
});

await test("positionContextPanel clamps panel within the editor surface", function () {
  const surface = document.createElement("div");
  const target = document.createElement("div");
  const panel = document.createElement("div");
  Object.defineProperty(surface, "offsetWidth", { value: 600 });
  Object.defineProperty(panel, "offsetWidth", { value: 180 });
  Object.defineProperty(panel, "offsetHeight", { value: 32 });
  surface.getBoundingClientRect = function () {
    return { left: 10, top: 20, width: 600, height: 300, right: 610, bottom: 320 };
  };
  target.getBoundingClientRect = function () {
    return { left: 580, top: 90, width: 80, height: 32, right: 660, bottom: 122 };
  };

  positionContextPanel(panel, target, surface, { avoidTop: 48 });

  assert.equal(panel.style.left, "412px");
  assert.equal(panel.style.top, "40px");
});

await test("positionContextPanel can anchor a panel below the target", function () {
  const surface = document.createElement("div");
  const target = document.createElement("div");
  const panel = document.createElement("div");
  Object.defineProperty(surface, "offsetWidth", { value: 600 });
  Object.defineProperty(panel, "offsetWidth", { value: 180 });
  Object.defineProperty(panel, "offsetHeight", { value: 32 });
  surface.getBoundingClientRect = function () {
    return { left: 10, top: 20, width: 600, height: 300, right: 610, bottom: 320 };
  };
  target.getBoundingClientRect = function () {
    return { left: 580, top: 90, width: 80, height: 32, right: 660, bottom: 122 };
  };

  positionContextPanel(panel, target, surface, { placement: "bottom" });

  assert.equal(panel.style.left, "412px");
  assert.equal(panel.style.top, "110px");
});

await test("active table DOM helpers locate table, row, and cell inside the editor surface", function () {
  const surface = document.createElement("div");
  const table = document.createElement("table");
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  const paragraph = document.createElement("p");
  const text = document.createTextNode("Cell text");
  paragraph.appendChild(text);
  cell.appendChild(paragraph);
  row.appendChild(cell);
  table.appendChild(row);
  surface.appendChild(table);

  const editor = createSelectionEditorStub(text);

  assert.equal(getActiveTableElement(editor, surface), table);
  assert.equal(getActiveTableRowElement(editor, table), row);
  assert.equal(getActiveTableCellElement(editor, table), cell);
  assert.equal(getActiveTableElement(editor, document.createElement("div")), null);
  assert.equal(getActiveTableRowElement(editor, document.createElement("table")), null);
  assert.equal(getActiveTableCellElement(editor, document.createElement("table")), null);
});

await test("getTableNodePosition maps a table DOM element to a valid document position", function () {
  const tableNode = { type: { name: "table" } };
  const editor = createPositionEditorStub(tableNode);

  assert.equal(getTableNodePosition(editor, document.createElement("table")), 8);
  assert.equal(getTableNodePosition(createPositionEditorStub(null), document.createElement("table")), null);
  assert.equal(getTableNodePosition({ view: {}, state: { doc: {} } }, document.createElement("table")), null);
});

await test("updateNodeAttributesAtPos merges node attrs and dispatches the transaction", function () {
  const node = {
    attrs: { class: "old", style: "width: 50%" },
    marks: ["strong"]
  };
  const editor = createAttributeEditorStub(node);

  assert.equal(updateNodeAttributesAtPos(editor, 4, { class: "new" }), true);
  assert.deepEqual(editor.calls, [{
    pos: 4,
    type: undefined,
    attrs: { class: "new", style: "width: 50%" },
    marks: ["strong"]
  }]);
  assert.equal(editor.dispatched, editor.state.tr);
  assert.equal(editor.state.tr.scrolled, true);
  assert.equal(updateNodeAttributesAtPos(editor, 5, { class: "missing" }), false);
});

await test("updateNodeStyleAtPos updates styles from node attrs or fallback style", function () {
  const node = {
    attrs: { class: "wiki-table-layout-auto", style: "" },
    marks: []
  };
  const editor = createAttributeEditorStub(node);

  assert.equal(updateNodeStyleAtPos(editor, 4, "width: 50%", function (style) {
    assert.equal(style, "width: 50%");
    return setStyleValue(style, "width", "75%");
  }, { scroll: false }), true);

  assert.deepEqual(editor.calls, [{
    pos: 4,
    type: undefined,
    attrs: { class: "wiki-table-layout-auto", style: "width: 75%" },
    marks: []
  }]);
  assert.equal(editor.dispatched, editor.state.tr);
  assert.equal(editor.state.tr.scrolled, false);

  const removeStyleEditor = createAttributeEditorStub(node);
  assert.equal(updateNodeStyleAtPos(removeStyleEditor, 4, "height: 30px", function () {
    return "";
  }), true);
  assert.equal(removeStyleEditor.calls[0].attrs.style, null);
});

await test("table view exports preserve table class and style attributes", function () {
  const table = document.createElement("table");
  applyTableNodeAttributesToView(table, {
    class: "wiki-table-layout-auto",
    style: "width: 50%;"
  });
  assert.equal(table.getAttribute("class"), "wiki-table-layout-auto");
  assert.equal(table.getAttribute("style"), "width: 50%;");
  assert.equal(typeof WestgateTableView, "function");
});

await test("table view preserves TipTap-managed fixed table width during attr sync", function () {
  const table = document.createElement("table");
  table.style.width = "360px";
  applyTableNodeAttributesToView(table, {
    class: "wiki-table-layout-fixed",
    style: ""
  });

  assert.equal(table.style.width, "360px");
  assert.equal(table.getAttribute("class"), "wiki-table-layout-fixed");
});

await test("getSelectionElement tolerates missing editor selection DOM", function () {
  assert.equal(getSelectionElement({ view: { domAtPos: function () { return {}; } }, state: { selection: { from: 1 } } }), null);
});

await test("table command registry exposes structural and cell formatting placements", function () {
  const expectedStickyIds = [
    "table-properties",
    "table-add-row-before",
    "table-add-row-after",
    "table-delete-row",
    "table-add-column-before",
    "table-add-column-after",
    "table-delete-column",
    "table-merge-cells",
    "table-split-cell",
    "table-toggle-header-row",
    "table-toggle-header-column",
    "table-delete"
  ];
  const expectedCellIds = [
    "table-cell-background",
    "table-cell-text-color",
    "table-cell-align-left",
    "table-cell-align-center",
    "table-cell-align-right",
    "table-cell-valign-top",
    "table-cell-valign-middle",
    "table-cell-valign-bottom",
    "table-cell-clear-formatting"
  ];

  assert.deepEqual(TABLE_STICKY_COMMAND_IDS, expectedStickyIds);
  assert.deepEqual(TABLE_CELL_POPOVER_COMMAND_IDS, expectedCellIds);
  assert.deepEqual(TABLE_CONTEXT_BUTTON_IDS, TABLE_STICKY_COMMAND_IDS);
  assert.deepEqual(TABLE_COMMAND_IDS, expectedStickyIds.concat(expectedCellIds));
  assert.equal(TABLE_COMMANDS.every(function (command) {
    return TABLE_COMMAND_IDS.includes(command.id) && command.label && command.scope && command.placement && command.icon && command.group;
  }), true);
  assert.equal(getTableCommand("table-add-row-before").badge, "R+");
  assert.equal(getTableCommand("table-add-row-after").badge, "+R");
  assert.equal(getTableCommand("table-delete-row").badge, "R");
  assert.equal(getTableCommand("table-add-column-before").badge, "C+");
  assert.equal(getTableCommand("table-add-column-after").badge, "+C");
  assert.equal(getTableCommand("table-delete-column").badge, "C");
  assert.equal(getTableCommand("table-toggle-header-row").badge, "R");
  assert.equal(getTableCommand("table-toggle-header-column").badge, "C");
  assert.equal(getTableCommand("table-cell-background").placement, "cell-popover");
  assert.equal(getTableCommand("table-cell-valign-middle").placement, "cell-popover");
  assert.equal(getTableCommand("table-cell-valign-bottom").icon, "fa-long-arrow-down");
  assert.equal(getTableCommand("table-add-row-before").placement, "sticky");
  assert.equal(getTableCommand("missing-command"), null);
});

await test("deriveTableContext reports active table and active cell for a cursor in a table", function () {
  const editor = createTableEditor("<table><tbody><tr><td><p>Alpha</p></td><td><p>Beta</p></td></tr></tbody></table>");
  editor.commands.setTextSelection(5);

  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(context.isActive, true);
  assert.equal(context.selectedCellCount, 1);
  assert.equal(context.selectedCellPositions.length, 1);
  assert.equal(context.activeTableElement.tagName, "TABLE");
  assert.equal(context.activeCellElement.tagName, "TD");
  editor.destroy();
});

await test("deriveTableContext reports positions, table attrs, and selected cell fallback style", function () {
  const editor = createTableEditor("<table class=\"wiki-table-layout-auto\" style=\"width: 50%;\"><tbody><tr><td style=\"background-color: rgb(202, 165, 90);\"><p>Alpha</p></td><td><p>Beta</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[0] + 2);

  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(context.activeTablePos, 0);
  assert.equal(context.activeCellPos, positions[0]);
  assert.equal(context.tableAttrs.class, "wiki-table-layout-auto");
  assert.equal(context.tableAttrs.style, "width: 50%");
  assert.equal(context.selectedCellPositions[0].fallbackStyle, "background-color: rgb(202, 165, 90)");
  editor.destroy();
});

await test("deriveTableContext reports empty context outside a table", function () {
  const editor = createTableEditor("<p>Outside table</p>");
  editor.commands.setTextSelection(2);

  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(context.isActive, false);
  assert.equal(context.activeTableElement, null);
  assert.equal(context.activeTablePos, null);
  assert.equal(context.activeCellElement, null);
  assert.equal(context.activeCellPos, null);
  assert.deepEqual(context.selectedCellPositions, []);
  assert.equal(context.selectedCellCount, 0);
  assert.deepEqual(context.selectedRowIndexes, []);
  assert.deepEqual(context.selectedColumnIndexes, []);
  assert.deepEqual(context.tableAttrs, {});
  assert.equal(context.canFormatSelection, false);
  assert.equal(context.canUseStructuralCommands, false);
  editor.destroy();
});

await test("deriveTableContext reports logical column indexes for spanned cells", function () {
  const editor = createTableEditor("<table><tbody><tr><td colspan=\"2\"><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td><td><p>D</p></td><td><p>E</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[1] + 2);

  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(context.activeCellPos, positions[1]);
  assert.deepEqual(context.selectedRowIndexes, [0]);
  assert.deepEqual(context.selectedColumnIndexes, [2]);
  editor.destroy();
});

await test("deriveTableContext reports every selected cell in a CellSelection", function () {
  const editor = createTableEditor("<table><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr><tr><td><p>A2</p></td><td><p>B2</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  const selection = CellSelection.create(editor.state.doc, positions[0], positions[3]);
  editor.view.dispatch(editor.state.tr.setSelection(selection));

  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(context.isActive, true);
  assert.equal(context.selectedCellCount, 4);
  assert.deepEqual(context.selectedCellPositions.map(function (entry) { return entry.pos; }), positions);
  editor.destroy();
});

await test("selected-cell background command applies to every selected cell", function () {
  const editor = createTableEditor("<table><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr><tr><td><p>A2</p></td><td><p>B2</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, positions[0], positions[3])));
  const context = deriveTableContext(editor, editor.view.dom);
  let dispatchCount = 0;
  const originalDispatch = editor.view.dispatch.bind(editor.view);
  editor.view.dispatch = function (transaction) {
    dispatchCount += 1;
    originalDispatch(transaction);
  };

  assert.equal(isTableCommandEnabled(editor, context, "table-cell-background"), true);
  assert.equal(executeTableCommand(editor, context, "table-cell-background", { value: "#dbeafe" }), true);

  assert.equal(dispatchCount, 1);
  assert.deepEqual(getCellStyles(editor), [
    "background-color: rgb(219, 234, 254); color: rgb(17, 24, 39)",
    "background-color: rgb(219, 234, 254); color: rgb(17, 24, 39)",
    "background-color: rgb(219, 234, 254); color: rgb(17, 24, 39)",
    "background-color: rgb(219, 234, 254); color: rgb(17, 24, 39)"
  ]);
  editor.destroy();
});

await test("selected-cell formatting commands do not force selection scroll", function () {
  const editor = createTableEditor("<table><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, positions[0], positions[1])));
  const context = deriveTableContext(editor, editor.view.dom);
  let requestedScroll = false;
  const originalDispatch = editor.view.dispatch.bind(editor.view);
  editor.view.dispatch = function (transaction) {
    requestedScroll = requestedScroll || Boolean(transaction.scrolledIntoView);
    originalDispatch(transaction);
  };

  assert.equal(executeTableCommand(editor, context, "table-cell-background", { value: "#dbeafe" }), true);

  assert.equal(requestedScroll, false);
  editor.destroy();
});

await test("selected-cell text color command accepts value payload", function () {
  const editor = createTableEditor("<table><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, positions[0], positions[1])));
  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(executeTableCommand(editor, context, "table-cell-text-color", { value: "#3b0764" }), true);
  assert.deepEqual(getCellStyles(editor), [
    "color: rgb(59, 7, 100)",
    "color: rgb(59, 7, 100)"
  ]);
  editor.destroy();
});

await test("selected-cell alignment command replaces parsed table cell align attrs", function () {
  const editor = createTableEditor("<table><tbody><tr><td style=\"text-align: center\"><p>A1</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[0] + 2);
  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(editor.state.doc.nodeAt(positions[0]).attrs.align, "center");
  assert.equal(executeTableCommand(editor, context, "table-cell-align-right"), true);

  assert.equal(editor.state.doc.nodeAt(positions[0]).attrs.align, "right");
  assert.match(editor.getHTML(), /<td[^>]*style="[^"]*\btext-align:\s*right;?[^"]*"/);
  assert.doesNotMatch(editor.getHTML(), /text-align:\s*center/);
  editor.destroy();
});

await test("selected-cell vertical alignment commands apply to every selected cell", function () {
  const editor = createTableEditor("<table><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr><tr><td><p>A2</p></td><td><p>B2</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, positions[0], positions[3])));
  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(executeTableCommand(editor, context, "table-cell-valign-middle"), true);
  assert.deepEqual(getCellStyles(editor), [
    "vertical-align: middle",
    "vertical-align: middle",
    "vertical-align: middle",
    "vertical-align: middle"
  ]);

  const nextContext = deriveTableContext(editor, editor.view.dom);
  assert.equal(executeTableCommand(editor, nextContext, "table-cell-valign-bottom"), true);
  assert.deepEqual(getCellStyles(editor), [
    "vertical-align: bottom",
    "vertical-align: bottom",
    "vertical-align: bottom",
    "vertical-align: bottom"
  ]);
  editor.destroy();
});

await test("selected-cell vertical alignment commands write durable class fallbacks", function () {
  const editor = createTableEditor("<table><tbody><tr><td class=\"legacy-cell\" style=\"width: 64px\"><p>A1</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[0] + 2);
  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(executeTableCommand(editor, context, "table-cell-valign-middle"), true);

  const middleAttrs = editor.state.doc.nodeAt(positions[0]).attrs;
  assert.match(middleAttrs.class, /\blegacy-cell\b/);
  assert.match(middleAttrs.class, /\bwiki-table-cell-valign-middle\b/);
  assert.doesNotMatch(middleAttrs.class, /\bwiki-table-cell-valign-top\b/);
  assert.doesNotMatch(middleAttrs.class, /\bwiki-table-cell-valign-bottom\b/);
  assert.match(editor.getHTML(), /<td[^>]*class="[^"]*\bwiki-table-cell-valign-middle\b[^"]*"[^>]*style="[^"]*\bvertical-align:\s*middle;?[^"]*"/);

  const nextContext = deriveTableContext(editor, editor.view.dom);
  assert.equal(executeTableCommand(editor, nextContext, "table-cell-valign-bottom"), true);

  const bottomAttrs = editor.state.doc.nodeAt(positions[0]).attrs;
  assert.match(bottomAttrs.class, /\blegacy-cell\b/);
  assert.match(bottomAttrs.class, /\bwiki-table-cell-valign-bottom\b/);
  assert.doesNotMatch(bottomAttrs.class, /\bwiki-table-cell-valign-middle\b/);
  assert.match(editor.getHTML(), /<td[^>]*class="[^"]*\bwiki-table-cell-valign-bottom\b[^"]*"[^>]*style="[^"]*\bvertical-align:\s*bottom;?[^"]*"/);
  editor.destroy();
});

await test("selected-cell clear formatting removes supported cell styles", function () {
  const editor = createTableEditor("<table><tbody><tr><td style=\"background-color: rgb(254, 240, 138); color: rgb(17, 24, 39); text-align: center; vertical-align: middle; width: 40%;\"><p>A1</p></td><td style=\"background-color: rgb(59, 7, 100); color: rgb(249, 250, 251); text-align: right; vertical-align: bottom; border-color: red;\"><p>B1</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, positions[0], positions[1])));
  const context = deriveTableContext(editor, editor.view.dom);
  let dispatchCount = 0;
  const originalDispatch = editor.view.dispatch.bind(editor.view);
  editor.view.dispatch = function (transaction) {
    dispatchCount += 1;
    originalDispatch(transaction);
  };

  assert.equal(executeTableCommand(editor, context, "table-cell-clear-formatting"), true);

  assert.equal(dispatchCount, 1);
  assert.deepEqual(getCellStyles(editor), [
    "width: 40%",
    "border-color: red"
  ]);
  assert.equal(editor.state.doc.nodeAt(positions[0]).attrs.align, null);
  assert.equal(editor.state.doc.nodeAt(positions[1]).attrs.align, null);
  assert.doesNotMatch(editor.getHTML(), /text-align/);
  assert.doesNotMatch(editor.getHTML(), /vertical-align/);
  editor.destroy();
});

await test("applyActiveTableProperties ignores stale size and border-color values when controls are unavailable", function () {
  const editor = createTableEditor("<table><tbody><tr style=\"height: 48px;\"><td style=\"width: 160px;\"><p>A1</p></td><td><p>B1</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[0] + 2);
  const context = deriveTableContext(editor, editor.view.dom);
  let dispatchCount = 0;
  const originalDispatch = editor.view.dispatch.bind(editor.view);
  editor.view.dispatch = function (transaction) {
    dispatchCount += 1;
    originalDispatch(transaction);
  };

  assert.equal(applyActiveTableProperties(editor, context, {
    tableWidth: "50%",
    columnWidth: "12rem",
    rowHeight: "3rem",
    borderColor: "#caa55a",
    layout: "auto",
    borderMode: "hidden"
  }), true);

  assert.equal(dispatchCount, 1);
  const html = editor.getHTML();
  assert.match(html, /<table[^>]*class="[^"]*\bwiki-table-borderless\b[^"]*\bwiki-table-layout-auto\b[^"]*"/);
  assert.equal(getStyleValue(getFirstTableStyle(editor), "width"), "");
  assert.equal(getStyleValue(getFirstTableStyle(editor), "border-color"), "");
  assert.match(html, /<tr[^>]*style="[^"]*\bheight:\s*48px;?[^"]*"/);
  assert.doesNotMatch(html, /height:\s*3rem/);
  assert.deepEqual(getCellStyles(editor), ["", ""]);
  assert.doesNotMatch(html, /width:\s*12rem/);
  editor.destroy();
});

await test("applyActiveTableProperties does not force selection scroll", function () {
  const editor = createTableEditor("<table><tbody><tr><td><p>A1</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[0] + 2);
  const context = deriveTableContext(editor, editor.view.dom);
  let requestedScroll = false;
  const originalDispatch = editor.view.dispatch.bind(editor.view);
  editor.view.dispatch = function (transaction) {
    requestedScroll = requestedScroll || Boolean(transaction.scrolledIntoView);
    originalDispatch(transaction);
  };

  assert.equal(applyActiveTableProperties(editor, context, {
    tableWidth: "42rem",
    borderColor: "#caa55a",
    layout: "fixed",
    borderMode: "visible"
  }), true);

  assert.equal(requestedScroll, false);
  editor.destroy();
});

await test("applyActiveTableProperties keeps fixed layout table width and ignores direct size values", function () {
  const editor = createTableEditor("<table><tbody><tr style=\"height: 48px;\"><td style=\"width: 160px;\"><p>A1</p></td><td><p>B1</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[0] + 2);
  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(applyActiveTableProperties(editor, context, {
    tableWidth: "42rem",
    columnWidth: "12rem",
    rowHeight: "3rem",
    borderColor: "",
    layout: "fixed",
    borderMode: "visible"
  }), true);

  const html = editor.getHTML();
  assert.match(html, /<table[^>]*class="[^"]*\bwiki-table-layout-fixed\b/);
  assert.match(html, /<table[^>]*style="[^"]*\bwidth:\s*42rem;?[^"]*"/);
  assert.match(html, /<tr[^>]*style="[^"]*\bheight:\s*48px;?[^"]*"/);
  assert.doesNotMatch(html, /height:\s*3rem/);
  assert.match(html, /<td[^>]*style="[^"]*\bwidth:\s*160px;?[^"]*"/);
  assert.doesNotMatch(html, /width:\s*12rem/);
  editor.destroy();
});

await test("applyActiveTableProperties clears table width and every column width for auto layout", function () {
  const editor = createTableEditor("<table class=\"wiki-table-layout-fixed\" style=\"width: 720px; border-color: rgb(10, 20, 30);\"><tbody><tr style=\"height: 48px;\"><td colwidth=\"160\" style=\"width: 160px;\"><p>A1</p></td><td style=\"width: 35%; background-color: rgb(254, 240, 138);\"><p>B1</p></td></tr><tr><td colwidth=\"120\" style=\"width: 120px;\"><p>A2</p></td><td><p>B2</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[0] + 2);
  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(applyActiveTableProperties(editor, context, {
    tableWidth: "50%",
    columnWidth: "12rem",
    rowHeight: "3rem",
    borderColor: "#caa55a",
    layout: "auto",
    borderMode: "visible"
  }), true);

  const html = editor.getHTML();
  assert.match(html, /<table[^>]*class="[^"]*\bwiki-table-layout-auto\b/);
  assert.doesNotMatch(html, /<table[^>]*class="[^"]*\bwiki-table-layout-fixed\b/);
  assert.equal(getStyleValue(getFirstTableStyle(editor), "width"), "");
  assert.match(html, /<table[^>]*style="[^"]*\bborder-color:\s*rgb\(202,\s*165,\s*90\)/);
  assert.match(html, /<tr[^>]*style="[^"]*\bheight:\s*48px;?[^"]*"/);
  assert.doesNotMatch(html, /height:\s*3rem/);
  assert.deepEqual(getCellStyles(editor), [
    "",
    "background-color: rgb(254, 240, 138)",
    "",
    ""
  ]);
  assert.deepEqual(findCellPositions(editor).map(function (pos) {
    return editor.state.doc.nodeAt(pos).attrs.colwidth;
  }), [
    null,
    null,
    null,
    null
  ]);
  editor.destroy();
});

await test("applyActiveTableProperties preserves column widths on tables that are already auto layout", function () {
  const editor = createTableEditor("<table class=\"wiki-table-layout-auto\" style=\"border-color: rgb(10, 20, 30);\"><tbody><tr><td colwidth=\"160\" style=\"width: 160px;\"><p>A1</p></td><td style=\"width: 35%; background-color: rgb(254, 240, 138);\"><p>B1</p></td></tr><tr><td colwidth=\"160\" style=\"width: 160px;\"><p>A2</p></td><td><p>B2</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[0] + 2);
  const context = deriveTableContext(editor, editor.view.dom);
  const initialColwidths = findCellPositions(editor).map(function (pos) {
    return editor.state.doc.nodeAt(pos).attrs.colwidth;
  });

  assert.equal(applyActiveTableProperties(editor, context, {
    tableWidth: "50%",
    borderColor: "#caa55a",
    layout: "auto",
    borderMode: "visible"
  }), true);

  assert.equal(getStyleValue(getFirstTableStyle(editor), "width"), "");
  assert.deepEqual(getCellStyles(editor), [
    "width: 160px",
    "width: 35%; background-color: rgb(254, 240, 138)",
    "width: 160px",
    ""
  ]);
  assert.deepEqual(findCellPositions(editor).map(function (pos) {
    return editor.state.doc.nodeAt(pos).attrs.colwidth;
  }), initialColwidths);
  editor.destroy();
});

await test("applyActiveTableProperties clears border color when borders are hidden", function () {
  const editor = createTableEditor("<table class=\"wiki-table-layout-fixed\" style=\"width: 720px; border-color: rgb(10, 20, 30);\"><tbody><tr><td><p>A1</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[0] + 2);
  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(applyActiveTableProperties(editor, context, {
    tableWidth: "640px",
    borderColor: "#caa55a",
    layout: "fixed",
    borderMode: "hidden"
  }), true);

  const html = editor.getHTML();
  assert.match(html, /<table[^>]*class="[^"]*\bwiki-table-borderless\b/);
  assert.match(html, /<table[^>]*style="[^"]*\bwidth:\s*640px;?[^"]*"/);
  assert.doesNotMatch(html, /border-color/);
  editor.destroy();
});

await test("table-properties dialog hides size fields and conditionally shows fixed-only controls", function () {
  const editor = createTableEditor("<table class=\"wiki-table-layout-auto wiki-table-borderless\" style=\"width: 50%; border-color: rgb(34, 23, 45);\"><tbody><tr style=\"height: 48px;\"><td><p>A1</p></td><td colwidth=\"180\"><p>B1</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[1] + 2);
  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(executeTableCommand(editor, context, "table-properties"), true);

  const dialog = document.querySelector(".wiki-editor-table-dialog");
  const tableWidthField = getDialogFieldByLabel(dialog, "Table width");
  const borderColorField = getDialogFieldByLabel(dialog, "Border color");
  const borderColorInput = borderColorField.querySelector("input[type='color']");
  const layout = getDialogFieldByLabel(dialog, "Layout").querySelector("select");
  const borderMode = getDialogFieldByLabel(dialog, "Show borders").querySelector("select");
  const fieldLabels = Array.from(dialog.querySelectorAll(".wiki-editor-dialog__field > span")).map(function (label) {
    return label.textContent;
  });

  assert.deepEqual(fieldLabels, ["Layout", "Table width", "Show borders", "Border color"]);
  assert.equal(getDialogFieldByLabel(dialog, "Current column width"), null);
  assert.equal(getDialogFieldByLabel(dialog, "Current row height"), null);
  assert.equal(tableWidthField.hidden, true);
  assert.equal(borderColorField.hidden, true);
  assert.equal(borderColorInput.value, "#22172d");

  layout.value = "fixed";
  layout.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(tableWidthField.hidden, false);

  borderMode.value = "visible";
  borderMode.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(borderColorField.hidden, false);

  document.querySelector(".wiki-editor-entity-dialog-shell").remove();
  editor.destroy();
});

await test("table-properties command opens the table properties dialog", function () {
  const editor = createTableEditor("<table><tbody><tr><td><p>A1</p></td></tr></tbody></table>");
  const positions = findCellPositions(editor);
  editor.commands.setTextSelection(positions[0] + 2);
  const context = deriveTableContext(editor, editor.view.dom);

  assert.equal(executeTableCommand(editor, context, "table-properties"), true);

  const dialog = document.querySelector(".wiki-editor-table-dialog");
  assert.equal(dialog && dialog.getAttribute("aria-label"), "Table properties");
  document.querySelector(".wiki-editor-entity-dialog-shell").remove();
  editor.destroy();

  const outsideEditor = createTableEditor("<p>Outside</p>");
  outsideEditor.commands.setTextSelection(2);
  assert.equal(executeTableCommand(outsideEditor, deriveTableContext(outsideEditor, outsideEditor.view.dom), "table-properties"), false);
  outsideEditor.destroy();
});

await test("createTableAuthoring installs sticky table row and cell popover surfaces", function () {
  const editor = createTableEditor("<table><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr></tbody></table>");
  const shell = createEditorShell(editor);
  const originalDispatch = editor.view.dispatch;
  const authoring = createTableAuthoring(shell, editor);

  editor.commands.setTextSelection(5);
  editor.view.dispatch(editor.state.tr.scrollIntoView());

  const sticky = shell.querySelector(".wiki-editor-table-sticky-row");
  const popover = shell.querySelector(".wiki-editor-table-cell-popover");
  assert(sticky, "sticky table row should be installed");
  assert(popover, "cell popover should be installed");
  assert.equal(editor.view.dom.querySelector(".wiki-editor-table-sticky-row"), null);
  assert.equal(editor.view.dom.querySelector(".wiki-editor-table-cell-popover"), null);
  assert.equal(editor.view.dispatch, originalDispatch);
  assert.equal(sticky.getAttribute("role"), "toolbar");
  assert.equal(sticky.getAttribute("aria-label"), "Table tools");
  assert.equal(popover.getAttribute("role"), "toolbar");
  assert.equal(popover.getAttribute("aria-label"), "Selected cell formatting");
  assert.equal(sticky.hidden, false);
  assert.equal(popover.hidden, false);
  assert(sticky.querySelector("[data-table-command-id='table-properties'][aria-label='Table properties']"));
  const backgroundInput = popover.querySelector("[data-table-command-id='table-cell-background'] input[type='color'][aria-label='Cell background']");
  assert(backgroundInput);
  assert(popover.querySelector("[data-table-command-id='table-cell-text-color'] input[type='color'][aria-label='Cell text color']"));

  backgroundInput.value = "#dbeafe";
  backgroundInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.match(editor.getHTML(), /<td[^>]*style="[^"]*\bbackground-color:\s*rgb\(219,\s*234,\s*254\)/);

  const verticalMiddleButton = popover.querySelector("[data-table-command-id='table-cell-valign-middle']");
  assert(verticalMiddleButton);
  verticalMiddleButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.match(editor.getHTML(), /<td[^>]*style="[^"]*\bvertical-align:\s*middle;?[^"]*"/);

  authoring.destroy();
  assert.equal(shell.querySelector(".wiki-editor-table-sticky-row"), null);
  assert.equal(shell.querySelector(".wiki-editor-table-cell-popover"), null);
  assert.equal(editor.view.dispatch, originalDispatch);
  editor.destroy();
  shell.remove();
});

await test("inactive sticky table row reserves layout space to avoid selection jumps", async function () {
  const editor = createTableEditor("<p>Before table</p><table><tbody><tr><td><p>A1</p></td></tr></tbody></table><p>After table</p>");
  const shell = createEditorShell(editor);

  editor.commands.setTextSelection(2);
  const authoring = createTableAuthoring(shell, editor);
  const sticky = shell.querySelector(".wiki-editor-table-sticky-row");

  assert(sticky, "sticky table row should be installed");
  assert.equal(sticky.hidden, false);
  assert.equal(sticky.classList.contains("wiki-editor-table-sticky-row--inactive"), true);
  assert.equal(sticky.getAttribute("aria-hidden"), "true");
  assert.equal(Array.from(sticky.querySelectorAll("button")).every(function (button) {
    return button.disabled;
  }), true);

  editor.commands.setTextSelection(findCellPositions(editor)[0] + 2);
  editor.view.dispatch(editor.state.tr);
  await nextFrame();
  assert.equal(sticky.classList.contains("wiki-editor-table-sticky-row--inactive"), false);
  assert.equal(sticky.getAttribute("aria-hidden"), "false");

  authoring.destroy();
  editor.destroy();
  shell.remove();
});

await test("auto layout disables direct table width dragging", async function () {
  const editor = createTableEditor("<table class=\"wiki-table-layout-auto\" style=\"border-color: rgb(10, 20, 30);\"><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr></tbody></table>");
  const shell = createEditorShell(editor);
  const authoring = createTableAuthoring(shell, editor);

  shell.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 640, height: 320, right: 640, bottom: 320 };
  };
  const table = editor.view.dom.querySelector("table");
  const row = editor.view.dom.querySelector("tr");
  table.getBoundingClientRect = function () {
    return { left: 20, top: 40, width: 360, height: 80, right: 380, bottom: 120 };
  };
  row.getBoundingClientRect = function () {
    return { left: 20, top: 40, width: 360, height: 40, right: 380, bottom: 80 };
  };

  editor.commands.setTextSelection(5);
  editor.view.dispatch(editor.state.tr.scrollIntoView());
  await nextFrame();

  const widthHandle = shell.querySelector(".wiki-editor-table-resize-handle--width");
  const rowHandle = shell.querySelector(".wiki-editor-table-resize-handle--row");
  assert(widthHandle, "table width resize handle should be installed");
  assert(rowHandle, "row resize handle should be installed");
  assert.equal(widthHandle.hidden, true);
  assert.equal(rowHandle.hidden, false);

  widthHandle.dispatchEvent(new window.PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    clientX: 380,
    clientY: 60
  }));
  window.dispatchEvent(new window.PointerEvent("pointermove", {
    bubbles: true,
    clientX: 520,
    clientY: 60
  }));
  window.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true }));

  assert.equal(getStyleValue(getFirstTableStyle(editor), "width"), "");

  authoring.destroy();
  editor.destroy();
  shell.remove();
});

await test("createTableAuthoring coalesces a burst of editor events into one geometry pass", function () {
  const realRaf = globalThis.requestAnimationFrame;
  const realCaf = globalThis.cancelAnimationFrame;
  const queue = [];
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: function (cb) {
      queue.push(cb);
      return queue.length;
    }
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true,
    value: function (id) {
      if (id) {
        queue[id - 1] = null;
      }
    }
  });

  try {
    const editor = createTableEditor("<table><tbody><tr><td><p>A1</p></td><td><p>B1</p></td></tr></tbody></table>");
    const shell = createEditorShell(editor);
    let rectReads = 0;
    shell.getBoundingClientRect = function () {
      rectReads += 1;
      return { left: 0, top: 0, width: 640, height: 320, right: 640, bottom: 320 };
    };
    const authoring = createTableAuthoring(shell, editor); // synchronous initial update()

    // Activate the table and fire several editor events in one tick.
    editor.commands.setTextSelection(5);
    editor.view.dispatch(editor.state.tr);
    editor.view.dispatch(editor.state.tr);

    const pending = queue.filter(Boolean);
    assert.equal(pending.length, 1, "a burst of synchronous events should schedule exactly one frame");

    rectReads = 0;
    pending[0]();
    assert(rectReads >= 1, "the single coalesced frame should run one update() geometry pass");

    authoring.destroy();
    editor.destroy();
    shell.remove();
  } finally {
    Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: realRaf });
    Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: realCaf });
  }
});

await test("positionContextPanel skips the style write when geometry is unchanged", function () {
  let writes = 0;
  let left = "";
  let top = "";
  const panel = {
    offsetWidth: 120,
    offsetHeight: 40,
    style: {
      get left() { return left; },
      set left(value) { left = value; writes += 1; },
      get top() { return top; },
      set top(value) { top = value; writes += 1; }
    }
  };
  const surface = { getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 400 }; } };
  const target = { getBoundingClientRect() { return { left: 40, top: 60, width: 100, height: 30, right: 140, bottom: 90 }; } };

  positionContextPanel(panel, target, surface, { placement: "bottom" });
  assert.equal(writes, 2, "first positioning writes left and top");

  positionContextPanel(panel, target, surface, { placement: "bottom" });
  assert.equal(writes, 2, "unchanged geometry should not write again");

  target.getBoundingClientRect = function () {
    return { left: 80, top: 60, width: 100, height: 30, right: 180, bottom: 90 };
  };
  positionContextPanel(panel, target, surface, { placement: "bottom" });
  assert.equal(writes, 4, "a moved target writes again");
});
