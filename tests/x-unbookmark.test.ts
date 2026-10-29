import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DELETE_BOOKMARK_QUERY_ID,
  createUnbookmarker,
  discoverQueryId,
  unbookmarkTweetOnX,
} from '../src/x-unbookmark.js';

const session = { csrfToken: 'ct0-token', cookieHeader: 'ct0=ct0-token; auth_token=auth' };

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

type Call = { url: string; init?: RequestInit };

function recordingFetch(handler: (call: Call, index: number) => Response | Promise<Response>): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('unbookmarkTweetOnX: posts DeleteBookmark with session headers and reports removed', async () => {
  const { fetchImpl, calls } = recordingFetch(() => jsonResponse({ data: { tweet_bookmark_delete: 'Done' } }));
  const result = await unbookmarkTweetOnX('1234567890', { session, fetchImpl });

  assert.deepEqual({ ok: result.ok, status: result.status }, { ok: true, status: 'removed' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://x.com/i/api/graphql/${DELETE_BOOKMARK_QUERY_ID}/DeleteBookmark`);
  assert.equal(calls[0].init?.method, 'POST');
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers['x-csrf-token'], 'ct0-token');
  assert.equal(headers.cookie, session.cookieHeader);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    variables: { tweet_id: '1234567890' },
    queryId: DELETE_BOOKMARK_QUERY_ID,
  });
});

test('unbookmarkTweetOnX: an already-removed bookmark counts as success', async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse({ errors: [{ message: 'You have not bookmarked this post.' }] }));
  const result = await unbookmarkTweetOnX('1', { session, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'not_bookmarked');
});

test('unbookmarkTweetOnX: maps auth, rate-limit, server, and network failures', async () => {
  const cases: Array<[() => Response | Promise<Response>, string]> = [
    [() => jsonResponse({ errors: [{ message: 'Could not authenticate you' }] }, 401), 'auth'],
    [() => jsonResponse({}, 429, { 'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 60) }), 'rate_limited'],
    [() => jsonResponse({}, 503), 'rejected'],
    [() => { throw new Error('socket hang up'); }, 'network'],
  ];
  for (const [handler, expected] of cases) {
    const { fetchImpl } = recordingFetch(handler);
    const result = await unbookmarkTweetOnX('1', { session, fetchImpl });
    assert.equal(result.ok, false, expected);
    assert.equal(result.status, expected);
    assert.ok(result.message.length > 0);
    if (expected === 'rate_limited') assert.ok((result.retryAfterSec ?? 0) > 0);
  }
});

test('unbookmarkTweetOnX: an unknown-query error is not mistaken for success', async () => {
  const { fetchImpl } = recordingFetch(() => jsonResponse({ errors: [{ message: 'Query: Unspecified' }] }, 404));
  const result = await unbookmarkTweetOnX('1', { session, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.staleQueryId, true);
});

test('unbookmarkTweetOnX: rejects non-numeric tweet ids without calling X', async () => {
  const { fetchImpl, calls } = recordingFetch(() => jsonResponse({}));
  const result = await unbookmarkTweetOnX('../evil', { session, fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test('discoverQueryId: reads the operation queryId from the client bundle', async () => {
  const bundleUrl = 'https://abs.twimg.com/responsive-web/client-web/main.abc123.js';
  const { fetchImpl } = recordingFetch((call) => call.url === bundleUrl
    ? new Response('e.exports={queryId:"NEW-query_id",operationName:"DeleteBookmark",operationType:"mutation"}')
    : new Response(`<html><script src="${bundleUrl}"></script></html>`));
  assert.equal(await discoverQueryId('DeleteBookmark', session, fetchImpl), 'NEW-query_id');
});

test('createUnbookmarker: rediscovers a rotated queryId and retries once', async () => {
  const bundleUrl = 'https://abs.twimg.com/responsive-web/client-web/main.abc123.js';
  const { fetchImpl, calls } = recordingFetch((call) => {
    if (call.url.includes(`/${DELETE_BOOKMARK_QUERY_ID}/`)) return jsonResponse({}, 404);
    if (call.url.includes('/fresh-id/DeleteBookmark')) return jsonResponse({ data: { tweet_bookmark_delete: 'Done' } });
    if (call.url === bundleUrl) return new Response('{queryId:"fresh-id",operationName:"DeleteBookmark"}');
    return new Response(`<script src="${bundleUrl}"></script>`);
  });

  const unbookmark = createUnbookmarker({ csrfToken: session.csrfToken, cookieHeader: session.cookieHeader }, fetchImpl);
  const result = await unbookmark('42');
  assert.equal(result.status, 'removed');
  assert.equal('staleQueryId' in result, false);

  // The fresh queryId is reused for the next call, with no rediscovery.
  const before = calls.length;
  await unbookmark('43');
  assert.equal(calls.length, before + 1);
  assert.match(calls.at(-1)!.url, /\/fresh-id\/DeleteBookmark$/);
});
