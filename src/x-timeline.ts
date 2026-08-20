import fs from 'node:fs';
import path from 'node:path';
import { extractChromeXCookies } from './chrome-cookies.js';
import { extractFirefoxXCookies } from './firefox-cookies.js';
import { loadChromeSessionConfig } from './config.js';
import { buildHeaders, convertTweetToRecord } from './graphql-bookmarks.js';
import { ensureDir, writeJson } from './fs.js';
import type { BookmarkEngagementSnapshot, BookmarkMediaObject, QuotedTweetSnapshot } from './types.js';

export type XTimelineKind = 'for-you' | 'following';

export interface XTimelineOperation {
  queryId: string;
  operationName: 'HomeTimeline' | 'HomeLatestTimeline';
  featureNames: string[];
  fieldToggleNames: string[];
  source: 'chrome-cache' | 'fallback';
}

export interface XTimelinePost {
  position: number;
  feed: XTimelineKind;
  id: string;
  url: string;
  text: string;
  authorHandle?: string;
  authorName?: string;
  authorProfileImageUrl?: string;
  postedAt?: string | null;
  sortIndex?: string | null;
  conversationId?: string;
  inReplyToStatusId?: string;
  quotedStatusId?: string;
  quotedPost?: QuotedTweetSnapshot;
  language?: string;
  engagement?: BookmarkEngagementSnapshot;
  media?: string[];
  mediaObjects?: BookmarkMediaObject[];
  links?: string[];
}

export interface XTimelineCapture {
  feed: XTimelineKind;
  requestedCount: number;
  retainedCount: number;
  excludedPromoted: number;
  excludedDuplicates: number;
  pagesFetched: number;
  startedAt: string;
  capturedAt: string;
  operation: XTimelineOperation;
  posts: XTimelinePost[];
  outputPath?: string;
}

export interface CaptureXTimelineOptions {
  limit?: number;
  pageSize?: number;
  maxPages?: number;
  delayMs?: number;
  browser?: string;
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  firefoxProfileDir?: string;
  csrfToken?: string;
  cookieHeader?: string;
  outputPath?: string;
  operation?: XTimelineOperation;
  fetcher?: typeof fetch;
}

interface ParsedTimelinePage {
  items: Array<{ tweetResult: any; sortIndex?: string | null; promoted: boolean }>;
  nextCursor?: string;
}

const FALLBACK_OPERATIONS: Record<XTimelineKind, XTimelineOperation> = {
  'for-you': {
    queryId: 'lqfNCpeO0wydVAAXAbAU5w',
    operationName: 'HomeTimeline',
    featureNames: [],
    fieldToggleNames: [],
    source: 'fallback',
  },
  following: {
    queryId: 'lyhT5o5ECF6_kYqTqpUUew',
    operationName: 'HomeLatestTimeline',
    featureNames: [],
    fieldToggleNames: [],
    source: 'fallback',
  },
};

const FEATURE_DEFAULTS: Record<string, boolean> = {
  verified_phone_label_enabled: false,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_text_conversations_enabled: false,
  responsive_web_enhance_cards_enabled: false,
  rweb_conversational_replies_downvote_enabled: false,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: false,
  responsive_web_grok_share_attachment_enabled: false,
  responsive_web_grok_annotations_enabled: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: false,
  responsive_web_grok_image_annotation_enabled: false,
  responsive_web_grok_imagine_annotation_enabled: false,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
};

const FALLBACK_FEATURE_NAMES = [
  'rweb_video_screen_enabled',
  'rweb_cashtags_enabled',
  'profile_label_improvements_pcf_label_in_post_enabled',
  'responsive_web_profile_redirect_enabled',
  'rweb_tipjar_consumption_enabled',
  'verified_phone_label_enabled',
  'creator_subscriptions_tweet_preview_api_enabled',
  'responsive_web_graphql_timeline_navigation_enabled',
  'responsive_web_graphql_skip_user_profile_image_extensions_enabled',
  'premium_content_api_read_enabled',
  'communities_web_enable_tweet_community_results_fetch',
  'c9s_tweet_anatomy_moderator_badge_enabled',
  'responsive_web_grok_analyze_button_fetch_trends_enabled',
  'responsive_web_grok_analyze_post_followups_enabled',
  'rweb_cashtags_composer_attachment_enabled',
  'responsive_web_jetfuel_frame',
  'responsive_web_grok_share_attachment_enabled',
  'responsive_web_grok_annotations_enabled',
  'articles_preview_enabled',
  'responsive_web_edit_tweet_api_enabled',
  'rweb_conversational_replies_downvote_enabled',
  'graphql_is_translatable_rweb_tweet_is_translatable_enabled',
  'view_counts_everywhere_api_enabled',
  'longform_notetweets_consumption_enabled',
  'responsive_web_twitter_article_tweet_consumption_enabled',
  'content_disclosure_indicator_enabled',
  'content_disclosure_ai_generated_indicator_enabled',
  'responsive_web_grok_show_grok_translated_post',
  'responsive_web_grok_analysis_button_from_backend',
  'post_ctas_fetch_enabled',
  'freedom_of_speech_not_reach_fetch_enabled',
  'standardized_nudges_misinfo',
  'tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled',
  'longform_notetweets_rich_text_read_enabled',
  'longform_notetweets_inline_media_enabled',
  'responsive_web_grok_image_annotation_enabled',
  'responsive_web_grok_imagine_annotation_enabled',
  'responsive_web_grok_community_note_auto_translation_is_enabled',
  'responsive_web_enhance_cards_enabled',
];

