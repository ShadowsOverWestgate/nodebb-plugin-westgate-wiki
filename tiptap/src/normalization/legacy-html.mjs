import { ALLOWED_IMAGE_FIGURE_CLASSES, normalizeClassTokens, removeClassTokens } from "../shared/image-class-contract.mjs";
import { getMergedAttrsForElement, hasPreservedAttrs } from "../shared/preserved-attrs.mjs";
import { sanitizeStyleAttribute } from "../shared/sanitizer-contract.mjs";

export const SUPPORTED_TIPTAP_TAGS = new Set([
  "a",
  "article",
  "aside",
  "blockquote",
  "br",
  "col",
  "colgroup",
  "code",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "img",
  "input",
  "label",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "section",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul"
]);

export function unwrapElement(element) {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  parent.removeChild(element);
}

export function replaceElement(element, replacement) {
  const parent = element.parentNode;
  if (!parent) {
    return;
  }

  parent.replaceChild(replacement, element);
}

export function renameElement(document, element, tagName) {
  const replacement = document.createElement(tagName);
  Array.from(element.attributes || []).forEach(function (attr) {
    replacement.setAttribute(attr.name, attr.value);
  });

  while (element.firstChild) {
    replacement.appendChild(element.firstChild);
  }

  replaceElement(element, replacement);
}

export function wrapNodeWithElement(document, node, tagName, attrs) {
  const wrapper = document.createElement(tagName);
  Object.entries(attrs || {}).forEach(function ([key, value]) {
    if (value != null && value !== "") {
      wrapper.setAttribute(key, value);
    }
  });
  if (node.parentNode) {
    node.parentNode.replaceChild(wrapper, node);
  }
  wrapper.appendChild(node);
  return wrapper;
}

export function moveElementBefore(element, reference) {
  if (!element || !reference || !reference.parentNode) {
    return;
  }
  reference.parentNode.insertBefore(element, reference);
}

function createEntitySpan(document, entityType, text, attrs) {
  const span = document.createElement("span");
  span.className = `wiki-entity wiki-entity--${entityType}`;
  span.setAttribute("data-wiki-entity", entityType);
  Object.entries(attrs || {}).forEach(function ([key, value]) {
    if (value) {
      span.setAttribute(key, value);
    }
  });
  span.textContent = text;
  return span;
}

function isProtectedInlineSyntaxParent(node) {
  const parent = node && node.parentElement;
  return !!(parent && parent.closest("a, code, pre, script, style, textarea, template, [data-wiki-entity]"));
}

function appendTextAndEntityParts(document, parent, text, regex, buildEntity) {
  regex.lastIndex = 0;
  let cursor = 0;
  let match;
  let changed = false;
  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(cursor, match.index);
    if (before) {
      parent.appendChild(document.createTextNode(before));
    }
    parent.appendChild(buildEntity(match));
    cursor = match.index + match[0].length;
    changed = true;
  }
  if (!changed) {
    return false;
  }
  const rest = text.slice(cursor);
  if (rest) {
    parent.appendChild(document.createTextNode(rest));
  }
  return true;
}

