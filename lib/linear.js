const ENDPOINT = 'https://api.linear.app/graphql';

export function buildIssuesBody(issueLimit, teamKey) {
  const parts = ['state: { type: { in: ["unstarted", "started"] } }'];
  if (teamKey) parts.push(`team: { key: { eq: ${JSON.stringify(teamKey)} } }`);
  const filter = `{ ${parts.join(', ')} }`;
  const query = `query($first: Int!) { issues(first: $first, orderBy: updatedAt, filter: ${filter}) { nodes { identifier title branchName url state { name } assignee { displayName } team { key } } } }`;
  return { query, variables: { first: issueLimit } };
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

export async function listIssues(config, fetchFn = fetch) {
  const body = buildIssuesBody(config.issueLimit, config.teamKey);
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
  return parseIssues(text);
}
