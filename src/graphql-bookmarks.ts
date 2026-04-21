import { ensureDir, readJsonLines, writeJsonLines, readJson, writeJson, pathExists } from './fs.js';
import { ensureDataDir, twitterBookmarksCachePath, twitterBookmarksMetaPath, twitterBackfillStatePath } from './paths.js';
import { loadChromeSessionConfig } from './config.js';
import { extractChromeXCookies } from './chrome-cookies.js';
import { extractFirefoxXCookies } from './firefox-cookies.js';
import { parseTimestampMs } from './date-utils.js';
import type { BookmarkBackfillState, BookmarkCacheMeta, BookmarkFolder, BookmarkRecord, QuotedTweetSnapshot } from './types.js';
import { exportBookmarksForSyncSeed, updateQuotedTweets, updateBookmarkText, updateArticleContent } from './bookmarks-db.js';
import type { ArticleUpdate } from './bookmarks-db.js';
import { fetchArticle, resolveTcoLink } from './bookmark-enrich.js';
import type { ArticleContent } from './bookmark-enrich.js';

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const X_PUBLIC_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const BOOKMARKS_QUERY_ID = 'Z9GWmP0kP2dajyckAaDUBw';
const BOOKMARKS_OPERATION = 'Bookmarks';

// TweetResultByRestId — used by `--gaps` to re-fetch truncated note_tweets by
// id. The queryId is hardcoded to match the bookmarks-feed convention; refresh
// by searching for `operationName:"TweetResultByRestId"` inside the current
// `abs.twimg.com/responsive-web/client-web/main.<hash>.js` bundle. Verified
// working against Karpathy's 2039805659525644595 note_tweet on 2026-04-15.
const TWEET_RESULT_BY_REST_ID_QUERY_ID = 'fHLDP3qFEjnTqhWBVvsREg';
const TWEET_RESULT_BY_REST_ID_OPERATION = 'TweetResultByRestId';

// ──────────────────────────────────────────────────────────────────────────
// Folder endpoints — READ ONLY. We never POST/PUT/DELETE to X.
// The folder feature makes exactly these two GraphQL GET calls, nothing else.
// If you're adding a third, justify it in review and update this comment.
// ──────────────────────────────────────────────────────────────────────────
const BOOKMARK_FOLDERS_QUERY_ID = 'i78YDd0Tza-dV4SYs58kRg';
const BOOKMARK_FOLDERS_OPERATION = 'BookmarkFoldersSlice';
const BOOKMARK_FOLDER_TIMELINE_QUERY_ID = 'LML09uXDwh87F1zd7pbf2w';
const BOOKMARK_FOLDER_TIMELINE_OPERATION = 'BookmarkFolderTimeline';

const GRAPHQL_FEATURES = {
  graphql_timeline_v2_bookmark_timeline: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_uc_gql_enabled: true,
  vibe_api_enabled: true,
  responsive_web_text_conversations_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  longform_notetweets_consumption_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_media_download_video_enabled: false,
};

export interface SyncOptions {
  /** Default true. Stop once we reach the newest already-stored bookmark. */
  incremental?: boolean;
  /** Max pages to fetch (20 bookmarks per page). Default: unlimited */
  maxPages?: number;
  /** Stop once this many *new* bookmarks have been added. Default: unlimited */
  targetAdds?: number;
  /** Delay between page requests in ms. Default: 600 */
  delayMs?: number;
  /** Max runtime in minutes. Default: 30 */
  maxMinutes?: number;
  /** Consecutive pages with 0 new bookmarks before stopping. Default: 3 */
  stalePageLimit?: number;
  /** Bookmarks per page (1–100). Default: 20 */
  pageSize?: number;
  /** Browser id (e.g. 'chrome', 'firefox', 'brave'). */
  browser?: string;
  /** Chrome-family user-data-dir override. */
  chromeUserDataDir?: string;
  /** Chrome-family profile directory name (e.g. "Default"). */
  chromeProfileDirectory?: string;
  /** Firefox profile directory override. */
  firefoxProfileDir?: string;
  /** Direct csrf token override; skips all cookie extraction. */
  csrfToken?: string;
  /** Direct cookie header override; skips all cookie extraction. */
  cookieHeader?: string;
  /** Progress callback. */
  onProgress?: (status: SyncProgress) => void;
  /** Resume from a saved cursor instead of starting from the newest bookmark. */
  resumeCursor?: string;
  /** Flush to disk every N pages. Default: 25 */
  checkpointEvery?: number;
}

export interface SyncProgress {
  page: number;
  totalFetched: number;
  newAdded: number;
  running: boolean;
  done: boolean;
  stopReason?: string;
}

export interface SyncResult {
  added: number;
  bookmarkedAtRepaired: number;
  totalBookmarks: number;
  bookmarkedAtMissing: number;
  pages: number;
  stopReason: string;
  cachePath: string;
  statePath: string;
  retryAfterSec?: number;
}

function parseSnowflake(value?: string | null): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

const MAX_FUTURE_BOOKMARK_SKEW_MS = 5 * 60_000;

export function sanitizeBookmarkedAt(record: BookmarkRecord): BookmarkRecord {
  if (record.ingestedVia === 'graphql') {
    return record.bookmarkedAt == null ? record : { ...record, bookmarkedAt: null };
  }

  const bookmarkedAtMs = parseTimestampMs(record.bookmarkedAt);
  if (bookmarkedAtMs == null) {
    return record.bookmarkedAt == null ? record : { ...record, bookmarkedAt: null };
  }

  const postedAtMs = parseTimestampMs(record.postedAt);
  if (postedAtMs != null && bookmarkedAtMs < postedAtMs) {
    return { ...record, bookmarkedAt: null };
  }

  const syncedAtMs = parseTimestampMs(record.syncedAt);
  if (syncedAtMs != null && bookmarkedAtMs > syncedAtMs + MAX_FUTURE_BOOKMARK_SKEW_MS) {
    return { ...record, bookmarkedAt: null };
  }

  return record;
}

function sanitizeRecords(records: BookmarkRecord[]): { records: BookmarkRecord[]; repaired: number } {
  let repaired = 0;
  const sanitized = records.map((record) => {
    const next = sanitizeBookmarkedAt(record);
    if (next.bookmarkedAt !== record.bookmarkedAt) repaired += 1;
    return next;
  });
  return { records: sanitized, repaired };
}

function parseBookmarkTimestamp(record: BookmarkRecord): number | null {
  const candidates = [record.bookmarkedAt, record.postedAt, record.syncedAt];
  for (const candidate of candidates) {
    const parsed = parseTimestampMs(candidate);
    if (parsed != null) return parsed;
  }
  return null;
}

function compareBookmarkChronology(a: BookmarkRecord, b: BookmarkRecord): number {
  const aSortIndex = parseSnowflake(a.sortIndex);
  const bSortIndex = parseSnowflake(b.sortIndex);
  if (aSortIndex != null && bSortIndex != null && aSortIndex !== bSortIndex) {
    return aSortIndex > bSortIndex ? 1 : -1;
  }

  const aTimestamp = parseBookmarkTimestamp(a);
  const bTimestamp = parseBookmarkTimestamp(b);
  if (aTimestamp != null && bTimestamp != null && aTimestamp !== bTimestamp) {
    return aTimestamp > bTimestamp ? 1 : -1;
  }

  const aId = parseSnowflake(a.tweetId ?? a.id);
  const bId = parseSnowflake(b.tweetId ?? b.id);
  if (aId != null && bId != null && aId !== bId) {
    return aId > bId ? 1 : -1;
  }

  const aStamp = String(a.bookmarkedAt ?? a.postedAt ?? a.syncedAt ?? '');
  const bStamp = String(b.bookmarkedAt ?? b.postedAt ?? b.syncedAt ?? '');
  return aStamp.localeCompare(bStamp);
}

async function loadExistingBookmarks(): Promise<{ records: BookmarkRecord[]; repaired: number }> {
  const cachePath = twitterBookmarksCachePath();
  const existing = sanitizeRecords(await readJsonLines<BookmarkRecord>(cachePath));
  if (existing.records.length > 0) return existing;
  // On first run, no JSONL and no DB — return empty
  try {
    return sanitizeRecords(await exportBookmarksForSyncSeed());
  } catch {
    return { records: [], repaired: 0 };
  }
}

function buildUrl(cursor?: string, count = 20): string {
  const variables: Record<string, unknown> = { count };
  if (cursor) variables.cursor = cursor;
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(GRAPHQL_FEATURES),
  });
  return `https://x.com/i/api/graphql/${BOOKMARKS_QUERY_ID}/${BOOKMARKS_OPERATION}?${params}`;
}

function buildHeaders(csrfToken: string, cookieHeader?: string): Record<string, string> {
  return {
    authorization: `Bearer ${X_PUBLIC_BEARER}`,
    'x-csrf-token': csrfToken,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'content-type': 'application/json',
    'user-agent': CHROME_UA,
    cookie: cookieHeader ?? `ct0=${csrfToken}`,
  };
}

interface PageResult {
  records: BookmarkRecord[];
  nextCursor?: string;
}

