# Wiki History Diff View Design

## Scope

Improve the wiki history revision display after the initial plugin-owned
revision system landed. The backend revision journal, restore behavior,
tombstone behavior, and permissions remain unchanged.

This design covers:

- a readable before/after rendered comparison for the selected revision
- retained source-level diff review for exact HTML/source inspection
- fullscreen revision viewing for rendered article content and raw source
- client behavior and tests needed to keep the history view safe and stable

## Problem

The current history page exposes a raw unified patch beside a rendered preview.
That is technically correct, but it is hard to scan for normal wiki review:

- source lines are visually undifferentiated
- additions and removals are not color-coded
- the preview only shows the selected revision, not what changed from the
  previous revision
- there is no large inspection mode for either the actual rendered article or
  the raw source at a revision

The history page needs to support fast moderation decisions: what changed, what
did it look like to readers, and is the raw source safe to restore?

## Design Choice

Use a rendered before/after comparison as the primary view and keep source as a
first-class secondary view.

The main history workspace becomes a tabbed comparison surface:

- `Rendered Compare`: two panes showing the parent revision and selected
  revision using server-rendered read-only wiki HTML.
- `Source Diff`: a colorized source diff for exact HTML/source inspection.

The selected revision also exposes fullscreen actions:

- fullscreen rendered article at that revision
- fullscreen raw source at that revision

This keeps the most human-readable view first while preserving source-level
truth for debugging, malicious edits, and restore confidence.

Rejected alternatives:

- Only colorize the current unified diff. This improves readability but still
  makes prose review too source-oriented.
- Only show rendered before/after. This hides source-level changes and makes
  restore review less trustworthy for complex wiki HTML.
- Build a new backend comparison format before improving the UI. Existing
  revision detail and diff endpoints already provide enough data for this pass.

## Data Flow

When a revision is selected, the client already knows the selected revision and
can derive the comparison base from `parentRevisionId` or the next timeline row.

For non-initial revisions:

1. Fetch selected revision detail from
   `/api/v3/plugins/westgate-wiki/revisions/:tid/:revisionId`.
2. Fetch base revision detail from the same endpoint using the base revision id.
3. Fetch source diff from
   `/api/v3/plugins/westgate-wiki/revisions/:tid/:fromRevisionId/:toRevisionId/diff`.
4. Render before/after panes from `previewHtml`.
5. Render the source tab from the diff response.
6. Store selected and base source/preview values in client state for fullscreen
   actions.

For initial revisions:

- The before pane shows an empty-state message.
- The after pane shows the selected revision preview.
- The source tab shows a clear initial revision message and the selected
  revision source in a read-only source block.

The client must continue to ignore stale async responses using the existing
request id pattern.

## Interface

The history page keeps its existing left timeline and right workspace.

Inside the workspace:

- Keep the current selected revision status and restore button.
- Replace the single raw `Diff` panel with a tabbed inspection area.
- `Rendered Compare` is the default active tab.
- `Source Diff` is available next to it.
- The rendered comparison uses two bordered panes:
  - `Before`, labeled with the parent/base revision
  - `After`, labeled with the selected revision
- The selected revision preview area becomes the `After` pane rather than a
  separate unrelated panel.

Color treatment:

- source additions use a restrained green tint
- source removals use a restrained red tint
- hunk/file metadata is muted
- raw diff line gutters use a monospace layout with stable columns
- rendered compare highlights should be block-level and conservative; if a
  reliable rendered inline diff is not available in this pass, the before/after
  panes still provide immediate visual comparison without injecting unsafe
  client-generated HTML

Fullscreen viewer:

- opens as an overlay/dialog owned by the history page
- supports `Rendered` and `Source` modes
- defaults to rendered article view when opened from the rendered comparison
- defaults to source view when opened from the source tab
- includes close behavior through a close button, Escape, and backdrop click
- moves focus into the overlay on open, keeps Tab navigation inside the
  overlay while it is open, and restores focus to the opener on close
- shows selected revision context in a compact header or side strip

## Safety

Rendered revision HTML must come from the existing server `previewHtml`
response, which already uses read-only wiki HTML rendering. The client should
not render raw `source` as HTML.

Raw source and diff output must be inserted as text nodes or escaped line
segments. Colorized source diff rendering may split the diff into DOM rows, but
line content must use `textContent`.

Fullscreen source mode must also use text rendering, not `innerHTML`.

The existing route guard for forged history controls outside `/wiki/history/:tid`
must remain in place.

## Testing Requirements

Automated tests should cover:

- template exposes rendered comparison panes, source diff tab, and fullscreen
  controls
- client fetches selected and base revision details for a non-initial revision
- client renders server `previewHtml` only in rendered compare panes
- client renders source and diff content through text-safe paths
- source diff rows receive add/remove/metadata classes
- initial revision handles a missing base revision without a failed base or diff
  request and still shows the selected source in source mode
- stale async revision loads do not overwrite newer selected revision content
- fullscreen opens in rendered mode, switches to source mode, closes by button
  and Escape, and restores focus
- existing restore and hard purge tests continue to pass

Manual validation should cover:

- desktop and mobile comparison layout
- long article scrolling in before/after panes
- fullscreen rendered article view for a complex article
- fullscreen source view for a complex article
- color contrast for added, removed, and metadata rows in the Westgate theme
- restore button behavior after switching tabs and fullscreen modes

## Non-Goals

- Changing revision storage or checkpoint format.
- Changing restore semantics.
- Adding a new backend-rendered visual diff format.
- Making the rendered comparison a perfect semantic prose diff in this pass.
