import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertTweetToRecord,
  parseBookmarksResponse,
  parseFolderTimelineResponse,
  sanitizeBookmarkedAt,
  scoreRecord,
  mergeBookmarkRecord,
  mergeRecords,
  applyFolderMirror,
  clearFolderEverywhere,
  formatSyncResult,
} from '../src/graphql-bookmarks.js';
import { resolveFolder, formatFolderMirrorStats } from '../src/cli.js';
import type { BookmarkFolder, BookmarkRecord } from '../src/types.js';

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
  assert.equal(result.mediaObjects![0].width, 1200);
  assert.equal(result.mediaObjects![0].altText, 'A test image');
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

test('convertTweetToRecord: prefers note tweet text for articles/long-form', () => {
  const tr = makeTweetResult({
    legacy: { full_text: 'Truncated text...' },
    tweet: {
      note_tweet: {
        note_tweet_results: {
          result: {
            text: 'This is the full article text that would normally be truncated in legacy.full_text',
          },
        },
      },
    },
  });
  const result = convertTweetToRecord(tr, NOW);
  assert.ok(result);
  assert.equal(result.text, 'This is the full article text that would normally be truncated in legacy.full_text');
});

test('convertTweetToRecord: falls back to legacy text when no note tweet', () => {
  const result = convertTweetToRecord(makeTweetResult(), NOW);
  assert.ok(result);
  assert.equal(result.text, 'Hello world, this is a test tweet!');
});

test('convertTweetToRecord: extracts quoted tweet snapshot', () => {
  const tr = makeTweetResult({
    legacy: { quoted_status_id_str: '5555555' },
    tweet: {
      quoted_status_result: {
        result: {
          rest_id: '5555555',
          legacy: {
            id_str: '5555555',
            full_text: 'This is the quoted tweet text',
            created_at: 'Mon Mar 09 10:00:00 +0000 2026',
            entities: { urls: [] },
            extended_entities: {
              media: [{
                type: 'photo',
                media_url_https: 'https://pbs.twimg.com/media/quoted.jpg',
                expanded_url: 'https://x.com/quoteduser/status/5555555/photo/1',
                original_info: { width: 800, height: 600 },
              }],
            },
          },
          core: {
            user_results: {
              result: {
                rest_id: '6666',
                core: { screen_name: 'quoteduser', name: 'Quoted User' },
                avatar: { image_url: 'https://pbs.twimg.com/profile_images/6666/qt.jpg' },
                legacy: {},
              },
            },
          },
        },
      },
    },
  });
  const result = convertTweetToRecord(tr, NOW);
  assert.ok(result);
  assert.equal(result.quotedStatusId, '5555555');
  assert.ok(result.quotedTweet);
  assert.equal(result.quotedTweet!.id, '5555555');
  assert.equal(result.quotedTweet!.text, 'This is the quoted tweet text');
  assert.equal(result.quotedTweet!.authorHandle, 'quoteduser');
  assert.equal(result.quotedTweet!.url, 'https://x.com/quoteduser/status/5555555');
  assert.equal(result.quotedTweet!.media?.length, 1);
});

test('convertTweetToRecord: handles missing quoted tweet gracefully', () => {
  const tr = makeTweetResult({
    legacy: { quoted_status_id_str: '7777777' },
  });
  const result = convertTweetToRecord(tr, NOW);
  assert.ok(result);
  assert.equal(result.quotedStatusId, '7777777');
  assert.equal(result.quotedTweet, undefined);
});

test('parseBookmarksResponse: preserves sortIndex for bookmark ordering without fabricating bookmarkedAt', () => {
  const tr = makeTweetResult();
  const resp = {
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [{
            type: 'TimelineAddEntries',
            entries: [{
              entryId: 'tweet-0',
              sortIndex: '2031520476165046272',
              content: {
                itemContent: { tweet_results: { result: tr } },
              },
            }],
          }],
        },
      },
    },
  };
  const { records } = parseBookmarksResponse(resp, NOW);
  assert.equal(records.length, 1);
  assert.equal(records[0].sortIndex, '2031520476165046272');
  assert.equal(records[0].bookmarkedAt, null);
});

