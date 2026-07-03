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
