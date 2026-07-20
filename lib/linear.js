const ENDPOINT = 'https://api.linear.app/graphql';

export function buildIssuesBody(issueLimit, teamKey, assignedToMe) {
  const parts = ['state: { type: { in: ["unstarted", "started"] } }'];
  if (teamKey) parts.push(`team: { key: { eq: ${JSON.stringify(teamKey)} } }`);
  if (assignedToMe) parts.push('assignee: { isMe: { eq: true } }');
  const filter = `{ ${parts.join(', ')} }`;
  const query = `query($first: Int!) { issues(first: $first, orderBy: updatedAt, filter: ${filter}) { nodes { identifier title branchName url state { name } assignee { displayName } team { key } } } }`;
  return { query, variables: { first: issueLimit } };
}

// Split a Linear identifier ("BIT-123") into its team key and issue number.
export function parseIdentifier(identifier) {
  const s = String(identifier ?? '').trim();
  const i = s.lastIndexOf('-');
  if (i <= 0) return null;
  const number = s.slice(i + 1);
  if (!/^\d+$/.test(number)) return null;
  return { teamKey: s.slice(0, i), number: Number(number) };
}

export function buildIssueBody(teamKey, number) {
  const filter = `{ team: { key: { eq: ${JSON.stringify(teamKey)} } }, number: { eq: ${number} } }`;
  const query = `query { issues(first: 1, filter: ${filter}) { nodes { identifier title description url state { name } assignee { displayName } team { key } } } }`;
  return { query };
}

export function parseIssues(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const nodes = data && data.data && data.data.issues && data.data.issues.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map((n) => ({
    identifier: n.identifier ?? '',
    title: n.title ?? '',
    branchName: n.branchName ?? '',
    url: n.url ?? '',
    stateName: n.state?.name ?? '',
    assignee: n.assignee?.displayName ?? '',
    teamKey: n.team?.key ?? '',
  }));
}

// POST a GraphQL body to Linear; return { json, text } or throw with a clear message.
async function postGraphQL(config, body, fetchFn) {
  const res = await fetchFn(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: config.linearApiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`worktree-from-linear: Linear API error ${res.status}: ${String(text).slice(0, 300)}`);
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('worktree-from-linear: Linear returned non-JSON');
  }
  if (json.errors) {
    throw new Error(`worktree-from-linear: Linear GraphQL error: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  return { json, text };
}

export async function listIssues(config, fetchFn = fetch) {
  const { text } = await postGraphQL(config, buildIssuesBody(config.issueLimit, config.teamKey, config.assignedToMe), fetchFn);
  return parseIssues(text);
}

export async function fetchIssue(config, identifier, fetchFn = fetch) {
  const parsed = parseIdentifier(identifier);
  if (!parsed) throw new Error(`worktree-from-linear: bad issue identifier ${JSON.stringify(identifier)}`);
  const { json } = await postGraphQL(config, buildIssueBody(parsed.teamKey, parsed.number), fetchFn);
  const node = json?.data?.issues?.nodes?.[0];
  if (!node) throw new Error(`worktree-from-linear: issue ${identifier} not found`);
  return {
    identifier: node.identifier ?? identifier,
    title: node.title ?? '',
    description: node.description ?? '',
    url: node.url ?? '',
    stateName: node.state?.name ?? '',
    assignee: node.assignee?.displayName ?? '',
  };
}
