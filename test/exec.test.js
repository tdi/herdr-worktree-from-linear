import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCmd } from '../lib/exec.js';

test('runCmd returns status and stdout', () => {
  const res = runCmd('printf', ['hello']);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, 'hello');
});

test('runCmd reports non-zero status', () => {
  assert.equal(runCmd('sh', ['-c', 'exit 3']).status, 3);
});
