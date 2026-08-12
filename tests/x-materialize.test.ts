import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchTweetDetailViaGraphQL } from '../src/graphql-bookmarks.js';
import { refreshExactXBookmark } from '../src/x-materialize.js';
import { parseTweetDetailResponse } from '../src/tweet-snapshots.js';
import { XRequestExecutor } from '../src/x-request-policy.js';
import type { BookmarkRecord } from '../src/types.js';

function tweet(id: string, text: string, parent?: string) {
  return {
    rest_id: id,
    legacy: {
      id_str: id,
      full_text: text,
      created_at: 'Tue Mar 10 12:00:00 +0000 2026',
      conversation_id_str: '100',
      in_reply_to_status_id_str: parent,
      entities: { urls: [] },
    },
    core: {
      user_results: {
        result: {
          rest_id: '1',
          core: { screen_name: 'operator', name: 'Operator' },
          legacy: {},
        },
      },
    },
  };
}

function detailResponse(rows: unknown[], cursor?: string) {
  return {
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [{
          type: 'TimelineAddEntries',
          entries: [
            ...rows.map((row: any) => ({
              entryId: `tweet-${row.rest_id}`,
              content: { itemContent: { tweet_results: { result: row } } },
            })),
            ...(cursor ? [{ entryId: 'cursor-bottom-next', content: { value: cursor } }] : []),
          ],
        }],
      },
    },
  };
}

function archived(): BookmarkRecord {
  return {
    id: '100',
    tweetId: '100',
    url: 'https://x.com/operator/status/100',
    text: 'Archived root.',
    authorHandle: 'operator',
    syncedAt: '2026-08-01T00:00:00.000Z',
  };
}

