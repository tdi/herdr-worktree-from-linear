# Worktree from Linear — herdr plugin

Keybind, pick an active Linear issue from your team, and herdr opens a git
worktree on the issue's Linear branch, based on your default branch. Worktree
only — pair it with
[worktree-setup](https://github.com/tdi/herdr-worktree-setup) to run per-repo
setup on `worktree.created`.

## Install

```bash
herdr plugin install tdi/herdr-worktree-from-linear
```

## Prerequisites

- **`fzf`** — the fuzzy picker (`brew install fzf`). Required for the intended
  overlay; without it a plain numbered prompt is used.
- **`glow`** — optional (`brew install glow`); renders the issue pane's markdown.
  Without it the pane prints the same plain-text panel as before.
- **A Linear personal API key** — Linear → Settings → Security & access → API →
  create a personal key. Put it in the plugin config, or export it as
  `LINEAR_API_KEY` (below).
- **`git`** and **Node.js** (herdr invokes `node`). No `gh` needed.

## Configure

`config.json` in the plugin config dir (`herdr plugin config-dir tdi.worktree-from-linear`):

```json
{
  "linearApiKey": "lin_api_xxx",
  "issueLimit": 50,
  "base": "default",
  "teamKey": "BIT",
  "repos": { "BIT": "/home/you/bit-repo" },
  "assignedToMe": true,
  "includeTriage": true,
  "startOnCreate": false,
  "placement": "right",
  "fzfLayout": "down",
  "showIssueDetails": true,
  "popupWidth": "80%",
  "popupHeight": "70%"
}
```

- `linearApiKey` (required, unless supplied via the environment — see below).
- `issueLimit` — max issues listed (default 50).
- `base` — where the new branch starts: `"default"` (repo default branch),
  `"head"` (current checkout), or an explicit branch name (e.g. `"develop"`).
- `startOnCreate` — optional; when `true`, a fresh worktree create also moves the
  issue to its team's `started` state (e.g. "In Progress"). Issues already started,
  completed or canceled are left alone, re-opening a worktree changes nothing, and a
  failed update only warns. Default `false`.
- `startedStateName` — optional; with `startOnCreate`, the name of the `started`
  state to use when the team has several (e.g. `"In Progress"`). Default: the first
  by position.
- `teamKey` — optional; restrict to one team (e.g. `BIT`).
- `repos` — optional; maps a Linear team key to the repo the worktree is created
  in, so a pick routes by the issue's team rather than by whichever pane invoked
  the action:

  ```json
  "repos": { "WIN": "/home/you/windmill", "DOCS": "/home/you/docs" }
  ```

  A team absent from the map falls back to the invoking pane's repo, which is
  also the whole behaviour when `repos` is unset. With a mapped team you no
  longer need to invoke the action from inside a git repo at all.
- `assignedToMe` — optional; when `true`, only list issues assigned to you (the
  API key's user). Default `false` (all assignees).
- `includeTriage` — optional; when `true`, also list issues in the triage state
  (on top of the unstarted/started defaults). Default `false`.
- `placement` — where the picker pane opens: `"right"` (default), `"left"`,
  `"top"`, `"down"` (splits, so your work stays visible), `"overlay"`
  (full-screen), or `"popup"` (centered floating window). `left`/`top` open a
  right/down split then swap into place.
- `fzfLayout` — `"down"` (default, search bar at the bottom) or `"top"` (search bar at the top). The picker renders as a compact window either way.
- `showIssueDetails` — optional; when `true`, a fresh worktree create also opens
  a pane showing the picked issue's details (see below). Default `false`.
- `popupWidth` / `popupHeight` — size of the `popup` placement, as a percentage
  (`"80%"`) or a terminal-cell count (`120`). Only used when `placement` is
  `popup`. Defaults `80%` × `70%`.

### API key from the environment

If `linearApiKey` is absent from `config.json`, the plugin falls back to the
`LINEAR_API_KEY` environment variable — the same name Linear's own SDK and CLI
use. Keep the key in a secret manager instead of on disk: herdr spawns plugin
actions as child processes, so anything that exports the variable into the herdr
server's environment works — `op run --`, a systemd `EnvironmentFile=`, direnv,
or a plain shell export before `herdr`. `config.json` wins when both are set.

`popup` opens the picker as a centered floating window that doesn't disturb your
pane layout — it requires **herdr ≥ 0.7.4** (older servers reject it; the plugin
still works with the other placements).

## Use

Bind the `Worktree from Linear issue` action to a key (herdr `[[keys.command]]`,
`type = "plugin_action"`, `command = "tdi.worktree-from-linear.pick"`), or invoke
it from the action menu. It lists your team's active issues; pick one and herdr
creates + focuses a worktree on the issue's branch. If a worktree for that branch
already exists, it is opened instead.

With `showIssueDetails: true`, a fresh create also opens a pane above the agent
pane in the new workspace showing the issue's details (identifier, title, state,
assignee, priority, estimate, project, cycle, labels, the description, and the
comment threads oldest-first). The plugin fetches these from Linear with your
`linearApiKey` and renders them itself — no extra CLI needed. Skipped when an
existing worktree is re-opened, to avoid stacking duplicate panes.

With `glow` installed the description and comments are rendered as markdown at
the pane's width, and a resize re-renders to fit. Without it — or when the pane's
output is not a terminal — the same content prints as plain text.

## Sidebar issue label

On herdr 0.7.4+, creating or opening an issue worktree also publishes a `linear`
workspace metadata token, so the sidebar entry shows which issue the worktree is
for: `BIT-1234`. The token carries no TTL, so it stays for the life of the
workspace, and reporting it never affects the exit code — if herdr rejects it,
the plugin logs a warning and the worktree is created all the same.

Display it by adding `$linear` to `[ui.sidebar.spaces].rows` in
`~/.config/herdr/config.toml`, then `herdr config check` and
`herdr server reload-config`. This is herdr's default layout with the token
appended; merge it into your own rows rather than replacing them:

```toml
[ui.sidebar.spaces]
rows = [
  ["state_icon", "workspace"],
  ["branch", "git_status", "$linear"],
]
```

- The plugin never edits herdr config; this is a one-time display setting.
- Useful mainly when your branch names bury or truncate the identifier — the
  `branch` token already shows it otherwise.
- To drop the label, use the workspace id from `herdr workspace list`:
  `herdr workspace report-metadata <id> --source plugin:tdi.worktree-from-linear --clear-token linear`.

## Develop

```bash
npm test
```
