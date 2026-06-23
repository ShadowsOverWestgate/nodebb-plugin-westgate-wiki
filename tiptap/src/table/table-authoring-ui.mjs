import {
  TABLE_CELL_POPOVER_COMMAND_IDS,
  TABLE_STICKY_COMMAND_IDS,
  executeTableCommand,
  getTableCommand,
  isTableCommandEnabled
} from "./table-commands.mjs";
import { deriveTableContext } from "./table-context.mjs";
import {
  getActiveTableRowElement,
  getStyleValue,
  positionContextPanel,
  setStyleValue,
  updateNodeStyleAtPos
} from "./table-dom.mjs";

const COLOR_COMMAND_IDS = new Set([
  "table-cell-background",
  "table-cell-text-color"
]);

const FALLBACK_COLORS = {
  "table-cell-background": "#ffffff",
  "table-cell-text-color": "#111827"
};

function createIcon(command) {
  const icon = document.createElement("i");
  icon.className = `fa ${command.icon}`;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function createBadge(command) {
  if (!command.badge) {
    return null;
  }

  const badge = document.createElement("span");
  badge.className = "wiki-editor-table-command__badge";
  badge.textContent = command.badge;
  return badge;
}

function createCommandButton(command, onExecute) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-sm btn-light wiki-editor-table-command";
  button.dataset.tableCommandId = command.id;
  button.setAttribute("aria-label", command.label);
  button.title = command.label;
  button.appendChild(createIcon(command));

  const badge = createBadge(command);
  if (badge) {
    button.appendChild(badge);
  }

  const label = document.createElement("span");
  label.className = "visually-hidden";
  label.textContent = command.label;
  button.appendChild(label);

  button.addEventListener("click", function () {
    onExecute(command.id);
  });

  return button;
}

function createColorControl(command, onExecute) {
  const label = document.createElement("label");
  label.className = "wiki-editor-table-cell-popover__color";
  label.dataset.tableCommandId = command.id;
  label.title = command.label;

  const text = document.createElement("span");
  text.className = "visually-hidden";
  text.textContent = command.label;
  label.appendChild(text);

  label.appendChild(createIcon(command));

  const input = document.createElement("input");
  input.type = "color";
  input.value = FALLBACK_COLORS[command.id];
  input.setAttribute("aria-label", command.label);
  input.addEventListener("input", function () {
    onExecute(command.id, { value: input.value });
  });
  input.addEventListener("change", function () {
    onExecute(command.id, { value: input.value });
  });
  label.appendChild(input);

  return label;
}

function readSelectedCellStyle(context, propertyName) {
  const selectedCells = context && Array.isArray(context.selectedCellPositions)
    ? context.selectedCellPositions
    : [];
  const entry = selectedCells[0];
  const style = String(entry && entry.node && entry.node.attrs && entry.node.attrs.style || entry && entry.fallbackStyle || "");
  return getStyleValue(style, propertyName);
}

function normalizeColorValue(value, fallback) {
  const hex = String(value || "").trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return `#${hex[1].toLowerCase()}`;
  }

  const rgb = String(value || "").trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) {
    return `#${rgb.slice(1, 4).map(function (channel) {
      return Math.max(0, Math.min(255, Number(channel))).toString(16).padStart(2, "0");
    }).join("")}`;
  }

  const probe = document.createElement("span");
  probe.style.color = "";
  probe.style.color = value;
  return probe.style.color ? String(value).trim() : fallback;
}

function setElementHidden(element, hidden) {
  element.hidden = hidden;
  element.setAttribute("aria-hidden", hidden ? "true" : "false");
}

function setElementInert(element, inert) {
  if ("inert" in element) {
    element.inert = inert;
  }
  if (inert) {
    element.setAttribute("inert", "");
  } else {
    element.removeAttribute("inert");
  }
}

function setControlsDisabled(element, disabled) {
  Array.from(element.querySelectorAll("button, input, select, textarea")).forEach(function (control) {
    control.disabled = disabled;
  });
}

