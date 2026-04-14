import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInstagramSavedProbeArgs } from '../src/instagram-saved-probe.js';

test('parseInstagramSavedProbeArgs: parses explicit flags', () => {
  const args = parseInstagramSavedProbeArgs([
    '--browser', 'comet',
    '--profile', 'Profile 1',
    '--limit', '7',
    '--session', '/tmp/ig-state.json',
  ]);

  assert.equal(args.browser, 'comet');
  assert.equal(args.profile, 'Profile 1');
  assert.equal(args.limit, 7);
  assert.equal(args.sessionPath, '/tmp/ig-state.json');
});

test('parseInstagramSavedProbeArgs: rejects invalid limits', () => {
  assert.throws(
    () => parseInstagramSavedProbeArgs(['--limit', '0']),
    /--limit must be a positive integer/,
  );
});

test('parseInstagramSavedProbeArgs: rejects missing flag values', () => {
  assert.throws(
    () => parseInstagramSavedProbeArgs(['--browser']),
    /--browser requires a value/,
  );

  assert.throws(
    () => parseInstagramSavedProbeArgs(['--profile', '--limit', '5']),
    /--profile requires a value/,
  );
});

test('parseInstagramSavedProbeArgs: rejects unknown flags', () => {
  assert.throws(
    () => parseInstagramSavedProbeArgs(['--wat']),
    /Unknown argument: --wat/,
  );
});
