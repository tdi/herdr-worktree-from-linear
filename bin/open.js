#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { openPickerArgs, swapDirectionFor, parsePaneId, readPlacement } from '../lib/pane.js';
import { parseContextCwd } from '../lib/repo.js';

const herdr = process.env.HERDR_BIN_PATH || 'herdr';
const cwd = parseContextCwd(process.env.HERDR_PLUGIN_CONTEXT_JSON, process.env.PWD || process.cwd());
const placement = readPlacement(process.env.HERDR_PLUGIN_CONFIG_DIR);

const res = spawnSync(herdr, openPickerArgs(process.env.HERDR_PLUGIN_ID, cwd, placement), { encoding: 'utf8' });
if (res.stdout) process.stdout.write(res.stdout);
if (res.stderr) process.stderr.write(res.stderr);

// left/top open as a right/down split, then swap the new pane into place.
const swap = swapDirectionFor(placement);
if (res.status === 0 && swap) {
  const paneId = parsePaneId(res.stdout);
  if (paneId) spawnSync(herdr, ['pane', 'swap', '--direction', swap, '--pane', paneId], { stdio: 'inherit' });
}

process.exit(res.status ?? 1);
