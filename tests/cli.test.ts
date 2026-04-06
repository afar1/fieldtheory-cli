import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCli } from '../src/cli.js';

test('enrich command accepts Chrome session override flags', () => {
  const cli = buildCli();
  const enrich = cli.commands.find((command) => command.name() === 'enrich');

  assert.ok(enrich);
  const optionFlags = enrich.options.map((option) => option.long);
  assert.ok(optionFlags.includes('--chrome-user-data-dir'));
  assert.ok(optionFlags.includes('--chrome-profile-directory'));
});