test('parseBookmarksResponse: handles missing sortIndex gracefully', () => {
  const tr = makeTweetResult();
  const resp = makeGraphQLResponse([tr]);
  const { records } = parseBookmarksResponse(resp, NOW);
  assert.equal(records.length, 1);
  assert.equal(records[0].bookmarkedAt, null); // no sortIndex = stays null
});

test('parseBookmarksResponse: keeps sortIndex opaque even when it decodes to an impossible date', () => {
  const tr = makeTweetResult({
    legacy: {
      created_at: 'Fri Apr 03 12:00:00 +0000 2026',
    },
  });
  const resp = {
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [{
            type: 'TimelineAddEntries',
            entries: [{
              entryId: 'tweet-0',
              // Decodes to 2024-11-27T21:53:29.879Z, which is impossible for a 2026 tweet.
              sortIndex: '1861891119789912064',
              content: {
                itemContent: { tweet_results: { result: tr } },
              },
            }],
          }],
        },
      },
    },
  };

  const { records } = parseBookmarksResponse(resp, NOW);
  assert.equal(records.length, 1);
  assert.equal(records[0].bookmarkedAt, null);
  assert.equal(records[0].sortIndex, '1861891119789912064');
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

test('sanitizeBookmarkedAt: clears timestamps earlier than postedAt', () => {
  const record = sanitizeBookmarkedAt(makeRecord({
    postedAt: 'Fri Apr 03 12:00:00 +0000 2026',
    bookmarkedAt: '2024-11-26T00:00:00.000Z',
  }));

  assert.equal(record.bookmarkedAt, null);
});

test('sanitizeBookmarkedAt: clears timestamps too far after syncedAt', () => {
  const record = sanitizeBookmarkedAt(makeRecord({
    postedAt: 'Tue Mar 10 12:00:00 +0000 2026',
    syncedAt: '2026-03-28T00:00:00.000Z',
    bookmarkedAt: '2026-03-29T00:00:00.000Z',
  }));

  assert.equal(record.bookmarkedAt, null);
});

test('sanitizeBookmarkedAt: preserves valid timestamp within range', () => {
  const record = sanitizeBookmarkedAt(makeRecord({
    ingestedVia: 'api',
    postedAt: 'Tue Mar 10 12:00:00 +0000 2026',
    syncedAt: '2026-03-28T00:00:00.000Z',
    bookmarkedAt: '2026-03-15T00:00:00.000Z',
  }));

  assert.equal(record.bookmarkedAt, '2026-03-15T00:00:00.000Z');
});

test('sanitizeBookmarkedAt: returns record unchanged when bookmarkedAt is null', () => {
  const input = makeRecord({ postedAt: '2026-03-10', bookmarkedAt: null });
  const result = sanitizeBookmarkedAt(input);

  assert.equal(result.bookmarkedAt, null);
  assert.strictEqual(result, input); // same reference — no unnecessary copy
});

test('sanitizeBookmarkedAt: clears GraphQL bookmark dates even when they look plausible', () => {
  const result = sanitizeBookmarkedAt(makeRecord({
    ingestedVia: 'graphql',
    postedAt: '2026-03-10T12:00:00.000Z',
    syncedAt: '2026-03-28T00:00:00.000Z',
    bookmarkedAt: '2026-03-15T00:00:00.000Z',
  }));

  assert.equal(result.bookmarkedAt, null);
});

