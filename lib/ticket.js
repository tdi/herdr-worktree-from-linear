import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, normalize, relative, resolve } from 'node:path';

export const DEFAULT_TICKET_CONFIG_PATH = '.herdr/ticket.json';

export function validateTicketConfigPath(ticketConfigPath) {
  if (typeof ticketConfigPath !== 'string' || !ticketConfigPath.trim() || isAbsolute(ticketConfigPath)) {
    throw new Error('worktree-from-linear: ticketConfigPath must be a non-empty repository-relative path');
  }
  const normalized = normalize(ticketConfigPath);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error('worktree-from-linear: ticketConfigPath must stay within the worktree');
  }
}

export function resolveTicketConfigPath(worktreePath, ticketConfigPath = DEFAULT_TICKET_CONFIG_PATH) {
  validateTicketConfigPath(ticketConfigPath);
  const target = resolve(worktreePath, ticketConfigPath);
  const pathWithinWorktree = relative(worktreePath, target);
  if (!pathWithinWorktree || pathWithinWorktree === '..' || pathWithinWorktree.startsWith('../') || isAbsolute(pathWithinWorktree)) {
    throw new Error('worktree-from-linear: ticketConfigPath must stay within the worktree');
  }
  return target;
}

export function ticketConfig(ticket) {
  return { version: 1, ticket };
}

export function writeTicketConfig(worktreePath, ticketConfigPath, ticket) {
  const target = resolveTicketConfigPath(worktreePath, ticketConfigPath);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(ticketConfig(ticket), null, 2)}\n`, 'utf8');
  renameSync(temporary, target);
  return target;
}