export function convertTweetToRecord(tweetResult: any, now: string): BookmarkRecord | null {
  const tweet = tweetResult.tweet ?? tweetResult;
  const legacy = tweet?.legacy;
  if (!legacy) return null;

  const tweetId = legacy.id_str ?? tweet?.rest_id;
  if (!tweetId) return null;

  const userResult = tweet?.core?.user_results?.result;
  const authorHandle = userResult?.core?.screen_name ?? userResult?.legacy?.screen_name;
  const authorName = userResult?.core?.name ?? userResult?.legacy?.name;
  const authorProfileImageUrl =
    userResult?.avatar?.image_url ??
    userResult?.legacy?.profile_image_url_https ??
    userResult?.legacy?.profile_image_url;

  const author = userResult
    ? {
        id: userResult.rest_id,
        handle: authorHandle,
        name: authorName,
        profileImageUrl: authorProfileImageUrl,
        bio: userResult?.legacy?.description,
        followerCount: userResult?.legacy?.followers_count,
        followingCount: userResult?.legacy?.friends_count,
        isVerified: Boolean(userResult?.is_blue_verified ?? userResult?.legacy?.verified),
        location:
          typeof userResult?.location === 'object'
            ? userResult.location.location
            : userResult?.legacy?.location,
        snapshotAt: now,
      }
    : undefined;

  const mediaEntities = legacy?.extended_entities?.media ?? legacy?.entities?.media ?? [];
  const media: string[] = mediaEntities
    .map((m: any) => m.media_url_https ?? m.media_url)
    .filter(Boolean);
  const mediaObjects = mediaEntities.map((m: any) => ({
    type: m.type,
    url: m.media_url_https ?? m.media_url,
    expandedUrl: m.expanded_url,
    width: m.original_info?.width,
    height: m.original_info?.height,
    altText: m.ext_alt_text,
    videoVariants: Array.isArray(m.video_info?.variants)
      ? m.video_info.variants
          .filter((v: any) => v.content_type === 'video/mp4')
          .map((v: any) => ({ bitrate: v.bitrate, url: v.url }))
      : undefined,
  }));

  const urlEntities = legacy?.entities?.urls ?? [];
  const links: string[] = urlEntities
    .map((u: any) => u.expanded_url)
    .filter((u: string | undefined) => u && !u.includes('t.co'));

  // Extract quoted tweet if present
  const quotedResult = tweet?.quoted_status_result?.result;
  let quotedTweet: BookmarkRecord['quotedTweet'] | undefined;
  if (quotedResult) {
    const qtTweet = quotedResult.tweet ?? quotedResult;
    const qtLegacy = qtTweet?.legacy;
    if (qtLegacy) {
      const qtId = qtLegacy.id_str ?? qtTweet?.rest_id;
      const qtUser = qtTweet?.core?.user_results?.result;
      const qtHandle = qtUser?.core?.screen_name ?? qtUser?.legacy?.screen_name;
      const qtMediaEntities = qtLegacy?.extended_entities?.media ?? qtLegacy?.entities?.media ?? [];
      const qtNoteText = qtTweet?.note_tweet?.note_tweet_results?.result?.text;
      quotedTweet = {
        id: qtId,
        text: qtNoteText ?? qtLegacy.full_text ?? qtLegacy.text ?? '',
        authorHandle: qtHandle,
        authorName: qtUser?.core?.name ?? qtUser?.legacy?.name,
        authorProfileImageUrl:
          qtUser?.avatar?.image_url ?? qtUser?.legacy?.profile_image_url_https,
        postedAt: qtLegacy.created_at ?? null,
        media: qtMediaEntities.map((m: any) => m.media_url_https ?? m.media_url).filter(Boolean),
        mediaObjects: qtMediaEntities.map((m: any) => ({
          type: m.type,
          url: m.media_url_https ?? m.media_url,
          expandedUrl: m.expanded_url,
          width: m.original_info?.width,
          height: m.original_info?.height,
          altText: m.ext_alt_text,
          videoVariants: Array.isArray(m.video_info?.variants)
            ? m.video_info.variants
                .filter((v: any) => v.content_type === 'video/mp4')
                .map((v: any) => ({ bitrate: v.bitrate, url: v.url }))
            : undefined,
        })),
        url: `https://x.com/${qtHandle ?? '_'}/status/${qtId}`,
      };
    }
  }

  // X Articles / long-form note tweets store full text separately
  const noteTweetText = tweet?.note_tweet?.note_tweet_results?.result?.text;
  let text = noteTweetText ?? legacy.full_text ?? legacy.text ?? '';
  for (const entity of urlEntities) {
    if (typeof entity?.url === 'string' && typeof entity?.display_url === 'string') {
      text = text.split(entity.url).join(entity.display_url);
    }
  }

  return {
    id: tweetId,
    tweetId,
    url: `https://x.com/${authorHandle ?? '_'}/status/${tweetId}`,
    text,
    authorHandle,
    authorName,
    authorProfileImageUrl,
    author,
    postedAt: legacy.created_at ?? null,
    bookmarkedAt: null,
    syncedAt: now,
    conversationId: legacy.conversation_id_str,
    inReplyToStatusId: legacy.in_reply_to_status_id_str,
    inReplyToUserId: legacy.in_reply_to_user_id_str,
    quotedStatusId: legacy.quoted_status_id_str,
    quotedTweet,
    language: legacy.lang,
    sourceApp: legacy.source,
    possiblySensitive: legacy.possibly_sensitive,
    engagement: {
      likeCount: legacy.favorite_count,
      repostCount: legacy.retweet_count,
      replyCount: legacy.reply_count,
      quoteCount: legacy.quote_count,
      bookmarkCount: legacy.bookmark_count,
      viewCount: tweet?.views?.count ? Number(tweet.views.count) : undefined,
    },
    media,
    mediaObjects,
    links,
    tags: [],
    ingestedVia: 'graphql',
  };
}

export function parseBookmarksResponse(json: any, now?: string): PageResult {
  const ts = now ?? new Date().toISOString();
  const instructions = json?.data?.bookmark_timeline_v2?.timeline?.instructions ?? [];
  const entries: any[] = [];
  for (const inst of instructions) {
    if (inst.type === 'TimelineAddEntries' && Array.isArray(inst.entries)) {
      entries.push(...inst.entries);
    }
  }

  const records: BookmarkRecord[] = [];
  let nextCursor: string | undefined;

  for (const entry of entries) {
    if (entry.entryId?.startsWith('cursor-bottom')) {
      nextCursor = entry.content?.value;
      continue;
    }

    const tweetResult = entry?.content?.itemContent?.tweet_results?.result;
    if (!tweetResult) continue;

    const record = convertTweetToRecord(tweetResult, ts);
    if (record) {
      record.sortIndex = typeof entry.sortIndex === 'string' ? entry.sortIndex : null;
      records.push(sanitizeBookmarkedAt(record));
    }
  }

  return { records, nextCursor };
}

class RateLimitError extends Error {
  constructor(message: string, readonly retryAfterSec?: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

function parseRetryAfterSec(response: Response): number | undefined {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);

    const resumeAt = Date.parse(retryAfter);
    if (!Number.isNaN(resumeAt)) {
      const secondsUntil = Math.ceil((resumeAt - Date.now()) / 1000);
      if (secondsUntil > 0) return secondsUntil;
    }
  }

  const resetAt = Number(response.headers.get('x-rate-limit-reset'));
  if (Number.isFinite(resetAt) && resetAt > 0) {
    const secondsUntil = Math.ceil(resetAt - Date.now() / 1000);
    if (secondsUntil > 0) return secondsUntil;
  }

  return undefined;
}

async function fetchPageWithRetry(csrfToken: string, cursor?: string, cookieHeader?: string, pageSize?: number): Promise<PageResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(buildUrl(cursor, pageSize), { headers: buildHeaders(csrfToken, cookieHeader) });

    if (response.status === 429) {
      const retryAfterSec = parseRetryAfterSec(response);
      const waitSec = retryAfterSec ?? Math.min(15 * Math.pow(2, attempt), 120);
      lastError = new RateLimitError(`Rate limited (429) on attempt ${attempt + 1}`, retryAfterSec);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (response.status >= 500) {
      lastError = new Error(`Server error (${response.status}) on attempt ${attempt + 1}`);
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `GraphQL Bookmarks API returned ${response.status}.\n` +
          `Response: ${text.slice(0, 300)}\n\n` +
          (response.status === 401 || response.status === 403
            ? 'Fix: Your X session may have expired. Open your browser, go to https://x.com, and make sure you are logged in. Then retry.'
            : 'This may be a temporary issue. Try again in a few minutes.')
      );
    }

    const json = await response.json();
    return parseBookmarksResponse(json);
  }

  throw lastError ?? new Error('GraphQL Bookmarks API: all retry attempts failed. Try again later.');
}

export function scoreRecord(record: BookmarkRecord): number {
  let score = 0;
  if (record.postedAt) score += 2;
  if (record.authorProfileImageUrl) score += 2;
  if (record.author) score += 3;
  if (record.engagement) score += 3;
  if ((record.mediaObjects?.length ?? 0) > 0) score += 3;
  if ((record.links?.length ?? 0) > 0) score += 2;
  return score;
}