test('convertTweetToRecord: expands t.co links in full_text using display_url', () => {
  const tr = {
    rest_id: '1',
    legacy: {
      id_str: '1',
      full_text: 'Check this: https://t.co/abc and this: https://t.co/def',
      entities: {
        urls: [
          { url: 'https://t.co/abc', display_url: 'example.com/foo' },
          { url: 'https://t.co/def', display_url: 'tools.exec.security' },
        ],
      },
    },
  };
  const result = convertTweetToRecord(tr, NOW)!;
  assert.equal(result.text, 'Check this: example.com/foo and this: tools.exec.security');
});

test('formatSyncResult: formats all fields', () => {
  const result = formatSyncResult({
    added: 50,
    bookmarkedAtRepaired: 7,
    totalBookmarks: 6000,
    bookmarkedAtMissing: 12,
    pages: 300,
    stopReason: 'end of bookmarks',
    cachePath: '/tmp/cache.jsonl',
    statePath: '/tmp/state.json',
  });

  assert.ok(result.includes('50'));
  assert.ok(result.includes('7'));
  assert.ok(result.includes('6000'));
  assert.ok(result.includes('12'));
  assert.ok(result.includes('300'));
  assert.ok(result.includes('end of bookmarks'));
  assert.ok(result.includes('/tmp/cache.jsonl'));
});

// ── Folder support ─────────────────────────────────────────────────────

const CODING_FOLDER: BookmarkFolder = { id: 'f-coding', name: 'Coding' };
const AI_FOLDER: BookmarkFolder = { id: 'f-ai', name: 'AI Research' };

test('parseFolderTimelineResponse: parses bookmark_collection_timeline shape', () => {
  const tr = makeTweetResult();
  const resp = {
    data: {
      bookmark_collection_timeline: {
        timeline: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                { entryId: 'tweet-0', content: { itemContent: { tweet_results: { result: tr } } } },
                { entryId: 'cursor-bottom-xyz', content: { value: 'cursor-abc' } },
              ],
            },
          ],
        },
      },
    },
  };
  const result = parseFolderTimelineResponse(resp, NOW);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, '1234567890');
  assert.equal(result.nextCursor, 'cursor-abc');
});

test('parseFolderTimelineResponse: falls back to bookmark_folder_timeline shape', () => {
  const tr = makeTweetResult();
  const resp = {
    data: {
      bookmark_folder_timeline: {
        timeline: {
          instructions: [
            { type: 'TimelineAddEntries', entries: [
              { entryId: 'tweet-0', content: { itemContent: { tweet_results: { result: tr } } } },
            ] },
          ],
        },
      },
    },
  };
  const result = parseFolderTimelineResponse(resp, NOW);
  assert.equal(result.records.length, 1);
});

test('parseFolderTimelineResponse: returns empty for missing data', () => {
  const result = parseFolderTimelineResponse({}, NOW);
  assert.equal(result.records.length, 0);
  assert.equal(result.nextCursor, undefined);
});

test('applyFolderMirror: tags records in the walked set', () => {
  const existing = [
    makeRecord({ id: '1', tweetId: '1' }),
    makeRecord({ id: '2', tweetId: '2' }),
  ];
  const walked = [makeRecord({ id: '1', tweetId: '1' })];

  const { merged, stats } = applyFolderMirror(existing, CODING_FOLDER, walked);

  assert.equal(stats.tagged, 1);
  assert.equal(stats.untagged, 0);
  assert.equal(stats.added, 0);

  const record1 = merged.find((r) => r.id === '1')!;
  const record2 = merged.find((r) => r.id === '2')!;
  assert.deepEqual(record1.folderIds, ['f-coding']);
  assert.deepEqual(record1.folderNames, ['Coding']);
  assert.deepEqual(record2.folderIds ?? [], []);
});

