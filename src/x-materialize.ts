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
  quote_status: TweetFetchResult['status'];
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
    articleText: result.article?.text ?? record.articleText,
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
        quote_status: archived.quotedStatusId ? 'empty' : 'ok',
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
  const continuationStatus = detail.status === 'empty' ? 'ok' : detail.status;
  const below = detail.status === 'ok'
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
  const complete = parentStatus === 'ok' && continuationStatus === 'ok' && quoteStatus === 'ok';

  return {
    record: {
      ...record,
      threadContext: context,
      threadBelow: below,
      quotedTweet,
      ...(complete ? { threadExpandedAt: options.now ?? new Date().toISOString() } : {}),
    },
    observation: {
      status: complete ? 'complete' : 'partial',
      root_status: root.status,
      parent_status: parentStatus,
      continuation_status: continuationStatus,
      quote_status: quoteStatus,
      parent_limit_reached: parentLimitReached,
    },
  };
}
