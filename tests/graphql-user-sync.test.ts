import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUserTimelineResponse } from '../src/graphql-user-sync.js';
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

function makeUserTimelineResponse(tweetResults: any[], bottomCursor?: string) {
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
      user: {
        result: {
          timeline_v2: {
            timeline: {
              instructions: [
                { type: 'TimelineAddEntries', entries },
              ],
            },
          },
        },
      },
    },
  };
}

function makeFeedResponse(tweetResults: any[], bottomCursor?: string) {
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
      entryId: 'cursor-bottom-456',
      content: { value: bottomCursor } as any,
    });
  }

  return {
    data: {
      home: {
        home_timeline_urt: {
          instructions: [
            { type: 'TimelineAddEntries', entries },
          ],
        },
      },
    },
  };
}

// ── User timeline response parsing ───────────────────────────────

test('parseUserTimelineResponse: parses user timeline entries', () => {
  const tr = makeTweetResult();
  const resp = makeUserTimelineResponse([tr]);
  const { records } = parseUserTimelineResponse(resp, 'graphql-timeline', NOW);

  assert.equal(records.length, 1);
  assert.equal(records[0].id, '1234567890');
  assert.equal(records[0].text, 'Hello world, this is a test tweet!');
});

test('parseUserTimelineResponse: parses multiple user timeline entries', () => {
  const tr1 = makeTweetResult();
  const tr2 = makeTweetResult({ legacy: { id_str: '2222222', full_text: 'Second tweet' } });
  const resp = makeUserTimelineResponse([tr1, tr2]);
  const { records } = parseUserTimelineResponse(resp, 'graphql-timeline', NOW);

  assert.equal(records.length, 2);
});

// ── Feed response parsing ────────────────────────────────────────

test('parseUserTimelineResponse: parses feed response entries', () => {
  const tr = makeTweetResult();
  const resp = makeFeedResponse([tr]);
  const { records } = parseUserTimelineResponse(resp, 'graphql-feed', NOW);

  assert.equal(records.length, 1);
  assert.equal(records[0].id, '1234567890');
});

test('parseUserTimelineResponse: parses multiple feed entries', () => {
  const tr1 = makeTweetResult();
  const tr2 = makeTweetResult({ legacy: { id_str: '3333333', full_text: 'Feed tweet' } });
  const resp = makeFeedResponse([tr1, tr2]);
  const { records } = parseUserTimelineResponse(resp, 'graphql-feed', NOW);

  assert.equal(records.length, 2);
});

// ── Cursor extraction ────────────────────────────────────────────

test('parseUserTimelineResponse: extracts bottom cursor from user timeline', () => {
  const tr = makeTweetResult();
  const resp = makeUserTimelineResponse([tr], 'cursor-abc-123');
  const { nextCursor } = parseUserTimelineResponse(resp, 'graphql-timeline', NOW);

  assert.equal(nextCursor, 'cursor-abc-123');
});

test('parseUserTimelineResponse: extracts bottom cursor from feed', () => {
  const tr = makeTweetResult();
  const resp = makeFeedResponse([tr], 'cursor-feed-xyz');
  const { nextCursor } = parseUserTimelineResponse(resp, 'graphql-feed', NOW);

  assert.equal(nextCursor, 'cursor-feed-xyz');
});

test('parseUserTimelineResponse: no cursor when not present', () => {
  const resp = makeUserTimelineResponse([makeTweetResult()]);
  const { nextCursor } = parseUserTimelineResponse(resp, 'graphql-timeline', NOW);

  assert.equal(nextCursor, undefined);
});

// ── Conversation modules ─────────────────────────────────────────

test('parseUserTimelineResponse: extracts tweet from conversation module items', () => {
  const tr = makeTweetResult();
  const resp = {
    data: {
      user: {
        result: {
          timeline_v2: {
            timeline: {
              instructions: [{
                type: 'TimelineAddEntries',
                entries: [{
                  entryId: 'conversationthread-111',
                  content: {
                    items: [{
                      item: {
                        itemContent: {
                          tweet_results: { result: tr },
                        },
                      },
                    }],
                  },
                }],
              }],
            },
          },
        },
      },
    },
  };
  const { records } = parseUserTimelineResponse(resp, 'graphql-timeline', NOW);

  assert.equal(records.length, 1);
  assert.equal(records[0].id, '1234567890');
});

// ── Empty / missing data ─────────────────────────────────────────

