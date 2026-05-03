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
  const videoPosterUrl = 'https://pbs.twimg.com/amplify_video_thumb/example.jpg';
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
      { type: 'video', url: videoPosterUrl, videoVariants: [{ url: videoUrl, bitrate: 832000 }] },
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
        videoPosterUrl,
        videoUrl,
      ].sort());
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBookmarkMediaBatch downloads quoted tweet media targets', async () => {
  const quotedPhotoUrl = 'https://pbs.twimg.com/media/quoted-photo.jpg';
  const quotedPosterUrl = 'https://pbs.twimg.com/amplify_video_thumb/quoted.jpg';
  const quotedVideoUrl = 'https://video.twimg.com/ext_tw_video/quoted.mp4';
  const quotedProfileUrl = 'https://pbs.twimg.com/profile_images/456/quoted_normal.jpg';
  const records = [{
    id: '1',
    tweetId: '1',
    url: 'https://x.com/alice/status/1',
    text: 'quoted media test',
    authorHandle: 'alice',
    authorName: 'Alice',
    syncedAt: '2026-04-09T00:00:00.000Z',
    mediaObjects: [],
    quotedTweet: {
      id: '99',
      url: 'https://x.com/bob/status/99',
      text: 'quoted',
      authorHandle: 'bob',
      authorName: 'Bob',
      authorProfileImageUrl: quotedProfileUrl,
      media: [quotedPhotoUrl],
      mediaObjects: [
        { type: 'photo', url: quotedPhotoUrl },
        { type: 'video', url: quotedPosterUrl, videoVariants: [{ url: quotedVideoUrl, bitrate: 832000 }] },
      ],
    },
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
        .map((entry) => ({ tweetId: entry.tweetId, sourceUrl: entry.sourceUrl }))
        .sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));

      assert.deepEqual(downloaded, [
        { tweetId: '99', sourceUrl: quotedPosterUrl },
        { tweetId: '99', sourceUrl: quotedPhotoUrl },
        { tweetId: '99', sourceUrl: quotedProfileUrl.replace('_normal.', '_400x400.') },
        { tweetId: '99', sourceUrl: quotedVideoUrl },
      ]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBookmarkMediaBatch downloads shared profile images only once across bookmarks', async () => {
  const profileUrl = 'https://pbs.twimg.com/profile_images/123/avatar_normal.jpg';
  const fullProfileUrl = profileUrl.replace('_normal.', '_400x400.');
  const records = [
    {
      id: '1',
      tweetId: '1',
      url: 'https://x.com/alice/status/1',
      text: 'first bookmark',
      authorHandle: 'alice',
      authorName: 'Alice',
      authorProfileImageUrl: profileUrl,
      syncedAt: '2026-04-09T00:00:00.000Z',
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
    {
      id: '2',
      tweetId: '2',
      url: 'https://x.com/alice/status/2',
      text: 'second bookmark',
      authorHandle: 'alice',
      authorName: 'Alice',
      authorProfileImageUrl: profileUrl,
      syncedAt: '2026-04-09T00:00:00.000Z',
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
  ];

  let profileGetRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '4', 'content-type': 'image/jpeg' },
      });
    }
    if (url === fullProfileUrl) profileGetRequests += 1;
    return new Response(Uint8Array.from([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  };

  try {
    await withMediaDataDir(records, async () => {
      const manifest = await fetchBookmarkMediaBatch({ limit: 10, maxBytes: 1024 });
      const downloadedProfileEntries = manifest.entries.filter(
        (entry) => entry.status === 'downloaded' && entry.sourceUrl === fullProfileUrl,
      );

      assert.equal(profileGetRequests, 1);
      assert.equal(downloadedProfileEntries.length, 1);
      assert.match(path.basename(downloadedProfileEntries[0].localPath ?? ''), /^[a-f0-9]{16}\.jpg$/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBookmarkMediaBatch deduplicates shared profile image failure within one run', async () => {
  const profileUrl = 'https://pbs.twimg.com/profile_images/123/avatar_normal.jpg';
  const fullProfileUrl = profileUrl.replace('_normal.', '_400x400.');
  const records = [
    {
      id: '1',
      tweetId: '1',
      url: 'https://x.com/alice/status/1',
      text: 'first bookmark',
      authorHandle: 'alice',
      authorName: 'Alice',
      authorProfileImageUrl: profileUrl,
      syncedAt: '2026-04-09T00:00:00.000Z',
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
    {
      id: '2',
      tweetId: '2',
      url: 'https://x.com/alice/status/2',
      text: 'second bookmark',
      authorHandle: 'alice',
      authorName: 'Alice',
      authorProfileImageUrl: profileUrl,
      syncedAt: '2026-04-09T00:00:00.000Z',
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
  ];

  let profileGetRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '4', 'content-type': 'image/jpeg' },
      });
    }
    if (url === fullProfileUrl) {
      profileGetRequests += 1;
      if (profileGetRequests === 1) {
        return new Response(null, { status: 500 });
      }
    }
    return new Response(Uint8Array.from([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  };

  try {
    await withMediaDataDir(records, async () => {
      const manifest = await fetchBookmarkMediaBatch({ limit: 10, maxBytes: 1024 });
      const downloadedProfileEntries = manifest.entries.filter(
        (entry) => entry.status === 'downloaded' && entry.sourceUrl === fullProfileUrl,
      );
      const failedProfileEntries = manifest.entries.filter(
        (entry) => entry.status === 'failed' && entry.sourceUrl === fullProfileUrl,
      );

      assert.equal(profileGetRequests, 1);
      assert.equal(downloadedProfileEntries.length, 0);
      assert.equal(failedProfileEntries.length, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBookmarkMediaBatch retries failed profile image from previous manifest run', async () => {
  const profileUrl = 'https://pbs.twimg.com/profile_images/123/avatar_normal.jpg';
  const fullProfileUrl = profileUrl.replace('_normal.', '_400x400.');
  const records = [{
    id: '1',
    tweetId: '1',
    url: 'https://x.com/alice/status/1',
    text: 'first bookmark',
    authorHandle: 'alice',
    authorName: 'Alice',
    authorProfileImageUrl: profileUrl,
    syncedAt: '2026-04-09T00:00:00.000Z',
    mediaObjects: [],
    links: [],
    tags: [],
    ingestedVia: 'graphql',
  }];

  let profileGetRequests = 0;
  const originalFetch = globalThis.fetch;

  try {
    await withMediaDataDir(records, async () => {
      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? 'GET';
        if (method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'content-length': '4', 'content-type': 'image/jpeg' },
          });
        }
        if (url === fullProfileUrl) profileGetRequests += 1;
        return new Response(null, { status: 500 });
      };

      const firstManifest = await fetchBookmarkMediaBatch({ limit: 10, maxBytes: 1024 });
      assert.equal(
        firstManifest.entries.filter((entry) => entry.status === 'failed' && entry.sourceUrl === fullProfileUrl).length,
        1,
      );

      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = String(input instanceof Request ? input.url : input);
        const method = init?.method ?? 'GET';
        if (method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'content-length': '4', 'content-type': 'image/jpeg' },
          });
        }
        if (url === fullProfileUrl) profileGetRequests += 1;
        return new Response(Uint8Array.from([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        });
      };

      const secondManifest = await fetchBookmarkMediaBatch({ limit: 10, maxBytes: 1024 });
      const downloadedProfileEntries = secondManifest.entries.filter(
        (entry) => entry.status === 'downloaded' && entry.sourceUrl === fullProfileUrl,
      );

      assert.equal(profileGetRequests, 2);
      assert.equal(downloadedProfileEntries.length, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBookmarkMediaBatch reports progress as assets complete', async () => {
  const photoUrl = 'https://pbs.twimg.com/media/progress.jpg';
  const records = [{
    id: '1',
    tweetId: '1',
    url: 'https://x.com/alice/status/1',
    text: 'progress test',
    authorHandle: 'alice',
    authorName: 'Alice',
    syncedAt: '2026-04-09T00:00:00.000Z',
    mediaObjects: [{ type: 'photo', url: photoUrl }],
    links: [],
    tags: [],
    ingestedVia: 'graphql',
  }];

  const progressSnapshots: Array<{ processed: number; downloaded: number; candidateBookmarks: number }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET';
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '4', 'content-type': 'image/jpeg' },
      });
    }
    return new Response(Uint8Array.from([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  };

  try {
    await withMediaDataDir(records, async () => {
      await fetchBookmarkMediaBatch({
        limit: 10,
        maxBytes: 1024,
        onProgress: (progress) => {
          progressSnapshots.push({
            processed: progress.processed,
            downloaded: progress.downloaded,
            candidateBookmarks: progress.candidateBookmarks,
          });
        },
      });
    });

    assert.equal(progressSnapshots[0]?.processed, 0);
    assert.equal(progressSnapshots[0]?.candidateBookmarks, 1);
    assert.equal(progressSnapshots.at(-1)?.processed, 1);
    assert.equal(progressSnapshots.at(-1)?.downloaded, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBookmarkMediaBatch applies limit after filtering out already-downloaded bookmarks', async () => {
  const firstUrl = 'https://pbs.twimg.com/media/first.jpg';
  const secondUrl = 'https://pbs.twimg.com/media/second.jpg';
  const records = [
    {
      id: '1',
      tweetId: '1',
      url: 'https://x.com/alice/status/1',
      text: 'first',
      authorHandle: 'alice',
      authorName: 'Alice',
      syncedAt: '2026-04-09T00:00:00.000Z',
      mediaObjects: [{ type: 'photo', url: firstUrl }],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
    {
      id: '2',
      tweetId: '2',
      url: 'https://x.com/alice/status/2',
      text: 'second',
      authorHandle: 'alice',
      authorName: 'Alice',
      syncedAt: '2026-04-09T00:00:00.000Z',
      mediaObjects: [{ type: 'photo', url: secondUrl }],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
  ];

  const fetchedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '4', 'content-type': 'image/jpeg' },
      });
    }
    fetchedUrls.push(url);
    return new Response(Uint8Array.from([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  };

  try {
    await withMediaDataDir(records, async () => {
      const firstRun = await fetchBookmarkMediaBatch({ limit: 1, maxBytes: 1024 });
      assert.equal(firstRun.downloaded, 1);
      assert.equal(fetchedUrls.at(-1), firstUrl);

      const secondRun = await fetchBookmarkMediaBatch({ limit: 1, maxBytes: 1024 });
      assert.equal(secondRun.downloaded, 1);
      assert.equal(fetchedUrls.at(-1), secondUrl);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBookmarkMediaBatch retries failed non-profile media on later runs', async () => {
  const photoUrl = 'https://pbs.twimg.com/media/retry-photo.jpg';
  const records = [{
    id: '1',
    tweetId: '1',
    url: 'https://x.com/alice/status/1',
    text: 'retry test',
    authorHandle: 'alice',
    authorName: 'Alice',
    syncedAt: '2026-04-09T00:00:00.000Z',
    mediaObjects: [{ type: 'photo', url: photoUrl }],
    links: [],
    tags: [],
    ingestedVia: 'graphql',
  }];

  let getCalls = 0;
  const originalFetch = globalThis.fetch;

  try {
    await withMediaDataDir(records, async () => {
      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const method = init?.method ?? 'GET';
        if (method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'content-length': '4', 'content-type': 'image/jpeg' },
          });
        }
        getCalls += 1;
        return getCalls === 1
          ? new Response(null, { status: 500 })
          : new Response(Uint8Array.from([1, 2, 3, 4]), {
              status: 200,
              headers: { 'content-type': 'image/jpeg' },
            });
      };

      const firstRun = await fetchBookmarkMediaBatch({ maxBytes: 1024 });
      assert.equal(firstRun.failed, 1);
      assert.equal(firstRun.entries.filter((entry) => entry.sourceUrl === photoUrl).length, 1);

      const secondRun = await fetchBookmarkMediaBatch({ maxBytes: 1024 });
      assert.equal(secondRun.downloaded, 1);
      assert.equal(getCalls, 2);
      assert.equal(secondRun.entries.filter((entry) => entry.sourceUrl === photoUrl).length, 1);
      assert.equal(
        secondRun.entries.find((entry) => entry.sourceUrl === photoUrl)?.status,
        'downloaded',
      );
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBookmarkMediaBatch does not retry the same failing asset twice in one run', async () => {
  const sharedPhotoUrl = 'https://pbs.twimg.com/media/shared-failure.jpg';
  const records = [
    {
      id: '1',
      tweetId: '1',
      url: 'https://x.com/alice/status/1',
      text: 'first',
      authorHandle: 'alice',
      authorName: 'Alice',
      syncedAt: '2026-04-09T00:00:00.000Z',
      mediaObjects: [{ type: 'photo', url: sharedPhotoUrl }],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
    {
      id: '2',
      tweetId: '2',
      url: 'https://x.com/bob/status/2',
      text: 'second',
      authorHandle: 'bob',
      authorName: 'Bob',
      syncedAt: '2026-04-09T00:00:00.000Z',
      mediaObjects: [{ type: 'photo', url: sharedPhotoUrl }],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
  ];

  let getCalls = 0;
  const originalFetch = globalThis.fetch;

  try {
    await withMediaDataDir(records, async () => {
      globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const method = init?.method ?? 'GET';
        if (method === 'HEAD') {
          return new Response(null, {
            status: 200,
            headers: { 'content-length': '4', 'content-type': 'image/jpeg' },
          });
        }
        getCalls += 1;
        return new Response(null, { status: 500 });
      };

      const manifest = await fetchBookmarkMediaBatch({ maxBytes: 1024 });
      assert.equal(manifest.failed, 2);
      assert.equal(getCalls, 1);
      assert.equal(manifest.entries.filter((entry) => entry.sourceUrl === sharedPhotoUrl).length, 2);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBookmarkMediaBatch with skipProfileImages skips profile images but downloads post media', async () => {
  const photoUrl = 'https://pbs.twimg.com/media/skip-pfp-photo.jpg';
  const quotedPhotoUrl = 'https://pbs.twimg.com/media/skip-pfp-quoted-photo.jpg';
  const profileUrl = 'https://pbs.twimg.com/profile_images/123/avatar_normal.jpg';
  const quotedProfileUrl = 'https://pbs.twimg.com/profile_images/456/quoted_normal.jpg';
  const records = [{
    id: '1',
    tweetId: '1',
    url: 'https://x.com/alice/status/1',
    text: 'skip pfp test',
    authorHandle: 'alice',
    authorName: 'Alice',
    authorProfileImageUrl: profileUrl,
    syncedAt: '2026-04-09T00:00:00.000Z',
    mediaObjects: [{ type: 'photo', url: photoUrl }],
    quotedTweet: {
      id: '99',
      url: 'https://x.com/bob/status/99',
      text: 'quoted',
      authorHandle: 'bob',
      authorName: 'Bob',
      authorProfileImageUrl: quotedProfileUrl,
      mediaObjects: [{ type: 'photo', url: quotedPhotoUrl }],
    },
    links: [],
    tags: [],
    ingestedVia: 'graphql',
  }];

  const fetchedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: { 'content-length': '4', 'content-type': 'image/jpeg' },
      });
    }
    fetchedUrls.push(url);
    return new Response(Uint8Array.from([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  };

  try {
    await withMediaDataDir(records, async () => {
      const manifest = await fetchBookmarkMediaBatch({ limit: 10, maxBytes: 1024, skipProfileImages: true });

      assert.equal(manifest.entries.filter((e) => e.sourceUrl.includes('/profile_images/')).length, 0);
      assert.ok(!fetchedUrls.some((u) => u.includes('/profile_images/')));

      const downloaded = manifest.entries
        .filter((e) => e.status === 'downloaded')
        .map((e) => e.sourceUrl)
        .sort();
      assert.deepEqual(downloaded, [photoUrl, quotedPhotoUrl].sort());
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchBookmarkMediaBatch with skipProfileImages excludes pfp-only bookmarks from candidates', async () => {
  const profileUrl = 'https://pbs.twimg.com/profile_images/123/pfp-only_normal.jpg';
  const records = [{
    id: '1',
    tweetId: '1',
    url: 'https://x.com/alice/status/1',
    text: 'pfp only bookmark',
    authorHandle: 'alice',
    authorName: 'Alice',
    authorProfileImageUrl: profileUrl,
    syncedAt: '2026-04-09T00:00:00.000Z',
    mediaObjects: [],
    links: [],
    tags: [],
    ingestedVia: 'graphql',
  }];

  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (): Promise<Response> => {
    fetchCalled = true;
    return new Response(Uint8Array.from([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  };

  try {
    await withMediaDataDir(records, async () => {
      const manifest = await fetchBookmarkMediaBatch({ limit: 10, maxBytes: 1024, skipProfileImages: true });
      assert.equal(manifest.downloaded, 0);
      assert.equal(manifest.processed, 0);
      assert.equal(fetchCalled, false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
