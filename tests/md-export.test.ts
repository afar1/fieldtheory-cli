import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIndex, updateArticleContent, getBookmarksByIds } from '../src/bookmarks-db.js';
import { openDb, saveDb } from '../src/db.js';
import { twitterBookmarksIndexPath } from '../src/paths.js';
import { exportBookmarks, removeExportedBookmarks } from '../src/md-export.js';

async function withIsolatedDataDir(fn: (dir: string) => Promise<void>, fixtures: any[]): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-md-export-'));
  const jsonl = fixtures.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);

  // FT_LIBRARY_DIR beats FT_DATA_DIR in libraryDir(); clear it so exports (and
  // the prune tests' deletions) land in the temp dir, never a real library.
  const saved = process.env.FT_DATA_DIR;
  const savedLibrary = process.env.FT_LIBRARY_DIR;
  process.env.FT_DATA_DIR = dir;
  delete process.env.FT_LIBRARY_DIR;
  try {
    await fn(dir);
  } finally {
    if (saved !== undefined) process.env.FT_DATA_DIR = saved;
    else delete process.env.FT_DATA_DIR;
    if (savedLibrary !== undefined) process.env.FT_LIBRARY_DIR = savedLibrary;
    else delete process.env.FT_LIBRARY_DIR;
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

test('exportBookmarks: changed mode rewrites only stale enriched markdown', async () => {
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
    {
      id: '1908170645818536087',
      tweetId: '1908170645818536087',
      url: 'https://x.com/Thom_Wolf/status/1908170645818536087',
      text: 'Already exported note',
      authorHandle: 'Thom_Wolf',
      authorName: 'Thomas Wolf',
      syncedAt: '2026-04-18T00:00:00.000Z',
      postedAt: 'Fri Apr 04 19:53:15 +0000 2026',
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
  ];

  await withIsolatedDataDir(async (dir) => {
    await buildIndex();
    const initial = await exportBookmarks({ force: true });
    assert.equal(initial.exported, 2);

    await updateArticleContent([
      {
        id: '2042685676949270724',
        articleTitle: 'How agents should use context',
        articleText: 'The article body was added after the first markdown export.',
        articleSite: 'X Articles',
      },
    ]);

    const bookmarksDir = path.join(dir, 'md', 'bookmarks');
    const files = await readdir(bookmarksDir);
    const articleFile = files.find((file) => file.includes('danveloper'));
    assert.ok(articleFile);
    const articlePath = path.join(bookmarksDir, articleFile);
    await utimes(articlePath, new Date('2020-01-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z'));

    const result = await exportBookmarks({ changed: true });
    assert.equal(result.exported, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.total, 2);

    const content = await readFile(articlePath, 'utf8');
    assert.match(content, /## Article/);
    assert.match(content, /The article body was added after the first markdown export/);
  }, fixtures);
});

// ── removeExportedBookmarks ─────────────────────────────────────────────────

function prunableFixtures() {
  return ['111', '222'].map((id, i) => ({
    id,
    tweetId: id,
    url: `https://x.com/alice/status/${id}`,
    text: i === 0 ? 'First exported bookmark' : 'Second exported bookmark',
    authorHandle: 'alice',
    syncedAt: '2026-04-18T00:00:00.000Z',
    postedAt: '2026-04-04T12:00:00.000Z',
    mediaObjects: [],
    links: [],
    tags: [],
    ingestedVia: 'graphql',
  }));
}

test('removeExportedBookmarks: removes the exact-named file and leaves others', async () => {
  await withIsolatedDataDir(async (dir) => {
    await buildIndex();
    await exportBookmarks({ force: true, onProgress: () => {} });
    const bookmarksDir = path.join(dir, 'md', 'bookmarks');
    assert.equal((await readdir(bookmarksDir)).length, 2);

    const removed = await removeExportedBookmarks(await getBookmarksByIds(['111']));

    assert.equal(removed, 1);
    assert.deepEqual(await readdir(bookmarksDir), ['2026-04-04-alice-second-exported-bookmark.md']);
  }, prunableFixtures());
});

test('removeExportedBookmarks: finds a file whose slug drifted via the tweet_id frontmatter', async () => {
  await withIsolatedDataDir(async (dir) => {
    await buildIndex();
    await exportBookmarks({ force: true, onProgress: () => {} });

    // Simulate `ft sync --gaps` rewriting the text after the file was exported:
    // the computed filename no longer matches the one on disk.
    const dbPath = twitterBookmarksIndexPath();
    const db = await openDb(dbPath);
    try {
      db.run('UPDATE bookmarks SET text = ? WHERE id = ?', ['Completely different expanded text', '111']);
      saveDb(db, dbPath);
    } finally {
      db.close();
    }

    const removed = await removeExportedBookmarks(await getBookmarksByIds(['111']));

    assert.equal(removed, 1);
    const files = await readdir(path.join(dir, 'md', 'bookmarks'));
    assert.deepEqual(files, ['2026-04-04-alice-second-exported-bookmark.md']);
  }, prunableFixtures());
});

test('removeExportedBookmarks: a missing file (or missing export dir) is a no-op', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    // Nothing exported yet: the bookmarks dir does not exist.
    assert.equal(await removeExportedBookmarks(await getBookmarksByIds(['111', '222'])), 0);

    await exportBookmarks({ force: true, onProgress: () => {} });
    assert.equal(await removeExportedBookmarks(await getBookmarksByIds(['111'])), 1);
    // Second call: already gone.
    assert.equal(await removeExportedBookmarks(await getBookmarksByIds(['111'])), 0);
  }, prunableFixtures());
});
