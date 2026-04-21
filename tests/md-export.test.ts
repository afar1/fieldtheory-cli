import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIndex, updateArticleContent } from '../src/bookmarks-db.js';
import { exportBookmarks } from '../src/md-export.js';

async function withIsolatedDataDir(fn: (dir: string) => Promise<void>, fixtures: any[]): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-md-export-'));
  const jsonl = fixtures.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);

  const saved = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (saved !== undefined) process.env.FT_DATA_DIR = saved;
    else delete process.env.FT_DATA_DIR;
  }
}

test('exportBookmarks: writes ISO dates for legacy postedAt in filenames and frontmatter', async () => {
  const fixtures = [
    {
      id: '1908170645818536087',
      tweetId: '1908170645818536087',
      url: 'https://x.com/Thom_Wolf/status/1908170645818536087',
      text: 'Test md export dates',
      authorHandle: 'Thom_Wolf',
      authorName: 'Thomas Wolf',
      syncedAt: '2026-04-18T00:00:00.000Z',
      postedAt: 'Fri Apr 04 19:53:15 +0000 2026',
      bookmarkedAt: '2026-04-17T08:07:48.007Z',
      language: 'en',
      engagement: { likeCount: 61, repostCount: 12 },
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
  ];

  await withIsolatedDataDir(async (dir) => {
    await buildIndex();

    const result = await exportBookmarks({ force: true });
    assert.equal(result.exported, 1);

    const bookmarksDir = path.join(dir, 'md', 'bookmarks');
    const files = await readdir(bookmarksDir);
    assert.deepEqual(files, ['2026-04-04-thom-wolf-test-md-export-dates.md']);

    const content = await readFile(path.join(bookmarksDir, files[0]), 'utf8');
    assert.match(content, /^posted_at: 2026-04-04$/m);
    assert.match(content, /^bookmarked_at: 2026-04-17$/m);
  }, fixtures);
});

test('exportBookmarks: includes enriched article content for X Article bookmarks', async () => {
  const fixtures = [
    {
      id: '2042685676949270724',
      tweetId: '2042685676949270724',
      url: 'https://x.com/danveloper/status/2042685676949270724',
      text: 'x.com/i/article/2042...',
      authorHandle: 'danveloper',
      authorName: 'Dan Woods',
      syncedAt: '2026-04-20T00:00:00.000Z',
      postedAt: 'Fri Apr 10 19:26:31 +0000 2026',
      mediaObjects: [],
      links: ['http://x.com/i/article/2042676487711584257'],
      tags: [],
      ingestedVia: 'graphql',
    },
  ];

  await withIsolatedDataDir(async (dir) => {
    await buildIndex();
    await updateArticleContent([
      {
        id: '2042685676949270724',
        articleTitle: 'How agents should use context',
        articleText: 'The article body is the useful content. It should not be lost behind an X Article link.',
        articleSite: 'X Articles',
      },
    ]);

    const result = await exportBookmarks({ force: true });
    assert.equal(result.exported, 1);

    const bookmarksDir = path.join(dir, 'md', 'bookmarks');
    const files = await readdir(bookmarksDir);
    assert.equal(files.length, 1);

    const content = await readFile(path.join(bookmarksDir, files[0]), 'utf8');
    assert.match(content, /x\.com\/i\/article\/2042\.\.\./);
    assert.match(content, /## Article/);
    assert.match(content, /### How agents should use context/);
    assert.match(content, /The article body is the useful content/);
    assert.match(content, /## Links\n- http:\/\/x\.com\/i\/article\/2042676487711584257/);
  }, fixtures);
});
