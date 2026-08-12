import assert from 'node:assert/strict';
import test from 'node:test';
import { XRequestExecutor } from '../src/x-request-policy.js';

test('XRequestExecutor applies configured delay to every actual retry attempt', async () => {
  const sleeps: number[] = [];
  let calls = 0;
  const executor = new XRequestExecutor({
    delayMs: 37,
    fetchImpl: (async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient network failure');
      if (calls === 2) return new Response('temporary', { status: 503 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    retryBackoffMs: () => 5,
  });

  const result = await executor.requestJson('https://x.com/i/api/graphql/test');
  assert.equal(result.status, 'ok');
  assert.equal(result.attempts, 3);
  assert.equal(executor.attemptCount, 3);
  assert.deepEqual(sleeps, [37, 37]);
});

test('one XRequestExecutor schedules across logical helper boundaries', async () => {
  const sleeps: number[] = [];
  const executor = new XRequestExecutor({
    delayMs: 25,
    fetchImpl: (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
  });

  assert.equal((await executor.requestJson('https://x.com/first')).status, 'ok');
  assert.equal((await executor.requestJson('https://x.com/second')).status, 'ok');
  assert.deepEqual(sleeps, [25]);
});

test('one XRequestExecutor serializes admission for concurrent logical callers', async () => {
  const sleepReleases: Array<() => void> = [];
  const calls: string[] = [];
  const executor = new XRequestExecutor({
    delayMs: 25,
    fetchImpl: (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch,
    sleep: async () => new Promise<void>((resolve) => { sleepReleases.push(resolve); }),
  });

  const pending = Promise.all([
    executor.requestJson('https://x.com/first'),
    executor.requestJson('https://x.com/second'),
    executor.requestJson('https://x.com/third'),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, ['https://x.com/first']);
  assert.equal(sleepReleases.length, 1);

  sleepReleases.shift()!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls, ['https://x.com/first', 'https://x.com/second']);
  assert.equal(sleepReleases.length, 1);

  sleepReleases.shift()!();
  const results = await pending;
  assert.deepEqual(calls, [
    'https://x.com/first',
    'https://x.com/second',
    'https://x.com/third',
  ]);
  assert.equal(results.every((result) => result.status === 'ok'), true);
  assert.equal(executor.attemptCount, 3);
});

test('attempt admission recovers without counting a rejected injected wait as an HTTP attempt', async () => {
  let calls = 0;
  let waits = 0;
  const executor = new XRequestExecutor({
    delayMs: 25,
    fetchImpl: (async () => {
      calls += 1;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch,
    sleep: async () => {
      waits += 1;
      if (waits === 1) throw new Error('injected scheduler failure');
    },
  });

  assert.equal((await executor.requestJson('https://x.com/first')).status, 'ok');
  await assert.rejects(
    executor.requestJson('https://x.com/not-attempted'),
    /injected scheduler failure/,
  );
  assert.equal(executor.attemptCount, 1);
  assert.equal(calls, 1);

  assert.equal((await executor.requestJson('https://x.com/recovered')).status, 'ok');
  assert.equal(executor.attemptCount, 2);
  assert.equal(calls, 2);
  assert.equal(waits, 2);
});

test('XRequestExecutor maps malformed successful bodies to a terminal decoding error', async () => {
  const executor = new XRequestExecutor({
    fetchImpl: (async () => new Response('<html>not json</html>', { status: 200 })) as typeof fetch,
  });
  const result = await executor.requestJson('https://x.com/malformed');
  assert.equal(result.status, 'error');
  assert.equal(result.httpStatus, 200);
  assert.equal(result.attempts, 1);
});

test('XRequestExecutor keeps GraphQL semantics out of generic JSON decoding', async () => {
  const executor = new XRequestExecutor({
    fetchImpl: (async () => new Response(JSON.stringify({ errors: ['application field'], ok: true }), {
      status: 200,
    })) as typeof fetch,
  });
  const result = await executor.requestJson('https://example.com/not-graphql');
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.json, { errors: ['application field'], ok: true });
});

test('XRequestExecutor reports nonempty or malformed GraphQL errors without discarding partial data', async () => {
  for (const errors of [
    [{ message: 'partial branch unavailable' }],
    { message: 'malformed GraphQL errors shape' },
    null,
  ]) {
    const json = { data: { focal: { id: '100' } }, errors };
    const executor = new XRequestExecutor({
      fetchImpl: (async () => new Response(JSON.stringify(json), { status: 200 })) as typeof fetch,
    });
    const result = await executor.requestGraphqlJson('https://x.com/i/api/graphql/test');
    assert.equal(result.status, 'graphql_error');
    assert.deepEqual(result.json, json);
    assert.deepEqual(result.graphqlErrors, errors);
    assert.equal(result.httpStatus, 200);
  }
});

test('XRequestExecutor accepts an explicitly empty GraphQL errors list', async () => {
  const executor = new XRequestExecutor({
    fetchImpl: (async () => new Response(JSON.stringify({ data: { ok: true }, errors: [] }), {
      status: 200,
    })) as typeof fetch,
  });
  const result = await executor.requestGraphqlJson('https://x.com/i/api/graphql/test');
  assert.equal(result.status, 'ok');
});

test('one XRequestExecutor schedules JSON, HEAD, binary, and binary retry attempts', async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const sleeps: number[] = [];
  let binaryGets = 0;
  const executor = new XRequestExecutor({
    delayMs: 11,
    maxAttempts: 2,
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method });
      if (url.endsWith('/json')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: { 'content-length': '4', 'content-type': 'image/jpeg' },
        });
      }
      binaryGets += 1;
      if (binaryGets === 1) {
        return new Response('temporary', { status: 503 });
      }
      return new Response(Uint8Array.from([1, 2, 3, 4]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    }) as typeof fetch,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    retryBackoffMs: () => 29,
  });

  assert.equal((await executor.requestJson('https://example.com/json')).status, 'ok');
  const headers = await executor.requestHeaders('https://example.com/bytes', { method: 'HEAD' });
  assert.deepEqual(headers.headers, { contentLength: '4', contentType: 'image/jpeg' });
  const bytes = await executor.requestBytes('https://example.com/bytes');
  assert.deepEqual(bytes.bytes, Buffer.from([1, 2, 3, 4]));
  assert.equal(bytes.attempts, 2);
  assert.equal(executor.attemptCount, 4);
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'HEAD', 'GET', 'GET']);
  assert.deepEqual(sleeps, [11, 11, 29]);
});

