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

test('XRequestExecutor maps malformed successful bodies to a terminal decoding error', async () => {
  const executor = new XRequestExecutor({
    fetchImpl: (async () => new Response('<html>not json</html>', { status: 200 })) as typeof fetch,
  });
  const result = await executor.requestJson('https://x.com/malformed');
  assert.equal(result.status, 'error');
  assert.equal(result.httpStatus, 200);
  assert.equal(result.attempts, 1);
});
