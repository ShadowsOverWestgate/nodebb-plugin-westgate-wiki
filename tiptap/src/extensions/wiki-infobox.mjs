import { mergeAttributes, Node } from "@tiptap/core";
import { DOMParser, Fragment } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";

const INFOBOX_NODE_NAME = "wikiInfobox";
const INFOBOX_CONTENT_EXPRESSION = "wikiInfoboxPart*";

function textContent(state, text) {
  const value = String(text || "");
  return value ? [state.schema.text(value)] : [];
}

function findActiveInfobox(state) {
  const { $from, from, node } = state.selection;
  if (node && node.type.name === INFOBOX_NODE_NAME) {
    return {
      node,
      pos: from
    };
  }

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const ancestor = $from.node(depth);
    if (ancestor.type.name === INFOBOX_NODE_NAME) {
      return {
        node: ancestor,
        pos: $from.before(depth)
      };
    }
  }
  return null;
}

function setSelectionNear(tr, pos, bias) {
  const selectionPos = Math.max(0, Math.min(pos, tr.doc.content.size));
  return tr.setSelection(Selection.near(tr.doc.resolve(selectionPos), bias || 1));
}

function appendNodeToActiveInfobox(state, dispatch, node) {
  const context = findActiveInfobox(state);
  if (!context || !node) {
    return false;
  }

  const insertPos = context.pos + context.node.nodeSize - 1;
  if (dispatch) {
    const tr = state.tr.insert(insertPos, node);
    dispatch(tr.scrollIntoView());
  }
  return true;
}

function createInlineHelper(state, typeName, text) {
  const type = state.schema.nodes[typeName];
  if (!type) {
    return null;
  }
  return type.create(null, textContent(state, text));
}

function createContentHelper(state) {
  const type = state.schema.nodes.wikiInfoboxContent;
  const paragraphType = state.schema.nodes.paragraph;
  if (!type || !paragraphType) {
    return null;
  }
  return type.create(null, paragraphType.create(null, textContent(state, "Additional notes.")));
}

function createImageHelper(state) {
  const type = state.schema.nodes.wikiInfoboxImage;
  return type ? type.create() : null;
}

function createRow(state) {
  const rowType = state.schema.nodes.wikiInfoboxRow;
  const termType = state.schema.nodes.wikiInfoboxTerm;
  const valueType = state.schema.nodes.wikiInfoboxValue;
  if (!rowType || !termType || !valueType) {
    return null;
  }
  return rowType.create(null, [
    termType.create(null, textContent(state, "Label")),
    valueType.create(null, textContent(state, "Value"))
  ]);
}

function createRowsHelper(state) {
  const rowsType = state.schema.nodes.wikiInfoboxRows;
  const row = createRow(state);
  if (!rowsType || !row) {
    return null;
  }
  return rowsType.create(null, row);
}

function createParagraphFromText(state, text) {
  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) {
    return null;
  }

  return paragraphType.create(null, textContent(state, text));
}

function createParagraphFromInlineContent(state, content) {
  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType || !content || !content.size) {
    return null;
  }
  return paragraphType.create(null, content);
}

function appendInlineParagraph(state, blocks, content) {
  const paragraph = createParagraphFromInlineContent(state, content);
  if (paragraph) {
    blocks.push(paragraph);
  }
}

function appendRowParagraph(state, blocks, row) {
  const inlineNodes = [];
  row.forEach(function (cell) {
    if (!cell.content.size) {
      return;
    }
    if (inlineNodes.length) {
      inlineNodes.push(state.schema.text(" "));
    }
    cell.content.forEach(function (inlineNode) {
      inlineNodes.push(inlineNode);
    });
  });
  appendInlineParagraph(state, blocks, Fragment.fromArray(inlineNodes));
}

