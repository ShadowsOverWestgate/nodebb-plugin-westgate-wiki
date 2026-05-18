import { NodeSelection } from "@tiptap/pm/state";

import {
  getSelectedMediaCellPositions,
  setMediaCellSelection,
  toggleMediaCellSelectionAt
} from "./media-cell-selection.mjs";
import { getImageLayoutClassForNode, getImageSizeClassForNode } from "../shared/image-class-contract.mjs";

export function getActiveImageNodeName(editor) {
  if (editor.isActive("imageFigure")) {
    return "imageFigure";
  }
  if (editor.isActive("image")) {
    return "image";
  }
  return "";
}

export function findNodeSelectionPos(editor, domNode, typeNames) {
  if (!editor || !domNode) {
    return null;
  }

  const names = new Set(typeNames || []);
  const rootPos = editor.view.posAtDOM(domNode, 0);
  const clampedPos = Math.max(0, Math.min(rootPos, editor.state.doc.content.size));
  const directNode = editor.state.doc.nodeAt(clampedPos);
  if (directNode && names.has(directNode.type.name)) {
    return clampedPos;
  }

  const previousNode = clampedPos > 0 ? editor.state.doc.nodeAt(clampedPos - 1) : null;
  if (previousNode && names.has(previousNode.type.name)) {
    return clampedPos - 1;
  }

  const $pos = editor.state.doc.resolve(clampedPos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (names.has($pos.node(depth).type.name)) {
      return $pos.before(depth);
    }
  }

  return null;
}

export function selectClickedImageNode(editor, target, editorMount) {
  if (!editor || !target || typeof target.closest !== "function") {
    return false;
  }

  const caption = target.closest("figcaption");
  if (caption && editorMount && editorMount.contains(caption)) {
    return false;
  }

  const imageFigure = target.closest('[data-wiki-node="image-figure"]');
  const figureImage = target.closest('[data-wiki-node="image-figure"] img');
  const imageNode = target.closest('img[data-wiki-node="image"]');
  const plainImage = target.tagName && target.tagName.toLowerCase() === "img" ? target : null;
  const clickedFigureSurface = imageFigure && target === imageFigure;
  const selectableNode = imageFigure && (figureImage || clickedFigureSurface) ? imageFigure : (imageNode || plainImage);
  if (!selectableNode || (editorMount && !editorMount.contains(selectableNode))) {
    return false;
  }

  const selectionPos = findNodeSelectionPos(editor, selectableNode, ["imageFigure", "image"]);
  if (selectionPos == null) {
    return false;
  }

  return editor.chain().focus().setNodeSelection(selectionPos).run();
}

export function selectInfoboxImageSlot(editor, target, editorMount) {
  if (!editor || !target || typeof target.closest !== "function") {
    return false;
  }

  const slot = target.closest('figure[data-wiki-infobox-part="image"], figure.wiki-infobox__image');
  if (!slot || (editorMount && !editorMount.contains(slot))) {
    return false;
  }

  const selectionPos = findNodeSelectionPos(editor, slot, ["wikiInfoboxImage"]);
  if (selectionPos == null) {
    return false;
  }

  return editor.chain().focus().setNodeSelection(selectionPos).run();
}

function isEffectivelyEmptyMediaCell(cellElement) {
  if (!cellElement) {
    return false;
  }

  if (String(cellElement.textContent || "").trim()) {
    return false;
  }

  return !cellElement.querySelector("img, figure, table, ul, ol, blockquote, pre, h1, h2, h3, h4, hr");
}

function hasOnlyDirectMediaRows(cellElement) {
  const children = Array.from(cellElement && cellElement.children || []);
  if (!children.length) {
    return false;
  }

  return children.every(function (child) {
    return child.matches && child.matches('[data-wiki-node="media-row"], .wiki-media-row');
  });
}

export function isMediaCellSurfaceTarget(cellElement, target) {
  if (!cellElement || !target) {
    return false;
  }

  if (target === cellElement) {
    return true;
  }

  return target.parentElement === cellElement &&
    target.matches &&
    target.matches('[data-wiki-node="media-row"], .wiki-media-row');
}

