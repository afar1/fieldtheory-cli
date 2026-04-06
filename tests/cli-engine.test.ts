import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { addLlmEngineOption, buildCli } from '../src/cli.js';

function runCli(args: string[], ftDataDir: string) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'src/cli.ts', ...args],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        FT_DATA_DIR: ftDataDir,
        PATH: '/usr/bin:/bin',
      },
    },
  );

  return {
    ...result,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

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

  test('sync --classify with default auto engine does not fail fast before sync starts', () => {
    const ftDataDir = mkdtempSync(path.join(tmpdir(), 'ft-cli-'));

    try {
      const result = runCli(['sync', '--api', '--classify'], ftDataDir);
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.output, /No supported LLM CLI found/);
      assert.match(result.output, /Missing user-context OAuth token\. Run: ft auth/);
    } finally {
      rmSync(ftDataDir, { recursive: true, force: true });
    }
  });

  test('sync --classify with an explicit engine still fails fast when unavailable', () => {
    const ftDataDir = mkdtempSync(path.join(tmpdir(), 'ft-cli-'));

    try {
      const result = runCli(['sync', '--api', '--classify', '--engine', 'claude'], ftDataDir);
      assert.notEqual(result.status, 0);
      assert.match(result.output, /Requested LLM engine "claude" is not available/);
      assert.doesNotMatch(result.output, /Missing user-context OAuth token\. Run: ft auth/);
    } finally {
      rmSync(ftDataDir, { recursive: true, force: true });
    }
  });
});
