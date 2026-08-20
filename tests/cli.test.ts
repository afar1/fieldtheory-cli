import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { compareVersions, runWithSpinner, buildCli, parseCookieOption } from '../src/cli.js';
import { dataDir } from '../src/paths.js';
import { skillWithFrontmatter } from '../src/skill.js';

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

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const origWrite = process.stderr.write;
  process.stderr.write = ((chunk: any, encodingOrCb?: any, cb?: any) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk));
    if (typeof encodingOrCb === 'function') encodingOrCb();
    if (typeof cb === 'function') cb();
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stderr.write = origWrite;
  }

  return chunks.join('');
}

test('showDashboard: prints update notice when cache is newer than local', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-dashboard-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  // Fresh cache file with an absurdly high version — exercises the cache-hit
  // path (no network), and guarantees the notice regardless of local version.
  fs.writeFileSync(path.join(tmpDir, '.update-check'), '99.99.99');

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => { logs.push(args.map(String).join(' ')); };

  try {
    const { showDashboard } = await import('../src/cli.js');
    await showDashboard();
  } finally {
    console.log = origLog;
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const joined = logs.join('\n');
  assert.ok(
    joined.includes('Update available') && joined.includes('99.99.99'),
    `expected update notice mentioning the cached 99.99.99 version; got:\n${joined}`,
  );
});

test('ft wiki: --engine option is registered', () => {
  const program = buildCli();
  const wikiCmd = program.commands.find((c: any) => c.name() === 'wiki');
  assert.ok(wikiCmd, 'wiki command should be registered');
  const opts = wikiCmd.options.map((o: any) => o.long);
  assert.ok(opts.includes('--engine'), `expected --engine among ${opts.join(', ')}`);
});

test('ft search, stats, and status expose --json', () => {
  const program = buildCli();
  for (const name of ['search', 'stats', 'status']) {
    const cmd = program.commands.find((c: any) => c.name() === name);
    assert.ok(cmd, `${name} command should be registered`);
    const opts = cmd.options.map((o: any) => o.long);
    assert.ok(opts.includes('--json'), `expected --json on ft ${name}`);
  }
});

test('ft paths, current, state, recent, navigation aliases, library, commands, app, and install command groups are registered', () => {
  const program = buildCli();
  for (const name of [
    'paths', 'current', 'state', 'recent', 'ls', 'tree', 'find', 'grep', 'cat', 'head',
    'meta', 'open', 'tab', 'reveal', 'pwd', 'context', 'link', 'links', 'backlinks',
    'tags', 'tagged', 'new', 'append', 'note', 'rename', 'cd', 'back',
    'library', 'commands', 'app', 'install',
  ]) {
    assert.ok(program.commands.find((c: any) => c.name() === name), `${name} command should be registered`);
  }
});

