import { runCmd } from './exec.js';

export function worktreeExistsForBranch(porcelain, branchName) {
  const target = `branch refs/heads/${branchName}`;
  return porcelain.split('\n').some((l) => l.trim() === target);
}

export function localBranchExists(repoRoot, branchName, exec = runCmd) {
  const res = exec('git', ['-C', repoRoot, 'rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`]);
  return res.status === 0;
}

export function buildWorktreeArgs(exists, repoRoot, branchName, baseRef) {
  if (exists) {
    return ['worktree', 'open', '--cwd', repoRoot, '--branch', branchName, '--focus', '--json'];
  }
  return ['worktree', 'create', '--cwd', repoRoot, '--branch', branchName, '--base', baseRef, '--focus', '--json'];
}

export function createOrOpenWorktree(repoRoot, branchName, base, exec = runCmd, herdrBin = 'herdr') {
  const list = exec('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain']);
  const worktreeExists = list.status === 0 && worktreeExistsForBranch(list.stdout, branchName);
  const exists = worktreeExists || localBranchExists(repoRoot, branchName, exec);
  if (!exists && base.needsFetch) {
    const fetch = exec('git', ['-C', repoRoot, 'fetch', 'origin', base.baseBranch]);
    if (fetch.status !== 0) {
      throw new Error(`worktree-from-linear: git fetch failed: ${fetch.stderr.trim() || 'unknown error'}`);
    }
  }
  const args = buildWorktreeArgs(worktreeExists, repoRoot, branchName, base.baseRef);
  const wt = exec(herdrBin, args);
  if (wt.status !== 0) {
    throw new Error(`worktree-from-linear: herdr worktree ${worktreeExists ? 'open' : 'create'} failed: ${wt.stderr.trim() || 'unknown error'}`);
  }
  return { exists: worktreeExists, branchName, args, stdout: wt.stdout };
}
