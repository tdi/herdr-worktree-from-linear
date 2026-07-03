import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLine, formatLines, lineToIssue } from '../lib/picker.js';

const ISSUES = [
  { identifier: 'BIT-990', title: 'Label API keys', branchName: 'tdi/bit-990-label', stateName: 'In Progress', assignee: 'Darek' },
  { identifier: 'BIT-988', title: 'REST API [v2]', branchName: 'tdi/bit-988-rest', stateName: 'Todo', assignee: '' },
];

test('formatLine leads with the identifier and shows state', () => {
  assert.match(formatLine(ISSUES[0]), /^BIT-990\s+Label API keys\s+\[In Progress\] @Darek$/);
  assert.match(formatLine(ISSUES[1]), /^BIT-988\s+REST API \[v2\]\s+\[Todo\] @$/);
});

test('lineToIssue maps a chosen line back by leading identifier', () => {
  const lines = formatLines(ISSUES);
  assert.equal(lineToIssue(lines[0], ISSUES).identifier, 'BIT-990');
  assert.equal(lineToIssue(lines[1], ISSUES).identifier, 'BIT-988');   // title contains '[v2]' but leading token wins
  assert.equal(lineToIssue('', ISSUES), null);
  assert.equal(lineToIssue('NOPE-1 gone', ISSUES), null);
});
