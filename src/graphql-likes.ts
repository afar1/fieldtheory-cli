import { readJsonLines, writeJsonLines, readJson, writeJson, pathExists } from './fs.js';
import { ensureDataDir, twitterLikesBackfillStatePath, twitterLikesCachePath, twitterLikesMetaPath } from './paths.js';
import { loadChromeSessionConfig } from './config.js';
import { extractChromeXCookies } from './chrome-cookies.js';
import { extractFirefoxXCookies } from './firefox-cookies.js';
import type { LikeRecord, LikesBackfillState, LikesCacheMeta } from './types.js';

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const X_PUBLIC_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

const LIKES_QUERY_ID = 'KPuet6dGbC8LB2sOLx7tZQ';
const LIKES_OPERATION = 'Likes';
const VIEWER_QUERY_ID = '_8ClT24oZ8tpylf_OSuNdg';
const VIEWER_OPERATION = 'Viewer';

const LIKES_GRAPHQL_FEATURES = {
  rweb_video_screen_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_jetfuel_frame: false,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  responsive_web_enhance_cards_enabled: false,
};

const LIKES_GRAPHQL_FIELD_TOGGLES = {
  withPayments: false,
  withAuxiliaryUserLabels: false,
  withArticleRichContentState: true,
  withArticlePlainText: false,
  withArticleSummaryText: true,
  withArticleVoiceOver: false,
  withGrokAnalyze: false,
  withDisallowedReplyControls: false,
};

const VIEWER_GRAPHQL_FEATURES = {
  subscriptions_upsells_api_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
};

const VIEWER_GRAPHQL_FIELD_TOGGLES = {
  isDelegate: false,
  withPayments: false,
  withAuxiliaryUserLabels: false,
};

export interface LikesSyncOptions {
  maxPages?: number;
  delayMs?: number;
  maxMinutes?: number;
  stalePageLimit?: number;
  browser?: string;
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  firefoxProfileDir?: string;
  csrfToken?: string;
  cookieHeader?: string;
  onProgress?: (status: LikesSyncProgress) => void;
  checkpointEvery?: number;
}

export interface LikesSyncProgress {
  page: number;
  totalFetched: number;
  newAdded: number;
  running: boolean;
  done: boolean;
  stopReason?: string;
}

export interface LikesSyncResult {
  added: number;
  totalLikes: number;
  pages: number;
  stopReason: string;
  cachePath: string;
  statePath: string;
}

interface LikesPageResult {
  records: LikeRecord[];
  nextCursor?: string;
}

type FavoriteTweet = Record<string, any>;

function parseSnowflake(value?: string | null): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function decrementSnowflake(value?: string | null): string | undefined {
  const parsed = parseSnowflake(value);
  if (parsed == null || parsed <= 0n) return undefined;
  return String(parsed - 1n);
}

function parseLikeTimestamp(record: LikeRecord): number | null {
  const candidates = [record.likedAt, record.postedAt, record.syncedAt];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function compareLikeChronology(a: LikeRecord, b: LikeRecord): number {
  const aTimestamp = parseLikeTimestamp(a);
  const bTimestamp = parseLikeTimestamp(b);
  if (aTimestamp != null && bTimestamp != null && aTimestamp !== bTimestamp) {
    return aTimestamp > bTimestamp ? 1 : -1;
  }

  const aId = parseSnowflake(a.tweetId ?? a.id);
  const bId = parseSnowflake(b.tweetId ?? b.id);
  if (aId != null && bId != null && aId !== bId) {
    return aId > bId ? 1 : -1;
  }

  const aStamp = String(a.likedAt ?? a.postedAt ?? a.syncedAt ?? '');
  const bStamp = String(b.likedAt ?? b.postedAt ?? b.syncedAt ?? '');
  return aStamp.localeCompare(bStamp);
}

async function loadExistingLikes(): Promise<LikeRecord[]> {
  return readJsonLines<LikeRecord>(twitterLikesCachePath());
}

function buildViewerUrl(): string {
  const params = new URLSearchParams({
    variables: JSON.stringify({}),
    features: JSON.stringify(VIEWER_GRAPHQL_FEATURES),
    fieldToggles: JSON.stringify(VIEWER_GRAPHQL_FIELD_TOGGLES),
  });
  return `https://x.com/i/api/graphql/${VIEWER_QUERY_ID}/${VIEWER_OPERATION}?${params}`;
}

function buildUrl(userId: string, cursor?: string): string {
  const variables: Record<string, unknown> = {
    userId,
    count: 20,
    includePromotedContent: false,
  };
  if (cursor) variables.cursor = cursor;
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(LIKES_GRAPHQL_FEATURES),
    fieldToggles: JSON.stringify(LIKES_GRAPHQL_FIELD_TOGGLES),
  });
  return `https://x.com/i/api/graphql/${LIKES_QUERY_ID}/${LIKES_OPERATION}?${params}`;
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

