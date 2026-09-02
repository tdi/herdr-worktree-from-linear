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
- **A Linear personal API key for each workspace** — Linear → Settings →
  Security & access → API → create a personal key. Export each key under an
  environment-variable name, then configure the plugin to select that name by
  repository path (below).
- **`git`** and **Node.js** (herdr invokes `node`). No `gh` needed.

## Configure

`config.json` in the plugin config dir (`herdr plugin config-dir tdi.worktree-from-linear`):

```json
{
  "linearApiKeyEnvByPath": [
    { "contains": "hsys", "env": "LINEAR_API_KEY_HSYS" }
  ],
  "linearApiKeyEnvDefault": "LINEAR_API_KEY_EMBER",
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

- `linearApiKeyEnvByPath` — optional ordered path rules for selecting an API
  key environment variable. The first rule whose `contains` substring appears
  in the repository root wins; matching is case-insensitive.
- `linearApiKeyEnvDefault` — the environment-variable name used when no path
  rule matches. This supports a small exception list with one common default.
- `linearApiKey` — legacy key value. Existing configs remain supported and an
  explicit value still takes precedence, but new configs should keep key values
  out of `config.json` and use the environment-variable options above.
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

For multiple Linear workspaces, configure variable names rather than key values:

```json
{
  "linearApiKeyEnvByPath": [
    { "contains": "hsys", "env": "LINEAR_API_KEY_HSYS" }
  ],
  "linearApiKeyEnvDefault": "LINEAR_API_KEY_EMBER"
}
```

With this example, any repository root containing `hsys` (in any letter case)
reads `LINEAR_API_KEY_HSYS`; every other repository reads
`LINEAR_API_KEY_EMBER`. Rules are checked in order and the first match wins.
Only the variable names belong in `config.json`; export their key values into
the herdr server's inherited environment.

When neither `linearApiKeyEnvByPath` nor `linearApiKeyEnvDefault` is configured,
the legacy behavior is unchanged: `linearApiKey` in `config.json` wins, then the
plugin falls back to `LINEAR_API_KEY` — the same name Linear's SDK and CLI use.
An explicit `linearApiKey` also wins over repository-path routing when both are
present, for backward compatibility.

Keep keys in a secret manager instead of on disk. Herdr spawns plugin actions as
child processes, so anything that exports the variables into the herdr server's
environment works — `op run --`, a systemd `EnvironmentFile=`, direnv, or a
plain shell export before `herdr`. Key values are inherited through the process
environment and are not added to pane command arguments.

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

## Develop

```bash
npm test
```
