import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIndex, getClassificationProgress } from '../src/bookmarks-db.js';
import { openDb, saveDb } from '../src/db.js';
import { twitterBookmarksIndexPath } from '../src/paths.js';
import { readClassificationLock } from '../src/classification-lock.js';
import { classifyWithLlm, classifyDomainsWithLlm, extractJsonArray } from '../src/bookmark-classify-llm.js';

test('extractJsonArray: stops at the end of the first balanced JSON array', () => {
  const raw = `Here you go:
[{"id":"1","domains":["ai","finance"],"primary":"ai"}]

Some of [these bookmarks] look ambiguous.`;

  assert.equal(
    extractJsonArray(raw),
    '[{"id":"1","domains":["ai","finance"],"primary":"ai"}]',
  );
});

test('extractJsonArray: skips bracketed prose before the real JSON array', () => {
  const raw = `Status [draft only]
[{"id":"1","domains":["ai"],"primary":"ai"}]`;

  assert.equal(
    extractJsonArray(raw),
    '[{"id":"1","domains":["ai"],"primary":"ai"}]',
  );
});

test('extractJsonArray: ignores brackets inside JSON strings', () => {
  const raw = '[{"id":"1","domains":["ai"],"primary":"ai","note":"keep [this] literal"}] trailing ]';

  assert.equal(
    extractJsonArray(raw),
    '[{"id":"1","domains":["ai"],"primary":"ai","note":"keep [this] literal"}]',
  );
});

test('classification persists completed batches and keeps the event loop and job visible', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-classify-batches-'));
  const previous = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  const engine = {
    name: 'claude', label: 'test', config: {
      bin: process.execPath,
      args: (prompt: string) => ['-e', `
        const ids = [...process.argv[1].matchAll(/id=(\\d+)/g)].map(match => match[1]);
        setTimeout(() => console.log(JSON.stringify(ids.map(id => ({
          id, categories: ['opinion'], domains: ['science'], primary: 'science'
        })))), 30);
      `, '--', prompt],
    },
  };
  let ticks = 0;
  const timer = setInterval(() => ticks++, 5);
  try {
    fs.writeFileSync(path.join(dir, 'bookmarks.jsonl'), Array.from({ length: 51 }, (_, i) =>
      JSON.stringify({ id: String(i), tweetId: String(i), url: `https://x.com/test/status/${i}`,
        text: 'A note', authorHandle: 'test', authorName: 'Test', links: [], tags: [],
        syncedAt: '2026-10-08T00:00:00Z', postedAt: '2026-10-08T00:00:00Z',
        language: 'en', engagement: {}, mediaObjects: [], ingestedVia: 'graphql' })).join('\n'));
    await buildIndex();
    const db = await openDb(twitterBookmarksIndexPath());
    db.run('UPDATE bookmarks SET primary_category = NULL, primary_domain = NULL');
    saveDb(db, twitterBookmarksIndexPath());
    db.close();
    for (const [run, kind] of [[classifyWithLlm, 'classify'], [classifyDomainsWithLlm, 'classify-domains']] as const) {
      const progress: number[] = [];
      const result = await run({ engine, onBatch: (done, total) => {
        assert.equal(total, 51);
        assert.equal(readClassificationLock()?.kind, kind);
        progress.push(done);
      } });
      assert.equal(result.classified, 51);
      assert.equal(result.failed, 0);
      assert.equal(result.batches, 2);
      assert.deepEqual(progress, [0, 50, 50, 51]);
      assert.equal(readClassificationLock(), null);
      assert.equal((await run({ engine })).batches, 0);
    }
    assert.deepEqual(await getClassificationProgress(), { total: 51, categoriesDone: 51, domainsDone: 51 });
    assert.ok(ticks > 0);
  } finally {
    clearInterval(timer);
    if (previous === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
