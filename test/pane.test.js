import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPickerArgs, normalizePlacement, swapDirectionFor, parsePaneId, readPlacement, readPopupSize, parseRootPaneId, issuePaneOpenArgs, openIssuePane } from '../lib/pane.js';

test('openPickerArgs defaults to a right split', () => {
  assert.deepEqual(openPickerArgs('tdi.worktree-from-linear'), [
    'plugin', 'pane', 'open', '--plugin', 'tdi.worktree-from-linear', '--entrypoint', 'picker', '--placement', 'split', '--direction', 'right', '--focus',
  ]);
});

test('openPickerArgs maps each placement to herdr flags', () => {
  const tail = (p) => openPickerArgs('id', undefined, p).slice(7); // drop the fixed prefix
  assert.deepEqual(tail('overlay'), ['--placement', 'overlay', '--focus']);
  assert.deepEqual(tail('right'), ['--placement', 'split', '--direction', 'right', '--focus']);
  assert.deepEqual(tail('down'), ['--placement', 'split', '--direction', 'down', '--focus']);
  // left/top open as a right/down split and swap afterwards
  assert.deepEqual(tail('left'), ['--placement', 'split', '--direction', 'right', '--focus']);
  assert.deepEqual(tail('top'), ['--placement', 'split', '--direction', 'down', '--focus']);
  // unknown placement falls back to the default (right)
  assert.deepEqual(tail('sideways'), ['--placement', 'split', '--direction', 'right', '--focus']);
  assert.deepEqual(tail('popup'), ['--placement', 'popup', '--width', '80%', '--height', '70%', '--focus']);
});

test('openPickerArgs adds --width/--height only for popup', () => {
  assert.deepEqual(openPickerArgs('id', undefined, 'popup', { width: '90%', height: '60%' }).slice(7),
    ['--placement', 'popup', '--width', '90%', '--height', '60%', '--focus']);
  // a non-popup placement ignores any size passed in
  assert.equal(openPickerArgs('id', undefined, 'overlay', { width: '90%', height: '60%' }).includes('--width'), false);
});

test('normalizePlacement keeps known values and defaults the rest to right', () => {
  for (const p of ['overlay', 'popup', 'right', 'left', 'down', 'top']) assert.equal(normalizePlacement(p), p);
  assert.equal(normalizePlacement('bogus'), 'right');
  assert.equal(normalizePlacement(undefined), 'right');
});

test('swapDirectionFor only returns a direction for left/top', () => {
  assert.equal(swapDirectionFor('left'), 'left');
  assert.equal(swapDirectionFor('top'), 'up');
  assert.equal(swapDirectionFor('right'), null);
  assert.equal(swapDirectionFor('down'), null);
  assert.equal(swapDirectionFor('overlay'), null);
  assert.equal(swapDirectionFor('popup'), null);
});

test('parsePaneId reads the opened pane id, null on junk', () => {
  assert.equal(parsePaneId('{"result":{"plugin_pane":{"pane":{"pane_id":"wR:pF"}}}}'), 'wR:pF');
  assert.equal(parsePaneId('not json'), null);
  assert.equal(parsePaneId('{"result":{}}'), null);
});

test('openPickerArgs passes the repo via HERDR_WFP_CWD env, never --cwd', () => {
  assert.deepEqual(openPickerArgs('tdi.worktree-from-linear', '/work/repo').slice(-2), ['--env', 'HERDR_WFP_CWD=/work/repo']);
  assert.equal(openPickerArgs('tdi.worktree-from-linear', '/work/repo').includes('--cwd'), false);
  assert.equal(openPickerArgs('tdi.worktree-from-linear').includes('--env'), false);
  assert.equal(openPickerArgs('tdi.worktree-from-linear', '').includes('--env'), false);
});

test('parseRootPaneId reads the worktree root pane id, null on junk', () => {
  assert.equal(parseRootPaneId('{"result":{"root_pane":{"pane_id":"wN:p1"}}}'), 'wN:p1');
  assert.equal(parseRootPaneId('not json'), null);
  assert.equal(parseRootPaneId('{"result":{}}'), null);
});