function getSiblingMediaCellPositions(editor, cellElement) {
  const row = cellElement && cellElement.closest('[data-wiki-node="media-row"]');
  return Array.from(row ? row.querySelectorAll('[data-wiki-node="media-cell"]') : [])
    .map(function (cell) {
      return findNodeSelectionPos(editor, cell, ["mediaCell"]);
    })
    .filter(function (pos) {
      return pos != null;
    });
}

export function handleMediaCellSelectionClick(editor, cellElement, event) {
  if (!editor || !cellElement || !event) {
    return false;
  }

  const pos = findNodeSelectionPos(editor, cellElement, ["mediaCell"]);
  if (pos == null) {
    return false;
  }

  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    event.stopPropagation();
    const tr = toggleMediaCellSelectionAt(editor.state.tr, pos);
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  }

  if (event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    const rowPositions = getSiblingMediaCellPositions(editor, cellElement);
    const selected = getSelectedMediaCellPositions(editor.state);
    const anchor = selected.length ? selected[selected.length - 1] : rowPositions[0];
    const start = rowPositions.indexOf(anchor);
    const end = rowPositions.indexOf(pos);
    const positions = start === -1 || end === -1 ?
      [pos] :
      rowPositions.slice(Math.min(start, end), Math.max(start, end) + 1);
    const tr = setMediaCellSelection(editor.state.tr, positions, anchor);
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  }

  return false;
}

export function focusMediaCell(editor, cellElement) {
  if (!editor || !cellElement) {
    return false;
  }

  if (hasOnlyDirectMediaRows(cellElement)) {
    const selectionPos = findNodeSelectionPos(editor, cellElement, ["mediaCell"]);
    if (selectionPos == null) {
      return false;
    }
    return editor.chain().focus().setNodeSelection(selectionPos).run();
  }

  if (!isEffectivelyEmptyMediaCell(cellElement)) {
    return false;
  }

  const rootPos = editor.view.posAtDOM(cellElement, 0);
  const clampedPos = Math.max(0, Math.min(rootPos, editor.state.doc.content.size));
  const $pos = editor.state.doc.resolve(clampedPos);

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "mediaCell") {
      return editor.chain().focus().setTextSelection($pos.start(depth)).run();
    }
  }

  return false;
}

export function setSelectedImageLayout(editor, layout) {
  const nodeName = getActiveImageNodeName(editor);
  if (!nodeName) {
    return false;
  }

  const nextClass = getImageLayoutClassForNode(nodeName, editor.getAttributes(nodeName).class || "", layout);
  return editor.chain().focus().updateAttributes(nodeName, { class: nextClass }).run();
}

export function isImageLayoutActive(editor, layout) {
  const nodeName = getActiveImageNodeName(editor);
  if (!nodeName) {
    return false;
  }

  const className = String(editor.getAttributes(nodeName).class || "");
  if (nodeName === "imageFigure") {
    return {
      center: className.includes("image-style-block"),
      left: className.includes("image-style-align-left"),
      right: className.includes("image-style-align-right"),
      side: className.includes("image-style-side")
    }[layout] || false;
  }

  return {
    center: className.includes("wiki-image-align-center"),
    left: className.includes("wiki-image-align-left"),
    right: className.includes("wiki-image-align-right"),
    side: className.includes("wiki-image-align-side")
  }[layout] || false;
}

export function setSelectedImageSize(editor, size) {
  const nodeName = getActiveImageNodeName(editor);
  if (!nodeName) {
    return false;
  }

  const nextClass = getImageSizeClassForNode(nodeName, editor.getAttributes(nodeName).class || "", size);
  return editor.chain().focus().updateAttributes(nodeName, { class: nextClass }).run();
}

export function isImageSizeActive(editor, size) {
  const nodeName = getActiveImageNodeName(editor);
  if (!nodeName) {
    return false;
  }

  const className = String(editor.getAttributes(nodeName).class || "");
  return {
    sm: className.includes("wiki-image-size-sm"),
    md: className.includes("wiki-image-size-md"),
    lg: className.includes("wiki-image-size-lg"),
    full: className.includes("wiki-image-size-full")
  }[size] || false;
}