test('refreshExactXBookmark refreshes one root and bounded thread in memory', async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    seen.push(url);
    if (url.includes('/TweetResultByRestId?')) {
      const variables = JSON.parse(new URL(url).searchParams.get('variables') ?? '{}');
      const row = variables.tweetId === '99'
        ? tweet('99', 'Parent context.')
        : variables.tweetId === '98'
          ? tweet('98', 'Current quoted source.')
          : tweet('100', 'Current root.', '99');
      return new Response(JSON.stringify({ data: { tweetResult: { result: row } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/TweetDetail?')) {
      return new Response(JSON.stringify(detailResponse([
        tweet('100', 'Current root.', '99'),
        tweet('101', 'Same-author continuation.', '100'),
      ])), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  try {
    const source = archived();
    source.quotedStatusId = '98';
    source.quotedTweet = {
      id: '98',
      text: 'Old quote.',
      url: 'https://x.com/operator/status/98',
    };
    const result = await refreshExactXBookmark(source, {
      csrfToken: 'ct0',
      cookieHeader: 'ct0=ct0; auth_token=auth',
      delayMs: 0,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'complete');
    assert.equal(result.observation.parent_termination, 'root');
    assert.equal(result.observation.continuation_termination, 'exhausted');
    assert.equal(result.record.text, 'Current root.');
    assert.deepEqual(result.record.threadContext?.map((row) => row.id), ['99']);
    assert.deepEqual(result.record.threadBelow?.map((row) => row.id), ['101']);
    assert.equal(result.record.quotedTweet?.text, 'Current quoted source.');
    assert.equal(result.record.threadExpandedAt, '2026-08-11T00:00:00.000Z');
    assert.equal(seen.filter((url) => url.includes('/TweetResultByRestId?')).length, 3);
    assert.equal(seen.filter((url) => url.includes('/TweetDetail?')).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark preserves archived bytes when the exact root is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
  const source = archived();
  try {
    const result = await refreshExactXBookmark(source, {
      csrfToken: 'ct0',
      delayMs: 0,
    });
    assert.equal(result.observation.status, 'unavailable');
    assert.deepEqual(result.record, source);
    assert.equal(result.observation.quote_status, 'ok');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark rejects a mismatched exact-id response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    data: { tweetResult: { result: tweet('999', 'Wrong root.') } },
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  const source = archived();
  try {
    const result = await refreshExactXBookmark(source, { csrfToken: 'ct0', delayMs: 0 });
    assert.equal(result.observation.status, 'unavailable');
    assert.equal(result.observation.root_status, 'error');
    assert.deepEqual(result.record, source);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark reports a remaining continuation cursor as partial', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetResultByRestId?')) {
      return new Response(JSON.stringify({ data: { tweetResult: { result: tweet('100', 'Current root.') } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(detailResponse([
      tweet('100', 'Current root.'),
      tweet('101', 'Continuation.', '100'),
    ], 'MORE')), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await refreshExactXBookmark(archived(), {
      csrfToken: 'ct0',
      delayMs: 0,
      maxPages: 1,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'partial');
    assert.equal(result.observation.continuation_enumeration_complete, false);
    assert.equal(result.observation.continuation_termination, 'limit');
    assert.equal(result.record.threadExpandedAt, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark traverses every supported continuation branch before completion', async () => {
  const originalFetch = globalThis.fetch;
  const detailCursors: Array<string | undefined> = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetResultByRestId?')) {
      return new Response(JSON.stringify({ data: { tweetResult: { result: tweet('100', 'Current root.') } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const variables = JSON.parse(new URL(url).searchParams.get('variables') ?? '{}');
    const cursor = variables.cursor as string | undefined;
    detailCursors.push(cursor);
    const response = cursor === 'BRANCH_A'
      ? detailResponse([tweet('101', 'First continuation branch.', '100')])
      : cursor === 'BRANCH_B'
        ? detailResponse([tweet('102', 'Second continuation branch.', '100')])
        : {
          data: {
            threaded_conversation_with_injections_v2: {
              instructions: [{
                type: 'TimelineAddEntries',
                entries: [
                  { entryId: 'tweet-100', content: { itemContent: { tweet_results: { result: tweet('100', 'Current root.') } } } },
                  { entryId: 'cursor-bottom-a', content: { value: 'BRANCH_A' } },
                  { entryId: 'cursor-showmorethreads-b', content: { value: 'BRANCH_B' } },
                ],
              }],
            },
          },
        };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    const result = await refreshExactXBookmark(archived(), {
      csrfToken: 'ct0',
      delayMs: 0,
      maxPages: 3,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'complete');
    assert.equal(result.observation.continuation_termination, 'exhausted');
    assert.deepEqual(detailCursors, [undefined, 'BRANCH_A', 'BRANCH_B']);
    assert.deepEqual(result.record.threadBelow?.map((row) => row.id), ['101', '102']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark keeps a recognized tweet-free timeline partial', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetResultByRestId?')) {
      return new Response(JSON.stringify({ data: { tweetResult: { result: tweet('100', 'Current root.') } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      data: { threaded_conversation_with_injections_v2: { instructions: [] } },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await refreshExactXBookmark(archived(), {
      csrfToken: 'ct0',
      delayMs: 0,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'partial');
    assert.equal(result.observation.continuation_status, 'empty');
    assert.equal(result.observation.continuation_termination, 'empty');
    assert.equal(result.observation.continuation_enumeration_complete, false);
    assert.equal(result.record.threadExpandedAt, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark requires the focal tweet before completing traversal', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetResultByRestId?')) {
      return new Response(JSON.stringify({ data: { tweetResult: { result: tweet('100', 'Current root.') } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(detailResponse([
      tweet('999', 'Unrelated parseable timeline entry.'),
    ])), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await refreshExactXBookmark(archived(), {
      csrfToken: 'ct0',
      delayMs: 0,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'partial');
    assert.equal(result.observation.continuation_termination, 'missing_focal');
    assert.deepEqual(result.record.threadBelow, []);
    assert.equal(result.record.threadExpandedAt, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark fails closed on an unknown entry beside the focal tweet', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetResultByRestId?')) {
      return new Response(JSON.stringify({ data: { tweetResult: { result: tweet('100', 'Current root.') } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [{
            type: 'TimelineAddEntries',
            entries: [
              {
                entryId: 'tweet-100',
                content: { itemContent: { tweet_results: { result: tweet('100', 'Current root.') } } },
              },
              {
                entryId: 'future-thread-envelope',
                content: { futureThreadItems: [{ opaque: true }] },
              },
            ],
          }],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await refreshExactXBookmark(archived(), {
      csrfToken: 'ct0',
      delayMs: 0,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'partial');
    assert.equal(result.observation.continuation_termination, 'parser_gap');
    assert.equal(result.observation.continuation_enumeration_complete, false);
    assert.equal(result.record.threadExpandedAt, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark converts a malformed TweetDetail body into a partial observation', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetResultByRestId?')) {
      return new Response(JSON.stringify({ data: { tweetResult: { result: tweet('100', 'Current root.') } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('<html>transient edge response</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  }) as typeof fetch;
  try {
    const result = await refreshExactXBookmark(archived(), {
      csrfToken: 'ct0',
      delayMs: 0,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'partial');
    assert.equal(result.observation.continuation_status, 'error');
    assert.equal(result.observation.continuation_termination, 'error');
    assert.equal(result.observation.continuation_enumeration_complete, false);
    assert.equal(result.record.threadExpandedAt, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark applies the configured delay before every request after the root', async () => {
  const originalFetch = globalThis.fetch;
  const requestTimes: number[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestTimes.push(Date.now());
    const url = String(input);
    if (url.includes('/TweetDetail?')) {
      return new Response(JSON.stringify(detailResponse([tweet('100', 'Current root.')])), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const variables = JSON.parse(new URL(url).searchParams.get('variables') ?? '{}');
    const row = variables.tweetId === '98'
      ? tweet('98', 'Current quoted source.')
      : tweet('100', 'Current root.');
    return new Response(JSON.stringify({ data: { tweetResult: { result: row } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const source = archived();
  source.quotedStatusId = '98';
  try {
    const result = await refreshExactXBookmark(source, {
      csrfToken: 'ct0',
      delayMs: 20,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'complete');
    assert.equal(requestTimes.length, 3);
    assert.ok(requestTimes[1] - requestTimes[0] >= 15);
    assert.ok(requestTimes[2] - requestTimes[1] >= 15);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark does not promote stale archived article text under a fresh cutoff', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetResultByRestId?')) {
      return new Response(JSON.stringify({ data: { tweetResult: { result: tweet('100', 'Current root.') } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(detailResponse([tweet('100', 'Current root.')])), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const source = archived();
  source.articleTitle = 'Archived article';
  source.articleText = 'Stale archived article body that must not inherit the refresh cutoff.';
  source.articleSite = 'X Articles';
  try {
    const result = await refreshExactXBookmark(source, {
      csrfToken: 'ct0',
      delayMs: 0,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'partial');
    assert.equal(result.observation.article_status, 'unresolved');
    assert.equal(result.record.articleText, null);
    assert.equal(result.record.threadExpandedAt, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark retains source-bound enrichment when the current focal locator still matches', async () => {
  const articleLocator = 'https://x.com/i/article/2042676487711584257';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetResultByRestId?')) {
      const row = tweet('100', 'Current root with the same article identity.');
      row.legacy.entities.urls = [{ expanded_url: articleLocator }];
      return new Response(JSON.stringify({ data: { tweetResult: { result: row } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(detailResponse([
      tweet('100', 'Current root with the same article identity.'),
    ])), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const source = archived();
  source.links = [articleLocator];
  source.articleTitle = 'Bound indexed article';
  source.articleText = 'Legitimate source-bound SQLite enrichment.';
  source.articleSite = 'X Articles';
  source.articleSourceTweetId = source.tweetId;
  source.articleLocator = articleLocator;
  try {
    const result = await refreshExactXBookmark(source, {
      csrfToken: 'ct0',
      delayMs: 0,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'partial');
    assert.equal(result.observation.article_status, 'unresolved');
    assert.equal(result.record.articleText, 'Legitimate source-bound SQLite enrichment.');
    assert.equal(result.record.articleSourceTweetId, source.tweetId);
    assert.equal(result.record.articleLocator, articleLocator);
    assert.equal(result.record.threadExpandedAt, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark clears contradicted or wrong-root enrichment', async () => {
  const oldLocator = 'https://x.com/i/article/2042676487711584257';
  const currentLocator = 'https://x.com/i/article/2042676487711584258';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetResultByRestId?')) {
      const row = tweet('100', 'Current root with a replacement article identity.');
      row.legacy.entities.urls = [{ expanded_url: currentLocator }];
      return new Response(JSON.stringify({ data: { tweetResult: { result: row } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(detailResponse([
      tweet('100', 'Current root with a replacement article identity.'),
    ])), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const source = archived();
  source.links = [oldLocator];
  source.articleText = 'Bound content for the old locator.';
  source.articleSourceTweetId = source.tweetId;
  source.articleLocator = oldLocator;
  try {
    const result = await refreshExactXBookmark(source, {
      csrfToken: 'ct0',
      delayMs: 0,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'partial');
    assert.equal(result.observation.article_status, 'unresolved');
    assert.equal(result.record.articleText, null);
    assert.equal(result.record.articleSourceTweetId, null);
    assert.equal(result.record.articleLocator, null);
    assert.deepEqual(result.record.links, [currentLocator]);

    const wrongRoot = archived();
    wrongRoot.links = [currentLocator];
    wrongRoot.articleText = 'Content supplied by a different tweet.';
    wrongRoot.articleSourceTweetId = '999';
    wrongRoot.articleLocator = currentLocator;
    const rejected = await refreshExactXBookmark(wrongRoot, {
      csrfToken: 'ct0',
      delayMs: 0,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(rejected.observation.article_status, 'unresolved');
    assert.equal(rejected.record.articleText, null);
    assert.equal(rejected.record.articleSourceTweetId, null);
    assert.equal(rejected.record.articleLocator, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark remains partial when the current root identifies an unrecovered X Article', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetResultByRestId?')) {
      const row = tweet('100', 'Current root with an X Article.');
      row.legacy.entities.urls = [{
        expanded_url: 'https://x.com/i/article/2042676487711584257',
      }];
      return new Response(JSON.stringify({ data: { tweetResult: { result: row } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(detailResponse([
      tweet('100', 'Current root with an X Article.'),
    ])), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    const result = await refreshExactXBookmark(archived(), {
      csrfToken: 'ct0',
      delayMs: 0,
      now: '2026-08-11T00:00:00.000Z',
    });
    assert.equal(result.observation.status, 'partial');
    assert.equal(result.observation.article_status, 'unresolved');
    assert.equal(result.record.articleText, null);
    assert.equal(result.record.threadExpandedAt, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('TweetDetail recognizes every supported continuation cursor location', () => {
  const entries = [
    { entryId: 'cursor-bottom-a', content: { value: 'BOTTOM' } },
    { entryId: 'sq-cursor-bottom-a', content: { value: 'SQ_BOTTOM' } },
    { entryId: 'cursor-showmorethreads-b', content: { itemContent: { value: 'ITEM' } } },
    { entryId: 'cursor-showmorethreads-c', content: { operation: { cursor: { value: 'OPERATION' } } } },
  ];
  for (const [entry, expected] of entries.map((entry, index) => [entry, ['BOTTOM', 'SQ_BOTTOM', 'ITEM', 'OPERATION'][index]] as const)) {
    const parsed = parseTweetDetailResponse({
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [{ type: 'TimelineAddEntries', entries: [entry] }],
        },
      },
    });
    assert.equal(parsed.nextCursor, expected);
    assert.equal(parsed.sawUnparseableTweet, false);
  }
});

test('TweetDetail preserves every supported continuation cursor in one timeline', () => {
  const parsed = parseTweetDetailResponse({
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [{
          type: 'TimelineAddEntries',
          entries: [
            { entryId: 'cursor-bottom-a', content: { value: 'BOTTOM' } },
            { entryId: 'cursor-showmorethreads-b', content: { value: 'SHOW_MORE' } },
          ],
        }],
      },
    },
  });
  assert.deepEqual(parsed.continuationCursors, ['BOTTOM', 'SHOW_MORE']);
  assert.equal(parsed.sawUnparseableTweet, false);
});

test('TweetDetail consumes a continuation cursor from TimelineReplaceEntry', () => {
  const parsed = parseTweetDetailResponse({
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [{
          type: 'TimelineReplaceEntry',
          entry: { entryId: 'cursor-bottom-replacement', content: { value: 'REPLACED' } },
        }],
      },
    },
  });
  assert.equal(parsed.nextCursor, 'REPLACED');
  assert.equal(parsed.sawUnparseableTweet, false);
});

test('TweetDetail fails closed on cursor entries in an unknown instruction envelope', () => {
  const parsed = parseTweetDetailResponse({
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [{
          type: 'TimelineUnknownEntries',
          entries: [{ entryId: 'cursor-new-envelope', content: { value: 'MORE' } }],
        }],
      },
    },
  });
  assert.equal(parsed.nextCursor, undefined);
  assert.equal(parsed.sawUnparseableTweet, true);
});

test('TweetDetail fails closed on an unsupported or valueless cursor entry', () => {
  for (const entry of [
    { entryId: 'cursor-showmorethreads-empty', content: {} },
    { entryId: 'cursor-new-continuation-shape', content: { value: 'UNKNOWN' } },
  ]) {
    const parsed = parseTweetDetailResponse({
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [{ type: 'TimelineAddEntries', entries: [entry] }],
        },
      },
    });
    assert.equal(parsed.nextCursor, undefined);
    assert.equal(parsed.sawUnparseableTweet, true);
  }
});

test('TweetDetail fails closed on a tweet envelope with no response-owned result', () => {
  for (const tweetResults of [{}, { result: null }]) {
    const parsed = parseTweetDetailResponse({
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [{
            type: 'TimelineAddEntries',
            entries: [{
              entryId: 'tweet-malformed',
              content: { itemContent: { tweet_results: tweetResults } },
            }],
          }],
        },
      },
    });
    assert.equal(parsed.sawUnparseableTweet, true);
    assert.deepEqual(parsed.parserGaps, ['unparseable_entry']);
  }
});

test('TweetDetail fails closed on an unconsumed module item beside a valid focal tweet', () => {
  const parsed = parseTweetDetailResponse({
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [{
          type: 'TimelineAddEntries',
          entries: [
            {
              entryId: 'tweet-100',
              content: { itemContent: { tweet_results: { result: tweet('100', 'Current root.') } } },
            },
            {
              entryId: 'conversation-module-1',
              content: {
                items: [{
                  entryId: 'module-item-unknown',
                  item: { itemContent: { futureThreadEnvelope: { opaque: true } } },
                }],
              },
            },
          ],
        }],
      },
    },
  });
  assert.equal(parsed.tweets.some((row) => row.id === '100'), true);
  assert.deepEqual(parsed.parserGaps, ['unparseable_entry']);
});

test('TweetDetail fails closed on an unknown instruction without entries', () => {
  const parsed = parseTweetDetailResponse({
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [{ type: 'TimelineFutureInstruction', opaque: true }],
      },
    },
  });
  assert.deepEqual(parsed.parserGaps, ['unknown_instruction']);
});

test('TweetDetail keeps a terminally failed cursor pending instead of processed', async () => {
  let request = 0;
  const executor = new XRequestExecutor({
    delayMs: 0,
    maxAttempts: 1,
    fetchImpl: async () => {
      request += 1;
      if (request === 1) {
        return new Response(JSON.stringify(detailResponse([tweet('100', 'Current root.')], 'PAGE-2')), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 500 });
    },
  });
  const result = await fetchTweetDetailViaGraphQL('100', 'ct0', undefined, { executor });
  assert.equal(result.enumerationComplete, false);
  assert.equal(result.enumerationTermination, 'error');
  assert.deepEqual(result.pendingCursors, ['PAGE-2']);
  assert.deepEqual(result.processedCursors, []);
});

test('refreshExactXBookmark rejects identity-less parent and quote responses', async () => {
  const originalFetch = globalThis.fetch;
  const identityless = (text: string) => {
    const row = tweet('999', text);
    delete row.rest_id;
    delete row.legacy.id_str;
    return row;
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetResultByRestId?')) {
      const variables = JSON.parse(new URL(url).searchParams.get('variables') ?? '{}');
      const row = variables.tweetId === '100'
        ? tweet('100', 'Current root.', '99')
        : identityless(variables.tweetId === '99' ? 'Identity-less parent.' : 'Identity-less quote.');
      return new Response(JSON.stringify({ data: { tweetResult: { result: row } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(detailResponse([tweet('100', 'Current root.')])), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const source = archived();
  source.quotedStatusId = '98';
  try {
    const result = await refreshExactXBookmark(source, { csrfToken: 'ct0', delayMs: 0 });
    assert.equal(result.observation.status, 'partial');
    assert.equal(result.observation.parent_status, 'error');
    assert.equal(result.observation.parent_termination, 'error');
    assert.equal(result.observation.quote_status, 'error');
    assert.equal(result.record.threadExpandedAt, undefined);
    assert.equal(result.record.quotedTweet, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshExactXBookmark sends helper retries through the shared configured request executor', async () => {
  const sleeps: number[] = [];
  let attempts = 0;
  const executor = new XRequestExecutor({
    delayMs: 41,
    fetchImpl: (async (input: string | URL | Request) => {
      attempts += 1;
      const url = String(input);
      if (attempts === 1) throw new Error('retry root');
      if (url.includes('/TweetDetail?')) {
        return new Response(JSON.stringify(detailResponse([tweet('100', 'Current root.')])), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { tweetResult: { result: tweet('100', 'Current root.') } } }), { status: 200 });
    }) as typeof fetch,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    retryBackoffMs: () => 0,
  });

  const result = await refreshExactXBookmark(archived(), {
    csrfToken: 'ct0',
    delayMs: 41,
    requestExecutor: executor,
    now: '2026-08-11T00:00:00.000Z',
  });
  assert.equal(result.observation.status, 'complete');
  assert.equal(executor.attemptCount, 3);
  assert.deepEqual(sleeps, [41, 41]);
});

test('refreshExactXBookmark distinguishes cyclic and limited parent traversal from root termination', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/TweetDetail?')) {
      return new Response(JSON.stringify(detailResponse([tweet('100', 'Current root.', '99')])), { status: 200 });
    }
    const variables = JSON.parse(new URL(url).searchParams.get('variables') ?? '{}');
    const row = variables.tweetId === '100'
      ? tweet('100', 'Current root.', '99')
      : variables.tweetId === '99'
        ? tweet('99', 'Parent.', '100')
        : tweet('98', 'Grandparent.');
    return new Response(JSON.stringify({ data: { tweetResult: { result: row } } }), { status: 200 });
  }) as typeof fetch;

  try {
    const cyclic = await refreshExactXBookmark(archived(), { csrfToken: 'ct0', delayMs: 0 });
    assert.equal(cyclic.observation.status, 'partial');
    assert.equal(cyclic.observation.parent_termination, 'cycle');
    assert.equal(cyclic.record.threadExpandedAt, undefined);

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/TweetDetail?')) {
        return new Response(JSON.stringify(detailResponse([tweet('100', 'Current root.', '99')])), { status: 200 });
      }
      const variables = JSON.parse(new URL(url).searchParams.get('variables') ?? '{}');
      const row = variables.tweetId === '100'
        ? tweet('100', 'Current root.', '99')
        : tweet('99', 'Parent.', '98');
      return new Response(JSON.stringify({ data: { tweetResult: { result: row } } }), { status: 200 });
    }) as typeof fetch;
    const limited = await refreshExactXBookmark(archived(), {
      csrfToken: 'ct0',
      delayMs: 0,
      maxParents: 1,
    });
    assert.equal(limited.observation.status, 'partial');
    assert.equal(limited.observation.parent_termination, 'limit');
    assert.equal(limited.observation.parent_limit_reached, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
