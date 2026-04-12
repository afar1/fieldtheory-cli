import test from 'node:test';
import assert from 'node:assert/strict';
import { unlikeTweet, unbookmarkTweet } from '../src/graphql-actions.js';

test('unlikeTweet posts the current X web mutation with tweet_id variables', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestBody = '';
  let requestHeaders: Headers | undefined;

  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestBody = String(init?.body ?? '');
    requestHeaders = new Headers(init?.headers as HeadersInit | undefined);
    return new Response(JSON.stringify({ data: { unfavorite_tweet: 'Done' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  process.env.FT_X_API_ORIGIN = 'https://x.test';

  try {
    const result = await unlikeTweet('123', {
      csrfToken: 'ct0-token',
      cookieHeader: 'ct0=ct0-token; auth_token=auth',
    });

    assert.equal(result.operation, 'unlike');
    assert.match(requestUrl, /https:\/\/x\.test\/i\/api\/graphql\/ZYKSe-w7KEslx3JhSIk5LA\/UnfavoriteTweet$/);
    assert.deepEqual(JSON.parse(requestBody), {
      variables: { tweet_id: '123' },
      queryId: 'ZYKSe-w7KEslx3JhSIk5LA',
    });
    assert.equal(requestHeaders?.get('x-csrf-token'), 'ct0-token');
    assert.match(requestHeaders?.get('cookie') ?? '', /auth_token=auth/);
  } finally {
    delete process.env.FT_X_API_ORIGIN;
    globalThis.fetch = originalFetch;
  }
});

test('unbookmarkTweet maps auth failures to re-login guidance', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('forbidden', { status: 403 })) as typeof fetch;

  try {
    await assert.rejects(
      unbookmarkTweet('456', {
        csrfToken: 'ct0-token',
        cookieHeader: 'ct0=ct0-token',
      }),
      /make sure you are logged in/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
