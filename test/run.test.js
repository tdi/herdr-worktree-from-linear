import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../lib/run.js';

const SAMPLE = JSON.stringify({ data: { issues: { nodes: [
  { identifier: 'BIT-1', title: 'Do it', branchName: 'tdi/bit-1-do-it', url: 'u', state: { name: 'Todo' }, assignee: { displayName: 'D' }, team: { key: 'BIT' } },
] } } });

function keyDir(config = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wfl-run-'));
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ linearApiKey: 'k', ...config }));
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
    if (args[0] === 'worktree') {
      return { status: 0, stdout: '{"result":{"type":"worktree_created","workspace":{"workspace_id":"w42"}}}', stderr: '' };
    }
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

test('run opens the issue-details plugin pane in the freshly created worktree', async () => {
  const dir = keyDir({ showIssueDetails: true });
  const calls = [];
  const exec = (cmd, args = []) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args.includes('--show-toplevel')) return { status: 0, stdout: '/repo\n', stderr: '' };
    if (cmd === 'git' && args.includes('symbolic-ref')) return { status: 0, stdout: 'origin/main\n', stderr: '' };
    if (cmd === 'git' && args.includes('list')) return { status: 0, stdout: 'worktree /repo\nbranch refs/heads/main\n', stderr: '' };
    if (cmd === 'git' && args.includes('rev-parse')) return { status: 1, stdout: '', stderr: '' };
    if (cmd === 'git' && args.includes('fetch')) return { status: 0, stdout: '', stderr: '' };
    if (args[0] === 'worktree') return { status: 0, stdout: '{"result":{"root_pane":{"pane_id":"wN:p1"}}}', stderr: '' };
    if (args[0] === 'plugin' && args[1] === 'pane' && args[2] === 'open') return { status: 0, stdout: '{"result":{"plugin_pane":{"pane":{"pane_id":"wN:pD"}}}}', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => SAMPLE });
  const code = await run({ env: { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_WFP_CWD: '/repo', HERDR_BIN_PATH: 'herdr', HERDR_PLUGIN_ID: 'tdi.worktree-from-linear' }, exec, fetchFn, select: async (list) => list[0], log: () => {} });
  assert.equal(code, 0);
  assert.ok(calls.some((c) => c[0] === 'herdr' && c[1] === 'plugin' && c[2] === 'pane' && c[3] === 'open' && c.includes('issue') && c.includes('HERDR_WFP_ISSUE=BIT-1')));
  rmSync(dir, { recursive: true, force: true });
});

test('run does NOT open a details pane unless showIssueDetails is set', async () => {
  const dir = keyDir(); // default: showIssueDetails off
  const calls = [];
  const exec = (cmd, args = []) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args.includes('--show-toplevel')) return { status: 0, stdout: '/repo\n', stderr: '' };
    if (cmd === 'git' && args.includes('symbolic-ref')) return { status: 0, stdout: 'origin/main\n', stderr: '' };
    if (cmd === 'git' && args.includes('list')) return { status: 0, stdout: 'worktree /repo\nbranch refs/heads/main\n', stderr: '' };
    if (cmd === 'git' && args.includes('rev-parse')) return { status: 1, stdout: '', stderr: '' };
    if (cmd === 'git' && args.includes('fetch')) return { status: 0, stdout: '', stderr: '' };
    if (args[0] === 'worktree') return { status: 0, stdout: '{"result":{"root_pane":{"pane_id":"wN:p1"}}}', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => SAMPLE });
  const code = await run({ env: { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_WFP_CWD: '/repo', HERDR_BIN_PATH: 'herdr', HERDR_PLUGIN_ID: 'tdi.worktree-from-linear' }, exec, fetchFn, select: async (list) => list[0], log: () => {} });
  assert.equal(code, 0);
  assert.equal(calls.some((c) => c[1] === 'plugin' && c[2] === 'pane'), false);
  rmSync(dir, { recursive: true, force: true });
});

test('run does NOT open a details pane when the worktree already exists', async () => {
  const dir = keyDir({ showIssueDetails: true });
  const calls = [];
  const exec = (cmd, args = []) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args.includes('--show-toplevel')) return { status: 0, stdout: '/repo\n', stderr: '' };
    if (cmd === 'git' && args.includes('symbolic-ref')) return { status: 0, stdout: 'origin/main\n', stderr: '' };
    // worktree already registered for the issue branch -> open path, not create
    if (cmd === 'git' && args.includes('list')) return { status: 0, stdout: 'worktree /wt\nbranch refs/heads/tdi/bit-1-do-it\n', stderr: '' };
    if (args[0] === 'worktree') return { status: 0, stdout: '{"result":{"root_pane":{"pane_id":"wN:p1"}}}', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => SAMPLE });
  const code = await run({ env: { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_WFP_CWD: '/repo', HERDR_BIN_PATH: 'herdr', HERDR_PLUGIN_ID: 'tdi.worktree-from-linear' }, exec, fetchFn, select: async (list) => list[0], log: () => {} });
  assert.equal(code, 0);
  assert.equal(calls.some((c) => c[1] === 'plugin' || c[1] === 'pane'), false);
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

