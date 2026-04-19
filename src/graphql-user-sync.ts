/**
 * Generic GraphQL sync engine for user-scoped timelines (likes, user tweets)
 * and the authenticated user's home feed (Following/chronological).
 *
 * - likes / timeline: require a userId resolved from screenName.
 * - feed: uses the authenticated session directly (no userId needed).
 */
import { readJsonLines, writeJsonLines, readJson, writeJson, pathExists } from './fs.js';
import { ensureDataDir } from './paths.js';
import { loadChromeSessionConfig } from './config.js';
import { extractChromeXCookies } from './chrome-cookies.js';
import { extractFirefoxXCookies } from './firefox-cookies.js';
import {
  convertTweetToRecord,
  mergeRecords,
  snowflakeToIso,
  parseSnowflake,
  CHROME_UA,
  X_PUBLIC_BEARER,
  buildHeaders,
  type SyncOptions,
  type SyncProgress,
  type SyncResult,
} from './graphql-bookmarks.js';
import type { BookmarkBackfillState, BookmarkCacheMeta, BookmarkRecord } from './types.js';

// ── Query IDs (extracted from X's JS bundles, April 2026) ──────────

const LIKES_QUERY_ID = 'KPuet6dGbC8LB2sOLx7tZQ';
const LIKES_OPERATION = 'Likes';

const USER_TWEETS_QUERY_ID = 'x3B_xLqC0yZawOB7WQhaVQ';
const USER_TWEETS_OPERATION = 'UserTweets';

const FEED_QUERY_ID = '2ee46L1AFXmnTa0EvUog-Q';
const FEED_OPERATION = 'HomeLatestTimeline';

const USER_BY_SCREEN_NAME_QUERY_ID = 'IGgvgiOx4QZndDHuD3x9TQ';
const USER_BY_SCREEN_NAME_OPERATION = 'UserByScreenName';

// Feature flags shared by user timeline queries
const USER_TIMELINE_FEATURES = {
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
  responsive_web_grok_analyze_post_followups_enabled: false,
  responsive_web_grok_share_attachment_enabled: false,
  responsive_web_grok_annotations_enabled: false,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

const USER_BY_SCREEN_NAME_FEATURES = {
  hidden_profile_subscriptions_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  subscriptions_verification_info_is_identity_verified_enabled: true,
  subscriptions_verification_info_verified_since_enabled: true,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  subscriptions_feature_can_gift_premium: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
};

export type UserSyncType = 'likes' | 'timeline' | 'feed';

interface UserSyncConfig {
  queryId: string;
  operationName: string;
  cachePath: string;
  metaPath: string;
  statePath: string;
  ingestedVia: BookmarkRecord['ingestedVia'];
  label: string;
  /** true when the endpoint does not require a userId (e.g. home feed). */
  sessionScoped: boolean;
}

function getConfig(type: UserSyncType, paths: { cache: string; meta: string; state: string }): UserSyncConfig {
  if (type === 'likes') {
    return {
      queryId: LIKES_QUERY_ID,
      operationName: LIKES_OPERATION,
      cachePath: paths.cache,
      metaPath: paths.meta,
      statePath: paths.state,
      ingestedVia: 'graphql-likes',
      label: 'likes',
      sessionScoped: false,
    };
  }
  if (type === 'feed') {
    return {
      queryId: FEED_QUERY_ID,
      operationName: FEED_OPERATION,
      cachePath: paths.cache,
      metaPath: paths.meta,
      statePath: paths.state,
      ingestedVia: 'graphql-feed',
      label: 'feed items',
      sessionScoped: true,
    };
  }
  return {
    queryId: USER_TWEETS_QUERY_ID,
    operationName: USER_TWEETS_OPERATION,
    cachePath: paths.cache,
    metaPath: paths.meta,
    statePath: paths.state,
    ingestedVia: 'graphql-timeline',
    label: 'tweets',
    sessionScoped: false,
  };
}

// ── Resolve userId from screen name ────────────────────────────────

function buildUserByScreenNameUrl(screenName: string): string {
  const variables = { screen_name: screenName, withSafetyModeUserFields: true };
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(USER_BY_SCREEN_NAME_FEATURES),
    fieldToggles: JSON.stringify({ withAuxiliaryUserLabels: false }),
  });
  return `https://x.com/i/api/graphql/${USER_BY_SCREEN_NAME_QUERY_ID}/${USER_BY_SCREEN_NAME_OPERATION}?${params}`;
}

