import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatIssue } from '../lib/render.js';

test('formatIssue shows identifier, title, meta, url and description', () => {
  const out = formatIssue({ identifier: 'BIT-123', title: 'Do it', stateName: 'In Progress', assignee: 'Sven', url: 'https://l/BIT-123', description: 'Body here.' });
  assert.match(out, /BIT-123 {2}Do it/);
  assert.match(out, /state: In Progress/);
  assert.match(out, /assignee: Sven/);
  assert.match(out, /https:\/\/l\/BIT-123/);
  assert.match(out, /Body here\./);
});

test('formatIssue falls back when the description is empty', () => {
  assert.match(formatIssue({ identifier: 'BIT-1', title: 'T', description: '   ' }), /\(no description\)/);
});

test('formatIssue renders an error placeholder', () => {
  assert.match(formatIssue({ identifier: 'BIT-1', error: 'boom' }), /Could not load BIT-1: boom/);
  assert.match(formatIssue(null), /Could not load issue: unknown error/);
});
