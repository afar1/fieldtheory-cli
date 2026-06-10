import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIndex } from '../src/bookmarks-db.js';
import { renderViz, buildVizData } from '../src/bookmarks-viz.js';

async function withVizDataDir(records: any[], fn: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-viz-test-'));
  await writeFile(path.join(dir, 'bookmarks.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');

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

test('buildVizData returns correctly shaped VizData', async () => {
  const records = [
    {
      id: '10', tweetId: '10',
      url: 'https://x.com/alice/status/10',
      text: 'AI is the future',
      authorHandle: 'alice', authorName: 'Alice',
      postedAt: 'Mon Jan 06 08:00:00 +0000 2025',
      bookmarkedAt: '2025-01-07T09:00:00Z',
      syncedAt: '2025-01-07T09:00:00Z',
      mediaObjects: [], media: ['https://img.example.com/1.jpg'],
      links: ['https://example.com/article'],
      tags: [], ingestedVia: 'graphql',
    },
    {
      id: '11', tweetId: '11',
      url: 'https://x.com/bob/status/11',
      text: 'TypeScript is great for large codebases',
      authorHandle: 'bob', authorName: 'Bob',
      postedAt: 'Tue Feb 04 15:00:00 +0000 2025',
      bookmarkedAt: '2025-02-05T12:00:00Z',
      syncedAt: '2025-02-05T12:00:00Z',
      mediaObjects: [], links: [],
      tags: [], ingestedVia: 'graphql',
    },
  ];

  await withVizDataDir(records, async () => {
    await buildIndex({ force: true });
    const data = await buildVizData();

    // Aggregate counts
    assert.equal(data.total, 2);
    assert.equal(data.uniqueAuthors, 2);

    // Shape checks
    assert.ok(typeof data.avgTextLength === 'number');
    assert.ok(Array.isArray(data.topAuthors));
    assert.ok(Array.isArray(data.monthlyActivity));
    assert.ok(Array.isArray(data.dayOfWeekActivity));
    assert.ok(Array.isArray(data.hourActivity));
    assert.ok(Array.isArray(data.topDomains));
    assert.ok(Array.isArray(data.languages));
    assert.ok(Array.isArray(data.categories));
    assert.ok(Array.isArray(data.domains));
    assert.ok(Array.isArray(data.timeCapsules));
    assert.ok(Array.isArray(data.hiddenGems));
    assert.ok(Array.isArray(data.risingVoices));
    assert.ok(Array.isArray(data.recentAuthors));
    assert.ok(typeof data.mediaStats === 'object');
    assert.ok(typeof data.dateRange === 'object');

    // Media stats reflect fixture data (1 with media, 1 with links)
    assert.equal(data.mediaStats.withMedia, 1);
    assert.equal(data.mediaStats.withLinks, 1);
    assert.equal(data.mediaStats.total, 2);

    // Top authors should contain both handles
    const handles = data.topAuthors.map((a) => a.handle);
    assert.ok(handles.includes('alice'));
    assert.ok(handles.includes('bob'));
  });
});

