import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIndex } from '../src/bookmarks-db.js';
import { renderViz } from '../src/bookmarks-viz.js';

async function withVizDataDir(records: any[], fn: () => Promise<void>, instagramRecords: any[] = []): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-viz-test-'));
  await writeFile(path.join(dir, 'bookmarks.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  if (instagramRecords.length > 0) {
    await writeFile(path.join(dir, 'instagram-saved.jsonl'), instagramRecords.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }

  const saved = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    await fn();
  } finally {
    if (saved !== undefined) process.env.FT_DATA_DIR = saved;
    else delete process.env.FT_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('renderViz uses publication timing instead of fabricated bookmark timing', async () => {
  const records = [
    {
      id: '1',
      tweetId: '1',
      url: 'https://x.com/alice/status/1',
      text: 'One',
      authorHandle: 'alice',
      authorName: 'Alice',
      postedAt: 'Wed Apr 08 06:30:15 +0000 2026',
      bookmarkedAt: null,
      syncedAt: '2026-04-09T08:00:00.000Z',
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
    {
      id: '2',
      tweetId: '2',
      url: 'https://x.com/bob/status/2',
      text: 'Two',
      authorHandle: 'bob',
      authorName: 'Bob',
      postedAt: 'Tue Apr 07 18:10:00 +0000 2026',
      bookmarkedAt: null,
      syncedAt: '2026-04-09T08:00:00.000Z',
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
    {
      id: '3',
      tweetId: '3',
      url: 'https://x.com/alice/status/3',
      text: 'Three',
      authorHandle: 'alice',
      authorName: 'Alice',
      postedAt: 'Mon Mar 30 00:05:00 +0000 2026',
      bookmarkedAt: null,
      syncedAt: '2026-04-09T08:00:00.000Z',
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
  ];

  await withVizDataDir(records, async () => {
    await buildIndex({ force: true });
    const output = await renderViz();

    assert.match(output, /PUBLICATION RHYTHM/);
    assert.match(output, /POST WEEKDAYS/);
    assert.match(output, /POSTING HOURS/);
    assert.doesNotMatch(output, /monthly bookmarking cadence/);
    assert.doesNotMatch(output, /when you reach for the bookmark button/);
    assert.doesNotMatch(output, /000Z/);
  });
});

test('renderViz remains X-only when the shared index contains Instagram records', async () => {
  const xRecord = {
    id: 'x-only', tweetId: 'x-only', url: 'https://x.com/x_author/status/x-only',
    text: 'X visualization fixture', authorHandle: 'x_author', postedAt: '2026-01-01T00:00:00Z',
    syncedAt: '2026-01-02T00:00:00Z', links: [], tags: [], ingestedVia: 'graphql',
  };
  const instagramRecord = {
    id: '999999999999999999', tweetId: '999999999999999999', source: 'instagram',
    url: 'https://www.instagram.com/p/VizFixture/', text: 'Instagram visualization sentinel',
    authorHandle: 'ig_viz_sentinel', postedAt: '2026-01-01T00:00:00Z', syncedAt: '2026-01-02T00:00:00Z',
  };

  await withVizDataDir([xRecord], async () => {
    await buildIndex({ force: true, reportSource: 'all' });
    const output = await renderViz();
    assert.match(output, /1 bookmarks/);
    assert.doesNotMatch(output, /ig_viz_sentinel|999999999999999999|Instagram visualization sentinel/);
  }, [instagramRecord]);
});