function normalizeLegacyWikiInlineSyntax(document, root) {
  const nodeFilter = document.defaultView && document.defaultView.NodeFilter;
  const walker = document.createTreeWalker(root, nodeFilter ? nodeFilter.SHOW_TEXT : 4);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (!isProtectedInlineSyntaxParent(node)) {
      nodes.push(node);
    }
  }

  nodes.forEach(function (textNode) {
    const text = textNode.nodeValue || "";
    if (!/(\[\[|@\w|\(\()/.test(text)) {
      return;
    }

    const footnotePass = document.createDocumentFragment();
    const footnoteChanged = appendTextAndEntityParts(
      document,
      footnotePass,
      text,
      /\(\(([^()[\]](?:[^()]|\([^)]*\))*?)\)\)/g,
      function (match) {
        return createEntitySpan(document, "footnote", "[note]", {
          "data-wiki-footnote": match[1].trim()
        });
      }
    );
    if (!footnoteChanged) {
      footnotePass.appendChild(document.createTextNode(text));
    }

    const wikiPass = document.createDocumentFragment();
    Array.from(footnotePass.childNodes).forEach(function (part) {
      if (part.nodeType !== 3) {
        wikiPass.appendChild(part);
        return;
      }
      const parts = document.createDocumentFragment();
      const changed = appendTextAndEntityParts(
        document,
        parts,
        part.nodeValue || "",
        /\[\[([^[\]|]+(?:\/[^[\]|]+)*|ns:[^[\]|]+)(?:\|([^[\]]+))?\]\]/g,
        function (match) {
          const rawTarget = match[1].trim();
          const isNamespace = /^ns:/i.test(rawTarget);
          const target = isNamespace ? rawTarget.replace(/^ns:/i, "").trim() : rawTarget;
          const label = (match[2] || target.split("/").pop() || target).trim();
          return createEntitySpan(document, isNamespace ? "namespace" : "page", label, {
            "data-wiki-target": target,
            "data-wiki-label": label
          });
        }
      );
      if (changed) {
        while (parts.firstChild) {
          wikiPass.appendChild(parts.firstChild);
        }
      } else {
        wikiPass.appendChild(part);
      }
    });

    const mentionPass = document.createDocumentFragment();
    Array.from(wikiPass.childNodes).forEach(function (part) {
      if (part.nodeType !== 3) {
        mentionPass.appendChild(part);
        return;
      }
      const parts = document.createDocumentFragment();
      const changed = appendTextAndEntityParts(
        document,
        parts,
        part.nodeValue || "",
        /(^|[^\w@./:+-])@([A-Za-z0-9][A-Za-z0-9_-]{0,38})(?=$|[^A-Za-z0-9_-])/g,
        function (match) {
          const fragment = document.createDocumentFragment();
          if (match[1]) {
            fragment.appendChild(document.createTextNode(match[1]));
          }
          fragment.appendChild(createEntitySpan(document, "user", `@${match[2]}`, {
            "data-wiki-username": match[2],
            "data-wiki-userslug": match[2].toLowerCase()
          }));
          return fragment;
        }
      );
      if (changed) {
        while (parts.firstChild) {
          mentionPass.appendChild(parts.firstChild);
        }
      } else {
        mentionPass.appendChild(part);
      }
    });

    textNode.parentNode.replaceChild(mentionPass, textNode);
  });
}

export function isPlainWrapperElement(element) {
  if (!element || !element.tagName) {
    return false;
  }

  if (element.getAttribute("data-root") === "1") {
    return false;
  }

  const attrs = element.getAttributeNames().filter(function (name) {
    return !name.startsWith("data-");
  });

  if (attrs.length > 0) {
    return false;
  }

  return !element.classList || element.classList.length === 0;
}

export function hasBlockDescendantChildren(element) {
  return Array.from(element.children || []).some(function (child) {
    const tag = child.tagName.toLowerCase();
    return [
      "article",
      "blockquote",
      "div",
      "dl",
      "figure",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "ol",
      "p",
      "pre",
      "section",
      "table",
      "ul"
    ].includes(tag);
  });
}

function isPoetryQuoteFigure(element) {
  return !!(
    element &&
    element.tagName &&
    element.tagName.toLowerCase() === "figure" &&
    (
      element.getAttribute("data-wiki-node") === "poetry-quote" ||
      (element.classList && element.classList.contains("wiki-poetry-quote"))
    )
  );
}

function isPluginOwnedInfoboxElement(element) {
  if (!element || !element.matches) {
    return false;
  }

  return element.matches('[data-wiki-node="infobox"], .wiki-infobox, aside.infobox');
}

function isInsideInfobox(element) {
  return !!(element && element.closest && element.closest('[data-wiki-node="infobox"], .wiki-infobox, aside.infobox'));
}

function isInfoboxRowsElement(element) {
  return !!(
    element &&
    element.tagName &&
    element.tagName.toLowerCase() === "dl" &&
    isInsideInfobox(element) &&
    (
      element.getAttribute("data-wiki-infobox-part") === "rows" ||
      (element.classList && element.classList.contains("wiki-infobox__rows"))
    )
  );
}

function isInfoboxRowElement(element) {
  return !!(
    element &&
    element.tagName &&
    element.tagName.toLowerCase() === "div" &&
    isInfoboxRowsElement(element.parentElement) &&
    (
      element.getAttribute("data-wiki-infobox-part") === "row" ||
      (element.classList && element.classList.contains("wiki-infobox__row"))
    )
  );
}

function isInfoboxTermElement(element) {
  return !!(
    element &&
    element.tagName &&
    element.tagName.toLowerCase() === "dt" &&
    isInfoboxRowElement(element.parentElement)
  );
}

function isInfoboxValueElement(element) {
  return !!(
    element &&
    element.tagName &&
    element.tagName.toLowerCase() === "dd" &&
    isInfoboxRowElement(element.parentElement)
  );
}

function isInfoboxImageFigureElement(element) {
  return !!(
    element &&
    element.tagName &&
    element.tagName.toLowerCase() === "figure" &&
    isInsideInfobox(element) &&
    (
      element.getAttribute("data-wiki-infobox-part") === "image" ||
      (element.classList && element.classList.contains("wiki-infobox__image"))
    )
  );
}

function isSupportedInfoboxImageFigure(element) {
  if (!isInfoboxImageFigureElement(element)) {
    return false;
  }

  let imageCount = 0;
  for (const child of Array.from(element.childNodes || [])) {
    if (child.nodeType === 8) {
      continue;
    }
    if (child.nodeType === 3) {
      if ((child.nodeValue || "").trim()) {
        return false;
      }
      continue;
    }
    if (child.nodeType !== 1 || child.tagName.toLowerCase() !== "img") {
      return false;
    }
    imageCount += 1;
    if (imageCount > 1) {
      return false;
    }
  }

  return true;
}

function isSupportedInfoboxRowsStructure(element) {
  if (!isInfoboxRowsElement(element)) {
    return false;
  }

  const rows = Array.from(element.children || []);
  if (!rows.length) {
    return false;
  }

  return rows.every(function (row) {
    if (!isInfoboxRowElement(row)) {
      return false;
    }
    const cells = Array.from(row.children || []);
    return (
      cells.length === 2 &&
      cells[0].tagName.toLowerCase() === "dt" &&
      cells[1].tagName.toLowerCase() === "dd"
    );
  });
}

function hasUnsupportedInfoboxRowExtra(node) {
  if (!node) {
    return false;
  }

  if (node.nodeType === 8) {
    return false;
  }

  if (node.nodeType === 3) {
    return false;
  }

  if (node.nodeType !== 1) {
    return true;
  }

  const element = node;
  const tag = element.tagName.toLowerCase();
  if (["a", "address", "code", "dd", "dt", "em", "mark", "p", "s", "span", "strong", "sub", "sup", "u"].includes(tag)) {
    return Array.from(element.childNodes || []).some(hasUnsupportedInfoboxRowExtra);
  }

  return true;
}

function detectUnsupportedInfoboxRowsBeforeNormalization(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div data-root="1">${String(html || "")}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) {
    return "";
  }

  normalizeWikiInfoboxes(root);

  for (const rows of Array.from(root.querySelectorAll('[data-wiki-infobox-part="rows"], .wiki-infobox__rows'))) {
    if (!isInfoboxRowsElement(rows)) {
      continue;
    }

    for (const child of Array.from(rows.childNodes || [])) {
      if (isInfoboxRowElement(child)) {
        continue;
      }
      if (hasUnsupportedInfoboxRowExtra(child)) {
        return "Legacy HTML uses definition rows that this Tiptap surface does not preserve safely yet.";
      }
    }

    for (const row of Array.from(rows.querySelectorAll(':scope > [data-wiki-infobox-part="row"], :scope > .wiki-infobox__row'))) {
      for (const child of Array.from(row.childNodes || [])) {
        if (hasUnsupportedInfoboxRowExtra(child)) {
          return "Legacy HTML uses definition rows that this Tiptap surface does not preserve safely yet.";
        }
      }
    }
  }

  return "";
}

function appendInfoboxInlineChildren(document, target, source) {
  Array.from(source.childNodes || []).forEach(function (child) {
    if (child.nodeType === 1) {
      const tag = child.tagName.toLowerCase();
      if (["address", "article", "blockquote", "div", "dl", "figure", "h1", "h2", "h3", "h4", "hr", "ol", "p", "pre", "section", "table", "ul"].includes(tag)) {
        appendInfoboxInlineChildren(document, target, child);
        return;
      }
    }
    target.appendChild(child);
  });
}

function hasVisibleInfoboxNode(node) {
  if (!node) {
    return false;
  }
  if (node.nodeType === 3) {
    return !!String(node.nodeValue || "").trim();
  }
  if (node.nodeType === 1) {
    return !!String(node.textContent || "").trim();
  }
  return false;
}

function appendInfoboxCellSeparator(document, target) {
  if (String(target.textContent || "").trim()) {
    target.appendChild(document.createTextNode(" "));
  }
}

function appendInfoboxNodeAsInline(document, target, node) {
  if (!hasVisibleInfoboxNode(node)) {
    return;
  }

  appendInfoboxCellSeparator(document, target);
  if (node.nodeType === 3) {
    target.appendChild(document.createTextNode(String(node.nodeValue || "").replace(/\s+/g, " ").trim()));
    return;
  }
  if (node.nodeType === 1) {
    appendInfoboxInlineChildren(document, target, node);
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }
}

function createInfoboxCell(document, tagName, source) {
  const cell = document.createElement(tagName);
  if (source) {
    appendInfoboxInlineChildren(document, cell, source);
  }
  return cell;
}

function repairInfoboxRow(document, row) {
  const children = Array.from(row.children || []);
  const term = children.find(function (child) {
    return child.tagName && child.tagName.toLowerCase() === "dt";
  }) || null;
  const value = children.find(function (child) {
    return child.tagName && child.tagName.toLowerCase() === "dd";
  }) || null;
  const extras = Array.from(row.childNodes || []).filter(function (child) {
    return child !== term && child !== value && hasVisibleInfoboxNode(child);
  });

  if (term && value) {
    extras.forEach(function (child) {
      appendInfoboxNodeAsInline(document, value, child);
    });
    Array.from(row.childNodes || []).forEach(function (child) {
      if (child !== term && child !== value && child.parentNode === row) {
        row.removeChild(child);
      }
    });
    if (term.nextSibling !== value) {
      row.insertBefore(value, term.nextSibling);
    }
    return true;
  }

  if (term) {
    const emptyValue = document.createElement("dd");
    extras.forEach(function (child) {
      appendInfoboxNodeAsInline(document, emptyValue, child);
    });
    Array.from(row.childNodes || []).forEach(function (child) {
      if (child !== term && child.parentNode === row) {
        row.removeChild(child);
      }
    });
    row.appendChild(emptyValue);
    return true;
  }

  if (value) {
    extras.forEach(function (child) {
      appendInfoboxNodeAsInline(document, value, child);
    });
    Array.from(row.childNodes || []).forEach(function (child) {
      if (child !== value && child.parentNode === row) {
        row.removeChild(child);
      }
    });
    row.insertBefore(document.createElement("dt"), value);
    return true;
  }

  if (!String(row.textContent || "").trim()) {
    return false;
  }

  const termFromContent = createInfoboxCell(document, "dt", row);
  while (row.firstChild) {
    row.removeChild(row.firstChild);
  }
  row.appendChild(termFromContent);
  row.appendChild(document.createElement("dd"));
  return true;
}

function isIgnorableInfoboxSibling(node) {
  if (!node) {
    return true;
  }
  if (node.nodeType === 8) {
    return true;
  }
  return node.nodeType === 3 && !String(node.nodeValue || "").trim();
}

function getNextSignificantInfoboxSibling(nodes, index, parent) {
  for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex += 1) {
    const next = nodes[nextIndex];
    if (!next || next.parentElement !== parent) {
      continue;
    }
    if (isIgnorableInfoboxSibling(next)) {
      continue;
    }
    return {
      index: nextIndex,
      node: next
    };
  }
  return null;
}

