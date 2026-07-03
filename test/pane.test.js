import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPickerArgs } from '../lib/pane.js';

test('openPickerArgs targets the picker overlay entrypoint', () => {
  assert.deepEqual(openPickerArgs('tdi.worktree-from-linear'), [
    'plugin', 'pane', 'open', '--plugin', 'tdi.worktree-from-linear', '--entrypoint', 'picker', '--placement', 'split', '--direction', 'right', '--focus',
  ]);
});

test('openPickerArgs passes the repo via HERDR_WFP_CWD env, never --cwd', () => {
  assert.deepEqual(openPickerArgs('tdi.worktree-from-linear', '/work/repo').slice(-2), ['--env', 'HERDR_WFP_CWD=/work/repo']);
  assert.equal(openPickerArgs('tdi.worktree-from-linear', '/work/repo').includes('--cwd'), false);
  assert.equal(openPickerArgs('tdi.worktree-from-linear').includes('--env'), false);
  assert.equal(openPickerArgs('tdi.worktree-from-linear', '').includes('--env'), false);
});
