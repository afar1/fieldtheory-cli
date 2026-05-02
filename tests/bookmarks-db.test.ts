import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIndex, searchBookmarks, getStats, formatSearchResults, getBookmarkById, listBookmarks, sanitizeFtsQuery, getCategoryCounts, sampleByCategory, getClassificationProgress } from '../src/bookmarks-db.js';
import { openDb, saveDb } from '../src/db.js';
import { twitterBookmarksIndexPath } from '../src/paths.js';

const FIXTURES = [
  { id: '1', tweetId: '1', url: 'https://x.com/alice/status/1', text: 'Machine learning is transforming healthcare', authorHandle: 'alice', authorName: 'Alice Smith', syncedAt: '2026-01-01T00:00:00Z', postedAt: '2026-01-01T12:00:00Z', language: 'en', engagement: { likeCount: 100, repostCount: 10 }, mediaObjects: [], links: ['https://example.com'], tags: [], ingestedVia: 'graphql' },
  { id: '2', tweetId: '2', url: 'https://x.com/bob/status/2', text: 'Rust is a great systems programming language', authorHandle: 'bob', authorName: 'Bob Jones', syncedAt: '2026-02-01T00:00:00Z', postedAt: '2026-02-01T12:00:00Z', language: 'en', engagement: { likeCount: 50 }, mediaObjects: [], links: [], tags: [], ingestedVia: 'graphql' },
  { id: '3', tweetId: '3', url: 'https://x.com/alice/status/3', text: 'Deep learning models need massive compute', authorHandle: 'alice', authorName: 'Alice Smith', syncedAt: '2026-03-01T00:00:00Z', postedAt: '2026-03-01T12:00:00Z', language: 'en', engagement: { likeCount: 200, repostCount: 30 }, mediaObjects: [{ type: 'photo', url: 'https://img.com/1.jpg' }], links: [], tags: [], ingestedVia: 'graphql' },
];

async function withIsolatedDataDir(fn: () => Promise<void>, fixtures: any[] = FIXTURES): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-test-'));
  const jsonl = fixtures.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await writeFile(path.join(dir, 'bookmarks.jsonl'), jsonl);

  const saved = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    await fn();
  } finally {
    if (saved !== undefined) process.env.FT_DATA_DIR = saved;
    else delete process.env.FT_DATA_DIR;
  }
}

test('buildIndex creates a searchable database', async () => {
  await withIsolatedDataDir(async () => {
    const result = await buildIndex();
    assert.equal(result.recordCount, 3);
    assert.equal(result.newRecords, 3);
  });
});

test('buildIndex refreshes existing rows without dropping classifications', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();

    const dbPath = twitterBookmarksIndexPath();
    const db = await openDb(dbPath);
    try {
      db.run(
        `UPDATE bookmarks
         SET categories = ?, primary_category = ?, domains = ?, primary_domain = ?, github_urls = ?
         WHERE id = ?`,
        ['ai,ml', 'research', 'example.com', 'example.com', '["https://github.com/openai/test"]', '1']
      );
      saveDb(db, dbPath);
    } finally {
      db.close();
    }

    const updatedFixtures = FIXTURES.map((fixture) =>
      fixture.id === '1'
        ? {
            ...fixture,
            text: 'Machine learning note updated',
            bookmarkedAt: '2026-04-02T00:00:00Z',
          }
        : fixture
    );
    const jsonl = updatedFixtures.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await writeFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks.jsonl'), jsonl);

    const result = await buildIndex();
    assert.equal(result.recordCount, 3);
    assert.equal(result.newRecords, 0);

    const bookmark = await getBookmarkById('1');
    assert.ok(bookmark);
    assert.equal(bookmark.text, 'Machine learning note updated');
    assert.equal(bookmark.bookmarkedAt, '2026-04-02T00:00:00Z');
    assert.deepEqual(bookmark.categories, ['ai', 'ml']);
    assert.equal(bookmark.primaryCategory, 'research');
    assert.deepEqual(bookmark.domains, ['example.com']);
    assert.equal(bookmark.primaryDomain, 'example.com');
    assert.deepEqual(bookmark.githubUrls, ['https://github.com/openai/test']);
  });
});