function normalizeInfoboxRows(document, root) {
  root.querySelectorAll('[data-wiki-infobox-part="rows"], .wiki-infobox__rows').forEach(function (rows) {
    if (!isInfoboxRowsElement(rows)) {
      return;
    }

    const children = Array.from(rows.childNodes || []);
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const tagName = child && child.tagName ? child.tagName.toLowerCase() : "";

      if (child.nodeType === 3 && hasVisibleInfoboxNode(child) && child.parentNode === rows) {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        setInfoboxPart(row, "row");
        term.textContent = String(child.nodeValue || "").replace(/\s+/g, " ").trim();
        row.appendChild(term);
        row.appendChild(document.createElement("dd"));
        rows.insertBefore(row, child);
        rows.removeChild(child);
        continue;
      }

      if (isInfoboxRowElement(child)) {
        repairInfoboxRow(document, child);
        continue;
      }

      if (!child || !["dt", "dd"].includes(tagName) || child.parentElement !== rows) {
        continue;
      }

      const next = getNextSignificantInfoboxSibling(children, index, rows);
      const row = document.createElement("div");
      setInfoboxPart(row, "row");
      rows.insertBefore(row, child);
      if (tagName === "dd") {
        row.appendChild(document.createElement("dt"));
      }
      row.appendChild(child);
      if (tagName === "dt" && next && next.node.tagName && next.node.tagName.toLowerCase() === "dd") {
        row.appendChild(next.node);
        index = next.index;
      } else if (tagName === "dt") {
        row.appendChild(document.createElement("dd"));
      }
    }
  });
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