const FALLBACK_FIELD_TOGGLE_NAMES = [
  'withPayments',
  'withAuxiliaryUserLabels',
  'withArticleRichContentState',
  'withArticlePlainText',
  'withArticleSummaryText',
  'withArticleVoiceOver',
  'withGrokAnalyze',
  'withDisallowedReplyControls',
];

function operationNameFor(kind: XTimelineKind): XTimelineOperation['operationName'] {
  return kind === 'for-you' ? 'HomeTimeline' : 'HomeLatestTimeline';
}

function parseStringArray(source: string): string[] {
  try {
    return JSON.parse(`[${source}]`) as string[];
  } catch {
    return [];
  }
}

export function parseOperationMetadata(source: string, operationName: XTimelineOperation['operationName']): XTimelineOperation | null {
  const escaped = operationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `queryId:\"([^\"]+)\",operationName:\"${escaped}\",operationType:\"query\",metadata:\\{featureSwitches:\\[([^\\]]*)\\],fieldToggles:\\[([^\\]]*)\\]\\}`,
  );
  const match = source.match(pattern);
  if (!match) return null;
  return {
    queryId: match[1],
    operationName,
    featureNames: parseStringArray(match[2]),
    fieldToggleNames: parseStringArray(match[3]),
    source: 'chrome-cache',
  };
}

function newestCacheFiles(root: string): string[] {
  const candidates: Array<{ file: string; mtimeMs: number }> = [];
  const visit = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) {
        try {
          const stat = fs.statSync(file);
          if (stat.size >= 1_000 && stat.size <= 5_000_000) candidates.push({ file, mtimeMs: stat.mtimeMs });
        } catch {
          // Cache files can disappear while Chrome is updating them.
        }
      }
    }
  };
  visit(root);
  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 600).map((item) => item.file);
}

export function discoverTimelineOperation(kind: XTimelineKind, chromeUserDataDir: string, profileDirectory: string): XTimelineOperation {
  const operationName = operationNameFor(kind);
  const cacheRoot = path.join(chromeUserDataDir, profileDirectory, 'Service Worker', 'CacheStorage');
  for (const file of newestCacheFiles(cacheRoot)) {
    let source: string;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!source.includes(`operationName:\"${operationName}\"`)) continue;
    const found = parseOperationMetadata(source, operationName);
    if (found) return found;
  }
  return {
    ...FALLBACK_OPERATIONS[kind],
    featureNames: FALLBACK_FEATURE_NAMES,
    fieldToggleNames: FALLBACK_FIELD_TOGGLE_NAMES,
  };
}

function featureValues(names: string[]): Record<string, boolean> {
  const effective = names.length > 0 ? names : FALLBACK_FEATURE_NAMES;
  return Object.fromEntries(effective.map((name) => [name, FEATURE_DEFAULTS[name] ?? true]));
}

function fieldToggleValues(names: string[]): Record<string, boolean> {
  const effective = names.length > 0 ? names : FALLBACK_FIELD_TOGGLE_NAMES;
  return Object.fromEntries(effective.map((name) => [name, false]));
}

export function buildTimelineUrl(
  kind: XTimelineKind,
  operation: XTimelineOperation,
  count: number,
  cursor?: string,
  seenTweetIds: string[] = [],
): string {
  const variables: Record<string, unknown> = {
    count,
    includePromotedContent: true,
    latestControlAvailable: true,
    requestContext: 'launch',
    withCommunity: true,
  };
  if (cursor) variables.cursor = cursor;
  if (seenTweetIds.length > 0) variables.seenTweetIds = seenTweetIds;
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(featureValues(operation.featureNames)),
    fieldToggles: JSON.stringify(fieldToggleValues(operation.fieldToggleNames)),
  });
  return `https://x.com/i/api/graphql/${operation.queryId}/${operationNameFor(kind)}?${params}`;
}