async function resolveUserId(
  screenName: string,
  csrfToken: string,
  cookieHeader?: string
): Promise<string> {
  const url = buildUserByScreenNameUrl(screenName);
  const response = await fetch(url, { headers: buildHeaders(csrfToken, cookieHeader) });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to resolve userId for @${screenName}: HTTP ${response.status}\n${text.slice(0, 300)}`
    );
  }
  const json = (await response.json()) as any;
  const userId = json?.data?.user?.result?.rest_id;
  if (!userId) {
    throw new Error(`Could not find userId for @${screenName}. Make sure the account exists and is not suspended.`);
  }
  return userId;
}

// ── GraphQL request helpers ────────────────────────────────────────

function buildUserTimelineUrl(config: UserSyncConfig, userId: string, cursor?: string): string {
  const variables: Record<string, unknown> = {
    userId,
    count: 20,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: true,
    withV2Timeline: true,
  };
  if (cursor) variables.cursor = cursor;
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(USER_TIMELINE_FEATURES),
    fieldToggles: JSON.stringify({ withArticlePlainText: false }),
  });
  return `https://x.com/i/api/graphql/${config.queryId}/${config.operationName}?${params}`;
}

function buildFeedUrl(config: UserSyncConfig, cursor?: string): string {
  const variables: Record<string, unknown> = {
    count: 20,
    includePromotedContent: false,
    latestControlAvailable: true,
    requestContext: 'launch',
  };
  if (cursor) variables.cursor = cursor;
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(USER_TIMELINE_FEATURES),
    fieldToggles: JSON.stringify({ withArticlePlainText: false }),
  });
  return `https://x.com/i/api/graphql/${config.queryId}/${config.operationName}?${params}`;
}

function buildRequestUrl(config: UserSyncConfig, userId: string | undefined, cursor?: string): string {
  if (config.sessionScoped) {
    return buildFeedUrl(config, cursor);
  }
  if (!userId) {
    throw new Error(`userId is required for ${config.operationName}`);
  }
  return buildUserTimelineUrl(config, userId, cursor);
}

// ── Response parsing ───────────────────────────────────────────────

interface PageResult {
  records: BookmarkRecord[];
  nextCursor?: string;
}

export function parseUserTimelineResponse(json: any, ingestedVia: BookmarkRecord['ingestedVia'], now?: string): PageResult {
  const ts = now ?? new Date().toISOString();

  // User timeline responses nest under data.user.result.timeline_v2.timeline
  // Home feed responses nest under data.home.home_timeline_urt
  const timeline = json?.data?.user?.result?.timeline_v2?.timeline
    ?? json?.data?.user?.result?.timeline?.timeline;
  const instructions = timeline?.instructions
    ?? json?.data?.home?.home_timeline_urt?.instructions
    ?? [];

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

    // User timeline entries can be nested under itemContent or items (for conversation modules)
    const tweetResult =
      entry?.content?.itemContent?.tweet_results?.result
      ?? entry?.content?.items?.[0]?.item?.itemContent?.tweet_results?.result;
    if (!tweetResult) continue;

    const record = convertTweetToRecord(tweetResult, ts);
    if (record) {
      record.ingestedVia = ingestedVia;
      if (ingestedVia === 'graphql-likes' && entry.sortIndex) {
        // sortIndex on likes entries is a snowflake for when the like happened
        record.likedAt = snowflakeToIso(entry.sortIndex) ?? entry.sortIndex;
      }
      records.push(record);
    }
  }

  return { records, nextCursor };
}

// ── Fetch with retry ───────────────────────────────────────────────

async function fetchPageWithRetry(
  config: UserSyncConfig,
  userId: string | undefined,
  csrfToken: string,
  cursor?: string,
  cookieHeader?: string
): Promise<PageResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(buildRequestUrl(config, userId, cursor), {
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
        `GraphQL ${config.operationName} API returned ${response.status}.\n` +
          `Response: ${text.slice(0, 300)}\n\n` +
          (response.status === 401 || response.status === 403
            ? 'Fix: Your X session may have expired. Open your browser, go to https://x.com, and make sure you are logged in. Then retry.'
            : 'This may be a temporary issue. Try again in a few minutes.')
      );
    }

    const json = await response.json();
    return parseUserTimelineResponse(json, config.ingestedVia);
  }

  throw lastError ?? new Error(`GraphQL ${config.operationName} API: all retry attempts failed.`);
}

