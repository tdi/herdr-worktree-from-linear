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

test('loadConfig uses the first matching repo-path environment rule', () => {
  const dir = withDir(JSON.stringify({
    linearApiKeyEnvByPath: [
      { contains: '/repos/', env: 'LINEAR_API_KEY_FIRST' },
      { contains: 'hsys', env: 'LINEAR_API_KEY_SECOND' },
    ],
    linearApiKeyEnvDefault: 'LINEAR_API_KEY_DEFAULT',
  }));
  const env = {
    LINEAR_API_KEY_FIRST: 'test-key-1',
    LINEAR_API_KEY_SECOND: 'test-key-2',
    LINEAR_API_KEY_DEFAULT: 'test-key-default',
  };
  assert.equal(loadConfig(dir, '/repos/hsys', env).linearApiKey, 'test-key-1');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig matches repo-path rules case-insensitively', () => {
  const dir = withDir(JSON.stringify({
    linearApiKeyEnvByPath: [{ contains: 'hsys', env: 'LINEAR_API_KEY_MATCH' }],
    linearApiKeyEnvDefault: 'LINEAR_API_KEY_DEFAULT',
  }));
  const env = {
    LINEAR_API_KEY_MATCH: 'test-key-1',
    LINEAR_API_KEY_DEFAULT: 'test-key-default',
  };
  assert.equal(loadConfig(dir, '/repos/HSYS/service', env).linearApiKey, 'test-key-1');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig uses the configured default environment variable when no path matches', () => {
  const dir = withDir(JSON.stringify({
    linearApiKeyEnvByPath: [{ contains: 'hsys', env: 'LINEAR_API_KEY_MATCH' }],
    linearApiKeyEnvDefault: 'LINEAR_API_KEY_DEFAULT',
  }));
  const env = {
    LINEAR_API_KEY_MATCH: 'test-key-1',
    LINEAR_API_KEY_DEFAULT: 'test-key-default',
  };
  assert.equal(loadConfig(dir, '/repos/another-project', env).linearApiKey, 'test-key-default');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig resolves the current repo when the caller does not supply a repo root', () => {
  const dir = withDir(JSON.stringify({
    linearApiKeyEnvByPath: [
      { contains: 'HERDR-WORKTREE-FROM-LINEAR', env: 'LINEAR_API_KEY_MATCH' },
    ],
    linearApiKeyEnvDefault: 'LINEAR_API_KEY_DEFAULT',
  }));
  const env = {
    LINEAR_API_KEY_MATCH: 'test-key-1',
    LINEAR_API_KEY_DEFAULT: 'test-key-default',
  };
  assert.equal(loadConfig(dir, undefined, env).linearApiKey, 'test-key-1');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig uses the configured default when the current directory is not a repo', () => {
  const configDir = withDir(JSON.stringify({
    linearApiKeyEnvByPath: [{ contains: '', env: 'LINEAR_API_KEY_MATCH' }],
    linearApiKeyEnvDefault: 'LINEAR_API_KEY_DEFAULT',
  }));
  const cwd = mkdtempSync(join(tmpdir(), 'wfl-not-repo-'));
  const previousCwd = process.cwd();
  try {
    process.chdir(cwd);
    assert.equal(loadConfig(configDir, undefined, {
      LINEAR_API_KEY_MATCH: 'test-key-1',
      LINEAR_API_KEY_DEFAULT: 'test-key-default',
    }).linearApiKey, 'test-key-default');
  } finally {
    process.chdir(previousCwd);
    rmSync(cwd, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('loadConfig prefers an explicit key over repo-path environment routing', () => {
  const dir = withDir(JSON.stringify({
    linearApiKey: 'test-key-explicit',
    linearApiKeyEnvByPath: [{ contains: 'hsys', env: 'LINEAR_API_KEY_MATCH' }],
    linearApiKeyEnvDefault: 'LINEAR_API_KEY_DEFAULT',
  }));
  const env = {
    LINEAR_API_KEY_MATCH: 'test-key-1',
    LINEAR_API_KEY_DEFAULT: 'test-key-default',
  };
  assert.equal(loadConfig(dir, '/repos/hsys', env).linearApiKey, 'test-key-explicit');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig reports the selected environment variable when it is unset', () => {
  const dir = withDir(JSON.stringify({
    linearApiKeyEnvByPath: [{ contains: 'hsys', env: 'LINEAR_API_KEY_MATCH' }],
    linearApiKeyEnvDefault: 'LINEAR_API_KEY_DEFAULT',
  }));
  assert.throws(
    () => loadConfig(dir, '/repos/hsys', { LINEAR_API_KEY_MATCH: '' }),
    /set linearApiKey in config\.json or the LINEAR_API_KEY_MATCH environment variable \(Linear personal API key\)/
  );
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
