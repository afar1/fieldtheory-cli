import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIndex, searchBookmarks, getStats, formatSearchResults, getBookmarkById, listBookmarks, sanitizeFtsQuery, getCategoryCounts, sampleByCategory, getClassificationProgress, updateQuotedTweets, updateBookmarkContent } from '../src/bookmarks-db.js';
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

test('search ranks stronger matches ahead of insertion order with real BM25 scores', async () => {
  const fixtures = [
    { ...FIXTURES[0], text: 'nebula ' + 'background '.repeat(80) },
    { ...FIXTURES[1], text: 'nebula nebula nebula' },
    { ...FIXTURES[2], text: 'unrelated document' },
  ];
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const results = await searchBookmarks({ query: 'nebula', limit: 2 });
    assert.deepEqual(results.map(r => r.id), ['2', '1']);
    assert.ok(results[0].score < results[1].score);
    assert.ok(results.every(r => Number.isFinite(r.score) && r.score < 0));
    assert.deepEqual((await searchBookmarks({ query: 'nebula', author: 'alice' })).map(r => r.id), ['1']);
  }, fixtures);
});

const QUOTE_FIXTURE = {
  ...FIXTURES[0], text: 'A critical response', quotedStatusId: '55',
  quotedTweet: { id: '55', text: 'quasarprob programming language', authorHandle: 'quotedwriter', authorName: 'Quoted Writer', url: 'https://x.com/quotedwriter/status/55' },
};

test('quote-only hits retain both speakers and show the quoted source', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    for (const query of ['quasarprob', 'quotedwriter']) {
      const results = await searchBookmarks({ query });
      assert.equal(results.length, 1);
      assert.equal(results[0].authorHandle, 'alice');
      assert.equal(results[0].text, 'A critical response');
      assert.deepEqual(results[0].quotedTweet, QUOTE_FIXTURE.quotedTweet);
      assert.match(formatSearchResults(results), /Quoted @quotedwriter/);
      assert.match(formatSearchResults(results), /quasarprob programming language/);
      assert.match(formatSearchResults(results), /https:\/\/x.com\/quotedwriter\/status\/55/);
    }
    assert.deepEqual(await searchBookmarks({ query: 'quasarprob', author: 'quotedwriter' }), []);
    assert.deepEqual((await searchBookmarks({ query: 'quasarprob', author: 'alice' })).map(r => r.id), ['1']);
  }, [QUOTE_FIXTURE]);
});

test('legacy index gains quoted terms without changing original rows or indexing JSON metadata', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const dbPath = twitterBookmarksIndexPath();
    const db = await openDb(dbPath);
    db.run('DROP TABLE bookmarks_fts');
    db.run("CREATE VIRTUAL TABLE bookmarks_fts USING fts5(text,author_handle,author_name,article_text,content=bookmarks,content_rowid=rowid,tokenize='porter unicode61')");
    db.run("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
    db.run("REPLACE INTO meta VALUES('schema_version','6')");
    db.run("UPDATE bookmarks SET categories='opinion', article_text='archivalcontext' WHERE id='1'");
    db.run("UPDATE bookmarks SET quoted_tweet_json='not json' WHERE id='2'");
    db.run("UPDATE bookmarks SET quoted_tweet_json='null' WHERE id='3'");
    saveDb(db, dbPath); db.close();
    assert.equal((await searchBookmarks({ query: 'quasarprob' }))[0]?.id, '1');
    assert.equal((await searchBookmarks({ query: 'archivalcontext' }))[0]?.id, '1');
    assert.deepEqual(await searchBookmarks({ query: 'hiddenprofiletoken' }), []);
    await buildIndex();
    const reopened = await openDb(dbPath);
    assert.equal(reopened.exec("SELECT categories FROM bookmarks WHERE id='1'")[0].values[0][0], 'opinion');
    assert.ok(reopened.exec('PRAGMA table_info(bookmarks_fts)')[0].values.some(r => r[1] === 'quoted_text'));
    reopened.close();
    assert.equal((await searchBookmarks({ query: 'quasarprob' }))[0]?.id, '1');
  }, [{ ...QUOTE_FIXTURE, quotedTweet: { ...QUOTE_FIXTURE.quotedTweet, authorProfileImageUrl: 'https://hiddenprofiletoken.invalid/avatar' } }, FIXTURES[1], FIXTURES[2]]);
});