function flattenInfoboxContentForUnwrap(state, infoboxNode) {
  const blocks = [];

  infoboxNode.forEach(function (child) {
    if (child.type.name === "wikiInfoboxContent") {
      child.content.forEach(function (contentChild) {
        blocks.push(contentChild);
      });
      return;
    }

    if (child.type.name === "wikiInfoboxRows") {
      child.forEach(function (row) {
        appendRowParagraph(state, blocks, row);
      });
      return;
    }

    if (child.type.name === "wikiInfoboxImage") {
      child.content.forEach(function (contentChild) {
        blocks.push(contentChild);
      });
      return;
    }

    if (child.content && child.content.size) {
      appendInlineParagraph(state, blocks, child.content);
    }
  });

  if (!blocks.length) {
    const paragraph = createParagraphFromText(state, "");
    if (paragraph) {
      blocks.push(paragraph);
    }
  }

  return blocks;
}

function findLastRowsInInfobox(context) {
  let result = null;
  context.node.forEach(function (child, offset) {
    if (child.type.name === "wikiInfoboxRows") {
      result = {
        node: child,
        pos: context.pos + 1 + offset
      };
    }
  });
  return result;
}

function appendRowToActiveInfobox(state, dispatch) {
  const context = findActiveInfobox(state);
  const row = createRow(state);
  if (!context || !row) {
    return false;
  }

  const rowsContext = findLastRowsInInfobox(context);
  if (!rowsContext) {
    return appendNodeToActiveInfobox(state, dispatch, createRowsHelper(state));
  }

  const insertPos = rowsContext.pos + rowsContext.node.nodeSize - 1;
  if (dispatch) {
    const tr = state.tr.insert(insertPos, row);
    dispatch(setSelectionNear(tr, insertPos + 1).scrollIntoView());
  }
  return true;
}

function renderInfoboxPart(tagName, className, partName, HTMLAttributes) {
  return [
    tagName,
    mergeAttributes(HTMLAttributes, {
      class: className,
      "data-wiki-infobox-part": partName
    }),
    0
  ];
}

function isInsideInfoboxElement(element) {
  return !!(element && element.closest && element.closest('[data-wiki-node="infobox"], aside.wiki-infobox'));
}

function isInfoboxRowsElement(element) {
  return !!(element && element.matches && element.matches('[data-wiki-infobox-part="rows"], dl.wiki-infobox__rows') && isInsideInfoboxElement(element));
}

function isInsideInfoboxRowsElement(element) {
  return !!(element && element.parentElement && isInfoboxRowsElement(element.parentElement));
}

function isInsideInfoboxRowElement(element) {
  return !!(
    element &&
    element.parentElement &&
    element.parentElement.matches('[data-wiki-infobox-part="row"], div.wiki-infobox__row') &&
    isInsideInfoboxRowsElement(element.parentElement)
  );
}

function parseInfoboxPartRules(partName, tagName, className) {
  return [
    {
      tag: `[data-wiki-infobox-part="${partName}"]`,
      getAttrs: function (element) {
        return isInsideInfoboxElement(element) ? null : false;
      }
    },
    {
      tag: `${tagName}.${className}`,
      getAttrs: function (element) {
        return isInsideInfoboxElement(element) ? null : false;
      }
    }
  ];
}

const INLINE_FLATTEN_BLOCK_TAGS = new Set(["address", "article", "blockquote", "div", "dl", "figure", "h1", "h2", "h3", "h4", "hr", "ol", "p", "pre", "section", "table", "ul"]);

function appendInlineDomChildren(target, source) {
  let needsSeparator = false;
  Array.from(source.childNodes || []).forEach(function (child) {
    if (child.nodeType === 1) {
      const tagName = child.tagName.toLowerCase();
      if (INLINE_FLATTEN_BLOCK_TAGS.has(tagName)) {
        const childHadVisibleContent = hasVisibleDomNode(child);
        if (childHadVisibleContent) {
          appendDomInlineSeparator(target);
        }
        appendInlineDomChildren(target, child);
        if (childHadVisibleContent) {
          needsSeparator = true;
        }
        return;
      }
    }
    if (needsSeparator && hasVisibleDomNode(child)) {
      appendDomInlineSeparator(target);
    }
    target.appendChild(child.cloneNode(true));
    if (hasVisibleDomNode(child)) {
      needsSeparator = false;
    }
  });
}

