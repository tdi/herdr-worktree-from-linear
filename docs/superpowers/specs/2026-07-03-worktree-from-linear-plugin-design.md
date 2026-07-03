# Worktree from Linear Issue — Herdr Plugin Design

**Date:** 2026-07-03
**Status:** Approved (design)
**Sibling:** [tdi/herdr-worktree-from-pr](https://github.com/tdi/herdr-worktree-from-pr) — same architecture; this mirrors it for Linear issues instead of GitHub PRs.

## Problem

Starting work on a Linear issue means creating a branch (Linear even suggests the name) and a worktree, without disturbing the current checkout. Doing it by hand each time is repetitive. This plugin turns "pick a Linear issue" into "worktree created on the issue's branch, off latest mainline, focused."

## Goal

Keybind → pick an active Linear issue from your teams → create a git worktree on the issue's Linear-suggested branch, based on the repo's default branch → open and focus it. Worktree only. Composes with `tdi.worktree-setup` (fires on `worktree.created` to run per-repo setup).

Non-goals (YAGNI):
- Editing Linear issue state / assignment (read-only).
- Teardown / closing worktrees.
- Non-Linear issue trackers.
- Windows in v0.1.0 (`platforms = ["linux", "macos"]`).

## Decisions (from brainstorming)

| Fork | Decision |
|------|----------|
| Scope | New standalone plugin `tdi.worktree-from-linear`, mirroring worktree-from-pr. |
| Invocation | Keybindable action opens an interactive overlay pane listing active issues. |
| Issue scope | Team-wide active issues (state type `unstarted` + `started`) across the API key's teams, newest first, capped at `issueLimit`. Optional `teamKey` filter. |
| Repo | The active workspace's repo, resolved from the invoking pane (same `HERDR_WFP_CWD` mechanism as worktree-from-pr). |
| Branch name | Linear's own `issue.branchName` (e.g. `tdi/bit-990-slug`). |
| Branch base | Repo default branch (`origin/<default>`); fetch it, branch off it fresh. |
| Linear access | No official CLI: POST GraphQL to `https://api.linear.app/graphql` with a personal API key, using Node's built-in `fetch`. Zero runtime deps. |
| Already-exists | If a worktree for that branch exists, open + focus it instead of recreating. |
| Language | Node.js (ESM), zero runtime deps. |

## Herdr integration constraints (learned shipping worktree-from-pr, verified live)

- **Pass the repo to the picker pane via `--env HERDR_WFP_CWD=<repo>`, NOT `--cwd`.** The pane command `["node","bin/picker.js"]` is relative to the plugin root; `--cwd` would break its resolution. `open.js` reads the repo from its own (reliable) action context and passes it as env; `resolveRepo` prefers `HERDR_WFP_CWD` over the pane's own context JSON (which points at the plugin install dir).
- Overlay panes DO get an interactive PTY, so fzf/readline work.
- Keybinds: `[[keys.command]]` with `type = "plugin_action"`, `command = "tdi.worktree-from-linear.pick"`. Use `prefix+<letter>` (macOS composes `alt`/option). Apply with `herdr server reload-config` (no restart).

## Plugin manifest (`herdr-plugin.toml`)

```toml
id = "tdi.worktree-from-linear"
name = "Worktree from Linear"
version = "0.1.0"
min_herdr_version = "0.7.0"
description = "Create a git worktree from a Linear issue and open it as a workspace"
platforms = ["linux", "macos"]

[[actions]]
id = "pick"
title = "Worktree from Linear issue"
contexts = ["workspace", "tab", "pane"]
command = ["node", "bin/open.js"]

[[panes]]
id = "picker"
title = "Pick a Linear issue"
placement = "overlay"
command = ["node", "bin/picker.js"]
```

## Runtime flow

**`bin/open.js`** (action): resolve the invoking repo cwd from `HERDR_PLUGIN_CONTEXT_JSON` (focused_pane_cwd → workspace_cwd → nested worktree/repo_root → `process.cwd()`), then open the picker pane:
`herdr plugin pane open --plugin tdi.worktree-from-linear --entrypoint picker --placement overlay --focus --env HERDR_WFP_CWD=<repo>`.

**`bin/picker.js`** (orchestrator over `lib/`), via `lib/run.js run({env, exec, fetch, select, log})`:

1. **Config** (`lib/config.js`) — load `config.json`; require `linearApiKey`; defaults `issueLimit = 50`, `teamKey` unset, `baseBranch` unset.
2. **Resolve repo** (`lib/repo.js`) — prefer `HERDR_WFP_CWD`; `git -C <cwd> rev-parse --show-toplevel` → repo root. (No GitHub remote check — Linear is repo-agnostic.)
3. **List issues** (`lib/linear.js`) — POST GraphQL to Linear with the API key; query active issues (state type in `unstarted`,`started`), optional `teamKey` filter, first `issueLimit`, ordered by `updatedAt` desc. Parse into `{ identifier, title, branchName, stateName, assignee, url }`.
4. **Pick** (`lib/picker.js`) — one line per issue: `<identifier>  <title>  [<stateName>] @<assignee>`; fzf if present, else Node `readline`. Map the chosen line back to its issue by leading identifier.
5. **Resolve base branch** (`lib/base.js`) — `git -C <repo> symbolic-ref --short refs/remotes/origin/HEAD` → strip `origin/`; fallback to config `baseBranch`, else `main`.
6. **Create/open worktree** (`lib/worktree.js`) —
   - If a worktree for `issue.branchName` already exists (`git worktree list --porcelain`) or the local branch exists → `herdr worktree open --cwd <repo> --branch <branchName> --focus --json`.
   - Else `git -C <repo> fetch origin <base>` then `herdr worktree create --cwd <repo> --branch <branchName> --base origin/<base> --focus --json`.
   - Herdr opens + focuses the new workspace; the overlay closes.

## Module boundaries

| File | Responsibility | Depends on |
|------|----------------|-----------|
| `bin/open.js` | resolve repo cwd, open the picker overlay pane (`--env`, not `--cwd`) | `HERDR_PLUGIN_CONTEXT_JSON` |
| `bin/picker.js` | thin: call `run`, map errors to exit code | `lib/run.js` |
| `lib/run.js` | orchestrate config → repo → list → pick → base → create; injectable `exec`/`fetch`/`select`/`log` | the `lib/` modules |
| `lib/config.js` | load `config.json`, defaults, require `linearApiKey` | `fs` |
| `lib/repo.js` | repo root from context/`HERDR_WFP_CWD` (pure `parseContextCwd` + exec wrapper) | `child_process` |
| `lib/linear.js` | build GraphQL query (pure), POST via injected `fetch`, parse issues (pure) | `fetch` |
| `lib/base.js` | detect default branch (pure parse of `symbolic-ref` output + fallback) | `child_process` |
| `lib/worktree.js` | worktree/branch-exists check + fetch + `herdr worktree create --base`/`open` | `child_process`, `HERDR_BIN_PATH`, `git` |
| `lib/picker.js` | fzf-or-Node selection; format + reverse-map | `child_process` (fzf), `readline` |
| `lib/pane.js` | `openPickerArgs(pluginId, cwd)` → argv with `--env HERDR_WFP_CWD` | — |
| `lib/exec.js` | `runCmd` spawnSync wrapper | `child_process` |

The pure/parse units (`linear.js` query+parse, `base.js`, `picker.js` format/reverse-map, `config.js`, `worktree.js` argv, `pane.js`) are testable without Linear, git, herdr, or a TTY, using injected `fetch`/`exec`. Exec/HTTP wrappers stay thin.

## Linear GraphQL

Endpoint `https://api.linear.app/graphql`, header `Authorization: <linearApiKey>` (Linear personal API keys are sent raw, not `Bearer`). Query shape:

```graphql
query($first: Int!) {
  issues(
    first: $first,
    orderBy: updatedAt,
    filter: { state: { type: { in: ["unstarted", "started"] } } }
  ) {
    nodes { identifier title branchName url
            state { name } assignee { displayName } team { key } }
  }
}
```

`teamKey`, when set, adds `team: { key: { eq: <teamKey> } }` to the filter. Parse `nodes` → records; missing optional fields default to `''`.

## Config (optional `config.json` in `HERDR_PLUGIN_CONFIG_DIR`)

```json
{
  "linearApiKey": "lin_api_...",
  "issueLimit": 50,
  "teamKey": "BIT",
  "baseBranch": "main"
}
```

`linearApiKey` required (clear error if missing). `issueLimit` default 50. `teamKey`, `baseBranch` optional.

## Error handling

| Condition | Behavior |
|-----------|----------|
| `linearApiKey` missing | message ("set linearApiKey in config"), exit non-zero |
| Linear API error / auth failure | message with status/body, exit non-zero |
| cwd not a git repo | message, exit non-zero |
| no active issues | message ("no active issues"), exit 0 |
| user cancels picker | exit 0, no-op |
| `git fetch` fails | message with git error, exit non-zero |
| worktree create/open fails | message with herdr error, exit non-zero |

Status lines go to stdout; `bin/picker.js` catch writes errors to stderr and exits 1.

## Testing (node:test + node:assert)

- **linear.test.js** — query builder includes/excludes the `teamKey` filter; `parseIssues` maps sample GraphQL JSON → records; empty/malformed → `[]`; `listIssues` with injected `fetch` (success + non-200 throws).
- **base.test.js** — `symbolic-ref` output `origin/main` → `main`; empty → config fallback → `main`.
- **config.test.js** — defaults; partial merge; missing `linearApiKey` throws; malformed JSON throws.
- **repo.test.js** — `parseContextCwd` precedence incl. `HERDR_WFP_CWD`; `resolveRepo` with injected exec.
- **picker.test.js** — records → lines; chosen line maps back by identifier (identifiers with digits, titles containing brackets).
- **worktree.test.js** — porcelain sample → exists decision; `create --base origin/<base>` vs `open` argv (injected exec); no-fetch-when-exists.
- **pane.test.js** — `openPickerArgs` emits `--env HERDR_WFP_CWD=<cwd>`, never `--cwd`.
- **run.test.js** — whole flow with injected `fetch`+`exec`+`select`: lists issues, creates worktree with the issue branch off `origin/<base>`; no-issues and cancel short-circuit to exit 0.

Linear/git/herdr/fzf/TTY are exercised against sample payloads or injected fakes, never live.

## Repository structure

```
herdr-plugin.toml
package.json
config.example.json
README.md
bin/   open.js  picker.js
lib/   run.js  config.js  repo.js  linear.js  base.js  worktree.js  picker.js  pane.js  exec.js
test/  *.test.js
```

## Prerequisites (README)

- **`fzf`** — the fuzzy picker (`brew install fzf`); required for the intended overlay. Falls back to a numbered prompt.
- **A Linear personal API key** in the plugin config (`linearApiKey`).
- **`git`**, **Node.js** (herdr invokes `node`). No `gh` needed.

## Open runtime unknowns (handled defensively)

- `herdr worktree create --base REF` semantics for a brand-new branch — verified `--base` is accepted by the CLI; confirm the created branch points at `origin/<base>` during a live spin.
- Whether `git symbolic-ref refs/remotes/origin/HEAD` is set in a given clone — fallback to config `baseBranch` then `main`.
- Linear API key header form (raw vs `Bearer`) — Linear personal keys are raw; confirm against a live call during implementation.