test('reindex updates quoted terms, including missing and empty quote text', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    assert.equal((await searchBookmarks({ query: 'quasarprob' })).length, 1);
    await writeFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks.jsonl'), JSON.stringify({ ...QUOTE_FIXTURE, quotedTweet: { ...QUOTE_FIXTURE.quotedTweet, text: 'replacementquote' } }) + '\n');
    await buildIndex();
    assert.deepEqual(await searchBookmarks({ query: 'quasarprob' }), []);
    assert.equal((await searchBookmarks({ query: 'replacementquote' })).length, 1);
    await writeFile(path.join(process.env.FT_DATA_DIR!, 'bookmarks.jsonl'), JSON.stringify({ ...QUOTE_FIXTURE, quotedTweet: { ...QUOTE_FIXTURE.quotedTweet, text: '' } }) + '\n');
    await buildIndex();
    assert.deepEqual(await searchBookmarks({ query: 'replacementquote' }), []);
  }, [QUOTE_FIXTURE]);
});


test('gap-filled and replaced quotes are searchable immediately without reindexing', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const first = { ...QUOTE_FIXTURE.quotedTweet, text: 'freshquoteterm' };
    await updateQuotedTweets([{ id: '1', quotedTweet: first }]);
    assert.equal((await searchBookmarks({ query: 'freshquoteterm' }))[0]?.id, '1');
    assert.equal((await searchBookmarks({ query: 'quotedwriter' }))[0]?.id, '1');
    await updateQuotedTweets([{ id: '1', quotedTweet: { ...first, text: 'replacementterm', authorHandle: 'replacementauthor', authorName: 'Replacement Name' } }]);
    assert.deepEqual(await searchBookmarks({ query: 'freshquoteterm' }), []);
    assert.deepEqual(await searchBookmarks({ query: 'quotedwriter' }), []);
    assert.equal((await searchBookmarks({ query: 'replacementterm' }))[0]?.id, '1');
    assert.equal((await searchBookmarks({ query: 'replacementauthor' }))[0]?.id, '1');
    await updateQuotedTweets([]);
    await updateQuotedTweets([{ id: 'missing', quotedTweet: first }]);
    assert.deepEqual(await searchBookmarks({ query: 'freshquoteterm' }), []);
    assert.equal((await searchBookmarks({ query: 'replacementterm' }))[0]?.id, '1');
  });
});

test('search display preserves quoted author names without a handle', () => {
  const r = { id: '1', url: FIXTURES[0].url, text: 'Comment', score: -1,
    quotedTweet: { ...QUOTE_FIXTURE.quotedTweet, authorHandle: undefined, authorName: 'Named Writer' } };
  assert.match(formatSearchResults([r]), /Quoted Named Writer:/);
  assert.match(formatSearchResults([{ ...r, quotedTweet: { ...r.quotedTweet, authorName: undefined } }]), /unknown author/);
});

test('search display removes terminal controls from quoted content and attribution', () => {
  const output = formatSearchResults([{ id: '1', url: FIXTURES[0].url, text: 'Comment', score: -1,
    quotedTweet: { ...QUOTE_FIXTURE.quotedTweet, text: 'hello\x1b[2J\nworld', authorHandle: 'writer\x07', url: 'https://example.com/\x1b[2J' } }]);
  assert.doesNotMatch(output, /[\x00-\x09\x0b-\x1f\x7f-\x9f]/);
  assert.match(output, /hello\?\[2J\?world/);
});

test('stored quote author metadata is validated before search display', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const cases = [
      { authorHandle: undefined, authorName: 42, label: 'unknown author' },
      { authorHandle: false, authorName: { name: 'Not a string' }, label: 'unknown author' },
      { authorHandle: null, authorName: ['Not a string'], label: 'unknown author' },
      { authorHandle: { handle: 'Not a string' }, authorName: 'Named Writer', label: 'Named Writer' },
      { authorHandle: ['Not a string'], authorName: null, label: 'unknown author' },
      { authorHandle: 'validhandle', authorName: true, label: '@validhandle' },
    ];
    for (const { authorHandle, authorName, label } of cases) {
      const dbPath = twitterBookmarksIndexPath();
      const db = await openDb(dbPath);
      try {
        db.run('UPDATE bookmarks SET quoted_tweet_json = ? WHERE id = ?', [
          JSON.stringify({ ...QUOTE_FIXTURE.quotedTweet, authorHandle, authorName }), '1',
        ]);
        saveDb(db, dbPath);
      } finally { db.close(); }
      const results = await searchBookmarks({ query: 'quasarprob' });
      assert.equal(results.length, 1);
      assert.doesNotThrow(() => formatSearchResults(results));
      assert.equal(results[0].quotedTweet?.authorHandle, typeof authorHandle === 'string' ? authorHandle : undefined);
      assert.equal(results[0].quotedTweet?.authorName, typeof authorName === 'string' ? authorName : undefined);
      assert.ok(formatSearchResults(results).includes(`Quoted ${label}:`));
    }
  }, [QUOTE_FIXTURE]);
});

