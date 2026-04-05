/**
 * Article enrichment pipeline for bookmarks.
 *
 * Many bookmarks are "link-only" tweets — just a URL with little or no text.
 * This module fetches the linked article/page content and stores it alongside
 * the bookmark so it becomes searchable via FTS5.
 *
 * Strategies (tried in order):
 *   1. HTML fetch → extract <article>, <main>, or body text
 *   2. JSON-LD structured data (common on blogs)
 *   3. OpenGraph / meta description fallback
 */

import { openDb, saveDb } from './db.js';
import { twitterBookmarksIndexPath } from './paths.js';
import { loadChromeSessionConfig } from './config.js';
import { extractChromeXCookies } from './chrome-cookies.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ArticleContent {
  title: string;
  text: string;
  siteName?: string;
}

export interface EnrichResult {
  enriched: number;
  skipped: number;
  failed: number;
  total: number;
  warnings: string[];
}

export interface EnrichOptions {
  limit?: number;
  force?: boolean;
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  onProgress?: (done: number, total: number, msg?: string) => void;
}

// ── HTML helpers ───────────────────────────────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// ── Article extraction ─────────────────────────────────────────────────────

export function extractReadableText(html: string): ArticleContent | null {
  // Extract metadata
  const ogTitle = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]*)"[^>]*>/i);
  const htmlTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = stripHtml(ogTitle?.[1] ?? htmlTitle?.[1] ?? '');

  const siteMatch = html.match(/<meta\s+(?:property|name)="og:site_name"\s+content="([^"]*)"[^>]*>/i);
  const siteName = siteMatch ? decodeEntities(siteMatch[1]) : undefined;

  // Remove unwanted blocks before extraction
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Try content selectors in order of specificity
  let text = '';
  const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

  if (articleMatch) text = stripHtml(articleMatch[1]);
  else if (mainMatch) text = stripHtml(mainMatch[1]);
  else text = stripHtml(cleaned);

  // If too short, try meta description as fallback
  if (text.length < 100) {
    const ogDesc = html.match(/<meta\s+(?:property|name)="(?:og:)?description"\s+content="([^"]*)"[^>]*>/i);
    if (ogDesc && ogDesc[1].length > text.length) {
      text = stripHtml(ogDesc[1]);
    }
  }

  // Also check for JSON-LD structured data (common on blogs)
  if (text.length < 100) {
    const jsonLd = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd[1]);
        const body = data.articleBody ?? data.text ?? data.description ?? '';
        if (body.length > text.length) text = body;
      } catch {
        // Invalid JSON-LD, skip
      }
    }
  }

  if (text.length < 50) return null;

  // Cap at reasonable length for storage
  if (text.length > 15000) text = text.slice(0, 15000) + '...';

  return { title, text, siteName };
}

// ── X Article fetch via GraphQL ────────────────────────────────────────────

const X_PUBLIC_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const TWEET_DETAIL_QUERY_ID = 'nBS-WpgA6ZG0CyNHD517JQ';

interface XSessionCookies {
  csrfToken: string;
  cookieHeader: string;
}

interface XCookieResolution {
  cookies: XSessionCookies | null;
  error: string | null;
}

let cachedCookieKey: string | null = null;
let cachedCookieResolution: XCookieResolution | null = null;

function formatXCookieErrorMessage(message: string): string {
  if (message.includes('ft sync --chrome-profile-directory')) {
    return `${message}\nYou can pass the same Chrome flags to ft enrich as well.`;
  }
  if (message.includes('--chrome-profile-directory')) {
    return `${message}\nThis command also accepts --chrome-user-data-dir and --chrome-profile-directory.`;
  }
  return `${message}\nIf your X session is in a non-default Chrome profile, pass --chrome-profile-directory to ft enrich.`;
}

function summarizeProgressMessage(message: string): string {
  return message.split('\n')[0]?.trim() || 'Could not load X session cookies.';
}

