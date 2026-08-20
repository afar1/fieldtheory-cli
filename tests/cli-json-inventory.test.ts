import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildCli } from '../src/cli.js';
import { JSON_CONTRACT_SCHEMA_VERSION } from '../src/json-contract.js';

function runSourceCli(args: string[], env: NodeJS.ProcessEnv = {}): { status: number | null; stdout: string; stderr: string } {
  const cliUrl = pathToFileURL(path.resolve('src/cli.ts')).href;
  const script = [
    `import { buildCli } from ${JSON.stringify(cliUrl)};`,
    `await buildCli().parseAsync(${JSON.stringify(args)});`,
    'if (typeof process.exitCode === "number") process.exit(process.exitCode);',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function parseJsonOutput(output: string): any {
  return JSON.parse(output);
}

test('all visible CLI leaf action commands expose --json', () => {
  const expectedVisibleLeafActions = [
    'app open',
    'app url',
    'append',
    'ask',
    'auth',
    'back',
    'backlinks',
    'bookmarks auth',
    'bookmarks categories',
    'bookmarks classify',
    'bookmarks classify-domains',
    'bookmarks domains',
    'bookmarks enable',
    'bookmarks fetch-media',
    'bookmarks folders',
    'bookmarks index',
    'bookmarks list',
    'bookmarks model',
    'bookmarks path',
    'bookmarks sample',
    'bookmarks search',
    'bookmarks show',
    'bookmarks stats',
    'bookmarks status',
    'bookmarks sync',
    'bookmarks viz',
    'cat',
    'categories',
    'cd',
    'classify',
    'classify-domains',
    'codex panel',
    'commands delete',
    'commands list',
    'commands new',
    'commands open',
    'commands rename',
    'commands show',
    'commands update',
    'commands validate',
    'context',
    'current update',
    'domains',
    'feed following',
    'feed for-you',
    'fetch-media',
    'find',
    'folders',
    'frames add',
    'frames list',
    'frames remove',
    'frames show',
    'grep',
    'head',
    'index',
    'install app',
    'library create',
    'library delete',
    'library list',
    'library open',
    'library rename',
    'library search',
    'library show',
    'library update',
    'link',
    'links',
    'lint',
    'list',
    'ls',
    'md',
    'meta',
    'model',
    'new',
    'note',
    'open',
    'panel',
    'path',
    'paths',
    'possible dots',
    'possible explain',
    'possible grid',
    'possible job',
    'possible jobs',
    'possible list',
    'possible nightly install',
    'possible nightly list',
    'possible nightly run-now',
    'possible nightly show',
    'possible nightly uninstall',
    'possible prompt',
    'possible run',
    'possible seed create',
    'possible seed delete',
    'possible seed list',
    'possible seed show',
    'possible seed text',
    'possible show',
    'pwd',
    'recent',
    'rename',
    'repos add',
    'repos clear',
    'repos list',
    'repos remove',
    'reveal',
    'sample',
    'search',
    'seeds create',
    'seeds delete',
    'seeds list',
    'seeds lucky',
    'seeds organize',
    'seeds random',
    'seeds recent',
    'seeds search',
    'seeds show',
    'seeds strategies',
    'seeds strategy',
    'seeds text',
    'show',
    'skill install',
    'skill show',
    'skill uninstall',
    'state',
    'stats',
    'status',
    'sync',
    'tab',
    'tagged',
    'tags',
    'tree',
    'viz',
    'wiki',
  ];
  const rows: { path: string; hasJson: boolean }[] = [];
  const visit = (command: any, parts: string[] = []) => {
    const name = command.name();
    const current = name && name !== 'ft' ? [...parts, name] : parts;
    if (current.length > 0 && command.commands.length === 0 && command._actionHandler && !command._hidden) {
      rows.push({
        path: current.join(' '),
        hasJson: command.options.some((option: any) => option.long === '--json'),
      });
    }
    for (const child of command.commands) visit(child, current);
  };

  visit(buildCli());

  const paths = rows.map((row) => row.path).sort();
  assert.deepEqual(paths, expectedVisibleLeafActions);
  assert.deepEqual(rows.filter((row) => !row.hasJson).map((row) => row.path), []);
});

test('fallback JSON mode emits only one envelope for stdout-only command failures', () => {
  const output = runSourceCli(['node', 'ft', 'frames', 'show', 'missing-frame', '--json']);
  const parsed = parseJsonOutput(output.stdout);

  assert.equal(output.stderr, '');
  assert.equal(output.status, 1);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
  assert.equal(parsed.error.code, 'COMMAND_FAILED');
  assert.match(parsed.error.message, /Unknown frame: missing-frame/);
  assert.doesNotMatch(output.stdout, /F i e l d   T h e o r y/);
});

test('fallback JSON mode prefers stderr as the machine-readable failure message', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-sync-api-'));

  try {
    const output = runSourceCli(
      ['node', 'ft', 'sync', '--api', '--target-adds', '1', '--json'],
      { FT_DATA_DIR: tmpDir },
    );
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(output.status, 1);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error.code, 'COMMAND_FAILED');
    assert.match(parsed.error.message, /Missing user-context OAuth token/);
    assert.doesNotMatch(parsed.error.message, /Make sure your browser is open/);
    assert.doesNotMatch(output.stdout, /F i e l d   T h e o r y/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('thrown direct actions with --json still emit one error envelope', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-direct-throw-'));
  const libraryFile = path.join(tmpDir, 'not-a-library-dir');
  fs.writeFileSync(libraryFile, 'not a directory');

  try {
    const output = runSourceCli(
      ['node', 'ft', 'library', 'list', '--json'],
      { FT_LIBRARY_DIR: libraryFile },
    );
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(output.status, 1);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error.code, 'COMMAND_FAILED');
    assert.match(parsed.error.message, /ENOTDIR|not a directory|scandir/i);
    assert.doesNotMatch(output.stdout, /F i e l d   T h e o r y/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
