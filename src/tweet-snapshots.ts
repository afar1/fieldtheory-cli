import { parseTimestampMs } from './date-utils.js';
import type { ThreadTweetSnapshot } from './types.js';

export function parseSnowflake(value?: string | null): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function urlEntityKey(entity: any): string {
  return String(entity?.url ?? entity?.expanded_url ?? entity?.expandedUrl ?? entity?.display_url ?? entity?.displayUrl ?? '');
}

export function tweetUrlEntities(tweet: any, legacy: any): any[] {
  const entities = [
    ...(Array.isArray(legacy?.entities?.urls) ? legacy.entities.urls : []),
    ...(Array.isArray(tweet?.note_tweet?.note_tweet_results?.result?.entity_set?.urls)
      ? tweet.note_tweet.note_tweet_results.result.entity_set.urls
      : []),
  ];
  const seen = new Set<string>();
  return entities.filter((entity) => {
    const key = urlEntityKey(entity);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function syndicationUrlEntities(data: any): any[] {
  return Array.isArray(data?.entities?.urls) ? data.entities.urls : [];
}

export function extractExpandedLinks(urlEntities: any[]): string[] {
  return uniqueStrings(
    urlEntities
      .map((entity) => entity?.expanded_url ?? entity?.expandedUrl ?? entity?.url)
      .filter((url): url is string => typeof url === 'string' && url.length > 0 && !url.includes('t.co/')),
  );
}

function urlEntityReplacement(entity: any): string | undefined {
  const expanded = entity?.expanded_url ?? entity?.expandedUrl;
  if (typeof expanded === 'string' && expanded.length > 0 && !expanded.includes('t.co/')) return expanded;
  const display = entity?.display_url ?? entity?.displayUrl;
  if (typeof display === 'string' && display.length > 0 && !display.includes('t.co/')) return display;
  return undefined;
}

export function expandVisibleUrlEntities(text: string, urlEntities: any[]): string {
  let expanded = text;
  for (const entity of urlEntities) {
    if (typeof entity?.url !== 'string') continue;
    const replacement = urlEntityReplacement(entity);
    if (!replacement) continue;
    expanded = expanded.split(entity.url).join(replacement);
  }
  return expanded;
}

export function compareThreadTweetsChronologically(a: ThreadTweetSnapshot, b: ThreadTweetSnapshot): number {
  const aId = parseSnowflake(a.id);
  const bId = parseSnowflake(b.id);
  if (aId != null && bId != null && aId !== bId) return aId < bId ? -1 : 1;
  const aTime = parseTimestampMs(a.postedAt);
  const bTime = parseTimestampMs(b.postedAt);
  if (aTime != null && bTime != null && aTime !== bTime) return aTime - bTime;
  return a.id.localeCompare(b.id);
}

function parseThreadTweetResult(
  value: any,
  fallbackId?: string,
  metadata: Partial<ThreadTweetSnapshot> = {},
): ThreadTweetSnapshot | null {
  const tweet = value?.tweet ?? value;
  const legacy = tweet?.legacy;
  if (!legacy) return null;

  const urlEntities = tweetUrlEntities(tweet, legacy);
  const noteText = tweet?.note_tweet?.note_tweet_results?.result?.text;
  const text = expandVisibleUrlEntities(noteText ?? legacy.full_text ?? legacy.text ?? '', urlEntities);
  const resolvedId = String(legacy.id_str ?? tweet?.rest_id ?? fallbackId ?? '');
  if (!resolvedId || !text) return null;

  const userResult = tweet?.core?.user_results?.result;
  const handle = userResult?.core?.screen_name ?? userResult?.legacy?.screen_name;
  const mediaEntities: any[] = legacy?.extended_entities?.media ?? legacy?.entities?.media ?? [];

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
      altText: m.ext_alt_text,
      videoVariants: Array.isArray(m.video_info?.variants)
        ? m.video_info.variants
            .filter((v: any) => v.content_type === 'video/mp4')
            .map((v: any) => ({ bitrate: v.bitrate, url: v.url }))
        : undefined,
    })),
    links: extractExpandedLinks(urlEntities),
    conversationId: legacy.conversation_id_str,
    inReplyToStatusId: legacy.in_reply_to_status_id_str,
    ...metadata,
    url: `https://x.com/${handle ?? '_'}/status/${resolvedId}`,
  };
}

export function parseThreadTweetResultByRestId(json: any, tweetId: string): ThreadTweetSnapshot | null {
  const result = json?.data?.tweetResult?.result;
  if (!result) return null;
  return parseThreadTweetResult(result, tweetId);
}

