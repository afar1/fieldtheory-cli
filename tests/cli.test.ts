import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { compareVersions, runWithSpinner, buildCli, parseCookieOption, shouldInferStdinFromStats } from '../src/cli.js';
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

test('ft skill install exposes a non-interactive force option', () => {
  const program = buildCli();
  const skillCmd = program.commands.find((c: any) => c.name() === 'skill');
  assert.ok(skillCmd, 'skill command should be registered');
  const installCmd = skillCmd.commands.find((c: any) => c.name() === 'install');
  assert.ok(installCmd, 'skill install command should be registered');
  const opts = installCmd.options.map((o: any) => o.long);
  assert.ok(opts.includes('--force'), `expected --force among ${opts.join(', ')}`);
  assert.ok(opts.includes('--yes'), `expected --yes among ${opts.join(', ')}`);
});

test('current update infers stdin only from piped or redirected input', () => {
  const stats = (fifo: boolean, file: boolean) => ({
    isFIFO: () => fifo,
    isFile: () => file,
  });

  assert.equal(shouldInferStdinFromStats(stats(true, false)), true);
  assert.equal(shouldInferStdinFromStats(stats(false, true)), true);
  assert.equal(shouldInferStdinFromStats(stats(false, false)), false);
});

test('ft current update rejects document content passed as arguments with recovery guidance', async () => {
  const previousExitCode = process.exitCode;
  try {
    const stderr = await captureStderr(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', 'update', '## Heading', 'body text']);
    });

    assert.match(stderr, /does not accept document content as command arguments/);
    assert.match(stderr, /Pipe the complete edited Markdown to stdin/);
    assert.match(stderr, /ft current update --stdin --expected-sha256 <version\.sha256>/);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
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
    assert.equal(parsed.link, '[[save]]');
    assert.equal(parsed.entry.place, 'commands');
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
    panelUrl: 'http://127.0.0.1:59971/panel',
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
    assert.match(panelLine, /http:\/\/127\.0\.0\.1:59971\/panel/);
    assert.doesNotMatch(panelLine, /api=http%3A%2F%2F127\.0\.0\.1%3A59971/);
    assert.doesNotMatch(panelLine, /token=test-token/);
    assert.match(panelLine, /target=%7B%22kind%22%3A%22wiki%22%2C%22path%22%3A%22wikis%2FAlpha\.md%22%7D/);

    const panelUrlOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'panel', 'Alpha', '--url']);
    });
    const panelUrlLine = panelUrlOutput.trim().split('\n').at(-1) ?? '';
    assert.match(panelUrlLine, /^http:\/\/127\.0\.0\.1:59971\/panel/);
    assert.match(panelUrlLine, /target=%7B%22kind%22%3A%22wiki%22%2C%22path%22%3A%22wikis%2FAlpha\.md%22%7D/);

    const libraryPanelOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'panel']);
    });
    const libraryPanelLine = libraryPanelOutput.trim().split('\n').at(-1) ?? '';
    assert.match(libraryPanelLine, /http:\/\/127\.0\.0\.1:59971\/panel/);
    assert.match(libraryPanelLine, /target=%7B%22kind%22%3A%22library%22%7D/);

    const codexPanelOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'codex', 'panel', 'Alpha']);
    });
    const codexPanelLine = codexPanelOutput.trim().split('\n').at(-1) ?? '';
    assert.match(codexPanelLine, /http:\/\/127\.0\.0\.1:59971\/panel/);
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

