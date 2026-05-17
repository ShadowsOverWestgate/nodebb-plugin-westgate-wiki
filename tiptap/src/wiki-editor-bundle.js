import "./wiki-editor.css";

import MarkdownIt from "markdown-it";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

import { Editor, getMarkRange } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CharacterCount from "@tiptap/extension-character-count";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import Typography from "@tiptap/extension-typography";
import Underline from "@tiptap/extension-underline";

import ContainerBlock from "./extensions/container-block.mjs";
import ImageFigure from "./extensions/image-figure.mjs";
import { MediaCell, MediaRow } from "./extensions/media-row.mjs";
import PreservedNodeAttributes from "./extensions/preserved-node-attributes.mjs";
import SlashCommand from "./extensions/slash-command.mjs";
import StyledSpan from "./extensions/styled-span.mjs";
import WikiAlignmentTable, { DND_ALIGNMENT_OPTIONS, normalizeAlignmentTableMode, normalizeAlignments } from "./extensions/wiki-alignment-table.mjs";
import WikiBlockBackground from "./extensions/wiki-block-background.mjs";
import WikiCallout from "./extensions/wiki-callout.mjs";
import WikiCodeBlock, { CODE_BLOCK_LANGUAGE_OPTIONS } from "./extensions/wiki-code-block.mjs";
import WikiEditingKeymap from "./extensions/wiki-editing-keymap.mjs";
import WikiInfobox, {
  WikiInfoboxContent,
  WikiInfoboxImage,
  WikiInfoboxRow,
  WikiInfoboxRows,
  WikiInfoboxSection,
  WikiInfoboxSubtitle,
  WikiInfoboxTerm,
  WikiInfoboxTitle,
  WikiInfoboxValue
} from "./extensions/wiki-infobox.mjs";
import WikiPoetryQuote from "./extensions/wiki-poetry-quote.mjs";
import Highlight from "./extensions/wiki-highlight.mjs";
import { WikiFootnote, WikiNamespaceLink, WikiPageLink, WikiUserMention } from "./extensions/wiki-entities.mjs";
import WikiLink from "./extensions/wiki-link.mjs";
import {
  detectUnsupportedContent,
  getNormalizationNotice,
  normalizeLegacyHtmlForTiptap
} from "./normalization/legacy-html.mjs";
import {
  focusMediaCell,
  getActiveImageNodeName,
  handleMediaCellSelectionClick,
  isImageLayoutActive,
  isMediaCellSurfaceTarget,
  isImageSizeActive,
  selectClickedImageNode,
  setSelectedImageLayout,
  setSelectedImageSize
} from "./selection/media-selection.mjs";
import MediaCellSelection, { getTargetMediaCellPositions } from "./selection/media-cell-selection.mjs";
import {
  handleEditorLinkClick,
  installEditorLinkNavigationGuard
} from "./selection/link-interactions.mjs";
import { createImageResizeOverlay } from "./selection/image-resize.mjs";
import { getReadableTextColor, normalizeHexColor } from "./shared/color-contrast.mjs";
import { sanitizeHtml } from "./shared/sanitizer-contract.mjs";
import { createTableAuthoring } from "./table/table-authoring-ui.mjs";
import { WestgateTableView } from "./table/table-view.mjs";
import { buildHeadingToc, flattenHeadingToc, navigateToHeading } from "./toolbar/editor-toc.mjs";
import { IMAGE_CONTEXT_BUTTON_IDS, INFOBOX_CONTEXT_BUTTON_IDS, TOP_TOOLBAR_BUTTON_IDS, TOP_TOOLBAR_GROUPS } from "./toolbar/toolbar-schema.mjs";

const markdownIt = new MarkdownIt({ html: true, linkify: true, typographer: true });

function createTurndown() {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    emDelimiter: "*"
  });
  td.use(gfm);
  return td;
}

export { detectUnsupportedContent, getNormalizationNotice, normalizeLegacyHtmlForTiptap, sanitizeHtml };

export function htmlToMarkdown(html) {
  return createTurndown().turndown(html || "");
}

export function markdownToHtml(markdown) {
  return sanitizeHtml(markdownIt.render(markdown || ""));
}

const BUTTON_ICONS = {
  undo: "fa-undo",
  redo: "fa-repeat",
  paragraph: "fa-paragraph",
  "heading-1": "fa-header",
  "heading-2": "fa-header",
  "heading-3": "fa-header",
  "heading-4": "fa-header",
  bold: "fa-bold",
  italic: "fa-italic",
  underline: "fa-underline",
  strike: "fa-strikethrough",
  "inline-code": "fa-code",
  highlight: "fa-paint-brush",
  "strip-span-styling": "fa-eraser",
  "block-background": "fa-square",
  subscript: "fa-subscript",
  superscript: "fa-superscript",
  link: "fa-link",
  unlink: "fa-chain-broken",
  "wiki-page-link": "fa-book",
  "wiki-user-mention": "fa-user",
  "wiki-footnote": "fa-sticky-note-o",
  "image-upload": "fa-image",
  "media-row-2": "fa-columns",
  "media-row-3": "fa-th-large",
  "media-cell-add-before": "fa-plus",
  "media-cell-add-after": "fa-plus",
  "media-cell-delete": "fa-minus",
  "media-cell-style-shadow": "fa-moon-o",
  "media-cell-style-gilded": "fa-square-o",
  "media-cell-style-well": "fa-inbox",
  "media-cell-style-colors": "fa-eyedropper",
  "media-cell-style-clear": "fa-eraser",
  "media-row-unwrap": "fa-outdent",
  "media-row-delete": "fa-trash",
  "bullet-list": "fa-list-ul",
  "ordered-list": "fa-list-ol",
  "task-list": "fa-check-square-o",
  blockquote: "fa-quote-left",
  "code-block": "fa-file-code-o",
  "horizontal-rule": "fa-minus",
  "infobox-insert": "fa-info-circle",
  "infobox-add-title": "fa-header",
  "infobox-add-subtitle": "fa-text-height",
  "infobox-add-image": "fa-image",
  "infobox-add-section": "fa-bookmark",
  "infobox-add-row": "fa-list-alt",
  "infobox-add-content": "fa-paragraph",
  "infobox-move-helper-up": "fa-arrow-up",
  "infobox-move-helper-down": "fa-arrow-down",
  "infobox-delete-helper": "fa-minus",
  "infobox-unwrap": "fa-outdent",
  "infobox-delete": "fa-trash",
  "callout-info": "fa-info-circle",
  "callout-success": "fa-check-circle",
  "callout-warning": "fa-exclamation-triangle",
  "callout-danger": "fa-ban",
  "align-left": "fa-align-left",
  "align-center": "fa-align-center",
  "align-right": "fa-align-right",
  "align-justify": "fa-align-justify",
  "table-insert": "fa-table",
  "dnd-alignment-table": "fa-th",
  "table-properties": "fa-sliders",
  "table-add-row-before": "fa-plus",
  "table-add-row-after": "fa-plus",
  "table-delete-row": "fa-minus",
  "table-add-column-before": "fa-plus",
  "table-add-column-after": "fa-plus",
  "table-delete-column": "fa-minus",
  "table-merge-cells": "fa-compress",
  "table-split-cell": "fa-expand",
  "table-toggle-header-row": "fa-header",
  "table-toggle-header-column": "fa-header",
  "dnd-alignment-table-edit": "fa-th",
  "table-delete": "fa-trash",
  "poetry-quote-align-left": "fa-align-left",
  "poetry-quote-align-center": "fa-align-center",
  "poetry-quote-align-right": "fa-align-right",
  "poetry-quote-container": "fa-square-o",
  "poetry-quote-unwrap": "fa-outdent",
  "image-align-center": "fa-align-center",
  "image-align-left": "fa-align-left",
  "image-align-right": "fa-align-right",
  "image-align-side": "fa-indent",
  "image-size-sm": "fa-compress",
  "image-size-md": "fa-arrows-h",
  "image-size-lg": "fa-expand",
  "image-size-full": "fa-arrows-alt",
  "image-convert-figure": "fa-picture-o",
  "fullscreen-source": "fa-window-maximize"
};

const HIGHLIGHT_COLOR_OPTIONS = [
  { id: "yellow", label: "Yellow", backgroundColor: "#fef08a" },
  { id: "blue", label: "Blue", backgroundColor: "#bfdbfe" },
  { id: "red", label: "Red", backgroundColor: "#fecaca" },
  { id: "green", label: "Green", backgroundColor: "#bbf7d0" },
  { id: "magenta", label: "Magenta", backgroundColor: "#f5d0fe" },
  { id: "cyan", label: "Cyan", backgroundColor: "#a5f3fc" }
];

const BLOCK_BACKGROUND_COLOR_OPTIONS = [
  { id: "yellow", label: "Yellow", backgroundColor: "#fef9c3" },
  { id: "blue", label: "Blue", backgroundColor: "#dbeafe" },
  { id: "red", label: "Red", backgroundColor: "#fee2e2" },
  { id: "green", label: "Green", backgroundColor: "#dcfce7" },
  { id: "magenta", label: "Magenta", backgroundColor: "#fae8ff" },
  { id: "cyan", label: "Cyan", backgroundColor: "#cffafe" }
];

let activeSlashColorMenu = null;

function closeSlashColorMenu() {
  if (activeSlashColorMenu && activeSlashColorMenu.parentNode) {
    activeSlashColorMenu.parentNode.removeChild(activeSlashColorMenu);
  }
  activeSlashColorMenu = null;
  document.removeEventListener("mousedown", closeSlashColorMenu);
}

function openSlashColorMenu({ button, title, options, onSelect, onClear }) {
  closeSlashColorMenu();

  const menu = document.createElement("div");
  menu.className = "wiki-editor-color-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", title);
  menu.addEventListener("mousedown", function (event) {
    event.stopPropagation();
  });

  options.forEach(function (option) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "wiki-editor-color-swatch";
    swatch.setAttribute("role", "menuitem");
    swatch.setAttribute("title", option.label);
    swatch.setAttribute("aria-label", option.label);
    swatch.style.setProperty("--wiki-editor-swatch-color", option.backgroundColor);
    swatch.addEventListener("click", function (event) {
      event.preventDefault();
      onSelect(option);
      closeSlashColorMenu();
    });
    menu.appendChild(swatch);
  });

  const custom = document.createElement("label");
  custom.className = "wiki-editor-color-custom";
  custom.setAttribute("title", "Custom color");
  custom.setAttribute("aria-label", "Custom color");

  const customIcon = document.createElement("span");
  customIcon.className = "wiki-editor-color-custom__icon";
  customIcon.setAttribute("aria-hidden", "true");
  customIcon.textContent = "+";
  custom.appendChild(customIcon);

  const customColor = document.createElement("input");
  customColor.type = "color";
  customColor.value = (options[0] && normalizeHexColor(options[0].backgroundColor)) || "#fef08a";
  customColor.addEventListener("input", function () {
    const backgroundColor = normalizeHexColor(customColor.value);
    if (!backgroundColor) {
      return;
    }
    onSelect({
      id: "custom",
      label: "Custom",
      backgroundColor
    });
    closeSlashColorMenu();
  });
  custom.appendChild(customColor);
  menu.appendChild(custom);

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "wiki-editor-color-clear";
  clear.setAttribute("role", "menuitem");
  clear.textContent = "Clear";
  clear.addEventListener("click", function (event) {
    event.preventDefault();
    onClear();
    closeSlashColorMenu();
  });
  menu.appendChild(clear);

  document.body.appendChild(menu);
  activeSlashColorMenu = menu;

  const rect = button && typeof button.getBoundingClientRect === "function" ?
    button.getBoundingClientRect() :
    { left: 8, bottom: 8 };
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
  window.setTimeout(function () {
    document.addEventListener("mousedown", closeSlashColorMenu);
  }, 0);
}

function createButton(def) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-outline-secondary btn-sm wiki-editor-toolbar__button";
  button.setAttribute("title", def.title);
  button.setAttribute("aria-label", def.title);
  button.setAttribute("data-toolbar-id", def.id);

  const icon = document.createElement("i");
  icon.className = `fa ${BUTTON_ICONS[def.id] || "fa-circle"} wiki-editor-toolbar__icon`;
  icon.setAttribute("aria-hidden", "true");
  button.appendChild(icon);

  if (/^heading-[1-4]$/.test(def.id)) {
    const badge = document.createElement("span");
    badge.className = "wiki-editor-toolbar__icon-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = def.id.split("-")[1];
    button.appendChild(badge);
  }

  if (def.badge) {
    const badge = document.createElement("span");
    badge.className = "wiki-editor-toolbar__icon-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = def.badge;
    button.appendChild(badge);
  }

  button.addEventListener("click", function (event) {
    event.preventDefault();
    def.action({ button, table: def.activeTable });
  });
  return button;
}

function getRelativeApiPath(options, path) {
  return `${(options && options.relativePath) || ""}/api/v3/plugins/westgate-wiki/${path}`;
}

function optionLabel(result) {
  if (!result) {
    return "";
  }
  if (result.type === "namespace") {
    return `${result.title} namespace`;
  }
  if (result.userslug || result.username) {
    return `@${result.username || result.userslug}`;
  }
  return `${result.titleLeaf || result.title} · ${String(result.namespacePath || "").replace(/^\/wiki\/?/, "") || "wiki"}`;
}

function wikiEntityTargetFromInsertText(insertText, entityType) {
  const source = String(insertText || "").trim();
  const namespaceMatch = source.match(/^\[\[ns:([^[\]|]+(?:\/[^[\]|]+)*)(?:\|[^[\]]+)?\]\]$/i);
  if (namespaceMatch) {
    return namespaceMatch[1].trim();
  }
  const pageMatch = source.match(/^\[\[([^[\]|]+(?:\/[^[\]|]+)*)(?:\|[^[\]]+)?\]\]$/);
  if (pageMatch) {
    return pageMatch[1].trim();
  }
  return entityType === "namespace" ? source.replace(/^ns:/i, "").trim() : source;
}

