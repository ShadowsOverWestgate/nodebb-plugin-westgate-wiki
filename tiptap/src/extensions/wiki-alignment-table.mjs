import { mergeAttributes, Node } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";

export const DND_ALIGNMENT_OPTIONS = [
  { id: "lg", label: "Lawful Good", abbreviation: "LG" },
  { id: "ng", label: "Neutral Good", abbreviation: "NG" },
  { id: "cg", label: "Chaotic Good", abbreviation: "CG" },
  { id: "ln", label: "Lawful Neutral", abbreviation: "LN" },
  { id: "tn", label: "True Neutral", abbreviation: "TN" },
  { id: "cn", label: "Chaotic Neutral", abbreviation: "CN" },
  { id: "le", label: "Lawful Evil", abbreviation: "LE" },
  { id: "ne", label: "Neutral Evil", abbreviation: "NE" },
  { id: "ce", label: "Chaotic Evil", abbreviation: "CE" }
];

const ALIGNMENT_IDS = new Set(DND_ALIGNMENT_OPTIONS.map(function (option) {
  return option.id;
}));
const INFOBOX_HELPER_NODE_NAMES = new Set([
  "wikiInfoboxTitle",
  "wikiInfoboxSubtitle",
  "wikiInfoboxImage",
  "wikiInfoboxSection",
  "wikiInfoboxRows",
  "wikiInfoboxContent"
]);

export function normalizeAlignments(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/\s+/);
  return Array.from(new Set(values.map(function (item) {
    return String(item || "").trim().toLowerCase();
  }).filter(function (item) {
    return ALIGNMENT_IDS.has(item);
  })));
}

export function normalizeAlignmentTableMode(value) {
  return String(value || "").trim().toLowerCase() === "full" ? "full" : "compact";
}

function getAlignmentTableAttrs(attributes) {
  return {
    highlighted: normalizeAlignments(attributes && attributes.highlighted).join(" "),
    mode: normalizeAlignmentTableMode(attributes && attributes.mode)
  };
}

function isInfoboxHelperNode(node) {
  return !!(node && INFOBOX_HELPER_NODE_NAMES.has(node.type.name));
}

function findActiveInfobox(state) {
  const { $from, from, node } = state.selection;
  if (node && node.type.name === "wikiInfobox") {
    return {
      node,
      pos: from
    };
  }

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const ancestor = $from.node(depth);
    if (ancestor.type.name === "wikiInfobox") {
      return {
        node: ancestor,
        pos: $from.before(depth)
      };
    }
  }
  return null;
}

function findInfoboxHelperChild(context, childPos) {
  let result = null;
  context.node.forEach(function (child, offset, index) {
    if (result) {
      return;
    }
    const pos = context.pos + 1 + offset;
    if (pos === childPos) {
      result = {
        index,
        node: child,
        pos
      };
    }
  });
  return result;
}

function findDirectInfoboxHelperAtResolvedPos(context, $pos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const ancestor = $pos.node(depth);
    const parent = depth > 0 ? $pos.node(depth - 1) : null;
    if (isInfoboxHelperNode(ancestor) && parent && parent.type.name === "wikiInfobox") {
      return findInfoboxHelperChild(context, $pos.before(depth));
    }
  }
  return null;
}

function findActiveInfoboxHelper(state, context) {
  const infobox = context || findActiveInfobox(state);
  if (!infobox) {
    return null;
  }

  const { $from, $to, from, node } = state.selection;
  if (isInfoboxHelperNode(node) && $from.parent.type.name === "wikiInfobox") {
    const directChild = findInfoboxHelperChild(infobox, from);
    if (directChild) {
      return {
        infobox,
        helper: directChild
      };
    }
  }

  const fromHelper = findDirectInfoboxHelperAtResolvedPos(infobox, $from);
  const toHelper = findDirectInfoboxHelperAtResolvedPos(infobox, $to);
  if (!fromHelper || !toHelper || fromHelper.pos !== toHelper.pos) {
    return null;
  }

  return {
    infobox,
    helper: fromHelper
  };
}

function isInsideInfoboxContent(state) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "wikiInfoboxContent") {
      return true;
    }
  }
  return false;
}

