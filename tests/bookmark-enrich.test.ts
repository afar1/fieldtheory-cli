import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  enrichBookmarks,
  extractEnrichableUrls,
  extractReadableText,
  fetchArticle,
} from '../src/bookmark-enrich.js';
import { openDb, saveDb } from '../src/db.js';

async function withDataDir(fn: (dataDir: string) => Promise<void>): Promise<void> {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'ft-enrich-'));
  const previous = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dataDir;
  try {
    await fn(dataDir);
  } finally {
    if (previous === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previous;
  }
}

async function seedLegacyBookmarkDb(dataDir: string): Promise<void> {
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
    db.run(
      `INSERT INTO bookmarks (
        id, tweet_id, url, text, author_handle, author_name, posted_at, synced_at,
        link_count, links_json, ingested_via, language
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'legacy-1',
        'legacy-1',
        'https://x.com/alice/status/legacy-1',
        'https://example.com/articles/nebulawave',
        'alice',
        'Alice',
        '2026-01-01T00:00:00Z',
        '2026-04-01T00:00:00Z',
        1,
        JSON.stringify(['https://example.com/articles/nebulawave']),
        'graphql',
        'en',
      ],
    );
    db.run(
      `INSERT INTO bookmarks_fts(rowid, text, author_handle, author_name)
       SELECT rowid, text, author_handle, author_name FROM bookmarks`
    );
    saveDb(db, dbPath);
  } finally {
    db.close();
  }
}

// ── extractReadableText ─────────────────────────────────────────────────────

test('extractReadableText: extracts from <article> tag', () => {
  const html = `
    <html>
    <head><title>Test Page</title></head>
    <body>
      <nav>Navigation stuff</nav>
      <article>
        <h1>Great Article</h1>
        <p>This is a really interesting article about machine learning and its applications in modern healthcare systems and diagnostics.</p>
      </article>
      <footer>Footer stuff</footer>
    </body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.equal(result.title, 'Test Page');
  assert.ok(result.text.includes('machine learning'));
  assert.ok(!result.text.includes('Navigation'));
  assert.ok(!result.text.includes('Footer'));
});

test('extractReadableText: extracts from <main> tag when no <article>', () => {
  const html = `
    <html>
    <head><title>Main Content Page</title></head>
    <body>
      <nav>Nav</nav>
      <main>
        <p>This main section contains important information about programming languages and their evolution over the last few decades.</p>
      </main>
    </body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.ok(result.text.includes('programming languages'));
});

test('extractReadableText: uses OG title when available', () => {
  const html = `
    <html>
    <head>
      <title>Site Name | Generic Title</title>
      <meta property="og:title" content="The Real Article Title" />
      <meta property="og:site_name" content="TechBlog" />
    </head>
    <body>
      <article>
        <p>Article content about distributed systems and their role in modern cloud infrastructure for enterprise applications.</p>
      </article>
    </body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.equal(result.title, 'The Real Article Title');
  assert.equal(result.siteName, 'TechBlog');
});

test('extractReadableText: falls back to meta description for short content', () => {
  const html = `
    <html>
    <head>
      <meta name="description" content="A comprehensive guide to building scalable web applications with modern frameworks and tooling for production deployment" />
    </head>
    <body><p>Short.</p></body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.ok(result.text.includes('comprehensive guide'));
});

test('extractReadableText: extracts from JSON-LD structured data', () => {
  const html = `
    <html>
    <head>
      <script type="application/ld+json">
        {"@type": "Article", "articleBody": "This is a long form article about the future of artificial intelligence and how it will transform every industry in the coming decades."}
      </script>
    </head>
    <body><p>Tiny.</p></body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.ok(result.text.includes('artificial intelligence'));
});

test('extractReadableText: returns null for content under 50 chars', () => {
  const html = `<html><body><p>Too short</p></body></html>`;
  const result = extractReadableText(html);
  assert.equal(result, null);
});

test('extractReadableText: decodes HTML entities', () => {
  const html = `
    <html>
    <head><title>Test &amp; Title</title></head>
    <body>
      <article>
        <p>This article discusses the relationship between risk &amp; reward in venture capital investing, and why it&#39;s important to understand the dynamics.</p>
      </article>
    </body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.equal(result.title, 'Test & Title');
  assert.ok(result.text.includes('risk & reward'));
});

test('extractReadableText: strips script and style tags', () => {
  const html = `
    <html>
    <head><title>Clean Page</title></head>
    <body>
      <script>var malicious = "code";</script>
      <style>.hidden { display: none; }</style>
      <article>
        <p>Only this clean content about database optimization techniques and query planning should remain in the extracted text output.</p>
      </article>
    </body>
    </html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.ok(!result.text.includes('malicious'));
  assert.ok(!result.text.includes('display'));
  assert.ok(result.text.includes('database optimization'));
});

test('extractReadableText: caps at 15000 chars', () => {
  const longText = 'word '.repeat(5000);
  const html = `
    <html><body><article><p>${longText}</p></article></body></html>
  `;
  const result = extractReadableText(html);
  assert.ok(result);
  assert.ok(result.text.length <= 15004); // 15000 + "..."
  assert.ok(result.text.endsWith('...'));
});

test('extractEnrichableUrls: keeps external URLs that only mention x.com as a substring', () => {
  const links = JSON.stringify([
    'https://box.com/shared/folder?ref=x.com',
    'https://example.com/articles/nebulawave?source=twitter.com',
    'https://x.com/i/article/123456789',
    'https://x.com/alice/status/1',
    'https://twitter.com/alice/status/1',
    'https://t.co/short',
  ]);

  assert.deepEqual(extractEnrichableUrls(links), [
    'https://box.com/shared/folder?ref=x.com',
    'https://example.com/articles/nebulawave?source=twitter.com',
    'https://x.com/i/article/123456789',
  ]);
});

test('fetchArticle: does not reject external URLs whose query string mentions x.com', async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
    seen.push(url);
    return new Response(
      '<html><body><article><p>' +
        'Nebulawave systems analysis '.repeat(8) +
        '</p></article></body></html>',
      {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      },
    );
  }) as typeof fetch;

  try {
    const url = 'https://box.com/shared/folder?ref=x.com';
    const result = await fetchArticle(url);
    assert.ok(result);
    assert.equal(seen.length, 1);
    assert.equal(seen[0], url);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enrichBookmarks: runs schema migrations before rebuilding FTS', async () => {
  await withDataDir(async (dataDir) => {
    await seedLegacyBookmarkDb(dataDir);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        '<html><body><article><p>' +
          'Nebulawave research note '.repeat(12) +
          '</p></article></body></html>',
        {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        },
      )) as typeof fetch;

    try {
      const result = await enrichBookmarks({ limit: 10 });
      assert.equal(result.enriched, 1);
      assert.deepEqual(result.warnings, []);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const db = await openDb(path.join(dataDir, 'bookmarks.db'));
    try {
      const ftsSql = db.exec(`SELECT sql FROM sqlite_master WHERE name = 'bookmarks_fts'`)[0]
        ?.values[0]?.[0] as string;
      const matches = Number(
        db.exec(`SELECT COUNT(*) FROM bookmarks_fts WHERE bookmarks_fts MATCH 'nebulawave'`)[0]
          ?.values[0]?.[0] ?? 0,
      );

      assert.match(ftsSql, /article_text/);
      assert.equal(matches, 1);
    } finally {
      db.close();
    }
  });
});
