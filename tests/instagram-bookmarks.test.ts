import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  parseInstagramSavedResponse,
  syncInstagramSaved,
  type InstagramSession,
} from '../src/instagram-bookmarks.js';

const FIXTURE_PATH = new URL('./fixtures/instagram-saved-page.json', import.meta.url);
const SESSION: InstagramSession = {
  csrfToken: 'test-csrf-secret',
  cookieHeader: 'sessionid=test-session-secret; csrftoken=test-csrf-secret',
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

async function isolatedRun(
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-instagram-'));
  const previous = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previous;
  }
}

test('parseInstagramSavedResponse normalizes photo, carousel, video, and Reel metadata', async () => {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
  const page = parseInstagramSavedResponse(fixture, '2026-08-24T12:00:00.000Z');

  assert.deepEqual(page.records.map((record) => record.contentType), [
    'photo', 'carousel', 'video', 'reel',
  ]);
  assert.equal(page.records[0]?.source, 'instagram');
  assert.equal(page.records[0]?.url, 'https://www.instagram.com/p/PhotoFixture/');
  assert.equal(page.records[3]?.url, 'https://www.instagram.com/reel/ReelFixture/');
  assert.deepEqual(page.records[0]?.untrustedFields, ['text', 'authorHandle', 'authorName']);
  assert.equal(page.records[0]?.mediaObjects?.length, 1, 'reject non-Instagram media hosts');
  assert.equal(page.nextCursor, undefined);
});

test('parseInstagramSavedResponse rejects a partially unknown page instead of dropping an item', () => {
  assert.throws(
    () => parseInstagramSavedResponse({
      items: [
        { pk: 'valid', code: 'ValidFixture', media_type: 1, user: { username: 'fixture' } },
        { pk: 'unknown', code: 'UnknownFixture', media_type: 99, user: { username: 'fixture' } },
      ],
      more_available: false,
    }),
    /response shape changed/,
  );
});

test('syncInstagramSaved completes a first backfill and never persists session secrets', async () => {
  await isolatedRun(async (dir) => {
    const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
    const result = await syncInstagramSaved({
      session: SESSION,
      fetchImpl: async () => jsonResponse(fixture),
      delayMs: 0,
    });

    assert.equal(result.complete, true);
    assert.equal(result.added, 4);
    assert.equal(result.totalBookmarks, 4);
    const disk = [
      await readFile(path.join(dir, 'instagram-saved.jsonl'), 'utf8'),
      await readFile(path.join(dir, 'instagram-saved-state.json'), 'utf8'),
    ].join('\n');
    assert.doesNotMatch(disk, /test-session-secret|test-csrf-secret/);
  });
});

test('syncInstagramSaved resumes an interrupted first backfill from its checkpoint', async () => {
  await isolatedRun(async () => {
    const cursors: Array<string | undefined> = [];
    const first = await syncInstagramSaved({
      session: SESSION,
      maxPages: 1,
      delayMs: 0,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        cursors.push(url.searchParams.get('max_id') ?? undefined);
        return jsonResponse({
          items: [{ pk: '2001', code: 'FirstPage', media_type: 1, caption: { text: 'first' }, user: { username: 'fixture' } }],
          more_available: true,
          next_max_id: 'resume-cursor',
        });
      },
    });
    assert.equal(first.complete, false);
    assert.equal(first.stopReason, 'max pages reached');

    const second = await syncInstagramSaved({
      session: SESSION,
      delayMs: 0,
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        cursors.push(url.searchParams.get('max_id') ?? undefined);
        return jsonResponse({
          items: [{ pk: '2002', code: 'SecondPage', media_type: 2, product_type: 'clips', caption: { text: 'second' }, user: { username: 'fixture' } }],
          more_available: false,
        });
      },
    });

    assert.deepEqual(cursors, [undefined, 'resume-cursor']);
    assert.equal(second.complete, true);
    assert.equal(second.totalBookmarks, 2);
  });
});

