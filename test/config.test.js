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
  const config = loadConfig(dir);
  assert.equal(config.linearApiKey, 'k');
  assert.equal(config.ticketConfigPath, '.herdr/ticket.json');
  assert.equal(config.linearOrgs.length, 1);
  assert.equal(config.linearOrgs[0].id, 'default');
  assert.equal(config.linearOrgs[0].linearApiKey, 'k');
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig honors overrides', () => {
  const dir = withDir('{"linearApiKey":"k","issueLimit":10,"base":"head","teamKey":"BIT"}');
  const config = loadConfig(dir);
  assert.equal(config.linearOrgs[0].issueLimit, 10);
  assert.equal(config.linearOrgs[0].base, 'head');
  assert.equal(config.linearOrgs[0].teamKey, 'BIT');
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

test('loadConfig rejects ticket config paths outside the worktree', () => {
  const absolute = withDir('{"linearApiKey":"k","ticketConfigPath":"/tmp/ticket.json"}');
  const parent = withDir('{"linearApiKey":"k","ticketConfigPath":"../ticket.json"}');
  assert.throws(() => loadConfig(absolute), /repository-relative/);
  assert.throws(() => loadConfig(parent), /stay within the worktree/);
  rmSync(absolute, { recursive: true, force: true });
  rmSync(parent, { recursive: true, force: true });
});

test('loadConfig applies shared defaults and validates organization profiles', () => {
  const dir = withDir('{"issueLimit":10,"linearOrgs":[{"id":"internal","linearApiKey":"a","teamKey":"BIT"},{"id":"client","linearApiKey":"b","base":"develop"}]}');
  const config = loadConfig(dir);
  assert.deepEqual(config.linearOrgs.map((org) => ({ id: org.id, key: org.linearApiKey, issueLimit: org.issueLimit, base: org.base, teamKey: org.teamKey })), [
    { id: 'internal', key: 'a', issueLimit: 10, base: 'default', teamKey: 'BIT' },
    { id: 'client', key: 'b', issueLimit: 10, base: 'develop', teamKey: undefined },
  ]);
  rmSync(dir, { recursive: true, force: true });
});

test('loadConfig rejects invalid organization ids and missing profile keys', () => {
  const whitespace = withDir('{"linearOrgs":[{"id":"my org","linearApiKey":"k"}]}');
  const missingKey = withDir('{"linearApiKey":"legacy","linearOrgs":[{"id":"org"}]}');
  assert.throws(() => loadConfig(whitespace), /whitespace-free/);
  assert.throws(() => loadConfig(missingKey), /set linearApiKey/);
  rmSync(whitespace, { recursive: true, force: true });
  rmSync(missingKey, { recursive: true, force: true });
});