export function mergeBookmarkRecord(existing: BookmarkRecord | undefined, incoming: BookmarkRecord): BookmarkRecord {
  if (!existing) return incoming;
  return scoreRecord(incoming) >= scoreRecord(existing)
    ? { ...existing, ...incoming }
    : { ...incoming, ...existing };
}

export function mergeRecords(
  existing: BookmarkRecord[],
  incoming: BookmarkRecord[]
): { merged: BookmarkRecord[]; added: number } {
  const byId = new Map(existing.map((r) => [r.id, r]));
  let added = 0;
  for (const record of incoming) {
    const prev = byId.get(record.id);
    if (!prev) added += 1;
    // Preserve folder arrays from prev since main sync never carries folder data.
    byId.set(record.id, mergeBookmarkRecord(prev, record));
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => compareBookmarkChronology(b, a));
  return { merged, added };
}

function updateState(
  prev: BookmarkBackfillState,
  input: { added: number; seenIds: string[]; stopReason: string; lastRunAt?: string; lastCursor?: string }
): BookmarkBackfillState {
  return {
    provider: 'twitter',
    lastRunAt: input.lastRunAt ?? new Date().toISOString(),
    totalRuns: prev.totalRuns + 1,
    totalAdded: prev.totalAdded + input.added,
    lastAdded: input.added,
    lastSeenIds: input.seenIds.slice(-20),
    stopReason: input.stopReason,
    lastCursor: input.lastCursor,
  };
}

export function formatSyncResult(result: SyncResult): string {
  return [
    'Sync complete.',
    `- bookmarks added: ${result.added}`,
    `- bookmark dates repaired: ${result.bookmarkedAtRepaired}`,
    `- total bookmarks: ${result.totalBookmarks}`,
    `- missing reliable bookmark dates: ${result.bookmarkedAtMissing}`,
    `- pages fetched: ${result.pages}`,
    `- stop reason: ${result.stopReason}`,
    `- cache: ${result.cachePath}`,
    `- state: ${result.statePath}`,
  ].join('\n');
}

export async function syncBookmarksGraphQL(
  options: SyncOptions = {}
): Promise<SyncResult> {
  const incremental = options.incremental ?? true;
  const maxPages = options.maxPages ?? Infinity;
  const delayMs = options.delayMs ?? 600;
  const maxMinutes = options.maxMinutes ?? 30;
  const stalePageLimit = options.stalePageLimit ?? 3;
  const checkpointEvery = options.checkpointEvery ?? 25;
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 20, 100));

  let csrfToken: string;
  let cookieHeader: string | undefined;

  if (options.csrfToken) {
    csrfToken = options.csrfToken;
    cookieHeader = options.cookieHeader;
  } else {
    const config = loadChromeSessionConfig({ browserId: options.browser });

    if (config.browser.cookieBackend === 'firefox') {
      const cookies = extractFirefoxXCookies(options.firefoxProfileDir);
      csrfToken = cookies.csrfToken;
      cookieHeader = cookies.cookieHeader;
    } else {
      const chromeDir = options.chromeUserDataDir ?? config.chromeUserDataDir;
      const chromeProfile = options.chromeProfileDirectory ?? config.chromeProfileDirectory;
      const cookies = extractChromeXCookies(chromeDir, chromeProfile, config.browser);
      csrfToken = cookies.csrfToken;
      cookieHeader = cookies.cookieHeader;
    }
  }

  ensureDataDir();
  const cachePath = twitterBookmarksCachePath();
  const metaPath = twitterBookmarksMetaPath();
  const statePath = twitterBackfillStatePath();
  const loaded = await loadExistingBookmarks();
  let existing = loaded.records;
  const bookmarkedAtRepaired = loaded.repaired;
  const newestKnownId = incremental ? existing[0]?.id : undefined;
  const previousMeta = (await pathExists(metaPath))
    ? await readJson<BookmarkCacheMeta>(metaPath)
    : undefined;
  const prevState: BookmarkBackfillState = (await pathExists(statePath))
    ? await readJson<BookmarkBackfillState>(statePath)
    : { provider: 'twitter', totalRuns: 0, totalAdded: 0, lastAdded: 0, lastSeenIds: [] };

  const started = Date.now();
  let page = 0;
  let totalAdded = 0;
  let stalePages = 0;
  let cursor: string | undefined = options.resumeCursor;
  const allSeenIds: string[] = [];
  let stopReason = 'unknown';
  let retryAfterSec: number | undefined;

  const fetchNextPage = async (): Promise<PageResult | undefined> => {
    try {
      return await fetchPageWithRetry(csrfToken, cursor, cookieHeader, pageSize);
    } catch (error) {
      if (error instanceof RateLimitError) {
        stopReason = 'rate limited';
        retryAfterSec = error.retryAfterSec;
        return undefined;
      }
      throw error;
    }
  };

  while (page < maxPages) {
    if (Date.now() - started > maxMinutes * 60_000) {
      stopReason = 'max runtime reached';
      break;
    }

    const result = await fetchNextPage();
    if (!result) break;
    page += 1;

    if (result.records.length === 0 && !result.nextCursor) {
      stopReason = 'end of bookmarks';
      break;
    }

    const { merged, added } = mergeRecords(existing, result.records);
    existing = merged;
    totalAdded += added;
    result.records.forEach((r) => allSeenIds.push(r.id));
    const reachedLatestStored = Boolean(newestKnownId) && result.records.some((record) => record.id === newestKnownId);

    stalePages = (incremental ? added === 0 : result.records.length === 0) ? stalePages + 1 : 0;

    options.onProgress?.({
      page,
      totalFetched: allSeenIds.length,
      newAdded: totalAdded,
      running: true,
      done: false,
    });

    // Update cursor before stop checks so auto-continue has the right position
    cursor = result.nextCursor;

    if (options.targetAdds && totalAdded >= options.targetAdds) {
      stopReason = 'target additions reached';
      break;
    }
    if (reachedLatestStored) {
      stopReason = 'caught up to newest stored bookmark';
      break;
    }
    if (stalePages >= stalePageLimit) {
      stopReason = 'no new bookmarks (stale)';
      break;
    }
    if (!cursor) {
      stopReason = 'end of bookmarks';
      break;
    }

    if (page % checkpointEvery === 0) await writeJsonLines(cachePath, existing);

    if (page < maxPages) await new Promise((r) => setTimeout(r, delayMs));
  }

  if (stopReason === 'unknown') stopReason = page >= maxPages ? 'max pages reached' : 'unknown';

  // ── Auto-continue: detect users stuck at the old 10k cap ──────────
  // If we finished an incremental sync, the user has ≥9,500 bookmarks,
  // and there's a cursor to keep going, automatically page through to
  // find bookmarks the old 20-per-page × 500-page cap missed.
  const OLD_CAP_THRESHOLD = 9_500;
  const terminalStops = new Set(['end of bookmarks']);
  const shouldAutoContinue =
    incremental &&
    !options.resumeCursor &&
    existing.length >= OLD_CAP_THRESHOLD &&
    !terminalStops.has(stopReason) &&
    stopReason !== 'rate limited' &&
    cursor != null;

  if (shouldAutoContinue) {
    // Use the first page's actual item count to estimate how many pages
    // we need to scan through before reaching bookmarks beyond the old cap.
    const firstPageSize = allSeenIds.length > 0 ? Math.min(allSeenIds.length, pageSize) : pageSize;
    const estimatedScanPages = Math.ceil(existing.length / firstPageSize);
    const scanStartPage = page;

    let continueAdded = 0;

    options.onProgress?.({
      page,
      totalFetched: allSeenIds.length,
      newAdded: totalAdded,
      running: true,
      done: false,
      stopReason: `scanning past ${existing.length.toLocaleString()} existing bookmarks (~${estimatedScanPages} pages)...`,
    });

    // Continue paginating with no stale-page or caught-up limits
    while (page < maxPages) {
      if (Date.now() - started > maxMinutes * 60_000) {
        stopReason = 'max runtime reached';
        break;
      }

      const result = await fetchNextPage();
      if (!result) break;
      page += 1;

      if (result.records.length === 0 && !result.nextCursor) {
        stopReason = 'end of bookmarks';
        break;
      }

      const { merged, added } = mergeRecords(existing, result.records);
      existing = merged;
      totalAdded += added;
      continueAdded += added;
      result.records.forEach((r) => allSeenIds.push(r.id));
      cursor = result.nextCursor;

      const scanProgress = page - scanStartPage;
      options.onProgress?.({
        page,
        totalFetched: allSeenIds.length,
        newAdded: totalAdded,
        running: true,
        done: false,
        stopReason: continueAdded > 0
          ? undefined // found new bookmarks — normal progress display
          : `scanning past existing bookmarks (${scanProgress}/~${estimatedScanPages})...`,
      });

      if (!cursor) {
        stopReason = 'end of bookmarks';
        break;
      }

      if (page % checkpointEvery === 0) await writeJsonLines(cachePath, existing);

      if (page < maxPages) await new Promise((r) => setTimeout(r, delayMs));
    }

    if (stopReason !== 'end of bookmarks' && page >= maxPages) {
      stopReason = 'max pages reached';
    }
  }

  const syncedAt = new Date().toISOString();
  const bookmarkedAtMissing = existing.filter((record) => !record.bookmarkedAt).length;
  const completedFullSync = !incremental && stopReason === 'end of bookmarks';
  await writeJsonLines(cachePath, existing);
  await writeJson(metaPath, {
    provider: 'twitter',
    schemaVersion: 1,
    lastFullSyncAt: completedFullSync ? syncedAt : previousMeta?.lastFullSyncAt,
    lastIncrementalSyncAt: incremental ? syncedAt : previousMeta?.lastIncrementalSyncAt,
    totalBookmarks: existing.length,
  } satisfies BookmarkCacheMeta);
  // Save cursor for resumption if sync stopped before reaching the end
  const terminalReasons = new Set(['end of bookmarks', 'caught up to newest stored bookmark']);
  const savedCursor = terminalReasons.has(stopReason) ? undefined : cursor;

  await writeJson(statePath, updateState(prevState, {
    added: totalAdded,
    seenIds: allSeenIds.slice(-20),
    stopReason,
    lastRunAt: syncedAt,
    lastCursor: savedCursor,
  }));

  options.onProgress?.({
    page,
    totalFetched: allSeenIds.length,
    newAdded: totalAdded,
    running: false,
    done: true,
    stopReason,
  });

  return {
    added: totalAdded,
    bookmarkedAtRepaired,
    totalBookmarks: existing.length,
    bookmarkedAtMissing,
    pages: page,
    stopReason,
    cachePath,
    statePath,
    retryAfterSec,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Bookmark folders (READ ONLY — GET requests only)
//
// Mirror semantics: for each folder we walk successfully, the local cache
// is updated to reflect X's CURRENT state of that folder. No stale data
// accumulates. NEVER writes to X — only reads.
// ──────────────────────────────────────────────────────────────────────────

function buildFoldersListUrl(): string {
  const params = new URLSearchParams({
    variables: JSON.stringify({}),
    features: JSON.stringify(GRAPHQL_FEATURES),
  });
  return `https://x.com/i/api/graphql/${BOOKMARK_FOLDERS_QUERY_ID}/${BOOKMARK_FOLDERS_OPERATION}?${params}`;
}

function buildFolderTimelineUrl(folderId: string, cursor?: string, count = 20): string {
  const variables: Record<string, unknown> = {
    bookmark_collection_id: folderId,
    count,
  };
  if (cursor) variables.cursor = cursor;
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(GRAPHQL_FEATURES),
  });
  return `https://x.com/i/api/graphql/${BOOKMARK_FOLDER_TIMELINE_QUERY_ID}/${BOOKMARK_FOLDER_TIMELINE_OPERATION}?${params}`;
}