test('ft current includes document content in model-facing JSON by default', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-cli-'));
  const previousExitCode = process.exitCode;
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  try {
    const libraryDir = path.join(tmpDir, 'library');
    process.env.FT_LIBRARY_DIR = libraryDir;
    const sourcePath = path.join(libraryDir, 'current-body.md');
    const sessionDir = path.join(tmpDir, 'session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.mkdirSync(libraryDir, { recursive: true });
    const contentPath = path.join(sessionDir, 'active.md');
    const manifestPath = path.join(sessionDir, 'context.json');
    fs.writeFileSync(sourcePath, '# Current Body\n\nprivate working text\n');
    fs.writeFileSync(contentPath, '# stale rendered copy\n');
    fs.writeFileSync(manifestPath, JSON.stringify({
      updatedAt: '2026-01-02T00:00:00.000Z',
      activeDocument: {
        title: 'Current Body',
        path: sourcePath,
        kind: 'wiki',
        contentMode: 'rendered',
        contentPath,
        lineMapping: {
          activeLineKind: 'renderedVisual',
          contentMode: 'rendered',
          visibleRowsOnly: true,
          lines: [{
            visibleLine: 27,
            sourceLine: 22,
            rowInSourceLine: 1,
            rowsInSourceLine: 2,
            text: 'visible row text',
          }],
        },
      },
    }));

    const summaryOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', '--manifest', manifestPath, '--json']);
    });
    const summary = JSON.parse(summaryOutput);
    assert.equal(summaryOutput.trimStart().startsWith('{\n  "title"'), true);
    assert.equal(summary.title, 'Current Body');
    assert.equal(summary.sourcePath, sourcePath);
    assert.equal(summary.editable, true);
    assert.equal(summary.version.sha256.length, 64);
    assert.equal(summary.updateCommand, 'ft current update --stdin --expected-sha256 <sha>');
    assert.match(summary.content, /private working text/);
    assert.equal(summary.content.includes('stale rendered copy'), false);
    assert.equal(summary.activeDocument, undefined);
    assert.equal(summary.documentEdit, undefined);
    assert.equal(summary.contentPath, undefined);
    assert.equal(summary.shellQuotedPath, undefined);
    assert.equal(summary.lineMapping, undefined);
    assert.equal(summary.lineNumbers.activeSurface, 'rendered');
    assert.equal(summary.lineNumbers.activeLineKind, 'renderedVisual');
    assert.equal(summary.lineNumbers.lines[0].visibleLine, 27);
    assert.equal(summary.lineNumbers.lines[0].sourceLine, 22);
    assert.match(summary.lineNumbers.instructions, /Do not derive visible line numbers/);
    assert.equal(summary.manifestPath, undefined);

    const debugOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', '--manifest', manifestPath, '--json', '--debug-paths']);
    });
    assert.equal(JSON.parse(debugOutput).activeDocument.path, sourcePath);

    const contentOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', '--manifest', manifestPath, '--content-only']);
    });
    assert.equal(contentOutput, '# Current Body\n\nprivate working text\n');

    const summaryOnlyOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', '--manifest', manifestPath, '--summary', '--json']);
    });
    assert.equal(JSON.parse(summaryOnlyOutput).content, undefined);

    const legacyIncludeOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', '--manifest', manifestPath, '--include-content', '--json']);
    });
    assert.match(JSON.parse(legacyIncludeOutput).content, /private working text/);
  } finally {
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft current prints the single current-document edit protocol', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-shell-cli-'));
  const previousExitCode = process.exitCode;
  try {
    const sessionDir = path.join(tmpDir, 'session');
    fs.mkdirSync(sessionDir, { recursive: true });
    const contentPath = path.join(sessionDir, 'active.md');
    const manifestPath = path.join(sessionDir, 'context.json');
    fs.writeFileSync(contentPath, '- cameras installed at home\n');
    fs.writeFileSync(manifestPath, JSON.stringify({
      updatedAt: '2026-01-02T00:00:00.000Z',
      activeDocument: {
        title: 'Sunday Jun 14th',
        path: '/library/Sunday Jun 14th.md',
        kind: 'wiki',
        contentMode: 'rendered',
        contentPath,
      },
    }));

    const output = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', '--manifest', manifestPath]);
    });

    assert.match(output, /readCurrentCommand: ft current --json/);
    assert.match(output, /editCurrentCommand: ft current update --stdin --expected-sha256 <sha>/);
    assert.match(output, /editInstructions: Edit the content field as normal Markdown/);
    assert.match(output, /editWarning: Use sourcePath for identity\/debugging only; write edits through updateCommand\./);
    assert.match(output, /source: \/library\/Sunday Jun 14th\.md/);
    assert.doesNotMatch(output, /readSourceCommand/);
    assert.doesNotMatch(output, /cat '\/library\/Sunday Jun 14th\.md'/);
  } finally {
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft current update edits the active Library document without passing its path', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-update-'));
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousExitCode = process.exitCode;
  try {
    const libraryDir = path.join(tmpDir, 'library');
    const sourcePath = path.join(libraryDir, 'scratchpad', 'Sunday Jun 14th.md');
    const sessionDir = path.join(tmpDir, 'session');
    const contentPath = path.join(sessionDir, 'active.md');
    const manifestPath = path.join(sessionDir, 'context.json');
    const initialContent = '[] cameras installed at home\n[] figure out car seats\n';
    const updatedContent = '- cameras installed at home\n- figure out car seats\n';
    const updatePath = path.join(tmpDir, 'updated.md');
    process.env.FT_LIBRARY_DIR = libraryDir;
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sourcePath, initialContent);
    fs.writeFileSync(contentPath, initialContent);
    fs.writeFileSync(updatePath, updatedContent);
    const emptyUpdatePath = path.join(tmpDir, 'empty.md');
    fs.writeFileSync(emptyUpdatePath, '');
    fs.writeFileSync(manifestPath, JSON.stringify({
      updatedAt: '2026-01-02T00:00:00.000Z',
      activeDocument: {
        title: 'Sunday Jun 14th',
        path: sourcePath,
        kind: 'wiki',
        contentMode: 'rendered',
        contentPath,
      },
    }));

    const noHashStderr = await captureStderr(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', 'update', '--manifest', manifestPath, '--file', updatePath]);
    });
    assert.match(noHashStderr, /Refusing to overwrite without --expected-sha256 or --force/);
    assert.equal(process.exitCode, 1);
    assert.equal(fs.readFileSync(sourcePath, 'utf-8'), initialContent);
    process.exitCode = previousExitCode;

    const readOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', '--manifest', manifestPath, '--json']);
    });
    const current = JSON.parse(readOutput);
    assert.equal(current.content, initialContent);
    assert.equal(current.version.sha256.length, 64);

    const emptyStderr = await captureStderr(async () => {
      await buildCli().parseAsync([
        'node',
        'ft',
        'current',
        'update',
        '--manifest',
        manifestPath,
        '--file',
        emptyUpdatePath,
        '--expected-sha256',
        current.version.sha256,
      ]);
    });
    assert.match(emptyStderr, /Refusing to overwrite with empty content/);
    assert.equal(process.exitCode, 1);
    assert.equal(fs.readFileSync(sourcePath, 'utf-8'), initialContent);
    process.exitCode = previousExitCode;

    const output = await captureStdout(async () => {
      await buildCli().parseAsync([
        'node',
        'ft',
        'current',
        'update',
        '--manifest',
        manifestPath,
        '--file',
        updatePath,
        '--expected-sha256',
        current.version.sha256,
        '--json',
      ]);
    });

    assert.equal(fs.readFileSync(sourcePath, 'utf-8'), updatedContent);
    const jsonStart = output.indexOf('{\n  "path"');
    assert.notEqual(jsonStart, -1);
    assert.equal(JSON.parse(output.slice(jsonStart)).path, sourcePath);
  } finally {
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft current update edits an active Field Theory markdown source outside the Library root', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-update-artifact-'));
  const previousHome = process.env.HOME;
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousExitCode = process.exitCode;
  try {
    process.env.HOME = tmpDir;
    const libraryDir = path.join(tmpDir, '.fieldtheory', 'library');
    const sourcePath = path.join(tmpDir, '.fieldtheory', 'librarian', 'artifacts', 'Artifact.md');
    const sessionDir = path.join(tmpDir, 'session');
    const contentPath = path.join(sessionDir, 'active.md');
    const manifestPath = path.join(sessionDir, 'context.json');
    const updatePath = path.join(tmpDir, 'updated.md');
    process.env.FT_LIBRARY_DIR = libraryDir;
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sourcePath, '- [ ] artifact task\n');
    fs.writeFileSync(contentPath, '- stale rendered context\n');
    fs.writeFileSync(updatePath, '- [x] artifact task\n');
    fs.writeFileSync(manifestPath, JSON.stringify({
      activeDocument: {
        title: 'Artifact',
        path: sourcePath,
        kind: 'artifact',
        contentMode: 'rendered',
        contentPath,
      },
    }));

    const readOutput = await captureStdout(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', '--manifest', manifestPath, '--json']);
    });
    const current = JSON.parse(readOutput);
    assert.equal(current.content, '- [ ] artifact task\n');
    assert.equal(current.version.sha256.length, 64);

    const output = await captureStdout(async () => {
      await buildCli().parseAsync([
        'node',
        'ft',
        'current',
        'update',
        '--manifest',
        manifestPath,
        '--file',
        updatePath,
        '--expected-sha256',
        current.version.sha256,
        '--json',
      ]);
    });

    assert.equal(fs.readFileSync(sourcePath, 'utf-8'), '- [x] artifact task\n');
    const jsonStart = output.indexOf('{\n  "path"');
    assert.notEqual(jsonStart, -1);
    assert.equal(JSON.parse(output.slice(jsonStart)).path, sourcePath);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft current update rejects markdown sources outside Field Theory roots', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-update-outside-'));
  const previousHome = process.env.HOME;
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousExitCode = process.exitCode;
  try {
    process.env.HOME = path.join(tmpDir, 'home');
    process.env.FT_LIBRARY_DIR = path.join(process.env.HOME, '.fieldtheory', 'library');
    const sourcePath = path.join(tmpDir, 'outside.md');
    const sessionDir = path.join(tmpDir, 'session');
    const contentPath = path.join(sessionDir, 'active.md');
    const updatePath = path.join(tmpDir, 'updated.md');
    const manifestPath = path.join(sessionDir, 'context.json');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sourcePath, '- [ ] outside task\n');
    fs.writeFileSync(contentPath, '- stale rendered context\n');
    fs.writeFileSync(updatePath, '- [x] outside task\n');
    fs.writeFileSync(manifestPath, JSON.stringify({
      activeDocument: {
        title: 'Outside',
        path: sourcePath,
        kind: 'external',
        contentMode: 'rendered',
        contentPath,
      },
    }));

    const stderr = await captureStderr(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', 'update', '--manifest', manifestPath, '--file', updatePath, '--force']);
    });

    assert.match(stderr, /not an editable Field Theory Markdown file/);
    assert.equal(process.exitCode, 1);
    assert.equal(fs.readFileSync(sourcePath, 'utf-8'), '- [ ] outside task\n');
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft current update rejects Field Theory session cache files as editable sources', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-update-cache-'));
  const previousHome = process.env.HOME;
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousExitCode = process.exitCode;
  try {
    process.env.HOME = path.join(tmpDir, 'home');
    process.env.FT_LIBRARY_DIR = path.join(process.env.HOME, '.fieldtheory', 'library');
    const sessionDir = path.join(process.env.HOME, '.fieldtheory', '.codex-context', 'sessions', 'session');
    const sourcePath = path.join(sessionDir, 'active.md');
    const updatePath = path.join(tmpDir, 'updated.md');
    const manifestPath = path.join(sessionDir, 'context.json');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sourcePath, '- [ ] rendered cache task\n');
    fs.writeFileSync(updatePath, '- [x] rendered cache task\n');
    fs.writeFileSync(manifestPath, JSON.stringify({
      activeDocument: {
        title: 'Cache Copy',
        path: sourcePath,
        kind: 'wiki',
        contentMode: 'rendered',
        contentPath: sourcePath,
      },
    }));

    const stderr = await captureStderr(async () => {
      await buildCli().parseAsync(['node', 'ft', 'current', 'update', '--manifest', manifestPath, '--file', updatePath, '--force']);
    });

    assert.match(stderr, /not an editable Field Theory Markdown file/);
    assert.equal(process.exitCode, 1);
    assert.equal(fs.readFileSync(sourcePath, 'utf-8'), '- [ ] rendered cache task\n');
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    process.exitCode = previousExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ft current update honors explicit expected hashes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-update-guard-'));
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousExitCode = process.exitCode;
  try {
    const libraryDir = path.join(tmpDir, 'library');
    const sourcePath = path.join(libraryDir, 'scratchpad', 'Sunday Jun 14th.md');
    const sessionDir = path.join(tmpDir, 'session');
    const contentPath = path.join(sessionDir, 'active.md');
    const manifestPath = path.join(sessionDir, 'context.json');
    const updatePath = path.join(tmpDir, 'updated.md');
    process.env.FT_LIBRARY_DIR = libraryDir;
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sourcePath, 'current source\n');
    fs.writeFileSync(contentPath, 'rendered context may differ\n');
    fs.writeFileSync(updatePath, 'agent update\n');
    fs.writeFileSync(manifestPath, JSON.stringify({
      activeDocument: {
        title: 'Sunday Jun 14th',
        path: sourcePath,
        kind: 'wiki',
        contentMode: 'rendered',
        contentPath,
      },
    }));

    const stderr = await captureStderr(async () => {
      await buildCli().parseAsync([
        'node',
        'ft',
        'current',
        'update',
        '--manifest',
        manifestPath,
        '--file',
        updatePath,
        '--expected-sha256',
        '0000000000000000000000000000000000000000000000000000000000000000',
      ]);
    });

    assert.match(stderr, /File changed on disk/);
    assert.match(stderr, /To continue editing safely, run ft current --json/);
    assert.match(stderr, /merge the requested change into the returned content/);
    assert.match(stderr, /Use the sha256 printed after each successful update for the next edit/);
    assert.equal(process.exitCode, 1);
    assert.equal(fs.readFileSync(sourcePath, 'utf-8'), 'current source\n');
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
    assert.match(output, /Included In Root/);
    assert.match(output, /In Origin\?/);
    assert.match(output, /Root/);
    assert.match(output, /not a git repo/);
    assert.match(output, /Verdict: not a repo\./);
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
    assert.equal(parsed.canonical.bookmarksDir, process.env.FT_DATA_DIR);
    assert.equal(parsed.canonical.libraryDir, process.env.FT_LIBRARY_DIR);
    assert.equal(parsed.canonical.commandsDir, process.env.FT_COMMANDS_DIR);
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