function hasVisibleDomNode(node) {
  if (!node) {
    return false;
  }
  if (node.nodeType === 3) {
    return !!String(node.nodeValue || "").trim();
  }
  if (node.nodeType === 1) {
    return !!String(node.textContent || "").trim() || !!getImageMediaElement(node);
  }
  return false;
}

function getFigureImageMediaElement(element) {
  if (!element || !element.children || element.tagName.toLowerCase() !== "figure") {
    return null;
  }

  const children = Array.from(element.children);
  return children.length === 1 && children[0].tagName && children[0].tagName.toLowerCase() === "img" ? children[0] : null;
}

function getAnyFigureImageMediaElement(element) {
  if (!element || !element.children || element.tagName.toLowerCase() !== "figure") {
    return null;
  }

  const directImage = Array.from(element.children).find(function (child) {
    return child.tagName && child.tagName.toLowerCase() === "img";
  });
  if (directImage) {
    return directImage;
  }

  const link = Array.from(element.children).find(function (child) {
    if (!child.tagName || child.tagName.toLowerCase() !== "a") {
      return false;
    }
    const children = Array.from(child.children || []);
    return children.length === 1 && children[0].tagName && children[0].tagName.toLowerCase() === "img";
  });
  return link ? link.querySelector("img") : null;
}

function getImageMediaElement(node) {
  if (!node || node.nodeType !== 1 || !node.tagName) {
    return null;
  }

  const tagName = node.tagName.toLowerCase();
  if (tagName === "img") {
    return node;
  }
  if (tagName === "figure" && node.classList && node.classList.contains("image")) {
    return getFigureImageMediaElement(node);
  }
  return null;
}

function isContentFigureMediaElement(node) {
  return !!(
    node &&
    node.nodeType === 1 &&
    node.tagName &&
    node.tagName.toLowerCase() === "figure" &&
    node.classList &&
    node.classList.contains("image") &&
    getAnyFigureImageMediaElement(node) &&
    !getImageMediaElement(node)
  );
}

function getTopLevelImageMedia(nodes) {
  const media = Array.from(nodes || []).filter(function (node) {
    return !!getImageMediaElement(node);
  });
  return media.filter(function (node) {
    return !media.some(function (other) {
      return other !== node && other.contains && other.contains(node);
    });
  });
}

function getTopLevelContentFigureMedia(nodes) {
  const media = Array.from(nodes || []).filter(function (node) {
    return isContentFigureMediaElement(node);
  });
  return media.filter(function (node) {
    return !media.some(function (other) {
      return other !== node && other.contains && other.contains(node);
    });
  });
}

function createImageHelperElement(document, source) {
  const image = getImageMediaElement(source);
  if (!image) {
    return null;
  }

  const helper = document.createElement("figure");
  helper.className = "wiki-infobox__image";
  helper.setAttribute("data-wiki-infobox-part", "image");
  helper.appendChild(image.cloneNode(true));
  return helper;
}

function createContentHelperElement(document, source) {
  const helper = document.createElement("div");
  helper.className = "wiki-infobox__content";
  helper.setAttribute("data-wiki-infobox-part", "content");
  helper.appendChild(source.cloneNode(true));
  return helper;
}

function isParseFallbackHelperElement(node) {
  if (!node || node.nodeType !== 1) {
    return false;
  }
  const part = node.getAttribute("data-wiki-infobox-part");
  return part === "image" || part === "content";
}

function getParseFallbackReference(rows) {
  let reference = rows.nextSibling;
  while (isParseFallbackHelperElement(reference)) {
    reference = reference.nextSibling;
  }
  return reference;
}

