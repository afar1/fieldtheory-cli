import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIndex } from '../src/bookmarks-db.js';
import { openDb } from '../src/db.js';
import { twitterBookmarksIndexPath } from '../src/paths.js';
import { classifyDomainsWithLlm } from '../src/bookmark-classify-llm.js';
import type { ResolvedEngine } from '../src/engine.js';

// Fake engine: logs start/end, waits so batches overlap, then answers every id
// in the prompt with domain "ai".
const FAKE_ENGINE = `
const fs = require('node:fs');
const [logPath, prompt] = process.argv.slice(2);
fs.appendFileSync(logPath, 'start\\n');
setTimeout(() => {
  const ids = [...prompt.matchAll(/id=(\\S+)/g)].map((m) => m[1]);
  fs.appendFileSync(logPath, 'end\\n');
  process.stdout.write(JSON.stringify(ids.map((id) => ({ id, domains: ['ai'], primary: 'ai' }))));
}, 300);
`;

test('classifyDomainsWithLlm: runs batches concurrently and writes every result', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-classify-run-'));
  const savedDir = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;

  try {
    const records = Array.from({ length: 120 }, (_, i) => ({
      id: String(i + 1), tweetId: String(i + 1),
      url: `https://x.com/user/status/${i + 1}`,
      text: `Bookmark number ${i + 1}`,
      authorHandle: 'user', authorName: 'User',
      postedAt: 'Mon Jan 06 12:00:00 +0000 2025',
      bookmarkedAt: '2025-01-07T08:00:00Z',
      syncedAt: '2025-01-07T08:00:00Z',
      language: 'en', mediaObjects: [], links: [], tags: [], ingestedVia: 'graphql',
    }));
    await writeFile(path.join(dir, 'bookmarks.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    await buildIndex({ force: true });

    const script = path.join(dir, 'fake-engine.cjs');
    const logPath = path.join(dir, 'engine.log');
    await writeFile(script, FAKE_ENGINE);
    await writeFile(logPath, '');

    const engine: ResolvedEngine = {
      name: 'fake',
      label: 'fake',
      config: { bin: process.execPath, args: (prompt) => [script, logPath, prompt] },
    };

    const progress: number[] = [];
    const result = await classifyDomainsWithLlm({
      engine,
      all: true,
      concurrency: 3,
      onBatch: (done) => progress.push(done),
    });

    assert.equal(result.batches, 3);
    assert.equal(result.classified, 120);
    assert.equal(result.failed, 0);
    assert.equal(progress.at(-1), 120);

    let running = 0;
    let maxRunning = 0;
    for (const line of (await readFile(logPath, 'utf-8')).trim().split('\n')) {
      running += line === 'start' ? 1 : -1;
      maxRunning = Math.max(maxRunning, running);
    }
    assert.ok(maxRunning > 1, `expected overlapping batches, max concurrent was ${maxRunning}`);

    const db = await openDb(twitterBookmarksIndexPath());
    try {
      const count = db.exec(`SELECT COUNT(*) FROM bookmarks WHERE primary_domain = 'ai'`)[0]?.values[0]?.[0];
      assert.equal(count, 120);
    } finally {
      db.close();
    }
  } finally {
    if (savedDir !== undefined) process.env.FT_DATA_DIR = savedDir;
    else delete process.env.FT_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});
