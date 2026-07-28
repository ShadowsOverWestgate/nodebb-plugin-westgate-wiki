# Issue tracker: Gitea (via tea)

Issues for this repo live in Gitea at `git.westgate.pw`, repo
`ShadowsOverWestgate/sow-nodebb-plugin-wiki`. Use the `tea` CLI for all operations —
`gh` does not work here. For anything `tea` lacks a subcommand for, use
`tea api <endpoint>` (Gitea's API mirrors GitHub's closely).

Authenticate with your own `tea` login (`tea login add`); never commit tokens
or tea config into this repo. Note Gitea blocks self-review, so approving a PR
needs a different account than the one that opened it.

## Where work lives

Markdown in this repo is **reference, law, or an ADR — nothing else**
(`sow-codebase` ADR-0001). Four homes, no overlap:

- **Live work** → wayfinder maps + Gitea issues. Closeable, assignable,
  queryable. Never a markdown file.
- **Settled decisions** → ADR files in `docs/adr/`. Immutable, findable, never
  closed, never edited — only superseded by a later ADR pointing back. When an
  issue ends in a durable decision, write the ADR, then close the issue
  pointing at it. Decisions spanning repos go to `sow-platform/docs/adr/`.
- **Standing law** → `DOCTRINE.md`, `AGENTS.md`, `CONTEXT.md`. Rules that are
  always true and vocabulary everyone shares — not the record of one decision.
- **Current-state reference** → docs describing what the code does now, kept
  honest by review touching them.

Anything else — implementation plans, design specs, concepts, handoffs,
progress trackers, scratch — is **process**. It does not live in this repo. It
lives in a Gitea issue or a wayfinder map, where it can be assigned, closed,
and superseded. Small tasks need no written plan at all.

Deleting a process doc is not destroying history — `git log -- <path>` recovers
it. But *unfinished intent* (a design never built, an open question still
wanted) is live, not history: harvest it to a Gitea issue before deleting.

`sow-docs` is deprecated and read-only. Never add to it, never send work there.

## Which repo gets the issue

Issues follow ownership. File the issue in the repo that **owns the work** —
see the Repo/Owns/Produces table in the workspace root `AGENTS.md`. Standing
in one repo is not a reason to file there.

If work spans repos, file it in the repo that owns the *outcome* and reference
the others from it. A wrong-repo issue is a routing bug, not a filing
preference — move it.

## Conventions

- **Create an issue**: `tea issues create --title "..." --description "..."`
- **Read an issue**: `tea issues <number>` and
  `tea api repos/ShadowsOverWestgate/sow-nodebb-plugin-wiki/issues/<number>/comments` for comments.
- **List issues**: `tea issues list --state open` (add `--labels ...` to filter).
- **Comment**: `tea comment <number> "..." </dev/null`
  Always redirect stdin. `tea` reads stdin to EOF and appends it to the body,
  so any non-interactive shell (every agent) hangs forever without
  `</dev/null`. Same trap on `tea issues create --description` and
  `tea pr create`.
- **Apply / remove labels**: `tea api --method PATCH` on the issue, or
  `tea api repos/ShadowsOverWestgate/sow-nodebb-plugin-wiki/issues/<number>/labels` endpoints.
- **Close**: `tea issues close <number>`

`tea` infers the repo from the git remote when run inside the clone.
Gitea shares one number space across issues and PRs.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a Gitea issue with `tea issues create`.

## When a skill says "fetch the relevant ticket"

Run `tea issues <number>` plus the comments API call above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `tea issues create --title "..." --description "..." --labels wayfinder:map`.
- **Child ticket**: this Gitea instance (v1.27) has no native sub-issue hierarchy, so a child issue carries `Part of #<map>` at the top of its description, and is also added to a task list in the map body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: Gitea's **native dependencies API** — the canonical, UI-visible representation (shows as "Depends on" / "Blocks" on the issue page). Add an edge with `tea api -X POST repos/ShadowsOverWestgate/sow-nodebb-plugin-wiki/issues/<child>/dependencies -f owner=ShadowsOverWestgate -f repo=sow-nodebb-plugin-wiki -F index=<blocker>`, where `<blocker>` is the blocker's issue **index** (its `#number` — Gitea's dependency API takes the index directly, unlike GitHub's numeric database id). Check status with `tea api repos/ShadowsOverWestgate/sow-nodebb-plugin-wiki/issues/<child>/dependencies` (GET) — a ticket is unblocked when every returned issue's `state` is `closed`.
- **Frontier query**: list the map's open children (`tea issues list --state open`, keep the ones whose description contains `Part of #<map>`), drop any with an open dependency (per the GET above) or an assignee; first in map order wins.
- **Claim**: `tea issues edit <n> --add-assignees <username>` — the session's first write.
- **Resolve**: `tea comment <n> "<answer>" </dev/null`, then `tea issues close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
