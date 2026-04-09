import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildCli, compareVersions, runWithSpinner } from '../src/cli.js';
import { twitterBookmarksCachePath, twitterBookmarksIndexPath } from '../src/paths.js';

const originalDataDir = process.env.FT_DATA_DIR;
const originalLog = console.log;
const originalError = console.error;
const originalStderrWrite = process.stderr.write.bind(process.stderr);

test.after(() => {
  console.log = originalLog;
  console.error = originalError;
  process.stderr.write = originalStderrWrite as typeof process.stderr.write;
  if (originalDataDir) process.env.FT_DATA_DIR = originalDataDir;
  else delete process.env.FT_DATA_DIR;
});

async function setupCliFixture(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'ft-cli-'));
  process.env.FT_DATA_DIR = cwd;
  await mkdir(cwd, { recursive: true });
  await writeFile(twitterBookmarksCachePath(), '\n');
  await writeFile(twitterBookmarksIndexPath(), '');
  return cwd;
}

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

test('ft sync --folders delegates bounded folder sync defaults', async () => {
  await setupCliFixture();
  let captured: any;
  console.log = () => {};
  console.error = () => {};

  const cli = buildCli({
    syncBookmarksGraphQL: async () => ({
      added: 0,
      bookmarkedAtRepaired: 0,
      totalBookmarks: 0,
      bookmarkedAtMissing: 0,
      pages: 0,
      stopReason: 'end of bookmarks',
      cachePath: twitterBookmarksCachePath(),
      statePath: '/tmp/state.json',
    }),
    syncBookmarkFolders: async (options) => {
      captured = options;
      return {
        folderBy: 'domain',
        dryRun: false,
        eligibleLabels: [],
        foldersCreated: 0,
        foldersMatched: 0,
        assignmentsPlanned: 0,
        assignmentsCompleted: 0,
        assignmentsAlreadyPresent: 0,
        assignmentsPending: 0,
        stopReason: 'done',
        overridePath: '/tmp/ops.json',
      };
    },
  });

  await cli.parseAsync(['sync', '--folders'], { from: 'user' });
  assert.equal(captured.dryRun, false);
  assert.equal(captured.maxActions, 500);
  assert.equal(captured.maxMinutes, 15);
  assert.equal(captured.folderBy, 'domain');
});

test('ft sync --folders forwards current browser session flags into folder sync', async () => {
  await setupCliFixture();
  let captured: any;
  console.log = () => {};
  console.error = () => {};

  const cli = buildCli({
    syncBookmarksGraphQL: async () => ({
      added: 0,
      bookmarkedAtRepaired: 0,
      totalBookmarks: 0,
      bookmarkedAtMissing: 0,
      pages: 0,
      stopReason: 'end of bookmarks',
      cachePath: twitterBookmarksCachePath(),
      statePath: '/tmp/state.json',
    }),
    syncBookmarkFolders: async (options) => {
      captured = options;
      return {
        folderBy: 'domain',
        dryRun: false,
        eligibleLabels: [],
        foldersCreated: 0,
        foldersMatched: 0,
        assignmentsPlanned: 0,
        assignmentsCompleted: 0,
        assignmentsAlreadyPresent: 0,
        assignmentsPending: 0,
        stopReason: 'done',
        overridePath: '/tmp/ops.json',
      };
    },
  });

  await cli.parseAsync([
    'sync',
    '--folders',
    '--browser', 'firefox',
    '--cookies', 'csrf-123', 'token-456',
    '--chrome-user-data-dir', '/tmp/chrome-data',
    '--chrome-profile-directory', 'Profile 7',
    '--firefox-profile-dir', '/tmp/firefox-profile',
  ], { from: 'user' });

  assert.equal(captured.browser, 'firefox');
  assert.equal(captured.csrfToken, 'csrf-123');
  assert.equal(captured.cookieHeader, 'ct0=csrf-123; auth_token=token-456');
  assert.equal(captured.chromeUserDataDir, '/tmp/chrome-data');
  assert.equal(captured.chromeProfileDirectory, 'Profile 7');
  assert.equal(captured.firefoxProfileDir, '/tmp/firefox-profile');
});

