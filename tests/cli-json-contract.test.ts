import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildCli } from '../src/cli.js';
import { JSON_CONTRACT_SCHEMA_VERSION } from '../src/json-contract.js';
import { buildIndex } from '../src/bookmarks-db.js';

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const origWrite = process.stdout.write;
  process.stdout.write = ((chunk: any, encodingOrCb?: any, cb?: any) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk));
    if (typeof encodingOrCb === 'function') encodingOrCb();
    if (typeof cb === 'function') cb();
    return true;
  }) as typeof process.stdout.write;

  try {
    await fn();
  } finally {
    process.stdout.write = origWrite;
  }

  return chunks.join('');
}

async function captureOutput(fn: () => Promise<void>): Promise<{ stdout: string; stderr: string }> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const origStdoutWrite = process.stdout.write;
  const origStderrWrite = process.stderr.write;
  process.stdout.write = ((chunk: any, encodingOrCb?: any, cb?: any) => {
    stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk));
    if (typeof encodingOrCb === 'function') encodingOrCb();
    if (typeof cb === 'function') cb();
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: any, encodingOrCb?: any, cb?: any) => {
    stderrChunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk));
    if (typeof encodingOrCb === 'function') encodingOrCb();
    if (typeof cb === 'function') cb();
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  }

  return { stdout: stdoutChunks.join(''), stderr: stderrChunks.join('') };
}

function parseJsonOutput(output: string): any {
  return JSON.parse(output);
}

