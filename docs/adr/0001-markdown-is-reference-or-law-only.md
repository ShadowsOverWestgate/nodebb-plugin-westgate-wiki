# ADR-0001: Markdown in this repo is reference, law, or an ADR — nothing else

- **Status:** Accepted
- **Date:** 2026-07-24
- **Origin:** Adopted workspace-wide from `sow-codebase` ADR-0001, which records
  the full context (a `docs/` tree that had grown to 434 files, ~27MB, most of
  it dead process artifacts). This repo adopts the same law so the rule is
  local, not a cross-repo reference.

## Context

Markdown that *claims to describe current state or a plan* rots, because
reality diverges and nobody edits the file. Markdown that claims neither — a
dated, immutable decision record, or a standing rule — does not rot.

Two different things get conflated:

- **Rationale** — why a system is shaped the way it is. Worth keeping.
- **Process artifacts** — plans, specs, concepts, handoffs, trackers. A record
  of how work happened, not what is true now.

Left unchecked, every completed effort leaves its planning behind and the repo
accumulates a "historical" pile that agents and humans must route around to
find the few live docs.

## Decision

Markdown may exist in this repo only as one of three genres:

1. **Current-state reference** — describes what the code does now, kept honest
   by code review touching it.
2. **Standing law** — `DOCTRINE.md`, root and folder-scoped `AGENTS.md`,
   `CONTEXT.md`. States rules and vocabulary, not plans.
3. **Immutable decision record** — ADRs under `docs/adr/`. Append-only; never
   edited, only superseded by a later ADR that points back.

Anything else — implementation plans, design specs, concepts, handoffs,
progress trackers, scratch — is **process** and does not live in the repo. It
lives in Gitea issues and wayfinder maps, where it can be assigned, closed, and
superseded. Small tasks need no written plan at all.

Deleting a process document is not destroying history: `git log -- <path>`
recovers it. The exception is *unfinished intent* (a design never built, an
open question still wanted) — that is live, not history, and must be harvested
to a Gitea ticket before its file is deleted. A citation from a living doc or
from code must be resolved before the cited file is deleted.

## Consequences

- The documentation map lists only current truth; there is no "historical" pile
  to route around.
- No agent, under any plugin or skill, writes process-markdown into the repo.
  The rule is plugin-agnostic on purpose — it binds the agent, not a named tool.
- History of deleted process docs is in git; unfinished intent is in the issue
  tracker; rationale is in ADRs and law. Each thing has exactly one home.
