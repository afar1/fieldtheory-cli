import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { addLlmEngineOption, buildCli } from '../src/cli.js';

describe('addLlmEngineOption', () => {
  test('parses explicit engine values and defaults to auto', () => {
    const explicit = addLlmEngineOption(new Command('classify'));
    explicit.parse(['--engine', 'codex'], { from: 'user' });
    assert.equal(explicit.opts().engine, 'codex');

    const defaults = addLlmEngineOption(new Command('classify'));
    defaults.parse([], { from: 'user' });
    assert.equal(defaults.opts().engine, 'auto');
  });

  test('rejects unsupported engine values', () => {
    const cmd = addLlmEngineOption(new Command('classify')).exitOverride();
    assert.throws(
      () => cmd.parse(['--engine', 'bogus'], { from: 'user' }),
      /Allowed choices are auto, claude, codex/,
    );
  });
});

describe('buildCli', () => {
  test('adds engine option help to sync, classify, and classify-domains', () => {
    const program = buildCli();
    const sync = program.commands.find((command) => command.name() === 'sync');
    const classify = program.commands.find((command) => command.name() === 'classify');
    const classifyDomains = program.commands.find((command) => command.name() === 'classify-domains');
    const viz = program.commands.find((command) => command.name() === 'viz');

    assert.ok(sync);
    assert.ok(classify);
    assert.ok(classifyDomains);
    assert.ok(viz);

    for (const command of [sync, classify, classifyDomains]) {
      const engineOption = command.options.find((option) => option.long === '--engine');
      assert.ok(engineOption);
      assert.deepEqual(engineOption.argChoices, ['auto', 'claude', 'codex']);
      assert.match(command.helpInformation(), /--engine <engine>/);
      assert.match(command.helpInformation(), /choices:[\s\S]*\"auto\", \"claude\", \"codex\"/);
    }

    assert.doesNotMatch(viz.helpInformation(), /--engine <engine>/);
  });
});
