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