test('buildIndex upgrades a pre-enrichment schema before creating dependent indexes', async () => {
  await withIsolatedDataDir(async () => {
    const dbPath = twitterBookmarksIndexPath();
    const db = await openDb(dbPath);
    try {
      // Actual old column layout, not a current table with only its FTS downgraded.
      db.run(`CREATE TABLE bookmarks (
        id TEXT PRIMARY KEY, tweet_id TEXT NOT NULL, url TEXT NOT NULL, text TEXT NOT NULL,
        author_handle TEXT, author_name TEXT, author_profile_image_url TEXT,
        posted_at TEXT, bookmarked_at TEXT, synced_at TEXT NOT NULL,
        conversation_id TEXT, in_reply_to_status_id TEXT, quoted_status_id TEXT, language TEXT,
        like_count INTEGER, repost_count INTEGER, reply_count INTEGER, quote_count INTEGER,
        bookmark_count INTEGER, view_count INTEGER, media_count INTEGER DEFAULT 0,
        link_count INTEGER DEFAULT 0, links_json TEXT, tags_json TEXT, ingested_via TEXT,
        categories TEXT, primary_category TEXT, github_urls TEXT
      )`);
      db.run('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)');
      db.run("INSERT INTO meta VALUES ('schema_version', '2')");
      db.run("CREATE VIRTUAL TABLE bookmarks_fts USING fts5(text,author_handle,author_name,content=bookmarks,content_rowid=rowid,tokenize='porter unicode61')");
      db.run('INSERT INTO bookmarks(id,tweet_id,url,text,synced_at,categories) VALUES(?,?,?,?,?,?)', [
        '1', '1', QUOTE_FIXTURE.url, QUOTE_FIXTURE.text, QUOTE_FIXTURE.syncedAt, 'opinion',
      ]);
      db.run("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
      saveDb(db, dbPath);
    } finally { db.close(); }
    await buildIndex();
    assert.equal((await searchBookmarks({ query: 'quasarprob' }))[0]?.id, '1');
    assert.deepEqual((await getBookmarkById('1'))?.categories, ['opinion']);
    const reopened = await openDb(dbPath);
    try {
      assert.equal(reopened.exec("SELECT value FROM meta WHERE key='schema_version'")[0].values[0][0], '8');
      assert.ok(reopened.exec('PRAGMA table_info(bookmarks)')[0].values.some(r => r[1] === 'article_text'));
      assert.ok(reopened.exec('PRAGMA table_info(bookmarks_fts)')[0].values.some(r => r[1] === 'quoted_text'));
    } finally { reopened.close(); }
    await buildIndex();
    assert.equal((await searchBookmarks({ query: 'quasarprob' }))[0]?.id, '1');
  }, [QUOTE_FIXTURE]);
});

test('invalid quote snapshots cannot produce hits with no displayable source', async () => {
  const invalidQuotes = [
    { text: 'phantomquote', authorHandle: 'phantomauthor', url: 'https://example.com' },
    { id: '55', text: 'phantomquote', authorName: 'phantomauthor', url: 42 },
    { id: '55', text: null, authorHandle: 'phantomauthor', url: 'https://example.com' },
  ];
  for (const quotedTweet of invalidQuotes) {
    await withIsolatedDataDir(async () => {
      await buildIndex();
      assert.deepEqual(await searchBookmarks({ query: 'phantomquote' }), []);
      assert.deepEqual(await searchBookmarks({ query: 'phantomauthor' }), []);
      const original = await searchBookmarks({ query: 'critical' });
      assert.equal(original.length, 1);
      assert.equal(original[0].quotedTweet, null);
    }, [{ ...QUOTE_FIXTURE, quotedTweet }]);
  }
});

test('existing quote indexes rebuild when snapshot validation changes, even with current metadata', async () => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const dbPath = twitterBookmarksIndexPath();
    const db = await openDb(dbPath);
    try {
      db.run('DROP VIEW bookmarks_search_content');
      db.run(`CREATE VIEW bookmarks_search_content AS
        SELECT rowid, text, author_handle, author_name, article_text,
          json_extract(quoted_tweet_json, '$.text') AS quoted_text,
          json_extract(quoted_tweet_json, '$.authorHandle') AS quoted_author_handle,
          json_extract(quoted_tweet_json, '$.authorName') AS quoted_author_name
        FROM bookmarks`);
      db.run('UPDATE bookmarks SET quoted_tweet_json = ? WHERE id = ?', [
        JSON.stringify({ text: 'phantomquote', authorHandle: 'phantomauthor' }), '2',
      ]);
      db.run("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
      saveDb(db, dbPath);
    } finally { db.close(); }
    assert.deepEqual(await searchBookmarks({ query: 'phantomquote' }), []);
    assert.equal((await searchBookmarks({ query: 'quasarprob' }))[0]?.id, '1');
    assert.equal((await searchBookmarks({ query: 'Rust' }))[0]?.id, '2');
    await buildIndex();
    const reopened = await openDb(dbPath);
    try {
      assert.ok(reopened.exec('PRAGMA table_info(bookmarks_search_content)')[0].values.some(r => r[1] === 'valid_quote_json'));
    } finally { reopened.close(); }
    assert.deepEqual(await searchBookmarks({ query: 'phantomauthor' }), []);
  }, [QUOTE_FIXTURE, FIXTURES[1]]);
});

