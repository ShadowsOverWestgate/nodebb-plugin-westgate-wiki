import { Node } from "@tiptap/core";

import { hasBlockDescendantChildren } from "../normalization/legacy-html.mjs";
import { createPreservedAttribute } from "../shared/preserved-attrs.mjs";

function isPluginOwnedStructuredContainer(element) {
  const classList = element && element.classList;
  if (!classList) {
    return false;
  }

  return classList.contains("wiki-media-row") ||
    classList.contains("wiki-media-cell") ||
    classList.contains("wiki-infobox") ||
    element.getAttribute("data-wiki-node") === "infobox";
}

const ContainerBlock = Node.create({
  name: "containerBlock",
  group: "block",
  content: "block+",
  addAttributes() {
    return {
      tagName: {
        default: "div",
        parseHTML: function (element) {
          const tagName = String(element.tagName || "").toLowerCase();
          return ["article", "div", "section"].includes(tagName) ? tagName : "div";
        }
      },
      class: createPreservedAttribute("class"),
      dir: createPreservedAttribute("dir"),
      id: createPreservedAttribute("id"),
      lang: createPreservedAttribute("lang"),
      style: createPreservedAttribute("style"),
      title: createPreservedAttribute("title"),
      topdataCommentB64: {
        default: null,
        parseHTML: function (element) {
          return element.getAttribute("data-wiki-topdata-comment-b64") || null;
        },
        renderHTML: function (attributes) {
          return attributes.topdataCommentB64 ? { "data-wiki-topdata-comment-b64": attributes.topdataCommentB64 } : {};
        }
      }
    };
  },
  parseHTML() {
    return [
      {
        tag: "article",
        getAttrs: function (element) {
          if (isPluginOwnedStructuredContainer(element)) {
            return false;
          }
          return hasBlockDescendantChildren(element) ? null : false;
        }
      },
      {
        tag: "div",
        getAttrs: function (element) {
          if (isPluginOwnedStructuredContainer(element)) {
            return false;
          }
          return hasBlockDescendantChildren(element) ? null : false;
        }
      },
      {
        tag: "section",
        getAttrs: function (element) {
          if (isPluginOwnedStructuredContainer(element)) {
            return false;
          }
          return hasBlockDescendantChildren(element) ? null : false;
        }
      }
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const {
      tagName,
      ...rest
    } = HTMLAttributes;
    const normalizedTag = ["article", "div", "section"].includes(tagName) ? tagName : "div";
    return [normalizedTag, rest, 0];
  }
});

export default ContainerBlock;
