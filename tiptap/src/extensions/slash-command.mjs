import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const slashCommandPluginKey = new PluginKey("wikiSlashCommand");

function defaultItems() {
  return [
    { id: "paragraph", label: "Paragraph", run: ({ editor }) => editor.chain().focus().setParagraph().run() },
    { id: "heading-1", label: "Heading 1", run: ({ editor }) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: "heading-2", label: "Heading 2", run: ({ editor }) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: "heading-3", label: "Heading 3", run: ({ editor }) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { id: "bullet-list", label: "Bullet list", run: ({ editor }) => editor.chain().focus().toggleBulletList().run() },
    { id: "ordered-list", label: "Ordered list", run: ({ editor }) => editor.chain().focus().toggleOrderedList().run() },
    { id: "task-list", label: "Task list", run: ({ editor }) => editor.chain().focus().toggleTaskList().run() },
    { id: "quote", label: "Poetry quote", run: ({ editor }) => editor.chain().focus().insertWikiPoetryQuote().run() },
    { id: "code-block", label: "Code block", run: ({ editor }) => editor.chain().focus().toggleCodeBlock().run() },
    { id: "table", label: "Table", run: ({ editor }) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: "image", label: "Image", run: ({ editor }) => editor.storage.slashCommand.requestImageUpload(editor) },
    { id: "rule", label: "Horizontal rule", run: ({ editor }) => editor.chain().focus().setHorizontalRule().run() },
    { id: "callout-info", label: "Info callout", run: ({ editor }) => editor.chain().focus().insertWikiCallout({ type: "info", title: "Info" }).run() },
    { id: "callout-warning", label: "Warning callout", run: ({ editor }) => editor.chain().focus().insertWikiCallout({ type: "warning", title: "Warning" }).run() },
    { id: "callout-danger", label: "Danger callout", run: ({ editor }) => editor.chain().focus().insertWikiCallout({ type: "danger", title: "Danger" }).run() },
    { id: "wiki-link", label: "Wiki link", run: ({ editor }) => editor.commands.insertContent("[[Page]]") }
  ];
}

function isSlashTriggerAtSelection(state) {
  return getSlashQuery(state) !== null;
}

function getSlashQuery(state) {
  const { $from } = state.selection;
  if (!state.selection.empty || $from.parent.type.name !== "paragraph") {
    return null;
  }
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0");
  const match = textBefore.match(/(?:^|\s)\/([^\s]*)$/);
  return match ? match[1].toLowerCase() : null;
}

function removeSlashTrigger(editor) {
  const { state } = editor;
  const { $from } = state.selection;
  const query = getSlashQuery(state);
  if (query === null || $from.parentOffset <= 0) {
    return;
  }
  const from = $from.pos - query.length - 1;
  editor.view.dispatch(state.tr.delete(from, $from.pos).setMeta("addToHistory", false));
}

function itemMatchesQuery(item, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const haystack = [
    item.id,
    item.label,
    ...(item.aliases || [])
  ].join(" ").toLowerCase();
  return haystack.includes(needle);
}

function updateMenuPosition(editor, menu) {
  const view = editor.view;
  let coords = { left: 0, bottom: 0 };
  try {
    coords = view.coordsAtPos(view.state.selection.from);
  } catch (err) {
    coords = { left: 0, bottom: 0 };
  }
  const rootRect = (editor.options.element || document.body).getBoundingClientRect();
  menu.style.left = `${Math.max(0, coords.left - rootRect.left)}px`;
  menu.style.top = `${Math.max(0, coords.bottom - rootRect.top + 6)}px`;
}

function scrollActiveMenuItemIntoView(menu) {
  const active = menu && menu.querySelector('.wiki-tiptap-slash-menu__item[aria-selected="true"]');
  if (active && typeof active.scrollIntoView === "function") {
    active.scrollIntoView({ block: "nearest" });
  }
}

const SlashCommand = Extension.create({
  name: "slashCommand",
  addOptions() {
    return {
      getItems: defaultItems,
      requestImageUpload: function () {}
    };
  },
  addStorage() {
    return {
      isOpen: false,
      activeIndex: 0,
      requestImageUpload: this.options.requestImageUpload
    };
  },
  onCreate() {
    const editor = this.editor;
    const storage = editor.storage.slashCommand;
    editor.commands.openWikiSlashMenu = function () {
      storage.isOpen = true;
      storage.activeIndex = 0;
      return true;
    };
    editor.commands.closeWikiSlashMenu = function () {
      storage.isOpen = false;
      storage.activeIndex = 0;
      return true;
    };
  },
  addCommands() {
    const extension = this;
    return {
      openWikiSlashMenu:
        () =>
        () => {
          extension._forceOpen = true;
          extension.editor.storage.slashCommand.isOpen = true;
          extension.editor.storage.slashCommand.activeIndex = 0;
          return true;
        },
      closeWikiSlashMenu:
        () =>
        () => {
          extension._forceOpen = false;
          extension.editor.storage.slashCommand.isOpen = false;
          extension.editor.storage.slashCommand.activeIndex = 0;
          return true;
        }
    };
  },
  addProseMirrorPlugins() {
    const extension = this;
    let menu = null;

    function items(editor) {
      const query = getSlashQuery(editor.state) || "";
      return extension.options.getItems({ editor, query }).filter(function (item) {
        return itemMatchesQuery(item, query);
      });
    }

    function render(editor, options = {}) {
      if (!menu || !editor.storage.slashCommand.isOpen) {
        return;
      }

      const allItems = items(editor);
      if (editor.storage.slashCommand.activeIndex >= allItems.length) {
        editor.storage.slashCommand.activeIndex = 0;
      }
      menu.innerHTML = "";
      allItems.forEach(function (item, index) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wiki-tiptap-slash-menu__item";
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", index === editor.storage.slashCommand.activeIndex ? "true" : "false");
        button.setAttribute("data-slash-command-id", item.id);
        button.setAttribute("data-slash-command-index", String(index));
        button.textContent = item.label;
        button.addEventListener("mousedown", function (event) {
          event.preventDefault();
          editor.storage.slashCommand.activeIndex = index;
          removeSlashTrigger(editor);
          editor.commands.closeWikiSlashMenu();
          item.run({ editor, button });
        });
        menu.appendChild(button);
      });
      updateMenuPosition(editor, menu);
      if (options.scrollActiveItem) {
        scrollActiveMenuItemIntoView(menu);
      }
    }

    return [
      new Plugin({
        key: slashCommandPluginKey,
        view: (view) => {
          menu = document.createElement("div");
          menu.className = "wiki-tiptap-slash-menu";
          menu.setAttribute("role", "listbox");
          menu.hidden = true;
          view.dom.parentElement.appendChild(menu);

          return {
            update: () => {
              const editor = extension.editor;
              if (extension._forceOpen) {
                editor.storage.slashCommand.isOpen = true;
                editor.storage.slashCommand.activeIndex = 0;
                extension._forceOpen = false;
                menu.hidden = false;
                render(editor);
                return;
              }
              const shouldOpen = isSlashTriggerAtSelection(editor.state);
              if (shouldOpen) {
                editor.storage.slashCommand.isOpen = true;
              }
              if (!shouldOpen && editor.storage.slashCommand.isOpen) {
                editor.storage.slashCommand.isOpen = false;
              }
              menu.hidden = !editor.storage.slashCommand.isOpen;
              render(editor);
            },
            destroy: () => {
              if (menu && menu.parentNode) {
                menu.parentNode.removeChild(menu);
              }
              menu = null;
            }
          };
        },
        props: {
          handleKeyDown: (view, event) => {
            const editor = extension.editor;
            if (!editor.storage.slashCommand.isOpen) {
              return false;
            }

            const allItems = items(editor);
            if (!allItems.length) {
              if (event.key === "Escape") {
                event.preventDefault();
                editor.commands.closeWikiSlashMenu();
                if (menu) {
                  menu.hidden = true;
                }
                return true;
              }
              return false;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              editor.storage.slashCommand.activeIndex = (editor.storage.slashCommand.activeIndex + 1) % allItems.length;
              render(editor, { scrollActiveItem: true });
              return true;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              editor.storage.slashCommand.activeIndex = (editor.storage.slashCommand.activeIndex + allItems.length - 1) % allItems.length;
              render(editor, { scrollActiveItem: true });
              return true;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              editor.commands.closeWikiSlashMenu();
              if (menu) {
                menu.hidden = true;
              }
              return true;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const item = allItems[editor.storage.slashCommand.activeIndex] || allItems[0];
              const button = menu && menu.querySelector(`[data-slash-command-index="${editor.storage.slashCommand.activeIndex}"]`);
              removeSlashTrigger(editor);
              editor.commands.closeWikiSlashMenu();
              if (menu) {
                menu.hidden = true;
              }
              item.run({ editor, button });
              return true;
            }
            return false;
          },
          handleDOMEvents: {
            blur: () => {
              extension.editor.commands.closeWikiSlashMenu();
              if (menu) {
                menu.hidden = true;
              }
              return false;
            },
            compositionstart: () => {
              extension.editor.commands.closeWikiSlashMenu();
              if (menu) {
                menu.hidden = true;
              }
              return false;
            }
          }
        }
      })
    ];
  }
});

export default SlashCommand;
