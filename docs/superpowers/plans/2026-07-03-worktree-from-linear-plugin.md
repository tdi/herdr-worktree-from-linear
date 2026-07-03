# Worktree from Linear Issue Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a herdr plugin that lists a team's active Linear issues in an overlay picker and creates+focuses a git worktree on the chosen issue's Linear branch, based on a configurable base branch.

**Architecture:** A keybindable action (`bin/open.js`) resolves the invoking repo from its context and opens an interactive overlay pane (`bin/picker.js`). The orchestration lives in `lib/run.js` with injected `exec`/`fetch`/`select`, so the whole flow is testable without live Linear/git/herdr/fzf. Pure helpers (Linear query+parse, base resolution, branch/worktree argv, picker format, config) sit in focused `lib/` modules.

**Tech Stack:** Node.js (ESM), zero runtime deps, `node:test` + `node:assert`, Linear GraphQL via Node's built-in `fetch`, `git`, herdr CLI via `HERDR_BIN_PATH`, optional `fzf`.

## Global Constraints

- `id = "tdi.worktree-from-linear"`; manifest `herdr-plugin.toml`; `min_herdr_version = "0.7.0"`; `platforms = ["linux", "macos"]`.
- Node ESM: `package.json` has `"type": "module"`. **Zero** runtime dependencies. Test script `node --test`.
- Call herdr via `HERDR_BIN_PATH` (fallback `"herdr"`). Use `git` from PATH. No `gh`.
- Linear: POST GraphQL to `https://api.linear.app/graphql` with header `Authorization: <linearApiKey>` (raw, not `Bearer`).
- Repo is passed to the picker pane via `--env HERDR_WFP_CWD=<repo>`, **never** `--cwd` (that breaks the relative `node bin/picker.js` command). `resolveRepo` prefers `HERDR_WFP_CWD`.
- Config (`config.json`): `linearApiKey` (required — clear error if missing), `issueLimit` (default 50), `base` (default `"default"`), `teamKey` (optional).
- `base` modes: `"default"` → `origin/<repo default branch>` (fetch); `"head"` → `HEAD` (no fetch); any other string → `origin/<that branch>` (fetch).
- Issue scope: team-wide active issues (state type `unstarted`+`started`), `orderBy: updatedAt`, first `issueLimit`; optional `teamKey` filter.
- Branch name = Linear's `issue.branchName`.
- No emojis. No co-author trailers in commits.

## File Structure

| File | Responsibility |
|------|----------------|
| `herdr-plugin.toml` | manifest: action `pick` → `bin/open.js`; overlay pane `picker` → `bin/picker.js` |
| `package.json` | ESM, no deps, `test` script |
| `lib/exec.js` | `runCmd` spawnSync wrapper |
| `lib/config.js` | load `config.json`, defaults, require `linearApiKey` |
| `lib/repo.js` | repo root from `HERDR_WFP_CWD`/context |
| `lib/linear.js` | GraphQL body builder (pure), `parseIssues` (pure), `listIssues` (injected fetch) |
| `lib/base.js` | `resolveBase` → `{ baseRef, needsFetch, baseBranch }` |
| `lib/picker.js` | format lines, map line→issue, fzf-or-Node `select` |
| `lib/worktree.js` | worktree/branch-exists check, argv builder (`--base`), fetch + create/open |
| `lib/pane.js` | `openPickerArgs` (pure) — argv with `--env HERDR_WFP_CWD` |
| `lib/run.js` | orchestrator |
| `bin/open.js` | action: resolve cwd, open picker overlay |
| `bin/picker.js` | pane entry: call `run`, map errors to exit code |
| `config.example.json` | sample config |
| `README.md` | prerequisites + usage |

---

## Task 1: Project scaffold

**Files:** Create `package.json`, `herdr-plugin.toml`, `.gitignore`, `config.example.json`, `test/smoke.test.js`

**Interfaces:** Produces a runnable project — `npm test` runs `node --test`.

- [ ] **Step 1: `package.json`**

```json
{
  "name": "herdr-worktree-from-linear",
  "version": "0.1.0",
  "description": "Create a git worktree from a Linear issue and open it as a herdr workspace",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: `herdr-plugin.toml`**

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

- [ ] **Step 3: `.gitignore`**

```
node_modules/
*.log
```

- [ ] **Step 4: `config.example.json`**

```json
{
  "linearApiKey": "lin_api_xxx",
  "issueLimit": 50,
  "base": "default",
  "teamKey": "BIT"
}
```

- [ ] **Step 5: `test/smoke.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('node test runner works', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 6: Run tests** — `npm test` → PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add package.json herdr-plugin.toml .gitignore config.example.json test/smoke.test.js
git commit -m "chore: scaffold worktree-from-linear plugin"
```

---

## Task 2: exec + config

**Files:** Create `lib/exec.js`, `lib/config.js`; Test `test/exec.test.js`, `test/config.test.js`

**Interfaces:**
- Produces: `runCmd(cmd, args, opts?) => {status, stdout, stderr}`; `loadConfig(configDir?) => {linearApiKey, issueLimit, base, teamKey?}` (throws if `linearApiKey` missing or JSON malformed).

- [ ] **Step 1: `test/exec.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCmd } from '../lib/exec.js';

