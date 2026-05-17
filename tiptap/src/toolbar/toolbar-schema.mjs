export {
  TABLE_COMMANDS,
  TABLE_COMMAND_IDS,
  TABLE_STICKY_COMMAND_IDS,
  TABLE_CELL_POPOVER_COMMAND_IDS
} from "../table/table-commands.mjs";
import { TABLE_STICKY_COMMAND_IDS } from "../table/table-commands.mjs";

export const TOP_TOOLBAR_GROUPS = [
  {
    id: "history",
    label: "History",
    buttonIds: ["undo", "redo"]
  },
  {
    id: "structure",
    label: "Text structure",
    buttonIds: ["paragraph", "heading-1", "heading-2", "heading-3", "heading-4"]
  },
  {
    id: "inline-formatting",
    label: "Inline formatting",
    buttonIds: ["bold", "italic", "underline", "strike", "inline-code", "highlight", "strip-span-styling", "subscript", "superscript"]
  },
  {
    id: "links-media",
    label: "Links and media",
    buttonIds: ["link", "wiki-page-link", "wiki-user-mention", "wiki-footnote", "image-upload", "media-row-2", "media-row-3"]
  },
  {
    id: "blocks",
    label: "Blocks",
    buttonIds: ["bullet-list", "ordered-list", "task-list", "blockquote", "code-block", "block-background", "horizontal-rule", "infobox-insert"]
  },
  {
    id: "callouts",
    label: "Callouts",
    buttonIds: ["callout-info", "callout-success", "callout-warning", "callout-danger"]
  },
  {
    id: "alignment",
    label: "Text alignment",
    buttonIds: ["align-left", "align-center", "align-right", "align-justify"]
  },
  {
    id: "tables",
    label: "Tables",
    buttonIds: ["table-insert", "dnd-alignment-table"]
  },
  {
    id: "view",
    label: "View",
    buttonIds: ["fullscreen-source"]
  }
];

export const TOP_TOOLBAR_BUTTON_IDS = TOP_TOOLBAR_GROUPS.flatMap(function (group) {
  return group.buttonIds;
});

export const IMAGE_CONTEXT_BUTTON_IDS = [
  "image-align-center",
  "image-align-left",
  "image-align-right",
  "image-align-side",
  "image-size-sm",
  "image-size-md",
  "image-size-lg",
  "image-size-full",
  "image-convert-figure"
];

export const INFOBOX_CONTEXT_BUTTON_IDS = [
  "infobox-add-title",
  "infobox-add-subtitle",
  "infobox-add-image",
  "infobox-add-alignment-table",
  "infobox-add-section",
  "infobox-add-row",
  "infobox-add-content",
  "infobox-move-helper-up",
  "infobox-move-helper-down",
  "infobox-delete-helper",
  "infobox-unwrap",
  "infobox-delete"
];

export const TABLE_CONTEXT_BUTTON_IDS = TABLE_STICKY_COMMAND_IDS;

export function isImageContextButton(id) {
  return IMAGE_CONTEXT_BUTTON_IDS.includes(id);
}