test('getBookmarkById and listBookmarks hydrate quoted tweets', async () => {
  const fixtures = [{
    ...FIXTURES[0],
    quotedStatusId: '55',
    quotedTweet: {
      id: '55',
      text: 'Quoted tweet body',
      authorHandle: 'quoted',
      postedAt: '2026-01-01T10:00:00.000Z',
      url: 'https://x.com/quoted/status/55',
    },
  }];

  await withIsolatedDataDir(async () => {
    await buildIndex();

    const byId = await getBookmarkById('1');
    assert.equal(byId?.quotedStatusId, '55');
    assert.equal(byId?.quotedTweet?.text, 'Quoted tweet body');

    const listed = await listBookmarks({ limit: 1 });
    assert.equal(listed[0]?.quotedStatusId, '55');
    assert.equal(listed[0]?.quotedTweet?.authorHandle, 'quoted');
  }, fixtures);
});

test('searchBookmarks: full-text search returns matching results', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const results = await searchBookmarks({ query: 'learning', limit: 10 });
    assert.equal(results.length, 2);
    assert.ok(results.some((r) => r.id === '1'));
    assert.ok(results.some((r) => r.id === '3'));
  });
});

test('searchBookmarks: author filter works', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const results = await searchBookmarks({ query: '', author: 'alice', limit: 10 });
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.authorHandle === 'alice'));
  });
});

test('searchBookmarks: combined query + author filter', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const results = await searchBookmarks({ query: 'learning', author: 'alice', limit: 10 });
    assert.equal(results.length, 2);
  });
});

test('searchBookmarks: no results for unmatched query', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const results = await searchBookmarks({ query: 'cryptocurrency', limit: 10 });
    assert.equal(results.length, 0);
  });
});

test('getStats returns correct aggregate data', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const stats = await getStats();
    assert.equal(stats.totalBookmarks, 3);
    assert.equal(stats.uniqueAuthors, 2);
    assert.equal(stats.topAuthors[0].handle, 'alice');
    assert.equal(stats.topAuthors[0].count, 2);
    assert.equal(stats.languageBreakdown[0].language, 'en');
    assert.equal(stats.languageBreakdown[0].count, 3);
  });
});

// Regression: buildIndex writes primary_category='unclassified' as a
// placeholder for bookmarks that haven't been classified. getCategoryCounts
// must NOT surface that placeholder — if it does, ft wiki's scan phase
// queues an "unclassified" page whose sample set is always empty (the
// sampler reads the `categories` column, which is NULL on unclassified
// rows) and burns the LLM timeout on every compile. See
// claude/fix-claude-auth-errors-at0Oi.
test('getCategoryCounts excludes unclassified placeholder', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();

    // Fresh index: every row is primary_category='unclassified', categories=NULL.
    const counts = await getCategoryCounts();
    assert.ok(!('unclassified' in counts),
      `getCategoryCounts should not return 'unclassified', got keys: ${JSON.stringify(Object.keys(counts))}`);

    // Sanity: unclassified sampling is still empty (consistent with the
    // column-mismatch we're working around, not something this fix changes).
    const samples = await sampleByCategory('unclassified', 50);
    assert.equal(samples.length, 0);
  });
});

test('getCategoryCounts still returns real categories alongside the exclusion', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();

    // Classify two rows as 'tool' and leave the third as unclassified.
    const dbPath = twitterBookmarksIndexPath();
    const db = await openDb(dbPath);
    try {
      db.run(
        `UPDATE bookmarks SET categories = ?, primary_category = ? WHERE id IN ('1', '2')`,
        ['tool', 'tool'],
      );
      saveDb(db, dbPath);
    } finally {
      db.close();
    }

    const counts = await getCategoryCounts();
    assert.equal(counts['tool'], 2, 'real category should be present');
    assert.ok(!('unclassified' in counts), 'unclassified placeholder should still be excluded');
  });
});

