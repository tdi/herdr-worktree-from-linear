#!/usr/bin/env node
import { loadConfig } from '../lib/config.js';
import { fetchIssue } from '../lib/linear.js';
import { formatIssue } from '../lib/render.js';

// Runs as a herdr plugin pane (see [[panes]] "issue"), so HERDR_PLUGIN_CONFIG_DIR is set.
// The issue identifier is passed in via --env HERDR_WFP_ISSUE when the pane is opened.
async function main() {
  const identifier = process.env.HERDR_WFP_ISSUE || '';
  let issue;
  try {
    const config = loadConfig(process.env.HERDR_PLUGIN_CONFIG_DIR, process.env.HERDR_WFP_SOURCE_REPO_ROOT);
    issue = await fetchIssue(config, identifier);
  } catch (err) {
    issue = { identifier, error: err.message };
  }
  process.stdout.write(formatIssue(issue));
  // Keep the pane alive as a static reference panel (herdr scrollback handles long
  // descriptions); close it with the pane's own key binding or Ctrl-C.
  process.stdin.resume();
}

main();