function moveInfoboxRowMediaForParse(element) {
  const clone = element.cloneNode(true);
  Array.from(clone.querySelectorAll('dl[data-wiki-infobox-part="rows"], dl.wiki-infobox__rows')).forEach(function (rows) {
    Array.from(rows.querySelectorAll(':scope > [data-wiki-infobox-part="row"], :scope > div.wiki-infobox__row')).forEach(function (row) {
      const term = findDirectInfoboxCell(row, "dt");
      const value = findDirectInfoboxCell(row, "dd");
      const directMedia = getTopLevelImageMedia(Array.from(row.childNodes || []).filter(function (child) {
        return child !== term && child !== value;
      }));
      const directContentMedia = getTopLevelContentFigureMedia(Array.from(row.childNodes || []).filter(function (child) {
        return child !== term && child !== value;
      }));
      const cellMedia = getTopLevelImageMedia([
        ...(term ? Array.from(term.querySelectorAll("img, figure")) : []),
        ...(value ? Array.from(value.querySelectorAll("img, figure")) : [])
      ]);
      const cellContentMedia = getTopLevelContentFigureMedia([
        ...(term ? Array.from(term.querySelectorAll("figure")) : []),
        ...(value ? Array.from(value.querySelectorAll("figure")) : [])
      ]);
      const imageMedia = directMedia.concat(cellMedia.filter(function (node) {
        const contentFigure = node.closest && node.closest("figure.image");
        return !(contentFigure && contentFigure !== node && isContentFigureMediaElement(contentFigure));
      }));
      const contentMedia = directContentMedia.concat(cellContentMedia);
      if ((!imageMedia.length && !contentMedia.length) || !rows.parentNode) {
        return;
      }

      imageMedia.forEach(function (node) {
        const helper = createImageHelperElement(clone.ownerDocument, node);
        if (helper) {
          rows.parentNode.insertBefore(helper, getParseFallbackReference(rows));
        }
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      });
      contentMedia.forEach(function (node) {
        const helper = createContentHelperElement(clone.ownerDocument, node);
        rows.parentNode.insertBefore(helper, getParseFallbackReference(rows));
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      });
    });
  });
  return clone;
}

function parseInfoboxContent(element, schema) {
  const type = schema.nodes[INFOBOX_NODE_NAME];
  if (!type) {
    return Fragment.empty;
  }
  const prepared = moveInfoboxRowMediaForParse(element);
  return DOMParser.fromSchema(schema).parse(prepared, {
    topNode: type.create()
  }).content;
}

function appendDomInlineSeparator(target) {
  const text = String(target.textContent || "");
  if (text.trim() && !/\s$/.test(text)) {
    target.appendChild(target.ownerDocument.createTextNode(" "));
  }
}

function appendDomNodeAsInline(target, node) {
  if (!hasVisibleDomNode(node)) {
    return;
  }

  appendDomInlineSeparator(target);
  if (node.nodeType === 3) {
    target.appendChild(target.ownerDocument.createTextNode(String(node.nodeValue || "").replace(/\s+/g, " ").trim()));
    return;
  }
  if (node.nodeType === 1) {
    appendInlineDomChildren(target, node);
  }
}

function parseInlineContent(element, schema) {
  const container = element.ownerDocument.createElement("p");
  appendInlineDomChildren(container, element);
  const parsed = DOMParser.fromSchema(schema).parse(container);
  return parsed.firstChild ? parsed.firstChild.content : Fragment.empty;
}

function parseInlineContentWithExtras(schema, valueElement, extraValueNodes) {
  if (!valueElement && !(extraValueNodes && extraValueNodes.length)) {
    return Fragment.empty;
  }

  const sourceDocument = (valueElement || extraValueNodes.find(function (node) {
    return !!node.ownerDocument;
  })).ownerDocument;
  const container = sourceDocument.createElement("p");
  if (valueElement) {
    appendInlineDomChildren(container, valueElement);
  }
  (extraValueNodes || []).forEach(function (node) {
    appendDomNodeAsInline(container, node);
  });
  const parsed = DOMParser.fromSchema(schema).parse(container);
  return parsed.firstChild ? parsed.firstChild.content : Fragment.empty;
}

