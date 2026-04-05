import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertTweetToRecord,
  parseBookmarksResponse,
  scoreRecord,
  mergeBookmarkRecord,
  mergeRecords,
  formatSyncResult,
} from '../src/graphql-bookmarks.js';
import type { BookmarkRecord } from '../src/types.js';

const NOW = '2026-03-28T00:00:00.000Z';

function makeTweetResult(overrides: Record<string, any> = {}) {
  return {
    rest_id: '1234567890',
    legacy: {
      id_str: '1234567890',
      full_text: 'Hello world, this is a test tweet!',
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
      },
      extended_entities: {
        media: [
          {
            type: 'photo',
            media_url_https: 'https://pbs.twimg.com/media/example.jpg',
            expanded_url: 'https://x.com/user/status/1234567890/photo/1',
            original_info: { width: 1200, height: 800 },
            ext_alt_text: 'A test image',
          },
        ],
      },
      ...overrides.legacy,
    },
    core: {
      user_results: {
        result: {
          rest_id: '9876',
          core: { screen_name: 'testuser', name: 'Test User' },
          avatar: { image_url: 'https://pbs.twimg.com/profile_images/9876/photo.jpg' },
          legacy: {
            description: 'I test things',
            followers_count: 1000,
            friends_count: 200,
            location: 'San Francisco',
            verified: false,
          },
          is_blue_verified: true,
          ...overrides.userResult,
        },
      },
    },
    views: { count: '15000' },
    ...overrides.tweet,
  };
}

function makeGraphQLResponse(tweetResults: any[], bottomCursor?: string) {
  const entries = tweetResults.map((tr, i) => ({
    entryId: `tweet-${i}`,
    content: {
      itemContent: {
        tweet_results: { result: tr },
      },
    },
  }));

  if (bottomCursor !== undefined) {
    entries.push({
      entryId: 'cursor-bottom-123',
      content: { value: bottomCursor } as any,
    });
  }

  return {
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [
            { type: 'TimelineAddEntries', entries },
          ],
        },
      },
    },
  };
}

function makeRecord(overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  return {
    id: '100',
    tweetId: '100',
    url: 'https://x.com/user/status/100',
    text: 'Test',
    syncedAt: NOW,
    tags: [],
    ingestedVia: 'graphql',
    ...overrides,
  };
}

test('convertTweetToRecord: produces a complete record from a full tweet', () => {
  const result = convertTweetToRecord(makeTweetResult(), NOW);
  assert.ok(result, 'Should return a record');

  assert.equal(result.id, '1234567890');
  assert.equal(result.tweetId, '1234567890');
  assert.equal(result.text, 'Hello world, this is a test tweet!');
  assert.equal(result.authorHandle, 'testuser');
  assert.equal(result.authorName, 'Test User');
  assert.equal(result.url, 'https://x.com/testuser/status/1234567890');
  assert.equal(result.syncedAt, NOW);
  assert.equal(result.ingestedVia, 'graphql');
  assert.equal(result.language, 'en');
});

test('convertTweetToRecord: extracts author snapshot with all fields', () => {
  const result = convertTweetToRecord(makeTweetResult(), NOW)!;
  const author = result.author!;

  assert.equal(author.id, '9876');
  assert.equal(author.handle, 'testuser');
  assert.equal(author.name, 'Test User');
  assert.equal(author.profileImageUrl, 'https://pbs.twimg.com/profile_images/9876/photo.jpg');
  assert.equal(author.bio, 'I test things');
  assert.equal(author.followerCount, 1000);
  assert.equal(author.followingCount, 200);
  assert.equal(author.isVerified, true);
  assert.equal(author.location, 'San Francisco');
  assert.equal(author.snapshotAt, NOW);
});

test('convertTweetToRecord: extracts engagement stats', () => {
  const result = convertTweetToRecord(makeTweetResult(), NOW)!;
  const eng = result.engagement!;

  assert.equal(eng.likeCount, 42);
  assert.equal(eng.repostCount, 5);
  assert.equal(eng.replyCount, 3);
  assert.equal(eng.quoteCount, 1);
  assert.equal(eng.bookmarkCount, 7);
  assert.equal(eng.viewCount, 15000);
});

test('convertTweetToRecord: extracts media objects', () => {
  const result = convertTweetToRecord(makeTweetResult(), NOW)!;

  assert.equal(result.media!.length, 1);
  assert.equal(result.media![0], 'https://pbs.twimg.com/media/example.jpg');

  assert.equal(result.mediaObjects!.length, 1);
  assert.equal(result.mediaObjects![0].type, 'photo');
  assert.equal(result.mediaObjects![0].url, 'https://pbs.twimg.com/media/example.jpg');
  assert.equal(result.mediaObjects![0].width, 1200);
  assert.equal(result.mediaObjects![0].altText, 'A test image');
});