function snowflakeToIso(value?: string | null): string | null {
  const parsed = parseSnowflake(value);
  if (parsed == null) return null;
  const ms = Number(parsed >> 22n) + 1288834974657;
  return new Date(ms).toISOString();
}

export function convertLikedTweetToRecord(tweet: FavoriteTweet, now: string): LikeRecord | null {
  const graphTweet = tweet?.tweet ?? tweet;
  const legacy = graphTweet?.legacy;
  const tweetId = legacy?.id_str ?? graphTweet?.rest_id ?? tweet?.id_str ?? tweet?.id?.toString();
  if (!tweetId) return null;

  const user = legacy
    ? graphTweet?.core?.user_results?.result
    : tweet?.user;
  const authorHandle = legacy
    ? user?.core?.screen_name ?? user?.legacy?.screen_name
    : user?.screen_name;
  const authorName = legacy
    ? user?.core?.name ?? user?.legacy?.name
    : user?.name;
  const authorProfileImageUrl = legacy
    ? user?.avatar?.image_url ?? user?.legacy?.profile_image_url_https ?? user?.legacy?.profile_image_url
    : user?.profile_image_url_https ?? user?.profile_image_url;

  const sourceTweet = legacy ?? tweet;
  const mediaEntities = sourceTweet?.extended_entities?.media ?? sourceTweet?.entities?.media ?? [];
  const media: string[] = mediaEntities
    .map((m: any) => m.media_url_https ?? m.media_url)
    .filter(Boolean);
  const mediaObjects = mediaEntities.map((m: any) => ({
    type: m.type,
    mediaUrl: m.media_url_https ?? m.media_url,
    previewUrl: m.media_url_https ?? m.media_url,
    width: m.sizes?.large?.w ?? m.original_info?.width,
    height: m.sizes?.large?.h ?? m.original_info?.height,
    extAltText: m.ext_alt_text,
    variants: Array.isArray(m.video_info?.variants)
      ? m.video_info.variants.map((v: any) => ({
          url: v.url,
          contentType: v.content_type,
          bitrate: v.bitrate,
        }))
      : undefined,
  }));

  const links: string[] = (sourceTweet?.entities?.urls ?? [])
    .map((u: any) => u.expanded_url ?? u.url)
    .filter((u: string | undefined) => u && !u.includes('t.co'));

  return {
    id: tweetId,
    tweetId,
    url: `https://x.com/${authorHandle ?? '_'}/status/${tweetId}`,
    text:
      graphTweet?.note_tweet?.note_tweet_results?.result?.text ??
      sourceTweet?.full_text ??
      sourceTweet?.text ??
      '',
    authorHandle,
    authorName,
    authorProfileImageUrl,
    author: user ? {
      handle: authorHandle,
      name: authorName,
      profileImageUrl: authorProfileImageUrl,
      description: legacy ? user?.legacy?.description : user?.description,
      location: legacy ? user?.legacy?.location : user?.location,
      url: legacy ? user?.legacy?.url : user?.url,
      verified: Boolean(legacy ? (user?.is_blue_verified ?? user?.legacy?.verified) : user?.verified),
      followersCount: legacy ? user?.legacy?.followers_count : user?.followers_count,
      followingCount: legacy ? user?.legacy?.friends_count : user?.friends_count,
      statusesCount: legacy ? user?.legacy?.statuses_count : user?.statuses_count,
    } : undefined,
    postedAt: sourceTweet?.created_at ?? null,
    likedAt: null,
    syncedAt: now,
    conversationId: sourceTweet?.conversation_id_str,
    inReplyToStatusId: sourceTweet?.in_reply_to_status_id_str,
    inReplyToUserId: sourceTweet?.in_reply_to_user_id_str,
    quotedStatusId: sourceTweet?.quoted_status_id_str,
    language: sourceTweet?.lang,
    sourceApp: sourceTweet?.source,
    possiblySensitive: sourceTweet?.possibly_sensitive,
    engagement: {
      likeCount: sourceTweet?.favorite_count,
      repostCount: sourceTweet?.retweet_count,
      replyCount: sourceTweet?.reply_count,
      quoteCount: sourceTweet?.quote_count,
      bookmarkCount: sourceTweet?.bookmark_count,
      viewCount: graphTweet?.views?.count ? Number(graphTweet.views.count) : undefined,
    },
    media,
    mediaObjects,
    links,
    tags: [],
    ingestedVia: 'browser',
  };
}