function timelineInstructions(json: any): any[] {
  return json?.data?.home?.home_timeline_urt?.instructions
    ?? json?.data?.home?.home_timeline?.instructions
    ?? [];
}

function itemContents(content: any): any[] {
  const items: any[] = [];
  if (content?.itemContent) items.push(content.itemContent);
  if (content?.item?.itemContent) items.push(content.item.itemContent);
  const moduleItems = content?.items ?? content?.timelineModule?.items ?? [];
  if (Array.isArray(moduleItems)) {
    for (const moduleItem of moduleItems) {
      const itemContent = moduleItem?.item?.itemContent ?? moduleItem?.itemContent;
      if (itemContent) items.push(itemContent);
    }
  }
  return items;
}

function isPromoted(entryId: unknown, content: any, itemContent: any): boolean {
  return Boolean(
    (typeof entryId === 'string' && entryId.toLowerCase().startsWith('promoted-'))
    || content?.promotedMetadata
    || content?.promoted_metadata
    || itemContent?.promotedMetadata
    || itemContent?.promoted_metadata,
  );
}

export function parseTimelineResponse(json: any): ParsedTimelinePage {
  const entries: any[] = [];
  for (const instruction of timelineInstructions(json)) {
    if (instruction?.type === 'TimelineAddEntries' && Array.isArray(instruction.entries)) {
      entries.push(...instruction.entries);
    } else if (instruction?.type === 'TimelineReplaceEntry' && instruction.entry) {
      entries.push(instruction.entry);
    } else if (instruction?.type === 'TimelineAddToModule' && Array.isArray(instruction.moduleItems)) {
      entries.push(...instruction.moduleItems.map((item: any) => ({
        entryId: item?.entryId,
        content: item?.item ?? item,
        sortIndex: item?.sortIndex,
      })));
    }
  }

  const items: ParsedTimelinePage['items'] = [];
  let nextCursor: string | undefined;
  for (const entry of entries) {
    const content = entry?.content ?? entry?.item;
    const cursorType = content?.cursorType ?? content?.cursor_type;
    if (entry?.entryId?.startsWith('cursor-bottom') || cursorType === 'Bottom') {
      nextCursor = content?.value;
      continue;
    }
    for (const itemContent of itemContents(content)) {
      const tweetResult = itemContent?.tweet_results?.result;
      if (!tweetResult) continue;
      items.push({
        tweetResult,
        sortIndex: typeof entry?.sortIndex === 'string' ? entry.sortIndex : null,
        promoted: isPromoted(entry?.entryId, content, itemContent),
      });
    }
  }
  return { items, nextCursor };
}

function toTimelinePost(
  kind: XTimelineKind,
  tweetResult: any,
  sortIndex: string | null | undefined,
  capturedAt: string,
): XTimelinePost | null {
  const record = convertTweetToRecord(tweetResult, capturedAt);
  if (!record) return null;
  return {
    position: 0,
    feed: kind,
    id: record.id,
    url: record.url,
    text: record.text,
    authorHandle: record.authorHandle,
    authorName: record.authorName,
    authorProfileImageUrl: record.authorProfileImageUrl,
    postedAt: record.postedAt,
    sortIndex,
    conversationId: record.conversationId,
    inReplyToStatusId: record.inReplyToStatusId,
    quotedStatusId: record.quotedStatusId,
    quotedPost: record.quotedTweet,
    language: record.language,
    engagement: record.engagement,
    media: record.media,
    mediaObjects: record.mediaObjects,
    links: record.links,
  };
}

function parseRetryAfterSec(response: Response): number | undefined {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter);
  const resetAt = Number(response.headers.get('x-rate-limit-reset'));
  if (Number.isFinite(resetAt) && resetAt > 0) {
    const seconds = Math.ceil(resetAt - Date.now() / 1000);
    if (seconds > 0) return seconds;
  }
  return undefined;
}

