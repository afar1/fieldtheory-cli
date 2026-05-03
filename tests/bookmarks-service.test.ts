import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeJson, writeJsonLines } from '../src/fs.js';
import { buildIndex } from '../src/bookmarks-db.js';
import { openDb, saveDb } from '../src/db.js';
import { twitterBookmarksIndexPath } from '../src/paths.js';
import { formatBookmarkStatus, formatBookmarkSummary, getBookmarkStatusView } from '../src/bookmarks-service.js';

test('formatBookmarkStatus produces human-readable summary', () => {
  const text = formatBookmarkStatus({
    connected: true,
    bookmarkCount: 99,
    classificationTotal: 99,
    categoriesDone: 80,
    domainsDone: 65,
    lastUpdated: '2026-03-28T17:23:00Z',
    mode: 'Incremental by default (GraphQL + API available)',
    cachePath: '/tmp/x-bookmarks.jsonl',
  });

  assert.match(text, /^Bookmarks/);
  assert.match(text, /bookmarks: 99/);
  assert.match(text, /categories: 80\/99/);
  assert.match(text, /domains: 65\/99/);
  assert.match(text, /last updated: 2026-03-28T17:23:00Z/);
  assert.match(text, /sync mode: Incremental by default \(GraphQL \+ API available\)/);
  assert.match(text, /cache: \/tmp\/x-bookmarks\.jsonl/);
  assert.doesNotMatch(text, /dataset/);
});

test('formatBookmarkStatus shows never when no lastUpdated', () => {
  const text = formatBookmarkStatus({
    connected: false,
    bookmarkCount: 0,
    classificationTotal: 0,
    categoriesDone: 0,
    domainsDone: 0,
    lastUpdated: null,
    mode: 'Incremental by default (GraphQL)',
    cachePath: '/tmp/x-bookmarks.jsonl',
  });

  assert.match(text, /last updated: never/);
});

test('formatBookmarkSummary produces concise operator-friendly output', () => {
  const text = formatBookmarkSummary({
    connected: true,
    bookmarkCount: 99,
    classificationTotal: 99,
    categoriesDone: 80,
    domainsDone: 65,
    lastUpdated: '2026-03-28T17:23:00Z',
    mode: 'API sync',
    cachePath: '/tmp/x-bookmarks.jsonl',
  });

  assert.match(text, /bookmarks=99/);
  assert.match(text, /categories=80\/99/);
  assert.match(text, /domains=65\/99/);
  assert.match(text, /updated=2026-03-28T17:23:00Z/);
  assert.match(text, /mode="API sync"/);
});

test('getBookmarkStatusView uses the most recent sync timestamp', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ft-status-view-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    await writeJson(path.join(tmpDir, 'bookmarks-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      lastIncrementalSyncAt: '2026-04-05T10:00:00Z',
      lastFullSyncAt: '2026-04-05T12:34:56Z',
      totalBookmarks: 3,
    });

    const view = await getBookmarkStatusView();

    assert.equal(view.bookmarkCount, 3);
    assert.equal(view.classificationTotal, 0);
    assert.equal(view.categoriesDone, 0);
    assert.equal(view.domainsDone, 0);
    assert.equal(view.lastUpdated, '2026-04-05T12:34:56Z');
    assert.equal(view.connected, false);
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('getBookmarkStatusView includes classification progress counts', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ft-status-view-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    await writeJson(path.join(tmpDir, 'bookmarks-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      lastIncrementalSyncAt: '2026-04-05T12:34:56Z',
      totalBookmarks: 3,
    });

    await writeJson(path.join(tmpDir, 'bookmarks-backfill-state.json'), {
      provider: 'twitter',
      lastRunAt: '2026-04-05T12:34:56Z',
      totalRuns: 1,
      totalAdded: 3,
      lastAdded: 3,
      lastSeenIds: ['1', '2', '3'],
      stopReason: 'caught up to newest stored bookmark',
    });

    await writeJsonLines(path.join(tmpDir, 'bookmarks.jsonl'), [
      { id: '1', tweetId: '1', url: 'https://x.com/alice/status/1', text: 'one', syncedAt: '2026-04-05T12:00:00Z', tags: [] },
      { id: '2', tweetId: '2', url: 'https://x.com/bob/status/2', text: 'two', syncedAt: '2026-04-05T12:00:00Z', tags: [] },
      { id: '3', tweetId: '3', url: 'https://x.com/carol/status/3', text: 'three', syncedAt: '2026-04-05T12:00:00Z', tags: [] },
    ]);

    await buildIndex();
    const db = await openDb(twitterBookmarksIndexPath());
    try {
      db.run(
        `UPDATE bookmarks
         SET categories = ?, primary_category = ?, domains = ?, primary_domain = ?
         WHERE id = '1'`,
        ['tool', 'tool', 'ai', 'ai'],
      );
      db.run(
        `UPDATE bookmarks
         SET categories = ?, primary_category = ?
         WHERE id = '2'`,
        ['research', 'research'],
      );
      saveDb(db, twitterBookmarksIndexPath());
    } finally {
      db.close();
    }

    const view = await getBookmarkStatusView();

    assert.equal(view.bookmarkCount, 3);
    assert.equal(view.classificationTotal, 3);
    assert.equal(view.categoriesDone, 2);
    assert.equal(view.domainsDone, 1);
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  }
});
