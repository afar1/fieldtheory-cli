import type { Database } from 'sql.js';
import { openDb, saveDb } from './db.js';
import { parseTimestampMs, toIsoDate } from './date-utils.js';
import { readJsonLines, writeJsonLines } from './fs.js';
import { twitterBookmarksCachePath, twitterBookmarksIndexPath, twitterClassificationsPath } from './paths.js';
import type { BookmarkRecord, QuotedTweetSnapshot, ClassificationRecord } from './types.js';
import { classifyCorpus, formatClassificationSummary } from './bookmark-classify.js';
import type { ClassificationSummary } from './bookmark-classify.js';

const SCHEMA_VERSION = 6;

export interface SearchResult {
  id: string;
  url: string;
  text: string;
  authorHandle?: string;
  authorName?: string;
  postedAt?: string | null;
  score: number;
}

export interface SearchOptions {
  query: string;
  author?: string;
  limit?: number;
  before?: string;
  after?: string;
  folder?: string;
}

export interface BookmarkTimelineItem {
  id: string;
  tweetId: string;
  url: string;
  text: string;
  authorHandle?: string;
  authorName?: string;
  authorProfileImageUrl?: string;
  postedAt?: string | null;
  bookmarkedAt?: string | null;
  syncedAt?: string | null;
  categories: string[];
  primaryCategory?: string | null;
  domains: string[];
  primaryDomain?: string | null;
  githubUrls: string[];
  links: string[];
  articleTitle?: string | null;
  articleText?: string | null;
  articleSite?: string | null;
  enrichedAt?: string | null;
  quotedStatusId?: string | null;
  quotedTweet?: QuotedTweetSnapshot | null;
  mediaCount: number;
  linkCount: number;
  likeCount?: number | null;
  repostCount?: number | null;
  replyCount?: number | null;
  quoteCount?: number | null;
  bookmarkCount?: number | null;
  viewCount?: number | null;
  folderIds: string[];
  folderNames: string[];
}

export interface BookmarkTimelineFilters {
  query?: string;
  author?: string;
  after?: string;
  before?: string;
  category?: string;
  domain?: string;
  folder?: string;
  sort?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface BookmarkClassificationProgress {
  total: number;
  categoriesDone: number;
  domainsDone: number;
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function parseQuotedTweet(value: unknown): QuotedTweetSnapshot | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<QuotedTweetSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.id !== 'string' || typeof parsed.text !== 'string' || typeof parsed.url !== 'string') return null;
    return parsed as QuotedTweetSnapshot;
  } catch {
    return null;
  }
}

function parseCsv(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function chronologicalDateRange(values: unknown[]): { earliest: string | null; latest: string | null } {
  let earliestMs = Number.POSITIVE_INFINITY;
  let latestMs = Number.NEGATIVE_INFINITY;
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const ms = parseTimestampMs(value);
    if (ms == null) continue;
    const isoDate = toIsoDate(value);
    if (!isoDate) continue;
    if (ms < earliestMs) {
      earliestMs = ms;
      earliest = isoDate;
    }
    if (ms > latestMs) {
      latestMs = ms;
      latest = isoDate;
    }
  }

  return { earliest, latest };
}

function mapTimelineRow(row: unknown[]): BookmarkTimelineItem {
  return {
    id: row[0] as string,
    tweetId: row[1] as string,
    url: row[2] as string,
    text: row[3] as string,
    authorHandle: (row[4] as string) ?? undefined,
    authorName: (row[5] as string) ?? undefined,
    authorProfileImageUrl: (row[6] as string) ?? undefined,
    postedAt: (row[7] as string) ?? null,
    bookmarkedAt: (row[8] as string) ?? null,
    categories: parseCsv(row[9]),
    primaryCategory: (row[10] as string) ?? null,
    domains: parseCsv(row[11]),
    primaryDomain: (row[12] as string) ?? null,
    githubUrls: parseJsonArray(row[13]),
    links: parseJsonArray(row[14]),
    mediaCount: Number(row[15] ?? 0),
    linkCount: Number(row[16] ?? 0),
    likeCount: row[17] as number | null,
    repostCount: row[18] as number | null,
    replyCount: row[19] as number | null,
    quoteCount: row[20] as number | null,
    bookmarkCount: row[21] as number | null,
    viewCount: row[22] as number | null,
    folderIds: parseJsonArray(row[23]),
    folderNames: parseJsonArray(row[24]),
    articleTitle: (row[25] as string) ?? null,
    articleText: (row[26] as string) ?? null,
    articleSite: (row[27] as string) ?? null,
    syncedAt: (row[28] as string) ?? null,
    enrichedAt: (row[29] as string) ?? null,
    quotedStatusId: (row[30] as string) ?? null,
    quotedTweet: parseQuotedTweet(row[31]),
  };
}