test('parseUserTimelineResponse: returns empty when json is empty object', () => {
  const { records, nextCursor } = parseUserTimelineResponse({}, 'graphql-timeline', NOW);

  assert.equal(records.length, 0);
  assert.equal(nextCursor, undefined);
});

test('parseUserTimelineResponse: returns empty when json is null', () => {
  const { records, nextCursor } = parseUserTimelineResponse(null, 'graphql-timeline', NOW);

  assert.equal(records.length, 0);
  assert.equal(nextCursor, undefined);
});

test('parseUserTimelineResponse: returns empty when json is undefined', () => {
  const { records, nextCursor } = parseUserTimelineResponse(undefined, 'graphql-timeline', NOW);

  assert.equal(records.length, 0);
  assert.equal(nextCursor, undefined);
});

test('parseUserTimelineResponse: returns empty when instructions array is empty', () => {
  const resp = {
    data: {
      user: {
        result: {
          timeline_v2: {
            timeline: {
              instructions: [],
            },
          },
        },
      },
    },
  };
  const { records } = parseUserTimelineResponse(resp, 'graphql-timeline', NOW);

  assert.equal(records.length, 0);
});

test('parseUserTimelineResponse: skips entries with no tweet_results', () => {
  const resp = {
    data: {
      user: {
        result: {
          timeline_v2: {
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
      },
    },
  };
  const { records } = parseUserTimelineResponse(resp, 'graphql-timeline', NOW);

  assert.equal(records.length, 1);
});

// ── ingestedVia assignment ───────────────────────────────────────

test('parseUserTimelineResponse: sets ingestedVia to graphql-timeline', () => {
  const resp = makeUserTimelineResponse([makeTweetResult()]);
  const { records } = parseUserTimelineResponse(resp, 'graphql-timeline', NOW);

  assert.equal(records[0].ingestedVia, 'graphql-timeline');
});

test('parseUserTimelineResponse: sets ingestedVia to graphql-likes', () => {
  const resp = makeUserTimelineResponse([makeTweetResult()]);
  const { records } = parseUserTimelineResponse(resp, 'graphql-likes', NOW);

  assert.equal(records[0].ingestedVia, 'graphql-likes');
});

test('parseUserTimelineResponse: sets ingestedVia to graphql-feed', () => {
  const resp = makeFeedResponse([makeTweetResult()]);
  const { records } = parseUserTimelineResponse(resp, 'graphql-feed', NOW);

  assert.equal(records[0].ingestedVia, 'graphql-feed');
});

// ── likedAt extraction ───────────────────────────────────────────

test('parseUserTimelineResponse: sets likedAt from sortIndex when ingestedVia is graphql-likes', () => {
  const tr = makeTweetResult();
  const resp = {
    data: {
      user: {
        result: {
          timeline_v2: {
            timeline: {
              instructions: [{
                type: 'TimelineAddEntries',
                entries: [{
                  entryId: 'tweet-0',
                  sortIndex: '2031116076166176768',
                  content: {
                    itemContent: { tweet_results: { result: tr } },
                  },
                }],
              }],
            },
          },
        },
      },
    },
  };
  const { records } = parseUserTimelineResponse(resp, 'graphql-likes', NOW);

  assert.equal(records.length, 1);
  // likedAt should be converted from snowflake to ISO date
  assert.ok(records[0].likedAt, 'likedAt should be defined');
  assert.ok(!Number.isNaN(Date.parse(records[0].likedAt!)), `likedAt should be a valid ISO date, got: ${records[0].likedAt}`);
});

test('parseUserTimelineResponse: does not set likedAt when ingestedVia is not graphql-likes', () => {
  const tr = makeTweetResult();
  const resp = {
    data: {
      user: {
        result: {
          timeline_v2: {
            timeline: {
              instructions: [{
                type: 'TimelineAddEntries',
                entries: [{
                  entryId: 'tweet-0',
                  sortIndex: '2031116076166176768',
                  content: {
                    itemContent: { tweet_results: { result: tr } },
                  },
                }],
              }],
            },
          },
        },
      },
    },
  };
  const { records } = parseUserTimelineResponse(resp, 'graphql-timeline', NOW);

  assert.equal(records.length, 1);
  assert.equal(records[0].likedAt, undefined);
});

test('parseUserTimelineResponse: does not set likedAt when sortIndex is absent', () => {
  const resp = makeUserTimelineResponse([makeTweetResult()]);
  const { records } = parseUserTimelineResponse(resp, 'graphql-likes', NOW);

  assert.equal(records.length, 1);
  assert.equal(records[0].likedAt, undefined);
});
