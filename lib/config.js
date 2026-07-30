import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_TICKET_CONFIG_PATH, validateTicketConfigPath } from './ticket.js';

const DEFAULTS = { issueLimit: 50, base: 'default', fzfLayout: 'down', showIssueDetails: false, ticketConfigPath: DEFAULT_TICKET_CONFIG_PATH };

export function loadConfig(configDir) {
  let parsed = {};
  if (configDir) {
    let text = null;
    try {
      text = readFileSync(join(configDir, 'config.json'), 'utf8');
    } catch {
      text = null;
    }
    if (text !== null) {
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error(`worktree-from-linear: invalid config.json: ${err.message}`);
      }
    }
  }
  const config = { ...DEFAULTS, ...parsed };
  if (!Array.isArray(parsed.linearOrgs)) {
    if (typeof config.linearApiKey !== 'string' || !config.linearApiKey) {
      throw new Error('worktree-from-linear: set linearApiKey in config.json (Linear personal API key)');
    }
    validateTicketConfigPath(config.ticketConfigPath);
    return { ...config, linearOrgs: [{ ...config, id: 'default' }] };
  }

  if (!parsed.linearOrgs.length) {
    throw new Error('worktree-from-linear: configure at least one Linear organization in linearOrgs');
  }
  const sharedConfig = { ...config };
  delete sharedConfig.linearApiKey;
  delete sharedConfig.linearOrgs;
  const ids = new Set();
  const linearOrgs = parsed.linearOrgs.map((profile, index) => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new Error(`worktree-from-linear: linearOrgs[${index}] must be an object`);
    }
    const id = profile.id;
    if (typeof id !== 'string' || !/^\S+$/.test(id)) {
      throw new Error(`worktree-from-linear: linearOrgs[${index}].id must be a non-empty whitespace-free string`);
    }
    if (ids.has(id)) {
      throw new Error(`worktree-from-linear: duplicate Linear organization id ${JSON.stringify(id)}`);
    }
    ids.add(id);
    const org = { ...sharedConfig, ...profile, id };
    if (typeof org.linearApiKey !== 'string' || !org.linearApiKey) {
      throw new Error(`worktree-from-linear: set linearApiKey for Linear organization ${JSON.stringify(id)}`);
    }
    validateTicketConfigPath(org.ticketConfigPath);
    return org;
  });
  return { ...config, linearOrgs };
}
