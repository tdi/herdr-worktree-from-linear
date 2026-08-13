import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { runCmd } from './exec.js';

function firstString(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

export function parseContextCwd(contextJson, fallbackCwd) {
  let ctx = null;
  try {
    ctx = contextJson ? JSON.parse(contextJson) : null;
  } catch {
    ctx = null;
  }
  if (ctx && typeof ctx === 'object') {
    const pane = ctx.focused_pane && typeof ctx.focused_pane === 'object' ? ctx.focused_pane : {};
    const workspace = ctx.workspace && typeof ctx.workspace === 'object' ? ctx.workspace : {};
    const worktree = ctx.worktree && typeof ctx.worktree === 'object' ? ctx.worktree : {};
    const found = firstString(
      ctx.focused_pane_cwd, pane.cwd, pane.working_directory,
      ctx.workspace_cwd, workspace.cwd, workspace.path,
      worktree.checkout_path, worktree.path, worktree.workspace_cwd,
      ctx.cwd, ctx.repo_root,
    );
    if (found) return found;
  }
  return fallbackCwd;
}

// The main working tree's root, derived from the common git dir. Inside a linked
// worktree `--show-toplevel` is the worktree checkout, but the common dir still points
// at the source repository's `.git`, so its parent is the repo the worktree came from.
// Returns null for layouts where that does not hold (bare repos, `.git` files/dirs with
// another name), leaving the caller to fall back to the checkout itself.
export function parseMainRepoRoot(commonDirStdout, cwd) {
  const raw = (commonDirStdout || '').trim();
  if (!raw) return null;
  const gitDir = isAbsolute(raw) ? resolve(raw) : resolve(cwd, raw);
  if (basename(gitDir) !== '.git') return null;
  return dirname(gitDir);
}

// `repoRoot` is the checkout to operate on (worktree create/open, base resolution);
// `mainRepoRoot` is the source repository it belongs to, and is what path-keyed config
// must match — otherwise re-running from a worktree this plugin created would miss
// every `linearApiKeysByPath` entry and silently fall back to the default key.
export function resolveRepo(env, exec = runCmd) {
  const cwd = (typeof env.HERDR_WFP_CWD === 'string' && env.HERDR_WFP_CWD)
    || parseContextCwd(env.HERDR_PLUGIN_CONTEXT_JSON, env.PWD || process.cwd());
  const top = exec('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
  if (top.status !== 0) {
    throw new Error('worktree-from-linear: not inside a git repository');
  }
  const repoRoot = top.stdout.trim();
  // --path-format needs git >= 2.31; on older git the call fails and we fall back.
  const common = exec('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir']);
  const mainRepoRoot = (common.status === 0 && parseMainRepoRoot(common.stdout, repoRoot)) || repoRoot;
  return { repoRoot, mainRepoRoot };
}