test('later sync starts at newest, stops at a known id, and retains omitted cached records', async () => {
  await isolatedRun(async (dir) => {
    await writeFile(path.join(dir, 'instagram-saved.jsonl'), [
      JSON.stringify({ id: 'old-1', tweetId: 'old-1', source: 'instagram', contentType: 'photo', url: 'https://www.instagram.com/p/OldOne/', text: 'old one', authorName: 'Archived Name', postedAt: '2025-12-31T00:00:00Z', syncedAt: '2026-01-01T00:00:00Z' }),
      JSON.stringify({ id: 'old-2', tweetId: 'old-2', source: 'instagram', contentType: 'photo', url: 'https://www.instagram.com/p/OldTwo/', text: 'old two', syncedAt: '2026-01-01T00:00:00Z' }),
    ].join('\n') + '\n');
    await writeFile(path.join(dir, 'instagram-saved-state.json'), JSON.stringify({
      provider: 'instagram', schemaVersion: 1, complete: true, totalRuns: 1,
    }));

    let calls = 0;
    const result = await syncInstagramSaved({
      session: SESSION,
      delayMs: 0,
      fetchImpl: async (input) => {
        calls += 1;
        assert.equal(new URL(String(input)).searchParams.has('max_id'), false);
        return jsonResponse({
          items: [
            { pk: 'new-1', code: 'NewOne', media_type: 1, caption: { text: 'new' }, user: { username: 'fixture' } },
            { pk: 'old-1', code: 'OldOne', media_type: 1, caption: { text: 'old refreshed' }, user: { username: 'fixture' } },
          ],
          more_available: true,
          next_max_id: 'unused',
        });
      },
    });

    assert.equal(calls, 1);
    assert.equal(result.stopReason, 'caught up to saved archive');
    assert.equal(result.added, 1);
    assert.equal(result.totalBookmarks, 3, 'old-2 remains even though remote page omitted it');
    const saved = (await readFile(path.join(dir, 'instagram-saved.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.ok(saved.some((record) => record.id === 'old-2'));
    const refreshed = saved.find((record) => record.id === 'old-1');
    assert.equal(refreshed.authorName, 'Archived Name');
    assert.equal(refreshed.postedAt, '2025-12-31T00:00:00Z');
  });
});

test('an interrupted incremental run resumes with stop-on-known behavior intact', async () => {
  await isolatedRun(async (dir) => {
    await writeFile(path.join(dir, 'instagram-saved.jsonl'), JSON.stringify({
      id: 'known', tweetId: 'known', source: 'instagram', contentType: 'photo',
      url: 'https://www.instagram.com/p/Known/', text: 'known', syncedAt: '2026-01-01T00:00:00Z',
    }) + '\n');
    await writeFile(path.join(dir, 'instagram-saved-state.json'), JSON.stringify({
      provider: 'instagram', schemaVersion: 1, complete: true, totalRuns: 1,
    }));

    const first = await syncInstagramSaved({
      session: SESSION,
      maxPages: 1,
      fetchImpl: async () => jsonResponse({
        items: [{ pk: 'new', code: 'New', media_type: 1, user: { username: 'fixture' } }],
        more_available: true,
        next_max_id: 'incremental-cursor',
      }),
    });
    assert.equal(first.complete, false);

    const second = await syncInstagramSaved({
      session: SESSION,
      fetchImpl: async (input) => {
        assert.equal(new URL(String(input)).searchParams.get('max_id'), 'incremental-cursor');
        return jsonResponse({
          items: [{ pk: 'known', code: 'Known', media_type: 1, user: { username: 'fixture' } }],
          more_available: true,
          next_max_id: 'must-not-be-used',
        });
      },
    });
    assert.equal(second.complete, true);
    assert.equal(second.stopReason, 'caught up to saved archive');
  });
});

test('rebuild restarts from the newest page instead of a stale backfill cursor', async () => {
  await isolatedRun(async (dir) => {
    await writeFile(path.join(dir, 'instagram-saved-state.json'), JSON.stringify({
      provider: 'instagram', schemaVersion: 1, complete: false, totalRuns: 1,
      lastCursor: 'stale-cursor', mode: 'backfill',
    }));
    const result = await syncInstagramSaved({
      session: SESSION,
      rebuild: true,
      fetchImpl: async (input) => {
        assert.equal(new URL(String(input)).searchParams.has('max_id'), false);
        return jsonResponse({ items: [], more_available: false });
      },
    });
    assert.equal(result.complete, true);
  });
});

test('remote safety failures preserve the prior cache and report an incomplete run without leaking cookies', async () => {
  const cases = [
    ['authentication required', jsonResponse({ message: 'login_required' }, 401)],
    ['rate limited', jsonResponse({ message: 'Please wait' }, 429)],
    ['redirect refused', new Response('', { status: 302, headers: { location: 'https://evil.example/' } })],
    ['challenge required', jsonResponse({ challenge: { url: '/challenge/' } }, 403)],
    ['response shape changed', jsonResponse({ unexpected: [] })],
  ] as const;

  for (const [expectedReason, response] of cases) {
    await isolatedRun(async (dir) => {
      const original = JSON.stringify({ id: 'safe', tweetId: 'safe', source: 'instagram', url: 'https://www.instagram.com/p/Safe/', text: 'safe', syncedAt: '2026-01-01T00:00:00Z' }) + '\n';
      await writeFile(path.join(dir, 'instagram-saved.jsonl'), original);
      const output: string[] = [];
      const result = await syncInstagramSaved({
        session: SESSION,
        delayMs: 0,
        onProgress: (progress) => output.push(JSON.stringify(progress)),
        fetchImpl: async () => response.clone(),
      });

      assert.equal(result.complete, false);
      assert.equal(result.stopReason, expectedReason);
      assert.equal(await readFile(path.join(dir, 'instagram-saved.jsonl'), 'utf8'), original);
      assert.doesNotMatch(output.join('\n'), /test-session-secret|test-csrf-secret/);
    });
  }
});

test('a stalled Instagram request stops at its request budget and preserves the prior cache', async () => {
  await isolatedRun(async (dir) => {
    const cachePath = path.join(dir, 'instagram-saved.jsonl');
    const original = JSON.stringify({ id: 'safe', tweetId: 'safe', source: 'instagram', url: 'https://www.instagram.com/p/Safe/', text: 'safe', syncedAt: '2026-01-01T00:00:00Z' }) + '\n';
    await writeFile(cachePath, original);

    const result = await syncInstagramSaved({
      session: SESSION,
      requestTimeoutMs: 5,
      fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      }),
    });

    assert.equal(result.complete, false);
    assert.equal(result.stopReason, 'request timed out');
    assert.equal(await readFile(cachePath, 'utf8'), original);
  });
});

test('session acquisition failure leaves cache and checkpoint untouched', async () => {
  await isolatedRun(async (dir) => {
    const cachePath = path.join(dir, 'instagram-saved.jsonl');
    const statePath = path.join(dir, 'instagram-saved-state.json');
    await writeFile(cachePath, 'archive\n');
    await writeFile(statePath, 'checkpoint\n');

    await assert.rejects(
      syncInstagramSaved({ sessionProvider: () => { throw new Error('Instagram session unavailable'); } }),
      /Instagram session unavailable/,
    );
    assert.equal(await readFile(cachePath, 'utf8'), 'archive\n');
    assert.equal(await readFile(statePath, 'utf8'), 'checkpoint\n');
  });
});

test('a malformed local cache stops before network access and is never overwritten', async () => {
  await isolatedRun(async (dir) => {
    const cachePath = path.join(dir, 'instagram-saved.jsonl');
    await writeFile(cachePath, '{malformed archive\n');
    let fetched = false;

    await assert.rejects(
      syncInstagramSaved({
        session: SESSION,
        fetchImpl: async () => {
          fetched = true;
          return jsonResponse({ items: [], more_available: false });
        },
      }),
      /cache is unreadable or malformed.*No changes were written/,
    );
    assert.equal(fetched, false);
    assert.equal(await readFile(cachePath, 'utf8'), '{malformed archive\n');
  });
});
