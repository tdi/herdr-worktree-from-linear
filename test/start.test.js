import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickStartedState, buildStartLookupBody, buildStartMutationBody, startIssue } from '../lib/start.js';

const STATES = [{ id: 's2', name: 'In Review', position: 2 }, { id: 's1', name: 'In Progress', position: 1 }];

function lookup(stateType, states = STATES) {
  return { data: { issues: { nodes: [{ id: 'uuid-1', state: { type: stateType }, team: { states: { nodes: states } } }] } } };
}

function fakeFetch(responses) {
  const bodies = [];
  const fetchFn = async (_url, opts) => {
    bodies.push(JSON.parse(opts.body));
    const json = responses.shift();
    return { ok: true, status: 200, text: async () => JSON.stringify(json) };
  };
  return { fetchFn, bodies };
}

test('pickStartedState takes the lowest position, or the named state', () => {
  assert.equal(pickStartedState(STATES).id, 's1');
  assert.equal(pickStartedState(STATES, 'in review').id, 's2');
  assert.equal(pickStartedState(STATES, 'Nope'), null);
  assert.equal(pickStartedState([]), null);
});

test('request bodies target the issue by team key and number', () => {
  assert.match(buildStartLookupBody('BIT', 7).query, /key: \{ eq: "BIT" \}.*number: \{ eq: 7 \}/);
  assert.deepEqual(buildStartMutationBody('u', 's').variables, { id: 'u', stateId: 's' });
});

test('startIssue moves an unstarted issue to the first started state', async () => {
  const { fetchFn, bodies } = fakeFetch([lookup('unstarted'), { data: { issueUpdate: { success: true } } }]);
  const name = await startIssue({ linearApiKey: 'k' }, 'BIT-7', fetchFn, () => {});
  assert.equal(name, 'In Progress');
  assert.deepEqual(bodies[1].variables, { id: 'uuid-1', stateId: 's1' });
});

test('startIssue leaves started/completed issues alone', async () => {
  for (const type of ['started', 'completed', 'canceled']) {
    const { fetchFn, bodies } = fakeFetch([lookup(type)]);
    assert.equal(await startIssue({ linearApiKey: 'k' }, 'BIT-7', fetchFn, () => {}), null);
    assert.equal(bodies.length, 1);
  }
});

test('startIssue warns instead of throwing when Linear fails', async () => {
  const warnings = [];
  const fetchFn = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  assert.equal(await startIssue({ linearApiKey: 'k' }, 'BIT-7', fetchFn, (m) => warnings.push(m)), null);
  assert.match(warnings[0], /could not start BIT-7.*500/);
});

test('startIssue warns when the named state does not exist', async () => {
  const warnings = [];
  const { fetchFn } = fakeFetch([lookup('unstarted')]);
  assert.equal(await startIssue({ linearApiKey: 'k', startedStateName: 'Doing' }, 'BIT-7', fetchFn, (m) => warnings.push(m)), null);
  assert.match(warnings[0], /no started state named "Doing"/);
});
