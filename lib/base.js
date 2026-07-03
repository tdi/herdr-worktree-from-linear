import { runCmd } from './exec.js';

export function parseDefaultBranch(symbolicRefStdout) {
  const s = (symbolicRefStdout || '').trim();
  if (!s) return null;
  return s.replace(/^origin\//, '');
}

export function resolveBase(repoRoot, config = {}, exec = runCmd) {
  const base = config.base || 'default';
  if (base === 'head') {
    return { baseRef: 'HEAD', needsFetch: false, baseBranch: null };
  }
  if (base === 'default') {
    const res = exec('git', ['-C', repoRoot, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    const branch = (res.status === 0 && parseDefaultBranch(res.stdout)) || 'main';
    return { baseRef: `origin/${branch}`, needsFetch: true, baseBranch: branch };
  }
  return { baseRef: `origin/${base}`, needsFetch: true, baseBranch: base };
}