test('runCmd returns status and stdout', () => {
  const res = runCmd('printf', ['hello']);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, 'hello');
});

test('runCmd reports non-zero status', () => {
  assert.equal(runCmd('sh', ['-c', 'exit 3']).status, 3);
});
```

- [ ] **Step 2: `test/config.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.js';

function withDir(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'wfl-'));
  if (contents !== null) writeFileSync(join(dir, 'config.json'), contents);
  return dir;
}

test('loadConfig merges defaults and keeps the api key', () => {
  const dir = withDir('{"linearApiKey":"k"}');
  assert.deepEqual(loadConfig(dir), { issueLimit: 50, base: 'default', linearApiKey: 'k' });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig honors overrides', () => {
  const dir = withDir('{"linearApiKey":"k","issueLimit":10,"base":"head","teamKey":"BIT"}');
  assert.deepEqual(loadConfig(dir), { issueLimit: 10, base: 'head', linearApiKey: 'k', teamKey: 'BIT' });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig throws when linearApiKey is missing', () => {
  const dir = withDir('{"issueLimit":5}');
  assert.throws(() => loadConfig(dir), /set linearApiKey/);
  assert.throws(() => loadConfig(undefined), /set linearApiKey/);
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig throws on malformed JSON', () => {
  const dir = withDir('{bad');
  assert.throws(() => loadConfig(dir), /invalid config\.json/);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 3: Run to verify fail** — `node --test test/exec.test.js test/config.test.js` → FAIL (modules not found).

- [ ] **Step 4: `lib/exec.js`**

```js
import { spawnSync } from 'node:child_process';

export function runCmd(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return {
    status: res.status ?? 1,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
  };
}
```

- [ ] **Step 5: `lib/config.js`**

```js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULTS = { issueLimit: 50, base: 'default' };

export function loadConfig(configDir) {
  let parsed = {};
  if (configDir) {
    let text = null;
    try {
      text = readFileSync(join(configDir, 'config.json'), 'utf8');
    } catch {
      text = null;
    }
    if (text !== null) {
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error(`worktree-from-linear: invalid config.json: ${err.message}`);
      }
    }
  }
  const config = { ...DEFAULTS, ...parsed };
  if (typeof config.linearApiKey !== 'string' || !config.linearApiKey) {
    throw new Error('worktree-from-linear: set linearApiKey in config.json (Linear personal API key)');
  }
  return config;
}
```

- [ ] **Step 6: Run to verify pass** — `node --test test/exec.test.js test/config.test.js` → PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/exec.js lib/config.js test/exec.test.js test/config.test.js
git commit -m "feat: exec wrapper and config loading with required linearApiKey"
```

---

## Task 3: Repo resolution

**Files:** Create `lib/repo.js`; Test `test/repo.test.js`

**Interfaces:**
- Consumes: `runCmd` from `lib/exec.js`.
- Produces: `parseContextCwd(contextJson?, fallbackCwd) => string`; `resolveRepo(env, exec?) => { repoRoot }` (throws if not a git repo). Prefers `env.HERDR_WFP_CWD`.

- [ ] **Step 1: `test/repo.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseContextCwd, resolveRepo } from '../lib/repo.js';

test('parseContextCwd prefers flat keys then nested then fallback', () => {
  assert.equal(parseContextCwd(JSON.stringify({ focused_pane_cwd: '/a', workspace_cwd: '/b' }), '/f'), '/a');
  assert.equal(parseContextCwd(JSON.stringify({ workspace_cwd: '/b' }), '/f'), '/b');
  assert.equal(parseContextCwd(JSON.stringify({ worktree: { checkout_path: '/wt' } }), '/f'), '/wt');
  assert.equal(parseContextCwd(JSON.stringify({ repo_root: '/r' }), '/f'), '/r');
  assert.equal(parseContextCwd('not json', '/f'), '/f');
  assert.equal(parseContextCwd(undefined, '/f'), '/f');
});

test('resolveRepo prefers HERDR_WFP_CWD over context JSON', () => {
  const env = { HERDR_WFP_CWD: '/explicit/repo', HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ focused_pane_cwd: '/plugin/dir' }) };
  const seen = [];
  const exec = (cmd, args) => {
    if (cmd === 'git' && args.includes('--show-toplevel')) { seen.push(args.join(' ')); return { status: 0, stdout: '/explicit/repo\n', stderr: '' }; }
    return { status: 1, stdout: '', stderr: '' };
  };
  assert.deepEqual(resolveRepo(env, exec), { repoRoot: '/explicit/repo' });
  assert.ok(seen[0].includes('-C /explicit/repo'));
});

test('resolveRepo throws when not a git repo', () => {
  const exec = () => ({ status: 1, stdout: '', stderr: 'fatal' });
  assert.throws(() => resolveRepo({}, exec), /not inside a git repository/);
});
```

- [ ] **Step 2: Run to verify fail** — `node --test test/repo.test.js` → FAIL.

- [ ] **Step 3: `lib/repo.js`**

```js
import { runCmd } from './exec.js';

