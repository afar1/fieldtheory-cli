import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeJson, writeJsonLines } from '../src/fs.js';
import { getTwitterLikesStatus, latestLikeSyncAt } from '../src/likes.js';

test('latestLikeSyncAt prefers the latest timestamp', () => {
  const latest = latestLikeSyncAt({
    lastIncrementalSyncAt: '2026-04-05T10:00:00Z',
    lastFullSyncAt: '2026-04-05T12:00:00Z',
  });
  assert.equal(latest, '2026-04-05T12:00:00Z');
});

test('getTwitterLikesStatus falls back to cache and state when metadata is missing', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ft-likes-status-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    await writeJsonLines(path.join(tmpDir, 'likes.jsonl'), [
      { id: '1', tweetId: '1', url: 'https://x.com/alice/status/1', text: 'one', syncedAt: '2026-04-05T12:00:00Z', tags: [] },
      { id: '2', tweetId: '2', url: 'https://x.com/bob/status/2', text: 'two', syncedAt: '2026-04-05T12:00:00Z', tags: [] },
    ]);
    await writeJson(path.join(tmpDir, 'likes-backfill-state.json'), {
      provider: 'twitter',
      lastRunAt: '2026-04-05T12:34:56Z',
      totalRuns: 1,
      totalAdded: 2,
      lastAdded: 2,
      lastSeenIds: ['1', '2'],
      stopReason: 'end of likes',
    });

    const status = await getTwitterLikesStatus();
    assert.equal(status.totalLikes, 2);
    assert.equal(status.lastIncrementalSyncAt, '2026-04-05T12:34:56Z');
    assert.equal(status.cachePath, path.join(tmpDir, 'likes.jsonl'));
    assert.equal(status.metaPath, path.join(tmpDir, 'likes-meta.json'));
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('getTwitterLikesStatus prefers newer state over stale metadata', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ft-likes-status-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    await writeJson(path.join(tmpDir, 'likes-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      lastIncrementalSyncAt: '2026-04-05T10:00:00Z',
      totalLikes: 1,
    });
    await writeJsonLines(path.join(tmpDir, 'likes.jsonl'), [
      { id: '1', tweetId: '1', url: 'https://x.com/alice/status/1', text: 'one', syncedAt: '2026-04-05T12:00:00Z', tags: [] },
      { id: '2', tweetId: '2', url: 'https://x.com/bob/status/2', text: 'two', syncedAt: '2026-04-05T12:00:00Z', tags: [] },
      { id: '3', tweetId: '3', url: 'https://x.com/carol/status/3', text: 'three', syncedAt: '2026-04-05T12:00:00Z', tags: [] },
    ]);
    await writeJson(path.join(tmpDir, 'likes-backfill-state.json'), {
      provider: 'twitter',
      lastRunAt: '2026-04-05T12:34:56Z',
      totalRuns: 2,
      totalAdded: 3,
      lastAdded: 2,
      lastSeenIds: ['1', '2', '3'],
      stopReason: 'no new likes (stale)',
    });

    const status = await getTwitterLikesStatus();
    assert.equal(status.totalLikes, 3);
    assert.equal(status.lastIncrementalSyncAt, '2026-04-05T12:34:56Z');
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  }
});
