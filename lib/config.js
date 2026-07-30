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
  if (typeof config.linearApiKey !== 'string' || !config.linearApiKey) {
    throw new Error('worktree-from-linear: set linearApiKey in config.json (Linear personal API key)');
  }
  validateTicketConfigPath(config.ticketConfigPath);
  return config;
}
