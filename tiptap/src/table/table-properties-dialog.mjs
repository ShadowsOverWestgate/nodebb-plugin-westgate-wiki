import {
  getStyleValue,
  getTableNodePosition,
  setClassToken,
  setStyleValue
} from "./table-dom.mjs";

function createDialogField(labelText, input) {
  const label = document.createElement("label");
  label.className = "wiki-editor-dialog__field";
  const text = document.createElement("span");
  text.textContent = labelText;
  label.appendChild(text);
  label.appendChild(input);
  return label;
}

function setNodeAttrsOnTransaction(tr, editor, pos, attrs) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) {
    return false;
  }

  tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    ...attrs
  }, node.marks);
  return true;
}

function isTableCellNode(node) {
  return node && (node.type.name === "tableCell" || node.type.name === "tableHeader");
}

function clearTableColumnWidths(tr, editor, tablePos) {
  const tableNode = editor.state.doc.nodeAt(tablePos);
  if (!tableNode) {
    return false;
  }

  let changed = false;
  tableNode.descendants(function (node, pos) {
    if (!isTableCellNode(node)) {
      return;
    }

    const style = setStyleValue(node.attrs.style || "", "width", "");
    changed = setNodeAttrsOnTransaction(tr, editor, tablePos + 1 + pos, {
      style: style || null,
      colwidth: null
    }) || changed;
  });
  return changed;
}

function syncTableElementAttributes(table, attrs) {
  if (!table) {
    return;
  }

  const className = String(attrs.class || "").trim();
  if (className) {
    table.setAttribute("class", className);
  } else {
    table.removeAttribute("class");
  }

  const style = String(attrs.style || "").trim();
  const minWidth = table.style.minWidth;
  if (style) {
    table.setAttribute("style", style);
  } else {
    table.removeAttribute("style");
  }
  if (minWidth && !getStyleValue(style, "min-width")) {
    table.style.minWidth = minWidth;
  }
}

function setBorderColorValue(style, value) {
  const probe = document.createElement("div");
  probe.setAttribute("style", String(style || ""));
  if (value) {
    probe.style.setProperty("border-color", value);
  } else {
    [
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
      "border-color"
    ].forEach(function (propertyName) {
      probe.style.removeProperty(propertyName);
    });
  }
  return (probe.getAttribute("style") || "").replace(/;\s*$/, "");
}

function colorValueToInputHex(value, fallback) {
  const normalized = String(value || "").trim();
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1].toLowerCase();
    return raw.length === 3
      ? `#${raw.split("").map(function (part) { return part + part; }).join("")}`
      : `#${raw}`;
  }

  const rgb = normalized.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) {
    return `#${rgb.slice(1, 4).map(function (channel) {
      return Math.max(0, Math.min(255, parseInt(channel, 10) || 0))
        .toString(16)
        .padStart(2, "0");
    }).join("")}`;
  }

  return fallback;
}

export function applyActiveTableProperties(editor, context, values) {
  const table = context && context.activeTableElement;
  if (!editor || !table) {
    return false;
  }

  const tablePos = Number.isFinite(context.activeTablePos)
    ? context.activeTablePos
    : getTableNodePosition(editor, table);
  if (tablePos == null) {
    return false;
  }

  let tr = editor.state.tr;
  let changed = false;
  const tableAttrs = context.tableAttrs || {};
  const layout = values.layout === "auto" ? "auto" : "fixed";
  const borderMode = values.borderMode === "hidden" ? "hidden" : "visible";
  const previousClassName = tableAttrs.class || table.getAttribute("class") || "";
  const wasAutoLayout = String(previousClassName).includes("wiki-table-layout-auto");
  let style = tableAttrs.style || table.getAttribute("style") || "";
  style = setStyleValue(style, "width", layout === "fixed" ? values.tableWidth : "");
  style = setBorderColorValue(style, borderMode === "visible" ? values.borderColor : "");

  let className = setClassToken(
    previousClassName,
    "wiki-table-borderless",
    borderMode === "hidden"
  );
  className = setClassToken(className, "wiki-table-layout-auto", layout === "auto");
  className = setClassToken(className, "wiki-table-layout-fixed", layout === "fixed");

  const nextTableAttrs = {
    class: className || null,
    style: style || null
  };
  changed = setNodeAttrsOnTransaction(tr, editor, tablePos, nextTableAttrs) || changed;

  if (layout === "auto" && !wasAutoLayout) {
    changed = clearTableColumnWidths(tr, editor, tablePos) || changed;
  }

  if (changed) {
    editor.view.dispatch(tr);
    syncTableElementAttributes(table, nextTableAttrs);
  }

  return true;
}

