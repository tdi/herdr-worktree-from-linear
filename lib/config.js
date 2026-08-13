import { readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const DEFAULTS = { issueLimit: 50, base: 'default', fzfLayout: 'down', showIssueDetails: false };

function keyForPath(keysByPath, cwd) {
  if (!keysByPath || typeof keysByPath !== 'object' || Array.isArray(keysByPath) || typeof cwd !== 'string' || !cwd) return null;
  const path = resolve(cwd);
  let matchedKey = null;
  let matchedLength = -1;
  for (const [directory, key] of Object.entries(keysByPath)) {
    if (typeof key !== 'string' || !key) continue;
    const normalizedDirectory = resolve(directory);
    if ((path === normalizedDirectory || path.startsWith(`${normalizedDirectory}${sep}`)) && normalizedDirectory.length > matchedLength) {
      matchedKey = key;
      matchedLength = normalizedDirectory.length;
    }
  }
  return matchedKey;
}

export function loadConfig(configDir, cwd) {
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
  const linearApiKey = keyForPath(config.linearApiKeysByPath, cwd) || config.linearApiKey || process.env.LINEAR_API_KEY;
  if (typeof linearApiKey !== 'string' || !linearApiKey) {
    throw new Error(
      'worktree-from-linear: set linearApiKey in config.json or the LINEAR_API_KEY environment variable (Linear personal API key)'
    );
  }
  return { ...config, linearApiKey };
}