function isAutoLayoutTable(context) {
  const table = context && context.activeTableElement;
  const className = String(context && context.tableAttrs && context.tableAttrs.class || table && table.getAttribute("class") || "");
  return className.split(/\s+/).includes("wiki-table-layout-auto");
}

function positionHandle(handle, targetRect, surfaceRect, options) {
  const left = `${Math.round(options.left(targetRect, surfaceRect))}px`;
  const top = `${Math.round(options.top(targetRect, surfaceRect))}px`;
  const width = `${Math.round(options.width(targetRect))}px`;
  const height = `${Math.round(options.height(targetRect))}px`;
  // Skip the write when nothing moved — avoids needless style invalidation that
  // can re-trigger the reposition/scroll loop. Reading inline style is cheap
  // (no forced reflow).
  if (handle.style.left === left && handle.style.top === top
    && handle.style.width === width && handle.style.height === height) {
    return;
  }
  handle.style.left = left;
  handle.style.top = top;
  handle.style.width = width;
  handle.style.height = height;
}

function getWidthValue(startWidth, delta) {
  return `${Math.max(80, Math.round(startWidth + delta))}px`;
}

function getHeightValue(startHeight, delta) {
  return `${Math.max(24, Math.round(startHeight + delta))}px`;
}

function appendResizeHandle(surface, className, label) {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = `wiki-editor-table-resize-handle ${className}`;
  handle.setAttribute("aria-label", label);
  handle.title = label;
  handle.hidden = true;
  surface.appendChild(handle);
  return handle;
}

