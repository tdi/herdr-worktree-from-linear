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
- **A Linear personal API key** — Linear → Settings → Security & access → API →
  create a personal key. Put it in the plugin config, or export it as
  `LINEAR_API_KEY` (below).
- **`git`** and **Node.js** (herdr invokes `node`). No `gh` needed.

## Configure

`config.json` in the plugin config dir (`herdr plugin config-dir tdi.worktree-from-linear`):

```json
{
  "linearApiKey": "lin_api_xxx",
  "linearApiKeysByPath": {
    "/absolute/path/to/project": "lin_api_project_specific"
  },
  "issueLimit": 50,
  "base": "default",
  "teamKey": "BIT",
  "assignedToMe": true,
  "includeTriage": true,
  "placement": "right",
  "fzfLayout": "down",
  "showIssueDetails": true,
  "popupWidth": "80%",
  "popupHeight": "70%"
}
```

- `linearApiKey` (required, unless supplied via the environment — see below).
- `linearApiKeysByPath` — optional map of absolute project paths to Linear API
  keys. The most specific containing path wins; unmatched paths use
  `linearApiKey` or `LINEAR_API_KEY`. This supports separate Linear workspaces
  without changing the herdr server environment. Paths must be absolute (a
  leading `~` is expanded); relative entries are ignored. `"/"` works as a
  catch-all. Matching uses the *source* repository, so invoking the action from
  a worktree created off that repo selects the same key.
- `issueLimit` — max issues listed (default 50).
- `base` — where the new branch starts: `"default"` (repo default branch),
  `"head"` (current checkout), or an explicit branch name (e.g. `"develop"`).
- `teamKey` — optional; restrict to one team (e.g. `BIT`).
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
pane in the new workspace showing
the issue's details (identifier, title, state, assignee, description). The plugin
fetches these from Linear with your `linearApiKey` and renders them itself — no
extra CLI needed. Skipped when an existing worktree is re-opened, to avoid stacking
duplicate panes.

## Develop

```bash
npm test
```
