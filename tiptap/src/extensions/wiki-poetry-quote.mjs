import { mergeAttributes, Node } from "@tiptap/core";

const QUOTE_POSITIONS = new Set(["left", "center", "right", "full"]);

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
      }
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
    delete attrs.container;
    delete attrs.position;

    return [
      "figure",
      attrs,
      ["blockquote", { class: "wiki-poetry-quote__body" }, 0]
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
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            const node = $from.node(depth);
            if (node.type.name === this.name) {
              if (dispatch) {
                tr.setNodeMarkup($from.before(depth), undefined, {
                  ...node.attrs,
                  position: normalizedPosition
                });
              }
              return true;
            }
          }
          return false;
        },
      toggleWikiPoetryQuoteContainer:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            const node = $from.node(depth);
            if (node.type.name === this.name) {
              if (dispatch) {
                const pos = $from.before(depth);
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  container: node.attrs.container === false
                });
              }
              return true;
            }
          }
          return false;
        },
      unsetWikiPoetryQuote:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            const node = $from.node(depth);
            if (node.type.name === this.name) {
              if (dispatch) {
                tr.replaceWith($from.before(depth), $from.after(depth), node.content).scrollIntoView();
              }
              return true;
            }
          }
          return false;
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
