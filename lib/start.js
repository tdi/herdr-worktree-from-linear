import { parseIdentifier, postGraphQL } from './linear.js';

// States we never move an issue out of: it is already started, or finished.
const SKIP_TYPES = new Set(['started', 'completed', 'canceled']);

export function buildStartLookupBody(teamKey, number) {
  const filter = `{ team: { key: { eq: ${JSON.stringify(teamKey)} } }, number: { eq: ${number} } }`;
  const query = `query { issues(first: 1, filter: ${filter}) { nodes { id state { type } team { states(filter: { type: { eq: "started" } }) { nodes { id name position } } } } } }`;
  return { query };
}

export function buildStartMutationBody(issueId, stateId) {
  const query = 'mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }';
  return { query, variables: { id: issueId, stateId } };
}

// Linear has no fixed "in progress": each team defines its own `started` states. Pick the
// one named `stateName` when given, else the first by position.
export function pickStartedState(states, stateName) {
  const list = (Array.isArray(states) ? states : []).filter((s) => s && s.id);
  if (stateName) {
    const wanted = String(stateName).toLowerCase();
    return list.find((s) => String(s.name).toLowerCase() === wanted) ?? null;
  }
  return [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0] ?? null;
}

// Move the issue to the team's `started` state. Never throws: a ticket status is not
// worth failing a worktree over. Returns the state name it moved to, or null.
export async function startIssue(config, identifier, fetchFn = fetch, warn = (m) => process.stderr.write(`${m}\n`)) {
  try {
    const parsed = parseIdentifier(identifier);
    if (!parsed) throw new Error(`bad issue identifier ${JSON.stringify(identifier)}`);
    const { json } = await postGraphQL(config, buildStartLookupBody(parsed.teamKey, parsed.number), fetchFn);
    const node = json?.data?.issues?.nodes?.[0];
    if (!node) throw new Error(`issue ${identifier} not found`);
    if (SKIP_TYPES.has(node.state?.type)) return null;
    const target = pickStartedState(node.team?.states?.nodes, config.startedStateName);
    if (!target) throw new Error(`no started state${config.startedStateName ? ` named ${JSON.stringify(config.startedStateName)}` : ''} on team ${parsed.teamKey}`);
    const { json: res } = await postGraphQL(config, buildStartMutationBody(node.id, target.id), fetchFn);
    if (res?.data?.issueUpdate?.success !== true) throw new Error('Linear did not confirm the update');
    return target.name;
  } catch (err) {
    warn(`worktree-from-linear: could not start ${identifier}: ${String(err.message).replace(/^worktree-from-linear: /, '')}`);
    return null;
  }
}