export async function fetchBookmarkFolders(
  csrfToken: string,
  cookieHeader?: string,
): Promise<BookmarkFolder[]> {
  const response = await fetch(buildFoldersListUrl(), {
    headers: buildHeaders(csrfToken, cookieHeader),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `BookmarkFoldersSlice API returned ${response.status}.\n` +
        `Response: ${text.slice(0, 300)}\n\n` +
        (response.status === 401 || response.status === 403
          ? 'Fix: Your X session may have expired. Open your browser, log into x.com, and retry.'
          : 'This may be a temporary issue. Try again in a few minutes.')
    );
  }

  const json = await response.json();
  // Try the known response paths in order (X has used a few shapes).
  const items: any[] =
    json?.data?.viewer?.user_results?.result?.bookmark_collections_slice?.items ??
    json?.data?.viewer?.bookmark_collections_slice?.items ??
    json?.data?.bookmark_collections_slice?.items ??
    [];

  return items
    .map((item: any) => ({
      id: String(item.id ?? item.rest_id ?? ''),
      name: String(item.name ?? ''),
    }))
    .filter((f) => f.id && f.name);
}

export function parseFolderTimelineResponse(json: any, now?: string): PageResult {
  const ts = now ?? new Date().toISOString();
  // Try both known response paths — X has used both at various times.
  const instructions =
    json?.data?.bookmark_collection_timeline?.timeline?.instructions ??
    json?.data?.bookmark_folder_timeline?.timeline?.instructions ??
    [];

  const entries: any[] = [];
  for (const inst of instructions) {
    if (inst.type === 'TimelineAddEntries' && Array.isArray(inst.entries)) {
      entries.push(...inst.entries);
    }
  }

  const records: BookmarkRecord[] = [];
  let nextCursor: string | undefined;

  for (const entry of entries) {
    if (typeof entry.entryId === 'string' && entry.entryId.startsWith('cursor-bottom')) {
      nextCursor = entry.content?.value;
      continue;
    }
    const tweetResult = entry?.content?.itemContent?.tweet_results?.result;
    if (!tweetResult) continue;
    const record = convertTweetToRecord(tweetResult, ts);
    if (record) {
      record.sortIndex = typeof entry.sortIndex === 'string' ? entry.sortIndex : null;
      records.push(sanitizeBookmarkedAt(record));
    }
  }

  return { records, nextCursor };
}

async function fetchFolderPage(
  csrfToken: string,
  folderId: string,
  cursor?: string,
  cookieHeader?: string,
  pageSize = 20,
): Promise<PageResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(buildFolderTimelineUrl(folderId, cursor, pageSize), {
      headers: buildHeaders(csrfToken, cookieHeader),
    });

    if (response.status === 429) {
      const waitSec = Math.min(15 * Math.pow(2, attempt), 120);
      lastError = new Error(`Rate limited (429) on attempt ${attempt + 1}`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }
    if (response.status >= 500) {
      lastError = new Error(`Server error (${response.status}) on attempt ${attempt + 1}`);
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `BookmarkFolderTimeline API returned ${response.status}.\n` +
          `Response: ${text.slice(0, 300)}`
      );
    }

    const json = await response.json();
    return parseFolderTimelineResponse(json);
  }

  throw lastError ?? new Error('BookmarkFolderTimeline: all retry attempts failed.');
}

export interface FolderWalkResult {
  /** True only if we paginated to the natural end of the folder. */
  complete: boolean;
  records: BookmarkRecord[];
}

/** Soft cap on walked records per folder. Folders larger than this abort
 * with complete=false so the caller skips modifying DB state. 50k records
 * is comfortably above any realistic X bookmark folder. */
const MAX_RECORDS_PER_FOLDER = 50_000;

export async function walkFolderTimeline(
  csrfToken: string,
  folderId: string,
  options: { cookieHeader?: string; delayMs?: number; pageSize?: number; maxPages?: number } = {},
): Promise<FolderWalkResult> {
  const delayMs = options.delayMs ?? 600;
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 20, 100));
  const maxPages = options.maxPages ?? 1000;

  const seen = new Map<string, BookmarkRecord>();
  let cursor: string | undefined;
  let page = 0;

  while (page < maxPages) {
    const result = await fetchFolderPage(csrfToken, folderId, cursor, options.cookieHeader, pageSize);
    page += 1;

    for (const r of result.records) seen.set(r.id, r);

    // Defensive: stop walking if we blow past the soft cap. Treat as incomplete
    // so the caller skips modifying state — we'd rather leave tags stale than
    // risk OOM or an endless pagination loop.
    if (seen.size > MAX_RECORDS_PER_FOLDER) {
      return { complete: false, records: Array.from(seen.values()) };
    }

    if (!result.nextCursor) {
      return { complete: true, records: Array.from(seen.values()) };
    }

    cursor = result.nextCursor;
    if (page < maxPages) await new Promise((r) => setTimeout(r, delayMs));
  }

  return { complete: false, records: Array.from(seen.values()) };
}

export interface FolderMirrorStats {
  added: number;     // new records added during the mirror
  tagged: number;    // existing records that gained this folder tag
  untagged: number;  // existing records that lost this folder tag
  unchanged: number; // records that already had the tag and still do
}

/**
 * Return a new record with every occurrence of this folder id removed
 * from both parallel arrays. Returns the same reference unchanged if the
 * folder wasn't present. Uses filter rather than indexOf so duplicate ids
 * (from a corrupted JSONL, say) are all cleared, not just the first.
 */
function withoutFolder(record: BookmarkRecord, folderId: string): BookmarkRecord {
  const oldIds = record.folderIds ?? [];
  if (!oldIds.includes(folderId)) return record;
  const oldNames = record.folderNames ?? [];
  const newIds: string[] = [];
  const newNames: string[] = [];
  for (let i = 0; i < oldIds.length; i++) {
    if (oldIds[i] === folderId) continue;
    newIds.push(oldIds[i]);
    newNames.push(oldNames[i] ?? '');
  }
  return { ...record, folderIds: newIds, folderNames: newNames };
}

/**
 * Return a new record with this folder present exactly once.
 * Removes any prior instances of this folder id first (defensive against
 * corrupt duplicates), then appends a single clean entry with the current
 * display name. Handles folder rename on X as a side effect.
 */