const INFOBOX_DIRECT_LEGACY_PARTS = new Set([
  "title",
  "subtitle",
  "image",
  "section",
  "rows",
  "content"
]);

const INFOBOX_ROW_LEGACY_PARTS = new Set(["row"]);

const EXPLICIT_INFOBOX_PART_SELECTOR = [
  "[data-wiki-infobox-part]",
  ".wiki-infobox__title",
  ".wiki-infobox__subtitle",
  ".wiki-infobox__image",
  ".wiki-infobox__section",
  ".wiki-infobox__rows",
  ".wiki-infobox__row",
  ".wiki-infobox__content"
].join(", ");

function getExplicitInfoboxPartFromElement(element) {
  const explicitPart = (element.getAttribute("data-wiki-infobox-part") || "").trim();
  if (INFOBOX_PART_CLASS_MAP.has(explicitPart)) {
    return explicitPart;
  }

  const classList = element.classList ? Array.from(element.classList) : [];
  for (const className of classList) {
    if (!className.startsWith("wiki-infobox__")) {
      continue;
    }
    const part = className.replace(/^wiki-infobox__/, "");
    if (INFOBOX_PART_CLASS_MAP.has(part)) {
      return part;
    }
  }

  return "";
}

function getLegacyInfoboxPartFromElement(element, allowedParts) {
  const classList = element.classList ? Array.from(element.classList) : [];
  return classList.find(function (className) {
    return allowedParts.has(className);
  }) || "";
}

function setInfoboxPart(element, part) {
  const className = INFOBOX_PART_CLASS_MAP.get(part);
  if (!className) {
    return;
  }

  element.className = className;
  element.setAttribute("data-wiki-infobox-part", part);
}