function firstString(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

export function parseContextCwd(contextJson, fallbackCwd) {
  let ctx = null;
  try {
    ctx = contextJson ? JSON.parse(contextJson) : null;
  } catch {
    ctx = null;
  }
  if (ctx && typeof ctx === 'object') {
    const pane = ctx.focused_pane && typeof ctx.focused_pane === 'object' ? ctx.focused_pane : {};
    const workspace = ctx.workspace && typeof ctx.workspace === 'object' ? ctx.workspace : {};
    const worktree = ctx.worktree && typeof ctx.worktree === 'object' ? ctx.worktree : {};
    const found = firstString(
      ctx.focused_pane_cwd, pane.cwd, pane.working_directory,
      ctx.workspace_cwd, workspace.cwd, workspace.path,
      worktree.checkout_path, worktree.path, worktree.workspace_cwd,
      ctx.cwd, ctx.repo_root,
    );
    if (found) return found;
  }
  return fallbackCwd;
}

export function resolveRepo(env, exec = runCmd) {
  const cwd = (typeof env.HERDR_WFP_CWD === 'string' && env.HERDR_WFP_CWD)
    || parseContextCwd(env.HERDR_PLUGIN_CONTEXT_JSON, env.PWD || process.cwd());
  const top = exec('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
  if (top.status !== 0) {
    throw new Error('worktree-from-linear: not inside a git repository');
  }
  return { repoRoot: top.stdout.trim() };
}
```

- [ ] **Step 4: Run to verify pass** — `node --test test/repo.test.js` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/repo.js test/repo.test.js
git commit -m "feat: resolve repo root, preferring HERDR_WFP_CWD"
```

---

## Task 4: Linear GraphQL

**Files:** Create `lib/linear.js`; Test `test/linear.test.js`

**Interfaces:**
- Produces:
  - `buildIssuesBody(issueLimit, teamKey?) => { query: string, variables: { first: number } }` (pure; includes a `team` filter only when `teamKey` is set).
  - `parseIssues(jsonText) => Array<{identifier, title, branchName, url, stateName, assignee, teamKey}>` (pure; `[]` on empty/malformed/missing nodes).
  - `listIssues(config, fetchFn?) => Promise<Issue[]>` (POSTs to Linear; throws on non-2xx or GraphQL `errors`).

- [ ] **Step 1: `test/linear.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIssuesBody, parseIssues, listIssues } from '../lib/linear.js';

const SAMPLE = JSON.stringify({ data: { issues: { nodes: [
  { identifier: 'BIT-990', title: 'Label API keys', branchName: 'tdi/bit-990-label', url: 'u1', state: { name: 'In Progress' }, assignee: { displayName: 'Darek' }, team: { key: 'BIT' } },
  { identifier: 'BIT-988', title: 'REST API [v2]', branchName: 'tdi/bit-988-rest', url: 'u2', state: { name: 'Todo' }, assignee: null, team: { key: 'BIT' } },
] } } });

test('buildIssuesBody sets first and the active-state filter, team optional', () => {
  const a = buildIssuesBody(50);
  assert.equal(a.variables.first, 50);
  assert.match(a.query, /unstarted/);
  assert.match(a.query, /started/);
  assert.equal(/team:/.test(a.query), false);
  const b = buildIssuesBody(10, 'BIT');
  assert.match(b.query, /team:\s*\{\s*key:\s*\{\s*eq:\s*"BIT"/);
});

test('parseIssues maps nodes and defaults missing fields', () => {
  const issues = parseIssues(SAMPLE);
  assert.equal(issues.length, 2);
  assert.deepEqual(issues[0], { identifier: 'BIT-990', title: 'Label API keys', branchName: 'tdi/bit-990-label', url: 'u1', stateName: 'In Progress', assignee: 'Darek', teamKey: 'BIT' });
  assert.equal(issues[1].assignee, '');
});

test('parseIssues returns [] on empty/malformed', () => {
  assert.deepEqual(parseIssues('{"data":{"issues":{"nodes":[]}}}'), []);
  assert.deepEqual(parseIssues('not json'), []);
  assert.deepEqual(parseIssues('{}'), []);
});

test('listIssues posts with auth header and returns records', async () => {
  const calls = [];
  const fetchFn = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, text: async () => SAMPLE }; };
  const issues = await listIssues({ linearApiKey: 'k', issueLimit: 50 }, fetchFn);
  assert.equal(issues.length, 2);
  assert.equal(calls[0].url, 'https://api.linear.app/graphql');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'k');
});

test('listIssues throws on non-2xx', async () => {
  const fetchFn = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
  await assert.rejects(() => listIssues({ linearApiKey: 'k', issueLimit: 50 }, fetchFn), /Linear API error 401/);
});

test('listIssues throws on GraphQL errors payload', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => '{"errors":[{"message":"bad"}]}' });
  await assert.rejects(() => listIssues({ linearApiKey: 'k', issueLimit: 50 }, fetchFn), /GraphQL error/);
});
```

- [ ] **Step 2: Run to verify fail** — `node --test test/linear.test.js` → FAIL.

- [ ] **Step 3: `lib/linear.js`**

```js
const ENDPOINT = 'https://api.linear.app/graphql';

export function buildIssuesBody(issueLimit, teamKey) {
  const parts = ['state: { type: { in: ["unstarted", "started"] } }'];
  if (teamKey) parts.push(`team: { key: { eq: ${JSON.stringify(teamKey)} } }`);
  const filter = `{ ${parts.join(', ')} }`;
  const query = `query($first: Int!) { issues(first: $first, orderBy: updatedAt, filter: ${filter}) { nodes { identifier title branchName url state { name } assignee { displayName } team { key } } } }`;
  return { query, variables: { first: issueLimit } };
}

export function parseIssues(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const nodes = data && data.data && data.data.issues && data.data.issues.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n) => ({
    identifier: n.identifier ?? '',
    title: n.title ?? '',
    branchName: n.branchName ?? '',
    url: n.url ?? '',
    stateName: n.state?.name ?? '',
    assignee: n.assignee?.displayName ?? '',
    teamKey: n.team?.key ?? '',
  }));
}

export async function listIssues(config, fetchFn = fetch) {
  const body = buildIssuesBody(config.issueLimit, config.teamKey);
  const res = await fetchFn(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: config.linearApiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`worktree-from-linear: Linear API error ${res.status}: ${String(text).slice(0, 300)}`);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('worktree-from-linear: Linear returned non-JSON');
  }
  if (json.errors) {
    throw new Error(`worktree-from-linear: Linear GraphQL error: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  return parseIssues(text);
}
```

- [ ] **Step 4: Run to verify pass** — `node --test test/linear.test.js` → PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/linear.js test/linear.test.js
git commit -m "feat: Linear GraphQL query, parse, and fetch"
```

---

## Task 5: Base branch resolution

**Files:** Create `lib/base.js`; Test `test/base.test.js`

**Interfaces:**
- Consumes: `runCmd` from `lib/exec.js`.
- Produces:
  - `parseDefaultBranch(symbolicRefStdout) => string | null` (strips `origin/`).
  - `resolveBase(repoRoot, config?, exec?) => { baseRef: string, needsFetch: boolean, baseBranch: string | null }`.

- [ ] **Step 1: `test/base.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDefaultBranch, resolveBase } from '../lib/base.js';

test('parseDefaultBranch strips origin/ and handles empty', () => {
  assert.equal(parseDefaultBranch('origin/main\n'), 'main');
  assert.equal(parseDefaultBranch('origin/trunk'), 'trunk');
  assert.equal(parseDefaultBranch(''), null);
  assert.equal(parseDefaultBranch(undefined), null);
});

test('resolveBase default reads origin/HEAD', () => {
  const exec = (cmd, args) => (cmd === 'git' && args.includes('symbolic-ref'))
    ? { status: 0, stdout: 'origin/main\n', stderr: '' } : { status: 1, stdout: '', stderr: '' };
  assert.deepEqual(resolveBase('/repo', { base: 'default' }, exec), { baseRef: 'origin/main', needsFetch: true, baseBranch: 'main' });
});

test('resolveBase default falls back to main when origin/HEAD unset', () => {
  const exec = () => ({ status: 1, stdout: '', stderr: 'no HEAD' });
  assert.deepEqual(resolveBase('/repo', {}, exec), { baseRef: 'origin/main', needsFetch: true, baseBranch: 'main' });
});

test('resolveBase head uses HEAD and skips fetch', () => {
  assert.deepEqual(resolveBase('/repo', { base: 'head' }, () => ({ status: 0, stdout: '', stderr: '' })), { baseRef: 'HEAD', needsFetch: false, baseBranch: null });
});

test('resolveBase with an explicit branch bases off origin/<name>', () => {
  assert.deepEqual(resolveBase('/repo', { base: 'develop' }, () => ({ status: 0, stdout: '', stderr: '' })), { baseRef: 'origin/develop', needsFetch: true, baseBranch: 'develop' });
});
```

- [ ] **Step 2: Run to verify fail** — `node --test test/base.test.js` → FAIL.

- [ ] **Step 3: `lib/base.js`**

```js
import { runCmd } from './exec.js';

export function parseDefaultBranch(symbolicRefStdout) {
  const s = (symbolicRefStdout || '').trim();
  if (!s) return null;
  return s.replace(/^origin\//, '');
}

export function resolveBase(repoRoot, config = {}, exec = runCmd) {
  const base = config.base || 'default';
  if (base === 'head') {
    return { baseRef: 'HEAD', needsFetch: false, baseBranch: null };
  }
  if (base === 'default') {
    const res = exec('git', ['-C', repoRoot, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    const branch = (res.status === 0 && parseDefaultBranch(res.stdout)) || 'main';
    return { baseRef: `origin/${branch}`, needsFetch: true, baseBranch: branch };
  }
  return { baseRef: `origin/${base}`, needsFetch: true, baseBranch: base };
}
```

- [ ] **Step 4: Run to verify pass** — `node --test test/base.test.js` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/base.js test/base.test.js
git commit -m "feat: base branch resolution (default/head/named)"
```

---

## Task 6: Picker (format + select)

**Files:** Create `lib/picker.js`; Test `test/picker.test.js`

**Interfaces:**
- Consumes: `runCmd` from `lib/exec.js`.
- Produces:
  - `formatLine(issue) => string`, `formatLines(issues) => string[]`.
  - `lineToIssue(line, issues) => issue | null` (matches leading identifier token).
  - `select(issues, { exec? }) => Promise<issue | null>` (fzf if present, else Node numbered prompt; `null` on cancel/empty).

- [ ] **Step 1: `test/picker.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLine, formatLines, lineToIssue } from '../lib/picker.js';

