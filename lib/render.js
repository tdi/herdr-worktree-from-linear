// Render a Linear issue (or an { identifier, error } placeholder) as a plain-text
// panel for the details pane.
export function formatIssue(issue) {
  if (!issue || issue.error) {
    return `Could not load ${issue?.identifier || 'issue'}: ${issue?.error || 'unknown error'}\n`;
  }
  const meta = [
    issue.stateName && `state: ${issue.stateName}`,
    issue.assignee && `assignee: ${issue.assignee}`,
  ].filter(Boolean).join('    ');
  const body = issue.description && issue.description.trim() ? issue.description.trim() : '(no description)';
  const lines = [[issue.identifier, issue.title].filter(Boolean).join('  ')];
  if (meta) lines.push(meta);
  if (issue.url) lines.push(issue.url);
  lines.push('', body, '');
  return lines.join('\n');
}
