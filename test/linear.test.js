import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIssuesBody, parseIssues, listIssues } from '../lib/linear.js';

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