test('stored quote dates cannot crash display while valid dates and quotes are preserved', async () => {
  for (const postedAt of [42, true, {}, [], null, undefined, '', '2026-09-21T00:00:00Z']) {
    await withIsolatedDataDir(async () => {
      await buildIndex();
      const quote = (await getBookmarkById('1'))?.quotedTweet;
      assert.ok(quote);
      assert.equal(quote.text, QUOTE_FIXTURE.quotedTweet.text);
      assert.ok(quote.postedAt == null || typeof quote.postedAt === 'string');
      assert.doesNotThrow(() => quote.postedAt ? quote.postedAt.slice(0, 10) : '');
      if (typeof postedAt === 'string') assert.equal(quote.postedAt, postedAt);
      assert.equal((await searchBookmarks({ query: 'quasarprob' })).length, 1);
    }, [{ ...QUOTE_FIXTURE, quotedTweet: { ...QUOTE_FIXTURE.quotedTweet, postedAt } }]);
  }
});

test('search display sanitizes original-post fields as well as quoted content', () => {
  const output = formatSearchResults([{
    id: '1\x07', url: 'https://example.com/\x1b[2J', text: 'original\nforged line',
    authorHandle: 'writer\x1b[2J', postedAt: '2026\x07-09-21', score: -1,
    quotedTweet: QUOTE_FIXTURE.quotedTweet,
  }]);
  assert.doesNotMatch(output, /[\x00-\x09\x0b-\x1f\x7f-\x9f]/);
  assert.ok(output.includes('original?forged line'));
  assert.ok(output.includes('Quoted @quotedwriter:'));
  assert.equal(output.split('\n').length, 5);
});

test('repeated searches do not rebuild an index persisted by buildIndex', async (t) => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const db = await openDb(twitterBookmarksIndexPath());
    const prototype = Object.getPrototypeOf(db);
    const run = prototype.run;
    db.close();
    const rebuilds: string[] = [];
    const spy = t.mock.method(prototype, 'run', function (this: unknown, sql: string, ...args: unknown[]) {
      if (/\brebuild\b/i.test(sql)) rebuilds.push(sql);
      return run.apply(this, [sql, ...args]);
    });
    try {
      for (let i = 0; i < 3; i++) {
        assert.equal((await searchBookmarks({ query: 'quasarprob' }))[0]?.id, '1');
      }
      assert.deepEqual(rebuilds, [], 'persisted migrations must avoid corpus-wide work on each search');
    } finally { spy.mock.restore(); }
  }, [QUOTE_FIXTURE]);
});


for (const legacy of [false, true]) test(`gap-fill batches quote and text updates into one rebuild (legacy=${legacy})`, async (t) => {
  await withIsolatedDataDir(async () => {
    await buildIndex();
    const db = await openDb(twitterBookmarksIndexPath());
    if (legacy) {
      db.run('DROP TABLE bookmarks_fts');
      db.run('DROP VIEW bookmarks_search_content');
      db.run("CREATE VIRTUAL TABLE bookmarks_fts USING fts5(text,author_handle,author_name,article_text,content=bookmarks,content_rowid=rowid)");
      db.run("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
      saveDb(db, twitterBookmarksIndexPath());
    }
    const prototype = Object.getPrototypeOf(db);
    const run = prototype.run;
    db.close();
    let rebuilds = 0;
    const spy = t.mock.method(prototype, 'run', function (this: unknown, sql: string, ...args: unknown[]) {
      if (/\brebuild\b/i.test(sql)) rebuilds++;
      return run.apply(this, [sql, ...args]);
    });
    try {
      await updateBookmarkContent({
        quotes: [{ id: '1', quotedTweet: { ...QUOTE_FIXTURE.quotedTweet, text: 'batchquote' } }],
        texts: [{ id: '1', text: 'batchoriginal' }],
      });
      assert.equal(rebuilds, 1);
      assert.equal((await searchBookmarks({ query: 'batchquote' }))[0]?.id, '1');
      assert.equal((await searchBookmarks({ query: 'batchoriginal' }))[0]?.id, '1');
      assert.deepEqual(await searchBookmarks({ query: 'quasarprob' }), []);
      assert.deepEqual(await searchBookmarks({ query: 'critical' }), []);
      await updateBookmarkContent({});
      await updateBookmarkContent({ quotes: [], texts: [] });
      assert.equal(rebuilds, 1);
    } finally { spy.mock.restore(); }
  }, [QUOTE_FIXTURE]);
});
