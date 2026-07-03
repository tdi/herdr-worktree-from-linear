export function openPickerArgs(pluginId = 'tdi.worktree-from-linear', cwd) {
  const args = ['plugin', 'pane', 'open', '--plugin', pluginId, '--entrypoint', 'picker', '--placement', 'overlay', '--focus'];
  // Pass the invoking repo as HERDR_WFP_CWD (resolveRepo prefers it over the pane's
  // own context JSON). Do NOT set --cwd: the pane command `node bin/picker.js` is
  // relative to the plugin root, so --cwd would break command resolution.
  if (typeof cwd === 'string' && cwd) args.push('--env', `HERDR_WFP_CWD=${cwd}`);
  return args;
}
