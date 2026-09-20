import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIndex, getBookmarkById, getStats } from '../src/bookmarks-db.js';
import { openDb, saveDb } from '../src/db.js';
import { twitterBookmarksIndexPath } from '../src/paths.js';
import { exportBookmarks } from '../src/md-export.js';
import { pruneUnbookmarked } from '../src/cli.js';
import type { SyncResult } from '../src/graphql-bookmarks.js';

function makeFixtures(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const id = String(1000 + i);
    return {
      id,
      tweetId: id,
      url: `https://x.com/alice/status/${id}`,
      text: `Fixture bookmark number ${i}`,
      authorHandle: 'alice',
      syncedAt: '2026-04-18T00:00:00.000Z',
      postedAt: '2026-04-04T12:00:00.000Z',
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    };
  });
}

function syncResult(overrides: Partial<SyncResult>): SyncResult {
  return {
    added: 0,
    bookmarkedAtRepaired: 0,
    totalBookmarks: 0,
    bookmarkedAtMissing: 0,
    pages: 1,
    stopReason: 'end of bookmarks',
    cachePath: '',
    statePath: '',
    ...overrides,
  };
}

/** Isolated data dir + library dir (FT_LIBRARY_DIR would otherwise win and hit a real library). */
async function withPruneFixture(
  count: number,
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-prune-'));
  await writeFile(path.join(dir, 'bookmarks.jsonl'), makeFixtures(count).map((r) => JSON.stringify(r)).join('\n') + '\n');

  const saved = { data: process.env.FT_DATA_DIR, library: process.env.FT_LIBRARY_DIR };
  process.env.FT_DATA_DIR = dir;
  delete process.env.FT_LIBRARY_DIR;
  const savedLog = console.log;
  const savedError = console.error;
  const savedExitCode = process.exitCode;
  console.log = () => {};
  console.error = () => {};
  try {
    await buildIndex();
    await exportBookmarks({ force: true, onProgress: () => {} });
    await fn(dir);
  } finally {
    console.log = savedLog;
    console.error = savedError;
    process.exitCode = savedExitCode;
    if (saved.data !== undefined) process.env.FT_DATA_DIR = saved.data;
    else delete process.env.FT_DATA_DIR;
    if (saved.library !== undefined) process.env.FT_LIBRARY_DIR = saved.library;
    else delete process.env.FT_LIBRARY_DIR;
  }
}

async function snapshot(dir: string) {
  return {
    jsonl: await readFile(path.join(dir, 'bookmarks.jsonl'), 'utf8'),
    total: (await getStats()).totalBookmarks,
    md: (await readdir(path.join(dir, 'md', 'bookmarks'))).sort(),
    archives: (await readdir(dir)).filter((f) => f.startsWith('pruned-')),
  };
}

test('pruneUnbookmarked: a skipped walk deletes and archives nothing', async () => {
  await withPruneFixture(3, async (dir) => {
    const before = await snapshot(dir);
    await pruneUnbookmarked(
      syncResult({ totalBookmarks: 3, pruneCandidateIds: undefined, pruneSkippedReason: 'the walk stopped early (rate limited)' }),
      { dryRun: false },
    );
    assert.deepEqual(await snapshot(dir), before);
  });
});

test('pruneUnbookmarked: nothing to prune deletes and archives nothing', async () => {
  await withPruneFixture(3, async (dir) => {
    const before = await snapshot(dir);
    await pruneUnbookmarked(syncResult({ totalBookmarks: 3, pruneCandidateIds: [] }), { dryRun: false });
    assert.deepEqual(await snapshot(dir), before);
  });
});

test('pruneUnbookmarked: dry run lists but deletes nothing and writes no archive', async () => {
  await withPruneFixture(3, async (dir) => {
    const before = await snapshot(dir);
    await pruneUnbookmarked(syncResult({ totalBookmarks: 3, pruneCandidateIds: ['1000'] }), { dryRun: true, limitPercent: 0 });
    const after = await snapshot(dir);
    assert.deepEqual(after, before);
    assert.equal(after.archives.length, 0);
  });
});

test('pruneUnbookmarked: over the blast-radius guard it refuses and leaves everything byte-identical', async () => {
  await withPruneFixture(12, async (dir) => {
    const before = await snapshot(dir);
    const ids = makeFixtures(12).slice(0, 11).map((r) => r.id); // 11 of 12, guard is max(10, ceil(1.2)) = 10
    process.exitCode = 0;

    await pruneUnbookmarked(syncResult({ totalBookmarks: 12, pruneCandidateIds: ids }), { dryRun: false });

    assert.deepEqual(await snapshot(dir), before);
    assert.equal(process.exitCode, 1);
  });
});

test('pruneUnbookmarked: a limit below the prune share still refuses', async () => {
  await withPruneFixture(12, async (dir) => {
    const before = await snapshot(dir);
    const ids = makeFixtures(12).slice(0, 11).map((r) => r.id); // 92% of the library
    await pruneUnbookmarked(syncResult({ totalBookmarks: 12, pruneCandidateIds: ids }), { dryRun: false, limitPercent: 50 });
    assert.deepEqual(await snapshot(dir), before);
  });
});

test('pruneUnbookmarked: a raised --prune-limit lets an over-default prune proceed', async () => {
  await withPruneFixture(12, async (dir) => {
    const ids = makeFixtures(12).slice(0, 11).map((r) => r.id);

    await pruneUnbookmarked(syncResult({ totalBookmarks: 12, pruneCandidateIds: ids }), { dryRun: false, limitPercent: 95 });

    const after = await snapshot(dir);
    assert.equal(after.total, 1);
    assert.equal(after.archives.length, 1);
    assert.equal(after.md.length, 1);
  });
});

test('pruneUnbookmarked: --prune-limit 0 disables the guard', async () => {
  await withPruneFixture(12, async (dir) => {
    const ids = makeFixtures(12).slice(0, 11).map((r) => r.id);
    await pruneUnbookmarked(syncResult({ totalBookmarks: 12, pruneCandidateIds: ids }), { dryRun: false, limitPercent: 0 });
    assert.equal((await snapshot(dir)).total, 1);
  });
});

test('pruneUnbookmarked: archives (with classification) before deleting from index, cache and markdown', async () => {
  await withPruneFixture(3, async (dir) => {
    const dbPath = twitterBookmarksIndexPath();
    const db = await openDb(dbPath);
    try {
      db.run(
        `UPDATE bookmarks SET categories = ?, primary_category = ?, domains = ?, primary_domain = ? WHERE id = ?`,
        ['ai,health', 'ai', 'medicine', 'medicine', '1000'],
      );
      saveDb(db, dbPath);
    } finally {
      db.close();
    }

    await pruneUnbookmarked(syncResult({ totalBookmarks: 3, pruneCandidateIds: ['1000'] }), { dryRun: false });

    // Gone from index, cache and markdown export.
    assert.equal(await getBookmarkById('1000'), null);
    assert.notEqual(await getBookmarkById('1001'), null);
    const after = await snapshot(dir);
    assert.equal(after.total, 2);
    assert.equal(after.jsonl.includes('"id":"1000"'), false);
    assert.equal(after.md.length, 2);
    assert.equal(after.md.some((f) => f.includes('number-0')), false);

    // Archived first, with the SQLite-only classification intact.
    assert.equal(after.archives.length, 1);
    const lines = (await readFile(path.join(dir, after.archives[0]), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].id, '1000');
    assert.equal(lines[0].primaryCategory, 'ai');
    assert.deepEqual(lines[0].categories, ['ai', 'health']);
    assert.equal(lines[0].primaryDomain, 'medicine');
  });
});
