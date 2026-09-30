import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';

const DEFAULTS = { issueLimit: 50, base: 'default', fzfLayout: 'down', showIssueDetails: false };

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function keyDirectory(directory) {
  let expanded = directory;
  if (expanded === '~') expanded = homedir();
  else if (expanded.startsWith('~/')) expanded = join(homedir(), expanded.slice(2));
  if (!isAbsolute(expanded)) {
    throw new Error(`worktree-from-linear: linearApiKeyEnv path "${directory}" must be absolute (or start with ~/)`);
  }
  try {
    return realpathSync(expanded);
  } catch {
    return resolve(expanded);
  }
}

export function keyEnvFor(config, repoRoot) {
  const map = config.linearApiKeyEnv;
  if (map === undefined) return null;
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new Error('worktree-from-linear: linearApiKeyEnv must map directories to environment variable names');
  }
  let best = null;
  let bestLength = -1;
  for (const [directory, name] of Object.entries(map)) {
    if (typeof name !== 'string' || !ENV_NAME.test(name) || name.startsWith('lin_api_')) {
      throw new Error(`worktree-from-linear: linearApiKeyEnv["${directory}"] must be an environment variable name, not a key`);
    }
    const dir = keyDirectory(directory);
    if (typeof repoRoot !== 'string' || !repoRoot) continue;
    const inside = repoRoot === dir || repoRoot.startsWith(dir.endsWith(sep) ? dir : `${dir}${sep}`);
    if (inside && dir.length > bestLength) {
      best = name;
      bestLength = dir.length;
    }
  }
  return best;
}

export function loadConfig(configDir, { invokingRepo = () => null, keyEnv, env = process.env } = {}) {
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
  const envName = (typeof keyEnv === 'string' && ENV_NAME.test(keyEnv) && keyEnv)
    || (config.linearApiKeyEnv !== undefined ? keyEnvFor(config, invokingRepo()) : null);
  if (envName) {
    const linearApiKey = env[envName];
    if (typeof linearApiKey !== 'string' || !linearApiKey) {
      throw new Error(
        `worktree-from-linear: set the ${envName} environment variable (selected by linearApiKeyEnv) in the herdr server's environment`
      );
    }
    return { ...config, linearApiKey, linearApiKeyEnvName: envName };
  }
  const linearApiKey = config.linearApiKey || env.LINEAR_API_KEY;
  if (typeof linearApiKey !== 'string' || !linearApiKey) {
    throw new Error(
      'worktree-from-linear: set linearApiKey in config.json or the LINEAR_API_KEY environment variable (Linear personal API key)'
    );
  }
  return { ...config, linearApiKey };
}