test('ft navigation aliases inspect Field Theory library markdown', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-nav-'));
  const origEnv = {
    FT_LIBRARY_DIR: process.env.FT_LIBRARY_DIR,
    FT_COMMANDS_DIR: process.env.FT_COMMANDS_DIR,
  };
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
  process.env.FT_COMMANDS_DIR = path.join(process.env.FT_LIBRARY_DIR, 'Commands');
  fs.mkdirSync(path.join(process.env.FT_LIBRARY_DIR, 'briefs'), { recursive: true });
  fs.mkdirSync(process.env.FT_COMMANDS_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.FT_LIBRARY_DIR, 'briefs', 'Navigation Brief.md'), '# Navigation Brief\n\nFind this routing phrase.\n');
  fs.writeFileSync(path.join(process.env.FT_COMMANDS_DIR, 'review.md'), '# review\n\nUse this when reviewing work.\n\n## Steps\n\n1. Review.\n\n## Guardrails\n\n- Verify.\n');

  try {
    const lsOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'ls', 'briefs']);
    });
    assert.match(lsOutput, /briefs\/Navigation Brief\.md/);

    const findOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'find', 'Navigation']);
    });
    assert.match(findOutput, /Navigation Brief/);

    const commandFindOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'find', 'review', '--limit', '10']);
    });
    assert.match(commandFindOutput, /^review\.md\s+review/m);
    assert.doesNotMatch(commandFindOutput, /Commands\/review\.md/);

    const grepOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'grep', 'routing phrase']);
    });
    assert.match(grepOutput, /routing phrase/);

    const headOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'head', 'briefs/Navigation Brief', '--lines', '1']);
    });
    assert.match(headOutput, /# Navigation Brief\n$/);

    const commandOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'cat', 'review']);
    });
    assert.match(commandOutput, /Use this when reviewing work/);
  } finally {
    for (const [key, value] of Object.entries(origEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft link prints canonical wiki links for commands and library docs', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-link-'));
  const origEnv = {
    FT_LIBRARY_DIR: process.env.FT_LIBRARY_DIR,
    FT_COMMANDS_DIR: process.env.FT_COMMANDS_DIR,
  };
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
  process.env.FT_COMMANDS_DIR = path.join(process.env.FT_LIBRARY_DIR, 'Commands');
  fs.mkdirSync(path.join(process.env.FT_LIBRARY_DIR, 'briefs'), { recursive: true });
  fs.mkdirSync(process.env.FT_COMMANDS_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.FT_LIBRARY_DIR, 'briefs', 'Workflow Brief.md'), '# Workflow Brief\n\nbody\n');
  fs.writeFileSync(path.join(process.env.FT_COMMANDS_DIR, 'save.md'), '# save\n\nUse this when saving work.\n');

  try {
    const commandOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'link', 'save']);
    });
    assert.equal(commandOutput.trim(), '[[save]]');

    const libraryOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'link', 'Workflow Brief']);
    });
    assert.equal(libraryOutput.trim(), '[[Workflow Brief]]');

    const aliasOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'link', 'Workflow Brief', '--alias', 'the workflow brief']);
    });
    assert.equal(aliasOutput.trim(), '[[Workflow Brief|the workflow brief]]');

    const jsonOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'link', 'save', '--json']);
    });
    const parsed = JSON.parse(jsonOutput);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.link, '[[save]]');
    assert.equal(parsed.data.entry.place, 'commands');
  } finally {
    for (const [key, value] of Object.entries(origEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft navigation commands cover links tags writes app targets and location state', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-nav-full-'));
  const origEnv = {
    FT_LIBRARY_DIR: process.env.FT_LIBRARY_DIR,
    FT_COMMANDS_DIR: process.env.FT_COMMANDS_DIR,
    FT_BROWSER_HELPER_STATE_PATH: process.env.FT_BROWSER_HELPER_STATE_PATH,
  };
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
  process.env.FT_COMMANDS_DIR = path.join(process.env.FT_LIBRARY_DIR, 'Commands');
  process.env.FT_BROWSER_HELPER_STATE_PATH = path.join(tmpDir, 'browser-helper.json');
  fs.mkdirSync(path.join(process.env.FT_LIBRARY_DIR, 'wikis'), { recursive: true });
  fs.mkdirSync(process.env.FT_COMMANDS_DIR, { recursive: true });
  fs.writeFileSync(process.env.FT_BROWSER_HELPER_STATE_PATH, JSON.stringify({
    host: '127.0.0.1',
    port: 59971,
    token: 'test-token',
    browserUrl: 'http://127.0.0.1:59971/browser-library.html',
  }));
  fs.writeFileSync(path.join(process.env.FT_LIBRARY_DIR, 'wikis', 'Alpha.md'), [
    '---',
    'tags: [systems, nav]',
    '---',
    '# Alpha',
    '',
    'See [[Beta]] and #fieldnote.',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(process.env.FT_LIBRARY_DIR, 'wikis', 'Beta.md'), '# Beta\n\nBack to [[Alpha]].\n');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;

  try {
    const linksOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'links', 'Alpha']);
    });
    assert.match(linksOutput, /Beta\s+1/);

    const backlinksOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'backlinks', 'Alpha']);
    });
    assert.match(backlinksOutput, /wikis\/Beta\.md/);

    const tagsOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'tags']);
    });
    assert.match(tagsOutput, /systems\s+1/);
    assert.match(tagsOutput, /fieldnote\s+1/);

    const taggedOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'tagged', 'nav']);
    });
    assert.match(taggedOutput, /wikis\/Alpha\.md/);

    const openOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'open', '--query', 'Alpha', '--no-launch']);
    });
    assert.match(openOutput, /fieldtheory:\/\/wiki\/open/);
    assert.match(openOutput, /Alpha\.md/);

    const panelOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'panel', 'Alpha']);
    });
    const panelLine = panelOutput.trim().split('\n').at(-1) ?? '';
    assert.match(panelLine, /http:\/\/127\.0\.0\.1:59971\/browser-library\.html/);
    assert.match(panelLine, /api=http%3A%2F%2F127\.0\.0\.1%3A59971/);
    assert.match(panelLine, /token=test-token/);
    assert.match(panelLine, /target=%7B%22kind%22%3A%22wiki%22%2C%22path%22%3A%22wikis%2FAlpha\.md%22%7D/);

    const panelUrlOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'panel', 'Alpha', '--url']);
    });
    const panelUrlLine = panelUrlOutput.trim().split('\n').at(-1) ?? '';
    assert.match(panelUrlLine, /^http:\/\/127\.0\.0\.1:59971\/browser-library\.html/);
    assert.match(panelUrlLine, /target=%7B%22kind%22%3A%22wiki%22%2C%22path%22%3A%22wikis%2FAlpha\.md%22%7D/);

    const libraryPanelOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'panel']);
    });
    const libraryPanelLine = libraryPanelOutput.trim().split('\n').at(-1) ?? '';
    assert.match(libraryPanelLine, /http:\/\/127\.0\.0\.1:59971\/browser-library\.html/);
    assert.match(libraryPanelLine, /target=%7B%22kind%22%3A%22library%22%7D/);

    const codexPanelOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'codex', 'panel', 'Alpha']);
    });
    const codexPanelLine = codexPanelOutput.trim().split('\n').at(-1) ?? '';
    assert.match(codexPanelLine, /http:\/\/127\.0\.0\.1:59971\/browser-library\.html/);
    assert.match(codexPanelLine, /target=%7B%22kind%22%3A%22wiki%22%2C%22path%22%3A%22wikis%2FAlpha\.md%22%7D/);

    const appUrlOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'app', 'url', 'Alpha']);
    });
    const appUrlLine = appUrlOutput.trim().split('\n').at(-1) ?? '';
    assert.match(appUrlLine, /^fieldtheory:\/\/browser-library\/open/);
    assert.match(appUrlLine, /path=wikis%2FAlpha\.md/);

    const appLibraryUrlOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'app', 'url']);
    });
    const appLibraryUrlLine = appLibraryUrlOutput.trim().split('\n').at(-1) ?? '';
    assert.equal(appLibraryUrlLine, 'fieldtheory://browser-library/open?kind=library');

    const tabOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'tab', 'Alpha', '--no-launch']);
    });
    assert.match(tabOutput, /action=tab/);

    const revealOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'reveal', 'Alpha', '--no-launch']);
    });
    assert.match(revealOutput, /action=reveal/);

    await buildCli().parseAsync(['node', 'ft', 'new', 'brief', 'Fast Lookup Plan']);
    assert.equal(fs.existsSync(path.join(process.env.FT_LIBRARY_DIR, 'briefs', 'fast-lookup-plan.md')), true);

    await buildCli().parseAsync(['node', 'ft', 'append', 'Fast Lookup Plan', '--content', 'next step']);
    assert.match(fs.readFileSync(path.join(process.env.FT_LIBRARY_DIR, 'briefs', 'fast-lookup-plan.md'), 'utf-8'), /next step/);

    await buildCli().parseAsync(['node', 'ft', 'note', 'quick model note']);
    const scratchpadFiles = fs.readdirSync(path.join(process.env.FT_LIBRARY_DIR, 'Scratchpad'));
    assert.equal(scratchpadFiles.length, 1);
    assert.match(fs.readFileSync(path.join(process.env.FT_LIBRARY_DIR, 'Scratchpad', scratchpadFiles[0]), 'utf-8'), /quick model note/);

    await buildCli().parseAsync(['node', 'ft', 'rename', 'Fast Lookup Plan', 'Faster Lookup Plan']);
    assert.equal(fs.existsSync(path.join(process.env.FT_LIBRARY_DIR, 'briefs', 'faster-lookup-plan.md')), true);

    const cdOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'cd', 'Faster Lookup Plan']);
    });
    assert.match(cdOutput, /current: briefs\/faster-lookup-plan\.md/);

    const backOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'back']);
    });
    assert.match(backOutput, /current: library/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(origEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft current exposes flat agent JSON and updates the source document by hash', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-cli-'));
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousExitCode = process.exitCode;
  try {
    const libraryDir = path.join(tmpDir, 'library');
    const sessionDir = path.join(tmpDir, 'session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.mkdirSync(libraryDir, { recursive: true });
    process.env.FT_LIBRARY_DIR = libraryDir;
    const sourcePath = path.join(libraryDir, 'current-body.md');
    const contentPath = path.join(sessionDir, 'active.md');
    const manifestPath = path.join(sessionDir, 'context.json');
    const replacementPath = path.join(tmpDir, 'replacement.md');
    const parentReplacementPath = path.join(tmpDir, 'parent-replacement.md');
    fs.writeFileSync(sourcePath, '# Source Body\n\nprivate source text\n');
    fs.writeFileSync(contentPath, '# Cached Body\n\nprivate cached text\n');
    fs.writeFileSync(replacementPath, '# Updated Body\n');
    fs.writeFileSync(parentReplacementPath, '# Parent Updated Body\n');
    fs.writeFileSync(manifestPath, JSON.stringify({
      updatedAt: '2026-01-02T00:00:00.000Z',
      activeDocument: {
        title: 'Current Body',
        path: sourcePath,
        kind: 'wiki',
        contentMode: 'rendered',
        contentPath,
      },
    }));
    const runCurrent = (...args: string[]) => execFileSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'current', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, FT_LIBRARY_DIR: libraryDir },
      encoding: 'utf-8',
    });

    const fullOutput = runCurrent('--manifest', manifestPath, '--json');
    const fullEnvelope = JSON.parse(fullOutput);
    assert.equal(fullEnvelope.ok, true);
    const full = fullEnvelope.data;
    assert.equal(full.title, 'Current Body');
    assert.equal(fs.realpathSync(full.sourcePath), fs.realpathSync(sourcePath));
    assert.equal(full.editable, true);
    assert.equal(full.activeDocument, undefined);
    assert.match(full.content, /private source text/);

    const summaryOutput = runCurrent('--manifest', manifestPath, '--summary', '--json');
    const summaryEnvelope = JSON.parse(summaryOutput);
    assert.equal(summaryEnvelope.ok, true);
    const summary = summaryEnvelope.data;
    assert.equal(summary.title, 'Current Body');
    assert.equal(summary.content, undefined);

    const contentOutput = runCurrent('--manifest', manifestPath, '--content-only');
    assert.equal(contentOutput, '# Source Body\n\nprivate source text\n');

    const updateOutput = runCurrent(
      'update',
      '--manifest',
      manifestPath,
      '--file',
      replacementPath,
      '--expected-sha256',
      full.version.sha256,
      '--json',
    );
    const updatedEnvelope = JSON.parse(updateOutput);
    assert.equal(updatedEnvelope.ok, true);
    const updated = updatedEnvelope.data;
    assert.equal(fs.readFileSync(sourcePath, 'utf-8'), '# Updated Body\n');
    assert.equal(fs.readFileSync(contentPath, 'utf-8'), '# Cached Body\n\nprivate cached text\n');
    assert.notEqual(updated.version.sha256, full.version.sha256);

    const parentUpdateOutput = runCurrent(
      '--manifest',
      manifestPath,
      '--json',
      'update',
      '--file',
      parentReplacementPath,
      '--expected-sha256',
      updated.version.sha256,
    );
    const parentUpdatedEnvelope = JSON.parse(parentUpdateOutput);
    assert.equal(parentUpdatedEnvelope.ok, true);
    assert.equal(parentUpdatedEnvelope.data.data, undefined);
    assert.equal(fs.readFileSync(sourcePath, 'utf-8'), '# Parent Updated Body\n');
    assert.notEqual(parentUpdatedEnvelope.data.version.sha256, updated.version.sha256);
  } finally {
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft current reports missing context without a stack trace', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-missing-'));
  const previousHome = process.env.HOME;
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousExitCode = process.exitCode;
  process.env.HOME = tmpDir;
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
  try {
    const stderr = await captureStderr(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current']);
    });
    assert.match(stderr, /No active Field Theory context found/);
    assert.doesNotMatch(stderr, /at readCurrentDocument/);
    assert.equal(process.exitCode, 1);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft state prints a read-only repo workflow table', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-state-'));
  try {
    const output = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'state', '--repo', tmpDir, '--no-fetch']);
    });
    assert.match(output, /^FT state/);
    assert.match(output, /FT state/);
    assert.match(output, /In Local App/);
    assert.match(output, /Saved Remotely/);
    assert.match(output, /Folder Name/);
    assert.match(output, /Combined app/);
    assert.match(output, /not inside a Git checkout/);
    assert.match(output, /Verdict: not a repo\./);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft state names the combined app after the mac-app folder when present', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fieldtheory-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: tmpDir, stdio: 'ignore' });
    fs.mkdirSync(path.join(tmpDir, 'mac-app'));

    const output = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'state', '--repo', tmpDir, '--no-fetch']);
    });

    assert.match(output, new RegExp(`${path.basename(tmpDir)}/mac-app`));
    assert.doesNotMatch(output, /\| - \| up to date \| Combined app \|/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft install app command is registered', () => {
  const program = buildCli();
  const installCmd = program.commands.find((c: any) => c.name() === 'install');
  assert.ok(installCmd, 'install command should be registered');
  const appCmd = installCmd.commands.find((c: any) => c.name() === 'app');
  assert.ok(appCmd, 'install app command should be registered');
  const opts = appCmd.options.map((o: any) => o.long);
  assert.ok(opts.includes('--install-dir'));
  assert.ok(opts.includes('--open'));
  assert.ok(opts.includes('--json'));
});