function getXCookies(options: Pick<EnrichOptions, 'chromeUserDataDir' | 'chromeProfileDirectory'> = {}): XCookieResolution {
  try {
    const config = loadChromeSessionConfig();
    const chromeUserDataDir = options.chromeUserDataDir ?? config.chromeUserDataDir;
    const chromeProfileDirectory = options.chromeProfileDirectory ?? config.chromeProfileDirectory ?? 'Default';
    const cacheKey = `${chromeUserDataDir}::${chromeProfileDirectory}`;
    if (cachedCookieKey === cacheKey && cachedCookieResolution) return cachedCookieResolution;
    const cookies = extractChromeXCookies(chromeUserDataDir, chromeProfileDirectory);
    cachedCookieKey = cacheKey;
    cachedCookieResolution = { cookies, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    cachedCookieKey = null;
    cachedCookieResolution = {
      cookies: null,
      error: formatXCookieErrorMessage(message),
    };
  }
  return cachedCookieResolution;
}

/**
 * Fetch an X Article's content via the TweetDetail GraphQL API.
 * Uses the tweet ID that contains the article link.
 */
async function fetchXArticleByTweetId(
  tweetId: string,
  cookies: XSessionCookies,
): Promise<ArticleContent | null> {
  const variables = JSON.stringify({
    focalTweetId: tweetId,
    with_rux_injections: false,
    rankingMode: 'Relevance',
    includePromotedContent: false,
    withCommunity: false,
    withQuickPromoteEligibilityTweetFields: false,
    withBirdwatchNotes: false,
    withVoice: false,
  });
  const features = JSON.stringify({
    articles_preview_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_enhance_cards_enabled: false,
  });

  const url = `https://x.com/i/api/graphql/${TWEET_DETAIL_QUERY_ID}/TweetDetail?variables=${encodeURIComponent(variables)}&features=${encodeURIComponent(features)}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${X_PUBLIC_BEARER}`,
        'X-Csrf-Token': cookies.csrfToken,
        Cookie: cookies.cookieHeader,
        'X-Twitter-Auth-Type': 'OAuth2Session',
        'X-Twitter-Active-User': 'yes',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    const data: any = await res.json();

    // Navigate the response to find the article
    const instructions =
      data?.data?.threaded_conversation_with_injections_v2?.instructions ?? [];
    for (const inst of instructions) {
      for (const entry of inst.entries ?? []) {
        const result = entry?.content?.itemContent?.tweet_results?.result;
        if (!result) continue;
        const tweet =
          result.__typename === 'TweetWithVisibilityResults' ? result.tweet : result;
        if (tweet?.rest_id !== tweetId) continue;

        const article = tweet.article?.article_results?.result;
        if (!article) continue;

        const title = article.title ?? '';
        const previewText = article.preview_text ?? '';
        if (!title && !previewText) continue;

        return {
          title,
          text: previewText,
          siteName: 'X Article',
        };
      }
    }
  } catch {
    // API call failed
  }
  return null;
}

// ── Regular article fetch ──────────────────────────────────────────────────

/** Fetch a URL and extract article content. */
export async function fetchArticle(url: string): Promise<ArticleContent | null> {
  // Skip non-article X/Twitter URLs (profiles, timelines, etc.)
  // X Article URLs are handled separately via fetchXArticleByTweetId
  if (/x\.com|twitter\.com/i.test(url)) return null;

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  try {
    const res = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null;
    }

    const html = await res.text();
    return extractReadableText(html);
  } catch {
    return null;
  }
}

// ── DB helpers ─────────────────────────────────────────────────────────────

/**
 * Determine if a bookmark is "link-only" — a tweet that's mostly just URLs
 * with little original text. These benefit most from enrichment.
 */
function isLinkOnly(text: string, linkCount: number): boolean {
  if (linkCount === 0) return false;

  // Strip URLs from text and see what's left
  const withoutUrls = text.replace(/https?:\/\/\S+/g, '').trim();
  return withoutUrls.length < 80;
}

/**
 * Extract enrichable URLs from the bookmark's links array.
 * Filters out t.co shortlinks (usually media refs).
 * X Article URLs are kept (handled via GraphQL), other x.com URLs are dropped.
 */