test('run routes the worktree to the repo mapped to the issue team', async () => {
  const dir = keyDir({ repos: { BIT: '/mapped-repo' } });
  const { exec, calls } = fakeExec();
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => SAMPLE });
  const code = await run({ env: { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_WFP_CWD: '/repo', HERDR_BIN_PATH: 'herdr' }, exec, fetchFn, select: async (list) => list[0], log: () => {} });
  assert.equal(code, 0);
  const create = calls.find((c) => c[0] === 'herdr' && c.includes('create'));
  assert.ok(create.includes('/mapped-repo'));
  assert.ok(!create.includes('/repo'));
  rmSync(dir, { recursive: true, force: true });
});

test('run falls back to the invoking repo for an unmapped team', async () => {
  const dir = keyDir({ repos: { OTHER: '/elsewhere' } });
  const { exec, calls } = fakeExec();
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => SAMPLE });
  const code = await run({ env: { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_WFP_CWD: '/repo', HERDR_BIN_PATH: 'herdr' }, exec, fetchFn, select: async (list) => list[0], log: () => {} });
  assert.equal(code, 0);
  assert.ok(calls.find((c) => c[0] === 'herdr' && c.includes('create')).includes('/repo'));
  rmSync(dir, { recursive: true, force: true });
});

test('run labels the new workspace with the issue identifier', async () => {
  const dir = keyDir();
  const { exec, calls } = fakeExec();
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => SAMPLE });
  await run({ env: { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_WFP_CWD: '/repo', HERDR_BIN_PATH: 'herdr' }, exec, fetchFn, select: async (l) => l[0], log: () => {} });
  const report = calls.find((c) => c.includes('report-metadata'));
  assert.ok(report, 'reports workspace metadata');
  assert.deepEqual(report, ['herdr', 'workspace', 'report-metadata', 'w42',
    '--source', 'plugin:tdi.worktree-from-linear', '--token', 'linear=BIT-1']);
  rmSync(dir, { recursive: true, force: true });
});

test('run still succeeds when the sidebar label cannot be reported', async () => {
  const dir = keyDir();
  const { exec: inner } = fakeExec();
  const exec = (cmd, args = []) => (args[0] === 'workspace'
    ? { status: 2, stdout: '', stderr: 'unrecognized subcommand\n' }
    : inner(cmd, args));
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => SAMPLE });
  const warnings = [];
  const logs = [];
  const code = await run({ env: { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_WFP_CWD: '/repo' }, exec, fetchFn, select: async (l) => l[0], log: (m) => logs.push(m), warn: (m) => warnings.push(m) });
  assert.equal(code, 0);
  assert.match(warnings[0], /sidebar issue label failed/);
  assert.ok(logs.some((m) => /created worktree for BIT-1/.test(m)), 'still reports the worktree it made');
  rmSync(dir, { recursive: true, force: true });
});

test('run moves the issue to started only when startOnCreate is set', async () => {
  for (const startOnCreate of [false, true]) {
    const dir = keyDir({ startOnCreate });
    const { exec } = fakeExec();
    const bodies = [];
    const fetchFn = async (_u, opts) => {
      const body = JSON.parse(opts.body);
      bodies.push(body.query);
      const json = /issueUpdate/.test(body.query) ? { data: { issueUpdate: { success: true } } }
        : /states\(/.test(body.query) ? { data: { issues: { nodes: [{ id: 'u', state: { type: 'unstarted' }, team: { states: { nodes: [{ id: 's', name: 'In Progress', position: 1 }] } } }] } } }
        : JSON.parse(SAMPLE);
      return { ok: true, status: 200, text: async () => JSON.stringify(json) };
    };
    await run({ env: { HERDR_PLUGIN_CONFIG_DIR: dir, HERDR_WFP_CWD: '/repo', HERDR_BIN_PATH: 'herdr' }, exec, fetchFn, select: async (list) => list[0], log: () => {} });
    assert.equal(bodies.some((q) => /issueUpdate/.test(q)), startOnCreate);
  }
});