test('ft sync: media is on by default and exposes --no-media', () => {
  const program = buildCli();
  const syncCmd = program.commands.find((c: any) => c.name() === 'sync');
  assert.ok(syncCmd, 'sync command should be registered');

  assert.equal(syncCmd.opts().media, true, 'sync should default to downloading media');

  const mediaOption = syncCmd.options.find((o: any) => o.attributeName() === 'media');
  assert.ok(mediaOption, 'a media option must be registered');
  assert.equal(mediaOption.negate, true, 'the media option must be --no-media (negated)');
  assert.equal(mediaOption.long, '--no-media');
});

test('ft wiki: description mentions engine prerequisite', () => {
  const program = buildCli();
  const wikiCmd = program.commands.find((c: any) => c.name() === 'wiki');
  assert.ok(wikiCmd);
  const desc = wikiCmd.description().toLowerCase();
  assert.ok(desc.includes('claude') && desc.includes('codex'));
});

test('ft path: prints only the data directory', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-path-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const output = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'path']);
    });
    assert.equal(output, `${dataDir()}\n`);
  } finally {
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft paths --json prints canonical roots', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-paths-'));
  const origEnv = {
    FT_DATA_DIR: process.env.FT_DATA_DIR,
    FT_LIBRARY_DIR: process.env.FT_LIBRARY_DIR,
    FT_COMMANDS_DIR: process.env.FT_COMMANDS_DIR,
  };
  process.env.FT_DATA_DIR = path.join(tmpDir, 'bookmarks');
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
  process.env.FT_COMMANDS_DIR = path.join(tmpDir, 'commands');
  fs.mkdirSync(process.env.FT_DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.FT_DATA_DIR, '.update-check'), '0.0.0');

  try {
    const output = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'paths', '--json']);
    });
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.canonical.bookmarksDir, process.env.FT_DATA_DIR);
    assert.equal(parsed.data.canonical.libraryDir, process.env.FT_LIBRARY_DIR);
    assert.equal(parsed.data.canonical.commandsDir, process.env.FT_COMMANDS_DIR);
  } finally {
    for (const [key, value] of Object.entries(origEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft skill show: prints only skill content', async () => {
  const output = await captureStdout(async () => {
    await buildCli().parseAsync(['node', 'ft', 'skill', 'show']);
  });

  assert.equal(output, skillWithFrontmatter());
});

test('compareVersions: equal versions return 0', () => {
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
});

test('compareVersions: newer patch returns positive', () => {
  assert.ok(compareVersions('1.2.4', '1.2.3') > 0);
});

test('compareVersions: older patch returns negative', () => {
  assert.ok(compareVersions('1.2.3', '1.2.4') < 0);
});

test('compareVersions: minor beats patch', () => {
  assert.ok(compareVersions('1.3.0', '1.2.9') > 0);
});

test('compareVersions: major beats minor', () => {
  assert.ok(compareVersions('2.0.0', '1.99.99') > 0);
});

test('compareVersions: handles double-digit segments', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
});

