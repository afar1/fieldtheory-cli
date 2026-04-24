import test from 'node:test';
import assert from 'node:assert/strict';
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