function extractEnrichableUrls(linksJson: string | null): string[] {
  if (!linksJson) return [];
  try {
    const links: string[] = JSON.parse(linksJson);
    return links.filter((u) => {
      if (u.includes('t.co/')) return false;
      // Keep X Article URLs — they're enrichable via GraphQL
      if (/x\.com\/i\/article\/\d+/i.test(u)) return true;
      // Drop other x.com/twitter.com URLs (profiles, timelines, etc.)
      if (/x\.com|twitter\.com/i.test(u)) return false;
      return true;
    });
  } catch {
    return [];
  }
}

/** Check if a URL is an X Article. */
function isXArticleUrl(url: string): boolean {
  return /x\.com\/i\/article\/\d+/i.test(url);
}

// ── Schema migration ───────────────────────────────────────────────────────

export function ensureEnrichColumns(dbPath: string): void {
  // This is called lazily — the main schema migration in bookmarks-db.ts
  // handles schema_version bumps. Here we just add columns if missing.
  // Safe to call multiple times.
}

// ── Main pipeline ──────────────────────────────────────────────────────────

export async function enrichBookmarks(options: EnrichOptions = {}): Promise<EnrichResult> {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);
  const limit = options.limit ?? 50;

  try {
    // Ensure enrichment columns exist
    try { db.run('ALTER TABLE bookmarks ADD COLUMN article_title TEXT'); } catch { /* exists */ }
    try { db.run('ALTER TABLE bookmarks ADD COLUMN article_text TEXT'); } catch { /* exists */ }
    try { db.run('ALTER TABLE bookmarks ADD COLUMN article_site TEXT'); } catch { /* exists */ }
    try { db.run('ALTER TABLE bookmarks ADD COLUMN enriched_at TEXT'); } catch { /* exists */ }

    // Find bookmarks that need enrichment
    const whereClause = options.force
      ? 'WHERE b.link_count > 0'
      : 'WHERE b.enriched_at IS NULL AND b.link_count > 0';

    const rows = db.exec(
      `SELECT b.id, b.text, b.links_json, b.link_count, b.author_handle
       FROM bookmarks b
       ${whereClause}
       ORDER BY COALESCE(b.posted_at, b.bookmarked_at) DESC
       LIMIT ?`,
      [limit]
    );

    if (!rows.length || !rows[0].values.length) {
      return { enriched: 0, skipped: 0, failed: 0, total: 0, warnings: [] };
    }

    const bookmarks = rows[0].values.map((r) => ({
      id: r[0] as string,
      text: r[1] as string,
      linksJson: r[2] as string | null,
      linkCount: Number(r[3] ?? 0),
      authorHandle: r[4] as string | null,
    }));

    let enriched = 0;
    let skipped = 0;
    let failed = 0;
    const total = bookmarks.length;
    const warnings: string[] = [];
    const warningSet = new Set<string>();

    const UPDATE_SQL = `UPDATE bookmarks SET article_title = ?, article_text = ?, article_site = ?, enriched_at = ? WHERE id = ?`;

    const recordWarning = (message: string): boolean => {
      if (warningSet.has(message)) return false;
      warningSet.add(message);
      warnings.push(message);
      return true;
    };

    for (let i = 0; i < bookmarks.length; i++) {
      const bm = bookmarks[i];

      try {
        const urls = extractEnrichableUrls(bm.linksJson);

        // Skip bookmarks with no enrichable URLs
        if (urls.length === 0) {
          db.run(UPDATE_SQL, [null, null, null, new Date().toISOString(), bm.id]);
          skipped++;
          options.onProgress?.(i + 1, total, `No external links: @${bm.authorHandle ?? '?'}`);
          continue;
        }

        // Only fetch for link-heavy bookmarks or when forced
        if (!options.force && !isLinkOnly(bm.text, bm.linkCount)) {
          db.run(UPDATE_SQL, [null, null, null, new Date().toISOString(), bm.id]);
          skipped++;
          options.onProgress?.(i + 1, total, `Has enough text: @${bm.authorHandle ?? '?'}`);
          continue;
        }

        // Try each URL until we get content
        let article: ArticleContent | null = null;
        for (const url of urls) {
          // X Articles need the GraphQL API — regular fetch won't work
          if (isXArticleUrl(url)) {
            const cookieResolution = getXCookies({
              chromeUserDataDir: options.chromeUserDataDir,
              chromeProfileDirectory: options.chromeProfileDirectory,
            });
            if (cookieResolution.cookies) {
              options.onProgress?.(i + 1, total, `X Article via API: @${bm.authorHandle ?? '?'}...`);
              article = await fetchXArticleByTweetId(bm.id, cookieResolution.cookies);
              if (article && article.text.length > 0) break;
              article = null;
            } else if (cookieResolution.error) {
              const isNewWarning = recordWarning(cookieResolution.error);
              const prefix = isNewWarning ? 'X Article auth unavailable' : 'Skipping X Article';
              options.onProgress?.(
                i + 1,
                total,
                `${prefix}: ${summarizeProgressMessage(cookieResolution.error)}`
              );
            }
            continue;
          }

          options.onProgress?.(i + 1, total, `Fetching ${url.slice(0, 60)}...`);
          article = await fetchArticle(url);
          if (article && article.text.length >= 100) break;
          article = null;
        }

        if (article) {
          db.run(UPDATE_SQL, [
            article.title || null,
            article.text,
            article.siteName || null,
            new Date().toISOString(),
            bm.id,
          ]);
          enriched++;
          options.onProgress?.(i + 1, total, `Enriched: ${article.title?.slice(0, 50) || urls[0].slice(0, 50)} (${article.text.length} chars)`);
        } else {
          db.run(UPDATE_SQL, [null, null, null, new Date().toISOString(), bm.id]);
          failed++;
          options.onProgress?.(i + 1, total, `No content found: @${bm.authorHandle ?? '?'}`);
        }

        // Rate limit between fetches
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        // Don't let one bookmark crash the whole pipeline
        db.run(UPDATE_SQL, [null, null, null, new Date().toISOString(), bm.id]);
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        options.onProgress?.(i + 1, total, `Error: ${msg.slice(0, 60)}`);
      }

      // Save every 10 bookmarks for crash durability
      if ((i + 1) % 10 === 0) {
        saveDb(db, dbPath);
      }
    }

    // Rebuild FTS index so enriched text becomes searchable
    if (enriched > 0) {
      // Add article_text to the FTS index by rebuilding
      // The FTS table uses content=bookmarks, so we just rebuild
      db.run("INSERT INTO bookmarks_fts(bookmarks_fts) VALUES('rebuild')");
    }

    saveDb(db, dbPath);
    return { enriched, skipped, failed, total, warnings };
  } finally {
    db.close();
  }
}

