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