export function normalizeWikiInfoboxes(root) {
  root.querySelectorAll("aside.infobox, aside.wiki-infobox, aside[data-wiki-node='infobox']").forEach(function (element) {
    if (!isPluginOwnedInfoboxElement(element)) {
      return;
    }

    element.className = "wiki-infobox";
    element.setAttribute("data-wiki-node", "infobox");

    Array.from(element.querySelectorAll(EXPLICIT_INFOBOX_PART_SELECTOR)).forEach(function (child) {
      const part = getExplicitInfoboxPartFromElement(child);
      if (part) {
        setInfoboxPart(child, part);
      }
    });

    Array.from(element.children || []).forEach(function (child) {
      const part = getLegacyInfoboxPartFromElement(child, INFOBOX_DIRECT_LEGACY_PARTS);
      if (part) {
        setInfoboxPart(child, part);
      }
    });

    Array.from(element.querySelectorAll('[data-wiki-infobox-part="rows"], .wiki-infobox__rows')).forEach(function (rows) {
      Array.from(rows.children || []).forEach(function (child) {
        if (getLegacyInfoboxPartFromElement(child, INFOBOX_ROW_LEGACY_PARTS)) {
          setInfoboxPart(child, "row");
        }
      });
    });
  });
}

function isInsidePluginOwnedStructure(element) {
  return !!(element && element.closest && element.closest('[data-wiki-node="alignment-table"], figure.wiki-poetry-quote, [data-wiki-node="poetry-quote"], [data-wiki-node="infobox"], .wiki-infobox'));
}

function isPluginOwnedStructuredElement(element) {
  if (!element || !element.matches) {
    return false;
  }

  return element.matches('[data-wiki-node="media-row"], [data-wiki-node="media-cell"], .wiki-media-row, .wiki-media-cell, [data-wiki-node="infobox"], .wiki-infobox');
}

export function normalizeLegacyPresentationalTags(document, root) {
  [
    ["abbr", "span"],
    ["acronym", "span"],
    ["address", "p"],
    ["b", "strong"],
    ["cite", "em"],
    ["center", "p"],
    ["del", "s"],
    ["dfn", "em"],
    ["font", "span"],
    ["i", "em"],
    ["ins", "u"],
    ["kbd", "code"],
    ["small", "span"],
    ["big", "span"],
    ["strike", "s"],
    ["tt", "code"]
  ].forEach(function ([sourceTag, targetTag]) {
    root.querySelectorAll(sourceTag).forEach(function (element) {
      if (sourceTag === "center") {
        const style = sanitizeStyleAttribute(`text-align: center; ${element.getAttribute("style") || ""}`, targetTag);
        if (style) {
          element.setAttribute("style", style);
        }
      }

      if (sourceTag === "font") {
        const styleParts = [];
        const color = (element.getAttribute("color") || "").trim();
        const face = (element.getAttribute("face") || "").trim();
        const size = (element.getAttribute("size") || "").trim();

        if (color) {
          styleParts.push(`color: ${color}`);
        }
        if (face) {
          styleParts.push(`font-family: ${face}`);
        }
        if (size) {
          const numericSize = parseInt(size, 10);
          const fontSizeMap = {
            1: "0.75rem",
            2: "0.875rem",
            3: "1rem",
            4: "1.125rem",
            5: "1.5rem",
            6: "1.875rem",
            7: "2.25rem"
          };
          if (Number.isInteger(numericSize) && fontSizeMap[numericSize]) {
            styleParts.push(`font-size: ${fontSizeMap[numericSize]}`);
          }
        }

        if (styleParts.length > 0) {
          const mergedStyle = sanitizeStyleAttribute(
            `${element.getAttribute("style") || ""}; ${styleParts.join("; ")}`,
            "span"
          );
          if (mergedStyle) {
            element.setAttribute("style", mergedStyle);
          }
        }
      }

      if (sourceTag === "small" || sourceTag === "big") {
        const sizeKeyword = sourceTag === "small" ? "smaller" : "larger";
        const mergedStyle = sanitizeStyleAttribute(
          `${element.getAttribute("style") || ""}; font-size: ${sizeKeyword}`,
          "span"
        );
        if (mergedStyle) {
          element.setAttribute("style", mergedStyle);
        }
      }

      renameElement(document, element, targetTag);
    });
  });
}

