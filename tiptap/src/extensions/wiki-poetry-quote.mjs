import { mergeAttributes, Node } from "@tiptap/core";

import { sanitizeStyleAttribute } from "../shared/sanitizer-contract.mjs";

const QUOTE_POSITIONS = new Set(["left", "center", "right", "full"]);
const QUOTE_SPACING_SIDES = ["top", "right", "bottom", "left"];
const QUOTE_SPACING_CONFIG = {
  margin: {
    tagName: "figure",
    allowNegative: true
  },
  padding: {
    tagName: "blockquote",
    allowNegative: false
  }
};

function normalizeQuoteText(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function normalizeAttribution(value) {
  const text = normalizeQuoteText(value, "Author").replace(/^[\s-]+/, "").trim();
  return `— ${text || "Author"}`;
}

function normalizeQuotePosition(value) {
  const position = String(value || "").trim().toLowerCase();
  return QUOTE_POSITIONS.has(position) ? position : "left";
}

function upperFirst(value) {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getSpacingAttrName(type, side) {
  return `${type}${upperFirst(side)}`;
}

function normalizeSpacingValue(value, type) {
  const config = QUOTE_SPACING_CONFIG[type];
  const rawValue = String(value ?? "").trim().toLowerCase();
  if (!config || !rawValue) {
    return null;
  }
  if (rawValue === "0") {
    return "0";
  }

  const match = rawValue.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem|em|%)$/);
  if (!match) {
    return null;
  }

  const numeric = parseFloat(match[1]);
  if (!Number.isFinite(numeric) || (!config.allowNegative && numeric < 0)) {
    return null;
  }
  if (Object.is(numeric, -0) || numeric === 0) {
    return "0";
  }
  return `${numeric}${match[2]}`;
}

function sanitizeSpacingValue(value, type, side) {
  const config = QUOTE_SPACING_CONFIG[type];
  if (!config || !QUOTE_SPACING_SIDES.includes(side)) {
    return null;
  }
  const normalized = normalizeSpacingValue(value, type);
  if (!normalized) {
    return null;
  }

  const propertyName = `${type}-${side}`;
  const sanitized = sanitizeStyleAttribute(`${propertyName}: ${normalized}`, config.tagName);
  const match = sanitized.match(new RegExp(`(?:^|;\\s*)${propertyName}:\\s*([^;]+)`, "i"));
  return match ? match[1].trim() : null;
}

function getQuoteBodyElement(element) {
  return element && element.querySelector ? element.querySelector(":scope > blockquote.wiki-poetry-quote__body, :scope > blockquote") || element.querySelector("blockquote") : null;
}

function readSpacingValue(element, type, side) {
  if (!element || !element.style) {
    return null;
  }
  const value = sanitizeSpacingValue(element.style.getPropertyValue(`${type}-${side}`), type, side);
  if (value || type !== "margin" || (side !== "right" && side !== "left")) {
    return value;
  }
  return sanitizeSpacingValue(element.style.getPropertyValue(`--wiki-poetry-quote-margin-${side}`), type, side);
}

function createSpacingAttributes() {
  const attrs = {};
  ["margin", "padding"].forEach(function (type) {
    QUOTE_SPACING_SIDES.forEach(function (side) {
      attrs[getSpacingAttrName(type, side)] = {
        default: null,
        parseHTML: function (element) {
          return readSpacingValue(type === "margin" ? element : getQuoteBodyElement(element), type, side);
        }
      };
    });
  });
  return attrs;
}

function getSpacingStyle(attrs, type) {
  const entries = [];
  const position = normalizeQuotePosition(attrs && attrs.position);
  const useHorizontalInsets = position !== "left";
  QUOTE_SPACING_SIDES.forEach(function (side) {
    const value = sanitizeSpacingValue(attrs && attrs[getSpacingAttrName(type, side)], type, side);
    if (value) {
      if (!(type === "margin" && useHorizontalInsets && (side === "right" || side === "left"))) {
        entries.push(`${type}-${side}: ${value}`);
      }
      if (type === "margin" && (side === "right" || side === "left")) {
        entries.push(`--wiki-poetry-quote-margin-${side}: ${value}`);
      }
    }
  });
  return entries.join("; ");
}

function getSpacingUpdates(type, values) {
  if (!QUOTE_SPACING_CONFIG[type]) {
    return null;
  }
  const updates = {};
  QUOTE_SPACING_SIDES.forEach(function (side) {
    if (Object.prototype.hasOwnProperty.call(values || {}, side)) {
      updates[getSpacingAttrName(type, side)] = sanitizeSpacingValue(values[side], type, side);
    }
  });
  return updates;
}

function getSpacingClearAttrs(type) {
  if (!QUOTE_SPACING_CONFIG[type]) {
    return null;
  }
  return Object.fromEntries(QUOTE_SPACING_SIDES.map(function (side) {
    return [getSpacingAttrName(type, side), null];
  }));
}

function getActiveQuoteTarget(state, nodeName) {
  const { selection } = state;
  if (selection.node && selection.node.type && selection.node.type.name === nodeName) {
    return {
      node: selection.node,
      pos: selection.from
    };
  }

  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === nodeName) {
      return {
        node,
        pos: $from.before(depth)
      };
    }
  }
  return null;
}