test('getClassificationProgress returns category and domain completion counts', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();

    const dbPath = twitterBookmarksIndexPath();
    const db = await openDb(dbPath);
    try {
      db.run(
        `UPDATE bookmarks
         SET categories = ?, primary_category = ?, domains = ?, primary_domain = ?
         WHERE id = '1'`,
        ['tool', 'tool', 'ai', 'ai'],
      );
      db.run(
        `UPDATE bookmarks
         SET categories = ?, primary_category = ?
         WHERE id = '2'`,
        ['research', 'research'],
      );
      saveDb(db, dbPath);
    } finally {
      db.close();
    }

    const progress = await getClassificationProgress();
    assert.equal(progress.total, 3);
    assert.equal(progress.categoriesDone, 2);
    assert.equal(progress.domainsDone, 1);
  });
});

test('getStats returns chronological date range for legacy Twitter timestamps', async () => {
  const fixtures = [
    {
      id: 'old',
      tweetId: '10',
      url: 'https://x.com/old/status/10',
      text: 'Old tweet',
      authorHandle: 'old',
      authorName: 'Old',
      syncedAt: '2026-04-01T00:00:00Z',
      postedAt: 'Fri Apr 03 12:00:00 +0000 2020',
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
    {
      id: 'new',
      tweetId: '20',
      url: 'https://x.com/new/status/20',
      text: 'New tweet',
      authorHandle: 'new',
      authorName: 'New',
      syncedAt: '2026-04-01T00:00:00Z',
      postedAt: 'Wed Apr 08 06:30:15 +0000 2026',
      mediaObjects: [],
      links: [],
      tags: [],
      ingestedVia: 'graphql',
    },
  ];

  await withIsolatedDataDir(async () => {
    await buildIndex({ force: true });
    const stats = await getStats();
    assert.equal(stats.dateRange.earliest, '2020-04-03');
    assert.equal(stats.dateRange.latest, '2026-04-08');
  }, fixtures);
});

test('formatSearchResults: formats results with author, date, ID, text, url', () => {
  const results = [
    { id: '2040535589771149379', url: 'https://x.com/test/status/1', text: 'Hello world', authorHandle: 'test', authorName: 'Test', postedAt: '2026-01-15T00:00:00Z', score: -1.5 },
  ];
  const formatted = formatSearchResults(results);
  assert.ok(formatted.includes('@test'));
  assert.ok(formatted.includes('2026-01-15'));
  assert.ok(formatted.includes('(ID: 2040535589771149379)'));
  assert.ok(formatted.includes('Hello world'));
  assert.ok(formatted.includes('https://x.com/test/status/1'));
});

test('formatSearchResults: returns message for empty results', () => {
  assert.equal(formatSearchResults([]), 'No results found.');
});

// ── sanitizeFtsQuery: FTS5 operator handling ──────────────────────────

test('sanitizeFtsQuery: leaves plain queries alone', () => {
  assert.equal(sanitizeFtsQuery('rust async'), 'rust async');
  assert.equal(sanitizeFtsQuery('machine learning'), 'machine learning');
});

test('sanitizeFtsQuery: escapes parentheses (was parse error before)', () => {
  const result = sanitizeFtsQuery('foo(bar)');
  assert.ok(result.includes('"foo(bar)"'));
});

test('sanitizeFtsQuery: escapes leading dash', () => {
  const result = sanitizeFtsQuery('-foo');
  assert.ok(result.includes('"-foo"'));
});

test('sanitizeFtsQuery: escapes leading plus', () => {
  const result = sanitizeFtsQuery('+foo');
  assert.ok(result.includes('"+foo"'));
});

test('sanitizeFtsQuery: escapes column filters', () => {
  const result = sanitizeFtsQuery('author:foo');
  assert.ok(result.includes('"author:foo"'));
});

test('sanitizeFtsQuery: escapes Boolean keywords', () => {
  const result = sanitizeFtsQuery('rust AND async');
  assert.ok(result.includes('"rust"'));
  assert.ok(result.includes('"AND"'));
  assert.ok(result.includes('"async"'));
});

test('sanitizeFtsQuery: escapes prefix wildcards', () => {
  const result = sanitizeFtsQuery('java*');
  assert.ok(result.includes('"java*"'));
});

test('sanitizeFtsQuery: strips internal quotes to avoid double-escaping', () => {
  const result = sanitizeFtsQuery('"foo"bar');
  // Internal quotes stripped; term wrapped once
  assert.ok(!result.includes('""'));
});
