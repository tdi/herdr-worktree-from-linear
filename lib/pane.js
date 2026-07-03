import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// herdr only splits `right` or `down`. Left/top are a right/down split followed by a
// `herdr pane swap --direction left|up`. `overlay` is a full-screen zoomed pane.
const PLACEMENTS = {
  overlay: { placement: 'overlay' },
  right: { placement: 'split', direction: 'right' },
  left: { placement: 'split', direction: 'right', swap: 'left' },
  down: { placement: 'split', direction: 'down' },
  top: { placement: 'split', direction: 'down', swap: 'up' },
};
const DEFAULT_PLACEMENT = 'right';

export function normalizePlacement(placement) {
  return Object.prototype.hasOwnProperty.call(PLACEMENTS, placement) ? placement : DEFAULT_PLACEMENT;
}

export function openPickerArgs(pluginId = 'tdi.worktree-from-linear', cwd, placement = DEFAULT_PLACEMENT) {
  const spec = PLACEMENTS[normalizePlacement(placement)];
  const args = ['plugin', 'pane', 'open', '--plugin', pluginId, '--entrypoint', 'picker', '--placement', spec.placement];
  if (spec.direction) args.push('--direction', spec.direction);
  args.push('--focus');
  // Pass the invoking repo as HERDR_WFP_CWD (resolveRepo prefers it over the pane's
  // own context JSON). Do NOT set --cwd: the pane command `node bin/picker.js` is
  // relative to the plugin root, so --cwd would break command resolution.
  if (typeof cwd === 'string' && cwd) args.push('--env', `HERDR_WFP_CWD=${cwd}`);
  return args;
}

// The `herdr pane swap` direction to apply after opening, or null when none is needed.
export function swapDirectionFor(placement) {
  return PLACEMENTS[normalizePlacement(placement)].swap || null;
}

// Extract the opened pane id from `herdr plugin pane open --json` stdout.
export function parsePaneId(stdout) {
  try {
    const d = JSON.parse(stdout);
    return d?.result?.plugin_pane?.pane?.pane_id ?? null;
  } catch {
    return null;
  }
}

// Read the `placement` option from the plugin config, tolerant of a missing/invalid
// file (open.js must not require linearApiKey just to position the pane).
export function readPlacement(configDir) {
  if (!configDir) return DEFAULT_PLACEMENT;
  try {
    const cfg = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf8'));
    return normalizePlacement(cfg.placement);
  } catch {
    return DEFAULT_PLACEMENT;
  }
}