function buildBookmarkWhereClause(filters: BookmarkTimelineFilters): {
  where: string;
  params: Array<string | number>;
} {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.query) {
    conditions.push(`b.rowid IN (SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ?)`);
    params.push(filters.query);
  }
  if (filters.author) {
    conditions.push(`b.author_handle = ? COLLATE NOCASE`);
    params.push(filters.author);
  }
  if (filters.after) {
    conditions.push(`COALESCE(b.posted_at, b.bookmarked_at) >= ?`);
    params.push(filters.after);
  }
  if (filters.before) {
    conditions.push(`COALESCE(b.posted_at, b.bookmarked_at) <= ?`);
    params.push(filters.before);
  }
  if (filters.category) {
    conditions.push(`b.categories LIKE ?`);
    params.push(`%${filters.category}%`);
  }
  if (filters.domain) {
    conditions.push(`b.domains LIKE ?`);
    params.push(`%${filters.domain}%`);
  }
  if (filters.folder) {
    conditions.push(
      `EXISTS (SELECT 1 FROM json_each(b.folder_names) WHERE json_each.value = ? COLLATE NOCASE)`
    );
    params.push(filters.folder);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function bookmarkSortClause(direction: 'asc' | 'desc' = 'desc'): string {
  const normalized = direction === 'asc' ? 'ASC' : 'DESC';
  return `
    ORDER BY
      CASE
        WHEN b.bookmarked_at GLOB '____-__-__*' THEN b.bookmarked_at
        WHEN b.posted_at GLOB '____-__-__*' THEN b.posted_at
        ELSE ''
      END ${normalized},
      CAST(b.tweet_id AS INTEGER) ${normalized}
  `;
}

function initSchema(db: Database): void {
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
    primary_domain TEXT,
    quoted_tweet_json TEXT,
    article_title TEXT,
    article_text TEXT,
    article_site TEXT,
    enriched_at TEXT,
    folder_ids TEXT,
    folder_names TEXT
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_bookmarks_author ON bookmarks(author_handle)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_bookmarks_posted ON bookmarks(posted_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_bookmarks_language ON bookmarks(language)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(primary_category)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_bookmarks_domain ON bookmarks(primary_domain)`);

  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
    text,
    author_handle,
    author_name,
    article_text,
    content=bookmarks,
    content_rowid=rowid,
    tokenize='porter unicode61'
  )`);

  db.run("REPLACE INTO meta VALUES ('schema_version', ?)", [String(SCHEMA_VERSION)]);
}

function columnExists(db: Database, table: string, column: string): boolean {
  try {
    const rows = db.exec(`PRAGMA table_info(${table})`);
    const cols = rows[0]?.values ?? [];
    // table_info columns: cid, name, type, notnull, dflt_value, pk
    return cols.some((col) => col[1] === column);
  } catch {
    return false;
  }
}

function ensureColumn(db: Database, table: string, column: string, definition: string): void {
  if (columnExists(db, table, column)) return;
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function ftsHasColumn(db: Database, column: string): boolean {
  try {
    db.exec(`SELECT ${column} FROM bookmarks_fts LIMIT 0`);
    return true;
  } catch {
    return false;
  }
}

function ensureMigrations(db: Database): void {
  // Ensure meta table exists (may not on a fresh/empty DB)
  db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');

  // Only run column additions if the bookmarks table actually exists — first
  // run comes through initSchema, not here.
  const tableExists = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='bookmarks'");
  const hasBookmarksTable = tableExists.length > 0 && tableExists[0].values.length > 0;

  if (hasBookmarksTable) {
    // Migrations are driven by actual column existence, not by meta.schema_version.
    // A past bug could leave meta ahead of reality (v4 migration was marked done
    // without its ALTER actually succeeding, because a later throw halted the run
    // after meta had been pre-bumped). Checking the real schema is self-healing.
    ensureColumn(db, 'bookmarks', 'domains', 'TEXT');
    ensureColumn(db, 'bookmarks', 'primary_domain', 'TEXT');
    db.run('CREATE INDEX IF NOT EXISTS idx_bookmarks_domain ON bookmarks(primary_domain)');

    ensureColumn(db, 'bookmarks', 'quoted_tweet_json', 'TEXT');

    ensureColumn(db, 'bookmarks', 'article_title', 'TEXT');
    ensureColumn(db, 'bookmarks', 'article_text', 'TEXT');
    ensureColumn(db, 'bookmarks', 'article_site', 'TEXT');
    ensureColumn(db, 'bookmarks', 'enriched_at', 'TEXT');

    ensureColumn(db, 'bookmarks', 'folder_ids', 'TEXT');
    ensureColumn(db, 'bookmarks', 'folder_names', 'TEXT');

    // FTS rebuild: only if the FTS table is missing the article_text column.
    // Check via a zero-row SELECT so we don't rebuild unnecessarily.
    if (!ftsHasColumn(db, 'article_text')) {
      db.run('DROP TABLE IF EXISTS bookmarks_fts');
      db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
        text, author_handle, author_name, article_text,
        content=bookmarks, content_rowid=rowid,
        tokenize='porter unicode61'
      )`);
      db.run("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
    }
  }

  db.run("REPLACE INTO meta VALUES ('schema_version', ?)", [String(SCHEMA_VERSION)]);
}

interface PreservedBookmarkFields {
  categories: string | null;
  primaryCategory: string | null;
  githubUrls: string | null;
  domains: string | null;
  primaryDomain: string | null;
  quotedTweetJson: string | null;
  articleTitle: string | null;
  articleText: string | null;
  articleSite: string | null;
  enrichedAt: string | null;
  folderIds: string | null;
  folderNames: string | null;
}

function serializeJsonArray(values: string[] | undefined | null): string | null {
  if (!values || values.length === 0) return null;
  return JSON.stringify(values);
}

function insertRecord(db: Database, r: BookmarkRecord, preserved?: PreservedBookmarkFields): void {
  // Extract GitHub URLs (kept inline — no LLM needed for URL parsing)
  const text = r.text ?? '';
  const githubMatches = text.match(/github\.com\/[\w.-]+\/[\w.-]+/gi) ?? [];
  const githubFromLinks = (r.links ?? []).filter((l) => /github\.com/i.test(l));
  const githubUrls = [...new Set([...githubMatches.map((m) => `https://${m}`), ...githubFromLinks])];

  db.run(
    `INSERT OR REPLACE INTO bookmarks VALUES (${Array(37).fill('?').join(',')})`,
    [
      r.id,
      r.tweetId,
      r.url,
      r.text,
      r.authorHandle ?? null,
      r.authorName ?? null,
      r.authorProfileImageUrl ?? null,
      r.postedAt ?? null,
      r.bookmarkedAt ?? null,
      r.syncedAt,
      r.conversationId ?? null,
      r.inReplyToStatusId ?? null,
      r.quotedStatusId ?? null,
      r.language ?? null,
      r.engagement?.likeCount ?? null,
      r.engagement?.repostCount ?? null,
      r.engagement?.replyCount ?? null,
      r.engagement?.quoteCount ?? null,
      r.engagement?.bookmarkCount ?? null,
      r.engagement?.viewCount ?? null,
      r.media?.length ?? 0,
      r.links?.length ?? 0,
      r.links?.length ? JSON.stringify(r.links) : null,
      r.tags?.length ? JSON.stringify(r.tags) : null,
      r.ingestedVia ?? null,
      preserved?.categories ?? null,
      preserved?.primaryCategory ?? 'unclassified',
      preserved?.githubUrls ?? (githubUrls.length ? JSON.stringify(githubUrls) : null),
      preserved?.domains ?? null,
      preserved?.primaryDomain ?? null,
      r.quotedTweet ? JSON.stringify(r.quotedTweet) : (preserved?.quotedTweetJson ?? null),
      preserved?.articleTitle ?? null,
      preserved?.articleText ?? null,
      preserved?.articleSite ?? null,
      preserved?.enrichedAt ?? null,
      serializeJsonArray(r.folderIds) ?? preserved?.folderIds ?? null,
      serializeJsonArray(r.folderNames) ?? preserved?.folderNames ?? null,
    ]
  );
}

export async function buildIndex(options?: { force?: boolean }): Promise<{ dbPath: string; recordCount: number; newRecords: number }> {
  const cachePath = twitterBookmarksCachePath();
  const dbPath = twitterBookmarksIndexPath();
  const records = await readJsonLines<BookmarkRecord>(cachePath);

  const db = await openDb(dbPath);
  try {
    if (options?.force) {
      db.run('DROP TABLE IF EXISTS bookmarks_fts');
      db.run('DROP TABLE IF EXISTS bookmarks');
      db.run('DROP TABLE IF EXISTS meta');
    }

    initSchema(db);
    ensureMigrations(db);

    // Preserve classification and enrichment fields when refreshing existing rows.
    // Folder fields are normally sourced from JSONL (source of truth) but we also
    // preserve them here as defense-in-depth: if a future code path writes folder
    // state to the DB without updating JSONL, this keeps it from being wiped on
    // the next buildIndex.
    const existingRows = new Map<string, PreservedBookmarkFields>();
    try {
      const rows = db.exec(
        `SELECT id, categories, primary_category, github_urls, domains, primary_domain,
                quoted_tweet_json, article_title, article_text, article_site, enriched_at,
                folder_ids, folder_names
         FROM bookmarks`
      );
      for (const r of (rows[0]?.values ?? [])) {
        existingRows.set(r[0] as string, {
          categories: (r[1] as string) ?? null,
          primaryCategory: (r[2] as string) ?? null,
          githubUrls: (r[3] as string) ?? null,
          domains: (r[4] as string) ?? null,
          primaryDomain: (r[5] as string) ?? null,
          quotedTweetJson: (r[6] as string) ?? null,
          articleTitle: (r[7] as string) ?? null,
          articleText: (r[8] as string) ?? null,
          articleSite: (r[9] as string) ?? null,
          enrichedAt: (r[10] as string) ?? null,
          folderIds: (r[11] as string) ?? null,
          folderNames: (r[12] as string) ?? null,
        });
      }
    } catch { /* table may be empty */ }

    // Backup source of truth: classifications.jsonl
    const classificationsPath = twitterClassificationsPath();
    const storedClassifications = await readJsonLines<ClassificationRecord>(classificationsPath);
    for (const c of storedClassifications) {
      const existing = existingRows.get(c.id);
      if (existing) {
        // Hydrate domains if missing in DB but present in JSONL
        if (!existing.domains && c.domains) {
          existing.domains = c.domains.join(',');
          existing.primaryDomain = c.primaryDomain ?? null;
        }
        // Hydrate categories if missing in DB but present in JSONL
        if (!existing.categories && c.categories) {
          existing.categories = c.categories.join(',');
          existing.primaryCategory = c.primaryCategory;
        }
      } else {
        // Create new placeholder for untracked record that has classification data
        existingRows.set(c.id, {
          categories: c.categories.join(','),
          primaryCategory: c.primaryCategory,
          domains: c.domains?.join(',') ?? null,
          primaryDomain: c.primaryDomain ?? null,
          githubUrls: null,
          quotedTweetJson: null,
          articleTitle: null,
          articleText: null,
          articleSite: null,
          enrichedAt: null,
          folderIds: null,
          folderNames: null,
        });
      }
    }

    const newRecords: BookmarkRecord[] = records.filter(r => !existingRows.has(r.id));

    if (records.length > 0) {
      db.run('BEGIN TRANSACTION');
      try {
        for (const record of records) {
          insertRecord(db, record, existingRows.get(record.id));
        }
        db.run('COMMIT');
      } catch (err) {
        db.run('ROLLBACK');
        throw err;
      }
    }

    // Rebuild FTS index from content table
    db.run(`INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')`);

    saveDb(db, dbPath);
    const totalRows = db.exec('SELECT COUNT(*) FROM bookmarks')[0]?.values[0]?.[0] as number;
    return { dbPath, recordCount: totalRows, newRecords: newRecords.length };
  } finally {
    db.close();
  }
}

/**
 * Escape FTS5 special syntax so user queries are treated as literal terms.
 *
 * FTS5 operators we need to defend against:
 *   - Boolean keywords: AND, OR, NOT, NEAR
 *   - Grouping: ( )
 *   - Negation / required terms: leading - or +
 *   - Column filters: column_name:term
 *   - Prefix matching: *
 *   - Expression escapes: { } ^ " \
 *
 * When any of these are present, wrap each whitespace-separated term in
 * double quotes so FTS5 treats it as a literal token. Without this, a query
 * like `foo(bar)` throws a parse error before it even hits the index.
 */
export function sanitizeFtsQuery(query: string): string {
  const hasFts5Operator =
    /[*{}:^"()\\+]/.test(query) ||
    /(^|\s)-\S/.test(query) ||
    /(^|\s)(AND|OR|NOT|NEAR)(\s|$)/i.test(query);

  if (!hasFts5Operator) return query;

  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '')}"`)
    .join(' ');
}

export async function searchBookmarks(options: SearchOptions): Promise<SearchResult[]> {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);
  ensureMigrations(db);
  const limit = options.limit ?? 20;

  try {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.query) {
      conditions.push(`b.rowid IN (SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ?)`);
      params.push(sanitizeFtsQuery(options.query));
    }
    if (options.author) {
      conditions.push(`b.author_handle = ? COLLATE NOCASE`);
      params.push(options.author);
    }
    if (options.after) {
      conditions.push(`b.posted_at >= ?`);
      params.push(options.after);
    }
    if (options.before) {
      conditions.push(`b.posted_at <= ?`);
      params.push(options.before);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // If we have an FTS query, use bm25 for ranking; otherwise sort by posted_at
    const orderBy = options.query
      ? `ORDER BY bm25(bookmarks_fts, 5.0, 1.0, 1.0, 3.0) ASC`
      : `ORDER BY b.posted_at DESC`;

    // For FTS ranking we need to join with the FTS table for bm25
    let sql: string;
    if (options.query) {
      sql = `
        SELECT b.id, b.url, b.text, b.author_handle, b.author_name, b.posted_at,
               bm25(bookmarks_fts, 5.0, 1.0, 1.0, 3.0) as score
        FROM bookmarks b
        JOIN bookmarks_fts ON bookmarks_fts.rowid = b.rowid
        ${where}
        ${orderBy}
        LIMIT ?
      `;
    } else {
      sql = `
        SELECT b.id, b.url, b.text, b.author_handle, b.author_name, b.posted_at,
               0 as score
        FROM bookmarks b
        ${where}
        ORDER BY b.posted_at DESC
        LIMIT ?
      `;
    }
    params.push(limit);

    let rows;
    try {
      rows = db.exec(sql, params);
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (msg.includes('fts5') || msg.includes('MATCH') || msg.includes('syntax')) {
        throw new Error(`Invalid search query: "${options.query}". Try simpler terms or wrap phrases in double quotes.`);
      }
      throw err;
    }
    if (!rows.length) return [];

    return rows[0].values.map((row) => ({
      id: row[0] as string,
      url: row[1] as string,
      text: row[2] as string,
      authorHandle: row[3] as string | undefined,
      authorName: row[4] as string | undefined,
      postedAt: row[5] as string | null,
      score: row[6] as number,
    }));
  } finally {
    db.close();
  }
}

export async function listBookmarks(
  filters: BookmarkTimelineFilters = {},
): Promise<BookmarkTimelineItem[]> {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);
  ensureMigrations(db);
  const limit = filters.limit ?? 30;
  const offset = filters.offset ?? 0;

  try {
    const { where, params } = buildBookmarkWhereClause(filters);
    const sql = `
      SELECT
        b.id,
        b.tweet_id,
        b.url,
        b.text,
        b.author_handle,
        b.author_name,
        b.author_profile_image_url,
        b.posted_at,
        b.bookmarked_at,
        b.categories,
        b.primary_category,
        b.domains,
        b.primary_domain,
        b.github_urls,
        b.links_json,
        b.media_count,
        b.link_count,
        b.like_count,
        b.repost_count,
        b.reply_count,
        b.quote_count,
        b.bookmark_count,
        b.view_count,
        b.folder_ids,
        b.folder_names,
        b.article_title,
        b.article_text,
        b.article_site,
        b.synced_at,
        b.enriched_at,
        b.quoted_status_id,
        b.quoted_tweet_json
      FROM bookmarks b
      ${where}
      ${bookmarkSortClause(filters.sort)}
      LIMIT ?
      OFFSET ?
    `;
    params.push(limit, offset);

    const rows = db.exec(sql, params);
    if (!rows.length) return [];
    return rows[0].values.map((row) => mapTimelineRow(row));
  } finally {
    db.close();
  }
}

