#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { loadConfig } from '../lib/config.js';
import { fetchIssue } from '../lib/linear.js';
import { formatIssue, formatIssueMarkdown } from '../lib/render.js';

const RESIZE_DEBOUNCE_MS = 200;
// Home, erase screen, erase scrollback: without the last one every re-render would stack
// another copy of the issue in the host's scrollback.
const CLEAR = '\x1b[H\x1b[2J\x1b[3J';

// glow pads every line out to the render width and fits tables to it, so a rendered
// issue cannot reflow: shrinking the pane wraps that padding into blank lines and breaks
// the table borders. Capturing glow's output to strip the padding is not an option —
// glow drops all styling when its stdout is not a TTY. So re-render instead.
function paneWidth() {
  return Math.max(40, (process.stdout.columns || 80) - 2);
}

// Hold the pane open after rendering, without acting like a prompt: the tty still echoes,
// so typing into a finished pane would print stray characters over the issue, and the
// cursor left sitting below the text reads as an input line. Raw mode stops the echo (and
// with it any interpretation of Ctrl-C, so quit on it explicitly).
function hold() {
  process.stdout.write('\x1b[?25l');
  const restore = () => process.stdout.write('\x1b[?25h');
  process.on('exit', restore);
  if (!process.stdin.isTTY) return process.stdin.resume();
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (buf) => {
    if (buf.includes(0x03) || buf.includes(0x04) || buf.includes(0x71)) process.exit(0);  // Ctrl-C, Ctrl-D, q
  });
}

// Render the markdown with glow when it is installed, re-rendering at the new width on
// resize. Returns false when glow cannot be used, so the caller prints the plain panel
// instead.
//
// No pager: the whole rendered issue goes straight into the pane, so scrolling and
// selection stay the host's, exactly as in any other pane. A pager would own the mouse
// (its own tracking, so selection needs shift) or, without --mouse, leave the wheel
// scrolling only the part already paged through.
function renderWithGlow(markdown, fallback) {
  if (!process.stdout.isTTY) return false;
  if (spawnSync('sh', ['-c', 'command -v glow']).status !== 0) return false;
  let child = null;
  let restart = false;
  let timer = null;
  const render = () => {
    process.stdout.write(CLEAR);
    // glow probes the terminal background (OSC 10/11) to pick its light/dark style and
    // waits for the reply on the tty, so this process must not be reading it at the same
    // time — a resumed stdin here swallows the reply and glow never renders.
    process.stdin.pause();
    child = spawn('glow', ['-w', String(paneWidth())], { stdio: ['pipe', 'inherit', 'inherit'] });
    // A long issue may not fit the pipe buffer, so this write can still be pending when a
    // resize kills glow: swallow the EPIPE, or the unhandled error takes the pane down.
    child.stdin.on('error', () => {});
    child.stdin.end(markdown);
    const done = (err) => {
      child = null;
      if (restart) { restart = false; return render(); }
      // A glow that starts but fails (bad config, unknown style) leaves a blank pane.
      if (err) process.stdout.write(fallback);
      hold();
    };
    child.on('error', done);
    child.on('exit', (code) => done(code ? new Error(`glow exited ${code}`) : null));
  };
  // Dragging a pane divider fires a burst of these; only the last one is worth a render.
  process.stdout.on('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!child) return render();
      restart = true;
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
    }, RESIZE_DEBOUNCE_MS);
  });
  render();
  return true;
}

// Runs as a herdr plugin pane (see [[panes]] "issue"), so HERDR_PLUGIN_CONFIG_DIR is set.
// The issue identifier is passed in via --env HERDR_WFP_ISSUE when the pane is opened.
async function main() {
  const identifier = process.env.HERDR_WFP_ISSUE || '';
  let issue;
  try {
    const config = loadConfig(process.env.HERDR_PLUGIN_CONFIG_DIR);
    issue = await fetchIssue(config, identifier);
  } catch (err) {
    issue = { identifier, error: err.message };
  }
  const plain = formatIssue(issue);
  // Keep the pane alive as a static reference panel (herdr scrollback handles long
  // descriptions); close it with q, Ctrl-C, or the pane's own key binding. The glow path
  // holds the pane itself, once glow is done with the tty.
  if (issue.error || !renderWithGlow(formatIssueMarkdown(issue), plain)) {
    process.stdout.write(plain);
    hold();
  }
}

main();