function appendWikiSectionFragment(target, section) {
  const id = section && String(section.id || "").trim();
  if (!id) {
    return target;
  }
  return `${String(target || "").split("#")[0]}#${id}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { credentials: "same-origin" });
  const body = await res.json();
  if (!res.ok) {
    throw new Error((body && body.status && body.status.message) || res.statusText);
  }
  return body.response || body;
}

function normalizeUsername(value) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}

function findExactUserResult(results, username) {
  const target = normalizeUsername(username);
  if (!target) {
    return null;
  }
  return (results || []).find(function (result) {
    return normalizeUsername(result && result.username) === target || normalizeUsername(result && result.userslug) === target;
  }) || null;
}

function setUserEntityResolution(element, resolved, result) {
  if (!element) {
    return;
  }
  element.classList.toggle("wiki-entity--user-good", !!resolved);
  element.classList.toggle("wiki-entity--user-bad", !resolved);
  element.classList.remove("wiki-entity--user-pending");
  element.setAttribute("data-wiki-resolved", resolved ? "1" : "0");
  element.setAttribute("spellcheck", "false");
  element.setAttribute("title", resolved ? "Linked forum user" : "Forum user not found");
  if (resolved && result) {
    if (result.uid) {
      element.setAttribute("data-wiki-uid", String(result.uid));
    }
    if (result.userslug) {
      element.setAttribute("data-wiki-userslug", String(result.userslug));
    }
  }
}

function installUserEntityResolution(editorMount, options) {
  const cache = new Map();
  let timer = null;
  let stopped = false;

  async function resolveUsername(username) {
    const key = normalizeUsername(username);
    if (!key) {
      return null;
    }
    if (!cache.has(key)) {
      const params = new URLSearchParams({ q: key, limit: "10" });
      cache.set(key, fetchJson(`${getRelativeApiPath(options, "user-autocomplete")}?${params.toString()}`)
        .then(function (response) {
          return findExactUserResult(response.results || [], key);
        })
        .catch(function () {
          return null;
        }));
    }
    return cache.get(key);
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(async function () {
      if (stopped || !editorMount) {
        return;
      }
      const elements = Array.from(editorMount.querySelectorAll('[data-wiki-entity="user"]'));
      await Promise.all(elements.map(async function (element) {
        const username = element.getAttribute("data-wiki-username") || element.textContent || "";
        const existingResolved = element.getAttribute("data-wiki-resolved") === "1";
        if (existingResolved && (element.getAttribute("data-wiki-uid") || element.getAttribute("data-wiki-userslug"))) {
          setUserEntityResolution(element, true);
          return;
        }
        const result = await resolveUsername(username);
        if (!stopped && editorMount.contains(element)) {
          setUserEntityResolution(element, !!result, result);
        }
      }));
    }, 220);
  }

  schedule();
  return {
    refresh: schedule,
    destroy: function () {
      stopped = true;
      window.clearTimeout(timer);
    }
  };
}

function decodeBase64Utf8(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }
  try {
    const binary = window.atob(source);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch (err) {
    return "";
  }
}

function openWikiEntityDialog({ editor, type, options, initial, replaceMark }) {
  const existing = document.querySelector(".wiki-editor-entity-dialog-shell");
  if (existing) {
    existing.remove();
  }

  const shell = document.createElement("div");
  shell.className = "wiki-editor-entity-dialog-shell";

  const dialog = document.createElement("div");
  dialog.className = "wiki-editor-entity-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  shell.appendChild(dialog);

  const title = document.createElement("h2");
  title.className = "wiki-editor-entity-dialog__title";
  title.textContent = {
    page: "Wiki page link",
    namespace: "Namespace link",
    user: "Forum user",
    footnote: "Footnote"
  }[type] || "Wiki entity";
  dialog.appendChild(title);

  const form = document.createElement("form");
  form.className = "wiki-editor-entity-dialog__form";
  dialog.appendChild(form);

  function addInput(labelText, input) {
    const label = document.createElement("label");
    label.className = "wiki-editor-entity-dialog__label";
    label.textContent = labelText;
    label.appendChild(input);
    form.appendChild(label);
    return input;
  }

  const searchInput = document.createElement(type === "footnote" ? "textarea" : "input");
  searchInput.className = "form-control form-control-sm";
  if (type !== "footnote") {
    searchInput.type = "search";
    searchInput.autocomplete = "off";
  } else {
    searchInput.rows = 4;
  }
  addInput(type === "footnote" ? "Note text" : "Search or target", searchInput);
  if (initial && initial.search) {
    searchInput.value = initial.search;
  }

  let footnoteLinkLabel = null;
  let footnoteLinkUrl = null;
  if (type === "footnote") {
    footnoteLinkLabel = document.createElement("input");
    footnoteLinkLabel.className = "form-control form-control-sm";
    footnoteLinkLabel.type = "text";
    footnoteLinkLabel.autocomplete = "off";
    addInput("Link label", footnoteLinkLabel);

    footnoteLinkUrl = document.createElement("input");
    footnoteLinkUrl.className = "form-control form-control-sm";
    footnoteLinkUrl.type = "url";
    footnoteLinkUrl.autocomplete = "off";
    addInput("Link URL", footnoteLinkUrl);
  }

  const labelInput = type === "page" || type === "namespace" ? document.createElement("input") : null;
  if (labelInput) {
    labelInput.className = "form-control form-control-sm";
    labelInput.type = "text";
    labelInput.autocomplete = "off";
    addInput("Label", labelInput);
    if (initial && initial.label) {
      labelInput.value = initial.label;
    }
  }

  const select = type === "footnote" ? null : document.createElement("select");
  if (select) {
    select.className = "form-select form-select-sm";
    select.size = 6;
    form.appendChild(select);
  }

  const sectionLabel = type === "page" ? document.createElement("label") : null;
  const sectionSelect = type === "page" ? document.createElement("select") : null;
  if (sectionLabel && sectionSelect) {
    sectionLabel.className = "wiki-editor-entity-dialog__label";
    sectionLabel.textContent = "Section";
    sectionLabel.hidden = true;
    sectionSelect.className = "form-select form-select-sm";
    sectionLabel.appendChild(sectionSelect);
    form.appendChild(sectionLabel);
  }

  const status = document.createElement("p");
  status.className = "wiki-editor-entity-dialog__status small text-muted";
  status.setAttribute("aria-live", "polite");
  form.appendChild(status);

  const actions = document.createElement("div");
  actions.className = "wiki-editor-entity-dialog__actions";
  const insertBtn = document.createElement("button");
  insertBtn.type = "submit";
  insertBtn.className = "btn btn-primary btn-sm";
  insertBtn.textContent = "Insert";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-link btn-sm";
  cancelBtn.textContent = "Cancel";
  actions.appendChild(insertBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(actions);

  let results = [];
  let sections = [];
  let sectionRequestId = 0;
  function closeDialog() {
    shell.remove();
    document.removeEventListener("keydown", handleDialogKeydown);
  }

  function handleDialogKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      editor.commands.focus();
    }
  }

  async function runSearch() {
    if (!select || type === "footnote") {
      return;
    }
    const q = searchInput.value.trim();
    const params = new URLSearchParams({ q, limit: "25" });
    let url;
    if (type === "user") {
      url = `${getRelativeApiPath(options, "user-autocomplete")}?${params.toString()}`;
    } else {
      params.set("context", "wiki");
      params.set("cid", String((options && options.cid) || ""));
      params.set("scope", type === "namespace" || type === "page" ? "all-wiki" : "current-namespace");
      if (type === "namespace") {
        params.set("type", "namespace");
      }
      url = `${(options && options.linkAutocompleteUrl) || getRelativeApiPath(options, "link-autocomplete")}?${params.toString()}`;
    }
    status.textContent = "Searching...";
    const response = await fetchJson(url);
    results = (response.results || []).filter(function (result) {
      return type === "user" ? true : (
        type === "page" ? result.type === "page" || result.type === "namespace" : result.type === type
      );
    });
    select.innerHTML = "";
    results.forEach(function (result, index) {
      const opt = document.createElement("option");
      opt.value = String(index);
      opt.textContent = optionLabel(result);
      select.appendChild(opt);
    });
    status.textContent = results.length ? "" : (
      type === "page" ? "No exact match. The typed target can be inserted as a redlink." :
        (type === "user" ? "No matching user. A typed mention will be marked unresolved." : "No matches.")
    );
    if (type === "page") {
      await fetchPageSectionsForResult(results[parseInt(select.value, 10)]);
    }
  }

  function clearPageSections() {
    sections = [];
    if (sectionLabel) {
      sectionLabel.hidden = true;
    }
    if (sectionSelect) {
      sectionSelect.innerHTML = "";
    }
  }

  async function fetchPageSectionsForResult(selected) {
    if (type !== "page" || !sectionSelect || !sectionLabel) {
      return;
    }
    const requestId = sectionRequestId + 1;
    sectionRequestId = requestId;
    clearPageSections();

    if (!selected || selected.type !== "page" || !selected.tid) {
      return;
    }

    const params = new URLSearchParams({ tid: String(selected.tid) });
    const url = `${(options && options.pageTocUrl) || getRelativeApiPath(options, "page-toc")}?${params.toString()}`;
    const response = await fetchJson(url);
    if (requestId !== sectionRequestId) {
      return;
    }

    sections = Array.isArray(response.headings) ? response.headings.filter(function (heading) {
      return heading && heading.id && heading.text;
    }) : [];
    if (!sections.length) {
      return;
    }

    const none = document.createElement("option");
    none.value = "";
    none.textContent = "No section";
    sectionSelect.appendChild(none);

    sections.forEach(function (heading, index) {
      const opt = document.createElement("option");
      opt.value = String(index);
      const level = Math.max(1, parseInt(heading.level, 10) || 1);
      opt.textContent = `${"  ".repeat(Math.max(0, level - 1))}${heading.text}`;
      sectionSelect.appendChild(opt);
    });
    sectionLabel.hidden = false;
  }

  let searchTimer = null;
  if (type !== "footnote") {
    searchInput.addEventListener("input", function () {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () {
        runSearch().catch(function (err) {
          status.textContent = (err && err.message) || String(err);
        });
      }, 180);
    });
    select.addEventListener("change", function () {
      const result = results[parseInt(select.value, 10)];
      if (labelInput && result) {
        labelInput.value = result.titleLeaf || result.title || "";
      }
      fetchPageSectionsForResult(result).catch(function (err) {
        clearPageSections();
        status.textContent = (err && err.message) || String(err);
      });
    });
    runSearch().catch(function () {});
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const selected = select ? results[parseInt(select.value, 10)] : null;
    const typed = searchInput.value.trim();
    const label = labelInput && labelInput.value.trim();
    if (type === "page") {
      if (selected && selected.type === "namespace") {
        const target = wikiEntityTargetFromInsertText(selected.insertText, "namespace");
        if (target) {
          let chain = editor.chain().focus();
          if (replaceMark) {
            chain = chain.extendMarkRange("wikiPageLink").unsetMark("wikiPageLink");
          }
          chain.insertWikiNamespaceLink({ target, label: label || selected.title || target }).run();
        }
        closeDialog();
        return;
      }
      const target = selected ? wikiEntityTargetFromInsertText(selected.insertText, "page") : typed;
      if (target) {
        const selectedSection = sectionSelect && sectionSelect.value !== "" ? sections[parseInt(sectionSelect.value, 10)] : null;
        let chain = editor.chain().focus();
        if (replaceMark) {
          chain = chain.extendMarkRange("wikiPageLink").unsetMark("wikiPageLink");
        }
        chain.insertWikiPageLink({
          target: appendWikiSectionFragment(target, selectedSection),
          label: label || (selected && (selected.titleLeaf || selected.title)) || typed
        }).run();
      }
    } else if (type === "namespace") {
      const target = selected ? wikiEntityTargetFromInsertText(selected.insertText, "namespace") : typed.replace(/^ns:/i, "");
      if (target) {
        let chain = editor.chain().focus();
        if (replaceMark) {
          chain = chain.extendMarkRange("wikiNamespaceLink").unsetMark("wikiNamespaceLink");
        }
        chain.insertWikiNamespaceLink({ target, label: label || (selected && selected.title) || target }).run();
      }
    } else if (type === "user") {
      const user = selected ?
        { ...selected, resolved: true } :
        { username: typed.replace(/^@/, ""), resolved: false };
      let chain = editor.chain().focus();
      if (replaceMark) {
        chain = chain.extendMarkRange("wikiUserMention").unsetMark("wikiUserMention");
      }
      chain.insertWikiUserMention(user).run();
    } else if (type === "footnote") {
      let body = typed;
      const linkLabel = footnoteLinkLabel && footnoteLinkLabel.value.trim();
      const linkUrl = footnoteLinkUrl && footnoteLinkUrl.value.trim();
      if (linkLabel && linkUrl) {
        body = `${body}${body ? " " : ""}[${linkLabel}](${linkUrl})`;
      }
      let chain = editor.chain().focus();
      if (replaceMark) {
        chain = chain.extendMarkRange("wikiFootnote").unsetMark("wikiFootnote");
      }
      chain.insertWikiFootnote({ body }).run();
    }
    closeDialog();
  });

  cancelBtn.addEventListener("click", function () {
    closeDialog();
    editor.commands.focus();
  });

  shell.addEventListener("mousedown", function (event) {
    if (event.target === shell) {
      event.preventDefault();
      closeDialog();
      editor.commands.focus();
    }
  });
  document.addEventListener("keydown", handleDialogKeydown);
  document.body.appendChild(shell);
  searchInput.focus();
}

function closeEditorDialogShells() {
  document.querySelectorAll(".wiki-editor-entity-dialog-shell, .wiki-editor-link-dialog-shell").forEach(function (shell) {
    shell.remove();
  });
}

function normalizeLinkDialogText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getActiveLinkRange(editor) {
  const markType = editor && editor.state && editor.state.schema && editor.state.schema.marks.link;
  if (!markType) {
    return null;
  }
  return getMarkRange(editor.state.selection.$from, markType) || null;
}

function getTextInRange(editor, range) {
  if (!editor || !range || range.from === range.to) {
    return "";
  }
  return normalizeLinkDialogText(editor.state.doc.textBetween(range.from, range.to, " "));
}

function getExternalLinkTargetRange(editor) {
  const selection = editor.state.selection;
  if (!selection.empty) {
    return { from: selection.from, to: selection.to };
  }
  return getActiveLinkRange(editor) || { from: selection.from, to: selection.to };
}

export function getExternalLinkDialogState(editor) {
  const selection = editor.state.selection;
  const targetRange = !selection.empty ? { from: selection.from, to: selection.to } : getActiveLinkRange(editor);

  return {
    href: editor.getAttributes("link").href || "",
    text: getTextInRange(editor, targetRange)
  };
}

export function applyExternalLinkEdit(editor, attrs) {
  const href = String((attrs && attrs.href) || "").trim();
  if (!href) {
    return false;
  }

  const range = getExternalLinkTargetRange(editor);
  const text = normalizeLinkDialogText(attrs && attrs.text) || href;
  const currentText = getTextInRange(editor, range);
  const linkAttrs = {
    href,
    target: "_blank",
    rel: "noopener noreferrer"
  };

  if (range.from !== range.to && currentText === text) {
    return editor.chain().focus().setTextSelection(range).setLink(linkAttrs).run();
  }

  return editor.chain().focus().insertContentAt(range, {
    type: "text",
    text,
    marks: [{ type: "link", attrs: linkAttrs }]
  }).run();
}

export function selectionHasStyledSpan(editor) {
  const markType = editor && editor.state && editor.state.schema && editor.state.schema.marks.styledSpan;
  const selection = editor && editor.state && editor.state.selection;
  if (!markType || !selection) {
    return false;
  }
  if (selection.empty) {
    return !!getMarkRange(selection.$from, markType);
  }

  let found = false;
  editor.state.doc.nodesBetween(selection.from, selection.to, function (node) {
    if (found) {
      return false;
    }
    if (!node.isText) {
      return true;
    }
    found = !!markType.isInSet(node.marks);
    return !found;
  });
  return found;
}

export function stripStyledSpanSelection(editor) {
  if (!selectionHasStyledSpan(editor)) {
    return false;
  }
  const selection = editor.state.selection;
  if (!selection.empty) {
    return editor.chain().focus().unsetMark("styledSpan").run();
  }

  const markType = editor.state.schema.marks.styledSpan;
  const range = getMarkRange(selection.$from, markType);
  if (!range) {
    return false;
  }

  return editor.chain()
    .focus()
    .setTextSelection(range)
    .unsetMark("styledSpan")
    .setTextSelection(selection.from)
    .run();
}

function openExternalLinkDialog({ editor, onSave } = {}) {
  closeEditorDialogShells();

  const initial = getExternalLinkDialogState(editor);
  const shell = document.createElement("div");
  shell.className = "wiki-editor-entity-dialog-shell wiki-editor-link-dialog-shell";

  const dialog = document.createElement("div");
  dialog.className = "wiki-editor-entity-dialog wiki-editor-link-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "External link");
  shell.appendChild(dialog);

  const title = document.createElement("h2");
  title.className = "wiki-editor-entity-dialog__title";
  title.textContent = "External link";
  dialog.appendChild(title);

  const form = document.createElement("form");
  form.className = "wiki-editor-entity-dialog__form";
  dialog.appendChild(form);

  function addInput(labelText, input) {
    const label = document.createElement("label");
    label.className = "wiki-editor-entity-dialog__label";
    label.textContent = labelText;
    label.appendChild(input);
    form.appendChild(label);
    return input;
  }

  const hrefInput = document.createElement("input");
  hrefInput.className = "form-control form-control-sm";
  hrefInput.type = "text";
  hrefInput.inputMode = "url";
  hrefInput.autocomplete = "off";
  hrefInput.value = initial.href || "";
  addInput("Link URL", hrefInput);

  const textInput = document.createElement("input");
  textInput.className = "form-control form-control-sm";
  textInput.type = "text";
  textInput.autocomplete = "off";
  textInput.value = initial.text || initial.href || "";
  addInput("Text", textInput);

  const actions = document.createElement("div");
  actions.className = "wiki-editor-entity-dialog__actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.className = "btn btn-primary btn-sm";
  saveBtn.textContent = "Save";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-link btn-sm";
  cancelBtn.textContent = "Cancel";
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(actions);

  function closeDialog({ restoreFocus = true } = {}) {
    shell.remove();
    document.removeEventListener("keydown", handleDialogKeydown);
    if (restoreFocus) {
      editor.commands.focus();
    }
  }

  function handleDialogKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const href = hrefInput.value.trim();
    if (!href) {
      closeDialog();
      return;
    }
    if (applyExternalLinkEdit(editor, { href, text: textInput.value })) {
      closeDialog({ restoreFocus: false });
      if (typeof onSave === "function") {
        onSave();
      }
    }
  });

  cancelBtn.addEventListener("click", function () {
    closeDialog();
  });

  shell.addEventListener("mousedown", function (event) {
    if (event.target === shell) {
      event.preventDefault();
      closeDialog();
    }
  });

  document.addEventListener("keydown", handleDialogKeydown);
  document.body.appendChild(shell);
  (initial.href ? textInput : hrefInput).focus();
}

function createDialogField(labelText, input) {
  const label = document.createElement("label");
  label.className = "wiki-editor-dialog__field";
  const text = document.createElement("span");
  text.textContent = labelText;
  label.appendChild(text);
  label.appendChild(input);
  return label;
}

function openAlignmentTableDialog({ editor }) {
  const existing = document.querySelector(".wiki-editor-entity-dialog-shell");
  if (existing) {
    existing.remove();
  }

  const current = editor.isActive("wikiAlignmentTable") ? editor.getAttributes("wikiAlignmentTable") : {};
  const active = new Set(normalizeAlignments(current.highlighted));
  const currentMode = normalizeAlignmentTableMode(current.mode);
  const shell = document.createElement("div");
  shell.className = "wiki-editor-entity-dialog-shell";
  const dialog = document.createElement("div");
  dialog.className = "wiki-editor-entity-dialog wiki-editor-alignment-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "D&D alignment table");
  shell.appendChild(dialog);

  const title = document.createElement("h2");
  title.className = "wiki-editor-entity-dialog__title";
  title.textContent = "D&D alignment table";
  dialog.appendChild(title);

  const form = document.createElement("form");
  form.className = "wiki-editor-entity-dialog__form";
  dialog.appendChild(form);

  const mode = document.createElement("select");
  mode.className = "form-select form-select-sm";
  [["compact", "Compact abbreviations"], ["full", "Full labels"]].forEach(function ([value, label]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    mode.appendChild(option);
  });
  mode.value = currentMode;
  form.appendChild(createDialogField("Display mode", mode));

  const grid = document.createElement("div");
  grid.className = "wiki-editor-alignment-picker";
  DND_ALIGNMENT_OPTIONS.forEach(function (alignment) {
    const label = document.createElement("label");
    label.className = "wiki-editor-alignment-picker__item";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = alignment.id;
    checkbox.checked = active.has(alignment.id);
    const text = document.createElement("span");
    text.textContent = alignment.label;
    label.appendChild(checkbox);
    label.appendChild(text);
    grid.appendChild(label);
  });
  form.appendChild(grid);

  const actions = document.createElement("div");
  actions.className = "wiki-editor-entity-dialog__actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn btn-link btn-sm";
  cancel.textContent = "Cancel";
  const apply = document.createElement("button");
  apply.type = "submit";
  apply.className = "btn btn-primary btn-sm";
  apply.textContent = editor.isActive("wikiAlignmentTable") ? "Update" : "Insert";
  actions.appendChild(cancel);
  actions.appendChild(apply);
  form.appendChild(actions);

  function close() {
    shell.remove();
    editor.commands.focus();
  }

  cancel.addEventListener("click", close);
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const highlighted = Array.from(grid.querySelectorAll("input:checked")).map(function (input) {
      return input.value;
    });
    const modeValue = normalizeAlignmentTableMode(mode.value);
    if (editor.isActive("wikiAlignmentTable")) {
      editor.chain().focus().updateWikiAlignmentTable({ highlighted, mode: modeValue }).run();
    } else {
      editor.chain().focus().insertWikiAlignmentTable({ highlighted, mode: modeValue }).run();
    }
    close();
  });

  document.body.appendChild(shell);
  const first = grid.querySelector("input");
  if (first) {
    first.focus();
  }
}

const WIKI_SLASH_ITEM_DEFS = [
  { id: "paragraph", label: "Paragraph", aliases: ["p", "text", "normal"] },
  { id: "heading-1", label: "Heading 1", aliases: ["h1", "title"] },
  { id: "heading-2", label: "Heading 2", aliases: ["h2", "section"] },
  { id: "heading-3", label: "Heading 3", aliases: ["h3", "subheading"] },
  { id: "heading-4", label: "Heading 4", aliases: ["h4"] },
  { id: "bold", label: "Bold", aliases: ["strong", "b"] },
  { id: "italic", label: "Italic", aliases: ["emphasis", "em", "i"] },
  { id: "underline", label: "Underline", aliases: ["u"] },
  { id: "strike", label: "Strike", aliases: ["strikethrough", "s"] },
  { id: "inline-code", label: "Inline code", aliases: ["code"] },
  { id: "highlight", label: "Highlight", aliases: ["mark", "color"] },
  { id: "strip-span-styling", label: "Strip span", aliases: ["span", "style", "unstyled", "clear style", "strip style"] },
  { id: "subscript", label: "Subscript", aliases: ["sub"] },
  { id: "superscript", label: "Superscript", aliases: ["sup"] },
  { id: "link", label: "External link", aliases: ["url", "href"] },
  { id: "wiki-page-link", label: "Wiki page link", aliases: ["wiki", "page", "internal link"] },
  { id: "wiki-user-mention", label: "Forum user", aliases: ["user", "mention", "@"] },
  { id: "wiki-footnote", label: "Footnote", aliases: ["note", "citation"] },
  { id: "image-upload", label: "Upload image", aliases: ["image", "img", "picture", "upload"] },
  { id: "media-row-2", label: "Two-column media row", aliases: ["2", "two up", "two column", "media"] },
  { id: "media-row-3", label: "Three-column media row", aliases: ["3", "three up", "three column", "gallery"] },
  { id: "bullet-list", label: "Bullet list", aliases: ["ul", "unordered list"] },
  { id: "ordered-list", label: "Ordered list", aliases: ["ol", "numbered list"] },
  { id: "task-list", label: "Task list", aliases: ["todo", "checklist"] },
  { id: "blockquote", label: "Poetry quote", aliases: ["quote", "blockquote"] },
  { id: "code-block", label: "Code block", aliases: ["pre", "fenced code"] },
  { id: "block-background", label: "Text block background", aliases: ["background", "block color"] },
  { id: "horizontal-rule", label: "Horizontal rule", aliases: ["hr", "divider", "rule"] },
  { id: "infobox-insert", label: "Infobox", aliases: ["info box", "sidebar", "wiki box"] },
  { id: "callout-info", label: "Info callout", aliases: ["info", "note box"] },
  { id: "callout-success", label: "Success callout", aliases: ["success", "remember"] },
  { id: "callout-warning", label: "Warning callout", aliases: ["warning", "caution"] },
  { id: "callout-danger", label: "Danger callout", aliases: ["danger", "error"] },
  { id: "align-left", label: "Align left", aliases: ["left"] },
  { id: "align-center", label: "Align center", aliases: ["center", "centre"] },
  { id: "align-right", label: "Align right", aliases: ["right"] },
  { id: "align-justify", label: "Justify", aliases: ["justify"] },
  { id: "table-insert", label: "Table", aliases: ["table", "grid"] },
  { id: "dnd-alignment-table", label: "D&D alignment table", aliases: ["dnd", "alignment", "alignment table", "dungeons dragons"] }
];

export function createWikiSlashItems({ root, editor, uploadImage } = {}) {
  function getEditorOptions() {
    return (root && root.__wikiEditorOptions) || {};
  }

  const actions = {
    paragraph: function () {
      editor.chain().focus().setParagraph().run();
    },
    "heading-1": function () {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
    "heading-2": function () {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
    "heading-3": function () {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
    "heading-4": function () {
      editor.chain().focus().toggleHeading({ level: 4 }).run();
    },
    bold: function () {
      editor.chain().focus().toggleBold().run();
    },
    italic: function () {
      editor.chain().focus().toggleItalic().run();
    },
    underline: function () {
      editor.chain().focus().toggleUnderline().run();
    },
    strike: function () {
      editor.chain().focus().toggleStrike().run();
    },
    "inline-code": function () {
      editor.chain().focus().toggleCode().run();
    },
    highlight: function ({ button }) {
      openSlashColorMenu({
        button,
        title: "Highlight color",
        options: HIGHLIGHT_COLOR_OPTIONS,
        onSelect: function (option) {
          const backgroundColor = option.backgroundColor;
          const textColor = getReadableTextColor(backgroundColor);
          editor.chain().focus().toggleHighlight({ color: backgroundColor, textColor }).run();
        },
        onClear: function () {
          editor.chain().focus().unsetHighlight().run();
        }
      });
    },
    "strip-span-styling": function () {
      stripStyledSpanSelection(editor);
    },
    subscript: function () {
      editor.chain().focus().toggleSubscript().run();
    },
    superscript: function () {
      editor.chain().focus().toggleSuperscript().run();
    },
    link: function () {
      openExternalLinkDialog({ editor });
    },
    "wiki-page-link": function () {
      openWikiEntityDialog({ editor, type: "page", options: getEditorOptions() });
    },
    "wiki-user-mention": function () {
      openWikiEntityDialog({ editor, type: "user", options: getEditorOptions() });
    },
    "wiki-footnote": function () {
      openWikiEntityDialog({ editor, type: "footnote", options: getEditorOptions() });
    },
    "image-upload": function () {
      if (typeof uploadImage === "function") {
        uploadImage();
      }
    },
    "media-row-2": function () {
      editor.chain().focus().insertMediaRow(2).run();
    },
    "media-row-3": function () {
      editor.chain().focus().insertMediaRow(3).run();
    },
    "bullet-list": function () {
      editor.chain().focus().toggleBulletList().run();
    },
    "ordered-list": function () {
      editor.chain().focus().toggleOrderedList().run();
    },
    "task-list": function () {
      editor.chain().focus().toggleTaskList().run();
    },
    blockquote: function () {
      editor.chain().focus().insertWikiPoetryQuote().run();
    },
    "code-block": function () {
      editor.chain().focus().toggleCodeBlock().run();
    },
    "block-background": function ({ button }) {
      openSlashColorMenu({
        button,
        title: "Text block background color",
        options: BLOCK_BACKGROUND_COLOR_OPTIONS,
        onSelect: function (option) {
          const backgroundColor = option.backgroundColor;
          const textColor = getReadableTextColor(backgroundColor);
          editor.chain().focus().setWikiBlockBackground({ backgroundColor, textColor }).run();
        },
        onClear: function () {
          editor.chain().focus().unsetWikiBlockBackground().run();
        }
      });
    },
    "horizontal-rule": function () {
      editor.chain().focus().setHorizontalRule().run();
    },
    "infobox-insert": function () {
      editor.chain().focus().insertWikiInfobox().run();
    },
    "callout-info": function () {
      if (editor.isActive("wikiCallout", { type: "info" })) {
        editor.chain().focus().unsetWikiCallout().run();
        return;
      }
      editor.chain().focus().insertWikiCallout({ type: "info", title: "Info" }).run();
    },
    "callout-success": function () {
      if (editor.isActive("wikiCallout", { type: "success" })) {
        editor.chain().focus().unsetWikiCallout().run();
        return;
      }
      editor.chain().focus().insertWikiCallout({ type: "success", title: "Remember" }).run();
    },
    "callout-warning": function () {
      if (editor.isActive("wikiCallout", { type: "warning" })) {
        editor.chain().focus().unsetWikiCallout().run();
        return;
      }
      editor.chain().focus().insertWikiCallout({ type: "warning", title: "Warning" }).run();
    },
    "callout-danger": function () {
      if (editor.isActive("wikiCallout", { type: "danger" })) {
        editor.chain().focus().unsetWikiCallout().run();
        return;
      }
      editor.chain().focus().insertWikiCallout({ type: "danger", title: "Danger" }).run();
    },
    "align-left": function () {
      editor.chain().focus().setTextAlign("left").run();
    },
    "align-center": function () {
      editor.chain().focus().setTextAlign("center").run();
    },
    "align-right": function () {
      editor.chain().focus().setTextAlign("right").run();
    },
    "align-justify": function () {
      editor.chain().focus().setTextAlign("justify").run();
    },
    "table-insert": function () {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
    "dnd-alignment-table": function () {
      openAlignmentTableDialog({ editor });
    }
  };

  return WIKI_SLASH_ITEM_DEFS.map(function (def) {
    return {
      id: def.id,
      label: def.label,
      aliases: def.aliases,
      run: function (context) {
        actions[def.id](context || {});
      }
    };
  });
}

function openWikiEntityDialogForElement(editor, element, options) {
  const type = element && element.getAttribute("data-wiki-entity");
  const markNameByType = {
    page: "wikiPageLink",
    namespace: "wikiNamespaceLink",
    user: "wikiUserMention",
    footnote: "wikiFootnote"
  };
  if (!markNameByType[type]) {
    return false;
  }
  try {
    const pos = editor.view.posAtDOM(element.firstChild || element, 0);
    editor.chain().focus().setTextSelection(pos).extendMarkRange(markNameByType[type]).run();
  } catch (err) {
    return false;
  }
  const initial = {
    search: type === "footnote" ?
      (
        decodeBase64Utf8(element.getAttribute("data-wiki-footnote-b64")) ||
        element.getAttribute("data-wiki-footnote") ||
        ""
      ) :
      (element.getAttribute("data-wiki-target") || element.getAttribute("data-wiki-username") || element.textContent || "").replace(/^@/, ""),
    label: element.getAttribute("data-wiki-label") || element.textContent || ""
  };
  openWikiEntityDialog({
    editor,
    type,
    options,
    initial,
    replaceMark: true
  });
  return true;
}

function createToolbar(root, editor, uploadImage) {
  const toolbar = document.createElement("div");
  toolbar.className = "wiki-editor-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Wiki editor tools");

  const groups = [];
  const separators = [];
  let activeColorMenu = null;

  function closeColorMenu() {
    if (activeColorMenu && activeColorMenu.parentNode) {
      activeColorMenu.parentNode.removeChild(activeColorMenu);
    }
    activeColorMenu = null;
    document.removeEventListener("mousedown", closeColorMenu);
  }

  function openColorMenu({ button, title, options, onSelect, onClear }) {
    closeColorMenu();

    const menu = document.createElement("div");
    menu.className = "wiki-editor-color-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", title);
    menu.addEventListener("mousedown", function (event) {
      event.stopPropagation();
    });

    options.forEach(function (option) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "wiki-editor-color-swatch";
      swatch.setAttribute("role", "menuitem");
      swatch.setAttribute("title", option.label);
      swatch.setAttribute("aria-label", option.label);
      swatch.style.setProperty("--wiki-editor-swatch-color", option.backgroundColor);
      swatch.addEventListener("click", function (event) {
        event.preventDefault();
        onSelect(option);
        closeColorMenu();
      });
      menu.appendChild(swatch);
    });

    const custom = document.createElement("label");
    custom.className = "wiki-editor-color-custom";
    custom.setAttribute("title", "Custom color");
    custom.setAttribute("aria-label", "Custom color");

    const customIcon = document.createElement("span");
    customIcon.className = "wiki-editor-color-custom__icon";
    customIcon.setAttribute("aria-hidden", "true");
    customIcon.textContent = "+";
    custom.appendChild(customIcon);

    const customColor = document.createElement("input");
    customColor.type = "color";
    customColor.value = (options[0] && normalizeHexColor(options[0].backgroundColor)) || "#fef08a";
    customColor.addEventListener("input", function () {
      const backgroundColor = normalizeHexColor(customColor.value);
      if (!backgroundColor) {
        return;
      }
      onSelect({
        id: "custom",
        label: "Custom",
        backgroundColor
      });
      closeColorMenu();
    });
    custom.appendChild(customColor);
    menu.appendChild(custom);

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "wiki-editor-color-clear";
    clear.setAttribute("role", "menuitem");
    clear.textContent = "Clear";
    clear.addEventListener("click", function (event) {
      event.preventDefault();
      onClear();
      closeColorMenu();
    });
    menu.appendChild(clear);

    document.body.appendChild(menu);
    activeColorMenu = menu;

    const rect = button.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
    window.setTimeout(function () {
      document.addEventListener("mousedown", closeColorMenu);
    }, 0);
  }

  function addGroup(defs, groupId) {
    const schemaGroup = TOP_TOOLBAR_GROUPS.find(function (groupDef) {
      return groupDef.id === groupId;
    });
    if (!schemaGroup) {
      throw new Error(`Unexpected top toolbar group: ${groupId || "(missing)"}`);
    }

    const group = document.createElement("div");
    group.className = "wiki-editor-toolbar__group";
    group.setAttribute("data-toolbar-group", schemaGroup.id);
    group.setAttribute("aria-label", schemaGroup.label);
    const label = document.createElement("span");
    label.className = "wiki-editor-toolbar__group-label";
    label.setAttribute("aria-hidden", "true");
    label.textContent = schemaGroup.label;
    group.appendChild(label);

    const controls = document.createElement("div");
    controls.className = "wiki-editor-toolbar__group-controls";
    group.appendChild(controls);

    defs.forEach(function (def) {
      if (!TOP_TOOLBAR_BUTTON_IDS.includes(def.id)) {
        throw new Error(`Unknown top toolbar button: ${def.id}`);
      }
      if (!schemaGroup.buttonIds.includes(def.id)) {
        throw new Error(`Toolbar button ${def.id} is not part of group ${schemaGroup.id}`);
      }
      const button = createButton(def);
      def.applyState = def.applyState || function () {};
      def.button = button;
      controls.appendChild(button);
    });
    if (groups.length > 0) {
      const separator = document.createElement("span");
      separator.className = "wiki-editor-toolbar__separator";
      separator.setAttribute("aria-hidden", "true");
      toolbar.appendChild(separator);
      separators.push(separator);
    }
    toolbar.appendChild(group);
    groups.push(defs);
  }

  addGroup([
    {
      id: "undo",
      title: "Undo",
      action: function () {
        editor.chain().focus().undo().run();
      },
      applyState: function (button) {
        button.disabled = !editor.can().chain().focus().undo().run();
      }
    },
    {
      id: "redo",
      title: "Redo",
      action: function () {
        editor.chain().focus().redo().run();
      },
      applyState: function (button) {
        button.disabled = !editor.can().chain().focus().redo().run();
      }
    }
  ], "history");

  addGroup([
    {
      id: "paragraph",
      title: "Paragraph",
      action: function () {
        editor.chain().focus().setParagraph().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("paragraph"));
      }
    },
    {
      id: "heading-1",
      title: "Heading 1",
      action: function () {
        editor.chain().focus().toggleHeading({ level: 1 }).run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("heading", { level: 1 }));
      }
    },
    {
      id: "heading-2",
      title: "Heading 2",
      action: function () {
        editor.chain().focus().toggleHeading({ level: 2 }).run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("heading", { level: 2 }));
      }
    },
    {
      id: "heading-3",
      title: "Heading 3",
      action: function () {
        editor.chain().focus().toggleHeading({ level: 3 }).run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("heading", { level: 3 }));
      }
    },
    {
      id: "heading-4",
      title: "Heading 4",
      action: function () {
        editor.chain().focus().toggleHeading({ level: 4 }).run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("heading", { level: 4 }));
      }
    }
  ], "structure");

  addGroup([
    {
      id: "bold",
      title: "Bold",
      action: function () {
        editor.chain().focus().toggleBold().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("bold"));
      }
    },
    {
      id: "italic",
      title: "Italic",
      action: function () {
        editor.chain().focus().toggleItalic().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("italic"));
      }
    },
    {
      id: "underline",
      title: "Underline",
      action: function () {
        editor.chain().focus().toggleUnderline().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("underline"));
      }
    },
    {
      id: "strike",
      title: "Strike",
      action: function () {
        editor.chain().focus().toggleStrike().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("strike"));
      }
    },
    {
      id: "inline-code",
      title: "Inline code",
      action: function () {
        editor.chain().focus().toggleCode().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("code"));
      }
    },
    {
      id: "highlight",
      title: "Highlight",
      action: function ({ button }) {
        openColorMenu({
          button,
          title: "Highlight color",
          options: HIGHLIGHT_COLOR_OPTIONS,
          onSelect: function (option) {
            const backgroundColor = option.backgroundColor;
            const textColor = getReadableTextColor(backgroundColor);
            editor.chain().focus().toggleHighlight({ color: backgroundColor, textColor }).run();
          },
          onClear: function () {
            editor.chain().focus().unsetHighlight().run();
          }
        });
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("highlight"));
      }
    },
    {
      id: "strip-span-styling",
      title: "Strip span",
      action: function () {
        stripStyledSpanSelection(editor);
      },
      applyState: function (button) {
        const active = selectionHasStyledSpan(editor);
        button.disabled = !active;
        button.classList.toggle("active", active);
      }
    },
    {
      id: "subscript",
      title: "Subscript",
      action: function () {
        editor.chain().focus().toggleSubscript().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("subscript"));
      }
    },
    {
      id: "superscript",
      title: "Superscript",
      action: function () {
        editor.chain().focus().toggleSuperscript().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("superscript"));
      }
    }
  ], "inline-formatting");

  addGroup([
    {
      id: "link",
      title: "Set external link",
      action: function () {
        openExternalLinkDialog({ editor });
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("link"));
      }
    },
    {
      id: "wiki-page-link",
      title: "Insert wiki page link",
      action: function () {
        openWikiEntityDialog({ editor, type: "page", options: root.__wikiEditorOptions || {} });
      }
    },
    {
      id: "wiki-user-mention",
      title: "Insert forum user",
      action: function () {
        openWikiEntityDialog({ editor, type: "user", options: root.__wikiEditorOptions || {} });
      }
    },
    {
      id: "wiki-footnote",
      title: "Insert footnote",
      action: function () {
        openWikiEntityDialog({ editor, type: "footnote", options: root.__wikiEditorOptions || {} });
      }
    },
    {
      id: "image-upload",
      title: "Upload image",
      action: function () {
        uploadImage();
      }
    },
    {
      id: "media-row-2",
      title: "Insert two-column media row",
      badge: "2",
      action: function () {
        editor.chain().focus().insertMediaRow(2).run();
      }
    },
    {
      id: "media-row-3",
      title: "Insert three-column media row",
      badge: "3",
      action: function () {
        editor.chain().focus().insertMediaRow(3).run();
      }
    }
  ], "links-media");

  addGroup([
    {
      id: "bullet-list",
      title: "Bullet list",
      action: function () {
        editor.chain().focus().toggleBulletList().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("bulletList"));
      }
    },
    {
      id: "ordered-list",
      title: "Ordered list",
      action: function () {
        editor.chain().focus().toggleOrderedList().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("orderedList"));
      }
    },
    {
      id: "task-list",
      title: "Task list",
      action: function () {
        editor.chain().focus().toggleTaskList().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("taskList"));
      }
    },
    {
      id: "blockquote",
      title: "Poetry quote",
      action: function () {
        editor.chain().focus().insertWikiPoetryQuote().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("wikiPoetryQuote"));
      }
    },
    {
      id: "code-block",
      title: "Code block",
      action: function () {
        editor.chain().focus().toggleCodeBlock().run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("codeBlock"));
      }
    },
    {
      id: "block-background",
      title: "Text block background",
      action: function ({ button }) {
        openColorMenu({
          button,
          title: "Text block background color",
          options: BLOCK_BACKGROUND_COLOR_OPTIONS,
          onSelect: function (option) {
            const backgroundColor = option.backgroundColor;
            const textColor = getReadableTextColor(backgroundColor);
            editor.chain().focus().setWikiBlockBackground({ backgroundColor, textColor }).run();
          },
          onClear: function () {
            editor.chain().focus().unsetWikiBlockBackground().run();
          }
        });
      }
    },
    {
      id: "horizontal-rule",
      title: "Horizontal rule",
      action: function () {
        editor.chain().focus().setHorizontalRule().run();
      }
    },
    {
      id: "infobox-insert",
      title: "Insert infobox",
      action: function () {
        editor.chain().focus().insertWikiInfobox().run();
      }
    }
  ], "blocks");

  addGroup([
    {
      id: "callout-info",
      title: "Toggle info callout",
      action: function () {
        if (editor.isActive("wikiCallout", { type: "info" })) {
          editor.chain().focus().unsetWikiCallout().run();
          return;
        }
        editor.chain().focus().insertWikiCallout({ type: "info", title: "Info" }).run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("wikiCallout", { type: "info" }));
      }
    },
    {
      id: "callout-success",
      title: "Toggle success callout",
      action: function () {
        if (editor.isActive("wikiCallout", { type: "success" })) {
          editor.chain().focus().unsetWikiCallout().run();
          return;
        }
        editor.chain().focus().insertWikiCallout({ type: "success", title: "Remember" }).run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("wikiCallout", { type: "success" }));
      }
    },
    {
      id: "callout-warning",
      title: "Toggle warning callout",
      action: function () {
        if (editor.isActive("wikiCallout", { type: "warning" })) {
          editor.chain().focus().unsetWikiCallout().run();
          return;
        }
        editor.chain().focus().insertWikiCallout({ type: "warning", title: "Warning" }).run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("wikiCallout", { type: "warning" }));
      }
    },
    {
      id: "callout-danger",
      title: "Toggle danger callout",
      action: function () {
        if (editor.isActive("wikiCallout", { type: "danger" })) {
          editor.chain().focus().unsetWikiCallout().run();
          return;
        }
        editor.chain().focus().insertWikiCallout({ type: "danger", title: "Danger" }).run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive("wikiCallout", { type: "danger" }));
      }
    }
  ], "callouts");

  addGroup([
    {
      id: "align-left",
      title: "Align left",
      action: function () {
        editor.chain().focus().setTextAlign("left").run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive({ textAlign: "left" }));
      }
    },
    {
      id: "align-center",
      title: "Align center",
      action: function () {
        editor.chain().focus().setTextAlign("center").run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive({ textAlign: "center" }));
      }
    },
    {
      id: "align-right",
      title: "Align right",
      action: function () {
        editor.chain().focus().setTextAlign("right").run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive({ textAlign: "right" }));
      }
    },
    {
      id: "align-justify",
      title: "Justify",
      action: function () {
        editor.chain().focus().setTextAlign("justify").run();
      },
      applyState: function (button) {
        button.classList.toggle("active", editor.isActive({ textAlign: "justify" }));
      }
    }
  ], "alignment");

  addGroup([
    {
      id: "table-insert",
      title: "Insert table",
      action: function () {
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      }
    },
    {
      id: "dnd-alignment-table",
      title: "D&D alignment table",
      action: function () {
        openAlignmentTableDialog({ editor });
      }
    }
  ], "tables");

  addGroup([
    {
      id: "fullscreen-source",
      title: "Toggle fullscreen source editor",
      action: function () {
        if (typeof root.__wikiToggleFullscreenSource === "function") {
          root.__wikiToggleFullscreenSource();
        }
      },
      applyState: function (button) {
        const active = typeof root.__wikiIsFullscreenSourceActive === "function" && root.__wikiIsFullscreenSourceActive();
        button.classList.toggle("active", !!active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }
  ], "view");

  function syncToolbar() {
    groups.forEach(function (defs) {
      defs.forEach(function (def) {
        def.button.disabled = false;
        def.button.classList.remove("active");
        def.applyState(def.button);
      });
    });
    syncToolbarLayout();
  }

  function syncToolbarSeparators() {
    separators.forEach(function (separator) {
      const previousGroup = separator.previousElementSibling;
      const nextGroup = separator.nextElementSibling;
      const sameRow = previousGroup &&
        nextGroup &&
        previousGroup.offsetTop === nextGroup.offsetTop;
      separator.hidden = !sameRow;
    });
  }

  function syncToolbarHeight() {
    const editorRoot = root.closest(".wiki-editor");
    if (!editorRoot) {
      return;
    }

    editorRoot.style.setProperty("--wiki-editor-main-toolbar-height", `${Math.ceil(root.getBoundingClientRect().height)}px`);
  }

  function syncToolbarLayout() {
    syncToolbarSeparators();
    syncToolbarHeight();
  }

  const toolbarEventTarget = root.closest(".wiki-editor") || root;

  editor.on("create", syncToolbar);
  editor.on("selectionUpdate", syncToolbar);
  editor.on("transaction", syncToolbar);
  editor.on("focus", syncToolbar);
  editor.on("blur", syncToolbar);
  window.addEventListener("resize", syncToolbarLayout);
  toolbarEventTarget.addEventListener("wiki-editor-fullscreen-source-change", syncToolbar);

  root.appendChild(toolbar);
  syncToolbar();
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(syncToolbarLayout);
  } else {
    setTimeout(syncToolbarLayout, 0);
  }

  return {
    destroy: function () {
      const editorRoot = root.closest(".wiki-editor");
      if (editorRoot) {
        editorRoot.style.removeProperty("--wiki-editor-main-toolbar-height");
      }
      window.removeEventListener("resize", syncToolbarLayout);
      toolbarEventTarget.removeEventListener("wiki-editor-fullscreen-source-change", syncToolbar);
    }
  };
}

function getImageToolDefs(editor) {
  return [
    {
      id: "image-align-center",
      title: "Center image",
      action: function () {
        setSelectedImageLayout(editor, "center");
      },
      applyState: function (button) {
        button.classList.toggle("active", isImageLayoutActive(editor, "center"));
      }
    },
    {
      id: "image-align-left",
      title: "Align image left",
      action: function () {
        setSelectedImageLayout(editor, "left");
      },
      applyState: function (button) {
        button.classList.toggle("active", isImageLayoutActive(editor, "left"));
      }
    },
    {
      id: "image-align-right",
      title: "Align image right",
      action: function () {
        setSelectedImageLayout(editor, "right");
      },
      applyState: function (button) {
        button.classList.toggle("active", isImageLayoutActive(editor, "right"));
      }
    },
    {
      id: "image-align-side",
      title: "Wrap text around image",
      action: function () {
        setSelectedImageLayout(editor, "side");
      },
      applyState: function (button) {
        button.classList.toggle("active", isImageLayoutActive(editor, "side"));
      }
    },
    {
      id: "image-size-sm",
      title: "Small image",
      action: function () {
        setSelectedImageSize(editor, "sm");
      },
      applyState: function (button) {
        button.classList.toggle("active", isImageSizeActive(editor, "sm"));
      }
    },
    {
      id: "image-size-md",
      title: "Medium image",
      action: function () {
        setSelectedImageSize(editor, "md");
      },
      applyState: function (button) {
        button.classList.toggle("active", isImageSizeActive(editor, "md"));
      }
    },
    {
      id: "image-size-lg",
      title: "Large image",
      action: function () {
        setSelectedImageSize(editor, "lg");
      },
      applyState: function (button) {
        button.classList.toggle("active", isImageSizeActive(editor, "lg"));
      }
    },
    {
      id: "image-size-full",
      title: "Full-width image",
      action: function () {
        setSelectedImageSize(editor, "full");
      },
      applyState: function (button) {
        button.classList.toggle("active", isImageSizeActive(editor, "full"));
      }
    },
    {
      id: "image-convert-figure",
      title: "Toggle figure caption",
      action: function () {
        const nodeName = getActiveImageNodeName(editor);
        if (nodeName === "imageFigure") {
          editor.chain().focus().convertFigureToImage().run();
          return;
        }
        editor.chain().focus().convertImageToFigure().run();
      },
      applyState: function (button) {
        const nodeName = getActiveImageNodeName(editor);
        button.disabled = nodeName !== "image" && nodeName !== "imageFigure";
        button.classList.toggle("active", nodeName === "imageFigure");
      }
    }
  ];
}

function positionImageTools(editor, panel, surface) {
  const { selection } = editor.state;
  const selectedDom = editor.view.nodeDOM(selection.from);
  const imageEl = selectedDom && selectedDom.nodeType === 1
    ? (
      selectedDom.matches("img, figure.image")
        ? selectedDom
        : selectedDom.querySelector("img, figure.image")
    )
    : null;

  if (!imageEl || !surface.contains(imageEl)) {
    panel.style.left = "";
    panel.style.top = "";
    return;
  }

  const surfaceRect = surface.getBoundingClientRect();
  const imageRect = imageEl.getBoundingClientRect();
  const panelWidth = panel.offsetWidth || 256;
  const left = Math.max(8, Math.min(imageRect.left - surfaceRect.left, surfaceRect.width - panelWidth - 8));
  const top = Math.max(8, imageRect.top - surfaceRect.top - panel.offsetHeight - 8);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function createImageContextToolbar(surface, editor) {
  const panel = document.createElement("div");
  panel.className = "wiki-editor-image-tools";
  panel.setAttribute("role", "toolbar");
  panel.setAttribute("aria-label", "Selected image tools");
  panel.hidden = true;

  const defs = getImageToolDefs(editor);
  defs.forEach(function (def) {
    if (!IMAGE_CONTEXT_BUTTON_IDS.includes(def.id)) {
      throw new Error(`Unknown image context button: ${def.id}`);
    }
    def.button = createButton(def);
    panel.appendChild(def.button);
  });

  function syncImageTools() {
    const hasImage = !!getActiveImageNodeName(editor);
    panel.hidden = !hasImage;
    if (!hasImage) {
      return;
    }

    defs.forEach(function (def) {
      def.button.classList.remove("active");
      def.button.disabled = false;
      def.applyState(def.button);
    });
    positionImageTools(editor, panel, surface);
  }

  editor.on("create", syncImageTools);
  editor.on("selectionUpdate", syncImageTools);
  editor.on("transaction", syncImageTools);
  editor.on("focus", syncImageTools);
  editor.on("blur", syncImageTools);
  window.addEventListener("resize", syncImageTools);
  surface.appendChild(panel);
  syncImageTools();

  return {
    destroy: function () {
      window.removeEventListener("resize", syncImageTools);
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }
  };
}

function getSelectionElement(editor) {
  const domAtPos = editor.view.domAtPos(editor.state.selection.from);
  const node = domAtPos && domAtPos.node;
  if (!node) {
    return null;
  }
  return node.nodeType === 1 ? node : node.parentElement;
}

function getActiveAlignmentTableElement(editor, surface) {
  const selectedDom = editor.view.nodeDOM(editor.state.selection.from);
  if (selectedDom && selectedDom.nodeType === 1 && selectedDom.matches('[data-wiki-node="alignment-table"]') && surface.contains(selectedDom)) {
    return selectedDom;
  }
  const selectionElement = getSelectionElement(editor);
  const table = selectionElement && typeof selectionElement.closest === "function" ? selectionElement.closest('[data-wiki-node="alignment-table"]') : null;
  return table && surface.contains(table) ? table : null;
}

function getActivePoetryQuoteElement(editor, surface) {
  const selectedDom = editor.view.nodeDOM(editor.state.selection.from);
  const quoteSelector = '[data-wiki-node="poetry-quote"], figure.wiki-poetry-quote';
  if (selectedDom && selectedDom.nodeType === 1 && selectedDom.matches(quoteSelector) && surface.contains(selectedDom)) {
    return selectedDom;
  }
  const selectionElement = getSelectionElement(editor);
  const quote = selectionElement && typeof selectionElement.closest === "function" ? selectionElement.closest(quoteSelector) : null;
  return quote && surface.contains(quote) ? quote : null;
}

function getActiveMediaRowElement(editor, surface) {
  const selectedDom = editor.view.nodeDOM(editor.state.selection.from);
  if (selectedDom && selectedDom.nodeType === 1 && selectedDom.matches('[data-wiki-node="media-row"]') && surface.contains(selectedDom)) {
    return selectedDom;
  }
  const selectionElement = getSelectionElement(editor);
  const row = selectionElement && typeof selectionElement.closest === "function" ? selectionElement.closest('[data-wiki-node="media-row"]') : null;
  return row && surface.contains(row) ? row : null;
}

function getActiveMediaCellElement(editor, surface) {
  const selectedDom = editor.view.nodeDOM(editor.state.selection.from);
  if (selectedDom && selectedDom.nodeType === 1 && selectedDom.matches('[data-wiki-node="media-cell"]') && surface.contains(selectedDom)) {
    return selectedDom;
  }
  const selectionElement = getSelectionElement(editor);
  const cell = selectionElement && typeof selectionElement.closest === "function" ? selectionElement.closest('[data-wiki-node="media-cell"]') : null;
  return cell && surface.contains(cell) ? cell : null;
}

function getActiveInfoboxElement(editor, surface) {
  const selectedDom = editor.view.nodeDOM(editor.state.selection.from);
  if (selectedDom && selectedDom.nodeType === 1 && selectedDom.matches('[data-wiki-node="infobox"]') && surface.contains(selectedDom)) {
    return selectedDom;
  }
  const selectionElement = getSelectionElement(editor);
  const infobox = selectionElement && typeof selectionElement.closest === "function" ? selectionElement.closest('[data-wiki-node="infobox"]') : null;
  return infobox && surface.contains(infobox) ? infobox : null;
}

function positionInfoboxRail(panel, infobox, surface) {
  const surfaceRect = surface.getBoundingClientRect();
  const boxRect = infobox.getBoundingClientRect();
  const panelWidth = panel.offsetWidth || 38;
  const left = Math.max(8, boxRect.left - surfaceRect.left - panelWidth - 8);
  const visibleTop = Math.max(boxRect.top, surfaceRect.top + 8);
  const visibleBottom = Math.min(boxRect.bottom, window.innerHeight - 12);
  const top = Math.max(8, visibleTop - surfaceRect.top + Math.max(0, Math.min(48, (visibleBottom - visibleTop) / 4)));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function selectPoetryQuote(editor, target, surface) {
  const element = target && typeof target.closest === "function" ? target.closest('[data-wiki-node="poetry-quote"], figure.wiki-poetry-quote') : null;
  if (!element || !surface.contains(element)) {
    return false;
  }
  if (target.closest("p, h1, h2, h3, h4, h5, h6, li")) {
    return false;
  }
  const pos = editor.view.posAtDOM(element, 0);
  if (pos == null) {
    return false;
  }
  return editor.chain().focus().setNodeSelection(pos).run();
}

function selectAlignmentTable(editor, target, surface) {
  const element = target && typeof target.closest === "function" ? target.closest('[data-wiki-node="alignment-table"]') : null;
  if (!element || !surface.contains(element)) {
    return false;
  }
  const pos = editor.view.posAtDOM(element, 0);
  if (pos == null) {
    return false;
  }
  return editor.chain().focus().setNodeSelection(pos).run();
}

function getActiveCodeBlockElement(editor, surface) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "codeBlock") {
      const element = editor.view.nodeDOM($from.before(depth));
      return element && surface.contains(element) ? element : null;
    }
  }
  return null;
}

function positionContextPanel(panel, targetEl, surface) {
  const surfaceRect = surface.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const panelWidth = panel.offsetWidth || 320;
  const left = Math.max(8, Math.min(targetRect.left - surfaceRect.left, surfaceRect.width - panelWidth - 8));
  const top = Math.max(8, targetRect.top - surfaceRect.top - panel.offsetHeight - 8);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function createCodeBlockLanguageToolbar(surface, editor) {
  const panel = document.createElement("div");
  panel.className = "wiki-editor-context-tools wiki-editor-code-language-tools";
  panel.setAttribute("aria-label", "Code block syntax");
  panel.hidden = true;

  const select = document.createElement("select");
  select.className = "form-select form-select-sm wiki-editor-code-language-select";
  select.setAttribute("aria-label", "Code block syntax");
  CODE_BLOCK_LANGUAGE_OPTIONS.forEach(function (language) {
    const option = document.createElement("option");
    option.value = language.value;
    option.textContent = language.label;
    select.appendChild(option);
  });
  panel.appendChild(select);

  select.addEventListener("mousedown", function (event) {
    event.stopPropagation();
  });
  select.addEventListener("change", function () {
    editor.chain().focus().setCodeBlockLanguage(select.value).run();
  });

  function syncCodeBlockLanguageTools() {
    const codeBlock = editor.isActive("codeBlock") ? getActiveCodeBlockElement(editor, surface) : null;
    panel.hidden = !codeBlock;
    if (!codeBlock) {
      return;
    }
    select.value = editor.getAttributes("codeBlock").language || "";
    positionContextPanel(panel, codeBlock, surface);
  }

  editor.on("create", syncCodeBlockLanguageTools);
  editor.on("selectionUpdate", syncCodeBlockLanguageTools);
  editor.on("transaction", syncCodeBlockLanguageTools);
  editor.on("focus", syncCodeBlockLanguageTools);
  editor.on("blur", syncCodeBlockLanguageTools);
  window.addEventListener("resize", syncCodeBlockLanguageTools);
  surface.appendChild(panel);
  syncCodeBlockLanguageTools();

  return {
    destroy: function () {
      window.removeEventListener("resize", syncCodeBlockLanguageTools);
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }
  };
}

function createAlignmentTableContextToolbar(surface, editor) {
  const panel = document.createElement("div");
  panel.className = "wiki-editor-context-tools wiki-editor-alignment-table-tools";
  panel.setAttribute("role", "toolbar");
  panel.setAttribute("aria-label", "Selected alignment table tools");
  panel.hidden = true;

  const edit = createButton({
    id: "dnd-alignment-table-edit",
    title: "Edit alignment table",
    action: function () {
      openAlignmentTableDialog({ editor });
    }
  });
  const remove = createButton({
    id: "table-delete",
    title: "Delete alignment table",
    action: function () {
      editor.chain().focus().deleteSelection().run();
    }
  });
  panel.appendChild(edit);
  panel.appendChild(remove);

  function syncAlignmentTableTools() {
    const table = editor.isActive("wikiAlignmentTable") ? getActiveAlignmentTableElement(editor, surface) : null;
    panel.hidden = !table;
    if (table) {
      positionContextPanel(panel, table, surface);
    }
  }

  editor.on("create", syncAlignmentTableTools);
  editor.on("selectionUpdate", syncAlignmentTableTools);
  editor.on("transaction", syncAlignmentTableTools);
  editor.on("focus", syncAlignmentTableTools);
  editor.on("blur", syncAlignmentTableTools);
  window.addEventListener("resize", syncAlignmentTableTools);
  surface.appendChild(panel);
  syncAlignmentTableTools();

  return {
    destroy: function () {
      window.removeEventListener("resize", syncAlignmentTableTools);
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }
  };
}

function createPoetryQuoteContextToolbar(surface, editor) {
  const panel = document.createElement("div");
  panel.className = "wiki-editor-context-tools wiki-editor-poetry-quote-tools";
  panel.setAttribute("role", "toolbar");
  panel.setAttribute("aria-label", "Selected poetry quote tools");
  panel.hidden = true;

  const alignLeft = createButton({
    id: "poetry-quote-align-left",
    title: "Position quote left",
    action: function () {
      editor.chain().focus().setWikiPoetryQuotePosition("left").run();
    },
    applyState: function (button) {
      button.classList.toggle("active", (editor.getAttributes("wikiPoetryQuote").position || "left") === "left");
    }
  });
  const alignCenter = createButton({
    id: "poetry-quote-align-center",
    title: "Position quote center",
    action: function () {
      editor.chain().focus().setWikiPoetryQuotePosition("center").run();
    },
    applyState: function (button) {
      button.classList.toggle("active", editor.getAttributes("wikiPoetryQuote").position === "center");
    }
  });
  const alignRight = createButton({
    id: "poetry-quote-align-right",
    title: "Position quote right",
    action: function () {
      editor.chain().focus().setWikiPoetryQuotePosition("right").run();
    },
    applyState: function (button) {
      button.classList.toggle("active", editor.getAttributes("wikiPoetryQuote").position === "right");
    }
  });
  const container = createButton({
    id: "poetry-quote-container",
    title: "Toggle quote container",
    action: function () {
      editor.chain().focus().toggleWikiPoetryQuoteContainer().run();
    },
    applyState: function (button) {
      button.classList.toggle("active", editor.getAttributes("wikiPoetryQuote").container !== false);
    }
  });
  const unwrap = createButton({
    id: "poetry-quote-unwrap",
    title: "Unwrap quote content",
    action: function () {
      editor.chain().focus().unsetWikiPoetryQuote().run();
    },
    applyState: function () {}
  });
  panel.appendChild(alignLeft);
  panel.appendChild(alignCenter);
  panel.appendChild(alignRight);
  panel.appendChild(container);
  panel.appendChild(unwrap);

  function syncPoetryQuoteTools() {
    const quote = editor.isActive("wikiPoetryQuote") ? getActivePoetryQuoteElement(editor, surface) : null;
    panel.hidden = !quote;
    if (!quote) {
      return;
    }
    const activePosition = editor.getAttributes("wikiPoetryQuote").position || "left";
    alignLeft.disabled = false;
    alignCenter.disabled = false;
    alignRight.disabled = false;
    alignLeft.classList.toggle("active", activePosition === "left");
    alignCenter.classList.toggle("active", activePosition === "center");
    alignRight.classList.toggle("active", activePosition === "right");
    container.classList.remove("active");
    container.disabled = false;
    unwrap.disabled = false;
    container.classList.toggle("active", editor.getAttributes("wikiPoetryQuote").container !== false);
    positionContextPanel(panel, quote, surface);
  }

  editor.on("create", syncPoetryQuoteTools);
  editor.on("selectionUpdate", syncPoetryQuoteTools);
  editor.on("transaction", syncPoetryQuoteTools);
  editor.on("focus", syncPoetryQuoteTools);
  editor.on("blur", syncPoetryQuoteTools);
  window.addEventListener("resize", syncPoetryQuoteTools);
  surface.appendChild(panel);
  syncPoetryQuoteTools();

  return {
    destroy: function () {
      window.removeEventListener("resize", syncPoetryQuoteTools);
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }
  };
}

function colorValueToInputHex(value, fallback) {
  const directHex = normalizeHexColor(value);
  if (directHex) {
    return directHex;
  }

  const match = String(value || "").match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (!match) {
    return fallback;
  }

  const channels = match.slice(1, 4).map(function (channel) {
    const valueNumber = Math.max(0, Math.min(255, parseInt(channel, 10) || 0));
    return valueNumber.toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function createMediaCellColorField(labelText, input) {
  const field = document.createElement("label");
  field.className = "wiki-editor-media-cell-color-menu__field";

  const label = document.createElement("span");
  label.className = "wiki-editor-media-cell-color-menu__label";
  label.textContent = labelText;
  field.appendChild(label);

  input.className = "wiki-editor-media-cell-color-menu__input";
  input.setAttribute("aria-label", labelText);
  field.appendChild(input);

  const value = document.createElement("span");
  value.className = "wiki-editor-media-cell-color-menu__value";
  field.appendChild(value);

  function syncValue() {
    value.textContent = input.value.toUpperCase();
  }

  input.addEventListener("input", syncValue);
  syncValue();
  return field;
}

function createMediaCellNumberField(labelText, input, suffixText) {
  const field = document.createElement("label");
  field.className = "wiki-editor-media-cell-color-menu__field";

  const label = document.createElement("span");
  label.className = "wiki-editor-media-cell-color-menu__label";
  label.textContent = labelText;
  field.appendChild(label);

  input.className = "wiki-editor-media-cell-color-menu__input wiki-editor-media-cell-color-menu__number";
  input.setAttribute("aria-label", labelText);
  field.appendChild(input);

  const value = document.createElement("span");
  value.className = "wiki-editor-media-cell-color-menu__value";
  field.appendChild(value);

  function syncValue() {
    value.textContent = `${input.value || "0"}${suffixText || ""}`;
  }

  input.addEventListener("input", syncValue);
  syncValue();
  return field;
}

function borderWidthValueToInputNumber(value, fallback) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
  if (!match) {
    return fallback;
  }
  return String(Math.max(0, Math.min(12, parseFloat(match[1]) || 0)));
}

function borderWidthInputToStyleValue(value) {
  const parsed = parseFloat(String(value || "").trim());
  if (!Number.isFinite(parsed)) {
    return "";
  }
  const clamped = Math.max(0, Math.min(12, parsed));
  const rounded = Math.round(clamped * 10) / 10;
  return `${rounded}px`;
}

function createMediaCellColorMenu(button, editor) {
  const existing = document.querySelector(".wiki-editor-media-cell-color-menu");
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }

  const menu = document.createElement("div");
  menu.className = "wiki-editor-color-menu wiki-editor-media-cell-color-menu";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", "Media cell custom style");

  const targetPositions = getTargetMediaCellPositions(editor.state);
  const attrs = editor.getAttributes("mediaCell") || {};
  const backgroundInput = document.createElement("input");
  backgroundInput.type = "color";
  backgroundInput.value = colorValueToInputHex(attrs.backgroundColor, "#22172d");
  menu.appendChild(createMediaCellColorField("Background color", backgroundInput));

  const borderInput = document.createElement("input");
  borderInput.type = "color";
  borderInput.value = colorValueToInputHex(attrs.borderColor, "#7b617f");
  menu.appendChild(createMediaCellColorField("Border color", borderInput));

  const borderWidthInput = document.createElement("input");
  borderWidthInput.type = "number";
  borderWidthInput.min = "0";
  borderWidthInput.max = "12";
  borderWidthInput.step = "0.5";
  borderWidthInput.inputMode = "decimal";
  borderWidthInput.value = borderWidthValueToInputNumber(attrs.borderWidth, "1");
  menu.appendChild(createMediaCellNumberField("Border size", borderWidthInput, "px"));

  function applyColorValues() {
    editor.commands.setMediaCellColorsAtPositions(targetPositions, {
      backgroundColor: backgroundInput.value,
      textColor: getReadableTextColor(backgroundInput.value),
      borderColor: borderInput.value,
      borderWidth: borderWidthInputToStyleValue(borderWidthInput.value)
    });
  }

  [backgroundInput, borderInput, borderWidthInput].forEach(function (input) {
    input.addEventListener("input", applyColorValues);
    input.addEventListener("change", applyColorValues);
  });

  const actions = document.createElement("div");
  actions.className = "wiki-editor-media-cell-color-menu__actions";
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "btn btn-primary btn-sm";
  apply.textContent = "Apply";
  apply.addEventListener("click", function (event) {
    event.preventDefault();
    applyColorValues();
    editor.commands.focus();
    document.removeEventListener("mousedown", closeOnOutside);
    menu.remove();
  });
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "btn btn-outline-secondary btn-sm";
  clear.textContent = "Clear";
  clear.addEventListener("click", function (event) {
    event.preventDefault();
    editor.chain().focus().clearMediaCellStyleAtPositions(targetPositions).run();
    document.removeEventListener("mousedown", closeOnOutside);
    menu.remove();
  });
  actions.appendChild(apply);
  actions.appendChild(clear);
  menu.appendChild(actions);

  function closeOnOutside(event) {
    if (!menu.contains(event.target)) {
      menu.remove();
      document.removeEventListener("mousedown", closeOnOutside);
    }
  }

  menu.addEventListener("mousedown", function (event) {
    event.stopPropagation();
  });
  document.body.appendChild(menu);
  const rect = button.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
  window.setTimeout(function () {
    document.addEventListener("mousedown", closeOnOutside);
  }, 0);
}

function createMediaRowContextToolbar(surface, editor) {
  const panel = document.createElement("div");
  panel.className = "wiki-editor-context-tools wiki-editor-media-row-tools";
  panel.setAttribute("role", "toolbar");
  panel.setAttribute("aria-label", "Media row tools");
  panel.hidden = true;

  const addBefore = createButton({
    id: "media-cell-add-before",
    title: "Add media cell before",
    action: function () {
      editor.chain().focus().addMediaCellBefore().run();
    }
  });
  const addAfter = createButton({
    id: "media-cell-add-after",
    title: "Add media cell after",
    action: function () {
      editor.chain().focus().addMediaCellAfter().run();
    }
  });
  const deleteCell = createButton({
    id: "media-cell-delete",
    title: "Delete media cell",
    action: function () {
      editor.chain().focus().deleteMediaCell().run();
    }
  });
  const unwrapRow = createButton({
    id: "media-row-unwrap",
    title: "Unwrap media row",
    action: function () {
      editor.chain().focus().unwrapMediaRow().run();
    }
  });
  const deleteRow = createButton({
    id: "media-row-delete",
    title: "Delete media row",
    action: function () {
      editor.chain().focus().deleteMediaRow().run();
    }
  });
  const styleShadow = createButton({
    id: "media-cell-style-shadow",
    title: "Shadow media cell",
    action: function () {
      editor.chain().focus().setMediaCellStyle("shadow").run();
    }
  });
  const styleGilded = createButton({
    id: "media-cell-style-gilded",
    title: "Gilded media cell",
    action: function () {
      editor.chain().focus().setMediaCellStyle("gilded").run();
    }
  });
  const styleWell = createButton({
    id: "media-cell-style-well",
    title: "Well media cell",
    action: function () {
      editor.chain().focus().setMediaCellStyle("well").run();
    }
  });
  const styleColors = createButton({
    id: "media-cell-style-colors",
    title: "Media cell custom style",
    action: function ({ button }) {
      createMediaCellColorMenu(button, editor);
    }
  });
  const styleClear = createButton({
    id: "media-cell-style-clear",
    title: "Clear media cell style",
    action: function () {
      editor.chain().focus().clearMediaCellStyle().run();
    }
  });

  [addBefore, addAfter, deleteCell, unwrapRow, deleteRow, styleShadow, styleGilded, styleWell, styleColors, styleClear].forEach(function (button) {
    panel.appendChild(button);
  });

  function syncMediaRowTools() {
    const row = editor.isActive("mediaRow") ? getActiveMediaRowElement(editor, surface) : null;
    const cell = editor.isActive("mediaCell") ? getActiveMediaCellElement(editor, surface) : null;
    const activePreset = editor.getAttributes("mediaCell").stylePreset || "";
    panel.hidden = !row;
    if (!row) {
      return;
    }

    addBefore.disabled = !cell;
    addAfter.disabled = !cell;
    deleteCell.disabled = !cell;
    unwrapRow.disabled = false;
    deleteRow.disabled = false;
    [styleShadow, styleGilded, styleWell, styleColors, styleClear].forEach(function (button) {
      button.disabled = !cell;
    });
    styleShadow.classList.toggle("active", activePreset === "shadow");
    styleGilded.classList.toggle("active", activePreset === "gilded");
    styleWell.classList.toggle("active", activePreset === "well");
    styleColors.classList.toggle("active", activePreset === "custom");
    positionContextPanel(panel, cell || row, surface);
  }

  editor.on("create", syncMediaRowTools);
  editor.on("selectionUpdate", syncMediaRowTools);
  editor.on("transaction", syncMediaRowTools);
  editor.on("focus", syncMediaRowTools);
  editor.on("blur", syncMediaRowTools);
  window.addEventListener("resize", syncMediaRowTools);
  surface.appendChild(panel);
  syncMediaRowTools();

  return {
    destroy: function () {
      window.removeEventListener("resize", syncMediaRowTools);
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }
  };
}

function createInfoboxContextToolbar(surface, editor) {
  const panel = document.createElement("div");
  panel.className = "wiki-editor-context-tools wiki-editor-infobox-rail";
  panel.setAttribute("role", "toolbar");
  panel.setAttribute("aria-label", "Infobox tools");
  panel.hidden = true;

  function addRailButton(def) {
    if (!INFOBOX_CONTEXT_BUTTON_IDS.includes(def.id)) {
      throw new Error(`Unknown infobox context button: ${def.id}`);
    }
    const button = createButton(def);
    panel.appendChild(button);
    return button;
  }

  const buttons = [
    addRailButton({ id: "infobox-add-title", title: "Add infobox title", action: function () { editor.chain().focus().addWikiInfoboxTitle().run(); } }),
    addRailButton({ id: "infobox-add-subtitle", title: "Add infobox subtitle", action: function () { editor.chain().focus().addWikiInfoboxSubtitle().run(); } }),
    addRailButton({ id: "infobox-add-image", title: "Add infobox image slot", action: function () { editor.chain().focus().addWikiInfoboxImage().run(); } }),
    addRailButton({ id: "infobox-add-section", title: "Add infobox section", action: function () { editor.chain().focus().addWikiInfoboxSection().run(); } }),
    addRailButton({ id: "infobox-add-row", title: "Add infobox row", action: function () { editor.chain().focus().addWikiInfoboxRow().run(); } }),
    addRailButton({ id: "infobox-add-content", title: "Add infobox content block", action: function () { editor.chain().focus().addWikiInfoboxContent().run(); } }),
    addRailButton({ id: "infobox-move-helper-up", title: "Move infobox block up", action: function () { editor.chain().focus().moveWikiInfoboxHelperUp().run(); } }),
    addRailButton({ id: "infobox-move-helper-down", title: "Move infobox block down", action: function () { editor.chain().focus().moveWikiInfoboxHelperDown().run(); } }),
    addRailButton({ id: "infobox-delete-helper", title: "Delete infobox block", action: function () { editor.chain().focus().deleteWikiInfoboxHelper().run(); } }),
    addRailButton({ id: "infobox-unwrap", title: "Unwrap infobox", action: function () { editor.chain().focus().unwrapWikiInfobox().run(); } }),
    addRailButton({ id: "infobox-delete", title: "Delete infobox", action: function () { editor.chain().focus().deleteWikiInfobox().run(); } })
  ];
  const helperAvailability = {
    "infobox-move-helper-up": function () {
      return editor.can().moveWikiInfoboxHelperUp();
    },
    "infobox-move-helper-down": function () {
      return editor.can().moveWikiInfoboxHelperDown();
    },
    "infobox-delete-helper": function () {
      return editor.can().deleteWikiInfoboxHelper();
    }
  };

  function syncInfoboxTools() {
    const infobox = editor.isActive("wikiInfobox") ? getActiveInfoboxElement(editor, surface) : null;
    panel.hidden = !infobox;
    if (!infobox) {
      return;
    }
    buttons.forEach(function (button) {
      const availability = helperAvailability[button.getAttribute("data-toolbar-id")];
      button.disabled = availability ? !availability() : false;
    });
    positionInfoboxRail(panel, infobox, surface);
  }

  editor.on("create", syncInfoboxTools);
  editor.on("selectionUpdate", syncInfoboxTools);
  editor.on("transaction", syncInfoboxTools);
  editor.on("focus", syncInfoboxTools);
  editor.on("blur", syncInfoboxTools);
  window.addEventListener("resize", syncInfoboxTools);
  window.addEventListener("scroll", syncInfoboxTools, true);
  surface.appendChild(panel);
  syncInfoboxTools();

  return {
    destroy: function () {
      window.removeEventListener("resize", syncInfoboxTools);
      window.removeEventListener("scroll", syncInfoboxTools, true);
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }
  };
}

function createLinkContextToolbar(surface, editor) {
  const panel = document.createElement("div");
  panel.className = "wiki-editor-context-tools wiki-editor-link-tools";
  panel.setAttribute("role", "toolbar");
  panel.setAttribute("aria-label", "Selected link tools");
  panel.hidden = true;

  function editLink() {
    openExternalLinkDialog({
      editor,
      onSave: function () {
        panel.hidden = true;
      }
    });
  }

  function unlink() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    panel.hidden = true;
  }

  [
    { id: "link", title: "Edit link", action: editLink },
    { id: "unlink", title: "Remove link", action: unlink }
  ].forEach(function (def) {
    panel.appendChild(createButton(def));
  });

  function showForLink(linkEl) {
    if (!linkEl || !surface.contains(linkEl)) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    positionContextPanel(panel, linkEl, surface);
  }

  function hideIfSelectionLeavesLink() {
    if (!editor.isActive("link")) {
      panel.hidden = true;
    }
  }

  editor.on("selectionUpdate", hideIfSelectionLeavesLink);
  editor.on("transaction", hideIfSelectionLeavesLink);
  window.addEventListener("resize", hideIfSelectionLeavesLink);
  surface.appendChild(panel);

  return {
    showForLink,
    destroy: function () {
      window.removeEventListener("resize", hideIfSelectionLeavesLink);
      if (panel.parentNode) {
        panel.parentNode.removeChild(panel);
      }
    }
  };
}

function createEditorToc(root, surface, editor) {
  const aside = document.createElement("aside");
  aside.className = "wiki-editor-toc";
  aside.setAttribute("aria-label", "Article table of contents");

  const title = document.createElement("div");
  title.className = "wiki-editor-toc__title";
  title.textContent = "Contents";
  aside.appendChild(title);

  const listMount = document.createElement("div");
  listMount.className = "wiki-editor-toc__list";
  aside.appendChild(listMount);

  function assignHeadingIds(items) {
    flattenHeadingToc(items).forEach(function (item) {
      const dom = editor.view.nodeDOM(item.pos);
      if (dom && dom.nodeType === 1) {
        dom.id = item.id;
      }
    });
  }

  function renderItems(items, parent) {
    const list = document.createElement("ol");
    list.className = "wiki-editor-toc__entries";
    parent.appendChild(list);

    items.forEach(function (item) {
      const row = document.createElement("li");
      row.className = `wiki-editor-toc__entry wiki-editor-toc__entry--level-${item.level}`;

      const line = document.createElement("div");
      line.className = "wiki-editor-toc__row";
      row.appendChild(line);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "wiki-editor-toc__link";
      button.textContent = item.text;
      button.addEventListener("mousedown", function (event) {
        event.preventDefault();
      });
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        navigateToHeading({ item, surface, editor });
        root.dispatchEvent(new CustomEvent("wiki-editor-toc-navigate", {
          detail: { item },
          bubbles: true
        }));
      });
      line.appendChild(button);

      if (item.children && item.children.length) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "wiki-editor-toc__toggle";
        toggle.setAttribute("aria-expanded", "true");
        toggle.setAttribute("aria-label", "Collapse " + (item.text || "heading"));
        toggle.innerHTML = '<i class="fa fa-fw fa-caret-down" aria-hidden="true"></i>';
        toggle.addEventListener("mousedown", function (event) {
          event.preventDefault();
        });
        toggle.addEventListener("click", function (event) {
          const collapsed = !row.classList.contains("wiki-editor-toc__entry--collapsed");
          event.preventDefault();
          event.stopPropagation();
          row.classList.toggle("wiki-editor-toc__entry--collapsed", collapsed);
          const childList = row.querySelector(":scope > .wiki-editor-toc__entries");
          if (childList) {
            childList.hidden = collapsed;
          }
          toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
          toggle.setAttribute("aria-label", (collapsed ? "Expand " : "Collapse ") + (item.text || "heading"));
        });
        line.insertBefore(toggle, button);
        renderItems(item.children, row);
      }
      list.appendChild(row);
    });
  }

  let syncTimer = null;
  let lastTocSignature = "";

  function getTocSignature(items) {
    return flattenHeadingToc(items).map(function (item) {
      return `${item.level}:${item.text}:${item.pos}`;
    }).join("|");
  }

  function syncToc() {
    syncTimer = null;
    const items = buildHeadingToc(editor);
    const signature = getTocSignature(items);
    if (signature === lastTocSignature) {
      return;
    }
    lastTocSignature = signature;
    assignHeadingIds(items);
    listMount.innerHTML = "";

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "wiki-editor-toc__empty";
      empty.textContent = "No headings";
      listMount.appendChild(empty);
      aside.classList.add("wiki-editor-toc--empty");
      return;
    }

    aside.classList.remove("wiki-editor-toc--empty");
    renderItems(items, listMount);
  }

  function scheduleTocSync() {
    if (syncTimer) {
      return;
    }
    syncTimer = window.setTimeout(syncToc, 250);
  }

  editor.on("create", syncToc);
  editor.on("update", scheduleTocSync);
  root.appendChild(aside);
  syncToc();

  return {
    destroy: function () {
      window.clearTimeout(syncTimer);
      editor.off("create", syncToc);
      editor.off("update", scheduleTocSync);
      if (aside.parentNode) {
        aside.parentNode.removeChild(aside);
      }
    }
  };
}

function escapeSourceHtml(source) {
  return String(source || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightEscapedTag(tag) {
  return tag.replace(
    /(&lt;\/?)([a-zA-Z][\w:-]*)([\s\S]*?)(\/?&gt;)/g,
    function (_source, open, name, attrs, close) {
      const highlightedAttrs = attrs.replace(
        /([\w:-]+)(\s*=\s*)(&quot;[^&]*(?:&(?!quot;)[^&]*)*&quot;|'[^']*')/g,
        '<span class="wiki-editor-source-token wiki-editor-source-token--attr">$1</span>$2<span class="wiki-editor-source-token wiki-editor-source-token--string">$3</span>'
      );
      return `<span class="wiki-editor-source-token wiki-editor-source-token--tag">${open}${name}${highlightedAttrs}${close}</span>`;
    }
  );
}

function highlightSourceHtml(source) {
  const escaped = escapeSourceHtml(source);
  return escaped
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="wiki-editor-source-token wiki-editor-source-token--comment">$1</span>')
    .replace(/(&lt;script\b[\s\S]*?&lt;\/script&gt;)/gi, function (scriptSource) {
      return `<span class="wiki-editor-source-token wiki-editor-source-token--script">${highlightEscapedTag(scriptSource)}</span>`;
    })
    .replace(/(&lt;\/?[a-zA-Z][\w:-]*[\s\S]*?&gt;)/g, highlightEscapedTag)
    .replace(/(&amp;[a-zA-Z0-9#]+;)/g, '<span class="wiki-editor-source-token wiki-editor-source-token--entity">$1</span>');
}

const SOURCE_FORMAT_BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "div",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul"
]);

const SOURCE_FORMAT_VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr"
]);

function getSourceTagName(token) {
  const match = /^<\/?\s*([a-zA-Z][\w:-]*)/.exec(token || "");
  return match ? match[1].toLowerCase() : "";
}

function isClosingSourceTag(token) {
  return /^<\//.test(token || "");
}

function isSelfClosingSourceTag(token, tagName) {
  return /\/\s*>$/.test(token || "") || SOURCE_FORMAT_VOID_TAGS.has(tagName);
}

function appendFormattedSourceLine(lines, indent, content) {
  const text = String(content || "").trim();
  if (!text) {
    return;
  }
  lines.push(`${"  ".repeat(Math.max(0, indent))}${text}`);
}

function compactSourceHtml(html) {
  return String(html || "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceNodeHtml(node) {
  if (!node) {
    return "";
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return String(node.textContent || "").replace(/\s+/g, " ").trim();
  }
  if (node.nodeType === Node.COMMENT_NODE) {
    return `<!--${node.textContent || ""}-->`;
  }
  return compactSourceHtml(node.outerHTML || "");
}

function sourceElementTagName(node) {
  return node && node.nodeType === Node.ELEMENT_NODE ? node.tagName.toLowerCase() : "";
}

function isSourceBlockElement(node) {
  return SOURCE_FORMAT_BLOCK_TAGS.has(sourceElementTagName(node));
}

function hasSourceBlockChild(node) {
  return Array.from((node && node.childNodes) || []).some(isSourceBlockElement);
}

function openingSourceTag(node) {
  const html = sourceNodeHtml(node);
  const match = /^<[^>]+>/.exec(html);
  return match ? match[0] : html;
}

function closingSourceTag(node) {
  const tagName = sourceElementTagName(node);
  return tagName && !SOURCE_FORMAT_VOID_TAGS.has(tagName) ? `</${tagName}>` : "";
}

function formatSourceNode(node, indent, lines) {
  if (!node) {
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    appendFormattedSourceLine(lines, indent, sourceNodeHtml(node));
    return;
  }

  if (!isSourceBlockElement(node) || !hasSourceBlockChild(node)) {
    appendFormattedSourceLine(lines, indent, sourceNodeHtml(node));
    return;
  }

  appendFormattedSourceLine(lines, indent, openingSourceTag(node));
  Array.from(node.childNodes).forEach(function (child) {
    formatSourceNode(child, indent + 1, lines);
  });
  appendFormattedSourceLine(lines, indent, closingSourceTag(node));
}

function formatSourceHtml(html) {
  const source = String(html || "").trim();
  if (!source) {
    return "";
  }
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<body>${source}</body>`, "text/html");
    const lines = [];
    Array.from(doc.body.childNodes).forEach(function (node) {
      formatSourceNode(node, 0, lines);
    });
    return lines.join("\n");
  }

  const tokens = compactSourceHtml(source)
    .match(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<\/?[^>]+>|[^<]+/gi) || [];
  const lines = [];
  let indent = 0;
  let currentInline = "";

  function flushInline() {
    appendFormattedSourceLine(lines, indent, currentInline);
    currentInline = "";
  }

  tokens.forEach(function (token) {
    const trimmed = String(token || "").trim();
    if (!trimmed) {
      return;
    }

    if (!trimmed.startsWith("<")) {
      currentInline += trimmed;
      return;
    }

    if (/^<!--/.test(trimmed) || /^<(script|style)\b/i.test(trimmed)) {
      flushInline();
      appendFormattedSourceLine(lines, indent, trimmed);
      return;
    }

    const tagName = getSourceTagName(trimmed);
    const block = SOURCE_FORMAT_BLOCK_TAGS.has(tagName);
    const closing = isClosingSourceTag(trimmed);
    const selfClosing = isSelfClosingSourceTag(trimmed, tagName);

    if (!block) {
      currentInline += trimmed;
      return;
    }

    if (closing) {
      if (currentInline) {
        currentInline += trimmed;
        indent = Math.max(0, indent - 1);
        flushInline();
      } else {
        indent = Math.max(0, indent - 1);
        appendFormattedSourceLine(lines, indent, trimmed);
      }
      return;
    }

    flushInline();
    appendFormattedSourceLine(lines, indent, trimmed);
    if (!selfClosing) {
      indent += 1;
    }
  });

  flushInline();
  return lines.join("\n");
}