function parseQuotePosition(element) {
  const storedPosition = element.getAttribute("data-wiki-quote-position");
  if (storedPosition) {
    return normalizeQuotePosition(storedPosition);
  }
  if (element.classList.contains("wiki-poetry-quote--right")) {
    return "right";
  }
  if (element.classList.contains("wiki-poetry-quote--center")) {
    return "center";
  }
  if (element.classList.contains("wiki-poetry-quote--full")) {
    return "full";
  }
  return "left";
}

const WikiPoetryQuote = Node.create({
  name: "wikiPoetryQuote",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      container: {
        default: true,
        parseHTML: function (element) {
          return element.getAttribute("data-wiki-quote-container") !== "false";
        }
      },
      position: {
        default: "left",
        parseHTML: parseQuotePosition
      },
      ...createSpacingAttributes()
    };
  },
  parseHTML() {
    return [
      {
        tag: "figure.wiki-poetry-quote",
        contentElement: "blockquote"
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const hasContainer = HTMLAttributes.container !== false;
    const position = normalizeQuotePosition(HTMLAttributes.position);
    const marginStyle = getSpacingStyle(HTMLAttributes, "margin");
    const paddingStyle = getSpacingStyle(HTMLAttributes, "padding");
    const classNames = ["wiki-poetry-quote"];
    if (!hasContainer) {
      classNames.push("wiki-poetry-quote--plain");
    }
    if (position !== "left") {
      classNames.push(`wiki-poetry-quote--${position}`);
    }
    const attrs = mergeAttributes(
      HTMLAttributes,
      {
        class: classNames.join(" "),
        "data-wiki-node": "poetry-quote"
      },
      hasContainer ? {} : { "data-wiki-quote-container": "false" },
      position === "left" ? {} : { "data-wiki-quote-position": position }
    );
    if (marginStyle) {
      attrs.style = marginStyle;
    }
    delete attrs.container;
    delete attrs.position;
    ["margin", "padding"].forEach(function (type) {
      QUOTE_SPACING_SIDES.forEach(function (side) {
        delete attrs[getSpacingAttrName(type, side)];
      });
    });

    const bodyAttrs = { class: "wiki-poetry-quote__body" };
    if (paddingStyle) {
      bodyAttrs.style = paddingStyle;
    }

    return [
      "figure",
      attrs,
      ["blockquote", bodyAttrs, 0]
    ];
  },
  addCommands() {
    return {
      insertWikiPoetryQuote:
        (attrs) =>
        ({ commands, state }) => {
          const { from, to, empty } = state.selection;
          const selectedText = empty ? "" : state.doc.textBetween(from, to, " ", " ");
          const quote = normalizeQuoteText(attrs && attrs.quote, selectedText || "Spoken words.");
          const attribution = normalizeAttribution(attrs && attrs.attribution);

          return commands.insertContent({
            type: this.name,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: quote }]
              },
              {
                type: "paragraph",
                attrs: { class: "wiki-poetry-quote__attribution" },
                content: [{ type: "text", text: attribution }]
              }
            ]
          });
        },
      setWikiPoetryQuotePosition:
        (position) =>
        ({ state, tr, dispatch }) => {
          const normalizedPosition = normalizeQuotePosition(position);
          const target = getActiveQuoteTarget(state, this.name);
          if (!target) {
            return false;
          }
          if (dispatch) {
            tr.setNodeMarkup(target.pos, undefined, {
              ...target.node.attrs,
              position: normalizedPosition
            });
          }
          return true;
        },
      setWikiPoetryQuoteSpacing:
        (type, values) =>
        ({ state, tr, dispatch }) => {
          const target = getActiveQuoteTarget(state, this.name);
          const updates = getSpacingUpdates(type, values);
          if (!updates || !target) {
            return false;
          }
          if (dispatch) {
            tr.setNodeMarkup(target.pos, undefined, {
              ...target.node.attrs,
              ...updates
            });
          }
          return true;
        },
      clearWikiPoetryQuoteSpacing:
        (type) =>
        ({ state, tr, dispatch }) => {
          const updates = getSpacingClearAttrs(type);
          const target = getActiveQuoteTarget(state, this.name);
          if (!updates || !target) {
            return false;
          }
          if (dispatch) {
            tr.setNodeMarkup(target.pos, undefined, {
              ...target.node.attrs,
              ...updates
            });
          }
          return true;
        },
      toggleWikiPoetryQuoteContainer:
        () =>
        ({ state, tr, dispatch }) => {
          const target = getActiveQuoteTarget(state, this.name);
          if (!target) {
            return false;
          }
          if (dispatch) {
            tr.setNodeMarkup(target.pos, undefined, {
              ...target.node.attrs,
              container: target.node.attrs.container === false
            });
          }
          return true;
        },
      unsetWikiPoetryQuote:
        () =>
        ({ state, tr, dispatch }) => {
          const target = getActiveQuoteTarget(state, this.name);
          if (!target) {
            return false;
          }
          if (dispatch) {
            tr.replaceWith(target.pos, target.pos + target.node.nodeSize, target.node.content).scrollIntoView();
          }
          return true;
        }
    };
  },
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        if ($from.parent.type.name !== "paragraph" || $from.parent.content.size !== 0) {
          return false;
        }
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type.name === this.name) {
            return this.editor.commands.unsetWikiPoetryQuote();
          }
        }
        return false;
      }
    };
  }
});

export default WikiPoetryQuote;