function withFolder(record: BookmarkRecord, folder: BookmarkFolder): BookmarkRecord {
  const oldIds = record.folderIds ?? [];
  const oldNames = record.folderNames ?? [];

  // Fast path: already tagged exactly once with the current name — no-op.
  const firstIdx = oldIds.indexOf(folder.id);
  const matchCount = oldIds.reduce((n, id) => (id === folder.id ? n + 1 : n), 0);
  if (matchCount === 1 && oldNames[firstIdx] === folder.name) return record;

  // Slow path: remove every existing occurrence (defensive against duplicates)
  // and append exactly one clean entry.
  const cleanedIds: string[] = [];
  const cleanedNames: string[] = [];
  for (let i = 0; i < oldIds.length; i++) {
    if (oldIds[i] === folder.id) continue;
    cleanedIds.push(oldIds[i]);
    cleanedNames.push(oldNames[i] ?? '');
  }
  return {
    ...record,
    folderIds: [...cleanedIds, folder.id],
    folderNames: [...cleanedNames, folder.name],
  };
}

/**
 * Apply a folder mirror to the record set.
 *
 * IMPORTANT: only call with records from a COMPLETE walk
 * (FolderWalkResult.complete === true). On incomplete walks, do not call —
 * old data stays intact rather than being corrupted.
 *
 * Semantics (mirror X's current state for this one folder):
 *  - Records in walked set gain/keep the folder tag
 *  - Records NOT in walked set have this folder tag removed (if present)
 *  - Other folder tags on the same records are untouched
 *  - Records for tweets we've never seen are added with this folder tag
 */
export function applyFolderMirror(
  existing: BookmarkRecord[],
  folder: BookmarkFolder,
  walkedRecords: BookmarkRecord[],
): { merged: BookmarkRecord[]; stats: FolderMirrorStats } {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const walkedIds = new Set(walkedRecords.map((r) => r.id));

  let added = 0;
  let tagged = 0;
  let untagged = 0;
  let unchanged = 0;

  // Pass 1: remove this folder's tag from records no longer in the folder.
  for (const [id, record] of byId) {
    if (walkedIds.has(id)) continue;
    const stripped = withoutFolder(record, folder.id);
    if (stripped !== record) {
      byId.set(id, stripped);
      untagged += 1;
    }
  }

  // Pass 2: tag records currently in the folder.
  for (const walked of walkedRecords) {
    const prev = byId.get(walked.id);

    if (!prev) {
      byId.set(walked.id, withFolder(walked, folder));
      added += 1;
      continue;
    }

    const wasTagged = (prev.folderIds ?? []).includes(folder.id);
    const base = mergeBookmarkRecord(prev, walked);
    byId.set(walked.id, withFolder(base, folder));
    if (wasTagged) unchanged += 1;
    else tagged += 1;
  }

  const merged = Array.from(byId.values());
  merged.sort((a, b) => compareBookmarkChronology(b, a));
  return { merged, stats: { added, tagged, untagged, unchanged } };
}

/**
 * Remove a folder tag from every record. Used for orphan cleanup when a
 * folder has been deleted on X.
 */
export function clearFolderEverywhere(
  existing: BookmarkRecord[],
  folderId: string,
): { merged: BookmarkRecord[]; cleared: number } {
  let cleared = 0;
  const merged = existing.map((record) => {
    const next = withoutFolder(record, folderId);
    if (next !== record) cleared += 1;
    return next;
  });
  return { merged, cleared };
}

export interface FolderSyncOptions {
  csrfToken?: string;
  cookieHeader?: string;
  browser?: string;
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  firefoxProfileDir?: string;
  /** If set, sync only the folder with this id (resolved ahead of time). */
  onlyFolderId?: string;
  /**
   * If set, sync only the folder matching this display name.
   * Resolved against the fetched folder list (case-insensitive
   * exact-match, then unambiguous prefix).
   */
  onlyFolderName?: string;
  delayMs?: number;
  onProgress?: (status: FolderSyncProgress) => void;
}

export interface FolderSyncProgress {
  phase: 'listing' | 'walking' | 'applying' | 'done';
  folder?: BookmarkFolder;
  folderIndex?: number;
  totalFolders?: number;
  stats?: FolderMirrorStats;
}

export interface FolderSyncResult {
  folders: BookmarkFolder[];
  perFolder: Array<{ folder: BookmarkFolder; stats: FolderMirrorStats | null; skipped?: string }>;
  totalAdded: number;
  totalTagged: number;
  totalUntagged: number;
  skippedFolders: Array<{ folder: BookmarkFolder; reason: string }>;
  orphanFoldersCleared: Array<{ folderId: string; recordsAffected: number }>;
}

async function resolveFolderSyncCookies(
  options: FolderSyncOptions,
): Promise<{ csrfToken: string; cookieHeader?: string }> {
  if (options.csrfToken) {
    return { csrfToken: options.csrfToken, cookieHeader: options.cookieHeader };
  }
  const config = loadChromeSessionConfig({ browserId: options.browser });
  if (config.browser.cookieBackend === 'firefox') {
    const cookies = extractFirefoxXCookies(options.firefoxProfileDir);
    return { csrfToken: cookies.csrfToken, cookieHeader: cookies.cookieHeader };
  }
  const chromeDir = options.chromeUserDataDir ?? config.chromeUserDataDir;
  const chromeProfile = options.chromeProfileDirectory ?? config.chromeProfileDirectory;
  const cookies = extractChromeXCookies(chromeDir, chromeProfile, config.browser);
  return { csrfToken: cookies.csrfToken, cookieHeader: cookies.cookieHeader };
}

/**
 * Persist the record set and update meta so `ft status` reflects the new total.
 * Folder sync can change `totalBookmarks` if the walk discovers records the main
 * timeline missed; without this, meta stays stale.
 */
async function persistFolderCheckpoint(
  cachePath: string,
  metaPath: string,
  records: BookmarkRecord[],
): Promise<void> {
  await writeJsonLines(cachePath, records);
  const syncedAt = new Date().toISOString();
  const previousMeta: BookmarkCacheMeta | undefined = (await pathExists(metaPath))
    ? await readJson<BookmarkCacheMeta>(metaPath)
    : undefined;
  await writeJson(metaPath, {
    provider: 'twitter',
    schemaVersion: 1,
    lastFullSyncAt: previousMeta?.lastFullSyncAt,
    lastIncrementalSyncAt: syncedAt,
    totalBookmarks: records.length,
  } satisfies BookmarkCacheMeta);
}

export async function syncBookmarkFolders(
  options: FolderSyncOptions = {},
): Promise<FolderSyncResult> {
  const { csrfToken, cookieHeader } = await resolveFolderSyncCookies(options);
  const delayMs = options.delayMs ?? 600;

  ensureDataDir();
  const cachePath = twitterBookmarksCachePath();
  const metaPath = twitterBookmarksMetaPath();
  const loaded = await loadExistingBookmarks();
  let existing = loaded.records;

  options.onProgress?.({ phase: 'listing' });
  const allFolders = await fetchBookmarkFolders(csrfToken, cookieHeader);

  let targetFolders: BookmarkFolder[];
  if (options.onlyFolderId) {
    const match = allFolders.find((f) => f.id === options.onlyFolderId);
    if (!match) {
      throw new Error(
        `Folder "${options.onlyFolderName ?? options.onlyFolderId}" not found on X. ` +
          `Available: ${allFolders.map((f) => f.name).join(', ') || '(none)'}`
      );
    }
    targetFolders = [match];
  } else if (options.onlyFolderName) {
    // Resolve name against fetched list: exact match (case-insensitive) > unambiguous prefix.
    // Trim whitespace so `ft sync --folder " Coding "` works the same as `--folder Coding`.
    const lower = options.onlyFolderName.trim().toLowerCase();
    const exact = allFolders.find((f) => f.name.trim().toLowerCase() === lower);
    const prefix = allFolders.filter((f) => f.name.trim().toLowerCase().startsWith(lower));
    const resolved = exact ?? (prefix.length === 1 ? prefix[0] : undefined);
    if (!resolved) {
      const hint = prefix.length > 1
        ? `Multiple matches: ${prefix.map((f) => f.name).join(', ')}. Be more specific.`
        : `Available: ${allFolders.map((f) => f.name).join(', ') || '(none)'}`;
      throw new Error(`No folder matches "${options.onlyFolderName}". ${hint}`);
    }
    targetFolders = [resolved];
  } else {
    targetFolders = allFolders;
  }

  const perFolder: Array<{ folder: BookmarkFolder; stats: FolderMirrorStats | null; skipped?: string }> = [];
  const skippedFolders: Array<{ folder: BookmarkFolder; reason: string }> = [];
  let totalAdded = 0;
  let totalTagged = 0;
  let totalUntagged = 0;

  for (let i = 0; i < targetFolders.length; i++) {
    const folder = targetFolders[i];
    options.onProgress?.({ phase: 'walking', folder, folderIndex: i, totalFolders: targetFolders.length });

    let walkResult: FolderWalkResult;
    try {
      walkResult = await walkFolderTimeline(csrfToken, folder.id, { cookieHeader, delayMs });
    } catch (err) {
      const reason = (err as Error).message ?? 'unknown error';
      skippedFolders.push({ folder, reason });
      perFolder.push({ folder, stats: null, skipped: reason });
      continue;
    }

    if (!walkResult.complete) {
      const reason = 'incomplete walk (hit page limit)';
      skippedFolders.push({ folder, reason });
      perFolder.push({ folder, stats: null, skipped: reason });
      continue;
    }

    // A complete walk with 0 records is a legitimate state: the user may have
    // intentionally emptied the folder on X. Mirror semantics require us to
    // clear any prior tags for this folder. We rely on walkFolderTimeline's
    // `complete: true` signal — not a heuristic about prior state — to know
    // the walk is authoritative.
    const mirror = applyFolderMirror(existing, folder, walkResult.records);
    existing = mirror.merged;
    perFolder.push({ folder, stats: mirror.stats });
    totalAdded += mirror.stats.added;
    totalTagged += mirror.stats.tagged;
    totalUntagged += mirror.stats.untagged;

    options.onProgress?.({
      phase: 'applying',
      folder,
      folderIndex: i,
      totalFolders: targetFolders.length,
      stats: mirror.stats,
    });

    // Checkpoint after each successful folder so a crash loses at most one folder's work.
    // Also updates bookmarks-meta.json so `ft status` reflects the new total.
    await persistFolderCheckpoint(cachePath, metaPath, existing);

    if (i < targetFolders.length - 1) {
      await new Promise((r) => setTimeout(r, Math.max(delayMs, 1000)));
    }
  }

  // Orphan cleanup: only on full sync (not single-folder mode).
  const orphanFoldersCleared: Array<{ folderId: string; recordsAffected: number }> = [];
  if (!options.onlyFolderId) {
    const currentFolderIds = new Set(allFolders.map((f) => f.id));
    const knownTaggedIds = new Set<string>();
    for (const r of existing) {
      for (const fid of r.folderIds ?? []) knownTaggedIds.add(fid);
    }
    for (const fid of knownTaggedIds) {
      if (currentFolderIds.has(fid)) continue;
      const { merged, cleared } = clearFolderEverywhere(existing, fid);
      existing = merged;
      if (cleared > 0) orphanFoldersCleared.push({ folderId: fid, recordsAffected: cleared });
    }
    if (orphanFoldersCleared.length > 0) {
      await persistFolderCheckpoint(cachePath, metaPath, existing);
    }
  }

  options.onProgress?.({ phase: 'done' });

  return {
    folders: allFolders,
    perFolder,
    totalAdded,
    totalTagged,
    totalUntagged,
    skippedFolders,
    orphanFoldersCleared,
  };
}

