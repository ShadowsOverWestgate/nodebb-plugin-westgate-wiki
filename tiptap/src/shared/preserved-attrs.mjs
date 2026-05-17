import { sanitizeStyleAttribute } from "./sanitizer-contract.mjs";

export const PRESERVED_GLOBAL_ATTRIBUTE_TYPES = [
  "blockquote",
  "bulletList",
  "codeBlock",
  "containerBlock",
  "heading",
  "image",
  "imageFigure",
  "link",
  "listItem",
  "mediaCell",
  "mediaRow",
  "orderedList",
  "paragraph",
  "wikiInfoboxSection",
  "wikiInfoboxSubtitle",
  "wikiInfoboxTerm",
  "wikiInfoboxTitle",
  "wikiInfoboxValue",
  "table",
  "tableCell",
  "tableHeader",
  "tableRow",
  "taskItem",
  "taskList"
];

export function getPreservedCommonAttrs(element) {
  return {
    class: element.getAttribute("class") || null,
    dir: element.getAttribute("dir") || null,
    id: element.getAttribute("id") || null,
    lang: element.getAttribute("lang") || null,
    style: sanitizeStyleAttribute(element.getAttribute("style"), element.tagName.toLowerCase()) || null,
    title: element.getAttribute("title") || null
  };
}

export function getMergedAttrsForElement(element) {
  const attrs = getPreservedCommonAttrs(element);
  Object.keys(attrs).forEach(function (key) {
    if (!attrs[key]) {
      delete attrs[key];
    }
  });
  return attrs;
}

export function hasPreservedAttrs(attrs) {
  return Object.values(attrs || {}).some(Boolean);
}

export function createPreservedAttribute(attributeName) {
  return {
    default: null,
    parseHTML: function (element) {
      const attrs = getMergedAttrsForElement(element);
      return attrs[attributeName] || null;
    },
    renderHTML: function (attributes) {
      return attributes[attributeName] ? { [attributeName]: attributes[attributeName] } : {};
    }
  };
}
