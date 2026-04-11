import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fetchBookmarkMediaBatch } from '../src/bookmark-media.js';

async function withMediaDataDir(records: any[], fn: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-media-test-'));
  await writeFile(path.join(dir, 'bookmarks.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const saved = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    await fn();
  } finally {
    if (saved !== undefined) process.env.FT_DATA_DIR = saved;
    else delete process.env.FT_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('fetchBookmarkMediaBatch downloads post media from GraphQL mediaObjects shape', async () => {
  const photoUrl = 'https://pbs.twimg.com/media/example.jpg';
  const videoUrl = 'https://video.twimg.com/ext_tw_video/example.mp4';
  const profileUrl = 'https://pbs.twimg.com/profile_images/123/avatar_normal.jpg';
  const records = [{
    id: '1',
    tweetId: '1',
    url: 'https://x.com/alice/status/1',
    text: 'media test',
    authorHandle: 'alice',
    authorName: 'Alice',
    authorProfileImageUrl: profileUrl,
    syncedAt: '2026-04-09T00:00:00.000Z',
    mediaObjects: [
      { type: 'photo', url: photoUrl },
      { type: 'video', videoVariants: [{ url: videoUrl, bitrate: 832000 }] },
    ],
    links: [],
    tags: [],
    ingestedVia: 'graphql',
  }];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    const contentType = url.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '4', 'content-type': contentType },
      });
    }
    return new Response(Uint8Array.from([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': contentType },
    });
  };

  try {
    await withMediaDataDir(records, async () => {
      const manifest = await fetchBookmarkMediaBatch({ limit: 10, maxBytes: 1024 });
      const downloaded = manifest.entries
        .filter((entry) => entry.status === 'downloaded')
        .map((entry) => entry.sourceUrl)
        .sort();

      assert.deepEqual(downloaded, [
        photoUrl,
        profileUrl.replace('_normal.', '_400x400.'),
        videoUrl,
      ].sort());
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