export async function countBookmarks(
  filters: BookmarkTimelineFilters = {},
): Promise<number> {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);
  ensureMigrations(db);

  try {
    const { where, params } = buildBookmarkWhereClause(filters);
    const sql = `
      SELECT COUNT(*)
      FROM bookmarks b
      ${where}
    `;
    const rows = db.exec(sql, params);
    return Number(rows[0]?.values?.[0]?.[0] ?? 0);
  } finally {
    db.close();
  }
}

export async function exportBookmarksForSyncSeed(): Promise<BookmarkRecord[]> {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);
  ensureMigrations(db);

  try {
    const sql = `
      SELECT
        b.id,
        b.tweet_id,
        b.url,
        b.text,
        b.author_handle,
        b.author_name,
        b.author_profile_image_url,
        b.posted_at,
        b.bookmarked_at,
        b.synced_at,
        b.conversation_id,
        b.in_reply_to_status_id,
        b.quoted_status_id,
        b.language,
        b.like_count,
        b.repost_count,
        b.reply_count,
        b.quote_count,
        b.bookmark_count,
        b.view_count,
        b.links_json,
        b.folder_ids,
        b.folder_names
      FROM bookmarks b
      ${bookmarkSortClause('desc')}
    `;
    const rows = db.exec(sql);
    if (!rows.length) return [];

    return rows[0].values.map((row) => ({
      id: String(row[0]),
      tweetId: String(row[1]),
      url: String(row[2]),
      text: String(row[3] ?? ''),
      authorHandle: (row[4] as string) ?? undefined,
      authorName: (row[5] as string) ?? undefined,
      authorProfileImageUrl: (row[6] as string) ?? undefined,
      postedAt: (row[7] as string) ?? null,
      bookmarkedAt: (row[8] as string) ?? null,
      syncedAt: String(row[9] ?? row[8] ?? row[7] ?? new Date(0).toISOString()),
      conversationId: (row[10] as string) ?? undefined,
      inReplyToStatusId: (row[11] as string) ?? undefined,
      quotedStatusId: (row[12] as string) ?? undefined,
      language: (row[13] as string) ?? undefined,
      engagement: {
        likeCount: row[14] as number | undefined,
        repostCount: row[15] as number | undefined,
        replyCount: row[16] as number | undefined,
        quoteCount: row[17] as number | undefined,
        bookmarkCount: row[18] as number | undefined,
        viewCount: row[19] as number | undefined,
      },
      links: parseJsonArray(row[20]),
      folderIds: parseJsonArray(row[21]),
      folderNames: parseJsonArray(row[22]),
      tags: [],
      ingestedVia: 'graphql',
    }));
  } finally {
    db.close();
  }
}

