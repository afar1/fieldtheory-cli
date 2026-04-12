import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import {
  convertLikedTweetToRecord,
  parseLikesResponse,
  mergeLikeRecord,
  mergeLikes,
  syncLikesGraphQL,
} from '../src/graphql-likes.js';
import type { LikeRecord } from '../src/types.js';
import { writeJsonLines } from '../src/fs.js';

const NOW = '2026-03-28T00:00:00.000Z';

function makeLikedTweet(overrides: Record<string, any> = {}) {
  return {
    id_str: '1234567890',
    full_text: 'Hello world, this is a liked tweet!',
    created_at: 'Tue Mar 10 12:00:00 +0000 2026',
    favorite_count: 42,
    retweet_count: 5,
    reply_count: 3,
    quote_count: 1,
    bookmark_count: 7,
    conversation_id_str: '1234567890',
    lang: 'en',
    entities: {
      urls: [
        { expanded_url: 'https://example.com/article', url: 'https://t.co/abc' },
        { expanded_url: 'https://t.co/internal', url: 'https://t.co/def' },
      ],
      ...overrides.entities,
    },
    extended_entities: {
      media: [
        {
          type: 'photo',
          media_url_https: 'https://pbs.twimg.com/media/example.jpg',
          sizes: { large: { w: 1200, h: 800 } },
          ext_alt_text: 'A test image',
        },
      ],
      ...overrides.extended_entities,
    },
    user: {
      screen_name: 'testuser',
      name: 'Test User',
      profile_image_url_https: 'https://pbs.twimg.com/profile_images/9876/photo.jpg',
      description: 'I test things',
      followers_count: 1000,
      friends_count: 200,
      statuses_count: 300,
      location: 'San Francisco',
      verified: true,
      ...overrides.user,
    },
    ...overrides,
  };
}

function makeRecord(overrides: Partial<LikeRecord> = {}): LikeRecord {
  return {
    id: '100',
    tweetId: '100',
    url: 'https://x.com/user/status/100',
    text: 'Test',
    syncedAt: NOW,
    tags: [],
    ingestedVia: 'browser',
    ...overrides,
  };
}

function makeViewerResponse(userId = 'u1') {
  return {
    data: {
      viewer: {
        user_results: {
          result: {
            rest_id: userId,
          },
        },
      },
    },
  };
}

function makeLikesTimelineResponse(tweets: Array<Record<string, any>>, cursor = 'next-cursor') {
  return {
    data: {
      user: {
        result: {
          timeline: {
            timeline: {
              instructions: [
                {
                  entries: [
                    ...tweets.map((tweet, index) => ({
                      entryId: `tweet-${tweet.id_str ?? index}`,
                      sortIndex: String(2041895058709413888n - BigInt(index)),
                      content: {
                        itemContent: {
                          itemType: 'TimelineTweet',
                          tweet_results: {
                            result: tweet,
                          },
                        },
                      },
                    })),
                    {
                      entryId: 'cursor-bottom',
                      sortIndex: '1',
                      content: {
                        cursorType: 'Bottom',
                        value: cursor,
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  };
}

test('convertLikedTweetToRecord: produces a complete record from a full liked tweet', () => {
  const result = convertLikedTweetToRecord(makeLikedTweet(), NOW);
  assert.ok(result);
  assert.equal(result.id, '1234567890');
  assert.equal(result.tweetId, '1234567890');
  assert.equal(result.text, 'Hello world, this is a liked tweet!');
  assert.equal(result.authorHandle, 'testuser');
  assert.equal(result.authorName, 'Test User');
  assert.equal(result.url, 'https://x.com/testuser/status/1234567890');
  assert.equal(result.likedAt, null);
  assert.equal(result.syncedAt, NOW);
});

test('convertLikedTweetToRecord: extracts engagement, media, and links', () => {
  const result = convertLikedTweetToRecord(makeLikedTweet(), NOW)!;
  assert.equal(result.engagement?.likeCount, 42);
  assert.equal(result.media?.[0], 'https://pbs.twimg.com/media/example.jpg');
  assert.equal(result.mediaObjects?.[0].extAltText, 'A test image');
  assert.deepEqual(result.links, ['https://example.com/article']);
});

test('convertLikedTweetToRecord: returns null when tweet id is missing', () => {
  assert.equal(convertLikedTweetToRecord({ full_text: 'hi' }, NOW), null);
});

test('parseLikesResponse: normalizes likes and computes next cursor from last tweet id', () => {
  const response = parseLikesResponse([
    makeLikedTweet({ id_str: '200' }),
    makeLikedTweet({ id_str: '150' }),
  ], NOW);
  assert.equal(response.records.length, 2);
  assert.equal(response.nextCursor, '149');
});

test('mergeLikeRecord: preserves existing likedAt when incoming record is richer but lacks it', () => {
  const existing = makeRecord({ likedAt: '2026-03-01T00:00:00Z', text: 'old' });
  const incoming = makeRecord({
    id: '100',
    tweetId: '100',
    text: 'new',
    authorHandle: 'alice',
    mediaObjects: [{ mediaUrl: 'https://img.test/1.jpg' }],
  });
  const merged = mergeLikeRecord(existing, incoming);
  assert.equal(merged.text, 'new');
  assert.equal(merged.likedAt, '2026-03-01T00:00:00Z');
});

test('mergeLikes: archive semantics keep existing likes absent from the latest page', () => {
  const existing = [
    makeRecord({ id: '1', tweetId: '1', likedAt: '2026-03-02T00:00:00Z' }),
    makeRecord({ id: '2', tweetId: '2', likedAt: '2026-03-01T00:00:00Z' }),
  ];
  const incoming = [
    makeRecord({ id: '1', tweetId: '1', text: 'updated', likedAt: null }),
  ];
  const result = mergeLikes(existing, incoming);
  assert.equal(result.added, 0);
  assert.equal(result.merged.length, 2);
  assert.ok(result.merged.some((record) => record.id === '2'));
  assert.equal(result.merged.find((record) => record.id === '1')?.likedAt, '2026-03-02T00:00:00Z');
});

test('syncLikesGraphQL: preserves previously archived likes absent from latest remote pages', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ft-sync-likes-'));
  process.env.FT_DATA_DIR = tmpDir;
  await writeJsonLines(path.join(tmpDir, 'likes.jsonl'), [
    makeRecord({ id: 'old', tweetId: '50', text: 'older archived like', likedAt: '2026-03-01T00:00:00Z' }),
  ]);

  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify(makeViewerResponse('viewer-1')), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (calls === 2) {
      return new Response(JSON.stringify(
        makeLikesTimelineResponse([makeLikedTweet({ id_str: '200', full_text: 'new like' })]),
      ), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(makeLikesTimelineResponse([], '')), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await syncLikesGraphQL({
      csrfToken: 'ct0-token',
      cookieHeader: 'ct0=ct0-token; auth_token=auth',
      maxPages: 5,
      delayMs: 0,
      stalePageLimit: 1,
    });
    assert.equal(result.added, 1);
    assert.equal(result.totalLikes, 2);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.FT_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  }
});
