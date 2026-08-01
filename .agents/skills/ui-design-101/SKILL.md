---
name: ui-design-101
description: Design the actions in an interface — buttons, confirmations, destructive operations, bulk edits, admin and moderation tools. Use when building or reviewing anything a user clicks repeatedly, anything that deletes or hides data, any list of rows with per-row actions, or when the user says a tool is tedious, asks for a confirmation dialog, or reports an interface that "does nothing".
---

# UI Design 101: actions

Visual design is a different skill. This one is about what happens when someone
clicks — and, above all, what happens when they click **the hundredth time**.

Every rule here is a checkable property of an interface. Apply all of them to
whatever you are building; an interface that fails any one of them is not done.

## Price every action at its hundredth use

Design for the hundredth click, not the first. An extra dialog, an extra
scroll, an extra page load is nothing once and unbearable a hundred times. Ask
directly: how many times will one person do this in one sitting? If the answer
is more than a handful, the per-use cost is the whole design problem.

The failure has a shape: a tool that is *pleasant to demo and brutal to use*.
Nobody notices it while building, because builders click things twice.

## Ceremony follows reversibility

Undo beats confirm. A confirmation asks the user to be certain in advance; an
undo lets them be wrong cheaply. Prefer the second.

- **Reversible action** (hide, archive, mark, tag): no confirmation. Ever. Do
  it, show it happened, offer the undo in the same spot.
- **Irreversible action** (purge, permanent delete, send, publish): confirm
  once, and say plainly that it cannot be undone.

Ceremony on a reversible action is worse than useless: it trains the user to
dismiss dialogs without reading, so the one dialog that matters gets dismissed
too.

## Spend one confirmation per intent

The confirmation budget is per *intent*, not per *item*. A user removing a
hundred things decided once; charge them once. A hundred dialogs for a hundred
items is the same as no dialogs at all, minus an hour of their life.

When one confirmation covers many items, make it carry its weight: name the
scope and the exact count ("Purge 143 pages in Skills — this cannot be
undone"), and for the genuinely dangerous ones, require typing something
deliberate rather than a single click.

## Let the reversible state be the selection

Where a flow is *choose many, then commit*, the reversible action is the
selection mechanism. Mark → review → commit. No parallel checkbox concept
required.

Marking beats checkboxes on properties, not just tokens: the marks survive a
reload, they are visible to a colleague looking at the same screen, they can be
undone one at a time, and the user sees the staged set accumulate as they go.

## Act in place

An action reports its result where the user is standing. Re-render the row, the
card, the item. Keep scroll position, keep focus, keep their place in a long
list.

A full page reload after each action is a scroll-position bug wearing a
navigation costume. If the user must find their place again after every click,
the hundredth click costs a hundred scrolls.

## Make silence impossible

Every action ends in an observable outcome: success shown, or failure shown
with a reason. An action that can quietly do nothing is the worst bug class in
interface design, because the user keeps working and only later discovers that
none of it happened.

Own your dialogs for the same reason. Browsers let a user permanently suppress
native `alert`/`confirm`/`prompt` dialogs ("prevent this page from creating
additional dialogs"). Code that reads a suppressed `confirm` sees "cancelled"
and correctly does nothing — forever, silently, until a reload. Use the
platform's or framework's own modal component so the confirmation is yours to
control.

## Give bulk work a bulk path

Wherever the data can hold hundreds of items, the interface offers an action
over the whole set — a filtered set, a marked set, or a namespace. A per-item
action is not a bulk feature no matter how fast the loop.

Bulk operations are partial by nature. Design for it up front:

- Process items independently; one failure does not abandon the rest.
- Report per item: succeeded, failed with a reason, skipped with a reason.
- Show progress while it runs, and let the user cancel between items.
- Leave every item either fully done or fully untouched — never half-applied.
- Chunk the work so a large set cannot time out the request.

## Finish the user's job

Match the actions to the *goal*, not to the data model. If the user's goal is
"make this gone" and the tool only offers "make this quiet", the tool is
incomplete even though every button works. Hidden is not deleted; unpublished
is not removed; archived is not gone.

Where a two-step model exists for safety (hide, then remove), both steps belong
on the screen where the work happens. A second step reachable only from a
different page, one item at a time, is a step that will not be taken.

## Show the outstanding work

Surface the counts that tell the user how much is left: how many items are
marked, how many remain, how many failed. A cleanup task needs a visible
ending, otherwise it is just scrolling.

## Explain a missing action

When a control is absent because of a permission, a state, or a rule, say so in
its place. An unexplained gap reads as a bug and sends the user hunting. State
the reason and, where there is one, the path to earning the action.

## Design check

Before calling an interface done, walk it as a user with a hundred items:

1. Count the interactions for one item. Multiply by a hundred. Is that a
   working afternoon?
2. Which actions prompt? Is every one of them irreversible?
3. Which actions are irreversible? Does each state that plainly, once, with the
   count?
4. After each action, did the user keep their place?
5. Can any action fail silently? What does the user see when it does?
6. Is there a path that handles the whole set in one decision?
7. Does the tool reach the user's actual goal, or stop at the model's halfway
   state?
