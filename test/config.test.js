import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.js';

function withDir(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'wfl-'));
  if (contents !== null) writeFileSync(join(dir, 'config.json'), contents);
  return dir;
}

function withEnvKey(value, fn) {
  const previous = process.env.LINEAR_API_KEY;
  if (value === null) delete process.env.LINEAR_API_KEY;
  else process.env.LINEAR_API_KEY = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previous;
  }
}

test('loadConfig merges defaults and keeps the api key', () => {
  const dir = withDir('{"linearApiKey":"k"}');
  assert.deepEqual(loadConfig(dir), { issueLimit: 50, base: 'default', fzfLayout: 'down', showIssueDetails: false, linearApiKey: 'k' });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig honors overrides', () => {
  const dir = withDir('{"linearApiKey":"k","issueLimit":10,"base":"head","teamKey":"BIT"}');
  assert.deepEqual(loadConfig(dir), { issueLimit: 10, base: 'head', fzfLayout: 'down', showIssueDetails: false, linearApiKey: 'k', teamKey: 'BIT' });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig throws when linearApiKey is missing everywhere', () => {
  const dir = withDir('{"issueLimit":5}');
  withEnvKey(null, () => {
    assert.throws(() => loadConfig(dir), /set linearApiKey/);
    assert.throws(() => loadConfig(undefined), /LINEAR_API_KEY/);
  });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig falls back to LINEAR_API_KEY when config omits the key', () => {
  const dir = withDir('{"issueLimit":5}');
  withEnvKey('env-key', () => {
    assert.equal(loadConfig(dir).linearApiKey, 'env-key');
    assert.equal(loadConfig(undefined).linearApiKey, 'env-key');
  });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig prefers config.json over LINEAR_API_KEY', () => {
  const dir = withDir('{"linearApiKey":"file-key"}');
  withEnvKey('env-key', () => {
    assert.equal(loadConfig(dir).linearApiKey, 'file-key');
  });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig selects the most specific path key before the default key', () => {
  const dir = withDir(JSON.stringify({
    linearApiKey: 'default-key',
    linearApiKeysByPath: {
      '/projects': 'projects-key',
      '/projects/acme': 'acme-key',
    },
  }));
  assert.equal(loadConfig(dir, '/projects/acme/app').linearApiKey, 'acme-key');
  assert.equal(loadConfig(dir, '/projects/other/app').linearApiKey, 'projects-key');
  assert.equal(loadConfig(dir, '/project').linearApiKey, 'default-key');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig ignores invalid path key entries', () => {
  const dir = withDir(JSON.stringify({ linearApiKey: 'default-key', linearApiKeysByPath: { '/repo': '' } }));
  assert.equal(loadConfig(dir, '/repo').linearApiKey, 'default-key');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig expands a leading ~ in path keys', () => {
  const dir = withDir(JSON.stringify({
    linearApiKey: 'default-key',
    linearApiKeysByPath: { '~/work/acme': 'acme-key' },
  }));
  assert.equal(loadConfig(dir, join(homedir(), 'work/acme')).linearApiKey, 'acme-key');
  assert.equal(loadConfig(dir, join(homedir(), 'work/acme/src')).linearApiKey, 'acme-key');
  assert.equal(loadConfig(dir, join(homedir(), 'work/other')).linearApiKey, 'default-key');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig ignores relative path keys instead of resolving them against cwd', () => {
  const dir = withDir(JSON.stringify({
    linearApiKey: 'default-key',
    linearApiKeysByPath: { 'work/acme': 'acme-key' },
  }));
  assert.equal(loadConfig(dir, join(process.cwd(), 'work/acme')).linearApiKey, 'default-key');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig honors a "/" path key as a catch-all', () => {
  const dir = withDir(JSON.stringify({
    linearApiKey: 'default-key',
    linearApiKeysByPath: { '/': 'root-key', '/projects/acme': 'acme-key' },
  }));
  assert.equal(loadConfig(dir, '/anywhere/else').linearApiKey, 'root-key');
  assert.equal(loadConfig(dir, '/projects/acme/src').linearApiKey, 'acme-key');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig accepts a trailing separator on a path key', () => {
  const dir = withDir(JSON.stringify({
    linearApiKey: 'default-key',
    linearApiKeysByPath: { '/projects/acme/': 'acme-key' },
  }));
  assert.equal(loadConfig(dir, '/projects/acme/src').linearApiKey, 'acme-key');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig ignores an empty LINEAR_API_KEY', () => {
  const dir = withDir('{"issueLimit":5}');
  withEnvKey('', () => {
    assert.throws(() => loadConfig(dir), /set linearApiKey/);
  });
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig throws on malformed JSON', () => {
  const dir = withDir('{bad');
  assert.throws(() => loadConfig(dir), /invalid config\.json/);
  rmSync(dir, { recursive: true, force: true });
});
