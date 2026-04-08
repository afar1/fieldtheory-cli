import test from 'node:test';
import assert from 'node:assert/strict';
import { showSyncWelcome } from '../src/cli.js';

test('showSyncWelcome: advertises Firefox support without excluding Windows', () => {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  };

  try {
    showSyncWelcome();
  } finally {
    console.log = originalLog;
  }

  const output = lines.join('\n');
  assert.doesNotMatch(output, /Firefox cookie extraction currently works on macOS and Linux/);
  assert.match(output, /Firefox/i);
  assert.match(output, /Windows/i);
});
