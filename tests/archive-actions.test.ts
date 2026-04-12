import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { removeBookmarkFromArchive, removeLikeFromArchive, removeLikesFromArchive } from '../src/archive-actions.js';
import { buildIndex, getBookmarkById } from '../src/bookmarks-db.js';
import { buildLikesIndex, getLikeById } from '../src/likes-db.js';
import { writeJson } from '../src/fs.js';

const BOOKMARK_FIXTURE = {
  id: 'b1',
  tweetId: 'b1',
  url: 'https://x.com/alice/status/b1',
  text: 'Saved bookmark',
  authorHandle: 'alice',
  authorName: 'Alice',
  postedAt: '2026-03-01T00:00:00Z',
  bookmarkedAt: '2026-03-02T00:00:00Z',
  syncedAt: '2026-03-02T00:00:00Z',
  links: [],
  mediaObjects: [],
  tags: [],
  ingestedVia: 'graphql',
};

const LIKE_FIXTURE = {
  id: 'l1',
  tweetId: 'l1',
  url: 'https://x.com/bob/status/l1',
  text: 'Saved like',
  authorHandle: 'bob',
  authorName: 'Bob',
  postedAt: '2026-03-01T00:00:00Z',
  likedAt: '2026-03-03T00:00:00Z',
  syncedAt: '2026-03-03T00:00:00Z',
  links: [],
  mediaObjects: [],
  tags: [],
  ingestedVia: 'graphql',
};

async function withArchiveData(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ft-archive-actions-'));
  process.env.FT_DATA_DIR = dir;
  try {
    await writeFile(path.join(dir, 'bookmarks.jsonl'), `${JSON.stringify(BOOKMARK_FIXTURE)}\n`);
    await writeFile(path.join(dir, 'likes.jsonl'), `${JSON.stringify(LIKE_FIXTURE)}\n`);
    await writeJson(path.join(dir, 'bookmarks-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      totalBookmarks: 1,
    });
    await writeJson(path.join(dir, 'likes-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      totalLikes: 1,
    });
    await buildIndex({ force: true });
    await buildLikesIndex({ force: true });
    await fn(dir);
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
}

test('removeLikeFromArchive deletes the cached like and rebuilds the likes index', async () => {
  await withArchiveData(async () => {
    const result = await removeLikeFromArchive('l1');
    assert.equal(result.removed, true);
    assert.equal(result.totalRemaining, 0);
    assert.equal(await getLikeById('l1'), null);
  });
});

test('removeBookmarkFromArchive deletes the cached bookmark and rebuilds the bookmarks index', async () => {
  await withArchiveData(async () => {
    const result = await removeBookmarkFromArchive('b1');
    assert.equal(result.removed, true);
    assert.equal(result.totalRemaining, 0);
    assert.equal(await getBookmarkById('b1'), null);
  });
});

test('removeBookmarkFromArchive reports a missing local record without corrupting the archive', async () => {
  await withArchiveData(async () => {
    const result = await removeBookmarkFromArchive('missing');
    assert.equal(result.removed, false);
    assert.equal(result.totalRemaining, 1);
    assert.ok(await getBookmarkById('b1'));
  });
});

test('removeLikesFromArchive deletes multiple cached likes and rebuilds the index once', async () => {
  await withArchiveData(async (dir) => {
    const extra = {
      ...LIKE_FIXTURE,
      id: 'l2',
      tweetId: 'l2',
      url: 'https://x.com/bob/status/l2',
      text: 'Second saved like',
    };

    await writeFile(path.join(dir, 'likes.jsonl'), `${JSON.stringify(LIKE_FIXTURE)}\n${JSON.stringify(extra)}\n`);
    await writeJson(path.join(dir, 'likes-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      totalLikes: 2,
    });
    await buildLikesIndex({ force: true });

    const result = await removeLikesFromArchive(['l1', 'l2']);
    assert.deepEqual(result.removedIds.sort(), ['l1', 'l2']);
    assert.equal(result.totalRemaining, 0);
    assert.equal(await getLikeById('l1'), null);
    assert.equal(await getLikeById('l2'), null);
  });
});

test('removeLikesFromArchive treats tweetId matches as removed instead of missing', async () => {
  await withArchiveData(async (dir) => {
    const remapped = {
      ...LIKE_FIXTURE,
      id: 'internal-like-row',
      tweetId: 'tweet-123',
      url: 'https://x.com/bob/status/tweet-123',
    };

    await writeFile(path.join(dir, 'likes.jsonl'), `${JSON.stringify(remapped)}\n`);
    await writeJson(path.join(dir, 'likes-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      totalLikes: 1,
    });
    await buildLikesIndex({ force: true });

    const result = await removeLikesFromArchive(['tweet-123']);
    assert.deepEqual(result.removedIds, ['internal-like-row']);
    assert.deepEqual(result.missingIds, []);
    assert.equal(result.totalRemaining, 0);
  });
});
