import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIssuesBody, parseIssues, listIssues, parseIdentifier, buildIssueBody, fetchIssue, threadComments } from '../lib/linear.js';

const SAMPLE = JSON.stringify({ data: { issues: { nodes: [
  { identifier: 'BIT-990', title: 'Label API keys', branchName: 'tdi/bit-990-label', url: 'u1', state: { name: 'In Progress' }, assignee: { displayName: 'Darek' }, team: { key: 'BIT' } },
  { identifier: 'BIT-988', title: 'REST API [v2]', branchName: 'tdi/bit-988-rest', url: 'u2', state: { name: 'Todo' }, assignee: null, team: { key: 'BIT' } },
] } } });

test('buildIssuesBody sets first and the active-state filter, team optional', () => {
  const a = buildIssuesBody(50);
  assert.equal(a.variables.first, 50);
  assert.match(a.query, /unstarted/);
  assert.match(a.query, /started/);
  assert.equal(/team:/.test(a.query), false);
  const b = buildIssuesBody(10, 'BIT');
  assert.match(b.query, /team:\s*\{\s*key:\s*\{\s*eq:\s*"BIT"/);
});

test('buildIssuesBody adds the assignee=me filter only when assignedToMe', () => {
  const off = buildIssuesBody(50);
  assert.equal(/assignee:/.test(off.query), false);
  const on = buildIssuesBody(50, undefined, true);
  assert.match(on.query, /assignee:\s*\{\s*isMe:\s*\{\s*eq:\s*true/);
});

test('parseIssues maps nodes and defaults missing fields', () => {
  const issues = parseIssues(SAMPLE);
  assert.equal(issues.length, 2);
  assert.deepEqual(issues[0], { identifier: 'BIT-990', title: 'Label API keys', branchName: 'tdi/bit-990-label', url: 'u1', stateName: 'In Progress', assignee: 'Darek', teamKey: 'BIT' });
  assert.equal(issues[1].assignee, '');
});

test('parseIssues returns [] on empty/malformed', () => {
  assert.deepEqual(parseIssues('{"data":{"issues":{"nodes":[]}}}'), []);
  assert.deepEqual(parseIssues('not json'), []);
  assert.deepEqual(parseIssues('{}'), []);
});

test('listIssues posts with auth header and returns records', async () => {
  const calls = [];
  const fetchFn = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, text: async () => SAMPLE }; };
  const issues = await listIssues({ linearApiKey: 'k', issueLimit: 50 }, fetchFn);
  assert.equal(issues.length, 2);
  assert.equal(calls[0].url, 'https://api.linear.app/graphql');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'k');
});

test('listIssues throws on non-2xx', async () => {
  const fetchFn = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
  await assert.rejects(() => listIssues({ linearApiKey: 'k', issueLimit: 50 }, fetchFn), /Linear API error 401/);
});

test('listIssues throws on GraphQL errors payload', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, text: async () => '{"errors":[{"message":"bad"}]}' });
  await assert.rejects(() => listIssues({ linearApiKey: 'k', issueLimit: 50 }, fetchFn), /GraphQL error/);
});

test('parseIdentifier splits team key and number, null on junk', () => {
  assert.deepEqual(parseIdentifier('BIT-123'), { teamKey: 'BIT', number: 123 });
  assert.deepEqual(parseIdentifier('ENG2-7'), { teamKey: 'ENG2', number: 7 });
  assert.equal(parseIdentifier('BIT-'), null);
  assert.equal(parseIdentifier('-5'), null);
  assert.equal(parseIdentifier('nodash'), null);
  assert.equal(parseIdentifier('BIT-12x'), null);
  assert.equal(parseIdentifier(''), null);
});