test('convertTweetToRecord: video media uses downloader-compatible fields', () => {
  const result = convertTweetToRecord(makeTweetResult({
    legacy: {
      extended_entities: {
        media: [
          {
            type: 'video',
            media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/example.jpg',
            expanded_url: 'https://x.com/user/status/1234567890/video/1',
            original_info: { width: 1280, height: 720 },
            video_info: {
              variants: [
                { content_type: 'application/x-mpegURL', url: 'https://video.example/playlist.m3u8' },
                { content_type: 'video/mp4', bitrate: 320000, url: 'https://video.example/320.mp4' },
                { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.example/832.mp4' },
              ],
            },
          },
        ],
      },
    },
  }), NOW)!;

  assert.equal(result.mediaObjects!.length, 1);
  assert.equal(result.mediaObjects![0].type, 'video');
  assert.equal(result.mediaObjects![0].url, 'https://pbs.twimg.com/ext_tw_video_thumb/example.jpg');
  assert.equal(result.mediaObjects![0].videoVariants?.length, 2);
  assert.equal(result.mediaObjects![0].videoVariants?.[0].contentType, 'video/mp4');
  assert.equal(result.mediaObjects![0].videoVariants?.[1].bitrate, 832000);
});

test('convertTweetToRecord: extracts links, filtering out t.co', () => {
  const result = convertTweetToRecord(makeTweetResult(), NOW)!;

  assert.equal(result.links!.length, 1);
  assert.equal(result.links![0], 'https://example.com/article');
});

test('convertTweetToRecord: handles location as object', () => {
  const tr = makeTweetResult({
    userResult: {
      location: { location: 'New York' },
    },
  });
  const result = convertTweetToRecord(tr, NOW)!;
  assert.equal(result.author!.location, 'New York');
});

test('convertTweetToRecord: returns null when legacy is missing', () => {
  const result = convertTweetToRecord({ rest_id: '123' }, NOW);
  assert.equal(result, null);
});

test('convertTweetToRecord: returns null when no id', () => {
  const result = convertTweetToRecord({ legacy: { full_text: 'hi' } }, NOW);
  assert.equal(result, null);
});

test('convertTweetToRecord: unwraps tweet wrapper (tweetResult.tweet)', () => {
  const inner = makeTweetResult();
  const wrapped = { tweet: inner };
  const result = convertTweetToRecord(wrapped, NOW);
  assert.ok(result);
  assert.equal(result.id, '1234567890');
});

test('convertTweetToRecord: handles tweet with no user results', () => {
  const tr = {
    rest_id: '999',
    legacy: {
      id_str: '999',
      full_text: 'Orphan tweet',
      entities: { urls: [] },
    },
  };
  const result = convertTweetToRecord(tr, NOW);
  assert.ok(result);
  assert.equal(result.id, '999');
  assert.equal(result.author, undefined);
  assert.equal(result.url, 'https://x.com/_/status/999');
});

test('parseBookmarksResponse: parses entries and cursor', () => {
  const tr1 = makeTweetResult();
  const tr2 = makeTweetResult({ legacy: { id_str: '2222222', full_text: 'Second tweet' } });
  const resp = makeGraphQLResponse([tr1, tr2], 'cursor-abc-123');

  const { records, nextCursor } = parseBookmarksResponse(resp, NOW);

  assert.equal(records.length, 2);
  assert.equal(records[0].id, '1234567890');
  assert.equal(nextCursor, 'cursor-abc-123');
});

test('parseBookmarksResponse: returns empty when no instructions', () => {
  const { records, nextCursor } = parseBookmarksResponse({}, NOW);
  assert.equal(records.length, 0);
  assert.equal(nextCursor, undefined);
});

test('parseBookmarksResponse: no cursor when not present', () => {
  const resp = makeGraphQLResponse([makeTweetResult()]);
  const { nextCursor } = parseBookmarksResponse(resp, NOW);
  assert.equal(nextCursor, undefined);
});

test('parseBookmarksResponse: skips entries with no tweet_results', () => {
  const resp = {
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [{
            type: 'TimelineAddEntries',
            entries: [
              { entryId: 'tweet-1', content: {} },
              { entryId: 'tweet-2', content: { itemContent: { tweet_results: { result: makeTweetResult() } } } },
            ],
          }],
        },
      },
    },
  };
  const { records } = parseBookmarksResponse(resp, NOW);
  assert.equal(records.length, 1);
});

test('scoreRecord: minimal record scores 0', () => {
  const record = makeRecord();
  assert.equal(scoreRecord(record), 0);
});

