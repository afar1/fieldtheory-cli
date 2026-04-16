import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { writeJson } from '../src/fs.js';
import { buildIndex } from '../src/bookmarks-db.js';
import { openDb, saveDb } from '../src/db.js';
import { formatBookmarkStatus, formatBookmarkSummary, getBookmarkStatusView } from '../src/bookmarks-service.js';
import { classificationLockPath, twitterBookmarksIndexPath } from '../src/paths.js';

test('formatBookmarkStatus produces human-readable summary', () => {
  const text = formatBookmarkStatus({
    connected: true,
    bookmarkCount: 99,
    categoriesDone: 12,
    domainsDone: 34,
    classificationJob: { pid: 17169, kind: 'classify-domains', startedAt: '2026-03-28T17:20:00Z', processStartedAt: '2026-03-28T17:19:30Z' },
    lastUpdated: '2026-03-28T17:23:00Z',
    mode: 'Incremental by default (GraphQL + API available)',
    cachePath: '/tmp/x-bookmarks.jsonl',
  });

  assert.match(text, /^Bookmarks/);
  assert.match(text, /bookmarks: 99/);
  assert.match(text, /categories: 12\/99/);
  assert.match(text, /domains: 34\/99/);
  assert.match(text, /classification: running \(classify-domains, pid 17169\)/);
  assert.match(text, /last updated: 2026-03-28T17:23:00Z/);
  assert.match(text, /sync mode: Incremental by default \(GraphQL \+ API available\)/);
  assert.match(text, /cache: \/tmp\/x-bookmarks\.jsonl/);
  assert.doesNotMatch(text, /dataset/);
});

test('formatBookmarkStatus shows never when no lastUpdated', () => {
  const text = formatBookmarkStatus({
    connected: false,
    bookmarkCount: 0,
    categoriesDone: 0,
    domainsDone: 0,
    classificationJob: null,
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
    categoriesDone: 12,
    domainsDone: 34,
    classificationJob: { pid: 17169, kind: 'classify-domains', startedAt: '2026-03-28T17:20:00Z', processStartedAt: '2026-03-28T17:19:30Z' },
    lastUpdated: '2026-03-28T17:23:00Z',
    mode: 'API sync',
    cachePath: '/tmp/x-bookmarks.jsonl',
  });

  assert.match(text, /bookmarks=99/);
  assert.match(text, /categories=12\/99/);
  assert.match(text, /domains=34\/99/);
  assert.match(text, /classification=classify-domains:17169/);
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
    assert.equal(view.lastUpdated, '2026-04-05T12:34:56Z');
    assert.equal(view.connected, false);
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('getBookmarkStatusView includes classification progress and live lock info', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ft-status-view-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    await writeFile(
      path.join(tmpDir, 'bookmarks.jsonl'),
      [
        JSON.stringify({
          id: '1',
          tweetId: '1',
          url: 'https://x.com/alice/status/1',
          text: 'Machine learning is transforming healthcare',
          authorHandle: 'alice',
          authorName: 'Alice Smith',
          syncedAt: '2026-04-05T10:00:00Z',
          postedAt: '2026-04-01T12:00:00Z',
          links: [],
          mediaObjects: [],
          tags: [],
          ingestedVia: 'graphql',
        }),
        JSON.stringify({
          id: '2',
          tweetId: '2',
          url: 'https://x.com/bob/status/2',
          text: 'Rust is a great systems programming language',
          authorHandle: 'bob',
          authorName: 'Bob Jones',
          syncedAt: '2026-04-05T10:00:00Z',
          postedAt: '2026-04-02T12:00:00Z',
          links: [],
          mediaObjects: [],
          tags: [],
          ingestedVia: 'graphql',
        }),
        '',
      ].join('\n'),
      'utf8',
    );

    await buildIndex();

    const dbPath = twitterBookmarksIndexPath();
    const db = await openDb(dbPath);
    try {
      db.run(
        `UPDATE bookmarks
         SET categories = ?, primary_category = ?, domains = ?, primary_domain = ?
         WHERE id = ?`,
        ['tool', 'tool', 'ai', 'ai', '1'],
      );
      saveDb(db, dbPath);
    } finally {
      db.close();
    }

    await writeJson(classificationLockPath(), {
      pid: process.pid,
      kind: 'classify',
      startedAt: '2026-04-05T12:35:00Z',
      processStartedAt: new Date(Math.floor((Date.now() - (process.uptime() * 1000)) / 1000) * 1000).toISOString(),
    });

    const view = await getBookmarkStatusView();

    assert.equal(view.bookmarkCount, 2);
    assert.equal(view.categoriesDone, 1);
    assert.equal(view.domainsDone, 1);
    assert.equal(view.classificationJob?.pid, process.pid);
    assert.equal(view.classificationJob?.kind, 'classify');
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  }
});
