import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTicketConfigPath, ticketConfig, validateTicketConfigPath, writeTicketConfig } from '../lib/ticket.js';

test('ticket config paths must be relative and remain within the worktree', () => {
  assert.equal(resolveTicketConfigPath('/repo/worktree', '.herdr/ticket.json'), '/repo/worktree/.herdr/ticket.json');
  assert.throws(() => validateTicketConfigPath('/tmp/ticket.json'), /repository-relative/);
  assert.throws(() => validateTicketConfigPath('../ticket.json'), /stay within the worktree/);
});

test('writeTicketConfig atomically writes the selected ticket', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wfl-ticket-'));
  const ticket = { identifier: 'BIT-1', title: 'Ship it', description: 'Details' };
  const target = writeTicketConfig(dir, '.herdr/ticket.json', ticket);
  assert.equal(existsSync(`${target}.tmp`), false);
  assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), ticketConfig(ticket));
  rmSync(dir, { recursive: true, force: true });
});