const ISSUES = [
  { identifier: 'BIT-990', title: 'Label API keys', branchName: 'tdi/bit-990-label', stateName: 'In Progress', assignee: 'Darek' },
  { identifier: 'BIT-988', title: 'REST API [v2]', branchName: 'tdi/bit-988-rest', stateName: 'Todo', assignee: '' },
];

test('formatLine leads with the identifier and shows state', () => {
  assert.match(formatLine(ISSUES[0]), /^BIT-990\s+Label API keys\s+\[In Progress\] @Darek$/);
  assert.match(formatLine(ISSUES[1]), /^BIT-988\s+REST API \[v2\]\s+\[Todo\] @$/);
});

test('lineToIssue maps a chosen line back by leading identifier', () => {
  const lines = formatLines(ISSUES);
  assert.equal(lineToIssue(lines[0], ISSUES).identifier, 'BIT-990');
  assert.equal(lineToIssue(lines[1], ISSUES).identifier, 'BIT-988');   // title contains '[v2]' but leading token wins
  assert.equal(lineToIssue('', ISSUES), null);
  assert.equal(lineToIssue('NOPE-1 gone', ISSUES), null);
});
```

- [ ] **Step 2: Run to verify fail** — `node --test test/picker.test.js` → FAIL.

- [ ] **Step 3: `lib/picker.js`**

```js
import { createInterface } from 'node:readline';
import { runCmd } from './exec.js';