test('ft sync keeps advanced folder options off the main command surface', () => {
  const cli = buildCli();
  const syncCommand = cli.commands.find((command) => command.name() === 'sync');
  assert.ok(syncCommand);
  const flags = syncCommand.options.map((option) => option.long);
  assert.ok(flags.includes('--folders'));
  assert.ok(!flags.includes('--folder-by'));
  assert.ok(!flags.includes('--min-folder-size'));
  assert.ok(!flags.includes('--include-label'));
  assert.ok(!flags.includes('--exclude-label'));
  assert.ok(!flags.includes('--until-done'));
});

test('ft folders sync --until-done forwards resumable defaults', async () => {
  await setupCliFixture();
  let captured: any;
  console.log = () => {};
  console.error = () => {};

  const cli = buildCli({
    syncBookmarkFolders: async (options) => {
      captured = options;
      return {
        folderBy: 'domain',
        dryRun: false,
        eligibleLabels: [],
        foldersCreated: 0,
        foldersMatched: 0,
        assignmentsPlanned: 0,
        assignmentsCompleted: 0,
        assignmentsAlreadyPresent: 0,
        assignmentsPending: 0,
        stopReason: 'done',
        overridePath: '/tmp/ops.json',
      };
    },
  });

  await cli.parseAsync(['folders', 'sync', '--until-done'], { from: 'user' });
  assert.equal(captured.untilDone, true);
  assert.equal(captured.maxMinutes, 240);
  assert.equal(captured.maxActions, Number.POSITIVE_INFINITY);
});

test('ft folders sync forwards browser and cookie flags', async () => {
  await setupCliFixture();
  let captured: any;
  console.log = () => {};
  console.error = () => {};

  const cli = buildCli({
    syncBookmarkFolders: async (options) => {
      captured = options;
      return {
        folderBy: 'domain',
        dryRun: false,
        eligibleLabels: [],
        foldersCreated: 0,
        foldersMatched: 0,
        assignmentsPlanned: 0,
        assignmentsCompleted: 0,
        assignmentsAlreadyPresent: 0,
        assignmentsPending: 0,
        stopReason: 'done',
        overridePath: '/tmp/ops.json',
      };
    },
  });

  await cli.parseAsync([
    'folders', 'sync',
    '--browser', 'firefox',
    '--cookies', 'csrf-abc',
    '--firefox-profile-dir', '/tmp/firefox',
  ], { from: 'user' });

  assert.equal(captured.browser, 'firefox');
  assert.equal(captured.csrfToken, 'csrf-abc');
  assert.equal(captured.cookieHeader, 'ct0=csrf-abc');
  assert.equal(captured.firefoxProfileDir, '/tmp/firefox');
});

test('ft folders sync attaches live progress reporting for non-dry runs', async () => {
  await setupCliFixture();
  let captured: any;
  console.log = () => {};
  console.error = () => {};
  process.stderr.write = (() => true) as typeof process.stderr.write;

  const cli = buildCli({
    syncBookmarkFolders: async (options) => {
      captured = options;
      options.onProgress?.({
        phase: 'assigning',
        completed: 1,
        total: 10,
        detail: 'AI ← 123',
      });
      return {
        folderBy: 'domain',
        dryRun: false,
        eligibleLabels: [],
        foldersCreated: 0,
        foldersMatched: 0,
        assignmentsPlanned: 10,
        assignmentsCompleted: 1,
        assignmentsAlreadyPresent: 0,
        assignmentsPending: 9,
        stopReason: 'done',
        overridePath: '/tmp/ops.json',
      };
    },
  });

  await cli.parseAsync(['folders', 'sync', '--max-actions', '10'], { from: 'user' });
  assert.equal(typeof captured.onProgress, 'function');
});
