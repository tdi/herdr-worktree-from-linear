import { loadConfig } from './config.js';
import { resolveRepo } from './repo.js';
import { listIssues } from './linear.js';
import { resolveBase } from './base.js';
import { createOrOpenWorktree } from './worktree.js';
import { select as defaultSelect } from './picker.js';
import { runCmd } from './exec.js';

export async function run({ env = process.env, exec = runCmd, fetchFn = fetch, select = defaultSelect, log = (m) => process.stdout.write(`${m}\n`) } = {}) {
  const config = loadConfig(env.HERDR_PLUGIN_CONFIG_DIR);
  const { repoRoot } = resolveRepo(env, exec);
  const issues = await listIssues(config, fetchFn);
  if (issues.length === 0) {
    log('worktree-from-linear: no active issues');
    return 0;
  }
  const issue = await select(issues, { exec });
  if (!issue) {
    log('worktree-from-linear: cancelled');
    return 0;
  }
  if (!issue.branchName) {
    log(`worktree-from-linear: issue ${issue.identifier} has no branch name`);
    return 0;
  }
  const base = resolveBase(repoRoot, config, exec);
  const herdrBin = env.HERDR_BIN_PATH || 'herdr';
  const res = createOrOpenWorktree(repoRoot, issue.branchName, base, exec, herdrBin);
  log(`worktree-from-linear: ${res.exists ? 'opened' : 'created'} worktree for ${issue.identifier} (${issue.branchName})`);
  return 0;
}