export function formatLine(issue) {
  return `${issue.identifier}  ${issue.title}  [${issue.stateName}] @${issue.assignee}`;
}

export function formatLines(issues) {
  return issues.map(formatLine);
}

export function lineToIssue(line, issues) {
  const m = /^(\S+)/.exec(line || '');
  if (!m) return null;
  return issues.find((i) => i.identifier === m[1]) ?? null;
}

function hasFzf(exec) {
  return exec('sh', ['-c', 'command -v fzf']).status === 0;
}

function nodeSelect(issues, lines) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    lines.forEach((l, i) => process.stdout.write(`  ${i + 1}) ${l}\n`));
    rl.question('Select an issue number (or blank to cancel): ', (answer) => {
      rl.close();
      const idx = Number(answer.trim()) - 1;
      resolve(Number.isInteger(idx) && idx >= 0 && idx < issues.length ? issues[idx] : null);
    });
  });
}

export async function select(issues, { exec = runCmd } = {}) {
  if (!issues.length) return null;
  const lines = formatLines(issues);
  if (hasFzf(exec)) {
    const res = exec('fzf', ['--prompt', 'issue> '], { input: lines.join('\n') });
    if (res.status !== 0) return null;
    return lineToIssue(res.stdout.trim(), issues);
  }
  return nodeSelect(issues, lines);
}
```

- [ ] **Step 4: Run to verify pass** — `node --test test/picker.test.js` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/picker.js test/picker.test.js
git commit -m "feat: issue picker formatting and fzf/node selection"
```

---

## Task 7: Worktree create/open with base

**Files:** Create `lib/worktree.js`; Test `test/worktree.test.js`

**Interfaces:**
- Consumes: `runCmd` from `lib/exec.js`; a base object `{ baseRef, needsFetch, baseBranch }` from `lib/base.js`.
- Produces:
  - `worktreeExistsForBranch(porcelain, branchName) => boolean`.
  - `localBranchExists(repoRoot, branchName, exec?) => boolean`.
  - `buildWorktreeArgs(exists, repoRoot, branchName, baseRef) => string[]` (open omits `--base`; create includes `--base baseRef`).
  - `createOrOpenWorktree(repoRoot, branchName, base, exec?, herdrBin?) => { exists, branchName, args, stdout }`.