function createDragController(options) {
  let activeDrag = null;

  function stopDrag() {
    if (!activeDrag) {
      return;
    }

    document.documentElement.classList.remove("wiki-editor-table-resizing");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
    window.removeEventListener("pointercancel", stopDrag);
    activeDrag = null;
  }

  function onPointerMove(event) {
    if (!activeDrag) {
      return;
    }

    const delta = activeDrag.axis === "x"
      ? event.clientX - activeDrag.startX
      : event.clientY - activeDrag.startY;
    const value = activeDrag.axis === "x"
      ? getWidthValue(activeDrag.startSize, delta)
      : getHeightValue(activeDrag.startSize, delta);
    updateNodeStyleAtPos(
      options.editor,
      activeDrag.pos,
      activeDrag.fallbackStyle,
      function (style) {
        return setStyleValue(style, activeDrag.propertyName, value);
      },
      { scroll: false }
    );
    options.update();
  }

  function startDrag(event, dragOptions) {
    if (!dragOptions || !Number.isFinite(dragOptions.pos)) {
      return;
    }

    event.preventDefault();
    activeDrag = {
      ...dragOptions,
      startX: event.clientX,
      startY: event.clientY
    };
    document.documentElement.classList.add("wiki-editor-table-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  }

  return {
    startDrag,
    destroy: stopDrag
  };
}

export function createTableAuthoring(surface, editor) {
  const stickyRow = document.createElement("div");
  stickyRow.className = "wiki-editor-table-sticky-row wiki-editor-table-sticky-row--inactive";
  stickyRow.setAttribute("role", "toolbar");
  stickyRow.setAttribute("aria-label", "Table tools");
  stickyRow.setAttribute("contenteditable", "false");
  stickyRow.setAttribute("aria-hidden", "true");
  setElementInert(stickyRow, true);

  const cellPopover = document.createElement("div");
  cellPopover.className = "wiki-editor-table-cell-popover";
  cellPopover.setAttribute("role", "toolbar");
  cellPopover.setAttribute("aria-label", "Selected cell formatting");
  cellPopover.setAttribute("contenteditable", "false");
  cellPopover.hidden = true;

  const widthHandle = appendResizeHandle(surface, "wiki-editor-table-resize-handle--width", "Resize table width");
  const rowHandle = appendResizeHandle(surface, "wiki-editor-table-resize-handle--row", "Resize row height");

  let currentContext = deriveTableContext(editor, surface);
  let activeTableWrapper = null;
  let destroyed = false;
  let pendingFrame = 0;

  // Coalesce event-driven repositioning to one update() per animation frame so
  // a burst of editor events (selectionUpdate + transaction + focus ...) can't
  // thrash layout. Drags and command runs still call update() synchronously.
  function scheduleUpdate() {
    if (destroyed || pendingFrame) {
      return;
    }
    pendingFrame = requestAnimationFrame(function () {
      pendingFrame = 0;
      update();
    });
  }

  function ensureInstalled() {
    if (stickyRow.parentNode !== surface || stickyRow !== surface.firstElementChild) {
      surface.insertBefore(stickyRow, surface.firstChild);
    }
    if (widthHandle.parentNode !== surface) {
      surface.appendChild(widthHandle);
    }
    if (rowHandle.parentNode !== surface) {
      surface.appendChild(rowHandle);
    }
    if (cellPopover.parentNode !== surface) {
      surface.appendChild(cellPopover);
    }
  }

  function runCommand(id, payload) {
    const context = deriveTableContext(editor, surface);
    executeTableCommand(editor, context, id, payload || {});
    update();
  }

  TABLE_STICKY_COMMAND_IDS.forEach(function (id) {
    const command = getTableCommand(id);
    if (command) {
      stickyRow.appendChild(createCommandButton(command, runCommand));
    }
  });

  TABLE_CELL_POPOVER_COMMAND_IDS.forEach(function (id) {
    const command = getTableCommand(id);
    if (!command) {
      return;
    }

    cellPopover.appendChild(COLOR_COMMAND_IDS.has(id)
      ? createColorControl(command, runCommand)
      : createCommandButton(command, runCommand));
  });

  surface.appendChild(stickyRow);
  surface.appendChild(cellPopover);

  const dragController = createDragController({
    editor,
    update
  });

  function updateResizeHandles(context) {
    const table = context.activeTableElement;
    const row = getActiveTableRowElement(editor, table);
    if (!table || !row) {
      setElementHidden(widthHandle, true);
      setElementHidden(rowHandle, true);
      return;
    }

    const surfaceRect = surface.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const tableWidthResizeAllowed = !isAutoLayoutTable(context);
    if (tableWidthResizeAllowed) {
      positionHandle(widthHandle, tableRect, surfaceRect, {
        left: function (target) {
          return target.right - surfaceRect.left - 5;
        },
        top: function (target) {
          return target.top - surfaceRect.top;
        },
        width: function () {
          return 10;
        },
        height: function (target) {
          return Math.max(24, target.height);
        }
      });
    }
    positionHandle(rowHandle, rowRect, surfaceRect, {
      left: function (target) {
        return target.left - surfaceRect.left;
      },
      top: function (target) {
        return target.bottom - surfaceRect.top - 5;
      },
      width: function (target) {
        return Math.max(24, target.width);
      },
      height: function () {
        return 10;
      }
    });
    widthHandle.disabled = !tableWidthResizeAllowed;
    setElementHidden(widthHandle, !tableWidthResizeAllowed);
    setElementHidden(rowHandle, false);
  }

  function updateColorControls(context) {
    const backgroundInput = cellPopover.querySelector("[data-table-command-id='table-cell-background'] input");
    const textInput = cellPopover.querySelector("[data-table-command-id='table-cell-text-color'] input");
    if (backgroundInput) {
      backgroundInput.value = normalizeColorValue(readSelectedCellStyle(context, "background-color"), FALLBACK_COLORS["table-cell-background"]);
    }
    if (textInput) {
      textInput.value = normalizeColorValue(readSelectedCellStyle(context, "color"), FALLBACK_COLORS["table-cell-text-color"]);
    }
  }

  function updateCommandStates(context) {
    Array.from(stickyRow.querySelectorAll("[data-table-command-id]")).concat(
      Array.from(cellPopover.querySelectorAll("[data-table-command-id]"))
    ).forEach(function (element) {
      const commandId = element.dataset.tableCommandId;
      const enabled = isTableCommandEnabled(editor, context, commandId);
      const control = element.matches("button, input") ? element : element.querySelector("button, input");
      if (control) {
        control.disabled = !enabled;
      }
      element.classList.toggle("disabled", !enabled);
      element.setAttribute("aria-disabled", enabled ? "false" : "true");
    });
  }

  function getTableScrollWrapper(context) {
    const table = context && context.activeTableElement;
    return table && typeof table.closest === "function" ? table.closest(".tableWrapper") : null;
  }

  function syncActiveTableWrapper(wrapper) {
    if (activeTableWrapper === wrapper) {
      return;
    }

    if (activeTableWrapper) {
      activeTableWrapper.removeEventListener("scroll", scheduleUpdate);
    }

    activeTableWrapper = wrapper;
    if (activeTableWrapper) {
      activeTableWrapper.addEventListener("scroll", scheduleUpdate);
    }
  }

  function setStickyRowInactive(inactive) {
    stickyRow.hidden = false;
    stickyRow.classList.toggle("wiki-editor-table-sticky-row--inactive", inactive);
    stickyRow.setAttribute("aria-hidden", inactive ? "true" : "false");
    setElementInert(stickyRow, inactive);
    if (inactive) {
      setControlsDisabled(stickyRow, true);
    }
  }

  function update() {
    if (destroyed) {
      return;
    }

    ensureInstalled();
    currentContext = deriveTableContext(editor, surface);
    const visible = Boolean(currentContext && currentContext.isActive);
    setStickyRowInactive(!visible);
    setElementHidden(cellPopover, !visible);
    setElementHidden(widthHandle, !visible);
    setElementHidden(rowHandle, !visible);

    if (!visible) {
      syncActiveTableWrapper(null);
      return;
    }

    syncActiveTableWrapper(getTableScrollWrapper(currentContext));

    const surfaceRect = surface.getBoundingClientRect();
    const stickyRect = stickyRow.getBoundingClientRect();
    positionContextPanel(cellPopover, currentContext.activeCellElement || currentContext.activeTableElement, surface, {
      avoidTop: stickyRect.bottom - surfaceRect.top + 8,
      placement: "bottom"
    });
    updateResizeHandles(currentContext);
    updateColorControls(currentContext);
    updateCommandStates(currentContext);
  }

  widthHandle.addEventListener("pointerdown", function (event) {
    const context = deriveTableContext(editor, surface);
    const table = context.activeTableElement;
    if (!table || isAutoLayoutTable(context)) {
      return;
    }

    dragController.startDrag(event, {
      axis: "x",
      propertyName: "width",
      pos: context.activeTablePos,
      fallbackStyle: context.tableAttrs && context.tableAttrs.style || table.getAttribute("style") || "",
      startSize: table.getBoundingClientRect().width
    });
  });

  rowHandle.addEventListener("pointerdown", function (event) {
    const context = deriveTableContext(editor, surface);
    const row = getActiveTableRowElement(editor, context.activeTableElement);
    if (!row) {
      return;
    }

    dragController.startDrag(event, {
      axis: "y",
      propertyName: "height",
      pos: editor.view.posAtDOM(row, 0) - 1,
      fallbackStyle: row.getAttribute("style") || "",
      startSize: row.getBoundingClientRect().height
    });
  });

  const updateEvents = ["create", "selectionUpdate", "transaction", "focus", "blur"];
  updateEvents.forEach(function (eventName) {
    if (editor && typeof editor.on === "function") {
      editor.on(eventName, scheduleUpdate);
    }
  });
  window.addEventListener("resize", scheduleUpdate);
  surface.addEventListener("scroll", scheduleUpdate);

  update();

  return {
    destroy: function () {
      destroyed = true;
      if (pendingFrame) {
        cancelAnimationFrame(pendingFrame);
        pendingFrame = 0;
      }
      dragController.destroy();
      updateEvents.forEach(function (eventName) {
        if (editor && typeof editor.off === "function") {
          editor.off(eventName, scheduleUpdate);
        }
      });
      window.removeEventListener("resize", scheduleUpdate);
      surface.removeEventListener("scroll", scheduleUpdate);
      syncActiveTableWrapper(null);
      stickyRow.remove();
      cellPopover.remove();
      widthHandle.remove();
      rowHandle.remove();
      currentContext = null;
    }
  };
}