export async function getBookmarkById(id: string): Promise<BookmarkTimelineItem | null> {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);
  ensureMigrations(db);

  try {
    const rows = db.exec(
      `SELECT
        b.id,
        b.tweet_id,
        b.url,
        b.text,
        b.author_handle,
        b.author_name,
        b.author_profile_image_url,
        b.posted_at,
        b.bookmarked_at,
        b.categories,
        b.primary_category,
        b.domains,
        b.primary_domain,
        b.github_urls,
        b.links_json,
        b.media_count,
        b.link_count,
        b.like_count,
        b.repost_count,
        b.reply_count,
        b.quote_count,
        b.bookmark_count,
        b.view_count,
        b.folder_ids,
        b.folder_names,
        b.article_title,
        b.article_text,
        b.article_site,
        b.synced_at,
        b.enriched_at,
        b.quoted_status_id,
        b.quoted_tweet_json
      FROM bookmarks b
      WHERE b.id = ?
      LIMIT 1`,
      [id]
    );
    const row = rows[0]?.values?.[0];
    return row ? mapTimelineRow(row) : null;
  } finally {
    db.close();
  }
}

export async function getStats(): Promise<{
  totalBookmarks: number;
  uniqueAuthors: number;
  dateRange: { earliest: string | null; latest: string | null };
  topAuthors: { handle: string; count: number }[];
  languageBreakdown: { language: string; count: number }[];
}> {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);

  try {
    const total = db.exec('SELECT COUNT(*) FROM bookmarks')[0]?.values[0]?.[0] as number;
    const authors = db.exec('SELECT COUNT(DISTINCT author_handle) FROM bookmarks')[0]?.values[0]?.[0] as number;
    const postedAtRows = db.exec('SELECT posted_at FROM bookmarks WHERE posted_at IS NOT NULL');
    const range = chronologicalDateRange(
      (postedAtRows[0]?.values ?? []).map((row) => row[0])
    );

    const topAuthorsRows = db.exec(
      `SELECT author_handle, COUNT(*) as c FROM bookmarks
       WHERE author_handle IS NOT NULL
       GROUP BY author_handle ORDER BY c DESC LIMIT 15`
    );
    const topAuthors = (topAuthorsRows[0]?.values ?? []).map((r) => ({
      handle: r[0] as string,
      count: r[1] as number,
    }));

    const langRows = db.exec(
      `SELECT language, COUNT(*) as c FROM bookmarks
       WHERE language IS NOT NULL
       GROUP BY language ORDER BY c DESC LIMIT 10`
    );
    const languageBreakdown = (langRows[0]?.values ?? []).map((r) => ({
      language: r[0] as string,
      count: r[1] as number,
    }));

    return {
      totalBookmarks: total,
      uniqueAuthors: authors,
      dateRange: range,
      topAuthors,
      languageBreakdown,
    };
  } finally {
    db.close();
  }
}

