import { loadConfig } from './config.js';
import { resolveRepo } from './repo.js';
import { listIssues } from './linear.js';
import { resolveBase } from './base.js';
import { createOrOpenWorktree } from './worktree.js';
import { openIssuePane } from './pane.js';
import { select as defaultSelect } from './picker.js';
import { runCmd } from './exec.js';

// Where the worktree lands. `repos` maps a Linear team key to a repo root, so a pick
// routes by the issue's team rather than by whichever pane happened to invoke the
// action. Teams absent from the map fall back to the invoking pane's repo, which is
// also the whole behaviour when no map is configured.
export function repoRootFor(config, issue, env, exec = runCmd) {
  const mapped = config.repos && typeof config.repos === 'object' ? config.repos[issue.teamKey] : null;
  if (typeof mapped === 'string' && mapped) return mapped;
  try {
    return resolveRepo(env, exec).repoRoot;
  } catch (err) {
    if (issue.teamKey) {
      throw new Error(`${err.message} (and team ${issue.teamKey} is not in the "repos" map in config.json)`);
    }
    throw err;
  }
}

export async function run({ env = process.env, exec = runCmd, fetchFn = fetch, select = defaultSelect, log = (m) => process.stdout.write(`${m}\n`) } = {}) {
  const config = loadConfig(env.HERDR_PLUGIN_CONFIG_DIR);
  const issues = await listIssues(config, fetchFn);
  if (issues.length === 0) {
    log('worktree-from-linear: no active issues');
    return 0;
  }
  const issue = await select(issues, { exec, layout: config.fzfLayout });
  if (!issue) {
    log('worktree-from-linear: cancelled');
    return 0;
  }
  if (!issue.branchName) {
    log(`worktree-from-linear: issue ${issue.identifier} has no branch name`);
    return 0;
  }
  // Resolved after the pick, not before: the issue's team is what selects the repo.
  const repoRoot = repoRootFor(config, issue, env, exec);
  const base = resolveBase(repoRoot, config, exec);
  const herdrBin = env.HERDR_BIN_PATH || 'herdr';
  const pluginId = env.HERDR_PLUGIN_ID || 'tdi.worktree-from-linear';
  const res = createOrOpenWorktree(repoRoot, issue.branchName, base, exec, herdrBin);
  // Opt-in via showIssueDetails, and only on a fresh create: re-opening an existing
  // worktree would stack duplicate panes.
  if (config.showIssueDetails && !res.exists) openIssuePane(res.stdout, issue.identifier, pluginId, exec, herdrBin);
  log(`worktree-from-linear: ${res.exists ? 'opened' : 'created'} worktree for ${issue.identifier} (${issue.branchName})`);
  return 0;
}
