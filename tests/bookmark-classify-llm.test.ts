import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { classifyDomainsWithLlm, classifyWithLlm, extractJsonArray } from '../src/bookmark-classify-llm.js';
import { buildIndex } from '../src/bookmarks-db.js';
import type { ResolvedEngine } from '../src/engine.js';

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

test('LLM classification remains scoped to X when the shared index contains Instagram records', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-classify-source-'));
  await writeFile(path.join(dir, 'instagram-saved.jsonl'), JSON.stringify({
    id: 'ig-only',
    tweetId: 'ig-only',
    source: 'instagram',
    url: 'https://www.instagram.com/p/Fixture/',
    text: 'Instagram fixture',
    syncedAt: '2026-08-24T00:00:00Z',
  }) + '\n');
  const previous = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  const neverRunEngine: ResolvedEngine = {
    name: 'never-run',
    label: 'never-run',
    config: { bin: '/definitely/missing/engine', args: () => [] },
  };

  try {
    await buildIndex();
    assert.equal((await classifyWithLlm({ engine: neverRunEngine })).totalUnclassified, 0);
    assert.equal((await classifyDomainsWithLlm({ engine: neverRunEngine, all: true })).totalUnclassified, 0);
  } finally {
    if (previous === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previous;
  }
});
