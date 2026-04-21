import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  convertTweetToRecord,
  parseBookmarksResponse,
  parseFolderTimelineResponse,
  parseTweetArticleByRestId,
  parseTweetResultByRestId,
  sanitizeBookmarkedAt,
  scoreRecord,
  mergeBookmarkRecord,
  mergeRecords,
  applyFolderMirror,
  clearFolderEverywhere,
  formatSyncResult,
  syncBookmarksGraphQL,
  syncGaps,
} from '../src/graphql-bookmarks.js';
import { buildIndex, getBookmarkById } from '../src/bookmarks-db.js';
import { resolveFolder, formatFolderMirrorStats } from '../src/cli.js';
import type { BookmarkFolder, BookmarkRecord } from '../src/types.js';

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
function loadFixture(name: string): any {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

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

test('convertTweetToRecord: expands t.co links in visible text using display_url', () => {
  const result = convertTweetToRecord(makeTweetResult({
    legacy: {
      full_text: 'Check this: https://t.co/abc and this: https://t.co/def',
      entities: {
        urls: [
          { expanded_url: 'https://example.com/article', url: 'https://t.co/abc', display_url: 'example.com/foo' },
          { expanded_url: 'https://tools.exec.security', url: 'https://t.co/def', display_url: 'tools.exec.security' },
        ],
      },
    },
  }), NOW)!;

  assert.equal(result.text, 'Check this: example.com/foo and this: tools.exec.security');
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

test('convertTweetToRecord: preserves quoted tweet video variants', () => {
  const tr = makeTweetResult({
    legacy: { quoted_status_id_str: '9999999' },
    tweet: {
      quoted_status_result: {
        result: {
          rest_id: '9999999',
          legacy: {
            id_str: '9999999',
            full_text: 'Quoted video tweet',
            created_at: 'Mon Mar 09 10:00:00 +0000 2026',
            entities: { urls: [] },
            extended_entities: {
              media: [{
                type: 'video',
                media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/quoted.jpg',
                expanded_url: 'https://x.com/quoteduser/status/9999999/video/1',
                original_info: { width: 1280, height: 720 },
                ext_alt_text: 'Quoted video poster',
                video_info: {
                  variants: [
                    { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/quoted.mp4' },
                  ],
                },
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
  assert.ok(result?.quotedTweet);
  assert.equal(result.quotedTweet!.mediaObjects?.[0].type, 'video');
  assert.equal(result.quotedTweet!.mediaObjects?.[0].altText, 'Quoted video poster');
  assert.equal(result.quotedTweet!.mediaObjects?.[0].videoVariants?.[0].url, 'https://video.twimg.com/quoted.mp4');
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

test('convertTweetToRecord: quoted tweet prefers note_tweet body over legacy full_text', () => {
  const tr = makeTweetResult({
    legacy: { quoted_status_id_str: '8888888' },
    tweet: {
      quoted_status_result: {
        result: {
          rest_id: '8888888',
          note_tweet: {
            note_tweet_results: {
              result: {
                text: 'Full long-form quoted body that would be truncated in legacy.full_text',
              },
            },
          },
          legacy: {
            id_str: '8888888',
            full_text: 'Full long-form quoted body that would be truncated in',
            created_at: 'Mon Apr 13 10:00:00 +0000 2026',
            entities: { urls: [] },
          },
          core: {
            user_results: {
              result: {
                rest_id: '9999',
                core: { screen_name: 'longform', name: 'Long Form' },
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
  assert.equal(
    result.quotedTweet!.text,
    'Full long-form quoted body that would be truncated in legacy.full_text',
  );
});

test('parseBookmarksResponse: captures full note_tweet body from live bookmarks-feed fixture', () => {
  const fixture = loadFixture('bookmark-feed-note-tweet.json');
  const { records } = parseBookmarksResponse(fixture, NOW);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.equal(record.tweetId, '2039805659525644595');
  assert.equal(record.authorHandle, 'karpathy');
  // The whole point of the feature-flag fix: a long note_tweet must land in
  // `text` as the full body, not the 275-char preview from legacy.full_text.
  assert.equal(record.text.length, 3447);
  assert.ok(record.text.startsWith('LLM Knowledge Bases'));
  assert.ok(record.text.endsWith('hacky collection of scripts.'));
});

test('parseTweetResultByRestId: extracts note_tweet body from live TweetResultByRestId fixture', () => {
  const fixture = loadFixture('tweet-result-by-rest-id-note-tweet.json');
  const snapshot = parseTweetResultByRestId(fixture, '2039805659525644595');
  assert.ok(snapshot);
  assert.equal(snapshot.id, '2039805659525644595');
  assert.equal(snapshot.authorHandle, 'karpathy');
  assert.equal(snapshot.text.length, 3447);
  assert.ok(snapshot.text.startsWith('LLM Knowledge Bases'));
});

test('parseTweetArticleByRestId: extracts X Article rich-text content', () => {
  const fixture = {
    data: {
      tweetResult: {
        result: {
          rest_id: '2042685676949270724',
          legacy: {
            id_str: '2042685676949270724',
            full_text: 'x.com/i/article/2042...',
          },
          article_results: {
            result: {
              title: 'How agents should use context',
              contents: [
                { type: 'header-two', text: 'Context discipline' },
                { type: 'unstyled', text: 'The useful body lives in the X Article payload, not in the tweet preview.' },
              ],
            },
          },
        },
      },
    },
  };

  const article = parseTweetArticleByRestId(fixture);
  assert.ok(article);
  assert.equal(article.title, 'How agents should use context');
  assert.match(article.text, /Context discipline/);
  assert.match(article.text, /useful body lives in the X Article payload/);
});

test('parseTweetResultByRestId: returns null on tombstone / unavailable tweets', () => {
  assert.equal(
    parseTweetResultByRestId({ data: { tweetResult: { result: { __typename: 'TweetTombstone' } } } }, '123'),
    null,
  );
});

test('syncGaps: enriches X Article bookmarks through TweetResult payload', async () => {
  const xArticle: BookmarkRecord = {
    id: '2042685676949270724',
    tweetId: '2042685676949270724',
    url: 'https://x.com/danveloper/status/2042685676949270724',
    text: 'x.com/i/article/2042...',
    authorHandle: 'danveloper',
    syncedAt: NOW,
    postedAt: 'Fri Apr 10 19:26:31 +0000 2026',
    links: ['http://x.com/i/article/2042676487711584257'],
    tags: [],
    ingestedVia: 'graphql',
  };

  await withIsolatedGapFillDataDir(async () => {
    await buildIndex();
    let fetchCalls = 0;
    const result = await syncGaps({
      tweetFetcher: async (tweetId) => {
        fetchCalls += 1;
        assert.equal(tweetId, '2042685676949270724');
        return {
          snapshot: {
            id: tweetId,
            text: 'x.com/i/article/2042...',
            url: 'https://x.com/danveloper/status/2042685676949270724',
          },
          article: {
            title: 'How agents should use context',
            text: 'The article body is the useful content. It should not be lost behind an X Article link.',
            siteName: 'X Articles',
          },
          status: 'ok',
          source: 'graphql',
        };
      },
    });

    assert.equal(fetchCalls, 1);
    assert.equal(result.articlesEnriched, 1);
    assert.equal(result.failed, 0);

    const refreshed = await getBookmarkById('2042685676949270724');
    assert.ok(refreshed);
    assert.equal(refreshed.text, 'x.com/i/article/2042...');
    assert.equal(refreshed.articleTitle, 'How agents should use context');
    assert.match(refreshed.articleText ?? '', /useful content/);

    const jsonl = await readFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks.jsonl'), 'utf8');
    const stored = JSON.parse(jsonl.trim().split('\n').pop()!);
    assert.equal(stored.text, 'x.com/i/article/2042...');
  }, [xArticle]);
});

async function withIsolatedGapFillDataDir(
  fn: () => Promise<void>,
  fixtures: BookmarkRecord[],
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-gaps-test-'));
  const jsonl = fixtures.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);
  const savedDataDir = process.env.FT_DATA_DIR;
  const savedChromeDir = process.env.FT_CHROME_USER_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  // Point Chrome extraction at an empty path so resolveGapFillCookies fails
  // fast and the fetcher falls back cleanly when we aren't injecting one.
  process.env.FT_CHROME_USER_DATA_DIR = path.join(dir, '__no_chrome__');
  try {
    await fn();
  } finally {
    if (savedDataDir !== undefined) process.env.FT_DATA_DIR = savedDataDir;
    else delete process.env.FT_DATA_DIR;
    if (savedChromeDir !== undefined) process.env.FT_CHROME_USER_DATA_DIR = savedChromeDir;
    else delete process.env.FT_CHROME_USER_DATA_DIR;
  }
}

test('syncGaps: expands truncated note_tweet and stamps textExpandedAt', async () => {
  const fixture = loadFixture('tweet-result-by-rest-id-note-tweet.json');
  const legacyPreview: string = fixture.data.tweetResult.result.legacy.full_text;
  const fullBody: string = fixture.data.tweetResult.result.note_tweet.note_tweet_results.result.text;

  const truncated: BookmarkRecord = {
    id: '2039805659525644595',
    tweetId: '2039805659525644595',
    url: 'https://x.com/karpathy/status/2039805659525644595',
    text: legacyPreview,
    authorHandle: 'karpathy',
    syncedAt: NOW,
    postedAt: '2026-04-02T20:42:21.000Z',
    language: 'en',
    tags: [],
    ingestedVia: 'graphql',
  };

  await withIsolatedGapFillDataDir(async () => {
    await buildIndex();
    let fetchCalls = 0;
    const result = await syncGaps({
      tweetFetcher: async (tweetId) => {
        fetchCalls += 1;
        assert.equal(tweetId, '2039805659525644595');
        return { snapshot: parseTweetResultByRestId(fixture, tweetId), status: 'ok', source: 'graphql' };
      },
    });

    assert.equal(fetchCalls, 1);
    assert.equal(result.textExpanded, 1);
    assert.equal(result.failed, 0);

    const refreshed = await getBookmarkById('2039805659525644595');
    assert.ok(refreshed);
    assert.equal(refreshed.text.length, fullBody.length);
    assert.ok(refreshed.text.startsWith('LLM Knowledge Bases'));

    // Marker should land in the JSONL so the next run skips this record.
    const jsonl = await readFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks.jsonl'), 'utf8');
    const stored = JSON.parse(jsonl.trim().split('\n').pop()!);
    assert.ok(stored.textExpandedAt, 'textExpandedAt should be set after expansion');
    assert.equal(stored.text.length, fullBody.length);
  }, [truncated]);
});

test('syncGaps: skips records that already have textExpandedAt set', async () => {
  const alreadyChecked: BookmarkRecord = {
    id: '111',
    tweetId: '111',
    url: 'https://x.com/user/status/111',
    text: 'x'.repeat(280),
    syncedAt: NOW,
    tags: [],
    ingestedVia: 'graphql',
    textExpandedAt: '2026-04-14T00:00:00.000Z',
  };

  await withIsolatedGapFillDataDir(async () => {
    let fetchCalls = 0;
    const result = await syncGaps({
      tweetFetcher: async () => {
        fetchCalls += 1;
        return { snapshot: null, status: 'ok' };
      },
    });
    assert.equal(fetchCalls, 0, 'fetcher should not run when all records are already marked');
    assert.equal(result.textExpanded, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.total, 0, 'empty gap-fill should report total=0 so CLI prints "No gaps found"');
  }, [alreadyChecked]);
});

test('syncGaps: syndication "ok" with truncated preview does NOT stamp textExpandedAt', async () => {
  // Regression for the bug where a user with expired cookies (graphql falls
  // through to syndication) would have every long note_tweet permanently
  // marked as checked even though syndication can't see note_tweet bodies.
  const truncated: BookmarkRecord = {
    id: '444',
    tweetId: '444',
    url: 'https://x.com/user/status/444',
    text: 'z'.repeat(280),
    syncedAt: NOW,
    tags: [],
    ingestedVia: 'graphql',
  };

  await withIsolatedGapFillDataDir(async () => {
    const result = await syncGaps({
      tweetFetcher: async () => ({
        snapshot: {
          id: '444',
          text: 'z'.repeat(280),
          url: 'https://x.com/user/status/444',
        },
        status: 'ok',
        source: 'syndication',
      }),
    });
    assert.equal(result.textExpanded, 0);

    const jsonl = await readFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks.jsonl'), 'utf8');
    const stored = JSON.parse(jsonl.trim().split('\n').pop()!);
    assert.equal(
      stored.textExpandedAt,
      undefined,
      'syndication cannot settle Gap 2 — record must remain unmarked so graphql can try next run',
    );
  }, [truncated]);
});

test('syncGaps: syndication snapshot with genuinely longer text still expands and stamps', async () => {
  // Defensive corner: if syndication somehow returns a longer text than what
  // we had cached (non-note_tweet edge case), that IS real new information —
  // apply it and mark checked.
  const stale: BookmarkRecord = {
    id: '555',
    tweetId: '555',
    url: 'https://x.com/user/status/555',
    text: 'short cached preview that is exactly 275 characters long '.repeat(5).slice(0, 275),
    syncedAt: NOW,
    tags: [],
    ingestedVia: 'graphql',
  };

  await withIsolatedGapFillDataDir(async () => {
    await buildIndex();
    const longer = 'x'.repeat(400);
    const result = await syncGaps({
      tweetFetcher: async () => ({
        snapshot: { id: '555', text: longer, url: 'https://x.com/user/status/555' },
        status: 'ok',
        source: 'syndication',
      }),
    });
    assert.equal(result.textExpanded, 1);

    const jsonl = await readFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks.jsonl'), 'utf8');
    const stored = JSON.parse(jsonl.trim().split('\n').pop()!);
    assert.equal(stored.text.length, 400);
    assert.ok(stored.textExpandedAt);
  }, [stale]);
});

test('syncGaps: transient failure does NOT stamp textExpandedAt so next run retries', async () => {
  const truncated: BookmarkRecord = {
    id: '333',
    tweetId: '333',
    url: 'https://x.com/user/status/333',
    text: 'y'.repeat(300),
    syncedAt: NOW,
    tags: [],
    ingestedVia: 'graphql',
  };

  await withIsolatedGapFillDataDir(async () => {
    const result = await syncGaps({
      tweetFetcher: async () => ({ snapshot: null, status: 'rate_limited' }),
    });
    assert.equal(result.failed, 1);

    const jsonl = await readFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks.jsonl'), 'utf8');
    const stored = JSON.parse(jsonl.trim().split('\n').pop()!);
    assert.equal(
      stored.textExpandedAt,
      undefined,
      'transient failures must not mark the record so the next run can retry',
    );
  }, [truncated]);
});

test('syncBookmarksGraphQL: rebuild mode does not treat merged-only pages as stale', async () => {
  const page1 = makeGraphQLResponse([
    makeTweetResult({
      rest_id: '1',
      legacy: {
        id_str: '1',
        full_text: 'First existing bookmark',
        created_at: 'Tue Mar 11 12:00:00 +0000 2026',
      },
    }),
  ], 'cursor-2');
  const page2 = makeGraphQLResponse([
    makeTweetResult({
      rest_id: '2',
      legacy: {
        id_str: '2',
        full_text: 'Second existing bookmark',
        created_at: 'Tue Mar 10 12:00:00 +0000 2026',
      },
    }),
  ]);

  const existing = [
    makeRecord({
      id: '1',
      tweetId: '1',
      text: 'First existing bookmark',
      postedAt: 'Tue Mar 11 12:00:00 +0000 2026',
    }),
    makeRecord({
      id: '2',
      tweetId: '2',
      text: 'Second existing bookmark',
      postedAt: 'Tue Mar 10 12:00:00 +0000 2026',
    }),
  ];

  await withIsolatedGapFillDataDir(async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      const body = fetchCalls === 0 ? page1 : page2;
      fetchCalls += 1;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const result = await syncBookmarksGraphQL({
        incremental: false,
        csrfToken: 'ct0',
        cookieHeader: 'ct0=ct0; auth_token=auth',
        delayMs: 0,
        stalePageLimit: 1,
      });

      assert.equal(fetchCalls, 2);
      assert.equal(result.pages, 2);
      assert.equal(result.added, 0);
      assert.equal(result.stopReason, 'end of bookmarks');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, existing);
});

test('syncBookmarksGraphQL: rate limit stops cleanly and saves cursor for continue', async () => {
  const page1 = makeGraphQLResponse([makeTweetResult()], 'cursor-2');

  const existing = [
    makeRecord({
      id: '1234567890',
      tweetId: '1234567890',
      text: 'Existing bookmark',
      postedAt: 'Tue Mar 10 12:00:00 +0000 2026',
    }),
  ];

  await withIsolatedGapFillDataDir(async () => {
    const originalFetch = globalThis.fetch;
    const originalSetTimeout = globalThis.setTimeout;
    let fetchCalls = 0;
    await writeFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks-meta.json'), JSON.stringify({
      provider: 'twitter',
      schemaVersion: 1,
      lastFullSyncAt: '2026-04-18T12:00:00.000Z',
      totalBookmarks: existing.length,
    }));
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return new Response(JSON.stringify(page1), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('', {
        status: 429,
        headers: { 'retry-after': '1' },
      });
    }) as typeof fetch;
    globalThis.setTimeout = (((handler: TimerHandler, _timeout?: number, ...args: any[]) => {
      if (typeof handler === 'function') handler(...args);
      return 0 as any;
    }) as typeof setTimeout);

    try {
      const result = await syncBookmarksGraphQL({
        incremental: false,
        csrfToken: 'ct0',
        cookieHeader: 'ct0=ct0; auth_token=auth',
        delayMs: 0,
        stalePageLimit: 1,
      });

      assert.equal(fetchCalls, 5);
      assert.equal(result.pages, 1);
      assert.equal(result.added, 0);
      assert.equal(result.stopReason, 'rate limited');
      assert.equal(result.retryAfterSec, 1);

      const state = JSON.parse(await readFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks-backfill-state.json'), 'utf8'));
      assert.equal(state.stopReason, 'rate limited');
      assert.equal(state.lastCursor, 'cursor-2');

      const meta = JSON.parse(await readFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks-meta.json'), 'utf8'));
      assert.equal(meta.lastFullSyncAt, '2026-04-18T12:00:00.000Z');
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.setTimeout = originalSetTimeout;
    }
  }, existing);
});

test('syncGaps: permanent quoted-tweet failure stamps quotedTweetFailedAt so reruns skip it', async () => {
  const deadQuoted: BookmarkRecord = {
    id: '222',
    tweetId: '222',
    url: 'https://x.com/user/status/222',
    text: 'Check out this tweet',
    syncedAt: NOW,
    tags: [],
    ingestedVia: 'graphql',
    quotedStatusId: '999999999',
  };

  await withIsolatedGapFillDataDir(async () => {
    let fetchCalls = 0;
    const firstRun = await syncGaps({
      tweetFetcher: async () => {
        fetchCalls += 1;
        return { snapshot: null, status: 'not_found' };
      },
    });
    assert.equal(fetchCalls, 1);
    assert.equal(firstRun.failed, 1);

    const jsonl = await readFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks.jsonl'), 'utf8');
    const stored = JSON.parse(jsonl.trim().split('\n').pop()!);
    assert.ok(stored.quotedTweetFailedAt, 'quotedTweetFailedAt should be set after permanent failure');

    // Second run should not touch the fetcher for this record.
    const secondCalls = { n: 0 };
    const secondRun = await syncGaps({
      tweetFetcher: async () => {
        secondCalls.n += 1;
        return { snapshot: null, status: 'not_found' };
      },
    });
    assert.equal(secondCalls.n, 0, 'second run must not retry permanent failures');
    assert.equal(secondRun.total, 0);
  }, [deadQuoted]);
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