export async function getEnrichmentStats(): Promise<{
  total: number;
  enriched: number;
  pending: number;
  withArticles: number;
}> {
  const dbPath = twitterBookmarksIndexPath();
  const db = await openDb(dbPath);

  try {
    // Check if enrichment columns exist
    const cols = db.exec("PRAGMA table_info(bookmarks)");
    const colNames = new Set((cols[0]?.values ?? []).map((r) => r[1] as string));
    if (!colNames.has('enriched_at')) {
      const total = Number(db.exec('SELECT COUNT(*) FROM bookmarks')[0]?.values[0]?.[0] ?? 0);
      return { total, enriched: 0, pending: total, withArticles: 0 };
    }

    const total = Number(db.exec('SELECT COUNT(*) FROM bookmarks')[0]?.values[0]?.[0] ?? 0);
    const enriched = Number(db.exec('SELECT COUNT(*) FROM bookmarks WHERE enriched_at IS NOT NULL')[0]?.values[0]?.[0] ?? 0);
    const withArticles = Number(db.exec('SELECT COUNT(*) FROM bookmarks WHERE article_text IS NOT NULL')[0]?.values[0]?.[0] ?? 0);

    return {
      total,
      enriched,
      pending: total - enriched,
      withArticles,
    };
  } finally {
    db.close();
  }
}