test('an explicit zero delay introduces no artificial waits across request adapters', async () => {
  const sleeps: number[] = [];
  const executor = new XRequestExecutor({
    delayMs: 0,
    maxAttempts: 1,
    fetchImpl: (async (_input: string | URL | Request, init?: RequestInit) => init?.method === 'HEAD'
      ? new Response(null, { status: 200 })
      : new Response(Uint8Array.from([1]), { status: 200 })) as typeof fetch,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
  });

  assert.equal((await executor.requestHeaders('https://example.com/media', { method: 'HEAD' })).status, 'ok');
  assert.equal((await executor.requestBytes('https://example.com/media')).status, 'ok');
  assert.deepEqual(sleeps, []);
});

test('an aborted request is terminal without issuing or retrying an HTTP attempt', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const executor = new XRequestExecutor({
    fetchImpl: (async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    }) as typeof fetch,
  });

  const result = await executor.requestBytes('https://example.com/media', { signal: controller.signal });
  assert.equal(result.status, 'error');
  assert.equal(result.failureKind, 'aborted');
  assert.equal(result.attempts, 0);
  assert.equal(calls, 0);
  assert.equal(executor.attemptCount, 0);
});

test('terminal response state is local to one request and does not poison the shared executor', async () => {
  let calls = 0;
  const executor = new XRequestExecutor({
    maxAttempts: 1,
    fetchImpl: (async () => {
      calls += 1;
      return calls === 1
        ? new Response('missing', { status: 404 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch,
  });

  assert.equal((await executor.requestHeaders('https://example.com/missing')).status, 'not_found');
  assert.equal((await executor.requestJson('https://example.com/next')).status, 'ok');
  assert.equal(executor.attemptCount, 2);
});
