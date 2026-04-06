import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIndex, searchBookmarks, getStats, formatSearchResults, listBookmarks } from '../src/bookmarks-db.js';
import { openDb, saveDb } from '../src/db.js';

type FixtureRecord = {
  id: string;
  tweetId: string;
  url: string;
  text: string;
  authorHandle: string;
  authorName: string;
  syncedAt: string;
  postedAt?: string;
  bookmarkedAt?: string;
  language: string;
  engagement: { likeCount?: number; repostCount?: number };
  media: string[];
  links: string[];
  tags: string[];
  ingestedVia: 'graphql' | 'api';
};

const DEFAULT_RECORDS: FixtureRecord[] = [
  {
    id: '1',
    tweetId: '1',
    url: 'https://x.com/alice/status/1',
    text: 'Machine learning is transforming healthcare',
    authorHandle: 'alice',
    authorName: 'Alice Smith',
    syncedAt: '2026-01-01T00:00:00Z',
    postedAt: 'Tue Jan 06 12:00:00 +0000 2026',
    language: 'en',
    engagement: { likeCount: 100, repostCount: 10 },
    media: [],
    links: ['https://example.com'],
    tags: [],
    ingestedVia: 'graphql',
  },
  {
    id: '2',
    tweetId: '2',
    url: 'https://x.com/bob/status/2',
    text: 'Rust is a great systems programming language',
    authorHandle: 'bob',
    authorName: 'Bob Jones',
    syncedAt: '2026-02-01T00:00:00Z',
    postedAt: 'Mon Mar 02 12:00:00 +0000 2026',
    language: 'en',
    engagement: { likeCount: 50 },
    media: [],
    links: [],
    tags: [],
    ingestedVia: 'graphql',
  },
  {
    id: '3',
    tweetId: '3',
    url: 'https://x.com/alice/status/3',
    text: 'Deep learning models need massive compute',
    authorHandle: 'alice',
    authorName: 'Alice Smith',
    syncedAt: '2026-03-01T00:00:00Z',
    postedAt: '2026-03-15T12:00:00Z',
    language: 'en',
    engagement: { likeCount: 200, repostCount: 30 },
    media: ['https://img.com/1.jpg'],
    links: [],
    tags: [],
    ingestedVia: 'graphql',
  },
];

async function withDataDir(fn: (dataDir: string) => Promise<void>): Promise<void> {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'ft-db-'));
  const previous = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dataDir;
  try {
    await fn(dataDir);
  } finally {
    if (previous === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previous;
  }
}

async function setupFixture(dataDir: string, records: FixtureRecord[] = DEFAULT_RECORDS): Promise<void> {
  const jsonl = records.map((record) => JSON.stringify(record)).join('\n') + '\n';
  await writeFile(path.join(dataDir, 'bookmarks.jsonl'), jsonl);
}

async function seedLegacySchemaV3(dataDir: string): Promise<void> {
  const dbPath = path.join(dataDir, 'bookmarks.db');
  const db = await openDb(dbPath);
  try {
    db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      tweet_id TEXT NOT NULL,
      url TEXT NOT NULL,
      text TEXT NOT NULL,
      author_handle TEXT,
      author_name TEXT,
      author_profile_image_url TEXT,
      posted_at TEXT,
      bookmarked_at TEXT,
      synced_at TEXT NOT NULL,
      conversation_id TEXT,
      in_reply_to_status_id TEXT,
      quoted_status_id TEXT,
      language TEXT,
      like_count INTEGER,
      repost_count INTEGER,
      reply_count INTEGER,
      quote_count INTEGER,
      bookmark_count INTEGER,
      view_count INTEGER,
      media_count INTEGER DEFAULT 0,
      link_count INTEGER DEFAULT 0,
      links_json TEXT,
      tags_json TEXT,
      ingested_via TEXT,
      categories TEXT,
      primary_category TEXT,
      github_urls TEXT,
      domains TEXT,
      primary_domain TEXT
    )`);
    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
      text,
      author_handle,
      author_name,
      content=bookmarks,
      content_rowid=rowid,
      tokenize='porter unicode61'
    )`);
    db.run(`REPLACE INTO meta VALUES ('schema_version', '3')`);
    saveDb(db, dbPath);
  } finally {
    db.close();
  }
}

test('buildIndex creates a searchable database', async () => {
  await withDataDir(async (dataDir) => {
    await setupFixture(dataDir);
    const result = await buildIndex();
    assert.equal(result.recordCount, 3);
    assert.ok(result.dbPath.endsWith('bookmarks.db'));
  });
});

test('buildIndex migrates a v3 database before inserting new rows', async () => {
  await withDataDir(async (dataDir) => {
    await setupFixture(dataDir, [DEFAULT_RECORDS[0]]);
    await seedLegacySchemaV3(dataDir);

    const result = await buildIndex();
    assert.equal(result.recordCount, 1);

    const db = await openDb(path.join(dataDir, 'bookmarks.db'));
    try {
      const cols = new Set((db.exec(`PRAGMA table_info(bookmarks)`)[0]?.values ?? []).map((row) => row[1] as string));
      const schemaVersion = db.exec(`SELECT value FROM meta WHERE key = 'schema_version'`)[0]?.values[0]?.[0];
      assert.ok(cols.has('article_text'));
      assert.ok(cols.has('enriched_at'));
      assert.equal(schemaVersion, '5');
    } finally {
      db.close();
    }
  });
});