test('applyFolderMirror: removes folder tag from records NOT in walked set (mirror semantics)', () => {
  const existing = [
    makeRecord({ id: '1', tweetId: '1', folderIds: ['f-coding'], folderNames: ['Coding'] }),
    makeRecord({ id: '2', tweetId: '2', folderIds: ['f-coding'], folderNames: ['Coding'] }),
  ];
  // User moved record 2 out of Coding on X; walk only returns record 1
  const walked = [makeRecord({ id: '1', tweetId: '1' })];

  const { merged, stats } = applyFolderMirror(existing, CODING_FOLDER, walked);

  assert.equal(stats.untagged, 1);
  const record2 = merged.find((r) => r.id === '2')!;
  assert.deepEqual(record2.folderIds, []);
  assert.deepEqual(record2.folderNames, []);
});

test('applyFolderMirror: preserves OTHER folder tags when removing one', () => {
  const existing = [
    makeRecord({
      id: '1',
      tweetId: '1',
      folderIds: ['f-coding', 'f-ai'],
      folderNames: ['Coding', 'AI Research'],
    }),
  ];
  // Record 1 is no longer in Coding, but should still be in AI Research
  const walked: BookmarkRecord[] = [];

  const { merged, stats } = applyFolderMirror(existing, CODING_FOLDER, walked);

  assert.equal(stats.untagged, 1);
  const record = merged[0];
  assert.deepEqual(record.folderIds, ['f-ai']);
  assert.deepEqual(record.folderNames, ['AI Research']);
});

test('applyFolderMirror: adds new records discovered during folder walk', () => {
  const existing: BookmarkRecord[] = [];
  const walked = [makeRecord({ id: 'new-1', tweetId: 'new-1' })];

  const { merged, stats } = applyFolderMirror(existing, CODING_FOLDER, walked);

  assert.equal(stats.added, 1);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].folderIds, ['f-coding']);
  assert.deepEqual(merged[0].folderNames, ['Coding']);
});

test('applyFolderMirror: re-tagging an already-tagged record is unchanged', () => {
  const existing = [
    makeRecord({ id: '1', tweetId: '1', folderIds: ['f-coding'], folderNames: ['Coding'] }),
  ];
  const walked = [makeRecord({ id: '1', tweetId: '1' })];

  const { merged, stats } = applyFolderMirror(existing, CODING_FOLDER, walked);

  assert.equal(stats.unchanged, 1);
  assert.equal(stats.added, 0);
  assert.equal(stats.tagged, 0);
  assert.equal(stats.untagged, 0);
  assert.deepEqual(merged[0].folderIds, ['f-coding']);
  assert.deepEqual(merged[0].folderNames, ['Coding']);
});

test('applyFolderMirror: updates folder name on rename (same folder id)', () => {
  const existing = [
    makeRecord({ id: '1', tweetId: '1', folderIds: ['f-coding'], folderNames: ['Coding'] }),
  ];
  const walked = [makeRecord({ id: '1', tweetId: '1' })];
  const renamedFolder: BookmarkFolder = { id: 'f-coding', name: 'Software' };

  const { merged } = applyFolderMirror(existing, renamedFolder, walked);

  assert.deepEqual(merged[0].folderIds, ['f-coding']);
  assert.deepEqual(merged[0].folderNames, ['Software']);
});

test('applyFolderMirror: does not duplicate tags on repeated mirrors', () => {
  const existing = [makeRecord({ id: '1', tweetId: '1' })];
  const walked = [makeRecord({ id: '1', tweetId: '1' })];

  const first = applyFolderMirror(existing, CODING_FOLDER, walked);
  const second = applyFolderMirror(first.merged, CODING_FOLDER, walked);

  assert.deepEqual(second.merged[0].folderIds, ['f-coding']);
  assert.deepEqual(second.merged[0].folderNames, ['Coding']);
  assert.equal(second.merged[0].folderIds!.length, 1);
});