test('buildIssueBody filters by team key and number and asks for the pane fields', () => {
  const b = buildIssueBody('BIT', 123);
  assert.match(b.query, /team:\s*\{\s*key:\s*\{\s*eq:\s*"BIT"/);
  assert.match(b.query, /number:\s*\{\s*eq:\s*123/);
  for (const field of ['description', 'priorityLabel', 'estimate', 'labels', 'project', 'cycle', 'comments\\(first: 100\\)', 'parent']) {
    assert.match(b.query, new RegExp(field));
  }
});

test('threadComments nests replies under their root, oldest first', () => {
  const roots = threadComments([
    { id: 'r2', createdAt: '2026-07-22T12:00', body: 'second thread', user: { displayName: 'B' } },
    { id: 'c2', createdAt: '2026-07-22T09:00', body: 'later reply', parent: { id: 'r1' }, user: { displayName: 'C' } },
    { id: 'r1', createdAt: '2026-07-22T08:00', body: 'first thread', user: { displayName: 'A' } },
    { id: 'c1', createdAt: '2026-07-22T08:30', body: 'early reply', parent: { id: 'r1' }, externalUser: { name: 'Ext' } },
  ]);
  assert.deepEqual(roots.map((r) => r.id), ['r1', 'r2']);
  assert.deepEqual(roots[0].replies.map((r) => [r.id, r.author]), [['c1', 'Ext'], ['c2', 'C']]);
  assert.deepEqual(roots[1].replies, []);
});

test('threadComments keeps a reply whose parent is off the page, and flattens deeper nesting', () => {
  const roots = threadComments([
    { id: 'orphan', createdAt: '2026-07-22T08:00', body: 'x', parent: { id: 'gone' } },
    { id: 'root', createdAt: '2026-07-22T09:00', body: 'r' },
    { id: 'reply', createdAt: '2026-07-22T09:30', body: 'a', parent: { id: 'root' } },
    { id: 'deep', createdAt: '2026-07-22T10:00', body: 'b', parent: { id: 'reply' } },
  ]);
  assert.deepEqual(roots.map((r) => r.id), ['orphan', 'root']);
  assert.deepEqual(roots[1].replies.map((r) => r.id), ['reply', 'deep']);
  assert.equal(threadComments(undefined).length, 0);
});

test('fetchIssue posts with auth and maps a single issue', async () => {
  const ISSUE = JSON.stringify({ data: { issues: { nodes: [
    { identifier: 'BIT-123', title: 'Do it', description: 'Body', url: 'u', state: { name: 'Todo' }, assignee: { displayName: 'Sven' }, team: { key: 'BIT' },
      priorityLabel: 'High', estimate: 3, labels: { nodes: [{ name: 'Android' }] }, project: { name: 'Upsell' }, cycle: { number: 226, name: null },
      comments: { nodes: [{ id: 'c1', createdAt: '2026-07-22T08:00', body: 'hi', user: { displayName: 'Aurelien' } }] } },
  ] } } });
  const calls = [];
  const fetchFn = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, text: async () => ISSUE }; };
  const issue = await fetchIssue({ linearApiKey: 'k' }, 'BIT-123', fetchFn);
  assert.deepEqual(issue, {
    identifier: 'BIT-123', title: 'Do it', description: 'Body', url: 'u', stateName: 'Todo', assignee: 'Sven',
    priority: 'High', estimate: 3, project: 'Upsell', cycle: '226', labels: ['Android'],
    comments: [{ id: 'c1', parentId: '', createdAt: '2026-07-22T08:00', author: 'Aurelien', body: 'hi', replies: [] }],
  });
  assert.equal(calls[0].opts.headers.Authorization, 'k');
});

test('fetchIssue tolerates an issue with none of the extras set', async () => {
  const ISSUE = JSON.stringify({ data: { issues: { nodes: [
    { identifier: 'BIT-1', title: 'T', priorityLabel: 'No priority', estimate: null, project: null, cycle: null, labels: { nodes: [] }, comments: { nodes: [] } },
  ] } } });
  const issue = await fetchIssue({ linearApiKey: 'k' }, 'BIT-1', async () => ({ ok: true, status: 200, text: async () => ISSUE }));
  assert.deepEqual([issue.priority, issue.estimate, issue.project, issue.cycle, issue.labels, issue.comments], ['No priority', null, '', '', [], []]);
});

test('fetchIssue throws on a bad identifier or a missing issue', async () => {
  const never = async () => { throw new Error('should not fetch'); };
  await assert.rejects(() => fetchIssue({ linearApiKey: 'k' }, 'bad', never), /bad issue identifier/);
  const empty = async () => ({ ok: true, status: 200, text: async () => '{"data":{"issues":{"nodes":[]}}}' });
  await assert.rejects(() => fetchIssue({ linearApiKey: 'k' }, 'BIT-999', empty), /not found/);
});