async function fetchTimelinePage(
  fetcher: typeof fetch,
  url: string,
  headers: Record<string, string>,
): Promise<ParsedTimelinePage> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetcher(url, { headers });
    if (response.status === 429) {
      const waitSec = parseRetryAfterSec(response) ?? Math.min(15 * 2 ** attempt, 120);
      lastError = new Error(`X GraphQL rate limited the timeline request (429). Retry after about ${waitSec} seconds.`);
      await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
      continue;
    }
    if (response.status >= 500) {
      lastError = new Error(`X GraphQL timeline request failed with ${response.status}.`);
      await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(
        `X GraphQL timeline request returned ${response.status}: ${detail}\n` +
        'Open x.com in the selected browser and confirm that the session is still logged in. The CLI will not fall back to Computer Use or the official X API.',
      );
    }
    return parseTimelineResponse(await response.json());
  }
  throw lastError ?? new Error('X GraphQL timeline request failed after four attempts.');
}

export async function captureXTimeline(kind: XTimelineKind, options: CaptureXTimelineOptions = {}): Promise<XTimelineCapture> {
  const limit = options.limit ?? 300;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Timeline limit must be a positive integer.');
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 40, 100));
  const maxPages = options.maxPages ?? 50;
  const delayMs = options.delayMs ?? 500;
  const startedAt = new Date().toISOString();

  let csrfToken = options.csrfToken;
  let cookieHeader = options.cookieHeader;
  let chromeUserDataDir = options.chromeUserDataDir;
  let chromeProfileDirectory = options.chromeProfileDirectory ?? 'Default';
  let operation = options.operation;

  if (!csrfToken) {
    const config = loadChromeSessionConfig({ browserId: options.browser });
    if (config.browser.cookieBackend === 'firefox') {
      const cookies = extractFirefoxXCookies(options.firefoxProfileDir);
      csrfToken = cookies.csrfToken;
      cookieHeader = cookies.cookieHeader;
    } else {
      chromeUserDataDir = chromeUserDataDir ?? config.chromeUserDataDir;
      chromeProfileDirectory = options.chromeProfileDirectory ?? config.chromeProfileDirectory;
      const cookies = extractChromeXCookies(chromeUserDataDir, chromeProfileDirectory, config.browser);
      csrfToken = cookies.csrfToken;
      cookieHeader = cookies.cookieHeader;
    }
  }

  if (!operation) {
    operation = chromeUserDataDir
      ? discoverTimelineOperation(kind, chromeUserDataDir, chromeProfileDirectory)
      : {
          ...FALLBACK_OPERATIONS[kind],
          featureNames: FALLBACK_FEATURE_NAMES,
          fieldToggleNames: FALLBACK_FIELD_TOGGLE_NAMES,
        };
  }

  const headers = buildHeaders(csrfToken, cookieHeader);
  const posts: XTimelinePost[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let pagesFetched = 0;
  let excludedPromoted = 0;
  let excludedDuplicates = 0;
  const seenCursors = new Set<string>();

  while (posts.length < limit && pagesFetched < maxPages) {
    const url = buildTimelineUrl(kind, operation, pageSize, cursor, Array.from(seen).slice(-100));
    const page = await fetchTimelinePage(options.fetcher ?? fetch, url, headers);
    pagesFetched += 1;
    const capturedAt = new Date().toISOString();
    for (const item of page.items) {
      const post = toTimelinePost(kind, item.tweetResult, item.sortIndex, capturedAt);
      if (!post) continue;
      if (item.promoted) {
        excludedPromoted += 1;
        continue;
      }
      if (seen.has(post.id)) {
        excludedDuplicates += 1;
        continue;
      }
      seen.add(post.id);
      post.position = posts.length + 1;
      posts.push(post);
      if (posts.length === limit) break;
    }
    const nextCursor = page.nextCursor;
    if (posts.length >= limit || !nextCursor) break;
    if (seenCursors.has(nextCursor)) {
      throw new Error(`X GraphQL returned the same ${kind} pagination cursor twice after ${pagesFetched} pages. The partial sample was not reported as complete.`);
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  if (posts.length !== limit) {
    throw new Error(
      `Timeline capture retained ${posts.length} of ${limit} requested ${kind} posts after ${pagesFetched} pages ` +
      `(${excludedPromoted} promoted and ${excludedDuplicates} duplicate posts excluded). ` +
      'No partial sample was reported as complete.',
    );
  }

  const result: XTimelineCapture = {
    feed: kind,
    requestedCount: limit,
    retainedCount: posts.length,
    excludedPromoted,
    excludedDuplicates,
    pagesFetched,
    startedAt,
    capturedAt: new Date().toISOString(),
    operation,
    posts,
  };
  if (options.outputPath) {
    const outputPath = path.resolve(options.outputPath);
    await ensureDir(path.dirname(outputPath));
    result.outputPath = outputPath;
    await writeJson(outputPath, result);
  }
  return result;
}