export function normalizeLegacyTableStructures(document, root) {
  root.querySelectorAll("caption").forEach(function (caption) {
    const table = caption.closest("table");
    if (!table) {
      renameElement(document, caption, "p");
      return;
    }

    const paragraph = document.createElement("p");
    paragraph.className = "wiki-legacy-table-caption";
    while (caption.firstChild) {
      paragraph.appendChild(caption.firstChild);
    }
    moveElementBefore(paragraph, table);
    caption.remove();
  });

  root.querySelectorAll("figure.table").forEach(function (figure) {
    const table = figure.querySelector(":scope > table");
    if (!table) {
      unwrapElement(figure);
      return;
    }

    const figcaption = figure.querySelector(":scope > figcaption");
    if (figcaption) {
      const paragraph = document.createElement("p");
      paragraph.className = "wiki-legacy-table-caption";
      while (figcaption.firstChild) {
        paragraph.appendChild(figcaption.firstChild);
      }
      moveElementBefore(paragraph, figure);
      figcaption.remove();
    }

    const align = (figure.getAttribute("align") || "").trim().toLowerCase();
    if (align && !table.getAttribute("style")) {
      let alignStyle = "";
      if (align === "center") {
        alignStyle = "margin-left: auto; margin-right: auto";
      } else if (align === "left") {
        alignStyle = "margin-left: 0; margin-right: auto";
      } else if (align === "right") {
        alignStyle = "margin-left: auto; margin-right: 0";
      }
      const normalizedAlign = sanitizeStyleAttribute(alignStyle, "table");
      if (normalizedAlign) {
        table.setAttribute("style", normalizedAlign);
      }
    }

    replaceElement(figure, table);
  });

  root.querySelectorAll("table").forEach(normalizeTableColgroupWidths);
}

function getPositiveIntegerAttribute(element, attrName, fallback) {
  const value = parseInt(element.getAttribute(attrName), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getPixelWidth(value) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)px$/i);
  if (!match) {
    return null;
  }
  const width = Math.round(parseFloat(match[1]));
  return Number.isFinite(width) && width > 0 ? width : null;
}

function getColgroupWidths(table) {
  const colgroup = table.querySelector(":scope > colgroup");
  if (!colgroup) {
    return [];
  }

  return Array.from(colgroup.querySelectorAll(":scope > col")).map(function (col) {
    return getPixelWidth(col.style && col.style.getPropertyValue("width") || col.getAttribute("width"));
  });
}

function getExistingColwidths(cell, colspan) {
  return String(cell.getAttribute("colwidth") || "")
    .split(",")
    .slice(0, colspan)
    .map(function (value) {
      const width = parseInt(value, 10);
      return Number.isFinite(width) && width > 0 ? width : null;
    });
}

function applyColgroupWidthsToCell(cell, colgroupWidths, columnIndex) {
  const colspan = getPositiveIntegerAttribute(cell, "colspan", 1);
  const existingColwidths = getExistingColwidths(cell, colspan);
  const nextColwidths = [];
  let hasWidth = false;

  for (let offset = 0; offset < colspan; offset += 1) {
    const width = existingColwidths[offset] || colgroupWidths[columnIndex + offset] || 0;
    nextColwidths.push(width);
    hasWidth = hasWidth || width > 0;
  }

  if (hasWidth) {
    cell.setAttribute("colwidth", nextColwidths.join(","));
  }
}

function normalizeTableColgroupWidths(table) {
  const colgroupWidths = getColgroupWidths(table);
  if (!colgroupWidths.some(function (width) {
    return Number.isFinite(width) && width > 0;
  })) {
    return;
  }

  const occupiedColumns = [];
  Array.from(table.rows || table.querySelectorAll("tr")).forEach(function (row) {
    let columnIndex = 0;
    Array.from(row.children || []).forEach(function (cell) {
      const tagName = cell.tagName ? cell.tagName.toLowerCase() : "";
      if (tagName !== "td" && tagName !== "th") {
        return;
      }

      while (occupiedColumns[columnIndex] > 0) {
        columnIndex += 1;
      }

      const colspan = getPositiveIntegerAttribute(cell, "colspan", 1);
      const rowspan = getPositiveIntegerAttribute(cell, "rowspan", 1);
      applyColgroupWidthsToCell(cell, colgroupWidths, columnIndex);
      if (rowspan > 1) {
        for (let offset = 0; offset < colspan; offset += 1) {
          const logicalColumn = columnIndex + offset;
          occupiedColumns[logicalColumn] = Math.max(occupiedColumns[logicalColumn] || 0, rowspan);
        }
      }
      columnIndex += colspan;
    });

    for (let index = 0; index < occupiedColumns.length; index += 1) {
      if (occupiedColumns[index] > 0) {
        occupiedColumns[index] -= 1;
      }
    }
  });
}

export function normalizeLegacyListTags(document, root) {
  [
    ["dir", "ul"],
    ["menu", "ul"]
  ].forEach(function ([sourceTag, targetTag]) {
    root.querySelectorAll(sourceTag).forEach(function (element) {
      renameElement(document, element, targetTag);
    });
  });
}

function elementContainsMedia(element) {
  if (!element || !element.tagName) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === "img") {
    return true;
  }

  return !!element.querySelector("img, figure.image");
}