export function openTablePropertiesDialog({ editor, context }) {
  const table = context && context.activeTableElement;
  if (!editor || !table) {
    return false;
  }

  const existing = document.querySelector(".wiki-editor-entity-dialog-shell");
  if (existing) {
    existing.remove();
  }

  const shell = document.createElement("div");
  shell.className = "wiki-editor-entity-dialog-shell";
  const dialog = document.createElement("div");
  dialog.className = "wiki-editor-entity-dialog wiki-editor-table-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Table properties");
  shell.appendChild(dialog);

  const title = document.createElement("h2");
  title.className = "wiki-editor-entity-dialog__title";
  title.textContent = "Table properties";
  dialog.appendChild(title);

  const form = document.createElement("form");
  form.className = "wiki-editor-entity-dialog__form";
  dialog.appendChild(form);

  const attrs = context.tableAttrs || editor.getAttributes("table") || {};
  const layout = document.createElement("select");
  layout.className = "form-select form-select-sm";
  [["fixed", "Fixed layout"], ["auto", "Auto layout"]].forEach(function ([value, label]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    layout.appendChild(option);
  });
  layout.value = String(attrs.class || "").includes("wiki-table-layout-auto") ? "auto" : "fixed";
  form.appendChild(createDialogField("Layout", layout));

  const tableWidth = document.createElement("input");
  tableWidth.className = "form-control form-control-sm";
  tableWidth.placeholder = "100%, 32rem, auto";
  tableWidth.value = getStyleValue(attrs.style, "width") || "100%";
  const tableWidthField = createDialogField("Table width", tableWidth);
  form.appendChild(tableWidthField);

  const borderMode = document.createElement("select");
  borderMode.className = "form-select form-select-sm";
  [["visible", "Show borders"], ["hidden", "Hide borders"]].forEach(function ([value, label]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    borderMode.appendChild(option);
  });
  borderMode.value = String(attrs.class || "").includes("wiki-table-borderless") ? "hidden" : "visible";
  form.appendChild(createDialogField("Show borders", borderMode));

  const borderColor = document.createElement("input");
  borderColor.type = "color";
  borderColor.className = "form-control form-control-color";
  borderColor.value = colorValueToInputHex(
    getStyleValue(attrs.style, "border-color") || getStyleValue(table.getAttribute("style"), "border-color"),
    "#caa55a"
  );
  const borderColorField = createDialogField("Border color", borderColor);
  form.appendChild(borderColorField);

  function syncConditionalFields() {
    tableWidthField.hidden = layout.value !== "fixed";
    tableWidth.disabled = tableWidthField.hidden;
    borderColorField.hidden = borderMode.value !== "visible";
    borderColor.disabled = borderColorField.hidden;
  }

  layout.addEventListener("change", syncConditionalFields);
  borderMode.addEventListener("change", syncConditionalFields);
  syncConditionalFields();

  const actions = document.createElement("div");
  actions.className = "wiki-editor-entity-dialog__actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn btn-link btn-sm";
  cancel.textContent = "Cancel";
  const apply = document.createElement("button");
  apply.type = "submit";
  apply.className = "btn btn-primary btn-sm";
  apply.textContent = "Apply";
  actions.appendChild(cancel);
  actions.appendChild(apply);
  form.appendChild(actions);

  function close() {
    shell.remove();
    editor.commands.focus(null, { scrollIntoView: false });
  }

  cancel.addEventListener("click", close);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    applyActiveTableProperties(editor, context, {
      tableWidth: layout.value === "fixed" ? tableWidth.value.trim() : "",
      borderColor: borderMode.value === "visible" ? borderColor.value : "",
      layout: layout.value,
      borderMode: borderMode.value
    });
    close();
  });

  document.body.appendChild(shell);
  layout.focus();
  return true;
}
