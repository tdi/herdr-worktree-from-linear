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