- [ ] **Step 1: `test/worktree.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worktreeExistsForBranch, localBranchExists, buildWorktreeArgs, createOrOpenWorktree } from '../lib/worktree.js';

const PORCELAIN = 'worktree /repo\nbranch refs/heads/main\n\nworktree /wt/x\nbranch refs/heads/tdi/bit-9\n';

test('worktreeExistsForBranch matches whole branch line', () => {
  assert.equal(worktreeExistsForBranch(PORCELAIN, 'tdi/bit-9'), true);
  assert.equal(worktreeExistsForBranch(PORCELAIN, 'tdi/bit-99'), false);
});

test('localBranchExists reflects rev-parse status', () => {
  assert.equal(localBranchExists('/repo', 'b', () => ({ status: 0, stdout: '', stderr: '' })), true);
  assert.equal(localBranchExists('/repo', 'b', () => ({ status: 1, stdout: '', stderr: '' })), false);
});

test('buildWorktreeArgs adds --base only on create', () => {
  assert.deepEqual(buildWorktreeArgs(false, '/repo', 'b', 'origin/main'), ['worktree', 'create', '--cwd', '/repo', '--branch', 'b', '--base', 'origin/main', '--focus', '--json']);
  assert.deepEqual(buildWorktreeArgs(true, '/repo', 'b', 'origin/main'), ['worktree', 'open', '--cwd', '/repo', '--branch', 'b', '--focus', '--json']);
});

test('createOrOpenWorktree fetches base then creates when nothing exists', () => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args.includes('list')) return { status: 0, stdout: 'worktree /repo\nbranch refs/heads/main\n', stderr: '' };
    if (cmd === 'git' && args.includes('rev-parse')) return { status: 1, stdout: '', stderr: '' };
    return { status: 0, stdout: '{}', stderr: '' };
  };
  const res = createOrOpenWorktree('/repo', 'tdi/bit-1', { baseRef: 'origin/main', needsFetch: true, baseBranch: 'main' }, exec, 'herdr');
  assert.equal(res.exists, false);
  assert.ok(calls.some((c) => c[0] === 'git' && c.includes('fetch') && c.includes('main')));
  assert.deepEqual(res.args, ['worktree', 'create', '--cwd', '/repo', '--branch', 'tdi/bit-1', '--base', 'origin/main', '--focus', '--json']);
});

test('createOrOpenWorktree skips fetch when base needsFetch is false (head)', () => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args.includes('list')) return { status: 0, stdout: 'worktree /repo\n', stderr: '' };
    if (cmd === 'git' && args.includes('rev-parse')) return { status: 1, stdout: '', stderr: '' };
    return { status: 0, stdout: '{}', stderr: '' };
  };
  const res = createOrOpenWorktree('/repo', 'tdi/bit-2', { baseRef: 'HEAD', needsFetch: false, baseBranch: null }, exec, 'herdr');
  assert.equal(calls.some((c) => c.includes('fetch')), false);
  assert.deepEqual(res.args, ['worktree', 'create', '--cwd', '/repo', '--branch', 'tdi/bit-2', '--base', 'HEAD', '--focus', '--json']);
});

test('createOrOpenWorktree opens without fetching when the worktree exists', () => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args.includes('list')) return { status: 0, stdout: 'worktree /repo\nbranch refs/heads/main\n\nworktree /wt/x\nbranch refs/heads/tdi/bit-3\n', stderr: '' };
    return { status: 0, stdout: '{}', stderr: '' };
  };
  const res = createOrOpenWorktree('/repo', 'tdi/bit-3', { baseRef: 'origin/main', needsFetch: true, baseBranch: 'main' }, exec, 'herdr');
  assert.equal(res.exists, true);
  assert.equal(calls.some((c) => c.includes('fetch')), false);
  assert.deepEqual(res.args, ['worktree', 'open', '--cwd', '/repo', '--branch', 'tdi/bit-3', '--focus', '--json']);
});

test('createOrOpenWorktree throws when fetch fails', () => {
  const exec = (cmd, args) => {
    if (cmd === 'git' && args.includes('list')) return { status: 0, stdout: 'worktree /repo\n', stderr: '' };
    if (cmd === 'git' && args.includes('rev-parse')) return { status: 1, stdout: '', stderr: '' };
    if (cmd === 'git' && args.includes('fetch')) return { status: 1, stdout: '', stderr: 'no ref' };
    return { status: 0, stdout: '', stderr: '' };
  };
  assert.throws(() => createOrOpenWorktree('/repo', 'b', { baseRef: 'origin/main', needsFetch: true, baseBranch: 'main' }, exec, 'herdr'), /git fetch failed: no ref/);
});
```

- [ ] **Step 2: Run to verify fail** — `node --test test/worktree.test.js` → FAIL.

- [ ] **Step 3: `lib/worktree.js`**

```js
import { runCmd } from './exec.js';

export function worktreeExistsForBranch(porcelain, branchName) {
  const target = `branch refs/heads/${branchName}`;
  return porcelain.split('\n').some((l) => l.trim() === target);
}

export function localBranchExists(repoRoot, branchName, exec = runCmd) {
  const res = exec('git', ['-C', repoRoot, 'rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`]);
  return res.status === 0;
}

export function buildWorktreeArgs(exists, repoRoot, branchName, baseRef) {
  if (exists) {
    return ['worktree', 'open', '--cwd', repoRoot, '--branch', branchName, '--focus', '--json'];
  }
  return ['worktree', 'create', '--cwd', repoRoot, '--branch', branchName, '--base', baseRef, '--focus', '--json'];
}

export function createOrOpenWorktree(repoRoot, branchName, base, exec = runCmd, herdrBin = 'herdr') {
  const list = exec('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain']);
  const worktreeExists = list.status === 0 && worktreeExistsForBranch(list.stdout, branchName);
  const exists = worktreeExists || localBranchExists(repoRoot, branchName, exec);
  if (!exists && base.needsFetch) {
    const fetch = exec('git', ['-C', repoRoot, 'fetch', 'origin', base.baseBranch]);
    if (fetch.status !== 0) {
      throw new Error(`worktree-from-linear: git fetch failed: ${fetch.stderr.trim() || 'unknown error'}`);
    }
  }
  const args = buildWorktreeArgs(worktreeExists, repoRoot, branchName, base.baseRef);
  const wt = exec(herdrBin, args);
  if (wt.status !== 0) {
    throw new Error(`worktree-from-linear: herdr worktree ${worktreeExists ? 'open' : 'create'} failed: ${wt.stderr.trim() || 'unknown error'}`);
  }
  return { exists: worktreeExists, branchName, args, stdout: wt.stdout };
}
```

- [ ] **Step 4: Run to verify pass** — `node --test test/worktree.test.js` → PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/worktree.js test/worktree.test.js
git commit -m "feat: create/open worktree on the issue branch off a base"
```

