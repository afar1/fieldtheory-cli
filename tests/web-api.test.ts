import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeJson, writeJsonLines } from '../src/fs.js';
import { buildIndex } from '../src/bookmarks-db.js';
import { buildLikesIndex } from '../src/likes-db.js';
import { createWebApp } from '../src/web-server.js';

const BOOKMARK_FIXTURES = [
  {
    id: 'bm-1',
    tweetId: '101',
    url: 'https://x.com/alice/status/101',
    text: 'Claude Code makes CLI workflows much faster.',
    authorHandle: 'alice',
    authorName: 'Alice',
    syncedAt: '2026-04-01T00:00:00Z',
    postedAt: '2026-03-31T12:00:00Z',
    bookmarkedAt: '2026-04-01T00:00:00Z',
    links: ['https://example.com/claude-code'],
    tags: [],
    media: [],
    ingestedVia: 'browser',
  },
];

const LIKE_FIXTURES = [
  {
    id: 'lk-1',
    tweetId: '202',
    url: 'https://x.com/bob/status/202',
    text: 'Claude Code and Codex both matter for local agent workflows.',
    authorHandle: 'bob',
    authorName: 'Bob',
    syncedAt: '2026-04-02T00:00:00Z',
    postedAt: '2026-04-01T11:00:00Z',
    likedAt: '2026-04-02T00:00:00Z',
    links: ['https://example.com/agents'],
    tags: [],
    media: [],
    ingestedVia: 'browser',
  },
];

async function withArchiveData(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ft-web-api-'));
  process.env.FT_DATA_DIR = dir;

  try {
    await writeJsonLines(path.join(dir, 'bookmarks.jsonl'), BOOKMARK_FIXTURES);
    await writeJsonLines(path.join(dir, 'likes.jsonl'), LIKE_FIXTURES);
    await writeJson(path.join(dir, 'bookmarks-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      lastIncrementalSyncAt: '2026-04-01T00:00:00Z',
      totalBookmarks: 1,
    });
    await writeJson(path.join(dir, 'likes-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      lastFullSyncAt: '2026-04-02T00:00:00Z',
      totalLikes: 1,
    });
    await buildIndex();
    await buildLikesIndex();
    await fn(dir);
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
}

test('web api status returns bookmark and like summaries', { concurrency: false }, async () => {
  await withArchiveData(async () => {
    const app = await createWebApp();
    const response = await app.request('/api/status');
    assert.equal(response.status, 200);

    const data = await response.json() as any;
    assert.equal(data.bookmarks.total, 1);
    assert.equal(data.likes.total, 1);
  });
});

test('web api lists bookmarks and returns bookmark detail', { concurrency: false }, async () => {
  await withArchiveData(async () => {
    const app = await createWebApp();

    const listResponse = await app.request('/api/bookmarks?limit=2');
    assert.equal(listResponse.status, 200);
    const listData = await listResponse.json() as any;
    assert.equal(listData.total, 1);
    assert.equal(listData.items[0].id, 'bm-1');

    const detailResponse = await app.request('/api/bookmarks/bm-1');
    assert.equal(detailResponse.status, 200);
    const detailData = await detailResponse.json() as any;
    assert.equal(detailData.authorHandle, 'alice');
  });
});

test('web api lists likes with query filters and 404s missing ids', { concurrency: false }, async () => {
  await withArchiveData(async () => {
    const app = await createWebApp();

    const listResponse = await app.request('/api/likes?query=Claude&limit=10');
    assert.equal(listResponse.status, 200);
    const listData = await listResponse.json() as any;
    assert.equal(listData.total, 1);
    assert.equal(listData.items[0].id, 'lk-1');

    const notFound = await app.request('/api/likes/missing');
    assert.equal(notFound.status, 404);
  });
});

test('web api returns empty lists when indexes are missing', { concurrency: false }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ft-web-api-empty-'));
  process.env.FT_DATA_DIR = dir;

  try {
    const app = await createWebApp();
    const response = await app.request('/api/bookmarks?limit=5&offset=bad');
    assert.equal(response.status, 200);

    const data = await response.json() as any;
    assert.equal(data.total, 0);
    assert.deepEqual(data.items, []);
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
});
