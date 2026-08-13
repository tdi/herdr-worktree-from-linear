import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCmd } from './exec.js';

// herdr only splits `right` or `down`. Left/top are a right/down split followed by a
// `herdr pane swap --direction left|up`. `overlay` is a full-screen zoomed pane.
// `popup` is a centered floating window sized by --width/--height (needs herdr >= 0.7.4).
const PLACEMENTS = {
  overlay: { placement: 'overlay' },
  popup: { placement: 'popup', sized: true },
  right: { placement: 'split', direction: 'right' },
  left: { placement: 'split', direction: 'right', swap: 'left' },
  down: { placement: 'split', direction: 'down' },
  top: { placement: 'split', direction: 'down', swap: 'up' },
};
const DEFAULT_PLACEMENT = 'right';
const DEFAULT_POPUP = { width: '80%', height: '70%' };

export function normalizePlacement(placement) {
  return Object.prototype.hasOwnProperty.call(PLACEMENTS, placement) ? placement : DEFAULT_PLACEMENT;
}

export function openPickerArgs(pluginId = 'tdi.worktree-from-linear', cwd, placement = DEFAULT_PLACEMENT, { width = DEFAULT_POPUP.width, height = DEFAULT_POPUP.height } = {}) {
  const spec = PLACEMENTS[normalizePlacement(placement)];
  const args = ['plugin', 'pane', 'open', '--plugin', pluginId, '--entrypoint', 'picker', '--placement', spec.placement];
  if (spec.direction) args.push('--direction', spec.direction);
  if (spec.sized) args.push('--width', width, '--height', height);
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

// A herdr PopupSize is an integer cell count (1-65535) or a "N%" string (1-100%).
// Returns the value as a string herdr accepts, or null when invalid.
function validSize(v) {
  if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 65535) return String(v);
  if (typeof v === 'string') {
    if (/^(100|[1-9][0-9]?)%$/.test(v)) return v;
    if (/^[1-9][0-9]{0,4}$/.test(v) && Number(v) <= 65535) return v;
  }
  return null;
}

// Popup width/height from config.json (popupWidth/popupHeight), each falling back
// to the default when absent or invalid. Only consulted for placement = "popup".
export function readPopupSize(configDir) {
  if (!configDir) return { ...DEFAULT_POPUP };
  try {
    const cfg = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf8'));
    return {
      width: validSize(cfg.popupWidth) || DEFAULT_POPUP.width,
      height: validSize(cfg.popupHeight) || DEFAULT_POPUP.height,
    };
  } catch {
    return { ...DEFAULT_POPUP };
  }
}

// The workspace's root (agent) pane id from `herdr worktree create|open --json` stdout.
export function parseRootPaneId(stdout) {
  try {
    return JSON.parse(stdout)?.result?.root_pane?.pane_id ?? null;
  } catch {
    return null;
  }
}

// Args for opening the issue-details pane as a plugin pane, attached below the new
// workspace's root pane. `--entrypoint issue` runs bin/issue.js, which herdr launches
// with the plugin env set so it can read the config and fetch from Linear itself (no
// external CLI). The identifier rides in via --env.
export function issuePaneOpenArgs(pluginId, rootPaneId, identifier, sourceRepoRoot) {
  const args = [
    'plugin', 'pane', 'open', '--plugin', pluginId, '--entrypoint', 'issue',
    '--placement', 'split', '--target-pane', rootPaneId, '--direction', 'down',
    '--no-focus', '--env', `HERDR_WFP_ISSUE=${identifier}`,
  ];
  if (typeof sourceRepoRoot === 'string' && sourceRepoRoot) args.push('--env', `HERDR_WFP_SOURCE_REPO_ROOT=${sourceRepoRoot}`);
  return args;
}

// Open the issue-details plugin pane in the freshly created worktree workspace, then
// swap it up so details sit on top and the agent below (herdr only splits right/down,
// so top = down + swap-up, as in open.js). `--no-focus` keeps the agent pane focused.
// Best-effort: returns the details pane id, or null if the worktree stdout carried no
// root pane or the open failed.
export function openIssuePane(worktreeStdout, identifier, pluginId, exec = runCmd, herdrBin = 'herdr', sourceRepoRoot) {
  const rootPane = parseRootPaneId(worktreeStdout);
  if (!rootPane || !identifier || !pluginId) return null;
  const res = exec(herdrBin, issuePaneOpenArgs(pluginId, rootPane, identifier, sourceRepoRoot));
  if (res.status !== 0) return null;
  const pane = parsePaneId(res.stdout);
  if (!pane) return null;
  exec(herdrBin, ['pane', 'swap', '--direction', 'up', '--pane', pane]);
  return pane;
}
