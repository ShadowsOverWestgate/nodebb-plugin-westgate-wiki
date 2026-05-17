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

function appendTextParagraph(state, blocks, text) {
  const paragraph = createParagraphFromText(state, String(text || "").replace(/\s+/g, " ").trim());
  if (paragraph) {
    blocks.push(paragraph);
  }
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
        const text = [];
        row.forEach(function (cell) {
          if (cell.textContent) {
            text.push(cell.textContent);
          }
        });
        appendTextParagraph(state, blocks, text.join(" "));
      });
      return;
    }

    if (child.type.name === "wikiInfoboxImage") {
      child.content.forEach(function (contentChild) {
        blocks.push(contentChild);
      });
      return;
    }

    if (child.textContent) {
      appendTextParagraph(state, blocks, child.textContent);
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

function parseInlineContent(element, schema) {
  const container = element.ownerDocument.createElement("p");
  Array.from(element.childNodes).forEach(function (child) {
    container.appendChild(child.cloneNode(true));
  });
  const parsed = DOMParser.fromSchema(schema).parse(container);
  return parsed.firstChild ? parsed.firstChild.content : Fragment.empty;
}

function createParsedInfoboxRow(schema, termElement, valueElement) {
  const rowType = schema.nodes.wikiInfoboxRow;
  const termType = schema.nodes.wikiInfoboxTerm;
  const valueType = schema.nodes.wikiInfoboxValue;
  if (!rowType || !termType || !valueType || !termElement) {
    return null;
  }

  return rowType.create(null, [
    termType.create(null, parseInlineContent(termElement, schema)),
    valueType.create(null, valueElement ? parseInlineContent(valueElement, schema) : Fragment.empty)
  ]);
}

function findDirectInfoboxCell(element, tagName) {
  return Array.from(element.children || []).find(function (child) {
    return child.tagName && child.tagName.toLowerCase() === tagName;
  }) || null;
}

function parseInfoboxRowsContent(element, schema) {
  const rows = [];
  const children = Array.from(element.children || []);

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const tagName = child.tagName ? child.tagName.toLowerCase() : "";

    if (child.matches && child.matches('[data-wiki-infobox-part="row"], div.wiki-infobox__row')) {
      const row = createParsedInfoboxRow(
        schema,
        findDirectInfoboxCell(child, "dt"),
        findDirectInfoboxCell(child, "dd")
      );
      if (row) {
        rows.push(row);
      }
      continue;
    }

    if (tagName === "dt") {
      const next = children[index + 1];
      const valueElement = next && next.tagName && next.tagName.toLowerCase() === "dd" ? next : null;
      const row = createParsedInfoboxRow(schema, child, valueElement);
      if (row) {
        rows.push(row);
      }
      if (valueElement) {
        index += 1;
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
        tag: '[data-wiki-infobox-part="rows"]',
        getAttrs: function (element) {
          return isInsideInfoboxElement(element) ? null : false;
        },
        getContent: parseInfoboxRowsContent
      },
      {
        tag: "dl.wiki-infobox__rows",
        getAttrs: function (element) {
          return isInsideInfoboxElement(element) ? null : false;
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
      { tag: '[data-wiki-node="infobox"]' },
      { tag: "aside.wiki-infobox" }
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