function sameHandle(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function conversationSection(content: any): string | undefined {
  return content?.clientEventInfo?.details?.conversationDetails?.conversationSection;
}

function isUnavailableTweetResult(result: any): boolean {
  const typename = result?.__typename ?? result?.tweet?.__typename;
  return typename === 'TweetTombstone' || typename === 'TweetUnavailable';
}

interface CollectThreadResult {
  nextCursor?: string;
  sawTweetResult: boolean;
  sawUnavailableTweet: boolean;
  sawUnparseableTweet: boolean;
}

function emptyCollectThreadResult(): CollectThreadResult {
  return {
    sawTweetResult: false,
    sawUnavailableTweet: false,
    sawUnparseableTweet: false,
  };
}

function mergeCollectThreadResult(target: CollectThreadResult, source: CollectThreadResult): void {
  target.nextCursor = source.nextCursor ?? target.nextCursor;
  target.sawTweetResult = target.sawTweetResult || source.sawTweetResult;
  target.sawUnavailableTweet = target.sawUnavailableTweet || source.sawUnavailableTweet;
  target.sawUnparseableTweet = target.sawUnparseableTweet || source.sawUnparseableTweet;
}

function parseResultInto(
  result: any,
  tweets: ThreadTweetSnapshot[],
  fallbackId?: string,
  metadata: Partial<ThreadTweetSnapshot> = {},
): Pick<CollectThreadResult, 'sawTweetResult' | 'sawUnavailableTweet' | 'sawUnparseableTweet'> {
  if (!result) {
    return { sawTweetResult: false, sawUnavailableTweet: false, sawUnparseableTweet: false };
  }

  if (isUnavailableTweetResult(result)) {
    return { sawTweetResult: true, sawUnavailableTweet: true, sawUnparseableTweet: false };
  }

  const snapshot = parseThreadTweetResult(result, fallbackId, metadata);
  if (!snapshot) {
    return { sawTweetResult: true, sawUnavailableTweet: false, sawUnparseableTweet: true };
  }

  tweets.push(snapshot);
  return { sawTweetResult: true, sawUnavailableTweet: false, sawUnparseableTweet: false };
}

function collectThreadEntries(entries: any[], out: ThreadTweetSnapshot[]): CollectThreadResult {
  const result = emptyCollectThreadResult();
  for (const entry of entries) {
    if (entry?.entryId?.startsWith('cursor-bottom')) {
      result.nextCursor = entry?.content?.value;
      continue;
    }

    const direct = entry?.content?.itemContent?.tweet_results?.result;
    const directParsed = parseResultInto(direct, out);
    result.sawTweetResult = result.sawTweetResult || directParsed.sawTweetResult;
    result.sawUnavailableTweet = result.sawUnavailableTweet || directParsed.sawUnavailableTweet;
    result.sawUnparseableTweet = result.sawUnparseableTweet || directParsed.sawUnparseableTweet;

    const moduleItems = entry?.content?.items;
    if (Array.isArray(moduleItems)) {
      const moduleSnapshots: ThreadTweetSnapshot[] = [];
      for (let index = 0; index < moduleItems.length; index++) {
        const item = moduleItems[index];
        const itemResult = item?.item?.itemContent?.tweet_results?.result;
        const parsed = parseResultInto(itemResult, moduleSnapshots, undefined, {
          conversationEntryId: entry.entryId,
          conversationDisplayType: entry?.content?.displayType,
          conversationSection: conversationSection(entry.content),
          conversationItemIndex: index,
        });
        result.sawTweetResult = result.sawTweetResult || parsed.sawTweetResult;
        result.sawUnavailableTweet = result.sawUnavailableTweet || parsed.sawUnavailableTweet;
        result.sawUnparseableTweet = result.sawUnparseableTweet || parsed.sawUnparseableTweet;
      }
      const rootId = moduleSnapshots[0]?.id;
      for (const snapshot of moduleSnapshots) {
        if (rootId) snapshot.conversationRootId = rootId;
        out.push(snapshot);
      }
    }
  }
  return result;
}

export interface TweetDetailParseResult {
  tweets: ThreadTweetSnapshot[];
  nextCursor?: string;
  recognizedTimeline: boolean;
  sawTweetResult: boolean;
  sawUnavailableTweet: boolean;
  sawUnparseableTweet: boolean;
}

export function parseTweetDetailResponse(json: any): TweetDetailParseResult {
  const instructionsValue = json?.data?.threaded_conversation_with_injections_v2?.instructions;
  const recognizedTimeline = Array.isArray(instructionsValue);
  const instructions = recognizedTimeline ? instructionsValue : [];
  const tweets: ThreadTweetSnapshot[] = [];
  const collectResult = emptyCollectThreadResult();

  for (const instruction of instructions) {
    if (instruction?.type === 'TimelineAddEntries' && Array.isArray(instruction.entries)) {
      mergeCollectThreadResult(collectResult, collectThreadEntries(instruction.entries, tweets));
    }
    if (instruction?.type === 'TimelinePinEntry' && instruction.entry) {
      mergeCollectThreadResult(collectResult, collectThreadEntries([instruction.entry], tweets));
    }
  }

  const byId = new Map<string, ThreadTweetSnapshot>();
  for (const tweet of tweets) {
    if (!byId.has(tweet.id)) byId.set(tweet.id, tweet);
  }
  return {
    tweets: Array.from(byId.values()).sort(compareThreadTweetsChronologically),
    nextCursor: collectResult.nextCursor,
    recognizedTimeline,
    sawTweetResult: collectResult.sawTweetResult,
    sawUnavailableTweet: collectResult.sawUnavailableTweet,
    sawUnparseableTweet: collectResult.sawUnparseableTweet,
  };
}

export function extractSameAuthorThreadBelow(
  tweets: ThreadTweetSnapshot[],
  focalTweetId: string,
  focalAuthorHandle?: string,
): ThreadTweetSnapshot[] {
  const focal = tweets.find((tweet) => tweet.id === focalTweetId);
  const authorHandle = focalAuthorHandle ?? focal?.authorHandle;
  if (!authorHandle) return [];

  const chainIds = new Set<string>([focalTweetId]);
  const below: ThreadTweetSnapshot[] = [];
  const sorted = tweets
    .filter((tweet) => tweet.id !== focalTweetId && sameHandle(tweet.authorHandle, authorHandle))
    .sort(compareThreadTweetsChronologically);

  for (const tweet of sorted) {
    if (!tweet.inReplyToStatusId || !chainIds.has(tweet.inReplyToStatusId)) continue;
    below.push({ ...tweet, threadRole: 'post-thread' });
    chainIds.add(tweet.id);
  }

  return below;
}