// ── Classification ───────────────────────────────────────────────────────

export async function classifyAndRebuild(): Promise<{
  dbPath: string;
  recordCount: number;
  summary: ClassificationSummary;
}> {
  const cachePath = twitterBookmarksCachePath();
  const dbPath = twitterBookmarksIndexPath();
  const records = await readJsonLines<BookmarkRecord>(cachePath);
  const { results, summary } = classifyCorpus(records);

  // Rebuild index then apply regex classifications
  const buildResult = await buildIndex();
  const db = await openDb(dbPath);
  ensureMigrations(db);
  try {
    const stmt = db.prepare(`UPDATE bookmarks SET categories = ?, primary_category = ?, github_urls = ? WHERE id = ? AND (primary_category = 'unclassified' OR primary_category IS NULL)`);
    for (const [id, r] of results) {
      if (r.categories.length > 0) {
        stmt.run([r.categories.join(','), r.primary, r.githubUrls.length ? JSON.stringify(r.githubUrls) : null, id]);
      }
    }
    stmt.free();
    saveDb(db, dbPath);
  } finally {
    db.close();
  }
  return { ...buildResult, summary };
}

export interface CategorySample {
  id: string;
  url: string;
  text: string;
  authorHandle?: string;
  categories: string;
  githubUrls?: string;
  links?: string;
}

