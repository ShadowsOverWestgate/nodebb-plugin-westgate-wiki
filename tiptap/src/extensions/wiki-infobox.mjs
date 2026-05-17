import { mergeAttributes, Node } from "@tiptap/core";
import { Selection } from "@tiptap/pm/state";

const INFOBOX_NODE_NAME = "wikiInfobox";

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
  group: "block",
  content: "inline*",
  defining: true,
  parseHTML() {
    return [
      { tag: '[data-wiki-infobox-part="title"]' },
      { tag: "div.wiki-infobox__title" }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("div", "wiki-infobox__title", "title", HTMLAttributes);
  }
});

export const WikiInfoboxSubtitle = Node.create({
  name: "wikiInfoboxSubtitle",
  priority: 1000,
  group: "block",
  content: "inline*",
  defining: true,
  parseHTML() {
    return [
      { tag: '[data-wiki-infobox-part="subtitle"]' },
      { tag: "div.wiki-infobox__subtitle" }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("div", "wiki-infobox__subtitle", "subtitle", HTMLAttributes);
  }
});

export const WikiInfoboxImage = Node.create({
  name: "wikiInfoboxImage",
  priority: 1000,
  group: "block",
  content: "image?",
  defining: true,
  parseHTML() {
    return [
      { tag: '[data-wiki-infobox-part="image"]' },
      { tag: "figure.wiki-infobox__image" }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("figure", "wiki-infobox__image", "image", HTMLAttributes);
  }
});

export const WikiInfoboxSection = Node.create({
  name: "wikiInfoboxSection",
  priority: 1000,
  group: "block",
  content: "inline*",
  defining: true,
  parseHTML() {
    return [
      { tag: '[data-wiki-infobox-part="section"]' },
      { tag: "div.wiki-infobox__section" }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("div", "wiki-infobox__section", "section", HTMLAttributes);
  }
});

export const WikiInfoboxRows = Node.create({
  name: "wikiInfoboxRows",
  priority: 1000,
  group: "block",
  content: "wikiInfoboxRow+",
  defining: true,
  parseHTML() {
    return [
      { tag: '[data-wiki-infobox-part="rows"]' },
      { tag: "dl.wiki-infobox__rows" }
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
      { tag: '[data-wiki-infobox-part="row"]' },
      { tag: "div.wiki-infobox__row" }
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
    return [{ tag: "dt" }];
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
    return [{ tag: "dd" }];
  },
  renderHTML() {
    return ["dd", 0];
  }
});

export const WikiInfoboxContent = Node.create({
  name: "wikiInfoboxContent",
  priority: 1000,
  group: "block",
  content: "block+",
  defining: true,
  parseHTML() {
    return [
      { tag: '[data-wiki-infobox-part="content"]' },
      { tag: "div.wiki-infobox__content" }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return renderInfoboxPart("div", "wiki-infobox__content", "content", HTMLAttributes);
  }
});

const WikiInfobox = Node.create({
  name: INFOBOX_NODE_NAME,
  priority: 1000,
  group: "block",
  content: "block+",
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
            tr.replaceWith(context.pos, context.pos + context.node.nodeSize, context.node.content);
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