test('issuePaneOpenArgs targets the root pane and passes the identifier via env', () => {
  assert.deepEqual(
    issuePaneOpenArgs('tdi.worktree-from-linear', 'wN:p1', 'BIT-123'),
    ['plugin', 'pane', 'open', '--plugin', 'tdi.worktree-from-linear', '--entrypoint', 'issue',
      '--placement', 'split', '--target-pane', 'wN:p1', '--direction', 'down',
      '--no-focus', '--env', 'HERDR_WFP_ISSUE=BIT-123'],
  );
});

test('openIssuePane opens the issue plugin pane below root, then swaps it up', () => {
  const calls = [];
  const exec = (cmd, args = []) => {
    calls.push([cmd, ...args]);
    if (args[0] === 'plugin' && args[1] === 'pane' && args[2] === 'open') return { status: 0, stdout: '{"result":{"plugin_pane":{"pane":{"pane_id":"wN:pD"}}}}', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  const pane = openIssuePane('{"result":{"root_pane":{"pane_id":"wN:p1"}}}', 'BIT-123', 'tdi.worktree-from-linear', exec, 'herdr');
  assert.equal(pane, 'wN:pD');
  assert.deepEqual(calls[0], ['herdr', ...issuePaneOpenArgs('tdi.worktree-from-linear', 'wN:p1', 'BIT-123')]);
  assert.deepEqual(calls[1], ['herdr', 'pane', 'swap', '--direction', 'up', '--pane', 'wN:pD']);
});

test('openIssuePane no-ops without a root pane, identifier, plugin id, or on open failure', () => {
  const boom = () => { throw new Error('should not exec'); };
  assert.equal(openIssuePane('{"result":{}}', 'BIT-1', 'p', boom), null); // no root pane -> no exec
  assert.equal(openIssuePane('not json', 'BIT-1', 'p', boom), null);
  assert.equal(openIssuePane('{"result":{"root_pane":{"pane_id":"r"}}}', '', 'p', boom), null); // no identifier
  assert.equal(openIssuePane('{"result":{"root_pane":{"pane_id":"r"}}}', 'BIT-1', '', boom), null); // no plugin id
  const failOpen = () => ({ status: 1, stdout: '', stderr: 'nope' });
  assert.equal(openIssuePane('{"result":{"root_pane":{"pane_id":"r"}}}', 'BIT-1', 'p', failOpen), null);
});

test('readPlacement reads config.json, tolerant of missing/invalid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wfl-pane-'));
  writeFileSync(join(dir, 'config.json'), '{"placement":"top"}');
  assert.equal(readPlacement(dir), 'top');
  writeFileSync(join(dir, 'config.json'), '{"placement":"nonsense"}');
  assert.equal(readPlacement(dir), 'right'); // invalid value -> default
  writeFileSync(join(dir, 'config.json'), '{bad');
  assert.equal(readPlacement(dir), 'right'); // unparseable -> default
  rmSync(dir, { recursive: true, force: true });
  assert.equal(readPlacement(dir), 'right'); // missing file -> default
  assert.equal(readPlacement(undefined), 'right'); // no dir -> default
});

test('readPopupSize reads/validates config, falling back to defaults', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wfl-popup-'));
  writeFileSync(join(dir, 'config.json'), '{"popupWidth":"90%","popupHeight":60}');
  assert.deepEqual(readPopupSize(dir), { width: '90%', height: '60' }); // "%" string and integer cells both accepted
  writeFileSync(join(dir, 'config.json'), '{"popupWidth":"nope","popupHeight":"200%"}');
  assert.deepEqual(readPopupSize(dir), { width: '80%', height: '70%' }); // invalid values -> defaults
  writeFileSync(join(dir, 'config.json'), '{bad');
  assert.deepEqual(readPopupSize(dir), { width: '80%', height: '70%' }); // unparseable -> defaults
  rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(readPopupSize(dir), { width: '80%', height: '70%' }); // missing file -> defaults
  assert.deepEqual(readPopupSize(undefined), { width: '80%', height: '70%' }); // no dir -> defaults
});
