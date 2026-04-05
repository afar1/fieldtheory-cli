import { ensureDir, readJsonLines, writeJsonLines, readJson, writeJson, pathExists } from './fs.js';
import { ensureDataDir, twitterBookmarksCachePath, twitterBackfillStatePath } from './paths.js';
import { loadChromeSessionConfig } from './config.js';
import { extractChromeXCookies } from './chrome-cookies.js';
import type { BookmarkBackfillState, BookmarkRecord } from './types.js';
import { exportBookmarksForSyncSeed } from './bookmarks-db.js';

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
  /** Max pages to fetch (20 bookmarks per page). Default: 500 */
  maxPages?: number;
  /** Stop once this many *new* bookmarks have been added. Default: unlimited */
  targetAdds?: number;
  /** Delay between page requests in ms. Default: 600 */
  delayMs?: number;
  /** Max runtime in minutes. Default: 30 */
  maxMinutes?: number;
  /** Consecutive pages with 0 new bookmarks before stopping. Default: 3 */
  stalePageLimit?: number;
  /** Chrome user-data-dir override. */
  chromeUserDataDir?: string;
  /** Chrome profile directory name (e.g. "Default"). */
  chromeProfileDirectory?: string;
  /** Direct csrf token override; skips Chrome cookie extraction. */
  csrfToken?: string;
  /** Direct cookie header override; skips Chrome cookie extraction. */
  cookieHeader?: string;
  /** Progress callback. */
  onProgress?: (status: SyncProgress) => void;
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
  totalBookmarks: number;
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

function parseBookmarkTimestamp(record: BookmarkRecord): number | null {
  const candidates = [record.bookmarkedAt, record.postedAt, record.syncedAt];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function compareBookmarkChronology(a: BookmarkRecord, b: BookmarkRecord): number {
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

async function loadExistingBookmarks(): Promise<BookmarkRecord[]> {
  const cachePath = twitterBookmarksCachePath();
  const existing = await readJsonLines<BookmarkRecord>(cachePath);
  if (existing.length > 0) return existing;
  // On first run, no JSONL and no DB — return empty
  try {
    return await exportBookmarksForSyncSeed();
  } catch {
    return [];
  }
}

function buildUrl(cursor?: string): string {
  const variables: Record<string, unknown> = { count: 20 };
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
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
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

  return {
    id: tweetId,
    tweetId,
    url: `https://x.com/${authorHandle ?? '_'}/status/${tweetId}`,
    text: legacy.full_text ?? legacy.text ?? '',
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
    if (record) records.push(record);
  }

  return { records, nextCursor };
}

async function fetchPageWithRetry(csrfToken: string, cursor?: string, cookieHeader?: string): Promise<PageResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(buildUrl(cursor), { headers: buildHeaders(csrfToken, cookieHeader) });

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
            ? 'Fix: Your X session may have expired. Open Chrome, go to https://x.com, and make sure you are logged in. Then retry.'
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
  input: { added: number; seenIds: string[]; stopReason: string }
): BookmarkBackfillState {
  return {
    provider: 'twitter',
    lastRunAt: new Date().toISOString(),
    totalRuns: prev.totalRuns + 1,
    totalAdded: prev.totalAdded + input.added,
    lastAdded: input.added,
    lastSeenIds: input.seenIds.slice(-20),
    stopReason: input.stopReason,
  };
}

export function formatSyncResult(result: SyncResult): string {
  return [
    'Sync complete.',
    `- bookmarks added: ${result.added}`,
    `- total bookmarks: ${result.totalBookmarks}`,
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
  const maxPages = options.maxPages ?? 500;
  const delayMs = options.delayMs ?? 600;
  const maxMinutes = options.maxMinutes ?? 30;
  const stalePageLimit = options.stalePageLimit ?? 3;
  const checkpointEvery = options.checkpointEvery ?? 25;

  let csrfToken: string;
  let cookieHeader: string | undefined;

  if (options.csrfToken) {
    csrfToken = options.csrfToken;
    cookieHeader = options.cookieHeader;
  } else {
    const chromeConfig = loadChromeSessionConfig();
    const chromeDir = options.chromeUserDataDir ?? chromeConfig.chromeUserDataDir;
    const chromeProfile = options.chromeProfileDirectory ?? chromeConfig.chromeProfileDirectory;
    const cookies = extractChromeXCookies(chromeDir, chromeProfile);
    csrfToken = cookies.csrfToken;
    cookieHeader = cookies.cookieHeader;
  }

  ensureDataDir();
  const cachePath = twitterBookmarksCachePath();
  const statePath = twitterBackfillStatePath();
  let existing = await loadExistingBookmarks();
  const newestKnownId = incremental
    ? existing.slice().sort((a, b) => compareBookmarkChronology(b, a))[0]?.id
    : undefined;
  const prevState: BookmarkBackfillState = (await pathExists(statePath))
    ? await readJson<BookmarkBackfillState>(statePath)
    : { provider: 'twitter', totalRuns: 0, totalAdded: 0, lastAdded: 0, lastSeenIds: [] };

  const started = Date.now();
  let page = 0;
  let totalAdded = 0;
  let stalePages = 0;
  let cursor: string | undefined;
  const allSeenIds: string[] = [];
  let stopReason = 'unknown';

  while (page < maxPages) {
    if (Date.now() - started > maxMinutes * 60_000) {
      stopReason = 'max runtime reached';
      break;
    }

    const result = await fetchPageWithRetry(csrfToken, cursor, cookieHeader);
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

    if (options.targetAdds && totalAdded >= options.targetAdds) {
      stopReason = 'target additions reached';
      break;
    }
    if (incremental && reachedLatestStored) {
      stopReason = 'caught up to newest stored bookmark';
      break;
    }
    if (stalePages >= stalePageLimit) {
      stopReason = 'no new bookmarks (stale)';
      break;
    }
    if (!result.nextCursor) {
      stopReason = 'end of bookmarks';
      break;
    }

    if (page % checkpointEvery === 0) await writeJsonLines(cachePath, existing);

    cursor = result.nextCursor;
    if (page < maxPages) await new Promise((r) => setTimeout(r, delayMs));
  }

  if (stopReason === 'unknown') stopReason = page >= maxPages ? 'max pages reached' : 'unknown';

  await writeJsonLines(cachePath, existing);
  await writeJson(statePath, updateState(prevState, { added: totalAdded, seenIds: allSeenIds.slice(-20), stopReason }));

  options.onProgress?.({
    page,
    totalFetched: allSeenIds.length,
    newAdded: totalAdded,
    running: false,
    done: true,
    stopReason,
  });

  return { added: totalAdded, totalBookmarks: existing.length, pages: page, stopReason, cachePath, statePath };
}