---

## Task 8: Orchestrator + entrypoints

**Files:** Create `lib/run.js`, `lib/pane.js`, `bin/open.js`, `bin/picker.js`; Test `test/run.test.js`, `test/pane.test.js`

**Interfaces:**
- Consumes: `loadConfig`, `resolveRepo`, `listIssues`, `resolveBase`, `createOrOpenWorktree`, `select`, `runCmd`.
- Produces:
  - `run({ env?, exec?, fetchFn?, select?, log? }) => Promise<number>`.
  - `openPickerArgs(pluginId?, cwd?) => string[]` (adds `--env HERDR_WFP_CWD=<cwd>` when cwd given; never `--cwd`).

- [ ] **Step 1: `test/pane.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPickerArgs } from '../lib/pane.js';

test('openPickerArgs targets the picker overlay entrypoint', () => {
  assert.deepEqual(openPickerArgs('tdi.worktree-from-linear'), [
    'plugin', 'pane', 'open', '--plugin', 'tdi.worktree-from-linear', '--entrypoint', 'picker', '--placement', 'overlay', '--focus',
  ]);
});

test('openPickerArgs passes the repo via HERDR_WFP_CWD env, never --cwd', () => {
  assert.deepEqual(openPickerArgs('tdi.worktree-from-linear', '/work/repo').slice(-2), ['--env', 'HERDR_WFP_CWD=/work/repo']);
  assert.equal(openPickerArgs('tdi.worktree-from-linear', '/work/repo').includes('--cwd'), false);
  assert.equal(openPickerArgs('tdi.worktree-from-linear').includes('--env'), false);
  assert.equal(openPickerArgs('tdi.worktree-from-linear', '').includes('--env'), false);
});
```

- [ ] **Step 2: `test/run.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../lib/run.js';

const SAMPLE = JSON.stringify({ data: { issues: { nodes: [
  { identifier: 'BIT-1', title: 'Do it', branchName: 'tdi/bit-1-do-it', url: 'u', state: { name: 'Todo' }, assignee: { displayName: 'D' }, team: { key: 'BIT' } },
] } } });

function keyDir() {
  const dir = mkdtempSync(join(tmpdir(), 'wfl-run-'));
  writeFileSync(join(dir, 'config.json'), '{"linearApiKey":"k"}');
  return dir;
}

function fakeExec() {
  const calls = [];
  const exec = (cmd, args = []) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args.includes('--show-toplevel')) return { status: 0, stdout: '/repo\n', stderr: '' };
    if (cmd === 'git' && args.includes('symbolic-ref')) return { status: 0, stdout: 'origin/main\n', stderr: '' };
    if (cmd === 'git' && args.includes('list')) return { status: 0, stdout: 'worktree /repo\nbranch refs/heads/main\n', stderr: '' };
    if (cmd === 'git' && args.includes('rev-parse')) return { status: 1, stdout: '', stderr: '' };
    if (cmd === 'git' && args.includes('fetch')) return { status: 0, stdout: '', stderr: '' };
    if (args[0] === 'worktree') return { status: 0, stdout: '{"type":"worktree_created"}', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  return { exec, calls };
}

test('run creates a worktree on the issue branch off origin/main', async () => {
  const dir = keyDir();
  const { exec, calls } = fakeExec();
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => SAMPLE });
  const code = await run({ env: { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_WFP_CWD: '/repo', HERDR_BIN_PATH: 'herdr' }, exec, fetchFn, select: async (list) => list[0], log: () => {} });
  assert.equal(code, 0);
  assert.ok(calls.some((c) => c.includes('fetch') && c.includes('main')));
  assert.ok(calls.some((c) => c[0] === 'herdr' && c.includes('create') && c.includes('tdi/bit-1-do-it') && c.includes('--base') && c.includes('origin/main')));
  rmSync(dir, { recursive: true, force: true });
});

test('run is a no-op when there are no active issues', async () => {
  const dir = keyDir();
  const { exec } = fakeExec();
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => '{"data":{"issues":{"nodes":[]}}}' });
  const logs = [];
  const code = await run({ env: { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_WFP_CWD: '/repo' }, exec, fetchFn, select: async () => null, log: (m) => logs.push(m) });
  assert.equal(code, 0);
  assert.ok(logs.some((m) => /no active issues/.test(m)));
  rmSync(dir, { recursive: true, force: true });
});

test('run is a no-op when the user cancels', async () => {
  const dir = keyDir();
  const { exec, calls } = fakeExec();
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => SAMPLE });
  const code = await run({ env: { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_WFP_CWD: '/repo' }, exec, fetchFn, select: async () => null, log: () => {} });
  assert.equal(code, 0);
  assert.equal(calls.some((c) => c.includes('fetch')), false);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 3: Run to verify fail** — `node --test test/run.test.js test/pane.test.js` → FAIL.

- [ ] **Step 4: `lib/pane.js`**

```js
export function openPickerArgs(pluginId = 'tdi.worktree-from-linear', cwd) {
  const args = ['plugin', 'pane', 'open', '--plugin', pluginId, '--entrypoint', 'picker', '--placement', 'overlay', '--focus'];
  // Pass the invoking repo as HERDR_WFP_CWD (resolveRepo prefers it over the pane's
  // own context JSON). Do NOT set --cwd: the pane command `node bin/picker.js` is
  // relative to the plugin root, so --cwd would break command resolution.
  if (typeof cwd === 'string' && cwd) args.push('--env', `HERDR_WFP_CWD=${cwd}`);
  return args;
}
```

- [ ] **Step 5: `lib/run.js`**

```js
import { loadConfig } from './config.js';
import { resolveRepo } from './repo.js';
import { listIssues } from './linear.js';
import { resolveBase } from './base.js';
import { createOrOpenWorktree } from './worktree.js';
import { select as defaultSelect } from './picker.js';
import { runCmd } from './exec.js';