test('parseCookieOption: returns empty when no --cookies passed', () => {
  assert.deepEqual(parseCookieOption(undefined), {});
  assert.deepEqual(parseCookieOption([]), {});
  assert.deepEqual(parseCookieOption('not-an-array'), {});
});

test('parseCookieOption: with only ct0, builds ct0-only header', () => {
  const parsed = parseCookieOption(['abc123']);
  assert.equal(parsed.csrfToken, 'abc123');
  assert.equal(parsed.cookieHeader, 'ct0=abc123');
});

test('parseCookieOption: with ct0 and auth_token, joins both', () => {
  const parsed = parseCookieOption(['abc123', 'auth_xyz']);
  assert.equal(parsed.csrfToken, 'abc123');
  assert.equal(parsed.cookieHeader, 'ct0=abc123; auth_token=auth_xyz');
});

test('parseCookieOption: coerces non-string array elements to strings', () => {
  const parsed = parseCookieOption([42, true]);
  assert.equal(parsed.csrfToken, '42');
  assert.equal(parsed.cookieHeader, 'ct0=42; auth_token=true');
});

test('runWithSpinner: stops spinner after success', async () => {
  let stopped = 0;

  const result = await runWithSpinner(
    { stop: () => { stopped += 1; } },
    async () => 'ok',
  );

  assert.equal(result, 'ok');
  assert.equal(stopped, 1);
});

test('runWithSpinner: stops spinner after error', async () => {
  let stopped = 0;

  await assert.rejects(
    runWithSpinner(
      { stop: () => { stopped += 1; } },
      async () => {
        throw new Error('boom');
      },
    ),
    /boom/,
  );

  assert.equal(stopped, 1);
});