export function normalizeLegacyMediaLayouts(document, root) {
  root.querySelectorAll("article, section, div").forEach(function (element) {
    const display = (element.style.display || "").trim().toLowerCase();
    if (!["flex", "grid", "inline-flex", "inline-grid"].includes(display)) {
      return;
    }

    const directChildren = Array.from(element.children || []).filter(function (child) {
      const tag = child.tagName.toLowerCase();
      return tag !== "script" && tag !== "style";
    });

    if (directChildren.length < 2 || directChildren.length > 4) {
      return;
    }

    if (!directChildren.some(elementContainsMedia)) {
      return;
    }

    element.removeAttribute("style");
    element.setAttribute("class", "wiki-media-row");

    directChildren.forEach(function (child) {
      const childTagName = child.tagName.toLowerCase();
      const isSupportedCellElement = ["article", "section", "div"].includes(childTagName);
      if (childTagName === "img" || isSupportedImageFigure(child) || !isSupportedCellElement) {
        const wrapper = document.createElement("div");
        wrapper.setAttribute("class", "wiki-media-cell");
        child.parentNode.replaceChild(wrapper, child);
        wrapper.appendChild(child);
        return;
      }

      const currentClass = removeClassTokens(child.getAttribute("class"), new Set(["wiki-media-cell"]));
      child.setAttribute("class", currentClass ? `${currentClass} wiki-media-cell` : "wiki-media-cell");
      child.removeAttribute("style");
    });
  });
}

export function normalizeFigureImageClasses(figure) {
  const normalized = normalizeClassTokens(figure.getAttribute("class"), ALLOWED_IMAGE_FIGURE_CLASSES, "image");
  if (normalized) {
    figure.setAttribute("class", normalized);
  } else {
    figure.removeAttribute("class");
  }
}

export function isSupportedImageFigure(figure) {
  if (!figure || figure.tagName.toLowerCase() !== "figure") {
    return false;
  }

  const figureClasses = normalizeClassTokens(figure.getAttribute("class"), ALLOWED_IMAGE_FIGURE_CLASSES, "image");
  if (!figureClasses.split(/\s+/).includes("image")) {
    return false;
  }

  const directChildren = Array.from(figure.children);
  if (directChildren.length === 0) {
    return false;
  }

  const mediaChild = directChildren.find(function (child) {
    const tag = child.tagName.toLowerCase();
    if (tag === "img") {
      return true;
    }
    if (tag === "a") {
      const anchorChildren = Array.from(child.children);
      return anchorChildren.length === 1 && anchorChildren[0].tagName.toLowerCase() === "img";
    }
    return false;
  });

  if (!mediaChild) {
    return false;
  }

  return directChildren.every(function (child) {
    if (child === mediaChild) {
      return true;
    }
    return child.tagName.toLowerCase() === "figcaption";
  });
}

export function getFigureImageElement(figure) {
  if (!figure) {
    return null;
  }

  const directImage = Array.from(figure.children).find(function (child) {
    return child.tagName.toLowerCase() === "img";
  });
  if (directImage) {
    return directImage;
  }

  const linkedImage = Array.from(figure.children).find(function (child) {
    if (child.tagName.toLowerCase() !== "a") {
      return false;
    }
    const anchorChildren = Array.from(child.children);
    return anchorChildren.length === 1 && anchorChildren[0].tagName.toLowerCase() === "img";
  });

  return linkedImage ? linkedImage.querySelector("img") : null;
}

export function getFigureImageLinkElement(figure) {
  const image = getFigureImageElement(figure);
  if (!image || !image.parentElement) {
    return null;
  }
  return image.parentElement.tagName.toLowerCase() === "a" ? image.parentElement : null;
}

export function normalizeSupportedFigures(root) {
  root.querySelectorAll("figure").forEach(function (figure) {
    if (isInfoboxImageFigureElement(figure)) {
      return;
    }

    if (!isSupportedImageFigure(figure)) {
      return;
    }

    normalizeFigureImageClasses(figure);
  });
}

export function normalizeStyledSpans(document, root) {
  root.querySelectorAll("span").forEach(function (element) {
    const style = element.style || {};
    const classes = element.getAttribute("class") || "";
    const attrs = getMergedAttrsForElement(element);
    const textDecoration = (style.textDecoration || "").trim().toLowerCase();
    const fontWeight = (style.fontWeight || "").trim().toLowerCase();
    const fontStyle = (style.fontStyle || "").trim().toLowerCase();
    const verticalAlign = (style.verticalAlign || "").trim().toLowerCase();

    if (fontWeight === "bold" || /^[5-9]00$/.test(fontWeight)) {
      wrapNodeWithElement(document, element, "strong", attrs);
      return;
    }

    if (fontStyle === "italic") {
      wrapNodeWithElement(document, element, "em", attrs);
      return;
    }

    if (textDecoration.includes("underline")) {
      wrapNodeWithElement(document, element, "u", attrs);
      return;
    }

    if (textDecoration.includes("line-through")) {
      wrapNodeWithElement(document, element, "s", attrs);
      return;
    }

    if (verticalAlign === "super") {
      wrapNodeWithElement(document, element, "sup", attrs);
      return;
    }

    if (verticalAlign === "sub") {
      wrapNodeWithElement(document, element, "sub", attrs);
      return;
    }

    if (!hasPreservedAttrs(attrs) && !classes.trim()) {
      unwrapElement(element);
    }
  });
}

