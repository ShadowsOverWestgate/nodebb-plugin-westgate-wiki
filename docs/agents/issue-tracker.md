# Issue tracker: Gitea

Issues and PRDs for this repo live as Gitea issues on the self-hosted instance
at `git.westgate.pw` (repo `ShadowsOverWestgate/sow-nodebb-plugin-wiki`). Use the
[`tea`](https://gitea.com/gitea/tea) CLI for all operations. `tea` reads the repo
and login from the local clone's `origin` remote automatically.

## Conventions

- **Create an issue**: `tea issues create --title "..." --description "..."`. Use a
  heredoc into `--description` for multi-line bodies (there is no editor mode).
- **Read an issue**: `tea issues <index> --comments`. Add `--output json` for
  machine-readable output.
- **List issues**: `tea issues list --output json` with `--labels "..."` /
  `--state open|closed|all` filters.
- **Comment on an issue**: `tea comment <index> "..."`.
- **Apply / remove labels**: `tea issues edit <index> --add-labels "..."` /
  `--remove-labels "..."`. Comma-separate multiple labels. Labels must exist
  first — create them with `tea labels create --name "..." --color "#RRGGBB"`.
- **Close**: `tea issues close <index>`. `close` takes no closing comment, so
  post the explanation first with `tea comment <index> "..."`, then close.
- **Reopen**: `tea issues reopen <index>`.

## Pull requests

Gitea calls PRs "pull requests", same as GitHub. Use `tea pulls create`,
`tea pulls <index>`, `tea pulls list`, `tea pulls close`, and `tea comment
<index> "..."` (the comment command works on both issues and PRs). Gitea shares
one numbering sequence for issues and PRs, so `#42` is either — the index is
unambiguous.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external
pull requests as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues:

- **Read a PR**: `tea pulls <index> --comments`; `tea pulls <index>` shows the
  diff summary.
- **List external PRs for triage**: `tea pulls list --output json`, then keep
  only PRs whose author is not a project member/owner.
- **Comment / label / close**: `tea comment`, `tea issues edit <index>
  --add-labels`/`--remove-labels` (labels are shared with issues), `tea pulls
  close`.

## When a skill says "publish to the issue tracker"

Create a Gitea issue with `tea issues create`.

## When a skill says "fetch the relevant ticket"

Run `tea issues <index> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as
tickets. Gitea has no native epics or blocking links, so both are expressed in
issue bodies and labels.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes /
  Decisions-so-far / Fog body. `tea issues create --labels wayfinder:map`.
- **Child ticket**: an issue carrying `Part of #<map>` at the top of its
  description and a `wayfinder:<type>` label (`research`/`prototype`/`grilling`/
  `task`). Once claimed, assign it to the driving dev with `tea issues edit
  <index> --add-assignees @me`.
- **Blocking**: a `Blocked by: #<n>, #<n>` line at the top of the description.
  A ticket is unblocked when every blocker is closed.
- **Frontier query**: `tea issues list --output json` scoped to the map's
  children, drop any with an open blocker (an open issue named in the
  `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `tea issues edit <index> --add-assignees @me` — the session's
  first write.
- **Resolve**: `tea comment <index> "<answer>"`, then `tea issues close
  <index>`, then append a context pointer to the map's Decisions-so-far.
