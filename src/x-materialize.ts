import {
  fetchTweetByIdViaGraphQL,
  fetchTweetDetailViaGraphQL,
  type TweetFetchResult,
} from './graphql-bookmarks.js';
import { extractSameAuthorThreadBelow } from './tweet-snapshots.js';
import type { BookmarkRecord, ThreadTweetSnapshot } from './types.js';

export interface ExactXRefreshObservation {
  status: 'complete' | 'partial' | 'unavailable';
  root_status: TweetFetchResult['status'];
  parent_status: TweetFetchResult['status'];
  continuation_status: TweetFetchResult['status'];
  continuation_enumeration_complete: boolean;
  quote_status: TweetFetchResult['status'];
  article_status: 'ok' | 'not_applicable' | 'unresolved';
  parent_limit_reached: boolean;
}

export interface ExactXRefreshResult {
  record: BookmarkRecord;
  observation: ExactXRefreshObservation;
}

export interface ExactXRefreshOptions {
  csrfToken: string;
  cookieHeader?: string;
  delayMs?: number;
  maxParents?: number;
  maxPages?: number;
  now?: string;
}

function hasXArticleIdentity(record: BookmarkRecord): boolean {
  return Boolean(
    record.articleTitle
    || record.articleSite
    || record.links?.some((value) => {
      try {
        const parsed = new URL(value);
        return (parsed.hostname === 'x.com' || parsed.hostname === 'twitter.com')
          && parsed.pathname.startsWith('/i/article/');
      } catch {
        return false;
      }
    }),
  );
}

function refreshedRoot(record: BookmarkRecord, result: TweetFetchResult): BookmarkRecord {
  const snapshot = result.snapshot;
  if (!snapshot) return record;
  return {
    ...record,
    id: record.id,
    tweetId: record.tweetId,
    url: snapshot.url || record.url,
    text: snapshot.text || record.text,
    authorHandle: snapshot.authorHandle ?? record.authorHandle,
    authorName: snapshot.authorName ?? record.authorName,
    authorProfileImageUrl: snapshot.authorProfileImageUrl ?? record.authorProfileImageUrl,
    postedAt: snapshot.postedAt ?? record.postedAt,
    conversationId: snapshot.conversationId ?? record.conversationId,
    inReplyToStatusId: snapshot.inReplyToStatusId ?? record.inReplyToStatusId,
    media: snapshot.media ?? record.media,
    mediaObjects: snapshot.mediaObjects ?? record.mediaObjects,
    links: snapshot.links ?? record.links,
    articleTitle: result.article?.title ?? record.articleTitle,
    articleText: result.article?.text ?? null,
    articleSite: result.article?.siteName ?? record.articleSite,
  };
}

export async function refreshExactXBookmark(
  archived: BookmarkRecord,
  options: ExactXRefreshOptions,
): Promise<ExactXRefreshResult> {
  const delayMs = options.delayMs ?? 300;
  const maxParents = options.maxParents ?? 25;
  const root = await fetchTweetByIdViaGraphQL(
    archived.tweetId,
    options.csrfToken,
    options.cookieHeader,
  );
  if (root.status !== 'ok' || !root.snapshot) {
    return {
      record: archived,
      observation: {
        status: 'unavailable',
        root_status: root.status,
        parent_status: 'empty',
        continuation_status: 'empty',
        continuation_enumeration_complete: false,
        quote_status: archived.quotedStatusId ? 'empty' : 'ok',
        article_status: archived.articleText ? 'unresolved' : 'not_applicable',
        parent_limit_reached: false,
      },
    };
  }

  const record = refreshedRoot(archived, root);
  const context: ThreadTweetSnapshot[] = [];
  const seen = new Set<string>();
  let parentStatus: TweetFetchResult['status'] = 'ok';
  let nextParent = record.inReplyToStatusId;
  while (nextParent && !seen.has(nextParent) && context.length < maxParents) {
    seen.add(nextParent);
    const parent = await fetchTweetByIdViaGraphQL(
      nextParent,
      options.csrfToken,
      options.cookieHeader,
    );
    if (parent.status !== 'ok' || !parent.snapshot) {
      parentStatus = parent.status;
      break;
    }
    const snapshot = parent.snapshot as ThreadTweetSnapshot;
    context.unshift(snapshot);
    nextParent = snapshot.inReplyToStatusId;
    if (nextParent) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  const parentLimitReached = Boolean(nextParent && context.length >= maxParents);
  if (parentLimitReached) parentStatus = 'error';

  const detail = await fetchTweetDetailViaGraphQL(
    archived.tweetId,
    options.csrfToken,
    options.cookieHeader,
    { maxPages: options.maxPages ?? 3, delayMs },
  );
  const continuationStatus = detail.status;
  const continuationHasFocal = detail.status === 'ok'
    && detail.tweets.some((tweet) => tweet.id === record.tweetId);
  const below = continuationHasFocal
    ? extractSameAuthorThreadBelow(detail.tweets, record.tweetId, record.authorHandle)
    : [];
  let quoteStatus: TweetFetchResult['status'] = 'ok';
  let quotedTweet = record.quotedTweet;
  if (record.quotedStatusId) {
    const quoted = await fetchTweetByIdViaGraphQL(
      record.quotedStatusId,
      options.csrfToken,
      options.cookieHeader,
    );
    quoteStatus = quoted.status;
    if (quoted.status === 'ok' && quoted.snapshot) quotedTweet = quoted.snapshot;
  }
  const articleStatus = root.article
    ? 'ok'
    : archived.articleText || hasXArticleIdentity(record)
      ? 'unresolved'
      : 'not_applicable';
  const complete = parentStatus === 'ok'
    && continuationStatus === 'ok'
    && detail.enumerationComplete
    && continuationHasFocal
    && quoteStatus === 'ok'
    && articleStatus !== 'unresolved';

  return {
    record: {
      ...record,
      threadContext: context,
      threadBelow: below,
      quotedTweet,
      threadExpandedAt: complete ? options.now ?? new Date().toISOString() : undefined,
    },
    observation: {
      status: complete ? 'complete' : 'partial',
      root_status: root.status,
      parent_status: parentStatus,
      continuation_status: continuationStatus,
      continuation_enumeration_complete: detail.enumerationComplete,
      quote_status: quoteStatus,
      article_status: articleStatus,
      parent_limit_reached: parentLimitReached,
    },
  };
}