function runSourceCliInChild(
  args: string[],
  env: NodeJS.ProcessEnv = {},
  processArgv: string[] = args,
  parseOptions?: { from: 'user' | 'node' | 'electron' },
): { status: number | null; stdout: string; stderr: string } {
  const cliUrl = pathToFileURL(path.resolve('src/cli.ts')).href;
  const script = [
    `import { buildCli } from ${JSON.stringify(cliUrl)};`,
    `process.argv = ${JSON.stringify(processArgv)};`,
    `await buildCli().parseAsync(${JSON.stringify(args)}, ${JSON.stringify(parseOptions)});`,
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

async function runSourceCliInChildAsync(
  args: string[],
  env: NodeJS.ProcessEnv = {},
  processArgv: string[] = args,
  parseOptions?: { from: 'user' | 'node' | 'electron' },
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const cliUrl = pathToFileURL(path.resolve('src/cli.ts')).href;
  const script = [
    `import { buildCli } from ${JSON.stringify(cliUrl)};`,
    `process.argv = ${JSON.stringify(processArgv)};`,
    `await buildCli().parseAsync(${JSON.stringify(args)}, ${JSON.stringify(parseOptions)});`,
  ].join('\n');

  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));

  return await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({
        status,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

async function captureCliParse(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: string | number | undefined }> {
  const previousExitCode = process.exitCode;
  const previousArgv = process.argv;
  process.exitCode = undefined;
  process.argv = [...args];

  try {
    const output = await captureOutput(async () => {
      await buildCli().parseAsync(args);
    });
    return { ...output, exitCode: process.exitCode };
  } finally {
    process.exitCode = previousExitCode;
    process.argv = previousArgv;
  }
}

const BOOKMARK_FIXTURES = [
  {
    id: '1',
    tweetId: '1',
    url: 'https://x.com/alice/status/1',
    text: 'Machine learning learning healthcare note',
    authorHandle: 'alice',
    authorName: 'Alice',
    syncedAt: '2026-01-01T00:00:00Z',
    postedAt: '2026-01-01T12:00:00Z',
    language: 'en',
    mediaObjects: [],
    links: [],
    tags: [],
    ingestedVia: 'graphql',
  },
  {
    id: '2',
    tweetId: '2',
    url: 'https://x.com/bob/status/2',
    text: 'Rust systems programming note',
    authorHandle: 'bob',
    authorName: 'Bob',
    syncedAt: '2026-02-01T00:00:00Z',
    postedAt: '2026-02-01T12:00:00Z',
    language: 'en',
    mediaObjects: [],
    links: [],
    tags: [],
    ingestedVia: 'graphql',
  },
];

async function withBookmarkData(fn: () => Promise<void>): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-bookmarks-'));
  const previousDataDir = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;
  fs.writeFileSync(path.join(tmpDir, 'bookmarks.jsonl'), `${BOOKMARK_FIXTURES.map((fixture) => JSON.stringify(fixture)).join('\n')}\n`);

  try {
    await fn();
  } finally {
    if (previousDataDir === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previousDataDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function withBookmarkIndex(fn: () => Promise<void>): Promise<void> {
  await withBookmarkData(async () => {
    await buildIndex({ force: true });
    await fn();
  });
}

async function withNavigationLibrary(fn: (env: NodeJS.ProcessEnv) => Promise<void>): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-nav-'));
  const previousHome = process.env.HOME;
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousCommandsDir = process.env.FT_COMMANDS_DIR;
  const previousBrowserHelperStatePath = process.env.FT_BROWSER_HELPER_STATE_PATH;
  process.env.HOME = tmpDir;
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
  process.env.FT_COMMANDS_DIR = path.join(process.env.FT_LIBRARY_DIR, 'Commands');
  process.env.FT_BROWSER_HELPER_STATE_PATH = path.join(tmpDir, 'browser-helper.json');

  const wikiDir = path.join(process.env.FT_LIBRARY_DIR, 'wikis');
  const sessionDir = path.join(tmpDir, '.fieldtheory', '.codex-context', 'sessions', 'test-session');
  const browserServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  fs.mkdirSync(wikiDir, { recursive: true });
  fs.mkdirSync(process.env.FT_COMMANDS_DIR, { recursive: true });
  fs.mkdirSync(sessionDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    browserServer.once('error', reject);
    browserServer.listen(0, '127.0.0.1', () => {
      browserServer.off('error', reject);
      resolve();
    });
  });
  const browserAddress = browserServer.address();
  if (!browserAddress || typeof browserAddress === 'string') throw new Error('Browser helper test server did not expose a port.');
  fs.writeFileSync(process.env.FT_BROWSER_HELPER_STATE_PATH, JSON.stringify({
    host: '127.0.0.1',
    port: browserAddress.port,
    token: 'test-token',
    browserUrl: `http://127.0.0.1:${browserAddress.port}/browser-library.html`,
  }));

  const alphaPath = path.join(wikiDir, 'Alpha.md');
  const betaPath = path.join(wikiDir, 'Beta.md');
  const currentContentPath = path.join(sessionDir, 'active.md');
  fs.writeFileSync(alphaPath, [
    '---',
    'tags: [systems, nav]',
    '---',
    '# Alpha',
    '',
    'See [[Beta]] and #fieldnote.',
    '',
  ].join('\n'));
  fs.writeFileSync(betaPath, '# Beta\n\nBack to [[Alpha]].\n');
  fs.writeFileSync(path.join(process.env.FT_COMMANDS_DIR, 'review.md'), '# review\n\nUse this when reviewing work.\n');
  fs.writeFileSync(currentContentPath, '# Active Alpha\n\nCurrent content.\n');
  fs.writeFileSync(path.join(sessionDir, 'context.json'), JSON.stringify({
    updatedAt: '2026-01-02T00:00:00.000Z',
    activeDocument: {
      title: 'Alpha',
      path: alphaPath,
      kind: 'wiki',
      contentMode: 'markdown',
      contentPath: currentContentPath,
    },
  }));

  try {
    await fn({
      HOME: tmpDir,
      FT_LIBRARY_DIR: process.env.FT_LIBRARY_DIR,
      FT_COMMANDS_DIR: process.env.FT_COMMANDS_DIR,
      FT_BROWSER_HELPER_STATE_PATH: process.env.FT_BROWSER_HELPER_STATE_PATH,
    });
  } finally {
    await new Promise<void>((resolve) => browserServer.close(() => resolve()));
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    if (previousCommandsDir === undefined) delete process.env.FT_COMMANDS_DIR;
    else process.env.FT_COMMANDS_DIR = previousCommandsDir;
    if (previousBrowserHelperStatePath === undefined) delete process.env.FT_BROWSER_HELPER_STATE_PATH;
    else process.env.FT_BROWSER_HELPER_STATE_PATH = previousBrowserHelperStatePath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function assertSameRealPath(actual: string, expected: string): void {
  assert.equal(fs.realpathSync(actual), fs.realpathSync(expected));
}

test('ft recent --json prints the v1 success envelope', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-recent-'));
  fs.writeFileSync(path.join(tmpDir, 'alpha.md'), '# Alpha\n');

  try {
    const output = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'recent', '--repo', tmpDir, '--limit', '1', '--json']);
    });
    const parsed = parseJsonOutput(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assertSameRealPath(parsed.data.cwd, tmpDir);
    assert.equal(parsed.data.recentFiles.length, 1);
    assert.equal(parsed.data.recentFiles[0].path, 'alpha.md');
    assert.equal(parsed.error, undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft ls --json prints the v1 success envelope', async () => {
  const output = await captureStdout(async () => {
    await buildCli().parseAsync(['node', 'ft', 'ls', '--json']);
  });
  const parsed = parseJsonOutput(output);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
  assert.ok(Array.isArray(parsed.data));
  assert.ok(parsed.data.some((place: any) => place.name === 'library'));
  assert.equal(parsed.error, undefined);
});

test('ft ls recent --json prints the v1 success envelope', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-ls-recent-'));
  fs.writeFileSync(path.join(tmpDir, 'beta.md'), '# Beta\n');
  const previousCwd = process.cwd();

  try {
    process.chdir(tmpDir);
    const output = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'ls', 'recent', '--limit', '1', '--json']);
    });
    const parsed = parseJsonOutput(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assertSameRealPath(parsed.data.cwd, tmpDir);
    assert.equal(parsed.data.recentFiles.length, 1);
    assert.equal(parsed.data.recentFiles[0].path, 'beta.md');
    assert.equal(parsed.error, undefined);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft ls unknown --json prints the v1 error envelope', async () => {
  process.exitCode = undefined;
  const output = await captureStdout(async () => {
    await buildCli().parseAsync(['node', 'ft', 'ls', 'nope', '--json']);
  });

  try {
    const parsed = parseJsonOutput(output);

    assert.equal(process.exitCode, 1);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error.code, 'UNKNOWN_PLACE');
    assert.match(parsed.error.message, /Unknown Field Theory place: nope/);
    assert.equal(parsed.data, undefined);
  } finally {
    process.exitCode = undefined;
  }
});

