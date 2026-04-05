import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getTwitterBookmarksStatus } from '../src/bookmarks.js';

test('getTwitterBookmarksStatus falls back to cache contents when meta file is missing', async () => {
  const homeDir = await mkdtemp(path.join(tmpdir(), 'ft-status-'));
  const previousHome = process.env.HOME;

  process.env.HOME = homeDir;
  try {
    const dataDir = path.join(homeDir, '.ft-bookmarks');
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      path.join(dataDir, 'bookmarks.jsonl'),
      [
        JSON.stringify({
          id: '2',
          tweetId: '2',
          url: 'https://x.com/b/status/2',
          text: 'second',
          syncedAt: '2026-04-05T08:00:00.000Z',
        }),
        JSON.stringify({
          id: '1',
          tweetId: '1',
          url: 'https://x.com/a/status/1',
          text: 'first',
          syncedAt: '2026-04-04T08:00:00.000Z',
        }),
        '',
      ].join('\n'),
      'utf8',
    );

    const status = await getTwitterBookmarksStatus();

    assert.equal(status.totalBookmarks, 2);
    assert.equal(status.lastIncrementalSyncAt, '2026-04-05T08:00:00.000Z');
    assert.match(status.cachePath, /\.ft-bookmarks\/bookmarks\.jsonl$/);
    assert.match(status.metaPath, /\.ft-bookmarks\/bookmarks-meta\.json$/);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
});