// ── Gap-fill: backfill missing data for existing bookmarks ────────────

const SYNDICATION_URL = 'https://cdn.syndication.twimg.com/tweet-result';

// Features sent with TweetResultByRestId. The only one that actually matters
// for the gap-fill bug is `longform_notetweets_consumption_enabled` — without
// it, the response omits `note_tweet` entirely and long-form tweets come back
// as a 275-char preview. The rest mirror what x.com's own web client sends so
// X doesn't 400 the request for an unknown feature set.
const TWEET_RESULT_FEATURES = {
  creator_subscriptions_tweet_preview_api_enabled: true,
  premium_content_api_read_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: false,
  responsive_web_jetfuel_frame: false,
  responsive_web_grok_share_attachment_enabled: false,
  responsive_web_grok_annotations_enabled: false,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: false,
  content_disclosure_ai_generated_indicator_enabled: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: false,
  post_ctas_fetch_enabled: false,
  rweb_cashtags_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  responsive_web_grok_image_annotation_enabled: false,
  responsive_web_grok_imagine_annotation_enabled: false,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

const TWEET_RESULT_FIELD_TOGGLES = {
  withArticleRichContentState: true,
  withArticlePlainText: true,
  withArticleSummaryText: true,
  withArticleVoiceOver: false,
  withGrokAnalyze: false,
  withDisallowedReplyControls: false,
  withPayments: false,
  withAuxiliaryUserLabels: false,
};

export type TweetFetchSource = 'graphql' | 'syndication';

export interface TweetFetchResult {
  snapshot: QuotedTweetSnapshot | null;
  article?: ArticleContent | null;
  status: 'ok' | 'empty' | 'not_found' | 'forbidden' | 'rate_limited' | 'server_error' | 'error';
  httpStatus?: number;
  /**
   * Which backend produced this result. `'graphql'` is authoritative for
   * note_tweet expansion; `'syndication'` cannot see note_tweet bodies and so
   * a `'syndication'` + `'ok'` result with a 275-char preview must not be
   * treated as settling Gap 2.
   */
  source?: TweetFetchSource;
}

export function parseTweetResultByRestId(json: any, tweetId: string): QuotedTweetSnapshot | null {
  const result = json?.data?.tweetResult?.result;
  if (!result) return null;
  // X may wrap the tweet inside a TweetWithVisibilityResults / TweetTombstone.
  // Unwrap the same way the bookmarks parser does in convertTweetToRecord.
  const tweet = result.tweet ?? result;
  const legacy = tweet?.legacy;
  if (!legacy) return null;

  const noteText = tweet?.note_tweet?.note_tweet_results?.result?.text;
  const text = noteText ?? legacy.full_text ?? legacy.text ?? '';
  if (!text) return null;

  const userResult = tweet?.core?.user_results?.result;
  const handle = userResult?.core?.screen_name ?? userResult?.legacy?.screen_name;
  const mediaEntities: any[] = legacy?.extended_entities?.media ?? legacy?.entities?.media ?? [];
  const resolvedId = String(legacy.id_str ?? tweet?.rest_id ?? tweetId);

  return {
    id: resolvedId,
    text,
    authorHandle: handle,
    authorName: userResult?.core?.name ?? userResult?.legacy?.name,
    authorProfileImageUrl:
      userResult?.avatar?.image_url ?? userResult?.legacy?.profile_image_url_https,
    postedAt: legacy.created_at ?? null,
    media: mediaEntities.map((m: any) => m.media_url_https ?? m.media_url).filter(Boolean),
    mediaObjects: mediaEntities.map((m: any) => ({
      type: m.type,
      url: m.media_url_https ?? m.media_url,
      expandedUrl: m.expanded_url,
      width: m.original_info?.width,
      height: m.original_info?.height,
    })),
    url: `https://x.com/${handle ?? '_'}/status/${resolvedId}`,
  };
}

function unwrapGraphqlResult(value: any): any {
  return value?.result?.tweet ?? value?.result ?? value?.tweet ?? value;
}

function collectArticleCandidates(value: any, depth = 0): any[] {
  if (!value || typeof value !== 'object' || depth > 8) return [];
  const candidates: any[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (!child || typeof child !== 'object') continue;
    if (key.toLowerCase().includes('article')) {
      candidates.push(unwrapGraphqlResult(child));
    }
    candidates.push(...collectArticleCandidates(child, depth + 1));
  }
  return candidates;
}

function blockText(block: any): string {
  if (!block) return '';
  if (typeof block === 'string') return block;
  if (typeof block !== 'object') return '';

  const direct = block.text ?? block.value ?? block.content ?? block.body;
  if (typeof direct === 'string') return direct;

  for (const key of ['children', 'items', 'spans', 'contents']) {
    if (Array.isArray(block[key])) {
      return block[key].map(blockText).filter(Boolean).join(' ');
    }
  }

  return '';
}

function articleFromCandidate(candidate: any): ArticleContent | null {
  if (!candidate || typeof candidate !== 'object') return null;

  const title = typeof candidate.title === 'string'
    ? candidate.title
    : typeof candidate.headline === 'string'
      ? candidate.headline
      : '';

  let text = '';
  for (const key of ['articleBody', 'plain_text', 'plainText', 'body', 'text', 'description', 'preview_text', 'summary_text']) {
    if (typeof candidate[key] === 'string' && candidate[key].length > text.length) {
      text = candidate[key];
    }
  }

  for (const key of ['contents', 'content', 'blocks']) {
    if (Array.isArray(candidate[key])) {
      const fromBlocks = candidate[key].map(blockText).filter(Boolean).join('\n\n');
      if (fromBlocks.length > text.length) text = fromBlocks;
    }
  }
  if (Array.isArray(candidate.content_state?.blocks)) {
    const fromRichTextBlocks = candidate.content_state.blocks.map(blockText).filter(Boolean).join('\n\n');
    if (fromRichTextBlocks.length > text.length) text = fromRichTextBlocks;
  }

  text = text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 50) return null;

  const siteName = typeof candidate.siteName === 'string'
    ? candidate.siteName
    : typeof candidate.site_name === 'string'
      ? candidate.site_name
      : undefined;

  return { title, text, siteName };
}

export function parseTweetArticleByRestId(json: any): ArticleContent | null {
  const result = json?.data?.tweetResult?.result;
  if (!result) return null;
  const tweet = result.tweet ?? result;

  for (const candidate of collectArticleCandidates(tweet)) {
    const article = articleFromCandidate(candidate);
    if (article) return article;
  }

  return null;
}

