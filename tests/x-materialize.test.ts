import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshExactXBookmark } from '../src/x-materialize.js';
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
    assert.equal(result.record.threadExpandedAt, undefined);
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