test('searchBookmarks: full-text search returns matching results', async () => {
  await withDataDir(async (dataDir) => {
    await setupFixture(dataDir);
    await buildIndex();

    const results = await searchBookmarks({ query: 'learning', limit: 10 });
    assert.equal(results.length, 2);
    assert.ok(results.some((r) => r.id === '1'));
    assert.ok(results.some((r) => r.id === '3'));
  });
});

test('searchBookmarks: author filter works', async () => {
  await withDataDir(async (dataDir) => {
    await setupFixture(dataDir);
    await buildIndex();

    const results = await searchBookmarks({ query: '', author: 'alice', limit: 10 });
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.authorHandle === 'alice'));
  });
});

test('searchBookmarks: combined query + author filter', async () => {
  await withDataDir(async (dataDir) => {
    await setupFixture(dataDir);
    await buildIndex();

    const results = await searchBookmarks({ query: 'learning', author: 'alice', limit: 10 });
    assert.equal(results.length, 2);
  });
});

test('searchBookmarks: date filters and ordering work with raw Twitter timestamps', async () => {
  await withDataDir(async (dataDir) => {
    await setupFixture(dataDir);
    await buildIndex();

    const allResults = await searchBookmarks({ query: '', limit: 10 });
    const afterResults = await searchBookmarks({ query: '', after: '2026-02-01', limit: 10 });
    const beforeResults = await searchBookmarks({ query: '', before: '2026-02-01', limit: 10 });

    assert.deepEqual(allResults.map((r) => r.id), ['3', '2', '1']);
    assert.deepEqual(afterResults.map((r) => r.id), ['3', '2']);
    assert.deepEqual(beforeResults.map((r) => r.id), ['1']);
  });
});

test('listBookmarks: sorts by effective timestamp instead of tweet id', async () => {
  await withDataDir(async (dataDir) => {
    await setupFixture(dataDir, [
      {
        id: '100',
        tweetId: '100',
        url: 'https://x.com/alice/status/100',
        text: 'Older post with higher tweet id',
        authorHandle: 'alice',
        authorName: 'Alice Smith',
        syncedAt: '2026-03-15T00:00:00Z',
        postedAt: '2026-01-01T00:00:00Z',
        language: 'en',
        engagement: {},
        media: [],
        links: [],
        tags: [],
        ingestedVia: 'graphql',
      },
      {
        id: '2',
        tweetId: '2',
        url: 'https://x.com/bob/status/2',
        text: 'Newer post with lower tweet id',
        authorHandle: 'bob',
        authorName: 'Bob Jones',
        syncedAt: '2026-03-15T00:00:00Z',
        postedAt: '2026-03-01T00:00:00Z',
        language: 'en',
        engagement: {},
        media: [],
        links: [],
        tags: [],
        ingestedVia: 'graphql',
      },
    ]);
    await buildIndex();

    const results = await listBookmarks({ limit: 10 });
    assert.deepEqual(results.map((r) => r.id), ['2', '100']);
  });
});

test('searchBookmarks: no results for unmatched query', async () => {
  await withDataDir(async (dataDir) => {
    await setupFixture(dataDir);
    await buildIndex();

    const results = await searchBookmarks({ query: 'cryptocurrency', limit: 10 });
    assert.equal(results.length, 0);
  });
});

test('getStats returns correct aggregate data', async () => {
  await withDataDir(async (dataDir) => {
    await setupFixture(dataDir);
    await buildIndex();

    const stats = await getStats();
    assert.equal(stats.totalBookmarks, 3);
    assert.equal(stats.uniqueAuthors, 2);
    assert.equal(stats.topAuthors[0].handle, 'alice');
    assert.equal(stats.topAuthors[0].count, 2);
    assert.equal(stats.languageBreakdown[0].language, 'en');
    assert.equal(stats.languageBreakdown[0].count, 3);
    assert.match(stats.dateRange.earliest ?? '', /^2026-01-06T12:00:00/);
    assert.match(stats.dateRange.latest ?? '', /^2026-03-15T12:00:00/);
  });
});

test('formatSearchResults: formats results with author, date, text, url', () => {
  const results = [
    { id: '1', url: 'https://x.com/test/status/1', text: 'Hello world', authorHandle: 'test', authorName: 'Test', postedAt: '2026-01-15T00:00:00Z', score: -1.5 },
  ];
  const formatted = formatSearchResults(results);
  assert.ok(formatted.includes('@test'));
  assert.ok(formatted.includes('2026-01-15'));
  assert.ok(formatted.includes('Hello world'));
  assert.ok(formatted.includes('https://x.com/test/status/1'));
});

test('formatSearchResults: returns message for empty results', () => {
  assert.equal(formatSearchResults([]), 'No results found.');
});
