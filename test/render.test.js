import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatIssue, formatIssueMarkdown } from '../lib/render.js';

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

const RICH = {
  identifier: 'BIT-123', title: 'Do it', stateName: 'In Progress', assignee: 'Sven', url: 'https://l/BIT-123',
  priority: 'High', estimate: 3, project: 'Upsell', cycle: '226', labels: ['Android', 'Feature'],
  description: '## Heading\n\n- [ ] todo',
  comments: [{
    author: 'Aurelien', createdAt: '2026-07-22T08:11:00.000Z', body: 'Root comment',
    replies: [{ author: 'Jeremy', createdAt: '2026-07-22T09:02:00.000Z', body: 'A reply\n\nsecond line' }],
  }],
};

test('formatIssueMarkdown renders a markdown header, meta and facts', () => {
  const out = formatIssueMarkdown(RICH);
  assert.match(out, /^# BIT-123 · Do it$/m);
  assert.match(out, /^In Progress {2}· {2}Sven {2}· {2}Priority: High {2}· {2}Estimate: 3$/m);
  assert.match(out, /\*\*Project\*\* Upsell {2}· {2}\*\*Cycle\*\* 226 {2}· {2}\*\*Labels\*\* `Android`, `Feature`/);
  assert.match(out, /^https:\/\/l\/BIT-123$/m);
  assert.match(out, /- \[ \] todo/);
});

test('formatIssueMarkdown quotes replies under their thread root and counts both', () => {
  const out = formatIssueMarkdown(RICH);
  assert.match(out, /^## Comments \(2\)$/m);
  assert.match(out, /^### Aurelien · 2026-07-22 08:11$/m);
  assert.match(out, /^> \*\*Jeremy\*\* · 2026-07-22 09:02\n>\n> A reply\n>\n> second line$/m);
});

test('formatIssueMarkdown collapses Linear self-links but keeps real link text', () => {
  const out = formatIssueMarkdown({
    identifier: 'BIT-1', title: 'T', labels: [],
    description: 'see [https://ex.com/a](<https://ex.com/a>) and [https://ex.com/b](https://ex.com/b) and [Docs](<https://ex.com/d>)',
    comments: [{ author: 'A', createdAt: '2026-07-22T08:00', body: '[https://ex.com/c](<https://ex.com/c>)', replies: [{ author: 'B', createdAt: '2026-07-22T09:00', body: '[https://ex.com/e](<https://ex.com/e>)' }] }],
  });
  assert.match(out, /see https:\/\/ex\.com\/a and https:\/\/ex\.com\/b and \[Docs\]\(<https:\/\/ex\.com\/d>\)/);
  assert.match(out, /^https:\/\/ex\.com\/c$/m);
  assert.match(out, /^> https:\/\/ex\.com\/e$/m);
});

test('formatIssueMarkdown omits empty meta, an unset priority and the comments section', () => {
  const out = formatIssueMarkdown({ identifier: 'BIT-1', title: 'T', priority: 'No priority', estimate: null, labels: [], comments: [] });
  assert.doesNotMatch(out, /Priority|Estimate|Comments|\*\*Labels\*\*|---\n\n---/);
  assert.match(out, /\*\(no description\)\*/);
});

test('formatIssueMarkdown falls back to the plain panel on an error', () => {
  assert.match(formatIssueMarkdown({ identifier: 'BIT-1', error: 'boom' }), /^Could not load BIT-1: boom/);
  assert.match(formatIssueMarkdown(null), /Could not load issue: unknown error/);
});

test('formatIssue renders an error placeholder', () => {
  assert.match(formatIssue({ identifier: 'BIT-1', error: 'boom' }), /Could not load BIT-1: boom/);
  assert.match(formatIssue(null), /Could not load issue: unknown error/);
});