test('clearFolderEverywhere: removes folder tag from all records', () => {
  const existing = [
    makeRecord({ id: '1', tweetId: '1', folderIds: ['f-coding', 'f-ai'], folderNames: ['Coding', 'AI Research'] }),
    makeRecord({ id: '2', tweetId: '2', folderIds: ['f-coding'], folderNames: ['Coding'] }),
    makeRecord({ id: '3', tweetId: '3' }),
  ];

  const { merged, cleared } = clearFolderEverywhere(existing, 'f-coding');

  assert.equal(cleared, 2);
  const r1 = merged.find((r) => r.id === '1')!;
  const r2 = merged.find((r) => r.id === '2')!;
  const r3 = merged.find((r) => r.id === '3')!;
  assert.deepEqual(r1.folderIds, ['f-ai']);
  assert.deepEqual(r1.folderNames, ['AI Research']);
  assert.deepEqual(r2.folderIds, []);
  assert.deepEqual(r2.folderNames, []);
  assert.equal(r3.folderIds, undefined);
});

test('applyFolderMirror: parallel arrays stay aligned after multiple untags', () => {
  // Record has three folders. Two of them get emptied (walked sets return nothing).
  // After both clears, folderIds and folderNames should still match positionally.
  const F1: BookmarkFolder = { id: 'f1', name: 'F-One' };
  const F2: BookmarkFolder = { id: 'f2', name: 'F-Two' };
  const F3: BookmarkFolder = { id: 'f3', name: 'F-Three' };
  const existing = [
    makeRecord({
      id: '1',
      tweetId: '1',
      folderIds: ['f1', 'f2', 'f3'],
      folderNames: ['F-One', 'F-Two', 'F-Three'],
    }),
  ];

  // Simulate clearing f1 (no records in walk)
  const step1 = applyFolderMirror(existing, F1, []);
  assert.equal(step1.stats.untagged, 1);
  assert.equal(step1.merged[0].folderIds!.length, 2);
  assert.equal(step1.merged[0].folderNames!.length, 2);
  assert.deepEqual(step1.merged[0].folderIds, ['f2', 'f3']);
  assert.deepEqual(step1.merged[0].folderNames, ['F-Two', 'F-Three']);

  // Now clear f3 — f2 must remain and arrays still aligned
  const step2 = applyFolderMirror(step1.merged, F3, []);
  assert.deepEqual(step2.merged[0].folderIds, ['f2']);
  assert.deepEqual(step2.merged[0].folderNames, ['F-Two']);

  // Unused reference to avoid unused-var lint noise
  void F2;
});

test('applyFolderMirror: tag-then-rename-then-walk keeps arrays aligned', () => {
  const original: BookmarkFolder = { id: 'f1', name: 'Coding' };
  const renamed: BookmarkFolder = { id: 'f1', name: 'Software' };
  const existing = [makeRecord({ id: '1', tweetId: '1' })];
  const walked = [makeRecord({ id: '1', tweetId: '1' })];

  const first = applyFolderMirror(existing, original, walked);
  assert.deepEqual(first.merged[0].folderIds, ['f1']);
  assert.deepEqual(first.merged[0].folderNames, ['Coding']);

  const second = applyFolderMirror(first.merged, renamed, walked);
  assert.deepEqual(second.merged[0].folderIds, ['f1']);
  assert.deepEqual(second.merged[0].folderNames, ['Software']);
});

test('main-sync merge preserves folder tags on existing records', () => {
  // Main sync never carries folder data — records from main sync have
  // no folderIds/folderNames. Spread merge should preserve them.
  const existing = [
    makeRecord({ id: '1', tweetId: '1', folderIds: ['f-coding'], folderNames: ['Coding'] }),
  ];
  const incoming = [makeRecord({ id: '1', tweetId: '1', text: 'Updated' })];

  const { merged } = mergeRecords(existing, incoming);

  assert.equal(merged[0].text, 'Updated');
  assert.deepEqual(merged[0].folderIds, ['f-coding']);
  assert.deepEqual(merged[0].folderNames, ['Coding']);
});

// ── resolveFolder helper ───────────────────────────────────────────────