function createParsedInfoboxRow(schema, termElement, valueElement, fallbackTermElement, extraValueNodes) {
  const rowType = schema.nodes.wikiInfoboxRow;
  const termType = schema.nodes.wikiInfoboxTerm;
  const valueType = schema.nodes.wikiInfoboxValue;
  if (!rowType || !termType || !valueType || (!termElement && !valueElement && !fallbackTermElement)) {
    return null;
  }

  return rowType.create(null, [
    termType.create(null, termElement || fallbackTermElement ? parseInlineContent(termElement || fallbackTermElement, schema) : Fragment.empty),
    valueType.create(null, parseInlineContentWithExtras(schema, valueElement, extraValueNodes))
  ]);
}

function findDirectInfoboxCell(element, tagName) {
  return Array.from(element.children || []).find(function (child) {
    return child.tagName && child.tagName.toLowerCase() === tagName;
  }) || null;
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

function getNextSignificantInfoboxSibling(nodes, index) {
  for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex += 1) {
    const next = nodes[nextIndex];
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

function hasParseableInfoboxRowsContent(element) {
  return Array.from(element.childNodes || []).some(function (child) {
    if (child.nodeType === 3) {
      return !!String(child.nodeValue || "").trim();
    }
    if (child.nodeType !== 1) {
      return false;
    }
    const tagName = child.tagName.toLowerCase();
    if (["dt", "dd"].includes(tagName)) {
      return true;
    }
    if (child.matches && child.matches('[data-wiki-infobox-part="row"], div.wiki-infobox__row')) {
      return !!String(child.textContent || "").trim() || !!findDirectInfoboxCell(child, "dt") || !!findDirectInfoboxCell(child, "dd");
    }
    return false;
  });
}

function parseInfoboxRowsContent(element, schema) {
  const rows = [];
  const children = Array.from(element.childNodes || []);

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const tagName = child.tagName ? child.tagName.toLowerCase() : "";

    if (child.nodeType === 3 && hasVisibleDomNode(child)) {
      const term = element.ownerDocument.createElement("span");
      term.textContent = String(child.nodeValue || "").replace(/\s+/g, " ").trim();
      const row = createParsedInfoboxRow(schema, null, null, term);
      if (row) {
        rows.push(row);
      }
      continue;
    }

    if (child.matches && child.matches('[data-wiki-infobox-part="row"], div.wiki-infobox__row')) {
      const termElement = findDirectInfoboxCell(child, "dt");
      const valueElement = findDirectInfoboxCell(child, "dd");
      const extraValueNodes = termElement || valueElement
        ? Array.from(child.childNodes || []).filter(function (node) {
          return node !== termElement && node !== valueElement && hasVisibleDomNode(node);
        })
        : [];
      const row = createParsedInfoboxRow(
        schema,
        termElement,
        valueElement,
        !termElement && !valueElement && String(child.textContent || "").trim() ? child : null,
        extraValueNodes
      );
      if (row) {
        rows.push(row);
      }
      continue;
    }

    if (tagName === "dt") {
      const next = getNextSignificantInfoboxSibling(children, index);
      const valueElement = next && next.node.tagName && next.node.tagName.toLowerCase() === "dd" ? next.node : null;
      const row = createParsedInfoboxRow(schema, child, valueElement);
      if (row) {
        rows.push(row);
      }
      if (valueElement) {
        index = next.index;
      }
      continue;
    }

    if (tagName === "dd") {
      const row = createParsedInfoboxRow(schema, null, child);
      if (row) {
        rows.push(row);
      }
    }
  }

  return Fragment.fromArray(rows);
}

function hasStarterInfoboxSchema(state) {
  return [
    "wikiInfoboxTitle",
    "wikiInfoboxRows",
    "wikiInfoboxRow",
    "wikiInfoboxTerm",
    "wikiInfoboxValue"
  ].every(function (typeName) {
    return !!state.schema.nodes[typeName];
  });
}

export const WikiInfoboxTitle = Node.create({
  name: "wikiInfoboxTitle",
  priority: 1000,
  group: "wikiInfoboxPart",
  content: "inline*",
  defining: true,
  parseHTML() {
    return parseInfoboxPartRules("title", "div", "wiki-infobox__title");
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("div", "wiki-infobox__title", "title", HTMLAttributes);
  }
});

export const WikiInfoboxSubtitle = Node.create({
  name: "wikiInfoboxSubtitle",
  priority: 1000,
  group: "wikiInfoboxPart",
  content: "inline*",
  defining: true,
  parseHTML() {
    return parseInfoboxPartRules("subtitle", "div", "wiki-infobox__subtitle");
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("div", "wiki-infobox__subtitle", "subtitle", HTMLAttributes);
  }
});

export const WikiInfoboxImage = Node.create({
  name: "wikiInfoboxImage",
  priority: 1000,
  group: "wikiInfoboxPart",
  content: "image?",
  defining: true,
  parseHTML() {
    return parseInfoboxPartRules("image", "figure", "wiki-infobox__image");
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("figure", "wiki-infobox__image", "image", HTMLAttributes);
  }
});

export const WikiInfoboxSection = Node.create({
  name: "wikiInfoboxSection",
  priority: 1000,
  group: "wikiInfoboxPart",
  content: "inline*",
  defining: true,
  parseHTML() {
    return parseInfoboxPartRules("section", "div", "wiki-infobox__section");
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("div", "wiki-infobox__section", "section", HTMLAttributes);
  }
});

export const WikiInfoboxRows = Node.create({
  name: "wikiInfoboxRows",
  priority: 1000,
  group: "wikiInfoboxPart",
  content: "wikiInfoboxRow+",
  defining: true,
  parseHTML() {
    return [
      {
        tag: 'dl[data-wiki-infobox-part="rows"]',
        getAttrs: function (element) {
          return isInsideInfoboxElement(element) && hasParseableInfoboxRowsContent(element) ? null : false;
        },
        getContent: parseInfoboxRowsContent
      },
      {
        tag: "dl.wiki-infobox__rows",
        getAttrs: function (element) {
          return isInsideInfoboxElement(element) && hasParseableInfoboxRowsContent(element) ? null : false;
        },
        getContent: parseInfoboxRowsContent
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("dl", "wiki-infobox__rows", "rows", HTMLAttributes);
  }
});

export const WikiInfoboxRow = Node.create({
  name: "wikiInfoboxRow",
  priority: 1000,
  content: "wikiInfoboxTerm wikiInfoboxValue",
  defining: true,
  parseHTML() {
    return [
      {
        tag: '[data-wiki-infobox-part="row"]',
        getAttrs: function (element) {
          return isInsideInfoboxRowsElement(element) ? null : false;
        }
      },
      {
        tag: "div.wiki-infobox__row",
        getAttrs: function (element) {
          return isInsideInfoboxRowsElement(element) ? null : false;
        }
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("div", "wiki-infobox__row", "row", HTMLAttributes);
  }
});

export const WikiInfoboxTerm = Node.create({
  name: "wikiInfoboxTerm",
  priority: 1000,
  content: "inline*",
  defining: true,
  parseHTML() {
    return [
      {
        tag: "dt",
        getAttrs: function (element) {
          return isInsideInfoboxRowElement(element) ? null : false;
        }
      }
    ];
  },
  renderHTML() {
    return ["dt", 0];
  }
});

export const WikiInfoboxValue = Node.create({
  name: "wikiInfoboxValue",
  priority: 1000,
  content: "inline*",
  defining: true,
  parseHTML() {
    return [
      {
        tag: "dd",
        getAttrs: function (element) {
          return isInsideInfoboxRowElement(element) ? null : false;
        }
      }
    ];
  },
  renderHTML() {
    return ["dd", 0];
  }
});

export const WikiInfoboxContent = Node.create({
  name: "wikiInfoboxContent",
  priority: 1000,
  group: "wikiInfoboxPart",
  content: "block+",
  defining: true,
  parseHTML() {
    return parseInfoboxPartRules("content", "div", "wiki-infobox__content");
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("div", "wiki-infobox__content", "content", HTMLAttributes);
  }
});

const WikiInfobox = Node.create({
  name: INFOBOX_NODE_NAME,
  priority: 1000,
  group: "block",
  content: INFOBOX_CONTENT_EXPRESSION,
  defining: true,
  isolating: true,
  draggable: true,
  parseHTML() {
    return [
      {
        tag: '[data-wiki-node="infobox"]',
        getContent: parseInfoboxContent
      },
      {
        tag: "aside.wiki-infobox",
        getContent: parseInfoboxContent
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        class: "wiki-infobox",
        "data-wiki-node": "infobox"
      }),
      0
    ];
  },
  addCommands() {
    return {
      insertWikiInfobox:
        () =>
        ({ commands, state }) => {
          if (!hasStarterInfoboxSchema(state)) {
            return false;
          }

          return commands.insertContent({
            type: this.name,
            content: [
              {
                type: "wikiInfoboxTitle",
                content: [{ type: "text", text: "Untitled Infobox" }]
              },
              {
                type: "wikiInfoboxRows",
                content: [
                  {
                    type: "wikiInfoboxRow",
                    content: [
                      {
                        type: "wikiInfoboxTerm",
                        content: [{ type: "text", text: "Label" }]
                      },
                      {
                        type: "wikiInfoboxValue",
                        content: [{ type: "text", text: "Value" }]
                      }
                    ]
                  }
                ]
              }
            ]
          });
        },
      addWikiInfoboxTitle:
        () =>
        ({ state, dispatch }) => appendNodeToActiveInfobox(state, dispatch, createInlineHelper(state, "wikiInfoboxTitle", "Title")),
      addWikiInfoboxSubtitle:
        () =>
        ({ state, dispatch }) => appendNodeToActiveInfobox(state, dispatch, createInlineHelper(state, "wikiInfoboxSubtitle", "Subtitle")),
      addWikiInfoboxImage:
        () =>
        ({ state, dispatch }) => appendNodeToActiveInfobox(state, dispatch, createImageHelper(state)),
      addWikiInfoboxSection:
        () =>
        ({ state, dispatch }) => appendNodeToActiveInfobox(state, dispatch, createInlineHelper(state, "wikiInfoboxSection", "Section")),
      addWikiInfoboxRow:
        () =>
        ({ state, dispatch }) => appendRowToActiveInfobox(state, dispatch),
      addWikiInfoboxContent:
        () =>
        ({ state, dispatch }) => appendNodeToActiveInfobox(state, dispatch, createContentHelper(state)),
      unwrapWikiInfobox:
        () =>
        ({ state, tr, dispatch }) => {
          const context = findActiveInfobox(state);
          if (!context) {
            return false;
          }
          if (dispatch) {
            tr.replaceWith(context.pos, context.pos + context.node.nodeSize, flattenInfoboxContentForUnwrap(state, context.node));
            dispatch(setSelectionNear(tr, context.pos).scrollIntoView());
          }
          return true;
        },
      deleteWikiInfobox:
        () =>
        ({ state, tr, dispatch }) => {
          const context = findActiveInfobox(state);
          if (!context) {
            return false;
          }
          if (dispatch) {
            tr.delete(context.pos, context.pos + context.node.nodeSize);
            dispatch(setSelectionNear(tr, context.pos, -1).scrollIntoView());
          }
          return true;
        }
    };
  }
});

export default WikiInfobox;
