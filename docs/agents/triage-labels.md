# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those
roles to the actual label strings used in this repo's Gitea issue tracker.

| Label in mattpocock/skills | Label in our tracker | Color     | Meaning                                  |
| -------------------------- | -------------------- | --------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | `#ededed` | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | `#fbca04` | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | `#0e8a16` | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | `#1d76db` | Requires human implementation            |
| `wontfix`                  | `wontfix`            | `#e11d21` | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the
corresponding label string from this table.

These five labels already exist in the Gitea repo. To recreate them elsewhere,
use `tea labels create --name "<label>" --color "#RRGGBB" --description "..."`.

Edit the right-hand column to match whatever vocabulary you actually use.
