import { Extension } from "@tiptap/core";

import { getReadableTextColor } from "../shared/color-contrast.mjs";
import { sanitizeStyleAttribute } from "../shared/sanitizer-contract.mjs";

const WIKI_BLOCK_BACKGROUND_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "tableCell",
  "tableHeader",
  "wikiInfoboxSection",
  "wikiInfoboxSubtitle",
  "wikiInfoboxTerm",
  "wikiInfoboxTitle",
  "wikiInfoboxValue"
]);

function applyBlockBackground({ state, dispatch, color }) {
  const { from, to } = state.selection;
  const tr = state.tr;
  let changed = false;

  state.doc.nodesBetween(from, to, function (node, pos) {
    if (!WIKI_BLOCK_BACKGROUND_TYPES.has(node.type.name)) {
      return true;
    }

    const style = mergeBlockBackgroundStyle(node.attrs.style, color);
    tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      style: style || null
    }, node.marks);
    changed = true;
    return false;
  });

  if (!changed) {
    return false;
  }

  if (dispatch) {
    dispatch(tr.scrollIntoView());
  }
  return true;
}

function styleEntries(styleValue) {
  const probe = document.createElement("span");
  probe.setAttribute("style", String(styleValue || ""));
  const entries = [];

  for (let i = 0; i < probe.style.length; i += 1) {
    const propertyName = String(probe.style[i] || "").trim().toLowerCase();
    const rawValue = probe.style.getPropertyValue(propertyName).trim();
    if (propertyName && rawValue) {
      entries.push([propertyName, rawValue]);
    }
  }

  return entries;
}

function getSanitizedColor(value, propertyName) {
  const sanitized = sanitizeStyleAttribute(`${propertyName}: ${value}`, "p");
  const match = sanitized.match(new RegExp(`(?:^|;\\s*)${propertyName}:\\s*([^;]+)`, "i"));
  return match ? match[1].trim() : "";
}

export function mergeBlockBackgroundStyle(styleValue, colorOptions) {
  const backgroundValue = typeof colorOptions === "string" ?
    colorOptions :
    colorOptions && colorOptions.backgroundColor;
  const textValue = typeof colorOptions === "string" ?
    "" :
    colorOptions && colorOptions.textColor;
  const backgroundColor = backgroundValue ? getSanitizedColor(backgroundValue, "background-color") : "";
  const textColor = textValue ? getSanitizedColor(textValue, "color") : "";
  const next = new Map(styleEntries(sanitizeStyleAttribute(styleValue, "p")));

  if (backgroundColor) {
    next.set("background-color", backgroundColor);
    next.set("color", textColor || getSanitizedColor(getReadableTextColor(backgroundValue), "color"));
  } else {
    next.delete("background-color");
    next.delete("color");
  }

  return Array.from(next.entries())
    .map(function ([propertyName, value]) {
      return `${propertyName}: ${value}`;
    })
    .join("; ");
}

const WikiBlockBackground = Extension.create({
  name: "wikiBlockBackground",
  addCommands() {
    return {
      setWikiBlockBackground: function (color) {
        return function ({ state, dispatch }) {
          return applyBlockBackground({ state, dispatch, color });
        };
      },
      unsetWikiBlockBackground: function () {
        return function ({ state, dispatch }) {
          return applyBlockBackground({ state, dispatch, color: "" });
        };
      }
    };
  }
});

export default WikiBlockBackground;