test('scoreRecord: fully enriched record has high score', () => {
  const record = makeRecord({
    postedAt: '2026-01-01',
    authorProfileImageUrl: 'https://example.com/img.jpg',
    author: { handle: 'user' } as any,
    engagement: { likeCount: 5 },
    mediaObjects: [{ type: 'photo' } as any],
    links: ['https://example.com'],
  });
  assert.equal(scoreRecord(record), 15);
});

test('scoreRecord: partial enrichment gives partial score', () => {
  const record = makeRecord({
    postedAt: '2026-01-01',
    engagement: { likeCount: 10 },
  });
  assert.equal(scoreRecord(record), 5);
});

test('mergeBookmarkRecord: returns incoming when no existing', () => {
  const incoming = makeRecord({ text: 'New' });
  const result = mergeBookmarkRecord(undefined, incoming);
  assert.equal(result.text, 'New');
});

test('mergeBookmarkRecord: richer incoming overwrites sparser existing', () => {
  const existing = makeRecord({ text: 'Old', postedAt: null });
  const incoming = makeRecord({
    text: 'New',
    postedAt: '2026-01-01',
    author: { handle: 'user' } as any,
    engagement: { likeCount: 10 },
  });
  const result = mergeBookmarkRecord(existing, incoming);
  assert.equal(result.text, 'New');
  assert.equal(result.postedAt, '2026-01-01');
  assert.ok(result.author);
});

test('mergeBookmarkRecord: sparser incoming does not clobber richer existing', () => {
  const existing = makeRecord({
    text: 'Rich',
    postedAt: '2026-01-01',
    author: { handle: 'user' } as any,
    engagement: { likeCount: 10 },
    mediaObjects: [{ type: 'photo' } as any],
    links: ['https://example.com'],
  });
  const incoming = makeRecord({ text: 'Sparse' });
  const result = mergeBookmarkRecord(existing, incoming);
  assert.equal(result.text, 'Rich');
  assert.ok(result.author);
});

test('mergeBookmarkRecord: equal scores prefer incoming (>=)', () => {
  const existing = makeRecord({ text: 'Old', postedAt: '2026-01-01' });
  const incoming = makeRecord({ text: 'New', postedAt: '2026-02-01' });
  const result = mergeBookmarkRecord(existing, incoming);
  assert.equal(result.text, 'New');
  assert.equal(result.postedAt, '2026-02-01');
});

test('mergeRecords: adds new records and counts them', () => {
  const existing = [makeRecord({ id: '1', tweetId: '1', postedAt: '2026-01-01' })];
  const incoming = [makeRecord({ id: '2', tweetId: '2', postedAt: '2026-02-01' })];
  const { merged, added } = mergeRecords(existing, incoming);

  assert.equal(merged.length, 2);
  assert.equal(added, 1);
});

test('mergeRecords: merges overlapping records without double-counting', () => {
  const existing = [makeRecord({ id: '1', tweetId: '1', text: 'Old' })];
  const incoming = [makeRecord({ id: '1', tweetId: '1', text: 'Updated', postedAt: '2026-01-01' })];
  const { merged, added } = mergeRecords(existing, incoming);

  assert.equal(merged.length, 1);
  assert.equal(added, 0);
  assert.equal(merged[0].text, 'Updated');
});

test('mergeRecords: sorts by postedAt descending', () => {
  const existing: BookmarkRecord[] = [];
  const incoming = [
    makeRecord({ id: '1', tweetId: '1', postedAt: '2026-01-01T00:00:00Z' }),
    makeRecord({ id: '2', tweetId: '2', postedAt: '2026-03-01T00:00:00Z' }),
    makeRecord({ id: '3', tweetId: '3', postedAt: '2026-02-01T00:00:00Z' }),
  ];
  const { merged } = mergeRecords(existing, incoming);

  assert.equal(merged[0].id, '2'); // March
  assert.equal(merged[1].id, '3'); // February
  assert.equal(merged[2].id, '1'); // January
});

test('mergeRecords: handles empty inputs', () => {
  const { merged, added } = mergeRecords([], []);
  assert.equal(merged.length, 0);
  assert.equal(added, 0);
});

test('formatSyncResult: formats all fields', () => {
  const result = formatSyncResult({
    added: 50,
    totalBookmarks: 6000,
    pages: 300,
    stopReason: 'end of bookmarks',
    cachePath: '/tmp/cache.jsonl',
    statePath: '/tmp/state.json',
  });

  assert.ok(result.includes('50'));
  assert.ok(result.includes('6000'));
  assert.ok(result.includes('300'));
  assert.ok(result.includes('end of bookmarks'));
  assert.ok(result.includes('/tmp/cache.jsonl'));
});