function findLastInfoboxContent(context) {
  let result = null;
  context.node.forEach(function (child, offset) {
    if (child.type.name === "wikiInfoboxContent") {
      result = {
        node: child,
        pos: context.pos + 1 + offset
      };
    }
  });
  return result;
}

function insertAlignmentTableInActiveInfobox(state, dispatch, attrs) {
  if (isInsideInfoboxContent(state)) {
    return false;
  }

  const context = findActiveInfobox(state);
  const contentType = state.schema.nodes.wikiInfoboxContent;
  const tableType = state.schema.nodes.wikiAlignmentTable;
  if (!context || !contentType || !tableType) {
    return false;
  }

  const table = tableType.create(attrs);
  if (dispatch) {
    const activeHelper = findActiveInfoboxHelper(state, context);
    if (activeHelper && activeHelper.helper.node.type.name !== "wikiInfoboxContent") {
      const insertPos = activeHelper.helper.pos + activeHelper.helper.node.nodeSize;
      const tr = state.tr.insert(insertPos, contentType.create(null, table));
      tr.setSelection(NodeSelection.create(tr.doc, insertPos + 1));
      dispatch(tr.scrollIntoView());
    } else {
      const existingContent = findLastInfoboxContent(context);
      if (existingContent) {
        const insertPos = existingContent.pos + existingContent.node.nodeSize - 1;
        const tr = state.tr.insert(insertPos, table);
        tr.setSelection(NodeSelection.create(tr.doc, insertPos));
        dispatch(tr.scrollIntoView());
      } else {
        const insertPos = context.pos + context.node.nodeSize - 1;
        const tr = state.tr.insert(insertPos, contentType.create(null, table));
        tr.setSelection(NodeSelection.create(tr.doc, insertPos + 1));
        dispatch(tr.scrollIntoView());
      }
    }
  }
  return true;
}

const WikiAlignmentTable = Node.create({
  name: "wikiAlignmentTable",
  priority: 1000,
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      highlighted: {
        default: "",
        parseHTML: function (element) {
          return normalizeAlignments(element.getAttribute("data-alignments")).join(" ");
        },
        renderHTML: function (attributes) {
          const highlighted = normalizeAlignments(attributes.highlighted).join(" ");
          return highlighted ? { "data-alignments": highlighted } : {};
        }
      },
      mode: {
        default: "compact",
        parseHTML: function (element) {
          return normalizeAlignmentTableMode(element.getAttribute("data-mode"));
        },
        renderHTML: function (attributes) {
          return { "data-mode": normalizeAlignmentTableMode(attributes.mode) };
        }
      }
    };
  },
  parseHTML() {
    return [
      {
        tag: '[data-wiki-node="alignment-table"]'
      }
    ];
  },
  renderHTML({ HTMLAttributes, node }) {
    const active = new Set(normalizeAlignments(node.attrs.highlighted));
    const mode = normalizeAlignmentTableMode(node.attrs.mode);
    const cells = DND_ALIGNMENT_OPTIONS.map(function (option) {
      const classes = ["wiki-alignment-table__cell"];
      if (active.has(option.id)) {
        classes.push("wiki-alignment-table__cell--active");
      }
      return ["div", {
        class: classes.join(" "),
        "data-alignment": option.id
      }, mode === "full" ? option.label : option.abbreviation];
    });

    return ["div", mergeAttributes({
      class: `wiki-alignment-table wiki-alignment-table--${mode}`,
      "data-wiki-node": "alignment-table",
      contenteditable: "false"
    }, HTMLAttributes), ...cells];
  },
  addCommands() {
    return {
      insertWikiAlignmentTable: attributes => ({ commands, dispatch, state }) => {
        const attrs = getAlignmentTableAttrs(attributes);
        if (insertAlignmentTableInActiveInfobox(state, dispatch, attrs)) {
          return true;
        }
        return commands.insertContent({
          type: this.name,
          attrs
        });
      },
      updateWikiAlignmentTable: attributes => ({ commands }) => commands.updateAttributes(this.name, {
        highlighted: normalizeAlignments(attributes && attributes.highlighted).join(" "),
        mode: normalizeAlignmentTableMode(attributes && attributes.mode)
      })
    };
  }
});

export default WikiAlignmentTable;
