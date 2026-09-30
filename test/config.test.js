import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, keyEnvFor } from '../lib/config.js';

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

const repo = (path) => () => path;

test('linearApiKeyEnv reads the variable named for the most specific directory', () => {
  const dir = withDir(JSON.stringify({
    linearApiKey: 'file-key',
    linearApiKeyEnv: { '/work': 'KEY_WORK', '/work/acme': 'KEY_ACME' },
  }));
  const env = { KEY_WORK: 'work-key', KEY_ACME: 'acme-key', LINEAR_API_KEY: 'default-key' };
  const acme = loadConfig(dir, { invokingRepo: repo('/work/acme/app'), env });
  assert.equal(acme.linearApiKey, 'acme-key');
  assert.equal(acme.linearApiKeyEnvName, 'KEY_ACME');
  assert.equal(loadConfig(dir, { invokingRepo: repo('/work/beta'), env }).linearApiKey, 'work-key');
  assert.equal(loadConfig(dir, { invokingRepo: repo('/workshop'), env }).linearApiKey, 'file-key');
  rmSync(dir, { recursive: true, force: true });
});

test('linearApiKeyEnv falls back to the default key outside every directory or a repo', () => {
  const dir = withDir(JSON.stringify({ linearApiKeyEnv: { '/work/acme': 'KEY_ACME' } }));
  const env = { KEY_ACME: 'acme-key', LINEAR_API_KEY: 'default-key' };
  const other = loadConfig(dir, { invokingRepo: repo('/elsewhere'), env });
  assert.equal(other.linearApiKey, 'default-key');
  assert.equal(other.linearApiKeyEnvName, undefined);
  assert.equal(loadConfig(dir, { invokingRepo: repo(null), env }).linearApiKey, 'default-key');
  rmSync(dir, { recursive: true, force: true });
});

test('linearApiKeyEnv never resolves the repo when it is not configured', () => {
  const dir = withDir('{"linearApiKey":"k"}');
  const invokingRepo = () => { throw new Error('should not resolve the repo'); };
  assert.equal(loadConfig(dir, { invokingRepo }).linearApiKey, 'k');
  rmSync(dir, { recursive: true, force: true });
});

test('linearApiKeyEnv names the selected variable when it is unset', () => {
  const dir = withDir(JSON.stringify({ linearApiKey: 'file-key', linearApiKeyEnv: { '/work/acme': 'KEY_ACME' } }));
  assert.throws(
    () => loadConfig(dir, { invokingRepo: repo('/work/acme'), env: { KEY_ACME: '' } }),
    /set the KEY_ACME environment variable/,
  );
  rmSync(dir, { recursive: true, force: true });
});

test('keyEnv forces the variable, as the issue pane does', () => {
  const dir = withDir(JSON.stringify({ linearApiKeyEnv: { '/work/acme': 'KEY_ACME' } }));
  const invokingRepo = () => { throw new Error('should not resolve the repo'); };
  const env = { KEY_ACME: 'acme-key', LINEAR_API_KEY: 'default-key' };
  assert.equal(loadConfig(dir, { keyEnv: 'KEY_ACME', invokingRepo, env }).linearApiKey, 'acme-key');
  rmSync(dir, { recursive: true, force: true });
});

test('keyEnvFor expands ~ and accepts a trailing separator', () => {
  const config = { linearApiKeyEnv: { '~/work/acme/': 'KEY_ACME' } };
  assert.equal(keyEnvFor(config, join(homedir(), 'work/acme')), 'KEY_ACME');
  assert.equal(keyEnvFor(config, join(homedir(), 'work/acme/app')), 'KEY_ACME');
  assert.equal(keyEnvFor(config, join(homedir(), 'work/other')), null);
});

test('keyEnvFor honors "/" as a catch-all', () => {
  const config = { linearApiKeyEnv: { '/': 'KEY_ALL', '/work/acme': 'KEY_ACME' } };
  assert.equal(keyEnvFor(config, '/anywhere'), 'KEY_ALL');
  assert.equal(keyEnvFor(config, '/work/acme'), 'KEY_ACME');
});

test('keyEnvFor rejects key values, relative paths and non-map shapes', () => {
  assert.throws(() => keyEnvFor({ linearApiKeyEnv: { '/work': 'lin_api_abc123' } }, '/work'), /variable name, not a key/);
  assert.throws(() => keyEnvFor({ linearApiKeyEnv: { '/work': 'not a name' } }, '/work'), /variable name, not a key/);
  assert.throws(() => keyEnvFor({ linearApiKeyEnv: { 'work/acme': 'KEY_ACME' } }, '/work'), /must be absolute/);
  assert.throws(() => keyEnvFor({ linearApiKeyEnv: ['KEY_ACME'] }, '/work'), /must map directories/);
});
