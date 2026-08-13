import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseContextCwd, parseMainRepoRoot, resolveRepo } from '../lib/repo.js';

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
  assert.deepEqual(resolveRepo(env, exec), { repoRoot: '/explicit/repo', mainRepoRoot: '/explicit/repo' });
  assert.ok(seen[0].includes('-C /explicit/repo'));
});

test('resolveRepo throws when not a git repo', () => {
  const exec = () => ({ status: 1, stdout: '', stderr: 'fatal' });
  assert.throws(() => resolveRepo({}, exec), /not inside a git repository/);
});

test('parseMainRepoRoot maps a common git dir back to the source repo, null on odd layouts', () => {
  assert.equal(parseMainRepoRoot('/projects/acme/.git\n', '/wt/BIT-1'), '/projects/acme');
  assert.equal(parseMainRepoRoot('.git\n', '/projects/acme'), '/projects/acme'); // relative -> resolved against the checkout
  assert.equal(parseMainRepoRoot('/projects/acme.git\n', '/wt'), null); // bare repo
  assert.equal(parseMainRepoRoot('', '/wt'), null);
  assert.equal(parseMainRepoRoot(undefined, '/wt'), null);
});

test('resolveRepo reports the source repo for a linked worktree', () => {
  const env = { HERDR_WFP_CWD: '/wt/BIT-1' };
  const exec = (cmd, args) => {
    if (args.includes('--show-toplevel')) return { status: 0, stdout: '/wt/BIT-1\n', stderr: '' };
    if (args.includes('--git-common-dir')) return { status: 0, stdout: '/projects/acme/.git\n', stderr: '' };
    return { status: 1, stdout: '', stderr: '' };
  };
  assert.deepEqual(resolveRepo(env, exec), { repoRoot: '/wt/BIT-1', mainRepoRoot: '/projects/acme' });
});

test('resolveRepo falls back to the checkout when the common dir is unavailable', () => {
  const env = { HERDR_WFP_CWD: '/wt/BIT-1' };
  const exec = (cmd, args) => {
    if (args.includes('--show-toplevel')) return { status: 0, stdout: '/wt/BIT-1\n', stderr: '' };
    return { status: 1, stdout: '', stderr: 'unknown option --path-format' }; // git < 2.31
  };
  assert.deepEqual(resolveRepo(env, exec), { repoRoot: '/wt/BIT-1', mainRepoRoot: '/wt/BIT-1' });
});
