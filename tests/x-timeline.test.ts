import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimelineUrl, captureXTimeline, parseOperationMetadata, parseTimelineResponse } from '../src/x-timeline.js';

const operation = {
  queryId: 'query-id',
  operationName: 'HomeTimeline' as const,
  featureNames: ['longform_notetweets_consumption_enabled'],
  fieldToggleNames: ['withArticlePlainText'],
  source: 'fallback' as const,
};

function tweet(id: string, text = `post ${id}`): any {
  return {
    rest_id: id,
    legacy: {
      id_str: id,
      full_text: text,
      created_at: 'Tue Jul 14 18:00:00 +0000 2026',
      favorite_count: 4,
      retweet_count: 2,
      reply_count: 1,
      quote_count: 0,
      bookmark_count: 1,
      entities: { urls: [] },
    },
    core: {
      user_results: {
        result: { rest_id: `user-${id}`, core: { screen_name: `author${id}`, name: `Author ${id}` } },
      },
    },
    views: { count: '12' },
  };
}

function response(entries: any[]): any {
  return {
    data: {
      home: {
        home_timeline_urt: {
          instructions: [{ type: 'TimelineAddEntries', entries }],
        },
      },
    },
  };
}

test('parseOperationMetadata reads current X client query metadata', () => {
  const source = 'queryId:"abc",operationName:"HomeTimeline",operationType:"query",metadata:{featureSwitches:["one","two"],fieldToggles:["withOne"]}';
  assert.deepEqual(parseOperationMetadata(source, 'HomeTimeline'), {
    queryId: 'abc',
    operationName: 'HomeTimeline',
    featureNames: ['one', 'two'],
    fieldToggleNames: ['withOne'],
    source: 'chrome-cache',
  });
});

test('buildTimelineUrl includes private GraphQL operation, cursor, seen posts, features, and field toggles', () => {
  const url = new URL(buildTimelineUrl('for-you', operation, 40, 'cursor-1', ['seen-1']));
  assert.equal(url.pathname, '/i/api/graphql/query-id/HomeTimeline');
  assert.equal(JSON.parse(url.searchParams.get('variables')!).cursor, 'cursor-1');
  assert.deepEqual(JSON.parse(url.searchParams.get('variables')!).seenTweetIds, ['seen-1']);
  assert.equal(JSON.parse(url.searchParams.get('features')!).longform_notetweets_consumption_enabled, true);
  assert.equal(JSON.parse(url.searchParams.get('fieldToggles')!).withArticlePlainText, false);
});

test('parseTimelineResponse finds primary posts, promotions, modules, and the bottom cursor', () => {
  const parsed = parseTimelineResponse(response([
    {
      entryId: 'tweet-1',
      sortIndex: '20',
      content: { itemContent: { tweet_results: { result: tweet('1') } } },
    },
    {
      entryId: 'promoted-tweet-2',
      sortIndex: '19',
      content: { itemContent: { tweet_results: { result: tweet('2') } } },
    },
    {
      entryId: 'module-1',
      sortIndex: '18',
      content: { items: [{ item: { itemContent: { tweet_results: { result: tweet('3') } } } }] },
    },
    { entryId: 'cursor-bottom-1', content: { cursorType: 'Bottom', value: 'next-cursor' } },
  ]));
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[1].promoted, true);
  assert.equal(parsed.nextCursor, 'next-cursor');
});

test('parseTimelineResponse reads replacement cursors', () => {
  const parsed = parseTimelineResponse({
    data: {
      home: {
        home_timeline_urt: {
          instructions: [{
            type: 'TimelineReplaceEntry',
            entry: { entryId: 'cursor-bottom-replacement', content: { cursorType: 'Bottom', value: 'replacement-cursor' } },
          }],
        },
      },
    },
  });
  assert.equal(parsed.nextCursor, 'replacement-cursor');
});

test('parseTimelineResponse preserves promoted IDs on added module items', () => {
  const parsed = parseTimelineResponse({
    data: {
      home: {
        home_timeline_urt: {
          instructions: [{
            type: 'TimelineAddToModule',
            moduleItems: [{
              entryId: 'promoted-module-tweet-9',
              item: { itemContent: { tweet_results: { result: tweet('9') } } },
            }],
          }],
        },
      },
    },
  });
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].promoted, true);
});

test('captureXTimeline paginates, excludes promoted posts, deduplicates, and stops at the exact limit', async () => {
  const pages = [
    response([
      { entryId: 'tweet-1', sortIndex: '20', content: { itemContent: { tweet_results: { result: tweet('1') } } } },
      { entryId: 'ad-2', sortIndex: '19', content: { itemContent: { promotedMetadata: {}, tweet_results: { result: tweet('2') } } } },
      { entryId: 'cursor-bottom-1', content: { cursorType: 'Bottom', value: 'next' } },
    ]),
    response([
      { entryId: 'tweet-1-again', sortIndex: '18', content: { itemContent: { tweet_results: { result: tweet('1') } } } },
      { entryId: 'tweet-3', sortIndex: '17', content: { itemContent: { tweet_results: { result: tweet('3') } } } },
      { entryId: 'tweet-4', sortIndex: '16', content: { itemContent: { tweet_results: { result: tweet('4') } } } },
      { entryId: 'cursor-bottom-2', content: { cursorType: 'Bottom', value: 'last' } },
    ]),
  ];
  let calls = 0;
  const fetcher = (async () => new Response(JSON.stringify(pages[calls++]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
  const result = await captureXTimeline('for-you', {
    limit: 3,
    delayMs: 0,
    csrfToken: 'csrf',
    cookieHeader: 'ct0=csrf; auth_token=auth',
    operation,
    fetcher,
  });
  assert.equal(result.retainedCount, 3);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.excludedPromoted, 1);
  assert.equal(result.excludedDuplicates, 1);
  assert.deepEqual(result.posts.map((post) => [post.position, post.id]), [[1, '1'], [2, '3'], [3, '4']]);
});

test('captureXTimeline refuses to label a partial sample complete', async () => {
  const fetcher = (async () => new Response(JSON.stringify(response([
    { entryId: 'tweet-1', content: { itemContent: { tweet_results: { result: tweet('1') } } } },
  ])), { status: 200 })) as typeof fetch;
  await assert.rejects(
    captureXTimeline('for-you', {
      limit: 2,
      delayMs: 0,
      csrfToken: 'csrf',
      operation,
      fetcher,
    }),
    /retained 1 of 2 requested/,
  );
});

test('captureXTimeline stops immediately when X repeats a pagination cursor', async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    return new Response(JSON.stringify(response([
      { entryId: `tweet-${calls}`, content: { itemContent: { tweet_results: { result: tweet(String(calls)) } } } },
      { entryId: 'cursor-bottom', content: { cursorType: 'Bottom', value: 'same-cursor' } },
    ])), { status: 200 });
  }) as typeof fetch;
  await assert.rejects(
    captureXTimeline('for-you', {
      limit: 3,
      delayMs: 0,
      csrfToken: 'csrf',
      operation,
      fetcher,
    }),
    /same for-you pagination cursor twice/,
  );
  assert.equal(calls, 2);
});