export function parseLikesResponse(json: unknown, now?: string): LikesPageResult {
  const ts = now ?? new Date().toISOString();
  const instructions = Array.isArray(json)
    ? []
    : (json as any)?.data?.user?.result?.timeline?.timeline?.instructions ?? [];
  const timelineEntries = instructions.flatMap((instruction: any) => instruction?.entries ?? []);
  const timelineRecords = timelineEntries
    .map((entry: any) => {
      const tweetResult = entry?.content?.itemContent?.tweet_results?.result;
      const record = convertLikedTweetToRecord(tweetResult, ts);
      if (record && entry?.sortIndex) {
        record.likedAt = snowflakeToIso(entry.sortIndex) ?? record.likedAt;
      }
      return record;
    })
    .filter((record: LikeRecord | null): record is LikeRecord => Boolean(record));

  const arrayRecords = Array.isArray(json)
    ? json
        .map((tweet) => convertLikedTweetToRecord(tweet, ts))
        .filter((record): record is LikeRecord => Boolean(record))
    : [];

  const records = timelineRecords.length > 0 ? timelineRecords : arrayRecords;
  const nextCursor = timelineEntries
    .find((entry: any) => entry?.content?.cursorType === 'Bottom')
    ?.content?.value ?? decrementSnowflake(records[records.length - 1]?.tweetId);
  return { records, nextCursor };
}

function scoreRecord(record: LikeRecord): number {
  let score = 0;
  if (record.postedAt) score += 2;
  if (record.authorProfileImageUrl) score += 2;
  if (record.author) score += 3;
  if (record.engagement) score += 3;
  if ((record.mediaObjects?.length ?? 0) > 0) score += 3;
  if ((record.links?.length ?? 0) > 0) score += 2;
  return score;
}

export function mergeLikeRecord(existing: LikeRecord | undefined, incoming: LikeRecord): LikeRecord {
  if (!existing) return incoming;
  return scoreRecord(incoming) >= scoreRecord(existing)
    ? { ...existing, ...incoming, likedAt: existing.likedAt ?? incoming.likedAt ?? null }
    : { ...incoming, ...existing, likedAt: existing.likedAt ?? incoming.likedAt ?? null };
}

export function mergeLikes(
  existing: LikeRecord[],
  incoming: LikeRecord[],
): { merged: LikeRecord[]; added: number } {
  const byId = new Map(existing.map((r) => [r.id, r]));
  let added = 0;
  for (const record of incoming) {
    const prev = byId.get(record.id);
    if (!prev) added += 1;
    byId.set(record.id, mergeLikeRecord(prev, record));
  }
  const merged = Array.from(byId.values());
  merged.sort((a, b) => compareLikeChronology(b, a));
  return { merged, added };
}

function updateState(
  prev: LikesBackfillState,
  input: { added: number; seenIds: string[]; stopReason: string; lastRunAt?: string },
): LikesBackfillState {
  return {
    provider: 'twitter',
    lastRunAt: input.lastRunAt ?? new Date().toISOString(),
    totalRuns: prev.totalRuns + 1,
    totalAdded: prev.totalAdded + input.added,
    lastAdded: input.added,
    lastSeenIds: input.seenIds.slice(-20),
    stopReason: input.stopReason,
  };
}

