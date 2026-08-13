import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';

const DEFAULTS = { issueLimit: 50, base: 'default', fzfLayout: 'down', showIssueDetails: false };

// Entries must name an absolute directory; a leading `~` is expanded. Relative entries
// are ignored rather than resolved against process.cwd(): the picker process and the
// issue pane process run with different working directories, so the same entry would
// otherwise select different keys in each. Returns null for anything unusable.
export function normalizeKeyDirectory(directory) {
  if (typeof directory !== 'string' || !directory) return null;
  let expanded = directory;
  if (expanded === '~') expanded = homedir();
  else if (expanded.startsWith('~/') || expanded.startsWith(`~${sep}`)) expanded = join(homedir(), expanded.slice(2));
  if (!isAbsolute(expanded)) return null;
  return resolve(expanded);
}

function keyForPath(keysByPath, cwd) {
  if (!keysByPath || typeof keysByPath !== 'object' || Array.isArray(keysByPath) || typeof cwd !== 'string' || !cwd) return null;
  const path = resolve(cwd);
  let matchedKey = null;
  let matchedLength = -1;
  for (const [directory, key] of Object.entries(keysByPath)) {
    if (typeof key !== 'string' || !key) continue;
    const normalizedDirectory = normalizeKeyDirectory(directory);
    if (!normalizedDirectory) continue;
    // resolve() drops a trailing separator except at the filesystem root, where the
    // normalized directory is already "/" — appending sep there would build "//",
    // which matches nothing.
    const boundary = normalizedDirectory.endsWith(sep) ? normalizedDirectory : `${normalizedDirectory}${sep}`;
    if ((path === normalizedDirectory || path.startsWith(boundary)) && normalizedDirectory.length > matchedLength) {
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
