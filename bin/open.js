#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { openPickerArgs } from '../lib/pane.js';
import { parseContextCwd } from '../lib/repo.js';

const herdr = process.env.HERDR_BIN_PATH || 'herdr';
const cwd = parseContextCwd(process.env.HERDR_PLUGIN_CONTEXT_JSON, process.env.PWD || process.cwd());
const res = spawnSync(herdr, openPickerArgs(process.env.HERDR_PLUGIN_ID, cwd), { stdio: 'inherit' });
process.exit(res.status ?? 1);