// ── Extract cookies (shared logic) ─────────────────────────────────

function extractCookies(options: SyncOptions): { csrfToken: string; cookieHeader?: string } {
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

// ── Main sync function ─────────────────────────────────────────────

export interface UserSyncOptions extends SyncOptions {
  /** X screen name (without @) — required for likes/timeline, unused for feed. */
  screenName?: string;
}

export async function syncUserTimeline(
  type: UserSyncType,
  paths: { cache: string; meta: string; state: string },
  options: UserSyncOptions
): Promise<SyncResult> {
  const config = getConfig(type, paths);
  const incremental = options.incremental ?? true;
  const maxPages = options.maxPages ?? 500;
  const delayMs = options.delayMs ?? 600;
  const maxMinutes = options.maxMinutes ?? 30;
  const stalePageLimit = options.stalePageLimit ?? 3;
  const checkpointEvery = options.checkpointEvery ?? 25;

  const { csrfToken, cookieHeader } = extractCookies(options);

  ensureDataDir();

  // Resolve userId from screen name (only for likes/timeline)
  let userId: string | undefined;
  if (!config.sessionScoped) {
    if (!options.screenName) {
      throw new Error(`screenName is required for ${type} sync`);
    }
    userId = await resolveUserId(options.screenName, csrfToken, cookieHeader);
  }

  // Load existing records
  let existing: BookmarkRecord[] = [];
  if (await pathExists(config.cachePath)) {
    existing = await readJsonLines<BookmarkRecord>(config.cachePath);
  }

  const newestKnownId = incremental
    ? existing.slice().sort((a, b) => {
        const aId = parseSnowflake(a.tweetId) ?? 0n;
        const bId = parseSnowflake(b.tweetId) ?? 0n;
        return aId > bId ? -1 : aId < bId ? 1 : 0;
      })[0]?.id
    : undefined;

  const previousMeta = (await pathExists(config.metaPath))
    ? await readJson<BookmarkCacheMeta>(config.metaPath)
    : undefined;
  const prevState: BookmarkBackfillState = (await pathExists(config.statePath))
    ? await readJson<BookmarkBackfillState>(config.statePath)
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

    const result = await fetchPageWithRetry(config, userId, csrfToken, cursor, cookieHeader);
    page += 1;

    if (result.records.length === 0 && !result.nextCursor) {
      stopReason = `end of ${config.label}`;
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
    if (reachedLatestStored) {
      stopReason = `caught up to newest stored ${config.label === 'likes' ? 'like' : config.label === 'tweets' ? 'tweet' : 'feed item'}`;
      break;
    }
    if (stalePages >= stalePageLimit) {
      stopReason = `no new ${config.label} (stale)`;
      break;
    }
    if (!result.nextCursor) {
      stopReason = `end of ${config.label}`;
      break;
    }

    if (page % checkpointEvery === 0) await writeJsonLines(config.cachePath, existing);

    cursor = result.nextCursor;
    if (page < maxPages) await new Promise((r) => setTimeout(r, delayMs));
  }

  if (stopReason === 'unknown') stopReason = page >= maxPages ? 'max pages reached' : 'unknown';

  const syncedAt = new Date().toISOString();
  await writeJsonLines(config.cachePath, existing);
  await writeJson(config.metaPath, {
    provider: 'twitter',
    schemaVersion: 1,
    lastFullSyncAt: incremental ? previousMeta?.lastFullSyncAt : syncedAt,
    lastIncrementalSyncAt: incremental ? syncedAt : previousMeta?.lastIncrementalSyncAt,
    totalBookmarks: existing.length,
  } satisfies BookmarkCacheMeta);
  await writeJson(config.statePath, {
    provider: 'twitter',
    lastRunAt: syncedAt,
    totalRuns: prevState.totalRuns + 1,
    totalAdded: prevState.totalAdded + totalAdded,
    lastAdded: totalAdded,
    lastSeenIds: allSeenIds.slice(-20),
    stopReason,
  } satisfies BookmarkBackfillState);

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
    bookmarkedAtRepaired: 0,
    totalBookmarks: existing.length,
    bookmarkedAtMissing: 0,
    pages: page,
    stopReason,
    cachePath: config.cachePath,
    statePath: config.statePath,
  };
}