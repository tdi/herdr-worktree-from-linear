import { createInterface } from 'node:readline';
import { runCmd } from './exec.js';

export function formatLine(issue) {
  return `${issue.identifier}  ${issue.title}  [${issue.stateName}] @${issue.assignee}`;
}

export function formatLines(issues) {
  return issues.map(formatLine);
}

export function formatOrganizationLine(organization) {
  return organization.id;
}

export function formatOrganizationLines(organizations) {
  return organizations.map(formatOrganizationLine);
}

export function lineToIssue(line, issues) {
  const m = /^(\S+)/.exec(line || '');
  if (!m) return null;
  return issues.find((i) => i.identifier === m[1]) ?? null;
}

export function lineToOrganization(line, organizations) {
  const id = String(line || '').trim();
  return organizations.find((organization) => organization.id === id) ?? null;
}

function hasFzf(exec) {
  return exec('sh', ['-c', 'command -v fzf']).status === 0;
}

function nodeSelect(items, lines, label) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    lines.forEach((l, i) => process.stdout.write(`  ${i + 1}) ${l}\n`));
    rl.question(`Select a ${label} number (or blank to cancel): `, (answer) => {
      rl.close();
      const idx = Number(answer.trim()) - 1;
      resolve(Number.isInteger(idx) && idx >= 0 && idx < items.length ? items[idx] : null);
    });
  });
}

// fzfLayout "top" puts the search bar at the top (--layout=reverse); anything else
// (default "down") uses fzf's default bottom layout. --height=~40% keeps the picker
// a compact window that auto-shrinks to the list, capped at 40% of the pane.
export function fzfArgs(layout, prompt = 'issue> ') {
  const args = [];
  if (layout === 'top') args.push('--layout=reverse');
  args.push('--height=~40%', '--prompt', prompt);
  return args;
}

export async function select(issues, { exec = runCmd, layout = 'down' } = {}) {
  if (!issues.length) return null;
  const lines = formatLines(issues);
  if (hasFzf(exec)) {
    const res = exec('fzf', fzfArgs(layout), { input: lines.join('\n') });
    if (res.status !== 0) return null;
    return lineToIssue(res.stdout.trim(), issues);
  }
  return nodeSelect(issues, lines, 'issue');
}

export async function selectOrganization(organizations, { exec = runCmd, layout = 'down' } = {}) {
  if (!organizations.length) return null;
  const lines = formatOrganizationLines(organizations);
  if (hasFzf(exec)) {
    const res = exec('fzf', fzfArgs(layout, 'organization> '), { input: lines.join('\n') });
    if (res.status !== 0) return null;
    return lineToOrganization(res.stdout, organizations);
  }
  return nodeSelect(organizations, lines, 'organization');
}
