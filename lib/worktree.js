import { runCmd } from './exec.js';

export function worktreeExistsForBranch(porcelain, branchName) {
  return worktreePathForBranch(porcelain, branchName) !== null;
}

export function worktreePathForBranch(porcelain, branchName) {
  const target = `branch refs/heads/${branchName}`;
  let path = null;
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice('worktree '.length);
    if (line.trim() === target) return path;
  }
  return null;
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

// Two distinct signals, used for two distinct decisions (verified live on herdr 0.7.1):
//   worktreeExists — a registered worktree for the branch already exists. Drives
//     open-vs-create: `herdr worktree open --branch B` only works when a worktree
//     for B exists (else it errors "worktree branch not found"). So we open ONLY
//     when worktreeExists; otherwise we create.
//   exists (worktree OR local branch) — drives the fetch gate. `herdr worktree
//     create --branch B` checks out an existing local branch B as-is (ignoring
//     --base), so when the branch already exists locally there is nothing to fetch.
// Do NOT collapse these into one value: creating with a local-branch-exists check
// mapped to `open` would try to open a non-existent worktree and fail.
export function createOrOpenWorktree(repoRoot, branchName, base, exec = runCmd, herdrBin = 'herdr') {
  const list = exec('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain']);
  const existingPath = list.status === 0 ? worktreePathForBranch(list.stdout, branchName) : null;
  const worktreeExists = existingPath !== null;
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
  const finalList = worktreeExists ? list : exec('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain']);
  const worktreePath = worktreeExists ? existingPath : finalList.status === 0 ? worktreePathForBranch(finalList.stdout, branchName) : null;
  if (worktreePath === null) {
    throw new Error(`worktree-from-linear: could not determine worktree path for ${branchName}`);
  }
  return { exists: worktreeExists, branchName, worktreePath, args, stdout: wt.stdout };
}
