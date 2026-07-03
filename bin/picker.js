#!/usr/bin/env node
import { run } from '../lib/run.js';

run()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