const FOLDERS: BookmarkFolder[] = [
  { id: 'f1', name: 'Coding' },
  { id: 'f2', name: 'AI Research' },
  { id: 'f3', name: 'AI Tools' },
  { id: 'f4', name: 'Music' },
];

test('resolveFolder: exact case-insensitive match', () => {
  assert.equal(resolveFolder(FOLDERS, 'coding').id, 'f1');
  assert.equal(resolveFolder(FOLDERS, 'CODING').id, 'f1');
  assert.equal(resolveFolder(FOLDERS, 'Music').id, 'f4');
});

test('resolveFolder: unambiguous prefix match', () => {
  assert.equal(resolveFolder(FOLDERS, 'Cod').id, 'f1');
  assert.equal(resolveFolder(FOLDERS, 'Mus').id, 'f4');
});

test('resolveFolder: ambiguous prefix throws with folder names listed', () => {
  assert.throws(
    () => resolveFolder(FOLDERS, 'AI'),
    (err: Error) =>
      err.message.includes('Multiple folders') &&
      err.message.includes('AI Research') &&
      err.message.includes('AI Tools'),
  );
});

test('resolveFolder: no match throws with available folders listed', () => {
  assert.throws(
    () => resolveFolder(FOLDERS, 'Nonexistent'),
    (err: Error) => err.message.includes('No folder matches') && err.message.includes('Coding'),
  );
});

test('formatFolderMirrorStats: shows only non-zero fields', () => {
  assert.equal(
    formatFolderMirrorStats({ added: 3, tagged: 5, untagged: 0, unchanged: 10 }),
    '3 new, 5 tagged, 10 unchanged',
  );
});

test('formatFolderMirrorStats: returns "no changes" when all zero', () => {
  assert.equal(
    formatFolderMirrorStats({ added: 0, tagged: 0, untagged: 0, unchanged: 0 }),
    'no changes',
  );
});

// ── resolveFolder whitespace handling ──────────────────────────────────

test('resolveFolder: trims whitespace on both sides', () => {
  assert.equal(resolveFolder(FOLDERS, '  coding  ').id, 'f1');
  assert.equal(resolveFolder(FOLDERS, '\tcoding\n').id, 'f1');
});

test('resolveFolder: trims whitespace on folder names too', () => {
  const padded: BookmarkFolder[] = [{ id: 'fx', name: '  Spaced  ' }];
  assert.equal(resolveFolder(padded, 'spaced').id, 'fx');
});

// ── withoutFolder dedup (M1) ───────────────────────────────────────────

test('applyFolderMirror: removes all duplicate folder id occurrences on untag', () => {
  // Simulate a corrupt record with duplicate folder ids. Should be fully cleared.
  const existing = [
    makeRecord({
      id: '1',
      tweetId: '1',
      folderIds: ['f-coding', 'f-ai', 'f-coding'],
      folderNames: ['Coding', 'AI', 'Coding'],
    }),
  ];
  const walked: BookmarkRecord[] = []; // empty walk → should clear all Coding tags

  const { merged } = applyFolderMirror(existing, CODING_FOLDER, walked);
  assert.deepEqual(merged[0].folderIds, ['f-ai']);
  assert.deepEqual(merged[0].folderNames, ['AI']);
});

test('applyFolderMirror: collapses duplicate folder id occurrences on re-tag', () => {
  // Corrupt record with duplicates. Re-tagging should produce exactly one entry.
  const existing = [
    makeRecord({
      id: '1',
      tweetId: '1',
      folderIds: ['f-coding', 'f-coding'],
      folderNames: ['Coding', 'Coding'],
    }),
  ];
  const walked = [makeRecord({ id: '1', tweetId: '1' })];

  const { merged } = applyFolderMirror(existing, CODING_FOLDER, walked);
  assert.deepEqual(merged[0].folderIds, ['f-coding']);
  assert.deepEqual(merged[0].folderNames, ['Coding']);
});