function buildTweetResultByRestIdUrl(tweetId: string): string {
  const variables = {
    tweetId,
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false,
  };
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(TWEET_RESULT_FEATURES),
    fieldToggles: JSON.stringify(TWEET_RESULT_FIELD_TOGGLES),
  });
  return `https://x.com/i/api/graphql/${TWEET_RESULT_BY_REST_ID_QUERY_ID}/${TWEET_RESULT_BY_REST_ID_OPERATION}?${params}`;
}

export async function fetchTweetByIdViaGraphQL(
  tweetId: string,
  csrfToken: string,
  cookieHeader?: string,
): Promise<TweetFetchResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    let response: Response;
    try {
      response = await fetch(buildTweetResultByRestIdUrl(tweetId), {
        headers: buildHeaders(csrfToken, cookieHeader),
      });
    } catch {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }

    if (response.ok) {
      let json: any;
      try {
        json = await response.json();
      } catch {
        return { snapshot: null, status: 'error', source: 'graphql' };
      }
      // Tombstoned / deleted tweets come back with a result.__typename like
      // TweetTombstone or TweetUnavailable and no legacy block.
      const result = json?.data?.tweetResult?.result;
      const typename = result?.__typename;
      if (!result || typename === 'TweetTombstone' || typename === 'TweetUnavailable') {
        return { snapshot: null, status: 'not_found', source: 'graphql' };
      }
      const snapshot = parseTweetResultByRestId(json, tweetId);
      const article = parseTweetArticleByRestId(json);
      if (!snapshot) return { snapshot: null, article, status: article ? 'ok' : 'empty', source: 'graphql' };
      return { snapshot, article, status: 'ok', source: 'graphql' };
    }

    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, Math.min(15 * Math.pow(2, attempt), 120) * 1000));
      continue;
    }
    if (response.status >= 500) {
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    if (response.status === 404) {
      return { snapshot: null, status: 'not_found', httpStatus: 404, source: 'graphql' };
    }
    if (response.status === 401 || response.status === 403) {
      return { snapshot: null, status: 'forbidden', httpStatus: response.status, source: 'graphql' };
    }
    // Other 4xx (400 usually means X rotated feature flags / queryId) — don't retry.
    return { snapshot: null, status: 'error', httpStatus: response.status, source: 'graphql' };
  }
  return { snapshot: null, status: 'rate_limited', source: 'graphql' };
}

async function fetchTweetViaSyndication(tweetId: string): Promise<TweetFetchResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${SYNDICATION_URL}?id=${tweetId}&token=x`, {
      headers: {
        'user-agent': CHROME_UA,
      },
    });

    if (response.ok) {
      const data = await response.json() as any;
      if (!data?.text) return { snapshot: null, status: 'empty', source: 'syndication' };
      const handle = data.user?.screen_name;
      const mediaEntities: any[] = data.mediaDetails ?? [];
      return {
        status: 'ok',
        source: 'syndication',
        snapshot: {
          id: String(data.id_str ?? tweetId),
          text: data.text,
          authorHandle: handle,
          authorName: data.user?.name,
          authorProfileImageUrl: data.user?.profile_image_url_https,
          postedAt: data.created_at ?? null,
          media: mediaEntities.map((m: any) => m.media_url_https ?? m.media_url).filter(Boolean),
          mediaObjects: mediaEntities.map((m: any) => ({
            type: m.type,
            url: m.media_url_https ?? m.media_url,
            width: m.original_info?.width,
            height: m.original_info?.height,
          })),
          url: `https://x.com/${handle ?? '_'}/status/${data.id_str ?? tweetId}`,
        },
      };
    }

    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, Math.min(15 * Math.pow(2, attempt), 120) * 1000));
      continue;
    }
    if (response.status >= 500) {
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    // 404/403 — tweet unavailable, don't retry
    const status = response.status === 404 ? 'not_found' as const : 'forbidden' as const;
    return { snapshot: null, status, httpStatus: response.status, source: 'syndication' };
  }
  return { snapshot: null, status: 'rate_limited', source: 'syndication' };
}

// Text >= 275 chars may be truncated by Twitter's legacy.full_text limit
const TRUNCATION_THRESHOLD = 275;
const LINK_ONLY_THRESHOLD = 80;

const GAP_FILL_FAILURE_REASONS: Record<string, string> = {
  empty: 'tweet exists but has no text content',
  not_found: 'deleted or does not exist',
  forbidden: 'private or suspended account',
  rate_limited: 'rate limited after 4 retries',
  server_error: 'X server error after 4 retries',
  error: 'X GraphQL rejected the request (likely rotated queryId or feature flags)',
};

const X_ARTICLE_MISSING_REASONS: Record<string, string> = {
  graphql: 'X GraphQL response did not include article content',
  syndication: 'X Article body requires authenticated X GraphQL; syndication only returned the tweet preview',
  unknown: 'X Article body was not returned',
};

export interface GapFillProgress {
  done: number;
  total: number;
  quotedFetched: number;
  textExpanded: number;
  articlesEnriched: number;
  failed: number;
}

export interface GapFillFailure {
  tweetId: string;
  reason: string;
  url: string;
}

export interface GapFillResult {
  quotedTweetsFilled: number;
  textExpanded: number;
  articlesEnriched: number;
  bookmarkedAtRepaired: number;
  bookmarkedAtMissing: number;
  failed: number;
  failures: GapFillFailure[];
  total: number;
}

type TweetFetcher = (tweetId: string) => Promise<TweetFetchResult>;

export interface SyncGapsOptions {
  onProgress?: (progress: GapFillProgress) => void;
  delayMs?: number;
  /** Browser id (e.g. 'chrome', 'firefox') for cookie extraction. */
  browser?: string;
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  firefoxProfileDir?: string;
  /** Direct csrf token override; skips cookie extraction. */
  csrfToken?: string;
  /** Direct cookie header override; skips cookie extraction. */
  cookieHeader?: string;
  /**
   * Injected fetcher, used by tests. Production code should not set this —
   * when omitted, gap-fill resolves cookies and uses TweetResultByRestId with
   * syndication as a fallback.
   */
  tweetFetcher?: TweetFetcher;
}

function resolveGapFillCookies(options: SyncGapsOptions): { csrfToken?: string; cookieHeader?: string } {
  if (options.csrfToken) {
    return { csrfToken: options.csrfToken, cookieHeader: options.cookieHeader };
  }
  try {
    const config = loadChromeSessionConfig({ browserId: options.browser });
    if (config.browser.cookieBackend === 'firefox') {
      const cookies = extractFirefoxXCookies(options.firefoxProfileDir);
      return { csrfToken: cookies.csrfToken, cookieHeader: cookies.cookieHeader };
    }
    const chromeDir = options.chromeUserDataDir ?? config.chromeUserDataDir;
    const chromeProfile = options.chromeProfileDirectory ?? config.chromeProfileDirectory;
    const cookies = extractChromeXCookies(chromeDir, chromeProfile, config.browser);
    return { csrfToken: cookies.csrfToken, cookieHeader: cookies.cookieHeader };
  } catch {
    // No cookies available (e.g. no browser install) — gap-fill degrades to
    // syndication-only, which still backfills quoted-tweet metadata but cannot
    // expand truncated note_tweets.
    return {};
  }
}

function textWithoutUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/g, '').trim();
}

function isLinkOnlyBookmark(record: BookmarkRecord): boolean {
  if (!record.links?.length) return false;
  return textWithoutUrls(record.text ?? '').length < LINK_ONLY_THRESHOLD;
}

function isXArticleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (host === 'x.com' || host === 'twitter.com') && url.pathname.startsWith('/i/article/');
  } catch {
    return false;
  }
}

async function readEnrichedBookmarkIds(): Promise<Set<string>> {
  const enrichedIds = new Set<string>();
  try {
    const { openDb } = await import('./db.js');
    const { twitterBookmarksIndexPath } = await import('./paths.js');
    const db = await openDb(twitterBookmarksIndexPath());
    try {
      const rows = db.exec('SELECT id FROM bookmarks WHERE enriched_at IS NOT NULL');
      for (const row of rows[0]?.values ?? []) enrichedIds.add(row[0] as string);
    } finally { db.close(); }
  } catch { /* DB may not exist yet */ }
  return enrichedIds;
}