test('read-only navigation commands with --json print v1 success envelopes', async () => {
  await withNavigationLibrary(async (env) => {
    const cases: Array<{
      args: string[];
      assertData: (data: any) => void;
    }> = [
      {
        args: ['node', 'ft', 'ls', 'wikis', '--json'],
        assertData: (data) => assert.ok(data.some((entry: any) => entry.relPath === 'wikis/Alpha.md')),
      },
      {
        args: ['node', 'ft', 'ls', 'current', '--json'],
        assertData: (data) => assert.equal(data.activeDocument.title, 'Alpha'),
      },
      {
        args: ['node', 'ft', 'tree', '--limit', '10', '--json'],
        assertData: (data) => assert.ok(data.includes('wikis/Alpha.md')),
      },
      {
        args: ['node', 'ft', 'find', 'Alpha', '--json'],
        assertData: (data) => assert.ok(data.some((entry: any) => entry.relPath === 'wikis/Alpha.md')),
      },
      {
        args: ['node', 'ft', 'grep', 'fieldnote', '--json'],
        assertData: (data) => assert.ok(data.some((entry: any) => entry.snippet.includes('fieldnote'))),
      },
      {
        args: ['node', 'ft', 'cat', 'Alpha', '--json'],
        assertData: (data) => assert.match(data.content, /# Alpha/),
      },
      {
        args: ['node', 'ft', 'head', 'Alpha', '--lines', '5', '--json'],
        assertData: (data) => assert.match(data.content, /# Alpha/),
      },
      {
        args: ['node', 'ft', 'meta', 'Alpha', '--json'],
        assertData: (data) => {
          assert.equal(data.relPath, 'wikis/Alpha.md');
          assert.equal(data.content, undefined);
        },
      },
      {
        args: ['node', 'ft', 'link', 'Alpha', '--json'],
        assertData: (data) => assert.equal(data.link, '[[Alpha]]'),
      },
      {
        args: ['node', 'ft', 'links', 'Alpha', '--json'],
        assertData: (data) => assert.ok(data.some((link: any) => link.target === 'Beta')),
      },
      {
        args: ['node', 'ft', 'backlinks', 'Alpha', '--json'],
        assertData: (data) => assert.ok(data.some((entry: any) => entry.relPath === 'wikis/Beta.md')),
      },
      {
        args: ['node', 'ft', 'tags', '--json'],
        assertData: (data) => assert.ok(data.some((tag: any) => tag.tag === 'fieldnote')),
      },
      {
        args: ['node', 'ft', 'tagged', 'nav', '--json'],
        assertData: (data) => assert.ok(data.some((entry: any) => entry.relPath === 'wikis/Alpha.md')),
      },
    ];

    for (const { args, assertData } of cases) {
      const output = runSourceCliInChild(args, env);
      let parsed: any;
      try {
        parsed = parseJsonOutput(output.stdout);
      } catch (error) {
        assert.fail(`${args.join(' ')} did not print JSON: ${JSON.stringify(output.stdout.slice(0, 80))}`);
      }

      assert.equal(output.stderr, '', args.join(' '));
      assert.equal(output.status, 0, args.join(' '));
      assert.equal(parsed.ok, true, args.join(' '));
      assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.equal(parsed.error, undefined);
      assertData(parsed.data);
    }
  });
});

test('top-level app open commands with --json print v1 success envelopes', async () => {
  await withNavigationLibrary(async (env) => {
    const cases: Array<{
      args: string[];
      assertData: (data: any) => void;
    }> = [
      {
        args: ['node', 'ft', 'open', '--query', 'Alpha', '--no-launch', '--json'],
        assertData: (data) => {
          assert.equal(data.launched, false);
          assert.match(data.url, /^fieldtheory:\/\/wiki\/open/);
          assert.match(data.url, /Alpha\.md/);
        },
      },
      {
        args: ['node', 'ft', 'panel', 'Alpha', '--json'],
        assertData: (data) => {
          assert.equal(data.launched, false);
          assert.match(data.url, /^http:\/\/127\.0\.0\.1:\d+\/browser-library\.html/);
          assert.match(data.url, /target=%7B%22kind%22%3A%22wiki%22%2C%22path%22%3A%22wikis%2FAlpha\.md%22%7D/);
        },
      },
      {
        args: ['node', 'ft', 'codex', 'panel', 'Alpha', '--json'],
        assertData: (data) => {
          assert.equal(data.launched, false);
          assert.match(data.url, /^http:\/\/127\.0\.0\.1:\d+\/browser-library\.html/);
          assert.match(data.url, /target=%7B%22kind%22%3A%22wiki%22%2C%22path%22%3A%22wikis%2FAlpha\.md%22%7D/);
        },
      },
      {
        args: ['node', 'ft', 'tab', 'Alpha', '--no-launch', '--json'],
        assertData: (data) => {
          assert.equal(data.launched, false);
          assert.match(data.url, /action=tab/);
        },
      },
      {
        args: ['node', 'ft', 'reveal', 'Alpha', '--no-launch', '--json'],
        assertData: (data) => {
          assert.equal(data.launched, false);
          assert.match(data.url, /action=reveal/);
        },
      },
    ];

    for (const { args, assertData } of cases) {
      const output = await runSourceCliInChildAsync(args, env);
      const parsed = parseJsonOutput(output.stdout);

      assert.equal(output.stderr, '', args.join(' '));
      assert.equal(output.status, 0, `${args.join(' ')} stdout=${JSON.stringify(output.stdout)} stderr=${JSON.stringify(output.stderr)}`);
      assert.equal(parsed.ok, true, args.join(' '));
      assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.equal(parsed.error, undefined);
      assertData(parsed.data);
    }
  });
});

test('companion commands with --json print v1 success envelopes', async () => {
  await withNavigationLibrary(async (env) => {
    const cases: Array<{
      args: string[];
      assertData: (data: any) => void;
    }> = [
      {
        args: ['node', 'ft', 'paths', '--json'],
        assertData: (data) => {
          assertSameRealPath(data.canonical.libraryDir, env.FT_LIBRARY_DIR!);
          assertSameRealPath(data.canonical.commandsDir, env.FT_COMMANDS_DIR!);
        },
      },
      {
        args: ['node', 'ft', 'library', 'list', '--json'],
        assertData: (data) => assert.ok(data.some((entry: any) => entry.relPath === 'wikis/Alpha.md')),
      },
      {
        args: ['node', 'ft', 'library', 'search', 'fieldnote', '--json'],
        assertData: (data) => assert.ok(data.some((entry: any) => entry.relPath === 'wikis/Alpha.md')),
      },
      {
        args: ['node', 'ft', 'library', 'show', 'wikis/Alpha.md', '--json'],
        assertData: (data) => assert.match(data.content, /# Alpha/),
      },
      {
        args: ['node', 'ft', 'library', 'create', 'briefs/Gamma.md', '--title', 'Gamma', '--json'],
        assertData: (data) => assert.equal(data.relPath, 'briefs/Gamma.md'),
      },
      {
        args: ['node', 'ft', 'library', 'open', 'wikis/Alpha.md', '--no-launch', '--json'],
        assertData: (data) => {
          assert.equal(data.kind, 'library');
          assert.match(data.url, /^fieldtheory:\/\/wiki\/open/);
        },
      },
      {
        args: ['node', 'ft', 'commands', 'list', '--json'],
        assertData: (data) => assert.ok(data.some((entry: any) => entry.name === 'review')),
      },
      {
        args: ['node', 'ft', 'commands', 'show', 'review', '--json'],
        assertData: (data) => assert.match(data.content, /# review/),
      },
      {
        args: ['node', 'ft', 'commands', 'new', 'build-thing', '--json'],
        assertData: (data) => assert.equal(data.name, 'build-thing'),
      },
      {
        args: ['node', 'ft', 'commands', 'validate', 'build-thing', '--json'],
        assertData: (data) => {
          assert.equal(data.length, 1);
          assert.equal(data[0].ok, true);
        },
      },
      {
        args: ['node', 'ft', 'commands', 'open', 'review', '--json'],
        assertData: (data) => {
          assert.equal(data.kind, 'command');
          assert.match(data.path, /review\.md$/);
        },
      },
      {
        args: ['node', 'ft', 'app', 'url', 'Alpha', '--json'],
        assertData: (data) => {
          assert.equal(data.launched, false);
          assert.match(data.url, /^fieldtheory:\/\/browser-library\/open/);
          assert.match(data.url, /path=wikis%2FAlpha\.md/);
        },
      },
      {
        args: ['node', 'ft', 'app', 'open', 'wikis/Alpha.md', '--kind', 'library', '--no-launch', '--json'],
        assertData: (data) => {
          assert.equal(data.kind, 'library');
          assert.match(data.url, /^fieldtheory:\/\/wiki\/open/);
        },
      },
    ];

    for (const { args, assertData } of cases) {
      const output = await runSourceCliInChildAsync(args, env);
      const parsed = parseJsonOutput(output.stdout);

      assert.equal(output.stderr, '', args.join(' '));
      assert.equal(output.status, 0, `${args.join(' ')} stdout=${JSON.stringify(output.stdout)} stderr=${JSON.stringify(output.stderr)}`);
      assert.equal(parsed.ok, true, args.join(' '));
      assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.equal(parsed.error, undefined);
      assertData(parsed.data);
    }
  });
});

test('top-level write and location commands with --json print v1 success envelopes', async () => {
  await withNavigationLibrary(async (env) => {
    const cases: Array<{
      args: string[];
      assertData: (data: any) => void;
    }> = [
      {
        args: ['node', 'ft', 'new', 'brief', 'Fast Lookup Plan', '--json'],
        assertData: (data) => assert.equal(data.relPath, 'briefs/fast-lookup-plan.md'),
      },
      {
        args: ['node', 'ft', 'append', 'Fast Lookup Plan', '--content', 'next step', '--json'],
        assertData: (data) => assert.equal(data.relPath, 'briefs/fast-lookup-plan.md'),
      },
      {
        args: ['node', 'ft', 'note', 'quick model note', '--json'],
        assertData: (data) => {
          assert.match(data.relPath, /^Scratchpad\/\d{4}-\d{2}-\d{2}\.md$/);
        },
      },
      {
        args: ['node', 'ft', 'rename', 'Fast Lookup Plan', 'Faster Lookup Plan', '--json'],
        assertData: (data) => assert.equal(data.relPath, 'briefs/faster-lookup-plan.md'),
      },
      {
        args: ['node', 'ft', 'cd', 'Faster Lookup Plan', '--json'],
        assertData: (data) => assert.equal(data.current, 'briefs/faster-lookup-plan.md'),
      },
      {
        args: ['node', 'ft', 'back', '--json'],
        assertData: (data) => assert.equal(data.current, 'library'),
      },
    ];

    for (const { args, assertData } of cases) {
      const output = await runSourceCliInChildAsync(args, env);
      const parsed = parseJsonOutput(output.stdout);

      assert.equal(output.stderr, '', args.join(' '));
      assert.equal(output.status, 0, `${args.join(' ')} stdout=${JSON.stringify(output.stdout)} stderr=${JSON.stringify(output.stderr)}`);
      assert.equal(parsed.ok, true, args.join(' '));
      assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.equal(parsed.error, undefined);
      assertData(parsed.data);
    }

    assert.match(
      fs.readFileSync(path.join(env.FT_LIBRARY_DIR!, 'briefs', 'faster-lookup-plan.md'), 'utf-8'),
      /next step/,
    );
  });
});

test('md and possible commands with --json print v1 success envelopes', async () => {
  await withBookmarkIndex(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-md-'));
    const previousLibraryDir = process.env.FT_LIBRARY_DIR;
    const previousPath = process.env.PATH;
    process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
    const fakeBinDir = path.join(tmpDir, 'bin');
    fs.mkdirSync(path.join(process.env.FT_LIBRARY_DIR, 'categories'), { recursive: true });
    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.writeFileSync(path.join(process.env.FT_LIBRARY_DIR, 'index.md'), '# Index\n\n[[categories/learning]]\n');
    fs.writeFileSync(path.join(process.env.FT_LIBRARY_DIR, 'categories', 'learning.md'), '# Learning\n\nNotes about learning.\n');
    const fakeClaude = path.join(fakeBinDir, 'claude');
    fs.writeFileSync(fakeClaude, '#!/bin/sh\nprintf "Synthetic answer\\n\\n## Wiki Updates\\n- [[categories/learning]] refresh\\n"\n');
    fs.chmodSync(fakeClaude, 0o755);
    process.env.PATH = `${fakeBinDir}${path.delimiter}${previousPath ?? ''}`;

    try {
      const askOutput = await captureStdout(async () => {
        await buildCli().parseAsync(['node', 'ft', 'ask', 'learning notes', '--json']);
      });
      const ask = parseJsonOutput(askOutput);
      assert.equal(ask.ok, true);
      assert.equal(ask.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.equal(ask.error, undefined);
      assert.equal(ask.data.answer, 'Synthetic answer');
      assert.equal(ask.data.engine, 'claude');
      assert.deepEqual(ask.data.wikiUpdates, ['[[categories/learning]] refresh']);

      const lintOutput = await captureStdout(async () => {
        await buildCli().parseAsync(['node', 'ft', 'lint', '--json']);
      });
      const lint = parseJsonOutput(lintOutput);
      assert.equal(lint.ok, true);
      assert.equal(lint.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.equal(lint.error, undefined);
      assert.ok(Array.isArray(lint.data.issues));
      assert.equal(typeof lint.data.stats.healthScore, 'number');

      const { createIdeasJob } = await import('../src/ideas-jobs.js');
      const job = createIdeasJob({
        seedId: 'seed-1',
        repos: [tmpDir],
        frameId: 'impact-effort',
        depth: 'quick',
      }, { cwd: tmpDir });
      const jobOutput = await captureStdout(async () => {
        await buildCli().parseAsync(['node', 'ft', 'possible', 'job', job.id, '--json']);
      });
      const parsedJob = parseJsonOutput(jobOutput);
      assert.equal(parsedJob.ok, true);
      assert.equal(parsedJob.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.equal(parsedJob.error, undefined);
      assert.equal(parsedJob.data.id, job.id);
      assert.equal(parsedJob.data.status, 'queued');
    } finally {
      if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
      else process.env.FT_LIBRARY_DIR = previousLibraryDir;
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

test('md commands with --json print v1 error envelopes when bookmark index is missing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-md-empty-'));
  const previousDataDir = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;
  fs.writeFileSync(path.join(tmpDir, 'bookmarks.jsonl'), `${BOOKMARK_FIXTURES.map((fixture) => JSON.stringify(fixture)).join('\n')}\n`);

  try {
    for (const args of [
      ['node', 'ft', 'ask', 'learning notes', '--json'],
      ['node', 'ft', 'lint', '--json'],
    ]) {
      const output = await captureCliParse(args);
      const parsed = parseJsonOutput(output.stdout);

      assert.equal(output.exitCode, 1, args.join(' '));
      assert.equal(parsed.ok, false, args.join(' '));
      assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.equal(parsed.error.code, 'BOOKMARK_INDEX_MISSING');
      assert.match(parsed.error.message, /Search index not built yet/);
      assert.equal(parsed.data, undefined);
    }
  } finally {
    if (previousDataDir === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previousDataDir;
    process.exitCode = undefined;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft ask --json exits with a v1 error envelope when the engine fails', async () => {
  await withBookmarkIndex(async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-md-engine-fail-'));
    const libraryDir = path.join(tmpDir, 'library');
    const fakeBinDir = path.join(tmpDir, 'bin');
    fs.mkdirSync(path.join(libraryDir, 'categories'), { recursive: true });
    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.writeFileSync(path.join(libraryDir, 'index.md'), '# Index\n\n[[categories/learning]]\n');
    fs.writeFileSync(path.join(libraryDir, 'categories', 'learning.md'), '# Learning\n\nNotes about learning.\n');
    const fakeClaude = path.join(fakeBinDir, 'claude');
    fs.writeFileSync(fakeClaude, '#!/bin/sh\nprintf "model exploded\\n" >&2\nexit 7\n');
    fs.chmodSync(fakeClaude, 0o755);

    try {
      const output = await runSourceCliInChildAsync(
        ['node', 'ft', 'ask', 'learning notes', '--json'],
        {
          FT_DATA_DIR: process.env.FT_DATA_DIR,
          FT_LIBRARY_DIR: libraryDir,
          PATH: fakeBinDir,
        },
      );
      const parsed = parseJsonOutput(output.stdout);

      assert.equal(output.status, 1, `stdout=${JSON.stringify(output.stdout)} stderr=${JSON.stringify(output.stderr)}`);
      assert.equal(parsed.ok, false);
      assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.match(parsed.error.message, /claude failed/);
      assert.match(parsed.error.message, /model exploded/);
      assert.equal(parsed.data, undefined);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

test('possible job with --json prints a v1 error envelope when the job is missing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-job-empty-'));
  const previousDataDir = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const output = await captureCliParse(['node', 'ft', 'possible', 'job', 'job-missing', '--json']);
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.exitCode, 1);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error.code, 'JOB_NOT_FOUND');
    assert.match(parsed.error.message, /Job not found: job-missing/);
    assert.equal(parsed.data, undefined);
  } finally {
    if (previousDataDir === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previousDataDir;
    process.exitCode = undefined;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft state --json prints the v1 success envelope', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-state-'));

  try {
    const output = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'state', '--repo', tmpDir, '--no-fetch', '--json']);
    });
    const parsed = parseJsonOutput(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.data.repo, tmpDir);
    assert.match(parsed.data.verdict, /not a repo/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('top-level bookmark commands with --json print v1 success envelopes', async () => {
  await withBookmarkIndex(async () => {
    const cases: Array<{
      args: string[];
      assertData: (data: any) => void;
    }> = [
      {
        args: ['node', 'ft', 'search', 'learning', '--limit', '1', '--json'],
        assertData: (data) => {
          assert.equal(data.length, 1);
          assert.equal(data[0].id, '1');
          assert.ok(data[0].score > 0);
        },
      },
      {
        args: ['node', 'ft', 'list', '--limit', '1', '--json'],
        assertData: (data) => {
          assert.equal(data.length, 1);
          assert.ok(data[0].id);
        },
      },
      {
        args: ['node', 'ft', 'show', '1', '--json'],
        assertData: (data) => {
          assert.equal(data.id, '1');
          assert.equal(data.authorHandle, 'alice');
        },
      },
      {
        args: ['node', 'ft', 'stats', '--json'],
        assertData: (data) => {
          assert.equal(data.totalBookmarks, 2);
        },
      },
      {
        args: ['node', 'ft', 'status', '--json'],
        assertData: (data) => {
          assert.equal(data.bookmarks.bookmarkCount, 2);
          assert.ok(data.paths);
        },
      },
    ];

    for (const { args, assertData } of cases) {
      const output = await captureStdout(async () => {
        await buildCli().parseAsync(args);
      });
      const parsed = parseJsonOutput(output);

      assert.equal(parsed.ok, true, args.join(' '));
      assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.equal(parsed.error, undefined);
      assertData(parsed.data);
    }
  });
});

test('top-level bookmark commands with --json print v1 error envelopes when bookmark data is missing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-bookmarks-empty-'));
  const previousDataDir = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const cases = [
      ['node', 'ft', 'search', 'learning', '--json'],
      ['node', 'ft', 'list', '--json'],
      ['node', 'ft', 'show', 'missing', '--json'],
      ['node', 'ft', 'stats', '--json'],
    ];

    for (const args of cases) {
      const output = await captureCliParse(args);
      const parsed = parseJsonOutput(output.stdout);

      assert.equal(output.stderr, '', args.join(' '));
      assert.equal(output.exitCode, 1, args.join(' '));
      assert.equal(parsed.ok, false, args.join(' '));
      assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.equal(parsed.error.code, 'BOOKMARK_DATA_MISSING');
      assert.match(parsed.error.message, /No bookmarks synced yet/);
      assert.equal(parsed.data, undefined);
    }
  } finally {
    if (previousDataDir === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previousDataDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('top-level bookmark commands with --json print v1 error envelopes when bookmark index is missing', async () => {
  await withBookmarkData(async () => {
    const output = await captureCliParse(['node', 'ft', 'stats', '--json']);
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(output.exitCode, 1);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error.code, 'BOOKMARK_INDEX_MISSING');
    assert.match(parsed.error.message, /Search index not built yet/);
    assert.equal(parsed.data, undefined);
  });
});

test('bookmark detail and folder filters with --json print v1 error envelopes for missing local records', async () => {
  await withBookmarkIndex(async () => {
    const cases = [
      {
        args: ['node', 'ft', 'show', 'missing', '--json'],
        code: 'BOOKMARK_NOT_FOUND',
        message: /Bookmark not found: missing/,
      },
      {
        args: ['node', 'ft', 'list', '--folder', 'Research', '--json'],
        code: 'NO_FOLDER_DATA',
        message: /No folder data in local cache/,
      },
    ];

    for (const { args, code, message } of cases) {
      const output = await captureCliParse(args);
      const parsed = parseJsonOutput(output.stdout);

      assert.equal(output.stderr, '', args.join(' '));
      assert.equal(output.exitCode, 1, args.join(' '));
      assert.equal(parsed.ok, false, args.join(' '));
      assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
      assert.equal(parsed.error.code, code);
      assert.match(parsed.error.message, message);
      assert.equal(parsed.data, undefined);
    }
  });
});

test('commander required-option errors with --json print the v1 error envelope', async () => {
  const output = await captureCliParse(['node', 'ft', 'current', 'update', '--file', 'replacement.md', '--json']);
  const parsed = parseJsonOutput(output.stdout);

  assert.equal(output.stderr, '');
  assert.equal(output.exitCode, 1);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
  assert.match(parsed.error.code, /^commander\./);
  assert.match(parsed.error.message, /required option.*--expected-sha256 <hash>/);
  assert.equal(parsed.data, undefined);
});

test('commander unknown-option errors with --json print the v1 error envelope', async () => {
  const output = await captureCliParse(['node', 'ft', 'current', '--bogus', '--json']);
  const parsed = parseJsonOutput(output.stdout);

  assert.equal(output.stderr, '');
  assert.equal(output.exitCode, 1);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
  assert.match(parsed.error.code, /^commander\./);
  assert.match(parsed.error.message, /unknown option '--bogus'/);
  assert.equal(parsed.data, undefined);
});

test('commander unknown-command errors with --json print the v1 error envelope', async () => {
  const output = await captureCliParse(['node', 'ft', 'not-a-command', '--json']);
  const parsed = parseJsonOutput(output.stdout);

  assert.equal(output.stderr, '');
  assert.equal(output.exitCode, 1);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
  assert.match(parsed.error.code, /^commander\./);
  assert.match(parsed.error.message, /unknown command 'not-a-command'/);
  assert.equal(parsed.data, undefined);
});

test('commander missing-argument errors with --json print the v1 error envelope', async () => {
  const output = await captureCliParse(['node', 'ft', 'cat', '--json']);
  const parsed = parseJsonOutput(output.stdout);

  assert.equal(output.stderr, '');
  assert.equal(output.exitCode, 1);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
  assert.match(parsed.error.code, /^commander\./);
  assert.match(parsed.error.message, /missing required argument 'file'/);
  assert.equal(parsed.data, undefined);
});

test('commander invalid-option-argument errors with --json print the v1 error envelope', async () => {
  const output = await captureCliParse(['node', 'ft', 'recent', '--limit', '0', '--json']);
  const parsed = parseJsonOutput(output.stdout);

  assert.equal(output.stderr, '');
  assert.equal(output.exitCode, 1);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
  assert.match(parsed.error.code, /^commander\./);
  assert.match(parsed.error.message, /option '--limit <n>' argument '0' is invalid/);
  assert.equal(parsed.data, undefined);
});

test('commander treats --json after -- as positional, not json mode', async () => {
  const output = await captureCliParse(['node', 'ft', 'current', '--', '--json']);

  assert.equal(output.stdout, '');
  assert.match(output.stderr, /too many arguments for 'current'/);
  assert.equal(output.exitCode, 1);
});

test('bookmarks aliases forward json commands without reparse errors', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-alias-status-'));

  try {
    const output = runSourceCliInChild(
      ['node', 'ft', 'bookmarks', 'status', '--json'],
      { FT_DATA_DIR: path.join(tmpDir, 'data') },
    );
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(output.status, 0);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.data.bookmarks.bookmarkCount, 0);
    assert.ok(parsed.data.paths);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('bookmarks aliases use parse args instead of ambient process argv', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-alias-programmatic-'));

  try {
    const output = runSourceCliInChild(
      ['node', 'ft', 'bookmarks', 'status', '--json'],
      { FT_DATA_DIR: path.join(tmpDir, 'data') },
      ['node', 'test-runner', 'unrelated', 'ambient', 'args'],
    );
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(output.status, 0);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.data.bookmarks.bookmarkCount, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('bookmarks aliases support commander user-args parsing', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-alias-user-args-'));

  try {
    const output = runSourceCliInChild(
      ['bookmarks', 'status', '--json'],
      { FT_DATA_DIR: path.join(tmpDir, 'data') },
      ['node', 'test-runner', 'unrelated', 'ambient', 'args'],
      { from: 'user' },
    );
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(output.status, 0);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.data.bookmarks.bookmarkCount, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('possible seed aliases forward without reentrant parse errors', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-possible-seed-alias-'));

  try {
    const output = runSourceCliInChild(
      ['node', 'ft', 'possible', 'seed', 'list'],
      { FT_DATA_DIR: path.join(tmpDir, 'data') },
      ['node', 'test-runner', 'unrelated'],
    );

    assert.equal(output.status, 0);
    assert.doesNotMatch(output.stdout, /too many arguments/);
    assert.doesNotMatch(output.stderr, /too many arguments/);
    assert.equal((output.stdout.match(/F i e l d   T h e o r y/g) ?? []).length, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('possible seed aliases preserve user-args positional tails', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-possible-seed-user-args-'));

  try {
    const output = runSourceCliInChild(
      ['possible', 'seed', 'show', 'missing-seed'],
      { FT_DATA_DIR: path.join(tmpDir, 'data') },
      ['node', 'test-runner', 'unrelated'],
      { from: 'user' },
    );

    assert.equal(output.status, 1);
    assert.doesNotMatch(output.stderr, /missing required argument 'id'/);
    assert.doesNotMatch(output.stderr, /too many arguments/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('concurrent parse errors on one command keep independent json mode', async () => {
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  const program = buildCli();

  try {
    const output = await captureOutput(async () => {
      await Promise.all([
        program.parseAsync(['node', 'ft', 'current', '--bogus', '--json']),
        program.parseAsync(['node', 'ft', 'current', '--bogus']),
      ]);
    });

    assert.match(output.stdout, /"ok": false/);
    assert.match(output.stdout, /"code": "commander\.unknownOption"/);
    assert.match(output.stderr, /error: unknown option '--bogus'/);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('commander non-json parse errors keep commander stderr', async () => {
  const output = await captureCliParse(['node', 'ft', 'current', '--bogus']);

  assert.equal(output.stdout, '');
  assert.match(output.stderr, /error: unknown option '--bogus'/);
  assert.equal(output.exitCode, 1);
});

test('legacy text commands with --json use a v1 output envelope', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-path-'));
  const previousDataDir = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const output = await captureOutput(async () => {
      await buildCli().parseAsync(['node', 'ft', 'path', '--json']);
    });
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(parsed.ok, true);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.deepEqual(parsed.data, { output: tmpDir });
  } finally {
    if (previousDataDir === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previousDataDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('legacy text command failures with --json use a v1 error envelope', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-categories-'));
  const previousDataDir = process.env.FT_DATA_DIR;
  const previousExitCode = process.exitCode;
  process.env.FT_DATA_DIR = tmpDir;
  process.exitCode = undefined;

  try {
    const output = await captureOutput(async () => {
      await buildCli().parseAsync(['node', 'ft', 'categories', '--json']);
    });
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(process.exitCode, 1);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error.code, 'COMMAND_FAILED');
    assert.match(parsed.error.message, /No bookmarks synced yet/);
  } finally {
    if (previousDataDir === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previousDataDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('legacy text command failures with stdout details still emit only one JSON envelope', async () => {
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    const output = await captureOutput(async () => {
      await buildCli().parseAsync(['node', 'ft', 'frames', 'show', 'missing-frame', '--json']);
    });
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(process.exitCode, 1);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error.code, 'COMMAND_FAILED');
    assert.match(parsed.error.message, /Unknown frame: missing-frame/);
    assert.doesNotMatch(output.stdout, /F i e l d   T h e o r y/);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('legacy sync failures with stderr details expose the real message in the JSON envelope', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-sync-api-'));
  const previousDataDir = process.env.FT_DATA_DIR;
  const previousExitCode = process.exitCode;
  process.env.FT_DATA_DIR = tmpDir;
  process.exitCode = undefined;

  try {
    const output = await captureOutput(async () => {
      await buildCli().parseAsync(['node', 'ft', 'sync', '--api', '--target-adds', '1', '--json']);
    });
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(process.exitCode, 1);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.equal(parsed.error.code, 'COMMAND_FAILED');
    assert.match(parsed.error.message, /Missing user-context OAuth token/);
    assert.doesNotMatch(parsed.error.message, /Make sure your browser is open/);
    assert.doesNotMatch(output.stdout, /F i e l d   T h e o r y/);
  } finally {
    if (previousDataDir === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previousDataDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('already structured companion commands with --json are not double wrapped', async () => {
  const output = await captureOutput(async () => {
    await buildCli().parseAsync(['node', 'ft', 'paths', '--json']);
  });
  const parsed = parseJsonOutput(output.stdout);

  assert.equal(output.stderr, '');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
  assert.equal(typeof parsed.data.fieldTheoryDir, 'string');
  assert.equal(parsed.data.output, undefined);
});

test('safe-wrapped command errors with --json print the v1 error envelope', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-safe-current-'));
  const previousHome = process.env.HOME;
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousExitCode = process.exitCode;
  process.env.HOME = tmpDir;
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
  process.exitCode = undefined;

  try {
    const output = await captureOutput(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', '--json']);
    });
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(process.exitCode, 1);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.match(parsed.error.message, /No active Field Theory context found/);
    assert.equal(parsed.data, undefined);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('safe-wrapped nested command errors honor parent --json', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-safe-current-update-'));
  const replacementPath = path.join(tmpDir, 'replacement.md');
  const previousHome = process.env.HOME;
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousExitCode = process.exitCode;
  fs.writeFileSync(replacementPath, '# Replacement\n');
  process.env.HOME = tmpDir;
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
  process.exitCode = undefined;

  try {
    const output = await captureOutput(async () => {
      await buildCli().parseAsync([
        'node',
        'ft',
        'current',
        '--json',
        'update',
        '--file',
        replacementPath,
        '--expected-sha256',
        '0'.repeat(64),
      ]);
    });
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(process.exitCode, 1);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.match(parsed.error.message, /No active Field Theory context found/);
    assert.equal(parsed.data, undefined);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('safe-wrapped read-only navigation errors with --json print the v1 error envelope', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-json-safe-cat-'));
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousCommandsDir = process.env.FT_COMMANDS_DIR;
  const previousExitCode = process.exitCode;
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
  process.env.FT_COMMANDS_DIR = path.join(tmpDir, 'library', 'Commands');
  process.exitCode = undefined;

  try {
    const output = await captureOutput(async () => {
      await buildCli().parseAsync(['node', 'ft', 'cat', '__ft_missing_safe_error__', '--json']);
    });
    const parsed = parseJsonOutput(output.stdout);

    assert.equal(output.stderr, '');
    assert.equal(process.exitCode, 1);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.schemaVersion, JSON_CONTRACT_SCHEMA_VERSION);
    assert.match(parsed.error.message, /Field Theory document not found/);
    assert.equal(parsed.data, undefined);
  } finally {
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    if (previousCommandsDir === undefined) delete process.env.FT_COMMANDS_DIR;
    else process.env.FT_COMMANDS_DIR = previousCommandsDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('safe-wrapped non-json command errors keep prose stderr', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-safe-cat-text-'));
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousCommandsDir = process.env.FT_COMMANDS_DIR;
  const previousExitCode = process.exitCode;
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
  process.env.FT_COMMANDS_DIR = path.join(tmpDir, 'library', 'Commands');
  process.exitCode = undefined;

  try {
    const output = await captureOutput(async () => {
      await buildCli().parseAsync(['node', 'ft', 'cat', '__ft_missing_safe_error__']);
    });

    assert.equal(output.stdout, '');
    assert.match(output.stderr, /Error: Field Theory document not found/);
    assert.equal(process.exitCode, 1);
  } finally {
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    if (previousCommandsDir === undefined) delete process.env.FT_COMMANDS_DIR;
    else process.env.FT_COMMANDS_DIR = previousCommandsDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