export async function sampleByCategory(
  category: string,
  limit: number,
  existingDb?: Database,
): Promise<CategorySample[]> {
  const db = existingDb ?? await openDb(twitterBookmarksIndexPath());
  if (!existingDb) ensureMigrations(db);
  try {
    const rows = db.exec(
      `SELECT id, url, text, author_handle, categories, github_urls, links_json
       FROM bookmarks
       WHERE categories LIKE ?
       ORDER BY RANDOM()
       LIMIT ?`,
      [`%${category}%`, limit]
    );
    if (!rows.length) return [];
    return rows[0].values.map((r: any) => ({
      id: r[0] as string,
      url: r[1] as string,
      text: r[2] as string,
      authorHandle: (r[3] as string) ?? undefined,
      categories: (r[4] as string) ?? '',
      githubUrls: (r[5] as string) ?? undefined,
      links: (r[6] as string) ?? undefined,
    }));
  } finally {
    if (!existingDb) db.close();
  }
}

export async function getCategoryCounts(existingDb?: Database): Promise<Record<string, number>> {
  const db = existingDb ?? await openDb(twitterBookmarksIndexPath());
  if (!existingDb) ensureMigrations(db);
  try {
    // Exclude 'unclassified' — it's the default placeholder for bookmarks
    // that haven't been run through `ft classify` yet, NOT a real category.
    // Including it broke `ft wiki`: the wiki scanner would see a huge
    // "unclassified" count (often N == total bookmarks), pass the
    // MIN_CATEGORY_COUNT gate, and queue a page generation. But
    // `sampleByCategory('unclassified', …)` looks up the `categories` column
    // (a list) rather than `primary_category`, and unclassified rows have
    // `categories = NULL`, so sampling always returned zero rows. We then
    // sent the LLM a "summarize these 0 bookmarks" prompt and wasted a
    // timeout on every compile.
    const rows = db.exec(
      `SELECT primary_category, COUNT(*) as c FROM bookmarks
       WHERE primary_category IS NOT NULL AND primary_category != 'unclassified'
       GROUP BY primary_category ORDER BY c DESC`
    );
    const counts: Record<string, number> = {};
    for (const row of rows[0]?.values ?? []) {
      counts[row[0] as string] = row[1] as number;
    }
    return counts;
  } finally {
    if (!existingDb) db.close();
  }
}

