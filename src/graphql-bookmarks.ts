import { ensureDir, readJsonLines, writeJsonLines, readJson, writeJson, pathExists } from './fs.js';
import { ensureDataDir, twitterBookmarksCachePath, twitterBookmarksMetaPath, twitterBackfillStatePath } from './paths.js';
import { loadChromeSessionConfig } from './config.js';
import { extractChromeXCookies } from './chrome-cookies.js';
import { extractFirefoxXCookies } from './firefox-cookies.js';
import { parseTimestampMs } from './date-utils.js';
import type { BookmarkBackfillState, BookmarkCacheMeta, BookmarkRecord, QuotedTweetSnapshot } from './types.js';
import { exportBookmarksForSyncSeed, updateQuotedTweets, updateBookmarkText } from './bookmarks-db.js';

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const X_PUBLIC_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const BOOKMARKS_QUERY_ID = 'Z9GWmP0kP2dajyckAaDUBw';
const BOOKMARKS_OPERATION = 'Bookmarks';

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
      quotedTweet = {
        id: qtId,
        text: qtLegacy.full_text ?? qtLegacy.text ?? '',
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
        })),
        url: `https://x.com/${qtHandle ?? '_'}/status/${qtId}`,
      };
    }
  }

  // X Articles / long-form note tweets store full text separately
  const noteTweetText = tweet?.note_tweet?.note_tweet_results?.result?.text;
  const text = noteTweetText ?? legacy.full_text ?? legacy.text ?? '';

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

async function fetchPageWithRetry(csrfToken: string, cursor?: string, cookieHeader?: string, pageSize?: number): Promise<PageResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(buildUrl(cursor, pageSize), { headers: buildHeaders(csrfToken, cookieHeader) });

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

  while (page < maxPages) {
    if (Date.now() - started > maxMinutes * 60_000) {
      stopReason = 'max runtime reached';
      break;
    }

    const result = await fetchPageWithRetry(csrfToken, cursor, cookieHeader, pageSize);
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

    stalePages = added === 0 ? stalePages + 1 : 0;

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

      const result = await fetchPageWithRetry(csrfToken, cursor, cookieHeader, pageSize);
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
  await writeJsonLines(cachePath, existing);
  await writeJson(metaPath, {
    provider: 'twitter',
    schemaVersion: 1,
    lastFullSyncAt: incremental ? previousMeta?.lastFullSyncAt : syncedAt,
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
  };
}

// ── Gap-fill: backfill missing data for existing bookmarks ────────────

const SYNDICATION_URL = 'https://cdn.syndication.twimg.com/tweet-result';

interface SyndicationResult {
  snapshot: QuotedTweetSnapshot | null;
  status: 'ok' | 'empty' | 'not_found' | 'forbidden' | 'rate_limited' | 'server_error' | 'error';
  httpStatus?: number;
}

async function fetchTweetViaSyndication(tweetId: string): Promise<SyndicationResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${SYNDICATION_URL}?id=${tweetId}&token=x`, {
      headers: {
        'user-agent': CHROME_UA,
      },
    });

    if (response.ok) {
      const data = await response.json() as any;
      if (!data?.text) return { snapshot: null, status: 'empty' };
      const handle = data.user?.screen_name;
      const mediaEntities: any[] = data.mediaDetails ?? [];
      return {
        status: 'ok',
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
    return { snapshot: null, status, httpStatus: response.status };
  }
  return { snapshot: null, status: 'rate_limited' };
}

// Text >= 275 chars may be truncated by Twitter's legacy.full_text limit
const TRUNCATION_THRESHOLD = 275;

export interface GapFillProgress {
  done: number;
  total: number;
  quotedFetched: number;
  textExpanded: number;
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
  bookmarkedAtRepaired: number;
  bookmarkedAtMissing: number;
  failed: number;
  failures: GapFillFailure[];
  total: number;
}

export async function syncGaps(options?: {
  onProgress?: (progress: GapFillProgress) => void;
  delayMs?: number;
}): Promise<GapFillResult> {
  const delayMs = options?.delayMs ?? 300;
  const cachePath = twitterBookmarksCachePath();
  const loaded = sanitizeRecords(await readJsonLines<BookmarkRecord>(cachePath));
  const records = loaded.records;

  // Gap 1: missing quoted tweets
  const needsQuotedTweet = records.filter((r) => r.quotedStatusId && !r.quotedTweet);
  const quotedIds = new Set(needsQuotedTweet.map((r) => r.quotedStatusId!));

  // Gap 2: potentially truncated text (articles/long notes cut off by legacy.full_text)
  const maybeTruncated = records.filter((r) => (r.text?.length ?? 0) >= TRUNCATION_THRESHOLD);
  const truncatedIds = new Set(maybeTruncated.map((r) => r.tweetId));

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

  // Combine all IDs to fetch — deduplicated
  const allFetchIds = [...new Set([...quotedIds, ...truncatedIds])];
  const total = allFetchIds.length;

  let quotedFetched = 0;
  let textExpanded = 0;
  let failed = 0;
  const failures: GapFillFailure[] = [];
  const dbQuotedUpdates: Array<{ id: string; quotedTweet: QuotedTweetSnapshot }> = [];
  const dbTextUpdates: Array<{ id: string; text: string }> = [];

  // Fetch and apply incrementally
  for (let i = 0; i < allFetchIds.length; i++) {
    const tweetId = allFetchIds[i];
    let snapshot: QuotedTweetSnapshot | null = null;
    try {
      const result = await fetchTweetViaSyndication(tweetId);
      snapshot = result.snapshot;
      if (!snapshot) {
        failed++;
        const reasons: Record<string, string> = {
          empty: 'tweet exists but has no text content',
          not_found: 'deleted or does not exist',
          forbidden: 'private or suspended account',
          rate_limited: 'rate limited after 4 retries',
          server_error: 'X server error after 4 retries',
        };
        failures.push({
          tweetId,
          reason: reasons[result.status] ?? result.status,
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

    // Apply immediately so progress is accurate
    if (snapshot) {
      // Quoted tweet gap
      for (const record of recordsByQuotedId.get(tweetId) ?? []) {
        if (!record.quotedTweet) {
          record.quotedTweet = snapshot;
          dbQuotedUpdates.push({ id: record.id, quotedTweet: snapshot });
          quotedFetched++;
        }
      }
      // Truncated text gap
      for (const record of recordsByTweetId.get(tweetId) ?? []) {
        if (snapshot.text.length > (record.text?.length ?? 0)) {
          record.text = snapshot.text;
          dbTextUpdates.push({ id: record.id, text: snapshot.text });
          textExpanded++;
        }
      }
    }

    options?.onProgress?.({
      done: i + 1,
      total,
      quotedFetched,
      textExpanded,
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

  // Final persist
  await writeJsonLines(cachePath, records);
  if (dbQuotedUpdates.length > 0) await updateQuotedTweets(dbQuotedUpdates);
  if (dbTextUpdates.length > 0) await updateBookmarkText(dbTextUpdates);

  return {
    quotedTweetsFilled: quotedFetched,
    textExpanded,
    bookmarkedAtRepaired: loaded.repaired,
    bookmarkedAtMissing,
    failed,
    failures,
    total,
  };
}