export async function run({ env = process.env, exec = runCmd, fetchFn = fetch, select = defaultSelect, log = (m) => process.stdout.write(`${m}\n`) } = {}) {
  const config = loadConfig(env.HERDR_PLUGIN_CONFIG_DIR);
  const { repoRoot } = resolveRepo(env, exec);
  const issues = await listIssues(config, fetchFn);
  if (issues.length === 0) {
    log('worktree-from-linear: no active issues');
    return 0;
  }
  const issue = await select(issues, { exec });
  if (!issue) {
    log('worktree-from-linear: cancelled');
    return 0;
  }
  if (!issue.branchName) {
    log(`worktree-from-linear: issue ${issue.identifier} has no branch name`);
    return 0;
  }
  const base = resolveBase(repoRoot, config, exec);
  const herdrBin = env.HERDR_BIN_PATH || 'herdr';
  const res = createOrOpenWorktree(repoRoot, issue.branchName, base, exec, herdrBin);
  log(`worktree-from-linear: ${res.exists ? 'opened' : 'created'} worktree for ${issue.identifier} (${issue.branchName})`);
  return 0;
}
```

- [ ] **Step 6: `bin/open.js`**

```js
#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { openPickerArgs } from '../lib/pane.js';
import { parseContextCwd } from '../lib/repo.js';

const herdr = process.env.HERDR_BIN_PATH || 'herdr';
const cwd = parseContextCwd(process.env.HERDR_PLUGIN_CONTEXT_JSON, process.env.PWD || process.cwd());
const res = spawnSync(herdr, openPickerArgs(process.env.HERDR_PLUGIN_ID, cwd), { stdio: 'inherit' });
process.exit(res.status ?? 1);
```

- [ ] **Step 7: `bin/picker.js`**

```js
#!/usr/bin/env node
import { run } from '../lib/run.js';

run()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
```

- [ ] **Step 8: Run to verify pass** — `node --test test/run.test.js test/pane.test.js` → PASS (5 tests).

- [ ] **Step 9: Full suite** — `npm test` → PASS (all tests).

- [ ] **Step 10: Commit**

```bash
git add lib/run.js lib/pane.js bin/open.js bin/picker.js test/run.test.js test/pane.test.js
git commit -m "feat: orchestrator wiring and plugin entrypoints"
```

---

## Task 9: README

**Files:** Create `README.md`

- [ ] **Step 1: `README.md`**

````markdown
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
  "teamKey": "BIT"
}
```

- `linearApiKey` (required).
- `issueLimit` — max issues listed (default 50).
- `base` — where the new branch starts: `"default"` (repo default branch),
  `"head"` (current checkout), or an explicit branch name (e.g. `"develop"`).
- `teamKey` — optional; restrict to one team (e.g. `BIT`).

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
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with prerequisites"
```

---

## Self-Review

**Spec coverage:**
- Manifest action→pane → Task 1 + Task 8 (`openPickerArgs`, `bin/open.js`).
- Config incl. required `linearApiKey`, `base`, `teamKey`, `issueLimit` → Task 2.
- Repo from `HERDR_WFP_CWD`/context → Task 3.
- Linear GraphQL (active states, team filter, parse, auth, errors) → Task 4.
- Base modes default/head/named → Task 5.
- fzf-or-Node picker + line↔issue mapping → Task 6.
- Worktree create with `--base` / open, exists→open, fetch-only-when-needed → Task 7.
- Orchestration + no-op/cancel/no-branch/exit codes + `--env` not `--cwd` → Task 8.
- Prerequisites (fzf, Linear key) + usage → Task 9.

**Placeholder scan:** none — every code/test step is complete.

**Type consistency:** Issue record `{identifier, title, branchName, url, stateName, assignee, teamKey}` produced by `parseIssues` (Task 4), consumed by `picker.js` (Task 6) and `run.js` (Task 8). `resolveBase → {baseRef, needsFetch, baseBranch}` (Task 5) consumed by `createOrOpenWorktree(repoRoot, branchName, base, exec, herdrBin)` (Task 7) and `run.js`. `runCmd → {status, stdout, stderr}` used by all exec wrappers and fakes. `listIssues(config, fetchFn)` and injected `fetchFn` shape (`{ok, status, text()}`) consistent between Task 4 and Task 8.
