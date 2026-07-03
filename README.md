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
  create a personal key. Put it in the plugin config (below).
- **`git`** and **Node.js** (herdr invokes `node`). No `gh` needed.

## Configure

`config.json` in the plugin config dir (`herdr plugin config-dir tdi.worktree-from-linear`):

```json
{
  "linearApiKey": "lin_api_xxx",
  "issueLimit": 50,
  "base": "default",
  "teamKey": "BIT",
  "placement": "right",
  "fzfLayout": "down"
}
```

- `linearApiKey` (required).
- `issueLimit` — max issues listed (default 50).
- `base` — where the new branch starts: `"default"` (repo default branch),
  `"head"` (current checkout), or an explicit branch name (e.g. `"develop"`).
- `teamKey` — optional; restrict to one team (e.g. `BIT`).
- `placement` — where the picker pane opens: `"right"` (default), `"left"`,
  `"top"`, `"down"` (splits, so your work stays visible), or `"overlay"`
  (full-screen). `left`/`top` open a right/down split then swap into place.
- `fzfLayout` — `"down"` (default, search bar at the bottom) or `"top"` (search bar at the top). The picker renders as a compact window either way.

## Use

Bind the `Worktree from Linear issue` action to a key (herdr `[[keys.command]]`,
`type = "plugin_action"`, `command = "tdi.worktree-from-linear.pick"`), or invoke
it from the action menu. It lists your team's active issues; pick one and herdr
creates + focuses a worktree on the issue's branch. If a worktree for that branch
already exists, it is opened instead.

## Develop

```bash
npm test
```
