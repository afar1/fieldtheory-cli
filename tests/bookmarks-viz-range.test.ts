import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIndex } from '../src/bookmarks-db.js';
import { renderViz } from '../src/bookmarks-viz.js';

const FIXTURES = [
  { 
    id: '1', tweetId: '1000', url: 'https://x.com/a/status/1', text: 'Oldest tweet', authorHandle: 'a', authorName: 'A',
    postedAt: 'Wed Sep 30 12:00:00 +0000 2020', // "W" is late alphabetically, but 2020 is early chronologically
    bookmarkedAt: '2020-09-30T12:00:00.000Z', language: 'en', engagement: { likeCount: 10 }, mediaObjects: [], links: [], tags: [], ingestedVia: 'graphql',
    syncedAt: '2026-04-10T00:00:00.000Z'
  },
  { 
    id: '2', tweetId: '2000', url: 'https://x.com/c/status/3', text: 'Padding for rising voices', authorHandle: 'c', authorName: 'C',
    postedAt: 'Fri Mar 01 12:00:00 +0000 2021',
    bookmarkedAt: '2021-03-01T12:00:00.000Z', language: 'en', engagement: { likeCount: 20 }, mediaObjects: [], links: [], tags: [], ingestedVia: 'graphql',
    syncedAt: '2026-04-10T00:00:00.000Z'
  },
  { 
    id: '3', tweetId: '3000', url: 'https://x.com/b/status/2', text: 'Newest tweet', authorHandle: 'b', authorName: 'B',
    postedAt: 'Fri Apr 01 12:00:00 +0000 2026', // "F" is early alphabetically, but 2026 is late chronologically
    bookmarkedAt: '2026-04-01T12:00:00.000Z', language: 'en', engagement: { likeCount: 20 }, mediaObjects: [], links: [], tags: [], ingestedVia: 'graphql',
    syncedAt: '2026-04-10T00:00:00.000Z'
  }
];

async function withIsolatedDataDir(fn: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-test-viz-range-'));
  const jsonl = FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);

  const saved = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    await fn();
  } finally {
    process.env.FT_DATA_DIR = saved;
  }
}

test('renderViz: computes chronological date range correctly using tweet_id', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const output = await renderViz();
    
    // The buggy MIN/MAX string sorting would yield:
    // MIN: Fri Apr 01... (2026)
    // MAX: Wed Sep 30... (2020)
    // The correct output should be Sep 2020 to Apr 2026
    
    assert.ok(output.includes('Sep 2020 → Apr 2026'), 'Date range rendered incorrectly, text sorting is likely still active');
    
    // Ensure we are NOT seeing the broken 16-character slice (like 'Fri Apr 01 16:02')
    assert.ok(!output.includes('Fri Apr 01'), 'Date range is still using raw string slices');
  });
});