async function fetchViewerId(csrfToken: string, cookieHeader?: string): Promise<string> {
  const response = await fetch(buildViewerUrl(), { headers: buildHeaders(csrfToken, cookieHeader) });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Viewer lookup failed (${response.status}).\nResponse: ${text.slice(0, 300)}`);
  }
  const json = await response.json();
  const userId = json?.data?.viewer?.user_results?.result?.rest_id;
  if (!userId) {
    throw new Error('Viewer lookup did not return a user id for the logged-in X session.');
  }
  return String(userId);
}

async function fetchPageWithRetry(csrfToken: string, userId: string, cursor?: string, cookieHeader?: string): Promise<LikesPageResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(buildUrl(userId, cursor), { headers: buildHeaders(csrfToken, cookieHeader) });
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
        `Likes API returned ${response.status}.\n` +
          `Response: ${text.slice(0, 300)}\n\n` +
          (response.status === 401 || response.status === 403
            ? 'Fix: Your X session may have expired. Open your browser, go to https://x.com, and make sure you are logged in. Then retry.'
            : 'This may be a temporary issue. Try again in a few minutes.')
      );
    }
    const json = await response.json();
    return parseLikesResponse(json);
  }

  throw lastError ?? new Error('Likes API: all retry attempts failed. Try again later.');
}

export async function syncLikesGraphQL(options: LikesSyncOptions = {}): Promise<LikesSyncResult> {
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
  const cachePath = twitterLikesCachePath();
  const metaPath = twitterLikesMetaPath();
  const statePath = twitterLikesBackfillStatePath();
  let existing = await loadExistingLikes();
  const previousMeta = (await pathExists(metaPath))
    ? await readJson<LikesCacheMeta>(metaPath)
    : undefined;
  const prevState: LikesBackfillState = (await pathExists(statePath))
    ? await readJson<LikesBackfillState>(statePath)
    : { provider: 'twitter', totalRuns: 0, totalAdded: 0, lastAdded: 0, lastSeenIds: [] };

  const started = Date.now();
  let page = 0;
  let totalAdded = 0;
  let stalePages = 0;
  let cursor: string | undefined;
  const allSeenIds: string[] = [];
  let stopReason = 'unknown';
  const userId = await fetchViewerId(csrfToken, cookieHeader);

  while (page < maxPages) {
    if (Date.now() - started > maxMinutes * 60_000) {
      stopReason = 'max runtime reached';
      break;
    }

    const result = await fetchPageWithRetry(csrfToken, userId, cursor, cookieHeader);
    page += 1;

    if (result.records.length === 0) {
      stopReason = 'end of likes';
      break;
    }

    const mergedResult = mergeLikes(existing, result.records);
    existing = mergedResult.merged;
    totalAdded += mergedResult.added;
    result.records.forEach((r) => allSeenIds.push(r.id));
    stalePages = mergedResult.added === 0 ? stalePages + 1 : 0;

    options.onProgress?.({
      page,
      totalFetched: allSeenIds.length,
      newAdded: totalAdded,
      running: true,
      done: false,
    });

    if (stalePages >= stalePageLimit) {
      stopReason = 'no new likes (stale)';
      break;
    }
    if (!result.nextCursor) {
      stopReason = 'end of likes';
      break;
    }

    if (page % checkpointEvery === 0) await writeJsonLines(cachePath, existing);
    cursor = result.nextCursor;
    if (page < maxPages) await new Promise((r) => setTimeout(r, delayMs));
  }

  if (stopReason === 'unknown') stopReason = page >= maxPages ? 'max pages reached' : 'unknown';

  const syncedAt = new Date().toISOString();
  await writeJsonLines(cachePath, existing);
  await writeJson(metaPath, {
    provider: 'twitter',
    schemaVersion: 1,
    lastFullSyncAt: syncedAt,
    lastIncrementalSyncAt: previousMeta?.lastIncrementalSyncAt,
    totalLikes: existing.length,
  } satisfies LikesCacheMeta);
  await writeJson(statePath, updateState(prevState, {
    added: totalAdded,
    seenIds: allSeenIds.slice(-20),
    stopReason,
    lastRunAt: syncedAt,
  }));

  options.onProgress?.({
    page,
    totalFetched: allSeenIds.length,
    newAdded: totalAdded,
    running: false,
    done: true,
    stopReason,
  });

  return { added: totalAdded, totalLikes: existing.length, pages: page, stopReason, cachePath, statePath };
}