export function normalizeLegacyHtmlForTiptap(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div data-root="1">${String(html || "")}</div>`, "text/html");
  const root = doc.body.firstElementChild;

  if (!root) {
    return "";
  }

  normalizeWikiInfoboxes(root);

  root.querySelectorAll("article, section, div").forEach(function (element) {
    if (isInsidePluginOwnedStructure(element) || isPluginOwnedStructuredElement(element)) {
      return;
    }

    if (isPlainWrapperElement(element)) {
      unwrapElement(element);
      return;
    }

    if (!hasBlockDescendantChildren(element)) {
      renameElement(doc, element, "p");
    }
  });

  root.querySelectorAll("h5, h6").forEach(function (element) {
    renameElement(doc, element, "h4");
  });

  normalizeLegacyPresentationalTags(doc, root);
  normalizeLegacyWikiInlineSyntax(doc, root);
  normalizeLegacyListTags(doc, root);
  normalizeLegacyMediaLayouts(doc, root);
  normalizeLegacyTableStructures(doc, root);
  normalizeSupportedFigures(root);
  normalizeStyledSpans(doc, root);

  root.querySelectorAll("figcaption").forEach(function (element) {
    const parentTag = element.parentElement && element.parentElement.tagName ? element.parentElement.tagName.toLowerCase() : "";
    if (parentTag === "figure" && isPoetryQuoteFigure(element.parentElement)) {
      return;
    }
    if (parentTag === "figure" && isSupportedImageFigure(element.parentElement)) {
      return;
    }
    renameElement(doc, element, "p");
  });

  root.querySelectorAll("figure").forEach(function (element) {
    if (!isSupportedImageFigure(element) && !isPoetryQuoteFigure(element) && !isInfoboxImageFigureElement(element)) {
      unwrapElement(element);
    }
  });

  normalizeInfoboxRows(doc, root);

  root.querySelectorAll("dt").forEach(function (element) {
    if (isInfoboxTermElement(element)) {
      return;
    }

    const paragraph = doc.createElement("p");
    const strong = doc.createElement("strong");
    while (element.firstChild) {
      strong.appendChild(element.firstChild);
    }
    paragraph.appendChild(strong);
    replaceElement(element, paragraph);
  });

  root.querySelectorAll("dd").forEach(function (element) {
    if (isInfoboxValueElement(element)) {
      return;
    }

    renameElement(doc, element, "p");
  });

  root.querySelectorAll("dl").forEach(function (element) {
    if (isInfoboxRowsElement(element)) {
      return;
    }

    unwrapElement(element);
  });

  return root.innerHTML.trim();
}

export function getNormalizationNotice(html) {
  const raw = String(html || "").trim();
  if (!raw) {
    return "";
  }

  const normalized = normalizeLegacyHtmlForTiptap(raw);
  if (!normalized || normalized === raw) {
    return "";
  }

  return "Legacy HTML was normalized to the supported Tiptap schema. Review formatting before saving.";
}

export function detectUnsupportedContent(html) {
  const infoboxRowsNotice = detectUnsupportedInfoboxRowsBeforeNormalization(html);
  if (infoboxRowsNotice) {
    return infoboxRowsNotice;
  }

  const trimmed = normalizeLegacyHtmlForTiptap(String(html || "")).trim();
  if (!trimmed) {
    return "";
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div data-root="1">${trimmed}</div>`, "text/html");
  const elements = doc.body.querySelectorAll("*");

  for (const element of elements) {
    if (element.getAttribute("data-root") === "1") {
      continue;
    }

    const tag = element.tagName.toLowerCase();
    if (!SUPPORTED_TIPTAP_TAGS.has(tag)) {
      return `Legacy HTML uses <${tag}>, which this Tiptap surface does not preserve safely yet.`;
    }

    if (tag === "figure") {
      if (isInfoboxImageFigureElement(element)) {
        if (!isSupportedInfoboxImageFigure(element)) {
          return "Legacy HTML uses a figure layout that this Tiptap surface does not preserve safely yet.";
        }
      } else if (!isSupportedImageFigure(element) && !isPoetryQuoteFigure(element)) {
        return "Legacy HTML uses a figure layout that this Tiptap surface does not preserve safely yet.";
      }
    }

    if (isInfoboxRowsElement(element) && !isSupportedInfoboxRowsStructure(element)) {
      return "Legacy HTML uses definition rows that this Tiptap surface does not preserve safely yet.";
    }

    if (tag === "figcaption") {
      const parent = element.parentElement;
      if (!parent || !isSupportedImageFigure(parent)) {
        return "Legacy HTML uses a figcaption layout that this Tiptap surface does not preserve safely yet.";
      }
    }

    if (tag === "input" && element.getAttribute("type") !== "checkbox") {
      return "Legacy HTML uses form controls that are outside the supported wiki editor schema.";
    }
  }

  return "";
}
