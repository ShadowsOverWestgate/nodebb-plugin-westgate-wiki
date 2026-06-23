export function getSelectionElement(editor) {
  if (!editor || !editor.view || !editor.state || !editor.state.selection) {
    return null;
  }

  const domAtPos = editor.view.domAtPos(editor.state.selection.from);
  const node = domAtPos && domAtPos.node;
  if (!node) {
    return null;
  }

  return node.nodeType === 1 ? node : node.parentElement;
}

export function getActiveTableElement(editor, surface) {
  const selectionElement = getSelectionElement(editor);
  const table = selectionElement && typeof selectionElement.closest === "function" ? selectionElement.closest("table") : null;
  return table && (!surface || surface.contains(table)) ? table : null;
}

export function getActiveTableRowElement(editor, table) {
  const selectionElement = getSelectionElement(editor);
  const row = selectionElement && typeof selectionElement.closest === "function" ? selectionElement.closest("tr") : null;
  return row && table && table.contains(row) ? row : null;
}

export function getActiveTableCellElement(editor, table) {
  const selectionElement = getSelectionElement(editor);
  const cell = selectionElement && typeof selectionElement.closest === "function" ? selectionElement.closest("td, th") : null;
  return cell && table && table.contains(cell) ? cell : null;
}

export function getTableNodePosition(editor, element) {
  if (!editor || !element || !editor.view || typeof editor.view.posAtDOM !== "function") {
    return null;
  }

  const pos = editor.view.posAtDOM(element, 0) - 1;
  return pos >= 0 && editor.state.doc.nodeAt(pos) ? pos : null;
}

export function setStyleValue(styleText, propertyName, value) {
  const probe = document.createElement("div");
  probe.setAttribute("style", String(styleText || ""));
  if (value) {
    probe.style.setProperty(propertyName, value);
  } else {
    probe.style.removeProperty(propertyName);
  }
  return (probe.getAttribute("style") || "").replace(/;\s*$/, "");
}

export function getStyleValue(styleText, propertyName) {
  const probe = document.createElement("div");
  probe.setAttribute("style", String(styleText || ""));
  return probe.style.getPropertyValue(propertyName).trim();
}

export function setClassToken(className, token, enabled) {
  const tokens = new Set(String(className || "").split(/\s+/).filter(Boolean));
  if (enabled) {
    tokens.add(token);
  } else {
    tokens.delete(token);
  }
  return Array.from(tokens).join(" ");
}

export function updateNodeAttributesAtPos(editor, pos, attrs, options) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) {
    return false;
  }

  const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
    ...node.attrs,
    ...attrs
  }, node.marks);
  editor.view.dispatch(options && options.scroll === false ? tr : tr.scrollIntoView());
  return true;
}

export function updateNodeStyleAtPos(editor, pos, fallbackStyle, updateStyle, options) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) {
    return false;
  }

  const style = updateStyle(node.attrs.style || fallbackStyle || "");
  return updateNodeAttributesAtPos(editor, pos, { style: style || null }, options);
}

export function positionContextPanel(panel, targetEl, surface, options) {
  const surfaceRect = surface.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const panelWidth = panel.offsetWidth || 320;
  const panelHeight = panel.offsetHeight || 40;
  const avoidTop = options && Number.isFinite(options.avoidTop) ? Math.max(8, options.avoidTop - 8) : 8;
  const left = Math.max(8, Math.min(targetRect.left - surfaceRect.left, surfaceRect.width - panelWidth - 8));
  const preferredTop = options && options.placement === "bottom"
    ? targetRect.bottom - surfaceRect.top + 8
    : targetRect.top - surfaceRect.top - panelHeight - 8;
  const maxTop = Math.max(8, surfaceRect.height - panelHeight - 8);
  const top = Math.max(avoidTop, Math.min(preferredTop, maxTop));
  const leftPx = `${left}px`;
  const topPx = `${top}px`;
  // Skip the write when unchanged: avoids needless invalidation that can
  // re-trigger the fullscreen reposition/scroll loop. Inline-style reads don't
  // force reflow.
  if (panel.style.left === leftPx && panel.style.top === topPx) {
    return;
  }
  panel.style.left = leftPx;
  panel.style.top = topPx;
}