export async function syncGaps(options: SyncGapsOptions = {}): Promise<GapFillResult> {
  const delayMs = options.delayMs ?? 300;
  const cachePath = twitterBookmarksCachePath();
  const loaded = sanitizeRecords(await readJsonLines<BookmarkRecord>(cachePath));
  const records = loaded.records;

  const cookies = options.tweetFetcher ? {} : resolveGapFillCookies(options);
  const fetcher: TweetFetcher = options.tweetFetcher
    ?? (async (tweetId) => {
      if (cookies.csrfToken) {
        const graphqlResult = await fetchTweetByIdViaGraphQL(tweetId, cookies.csrfToken, cookies.cookieHeader);
        // Permanent GraphQL outcomes (ok, not_found, empty) are authoritative.
        // Transient failures (auth drift, rate limit, network) fall through to
        // syndication so at least quoted-tweet metadata can be backfilled.
        if (graphqlResult.status === 'ok' || graphqlResult.status === 'not_found' || graphqlResult.status === 'empty') {
          return graphqlResult;
        }
      }
      return fetchTweetViaSyndication(tweetId);
    });
  const enrichedIds = await readEnrichedBookmarkIds();

  // Gap 1: missing quoted tweets. Skip records where a previous gap-fill run
  // already tried and failed — otherwise dead tweets get re-fetched forever.
  const needsQuotedTweet = records.filter((r) => r.quotedStatusId && !r.quotedTweet && !r.quotedTweetFailedAt);
  const quotedIds = new Set(needsQuotedTweet.map((r) => r.quotedStatusId!));

  // Gap 2: potentially truncated text. Skip records we've already attempted
  // to expand — `textExpandedAt` is set regardless of outcome, so a note_tweet
  // that's already full-length won't be re-fetched on every run.
  const maybeTruncated = records.filter((r) => (r.text?.length ?? 0) >= TRUNCATION_THRESHOLD && !r.textExpandedAt);
  const truncatedIds = new Set(maybeTruncated.map((r) => r.tweetId));

  // Gap 3a: X Article bookmarks can look short ("x.com/i/article/…") even
  // when the useful body exists in the authenticated TweetResult payload.
  const needsXArticle = records.filter((r) =>
    !enrichedIds.has(r.id) && isLinkOnlyBookmark(r) && (r.links ?? []).some(isXArticleUrl)
  );
  const xArticleIds = new Set(needsXArticle.map((r) => r.tweetId));

  // Build lookup indexes for applying results
  const recordsByQuotedId = new Map<string, BookmarkRecord[]>();
  for (const r of needsQuotedTweet) {
    const list = recordsByQuotedId.get(r.quotedStatusId!) ?? [];
    list.push(r);
    recordsByQuotedId.set(r.quotedStatusId!, list);
  }
  const recordsByTweetId = new Map<string, BookmarkRecord[]>();
  for (const r of maybeTruncated) {
    const list = recordsByTweetId.get(r.tweetId) ?? [];
    list.push(r);
    recordsByTweetId.set(r.tweetId, list);
  }
  const recordsByXArticleTweetId = new Map<string, BookmarkRecord[]>();
  for (const r of needsXArticle) {
    const list = recordsByXArticleTweetId.get(r.tweetId) ?? [];
    list.push(r);
    recordsByXArticleTweetId.set(r.tweetId, list);
  }

  // Combine all IDs to fetch — deduplicated
  const allFetchIds = [...new Set([...quotedIds, ...truncatedIds, ...xArticleIds])];
  const total = allFetchIds.length;

  let quotedFetched = 0;
  let textExpanded = 0;
  let articlesEnriched = 0;
  let failed = 0;
  const failures: GapFillFailure[] = [];
  const dbQuotedUpdates: Array<{ id: string; quotedTweet: QuotedTweetSnapshot }> = [];
  const dbTextUpdates: Array<{ id: string; text: string }> = [];
  const articleDbUpdates: ArticleUpdate[] = [];

  // Fetch and apply incrementally
  for (let i = 0; i < allFetchIds.length; i++) {
    const tweetId = allFetchIds[i];
    const now = new Date().toISOString();
    let snapshot: QuotedTweetSnapshot | null = null;
    let article: ArticleContent | null | undefined;
    let resultStatus: TweetFetchResult['status'] = 'error';
    let resultSource: TweetFetchSource | undefined;
    try {
      const result = await fetcher(tweetId);
      snapshot = result.snapshot;
      article = result.article;
      resultStatus = result.status;
      resultSource = result.source;
      if (!snapshot && !article) {
        failed++;
        failures.push({
          tweetId,
          reason: GAP_FILL_FAILURE_REASONS[result.status] ?? result.status,
          url: `https://x.com/_/status/${tweetId}`,
        });
      }
    } catch (err) {
      failed++;
      failures.push({
        tweetId,
        reason: (err as Error).message ?? 'unknown error',
        url: `https://x.com/_/status/${tweetId}`,
      });
    }

    // A permanent negative result (deleted / forbidden / empty body) should
    // stop re-trying the same id; transient ones (rate_limited, network) should
    // not mark the record so the next run can retry.
    const isPermanentFailure = resultStatus === 'not_found' || resultStatus === 'forbidden' || resultStatus === 'empty';

    // Gap 1 (quoted tweet): syndication snapshots are fine here — they carry
    // enough metadata (author, media, preview text) to make the quoted tweet
    // useful in the UI even if a note_tweet body is cut off.
    for (const record of recordsByQuotedId.get(tweetId) ?? []) {
      if (snapshot && !record.quotedTweet) {
        record.quotedTweet = snapshot;
        dbQuotedUpdates.push({ id: record.id, quotedTweet: snapshot });
        quotedFetched++;
      } else if (!snapshot && isPermanentFailure) {
        record.quotedTweetFailedAt = now;
      }
    }

    // Gap 2 (truncated text): only GraphQL can expose note_tweet bodies, so a
    // syndication-only `ok` response with the 275-char preview must NOT mark
    // the record as checked — otherwise a user with expired cookies (or after
    // X rotates the queryId) permanently locks every long-form tweet into its
    // truncated form. Mark only when GraphQL settled the question, when we
    // genuinely expanded the text, or when the tweet is permanently gone.
    const graphqlSettled = resultSource === 'graphql' && snapshot != null;
    for (const record of recordsByTweetId.get(tweetId) ?? []) {
      const didExpand = snapshot != null && snapshot.text.length > (record.text?.length ?? 0);
      if (didExpand) {
        record.text = snapshot!.text;
        dbTextUpdates.push({ id: record.id, text: snapshot!.text });
        textExpanded++;
      }
      if (didExpand || graphqlSettled || isPermanentFailure) {
        record.textExpandedAt = now;
      }
    }

    if (article) {
      for (const record of recordsByXArticleTweetId.get(tweetId) ?? []) {
        if (enrichedIds.has(record.id)) continue;
        articleDbUpdates.push({
          id: record.id,
          articleTitle: article.title,
          articleText: article.text,
          articleSite: article.siteName,
        });
        enrichedIds.add(record.id);
        articlesEnriched++;
      }
    } else if (recordsByXArticleTweetId.has(tweetId) && snapshot) {
      failed++;
      failures.push({
        tweetId,
        reason: X_ARTICLE_MISSING_REASONS[resultSource ?? 'unknown'],
        url: `https://x.com/_/status/${tweetId}`,
      });
    }

    options?.onProgress?.({
      done: i + 1,
      total,
      quotedFetched,
      textExpanded,
      articlesEnriched,
      failed,
    });

    // Checkpoint every 100 fetches
    if ((i + 1) % 100 === 0) {
      await writeJsonLines(cachePath, records);
    }

    if (i < allFetchIds.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Find bookmarks missing bookmarkedAt (filled on next sync, not via syndication)
  const bookmarkedAtMissing = records.filter((r) => !r.bookmarkedAt).length;

  // Final persist (gaps 1+2)
  await writeJsonLines(cachePath, records);
  if (dbQuotedUpdates.length > 0) await updateQuotedTweets(dbQuotedUpdates);
  if (dbTextUpdates.length > 0) await updateBookmarkText(dbTextUpdates);

  // ── Gap 3b: Article enrichment for ordinary link-only bookmarks ─────────
  // Bookmarks with < 80 chars of text after stripping URLs are "link-only"
  // and invisible to search. Fetch the linked article to make them searchable.
  // Article content goes directly to SQLite (not JSONL) to avoid memory bloat.

  // Filter to link-only bookmarks not yet enriched
  const needsEnrichment = records.filter((r) => {
    if (enrichedIds.has(r.id)) return false;
    if ((r.links ?? []).some(isXArticleUrl)) return false;
    return isLinkOnlyBookmark(r);
  });

  const articleTotal = Math.min(needsEnrichment.length, 50); // cap per run
  for (let i = 0; i < articleTotal; i++) {
    const record = needsEnrichment[i];
    // Find the first non-twitter link
    let targetUrl: string | null = null;
    for (const link of record.links ?? []) {
      const resolved = link.includes('t.co/') ? await resolveTcoLink(link) : link;
      if (resolved) { targetUrl = resolved; break; }
    }

    if (targetUrl) {
      const article = await fetchArticle(targetUrl);
      if (article && article.text.length >= 50) {
        articleDbUpdates.push({
          id: record.id,
          articleTitle: article.title,
          articleText: article.text,
          articleSite: article.siteName,
        });
        articlesEnriched++;
      }
    }

    options?.onProgress?.({
      done: allFetchIds.length + i + 1,
      total: allFetchIds.length + articleTotal,
      quotedFetched,
      textExpanded,
      articlesEnriched,
      failed,
    });

    // Rate limit: 500ms between fetches
    if (i < articleTotal - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (articleDbUpdates.length > 0) await updateArticleContent(articleDbUpdates);

  return {
    quotedTweetsFilled: quotedFetched,
    textExpanded,
    articlesEnriched,
    bookmarkedAtRepaired: loaded.repaired,
    bookmarkedAtMissing,
    failed,
    failures,
    total: allFetchIds.length + articleTotal,
  };
}
