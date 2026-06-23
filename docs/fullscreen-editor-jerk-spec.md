# Spec: Fullscreen editor "jerk" while selecting table elements

## Summary

In the TipTap editor's **fullscreen mode**, dragging to highlight/select
elements (observed with an alignment table) makes the editor surface and the
floating table toolbars visibly jump back and forth horizontally. The same
interaction is stable in the normal (non-fullscreen) editor.

Source video: `Screencast_20260622_213204.webm` (18s). Frames extracted at 2fps
show the table and the floating cell toolbar oscillating between two layout
states (table left edge at ~10px vs ~40px, first column ~90px vs ~120px) as the
selection changes — i.e. a layout/scroll feedback loop, not a one-time shift.

> Note on terminology: the report said "fullscreen editor source mode", but the
> video shows the fullscreen **rich editor** with the source panel hidden
> (`wiki-editor--fullscreen-source-hidden`), not the source `<textarea>`. The
> distinguishing axis is **fullscreen vs not**, so this spec targets fullscreen.

## Why it only happens in fullscreen

The relevant difference is the scroll container.

- Normal mode: the page is the scroll container. The editor's width is fixed by
  page layout and the page scrollbar is stable, so nothing reflows during
  selection.
- Fullscreen: the editor is portaled to `position: fixed` and
  `.wiki-editor__body` becomes the scroll container
  (`overflow: auto`, `wiki-editor.css:275`). The body width now depends on
  whether its own scrollbar is shown.

## Suspected mechanism (layout/scroll feedback loop)

The floating table UI is built in `tiptap/src/table/table-authoring-ui.mjs`:

- `stickyRow`, `cellPopover`, `widthHandle`, `rowHandle` are appended to
  `surface` (`.wiki-editor__surface`, `position: relative` +
  `container-type: inline-size`) and positioned `position: absolute`.
- `update()` (`table-authoring-ui.mjs:418`) re-reads geometry with several
  `getBoundingClientRect()` calls and then writes `style.left/top` on the
  panels. It runs **synchronously, unbatched**, on every
  `create | selectionUpdate | transaction | focus | blur` editor event, plus
  `window resize`, `surface scroll`, and `tableWrapper scroll`
  (`table-authoring-ui.mjs:481-488`, `:404`).

The likely loop while selecting in fullscreen:

1. Selection changes → `update()` repositions `cellPopover` below the active
   cell (`placement: "bottom"`, `positionContextPanel`, `table-dom.mjs:93`).
2. An absolutely-positioned descendant placed low extends the **scrollable
   overflow** of the `overflow: auto` body, so a vertical scrollbar toggles.
3. The scrollbar appearing/disappearing changes the body's content width. The
   alignment table fills that width (`table-layout: fixed`, container-sized),
   so columns recompute and the table shifts horizontally.
4. The shift moves the active cell → next event fires `update()` again →
   scrollbar toggles back → oscillation = the visible jerk.

Read-then-write geometry in `update()` (forced reflow on every event) and
`scrollIntoView` on selection movement are aggravating factors; the
`tableWrapper` (`overflow-x: auto`, `wiki-editor.css:1095`) adds a horizontal
scroll axis that `update()` also listens to.

**Confidence:** high that this is a fullscreen scroll-container + unbatched
reposition problem; the exact trigger (scrollbar toggle vs `scrollIntoView` vs
`tableWrapper` scroll) must be confirmed live — see Task 0.

## Implementation plan

### Task 0 — Confirm the trigger (required first; do not skip)

Per systematic debugging: confirm root cause before fixing.

1. Open the editor, enter fullscreen, insert/select an alignment table.
2. DevTools → Rendering → enable "Layout Shift Regions" and "Paint flashing".
   Watch whether the `.wiki-editor__body` scrollbar toggles as selection moves.
3. In Performance, record while drag-selecting; confirm repeated forced reflow
   ("Recalculate Style"/"Layout") originating from `update()`.
4. Log `body.scrollHeight`, `body.clientWidth`, and the active cell's
   `getBoundingClientRect()` per `update()` to see which value oscillates.

Record which of the loop steps (2 vs 3 vs `tableWrapper`/`scrollIntoView`) is
the dominant driver. The fixes below are ordered to address the most likely
driver first.

### Task 1 — Stop overlays from extending the scroll overflow

Keep the floating table panels out of the body's scroll-overflow calculation so
positioning a panel can never toggle the scrollbar.

Options (pick per Task 0 findings):
- Clip overflow on the positioning context (e.g. an overlay wrapper with
  `overflow: clip` / `contain: layout paint`) so absolutely-positioned panels
  don't contribute to scrollable area, **or**
- Mount the panels in a dedicated overlay layer that is `position: fixed` to the
  fullscreen portal (sibling of the scroll container) rather than inside the
  scrolling `surface`, positioning them in viewport coordinates.

### Task 2 — Batch and guard `update()`

In `table-authoring-ui.mjs`:
- Coalesce `update()` through `requestAnimationFrame` (one run per frame;
  cancel pending on destroy) to remove read/write layout thrash.
- Separate reads from writes: compute all `getBoundingClientRect()` first, then
  apply all `style` writes.
- Skip the write when the computed `left/top` is unchanged (avoids needless
  invalidation that can re-trigger the loop).

### Task 3 — Stabilize fullscreen width

Make the body width independent of scrollbar presence so a transient scrollbar
can't reflow the table:
- `scrollbar-gutter: stable` on `.wiki-editor--fullscreen-source .wiki-editor__body`, or
- reserve the gutter another way.

This is defense-in-depth; keep it even if Task 1 fully fixes the loop.

### Task 4 — Audit `scrollIntoView` on selection

Confirm selection/attribute updates that should not scroll already pass
`scrollIntoView: false` (table commands do — `table-commands.mjs:95,104`;
`updateNodeAttributesAtPos` defaults to `scrollIntoView()`, `table-dom.mjs:79`).
Ensure no selection-only path triggers a scroll that feeds the loop.

## Acceptance criteria

- Drag-selecting cells/text in fullscreen produces **no** horizontal jump of the
  surface or the floating toolbars.
- The `.wiki-editor__body` scrollbar does not toggle as a side effect of moving
  the selection.
- No regression in normal (non-fullscreen) mode or in table column/row resize
  drags (`widthHandle`/`rowHandle`).
- Performance trace shows at most one `update()` layout pass per animation frame
  during a continuous drag.

## Test

Add a focused regression check (jsdom is enough for the non-visual invariants):

- `update()` is coalesced — N synchronous editor events in one tick produce one
  geometry-write pass (spy on `style` setter / a single rAF callback).
- `update()` does not write when geometry is unchanged.

The visual no-jerk / no-scrollbar-toggle behavior is verified manually per the
acceptance criteria (and optionally via a Playwright check asserting the table's
`getBoundingClientRect().left` is stable across selection changes in fullscreen).

## Touch points

- `tiptap/src/table/table-authoring-ui.mjs` — `update()`, event wiring, panel mounting
- `tiptap/src/table/table-dom.mjs` — `positionContextPanel`
- `tiptap/src/wiki-editor.css` — fullscreen body/surface (`:275`, `:851`), `.tableWrapper` (`:1095`)
- `tiptap/src/wiki-editor-bundle.js` — fullscreen portal (`createFullscreenSourceMode`, `:3902`); image toolbar shares the same overlay pattern (`positionImageTools`, `:2296`) and may need the same treatment
