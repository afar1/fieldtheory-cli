import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBookmarksGraphQL } from '../src/graphql-bookmarks.js';

function page(id: string, cursor = 'next') {
  return new Response(JSON.stringify({ data: { bookmark_timeline_v2: { timeline: {
    instructions: [{ type: 'TimelineAddEntries', entries: [
      { entryId: 'tweet-1', content: { itemContent: { tweet_results: { result: {
        rest_id: id, legacy: { id_str: id, full_text: 'Bookmark', created_at: 'Tue Mar 10 12:00:00 +0000 2026', entities: { urls: [] } },
      } } } } },
      { entryId: 'cursor-bottom-1', content: { value: cursor } },
    ] }],
  } } } }));
}

async function isolated(fn: (dir: string) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-sync-recovery-'));
  const previous = process.env.FT_DATA_DIR;
  const originalFetch = globalThis.fetch;
  process.env.FT_DATA_DIR = dir;
  try { await fn(dir); } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const options = { csrfToken: 'test', cookieHeader: 'ct0=test', delayMs: 0 };

test('large incremental cache stops at known bookmarks without automatic backfill', async () => {
  await isolated(async dir => {
    fs.writeFileSync(path.join(dir, 'bookmarks.jsonl'), Array.from({ length: 9500 }, (_, i) =>
      JSON.stringify({ id: String(9500 - i), tweetId: String(9500 - i), text: 'Existing', ingestedVia: 'graphql' })).join('\n'));
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return page('9500'); }) as typeof fetch;
    const result = await syncBookmarksGraphQL({ ...options, maxPages: 4 });
    assert.equal(calls, 1);
    assert.equal(result.stopReason, 'caught up to newest stored bookmark');
    assert.equal(result.totalBookmarks, 9500);
  });
});

test('rate-limit wait is visible, cancellable, and finalizes metadata and cursor', async () => {
  await isolated(async dir => {
    const controller = new AbortController();
    let calls = 0;
    let waitVisible = false;
    globalThis.fetch = (async () => ++calls === 1 ? page('1') : new Response('', {
      status: 429, headers: { 'retry-after': '3600' },
    })) as typeof fetch;
    const result = await syncBookmarksGraphQL({ ...options, signal: controller.signal,
      onProgress: progress => {
        if (progress.stopReason?.includes('retry')) { waitVisible = true; controller.abort(); }
      },
    });
    assert.ok(waitVisible);
    assert.equal(calls, 2);
    assert.equal(result.stopReason, 'interrupted');
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'bookmarks-meta.json'), 'utf8'));
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'bookmarks-backfill-state.json'), 'utf8'));
    assert.equal(meta.totalBookmarks, 1);
    assert.ok(meta.lastIncrementalSyncAt);
    assert.equal(state.lastCursor, 'next');
    assert.equal(state.lastAdded, 1);
  });
});

test('sync runtime bounds an in-flight request and persists partial results', async () => {
  await isolated(async dir => {
    let calls = 0;
    globalThis.fetch = (async (_url, init) => {
      if (++calls === 1) return page('1');
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }) as typeof fetch;
    // Keep a handle while AbortSignal.timeout uses an unref'd timer.
    const keepAlive = setInterval(() => {}, 10);
    try {
      const result = await syncBookmarksGraphQL({ ...options, maxMinutes: 0.001 });
      assert.equal(result.stopReason, 'max runtime reached');
      assert.equal(result.added, 1);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'bookmarks-backfill-state.json'), 'utf8')).lastCursor, 'next');
    } finally { clearInterval(keepAlive); }
  });
});

test('unexpected fetch failure saves partial cache and metadata before reporting failure', async () => {
  await isolated(async dir => {
    let calls = 0;
    globalThis.fetch = (async () => {
      if (++calls === 1) return page('1');
      throw new Error('network unavailable');
    }) as typeof fetch;
    await assert.rejects(syncBookmarksGraphQL(options), /network unavailable/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'bookmarks-meta.json'), 'utf8')).totalBookmarks, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'bookmarks-backfill-state.json'), 'utf8')).stopReason, 'fetch failed');
  });
});