function normalizeSourceHtmlForEditor(source) {
  const raw = String(source || "").trim();
  if (!raw) {
    return "";
  }
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<body>${raw}</body>`, "text/html");
    removeSourceWhitespaceTextNodes(doc.body);
    return doc.body.innerHTML;
  }
  return raw.replace(/>\s+</g, "><");
}

function removeSourceWhitespaceTextNodes(node) {
  if (!node || /^(pre|script|style)$/i.test(node.nodeName || "")) {
    return;
  }
  Array.from(node.childNodes || []).forEach(function (child) {
    if (child.nodeType === Node.TEXT_NODE && !String(child.textContent || "").trim()) {
      node.removeChild(child);
      return;
    }
    removeSourceWhitespaceTextNodes(child);
  });
}

function plainSourceHeadingText(source) {
  const html = String(source || "");
  if (!html) {
    return "";
  }
  if (typeof document !== "undefined") {
    const element = document.createElement("div");
    element.innerHTML = html;
    return String(element.textContent || "").replace(/\s+/g, " ").trim();
  }
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function createFullscreenSourceMode(root, editor, sourcePanel, sourceTextarea, sourceHighlight, resizer, layout, onChange) {
  const SOURCE_SYNC_DELAY_MS = 500;
  const sourceToggle = sourcePanel.querySelector("[data-wiki-editor-source-toggle]");
  const sourceApply = sourcePanel.querySelector("[data-wiki-editor-source-apply]");
  const sourceWrap = sourcePanel.querySelector("[data-wiki-editor-source-wrap]");
  const sourceShow = layout.querySelector("[data-wiki-editor-source-show]");
  let fullscreen = false;
  let sourceHidden = false;
  let sourceWrapEnabled = false;
  let syncingSource = false;
  let sourceDirty = false;
  let sourceSyncTimer = null;
  let lastSourcePanelWidth = "clamp(22rem, 38vw, 70vw)";
  let resizeCleanup = null;
  let placeholder = null;
  let portalHost = null;
  let actionsPlaceholder = null;
  let actionsPortalHost = null;
  let actionsDock = null;

  function setSourcePanelWidth(value) {
    lastSourcePanelWidth = value || lastSourcePanelWidth;
    root.style.setProperty("--wiki-editor-source-panel-current-width", lastSourcePanelWidth);
  }

  function syncSourceScroll() {
    sourceHighlight.scrollTop = sourceTextarea.scrollTop;
    sourceHighlight.scrollLeft = sourceTextarea.scrollLeft;
  }

  function renderSourceHighlight() {
    sourceHighlight.innerHTML = highlightSourceHtml(sourceTextarea.value);
    syncSourceScroll();
  }

  function setSourceWrap(enabled) {
    sourceWrapEnabled = !!enabled;
    sourcePanel.classList.toggle("wiki-editor__fullscreen-source-panel--wrap", sourceWrapEnabled);
    sourceTextarea.setAttribute("wrap", sourceWrapEnabled ? "soft" : "off");
    if (sourceWrap) {
      sourceWrap.classList.toggle("active", sourceWrapEnabled);
      sourceWrap.setAttribute("aria-pressed", sourceWrapEnabled ? "true" : "false");
      sourceWrap.setAttribute("title", sourceWrapEnabled ? "Disable word wrap" : "Enable word wrap");
      sourceWrap.setAttribute("aria-label", sourceWrapEnabled ? "Disable source word wrap" : "Enable source word wrap");
    }
    renderSourceHighlight();
  }

  function setSourceDirty(dirty) {
    sourceDirty = !!dirty;
    sourcePanel.classList.toggle("wiki-editor__fullscreen-source-panel--dirty", sourceDirty);
    if (sourceApply) {
      sourceApply.disabled = !sourceDirty;
    }
  }

  function clearScheduledSourceSync() {
    if (sourceSyncTimer) {
      window.clearTimeout(sourceSyncTimer);
      sourceSyncTimer = null;
    }
  }

  function syncSourceFromEditor() {
    clearScheduledSourceSync();
    if (syncingSource || sourceDirty || !fullscreen || sourceHidden) {
      return;
    }
    sourceTextarea.value = formatSourceHtml(sanitizeHtml(editor.getHTML()));
    renderSourceHighlight();
    setSourceDirty(false);
  }

  function scheduleSourceFromEditor() {
    clearScheduledSourceSync();
    if (syncingSource || sourceDirty || !fullscreen || sourceHidden) {
      return;
    }
    sourceSyncTimer = window.setTimeout(function () {
      sourceSyncTimer = null;
      syncSourceFromEditor();
    }, SOURCE_SYNC_DELAY_MS);
  }

  function applySourceToEditor() {
    if (!sourceDirty) {
      return;
    }
    syncingSource = true;
    try {
      const html = sanitizeHtml(normalizeLegacyHtmlForTiptap(normalizeSourceHtmlForEditor(sourceTextarea.value)));
      editor.commands.setContent(html, false);
      onChange();
      setSourceDirty(false);
    } finally {
      syncingSource = false;
      syncSourceFromEditor();
    }
  }

  function scrollSourceToHeading(item) {
    if (!fullscreen || sourceHidden || !item || !item.text) {
      return;
    }

    const source = String(sourceTextarea.value || "");
    const target = String(item.text || "").replace(/\s+/g, " ").trim();
    if (!source || !target) {
      return;
    }

    const headingPattern = /<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi;
    let match;
    while ((match = headingPattern.exec(source))) {
      if (plainSourceHeadingText(match[0]) !== target) {
        continue;
      }

      const before = source.slice(0, match.index);
      const line = before ? before.split("\n").length - 1 : 0;
      const computedStyle = window.getComputedStyle ? window.getComputedStyle(sourceTextarea) : null;
      const lineHeight = computedStyle ? parseFloat(computedStyle.lineHeight) : 0;
      const fontSize = computedStyle ? parseFloat(computedStyle.fontSize) : 0;
      const rowHeight = lineHeight || (fontSize ? fontSize * 1.45 : 20);
      const top = Math.max(0, Math.round(line * rowHeight - sourceTextarea.clientHeight * 0.18));

      sourceTextarea.scrollTo({
        top,
        behavior: "smooth"
      });
      sourceHighlight.scrollTop = top;
      sourceHighlight.scrollLeft = sourceTextarea.scrollLeft;
      return;
    }
  }

  function handleTocNavigate(event) {
    syncSourceFromEditor();
    scrollSourceToHeading(event && event.detail && event.detail.item);
  }

  function setSourceHidden(hidden) {
    sourceHidden = !!hidden;
    if (sourceHidden) {
      clearScheduledSourceSync();
    }
    root.classList.toggle("wiki-editor--fullscreen-source-hidden", sourceHidden);
    if (sourceToggle) {
      sourceToggle.setAttribute("aria-pressed", sourceHidden ? "true" : "false");
      sourceToggle.setAttribute("title", sourceHidden ? "Show source panel" : "Hide source panel");
    }
    if (sourceShow) {
      sourceShow.hidden = !sourceHidden;
    }
    if (fullscreen && !sourceHidden) {
      syncSourceFromEditor();
    }
  }

  function enterPortal() {
    if (portalHost || !root.parentNode) {
      return;
    }
    placeholder = document.createComment("westgate-wiki-editor-fullscreen-placeholder");
    root.parentNode.insertBefore(placeholder, root);
    portalHost = document.createElement("div");
    portalHost.className = "westgate-wiki westgate-wiki-compose wiki-editor-fullscreen-portal";
    portalHost.appendChild(root);
    document.body.appendChild(portalHost);
  }

  function exitPortal() {
    if (!placeholder || !placeholder.parentNode) {
      return;
    }
    placeholder.parentNode.insertBefore(root, placeholder);
    placeholder.parentNode.removeChild(placeholder);
    placeholder = null;
    if (portalHost && portalHost.parentNode) {
      portalHost.parentNode.removeChild(portalHost);
    }
    portalHost = null;
  }

  function enterActionsPortal() {
    if (actionsPortalHost) {
      return;
    }
    actionsDock = document.querySelector(".wiki-compose-actions--floating");
    if (!actionsDock || !actionsDock.parentNode) {
      return;
    }
    actionsPlaceholder = document.createComment("westgate-wiki-editor-fullscreen-actions-placeholder");
    actionsDock.parentNode.insertBefore(actionsPlaceholder, actionsDock);
    actionsPortalHost = document.createElement("div");
    actionsPortalHost.className = "westgate-wiki westgate-wiki-compose wiki-editor-fullscreen-actions-portal";
    actionsPortalHost.appendChild(actionsDock);
    document.body.appendChild(actionsPortalHost);
  }

  function exitActionsPortal() {
    if (actionsPlaceholder && actionsPlaceholder.parentNode && actionsDock) {
      actionsPlaceholder.parentNode.insertBefore(actionsDock, actionsPlaceholder);
      actionsPlaceholder.parentNode.removeChild(actionsPlaceholder);
    }
    actionsPlaceholder = null;
    actionsDock = null;
    if (actionsPortalHost && actionsPortalHost.parentNode) {
      actionsPortalHost.parentNode.removeChild(actionsPortalHost);
    }
    actionsPortalHost = null;
  }

  function setFullscreen(active) {
    fullscreen = !!active;
    if (fullscreen) {
      enterPortal();
      enterActionsPortal();
    }
    root.classList.toggle("wiki-editor--fullscreen-source", fullscreen);
    document.documentElement.classList.toggle("wiki-editor-fullscreen-source-active", fullscreen);
    root.dispatchEvent(new CustomEvent("wiki-editor-fullscreen-source-change"));
    if (fullscreen) {
      setSourceHidden(sourceHidden);
      setSourcePanelWidth(lastSourcePanelWidth);
      syncSourceFromEditor();
      window.setTimeout(function () {
        if (sourceHidden) {
          editor.commands.focus();
        } else {
          sourceTextarea.focus();
        }
      }, 0);
    } else {
      clearScheduledSourceSync();
      if (sourceShow) {
        sourceShow.hidden = true;
      }
      editor.commands.focus();
      exitActionsPortal();
      exitPortal();
    }
    root.dispatchEvent(new CustomEvent("wiki-editor-fullscreen-source-change"));
  }

  function startResize(event) {
    if (!fullscreen || sourceHidden || window.matchMedia("(max-width: 767.98px)").matches) {
      return;
    }
    event.preventDefault();
    const layoutRect = layout.getBoundingClientRect();

    function onMove(moveEvent) {
      const raw = moveEvent.clientX - layoutRect.left;
      const min = 352;
      const max = Math.max(min, Math.min(layoutRect.width * 0.7, window.innerWidth * 0.7));
      const next = Math.max(min, Math.min(raw, max));
      setSourcePanelWidth(`${Math.round(next)}px`);
    }

    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.classList.remove("wiki-editor--resizing-source");
      resizeCleanup = null;
    }

    resizeCleanup = onUp;
    document.body.classList.add("wiki-editor--resizing-source");
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  function handleSourceKeydown(event) {
    if (event.key !== "Tab") {
      return;
    }
    event.preventDefault();
    sourceTextarea.setRangeText("\t", sourceTextarea.selectionStart, sourceTextarea.selectionEnd, "end");
    clearScheduledSourceSync();
    setSourceDirty(true);
    renderSourceHighlight();
  }

  sourceTextarea.addEventListener("input", function () {
    clearScheduledSourceSync();
    setSourceDirty(true);
    renderSourceHighlight();
  });
  sourceTextarea.addEventListener("keydown", handleSourceKeydown);
  sourceTextarea.addEventListener("scroll", syncSourceScroll);
  if (sourceApply) {
    sourceApply.addEventListener("click", applySourceToEditor);
    sourceApply.disabled = true;
  }
  if (sourceWrap) {
    sourceWrap.addEventListener("click", function () {
      setSourceWrap(!sourceWrapEnabled);
      sourceTextarea.focus();
    });
  }
  root.addEventListener("wiki-editor-toc-navigate", handleTocNavigate);
  resizer.addEventListener("pointerdown", startResize);
  if (sourceToggle) {
    sourceToggle.addEventListener("click", function () {
      setSourceHidden(!sourceHidden);
    });
  }
  if (sourceShow) {
    sourceShow.addEventListener("click", function () {
      setSourceHidden(false);
      sourceTextarea.focus();
    });
    sourceShow.hidden = true;
  }
  editor.on("create", syncSourceFromEditor);
  editor.on("update", scheduleSourceFromEditor);
  setSourceWrap(false);
  syncSourceFromEditor();

  root.__wikiToggleFullscreenSource = function () {
    setFullscreen(!fullscreen);
  };
  root.__wikiIsFullscreenSourceActive = function () {
    return fullscreen;
  };

  return {
    destroy: function () {
      if (resizeCleanup) {
        resizeCleanup();
      }
      clearScheduledSourceSync();
      editor.off("create", syncSourceFromEditor);
      editor.off("update", scheduleSourceFromEditor);
      root.removeEventListener("wiki-editor-toc-navigate", handleTocNavigate);
      sourceTextarea.removeEventListener("keydown", handleSourceKeydown);
      document.documentElement.classList.remove("wiki-editor-fullscreen-source-active");
      exitActionsPortal();
      exitPortal();
      delete root.__wikiToggleFullscreenSource;
      delete root.__wikiIsFullscreenSourceActive;
    }
  };
}

async function uploadImageFile(relativePath, csrfToken, file) {
  const uploadUrl = `${relativePath || ""}/api/post/upload`;
  const formData = new FormData();
  formData.append("files[]", file);

  const response = await fetch(uploadUrl, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "x-csrf-token": csrfToken || ""
    },
    body: formData
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error((body && body.status && body.status.message) || response.statusText);
  }

  const image = (body.response && body.response.images && body.response.images[0]) || (body.images && body.images[0]);
  if (!image || !image.url) {
    throw new Error("Unexpected upload response");
  }

  return image.url;
}

export async function createWikiEditor(element, options) {
  const { relativePath, csrfToken, initialData = "" } = options || {};
  const onChange = options && typeof options.onChange === "function" ? options.onChange : function () {};
  const normalizedInitialData = normalizeLegacyHtmlForTiptap(initialData);
  let pendingUploads = 0;

  const root = document.createElement("div");
  root.className = "wiki-editor";

  const toolbarMount = document.createElement("div");
  toolbarMount.className = "wiki-editor__toolbar-mount";
  toolbarMount.__wikiEditorOptions = options || {};
  root.appendChild(toolbarMount);

  const fullscreenLayout = document.createElement("div");
  fullscreenLayout.className = "wiki-editor__fullscreen-layout";
  root.appendChild(fullscreenLayout);

  const sourcePanel = document.createElement("section");
  sourcePanel.className = "wiki-editor__fullscreen-source-panel";
  sourcePanel.setAttribute("aria-label", "HTML source editor");
  sourcePanel.innerHTML = [
    '<div class="wiki-editor__fullscreen-source-header">',
    '<span class="wiki-editor__fullscreen-source-title">Source</span>',
    '<div class="wiki-editor__fullscreen-source-actions">',
    '<button type="button" class="btn btn-primary btn-sm wiki-editor__fullscreen-source-apply" data-wiki-editor-source-apply disabled>',
    "Apply source",
    "</button>",
    '<button type="button" class="btn btn-outline-secondary btn-sm wiki-editor__fullscreen-source-wrap" data-wiki-editor-source-wrap title="Enable word wrap" aria-label="Enable source word wrap" aria-pressed="false">',
    '<i class="fa fa-align-left" aria-hidden="true"></i>',
    "</button>",
    '<button type="button" class="btn btn-outline-secondary btn-sm wiki-editor__fullscreen-source-toggle" data-wiki-editor-source-toggle title="Hide source panel" aria-pressed="false">',
    '<i class="fa fa-columns" aria-hidden="true"></i>',
    "</button>",
    "</div>",
    "</div>",
    '<div class="wiki-editor__fullscreen-source-editor">',
    '<pre class="wiki-editor__fullscreen-source-highlight" aria-hidden="true"></pre>',
    '<textarea class="wiki-editor__fullscreen-source-input" spellcheck="false" aria-label="Article HTML source"></textarea>',
    "</div>"
  ].join("");
  fullscreenLayout.appendChild(sourcePanel);

  const sourceResizer = document.createElement("div");
  sourceResizer.className = "wiki-editor__fullscreen-resizer";
  sourceResizer.setAttribute("role", "separator");
  sourceResizer.setAttribute("aria-orientation", "vertical");
  sourceResizer.setAttribute("aria-label", "Resize source panel");
  fullscreenLayout.appendChild(sourceResizer);

  const editorColumn = document.createElement("div");
  editorColumn.className = "wiki-editor__fullscreen-editor-panel";
  fullscreenLayout.appendChild(editorColumn);

  const sourceShowButton = document.createElement("button");
  sourceShowButton.type = "button";
  sourceShowButton.className = "btn btn-outline-secondary btn-sm wiki-editor__fullscreen-source-show";
  sourceShowButton.setAttribute("data-wiki-editor-source-show", "1");
  sourceShowButton.setAttribute("title", "Show source panel");
  sourceShowButton.setAttribute("aria-label", "Show source panel");
  sourceShowButton.hidden = true;
  sourceShowButton.innerHTML = '<i class="fa fa-columns" aria-hidden="true"></i>';
  editorColumn.appendChild(sourceShowButton);

  const body = document.createElement("div");
  body.className = "wiki-editor__body";
  editorColumn.appendChild(body);

  const editorMount = document.createElement("div");
  editorMount.className = "wiki-editor__surface wiki-article-prose";
  body.appendChild(editorMount);

  const metaRow = document.createElement("div");
  metaRow.className = "wiki-editor__meta small text-muted";
  editorColumn.appendChild(metaRow);

  const uploadInput = document.createElement("input");
  uploadInput.type = "file";
  uploadInput.accept = "image/*";
  uploadInput.className = "wiki-editor__upload-input";
  uploadInput.hidden = true;
  root.appendChild(uploadInput);

  element.innerHTML = "";
  element.appendChild(root);
  let linkContextToolbar = null;

  function setUploadStatus(text) {
    if (text) {
      metaRow.textContent = text;
      metaRow.classList.add("text-warning");
    } else {
      metaRow.classList.remove("text-warning");
      metaRow.textContent = `${editor.getText().trim().length.toLocaleString()} characters`;
    }
  }

  async function uploadFiles(files) {
    const imageFiles = Array.from(files || []).filter(function (file) {
      return file && /^image\//i.test(file.type || "");
    });
    if (imageFiles.length === 0) {
      return false;
    }

    pendingUploads += imageFiles.length;
    setUploadStatus(`Uploading ${pendingUploads.toLocaleString()} image${pendingUploads === 1 ? "" : "s"}…`);

    try {
      for (const file of imageFiles) {
        const url = await uploadImageFile(relativePath, csrfToken, file);
        editor.chain().focus().setImage({
          src: url,
          alt: file.name || ""
        }).run();
      }
    } catch (err) {
      const message = (err && err.message) || String(err);
      const paragraph = document.createElement("p");
      paragraph.className = "wiki-editor-upload-error";
      paragraph.textContent = `Image upload failed: ${message}`;
      editor.chain().focus().insertContent(paragraph.outerHTML).run();
    } finally {
      pendingUploads = Math.max(0, pendingUploads - imageFiles.length);
      setUploadStatus(pendingUploads ? `Uploading ${pendingUploads.toLocaleString()} image${pendingUploads === 1 ? "" : "s"}…` : "");
    }

    return true;
  }

  let editor;
  editor = new Editor({
    element: editorMount,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        heading: {
          levels: [1, 2, 3, 4]
        }
      }),
      PreservedNodeAttributes,
      StyledSpan,
      ContainerBlock,
      MediaCell,
      MediaRow,
      MediaCellSelection,
      ImageFigure,
      WikiAlignmentTable,
      WikiCodeBlock,
      WikiBlockBackground,
      WikiCallout,
      WikiPoetryQuote,
      WikiInfoboxTitle,
      WikiInfoboxSubtitle,
      WikiInfoboxImage,
      WikiInfoboxSection,
      WikiInfoboxRows,
      WikiInfoboxRow,
      WikiInfoboxTerm,
      WikiInfoboxValue,
      WikiInfoboxContent,
      WikiInfobox,
      WikiEditingKeymap,
      WikiPageLink,
      WikiNamespaceLink,
      WikiUserMention,
      WikiFootnote,
      Underline,
      Highlight.configure({
        multicolor: true
      }),
      WikiLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https"
      }),
      Image.configure({
        allowBase64: true,
        HTMLAttributes: {
          "data-wiki-node": "image"
        }
      }),
      Table.configure({
        resizable: true,
        View: WestgateTableView
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true
      }),
      Placeholder.configure({
        placeholder: "Write the article body…"
      }),
      CharacterCount,
      Typography,
      Subscript,
      Superscript,
      TextAlign.configure({
        types: ["heading", "paragraph"]
      }),
      SlashCommand.configure({
        getItems: function () {
          return createWikiSlashItems({
            root: toolbarMount,
            editor,
            uploadImage: pickAndUploadImage
          });
        },
        requestImageUpload: function () {
          uploadInput.click();
        }
      })
    ],
    content: sanitizeHtml(normalizedInitialData),
    autofocus: false,
    editable: true,
    editorProps: {
      attributes: {
        class: "wiki-editor__content wiki-article-prose"
      },
      handleDOMEvents: {
        keydown: function (_view, event) {
          const isMod = event.metaKey || event.ctrlKey;
          if (!isMod || event.key.toLowerCase() !== "k") {
            return false;
          }

          event.preventDefault();
          if (event.shiftKey) {
            openWikiEntityDialog({ editor, type: "page", options: options || {} });
            return true;
          }

          openExternalLinkDialog({ editor });
          return true;
        },
        mousedown: function (_view, event) {
          const target = event.target;
          if (selectClickedImageNode(editor, target, editorMount)) {
            return false;
          }
          return false;
        },
        click: function (_view, event) {
          const target = event.target;
          const entity = target && typeof target.closest === "function" ? target.closest("[data-wiki-entity]") : null;
          const mediaCell = target && typeof target.closest === "function" ? target.closest('[data-wiki-node="media-cell"]') : null;
          if (handleEditorLinkClick({
            editor,
            editorMount,
            getLinkContextToolbar: function () {
              return linkContextToolbar;
            }
          }, event)) {
            return true;
          }

          if (entity && editorMount.contains(entity) && openWikiEntityDialogForElement(editor, entity, options || {})) {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }

          if (selectClickedImageNode(editor, target, editorMount)) {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }

          if (selectAlignmentTable(editor, target, editorMount)) {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }

          if (selectPoetryQuote(editor, target, editorMount)) {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }

          if (mediaCell && handleMediaCellSelectionClick(editor, mediaCell, event)) {
            return true;
          }

          if (mediaCell && isMediaCellSurfaceTarget(mediaCell, target)) {
            event.preventDefault();
            event.stopPropagation();
            return focusMediaCell(editor, mediaCell);
          }

          return false;
        },
        paste: function (_view, event) {
          const files = event.clipboardData && event.clipboardData.files;
          if (!files || files.length === 0) {
            return false;
          }
          const handled = Array.from(files).some(function (file) {
            return /^image\//i.test(file.type || "");
          });
          if (!handled) {
            return false;
          }
          event.preventDefault();
          uploadFiles(files);
          return true;
        },
        drop: function (_view, event) {
          const files = event.dataTransfer && event.dataTransfer.files;
          if (!files || files.length === 0) {
            return false;
          }
          const handled = Array.from(files).some(function (file) {
            return /^image\//i.test(file.type || "");
          });
          if (!handled) {
            return false;
          }
          event.preventDefault();
          uploadFiles(files);
          return true;
        }
      }
    },
    onUpdate: function ({ editor: activeEditor }) {
      const plainTextLength = activeEditor.getText().trim().length;
      metaRow.textContent = `${plainTextLength.toLocaleString()} characters`;
      onChange();
    }
  });

  metaRow.textContent = `${editor.getText().trim().length.toLocaleString()} characters`;

  async function pickAndUploadImage() {
    uploadInput.value = "";
    uploadInput.click();
  }

  uploadInput.addEventListener("change", async function () {
    const file = uploadInput.files && uploadInput.files[0];
    if (!file) {
      return;
    }

    await uploadFiles([file]);
  });

  const fullscreenSourceMode = createFullscreenSourceMode(
    root,
    editor,
    sourcePanel,
    sourcePanel.querySelector(".wiki-editor__fullscreen-source-input"),
    sourcePanel.querySelector(".wiki-editor__fullscreen-source-highlight"),
    sourceResizer,
    fullscreenLayout,
    onChange
  );
  toolbarMount.__wikiToggleFullscreenSource = root.__wikiToggleFullscreenSource;
  toolbarMount.__wikiIsFullscreenSourceActive = root.__wikiIsFullscreenSourceActive;
  const topToolbar = createToolbar(toolbarMount, editor, pickAndUploadImage);
  const imageContextToolbar = createImageContextToolbar(editorMount, editor);
  const imageResizeOverlay = createImageResizeOverlay(editorMount, editor);
  const codeBlockLanguageToolbar = createCodeBlockLanguageToolbar(editorMount, editor);
  const tableAuthoring = createTableAuthoring(editorMount, editor);
  const alignmentTableContextToolbar = createAlignmentTableContextToolbar(editorMount, editor);
  const poetryQuoteContextToolbar = createPoetryQuoteContextToolbar(editorMount, editor);
  const mediaRowContextToolbar = createMediaRowContextToolbar(editorMount, editor);
  const infoboxContextToolbar = createInfoboxContextToolbar(editorMount, editor);
  linkContextToolbar = createLinkContextToolbar(editorMount, editor);
  const destroyLinkNavigationGuard = installEditorLinkNavigationGuard({
    editorMount,
    editor,
    getLinkContextToolbar: function () {
      return linkContextToolbar;
    }
  });
  const editorToc = createEditorToc(body, editorMount, editor);
  const userEntityResolution = installUserEntityResolution(editorMount, options || {});
  const refreshUserEntityResolution = function () {
    userEntityResolution.refresh();
  };
  editor.on("update", refreshUserEntityResolution);

  return {
    getHTML: function () {
      return sanitizeHtml(editor.getHTML());
    },
    getJSON: function () {
      return editor.getJSON();
    },
    getMarkdown: function () {
      return htmlToMarkdown(editor.getHTML());
    },
    hasPendingUploads: function () {
      return pendingUploads > 0;
    },
    setHTML: function (html) {
      editor.commands.setContent(sanitizeHtml(normalizeLegacyHtmlForTiptap(html)), false);
    },
    setMarkdown: function (markdown) {
      editor.commands.setContent(markdownToHtml(markdown), false);
    },
    insertWikiLink: function (insertText) {
      editor.chain().focus().insertContent(String(insertText || "")).run();
    },
    focus: function () {
      editor.commands.focus();
    },
    destroy: function () {
      destroyLinkNavigationGuard();
      editor.off("update", refreshUserEntityResolution);
      userEntityResolution.destroy();
      fullscreenSourceMode.destroy();
      delete toolbarMount.__wikiToggleFullscreenSource;
      delete toolbarMount.__wikiIsFullscreenSourceActive;
      topToolbar.destroy();
      imageContextToolbar.destroy();
      imageResizeOverlay.destroy();
      codeBlockLanguageToolbar.destroy();
      tableAuthoring.destroy();
      alignmentTableContextToolbar.destroy();
      poetryQuoteContextToolbar.destroy();
      mediaRowContextToolbar.destroy();
      infoboxContextToolbar.destroy();
      linkContextToolbar.destroy();
      editorToc.destroy();
      return editor.destroy();
    }
  };
}

window.WestgateWikiEditor = {
  createWikiEditor,
  markdownToHtml,
  htmlToMarkdown,
  sanitizeHtml,
  detectUnsupportedContent,
  normalizeLegacyHtmlForTiptap,
  getNormalizationNotice
};