export async function getClassificationProgress(): Promise<BookmarkClassificationProgress> {
  const dbPath = twitterBookmarksIndexPath();
  let db: Database;
  try {
    db = await openDb(dbPath);
  } catch {
    return { total: 0, categoriesDone: 0, domainsDone: 0 };
  }

  try {
    ensureMigrations(db);
    const row = db.exec(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN primary_category IS NOT NULL AND primary_category <> '' AND primary_category <> 'unclassified' THEN 1 ELSE 0 END) AS categories_done,
         SUM(CASE WHEN primary_domain IS NOT NULL AND primary_domain <> '' THEN 1 ELSE 0 END) AS domains_done
       FROM bookmarks`
    )[0]?.values?.[0];

    return {
      total: Number(row?.[0] ?? 0),
      categoriesDone: Number(row?.[1] ?? 0),
      domainsDone: Number(row?.[2] ?? 0),
    };
  } catch {
    return { total: 0, categoriesDone: 0, domainsDone: 0 };
  } finally {
    db.close();
  }
}

export async function getDomainCounts(existingDb?: Database): Promise<Record<string, number>> {
  const db = existingDb ?? await openDb(twitterBookmarksIndexPath());
  if (!existingDb) ensureMigrations(db);
  try {
    const rows = db.exec(
      `SELECT primary_domain, COUNT(*) as c FROM bookmarks
       WHERE primary_domain IS NOT NULL
       GROUP BY primary_domain ORDER BY c DESC`
    );
    const counts: Record<string, number> = {};
    for (const row of rows[0]?.values ?? []) {
      counts[row[0] as string] = row[1] as number;
    }
    return counts;
  } finally {
    if (!existingDb) db.close();
  }
}

export async function getFolderCounts(existingDb?: Database): Promise<{ counts: Record<string, number>; untagged: number }> {
  const db = existingDb ?? await openDb(twitterBookmarksIndexPath());
  if (!existingDb) ensureMigrations(db);
  try {
    const counts: Record<string, number> = {};
    const rows = db.exec(
      `SELECT folder_names FROM bookmarks WHERE folder_names IS NOT NULL AND folder_names != ''`
    );
    let tagged = 0;
    for (const row of rows[0]?.values ?? []) {
      const names = parseJsonArray(row[0]);
      if (names.length === 0) continue;
      tagged += 1;
      for (const name of names) {
        counts[name] = (counts[name] ?? 0) + 1;
      }
    }
    const totalRow = db.exec('SELECT COUNT(*) FROM bookmarks')[0]?.values[0]?.[0] as number | undefined;
    const total = Number(totalRow ?? 0);
    const untagged = Math.max(0, total - tagged);
    return { counts, untagged };
  } finally {
    if (!existingDb) db.close();
  }
}

export async function sampleByDomain(
  domain: string,
  limit: number,
  existingDb?: Database,
): Promise<CategorySample[]> {
  const db = existingDb ?? await openDb(twitterBookmarksIndexPath());
  if (!existingDb) ensureMigrations(db);
  try {
    const rows = db.exec(
      `SELECT id, url, text, author_handle, categories, github_urls, links_json
       FROM bookmarks
       WHERE domains LIKE ?
       ORDER BY RANDOM()
       LIMIT ?`,
      [`%${domain}%`, limit]
    );
    if (!rows.length) return [];
    return rows[0].values.map((r: any) => ({
      id: r[0] as string,
      url: r[1] as string,
      text: r[2] as string,
      authorHandle: (r[3] as string) ?? undefined,
      categories: (r[4] as string) ?? '',
      githubUrls: (r[5] as string) ?? undefined,
      links: (r[6] as string) ?? undefined,
    }));
  } finally {
    if (!existingDb) db.close();
  }
}

export async function sampleByAuthor(
  authorHandle: string,
  limit: number,
  existingDb?: Database,
): Promise<CategorySample[]> {
  const db = existingDb ?? await openDb(twitterBookmarksIndexPath());
  if (!existingDb) ensureMigrations(db);
  try {
    const rows = db.exec(
      `SELECT id, url, text, author_handle, categories, github_urls, links_json
       FROM bookmarks
       WHERE author_handle = ? COLLATE NOCASE
       ORDER BY COALESCE(posted_at, bookmarked_at) DESC
       LIMIT ?`,
      [authorHandle, limit]
    );
    if (!rows.length) return [];
    return rows[0].values.map((r: any) => ({
      id: r[0] as string,
      url: r[1] as string,
      text: r[2] as string,
      authorHandle: (r[3] as string) ?? undefined,
      categories: (r[4] as string) ?? '',
      githubUrls: (r[5] as string) ?? undefined,
      links: (r[6] as string) ?? undefined,
    }));
  } finally {
    if (!existingDb) db.close();
  }
}

export async function getTopAuthorHandles(
  minCount: number,
  existingDb?: Database,
): Promise<{ handle: string; count: number }[]> {
  const db = existingDb ?? await openDb(twitterBookmarksIndexPath());
  if (!existingDb) ensureMigrations(db);
  try {
    const rows = db.exec(
      `SELECT author_handle, COUNT(*) as c FROM bookmarks
       WHERE author_handle IS NOT NULL
       GROUP BY author_handle
       HAVING c >= ?
       ORDER BY c DESC`,
      [minCount]
    );
    return (rows[0]?.values ?? []).map((r: any) => ({
      handle: r[0] as string,
      count: r[1] as number,
    }));
  } finally {
    if (!existingDb) db.close();
  }
}

/**
 * Open the bookmarks DB with migrations applied. Caller is responsible for
 * closing the handle.
 */
export async function openBookmarksDb(): Promise<Database> {
  const db = await openDb(twitterBookmarksIndexPath());
  ensureMigrations(db);
  return db;
}

export { type Database } from 'sql.js';

// ── Gap-fill helpers ────────────────────────────────────────────────────

export async function updateQuotedTweets(
  records: Array<{ id: string; quotedTweet: QuotedTweetSnapshot }>,
): Promise<void> {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);
  ensureMigrations(db);

  try {
    const stmt = db.prepare('UPDATE bookmarks SET quoted_tweet_json = ? WHERE id = ?');
    for (const record of records) {
      stmt.run([JSON.stringify(record.quotedTweet), record.id]);
    }
    stmt.free();
    saveDb(db, dbPath);
  } finally {
    db.close();
  }
}

export async function updateBookmarkText(
  records: Array<{ id: string; text: string }>,
): Promise<void> {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);
  ensureMigrations(db);

  try {
    const stmt = db.prepare('UPDATE bookmarks SET text = ? WHERE id = ?');
    for (const record of records) {
      stmt.run([record.text, record.id]);
    }
    stmt.free();
    // Rebuild FTS to reflect updated text
    db.run("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
    saveDb(db, dbPath);
  } finally {
    db.close();
  }
}

export interface ArticleUpdate {
  id: string;
  articleTitle: string;
  articleText: string;
  articleSite?: string;
}

export async function updateArticleContent(
  records: ArticleUpdate[],
): Promise<void> {
  if (!records.length) return;
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);
  ensureMigrations(db);

  try {
    const stmt = db.prepare(
      'UPDATE bookmarks SET article_title = ?, article_text = ?, article_site = ?, enriched_at = ? WHERE id = ?'
    );
    const now = new Date().toISOString();
    for (const record of records) {
      stmt.run([record.articleTitle, record.articleText, record.articleSite ?? null, now, record.id]);
    }
    stmt.free();
    db.run("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
    saveDb(db, dbPath);
  } finally {
    db.close();
  }
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return 'No results found.';

  return results
    .map((r, i) => {
      const author = r.authorHandle ? `@${r.authorHandle}` : 'unknown';
      const date = r.postedAt ? r.postedAt.slice(0, 10) : '?';
      const text = r.text.length > 140 ? r.text.slice(0, 140) + '...' : r.text;
      const id = r.id;
      return `${i + 1}. [${date}] ${author} (ID: ${id})\n   ${text}\n   ${r.url}`;
    })
    .join('\n\n');
}

export async function exportClassifications(): Promise<number> {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);
  ensureMigrations(db);

  try {
    const rows = db.exec(
      `SELECT id, categories, primary_category, domains, primary_domain
       FROM bookmarks
       WHERE primary_category IS NOT NULL AND primary_category != 'unclassified'`
    );

    if (!rows.length || !rows[0].values.length) return 0;

    const now = new Date().toISOString();
    const records: ClassificationRecord[] = rows[0].values.map((r) => ({
      id: r[0] as string,
      categories: (r[1] as string)?.split(',') ?? [],
      primaryCategory: r[2] as string,
      domains: (r[3] as string)?.split(',') ?? undefined,
      primaryDomain: (r[4] as string) ?? undefined,
      classifiedAt: now,
    }));

    await writeJsonLines(twitterClassificationsPath(), records);
    return records.length;
  } finally {
    db.close();
  }
}
