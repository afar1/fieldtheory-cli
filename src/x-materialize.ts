import {
  fetchTweetByIdViaGraphQL,
  fetchTweetDetailViaGraphQL,
  type TweetFetchResult,
  type TweetDetailFetchResult,
  type TweetDetailTermination,
} from './graphql-bookmarks.js';
import { extractSameAuthorThreadBelow } from './tweet-snapshots.js';
import {
  bindArticleEnrichment,
  bindXArticleEnrichment,
  isXArticleLocator,
  sameSourceLocator,
} from './source-bindings.js';
import type { BookmarkRecord, ThreadTweetSnapshot } from './types.js';
import { XRequestExecutor } from './x-request-policy.js';

export type ParentTraversalTermination = 'root' | 'cycle' | 'limit' | 'unavailable' | 'error';

export interface ExactXRefreshObservation {
  status: 'complete' | 'partial' | 'unavailable';
  root_status: TweetFetchResult['status'];
  parent_status: TweetFetchResult['status'];
  continuation_status: TweetFetchResult['status'];
  continuation_enumeration_complete: boolean;
  quote_status: TweetFetchResult['status'];
  article_status: 'ok' | 'not_applicable' | 'unresolved';
  parent_limit_reached: boolean;
  parent_termination: ParentTraversalTermination;
  continuation_termination: TweetDetailTermination;
  continuation_focal_bound: boolean;
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
  requestExecutor?: XRequestExecutor;
}

interface ArticleCurrentnessReduction {
  fields: Pick<BookmarkRecord,
    'articleTitle' | 'articleText' | 'articleSite' | 'articleSourceTweetId' | 'articleLocator'>;
  status: ExactXRefreshObservation['article_status'];
}

function reduceArticleCurrentness(
  record: BookmarkRecord,
  currentLinks: string[],
  liveArticle: TweetFetchResult['article'],
): ArticleCurrentnessReduction {
  const liveLocator = liveArticle
    ? bindXArticleEnrichment(record.tweetId, currentLinks, {
        articleText: liveArticle.text,
        sourceTweetId: liveArticle.sourceTweetId,
        sourceLocator: liveArticle.sourceLocator,
      })
    : undefined;
  if (liveArticle && liveLocator) {
    return {
      fields: {
        articleTitle: liveArticle.title,
        articleText: liveArticle.text,
        articleSite: liveArticle.siteName,
        articleSourceTweetId: record.tweetId,
        articleLocator: liveLocator,
      },
      status: 'ok',
    };
  }

  const archivedLocator = bindArticleEnrichment(record.tweetId, record.links ?? [], {
    articleText: record.articleText,
    sourceTweetId: record.articleSourceTweetId,
    sourceLocator: record.articleLocator,
  });
  const reaffirmedLocator = bindArticleEnrichment(record.tweetId, currentLinks, {
    articleText: record.articleText,
    sourceTweetId: record.articleSourceTweetId,
    sourceLocator: record.articleLocator,
  });
  const currentArticleLinks = currentLinks.filter(isXArticleLocator);
  if (archivedLocator && !isXArticleLocator(archivedLocator)) {
    const retainOrdinaryEnrichment = Boolean(reaffirmedLocator);
    return {
      fields: {
        articleTitle: retainOrdinaryEnrichment ? record.articleTitle ?? null : null,
        articleText: retainOrdinaryEnrichment ? record.articleText ?? null : null,
        articleSite: retainOrdinaryEnrichment ? record.articleSite ?? null : null,
        articleSourceTweetId: retainOrdinaryEnrichment ? record.tweetId : null,
        articleLocator: retainOrdinaryEnrichment ? reaffirmedLocator ?? null : null,
      },
      status: liveArticle || currentArticleLinks.length > 0 ? 'unresolved' : 'not_applicable',
    };
  }
  const locatorContradicted = Boolean(
    archivedLocator
    && isXArticleLocator(archivedLocator)
    && currentArticleLinks.length > 0
    && !currentArticleLinks.some((value) => sameSourceLocator(value, archivedLocator)),
  );
  const retainedLocator = locatorContradicted
    ? undefined
    : reaffirmedLocator ?? archivedLocator;
  if (retainedLocator) {
    return {
      fields: {
        articleTitle: record.articleTitle ?? null,
        articleText: record.articleText ?? null,
        articleSite: record.articleSite ?? null,
        articleSourceTweetId: record.tweetId,
        articleLocator: retainedLocator,
      },
      status: 'unresolved',
    };
  }

  const unresolved = Boolean(
    liveArticle
    || record.articleText
    || record.articleTitle
    || record.articleSite
    || record.articleLocator
    || currentLinks.some(isXArticleLocator),
  );
  return {
    fields: {
      articleTitle: null,
      articleText: null,
      articleSite: null,
      articleSourceTweetId: null,
      articleLocator: null,
    },
    status: unresolved ? 'unresolved' : 'not_applicable',
  };
}

function refreshedRoot(
  record: BookmarkRecord,
  result: TweetFetchResult,
): { record: BookmarkRecord; articleStatus: ExactXRefreshObservation['article_status'] } {
  const snapshot = result.snapshot;
  if (!snapshot) return { record, articleStatus: 'unresolved' };
  const links = snapshot.links ?? record.links ?? [];
  const liveArticleLocator = result.article
    && result.article.sourceTweetId === record.tweetId
    && result.article.text.trim()
      ? result.article.sourceLocator
      : undefined;
  const articleLinks = liveArticleLocator
    && !links.some((value) => sameSourceLocator(value, liveArticleLocator))
      ? [...links, liveArticleLocator]
      : links;
  const article = reduceArticleCurrentness(record, articleLinks, result.article);
  const liveQuotedStatusId = snapshot.quotedStatusId;
  const quotedStatusId = liveQuotedStatusId ?? record.quotedStatusId;
  const quotedTweet = quotedStatusId && record.quotedTweet?.id === quotedStatusId
    ? record.quotedTweet
    : undefined;
  return {
    record: {
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
      quotedStatusId,
      quotedTweet,
      media: snapshot.media ?? record.media,
      mediaObjects: snapshot.mediaObjects ?? record.mediaObjects,
      links: article.fields.articleLocator
        && !articleLinks.some((value) => sameSourceLocator(value, article.fields.articleLocator!))
          ? [...articleLinks, article.fields.articleLocator]
          : articleLinks,
      ...article.fields,
    },
    articleStatus: article.status,
  };
}

interface ParentTraversalResult {
  context: ThreadTweetSnapshot[];
  status: TweetFetchResult['status'];
  termination: ParentTraversalTermination;
}

async function traverseParents(
  record: BookmarkRecord,
  options: ExactXRefreshOptions,
  executor: XRequestExecutor,
  maxParents: number,
): Promise<ParentTraversalResult> {
  const context: ThreadTweetSnapshot[] = [];
  const seen = new Set<string>([record.tweetId]);
  let nextParent = record.inReplyToStatusId;
  while (nextParent) {
    if (seen.has(nextParent)) {
      return { context, status: 'error', termination: 'cycle' };
    }
    if (context.length >= maxParents) {
      return { context, status: 'error', termination: 'limit' };
    }
    seen.add(nextParent);
    const parent = await fetchTweetByIdViaGraphQL(
      nextParent,
      options.csrfToken,
      options.cookieHeader,
      { executor },
    );
    if (parent.status !== 'ok' || !parent.snapshot) {
      const termination: ParentTraversalTermination = parent.status === 'not_found'
        || parent.status === 'forbidden'
        || parent.status === 'empty'
        ? 'unavailable'
        : 'error';
      return { context, status: parent.status, termination };
    }
    const snapshot = parent.snapshot as ThreadTweetSnapshot;
    context.unshift(snapshot);
    nextParent = snapshot.inReplyToStatusId;
  }
  return { context, status: 'ok', termination: 'root' };
}

function refreshComplete(state: {
  parents: ParentTraversalResult;
  detail: TweetDetailFetchResult;
  quoteStatus: TweetFetchResult['status'];
  articleStatus: ExactXRefreshObservation['article_status'];
}): boolean {
  return state.parents.termination === 'root'
    && state.detail.enumerationTermination === 'exhausted'
    && state.detail.focalBound
    && state.quoteStatus === 'ok'
    && state.articleStatus !== 'unresolved';
}

export async function refreshExactXBookmark(
  archived: BookmarkRecord,
  options: ExactXRefreshOptions,
): Promise<ExactXRefreshResult> {
  const delayMs = options.delayMs ?? 300;
  const maxParents = options.maxParents ?? 25;
  const executor = options.requestExecutor ?? new XRequestExecutor({ delayMs });
  const root = await fetchTweetByIdViaGraphQL(
    archived.tweetId,
    options.csrfToken,
    options.cookieHeader,
    { executor },
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
        parent_termination: 'error',
        continuation_termination: 'error',
        continuation_focal_bound: false,
      },
    };
  }

  const refreshed = refreshedRoot(archived, root);
  const record = refreshed.record;
  const parents = await traverseParents(record, options, executor, maxParents);

  const detail = await fetchTweetDetailViaGraphQL(
    archived.tweetId,
    options.csrfToken,
    options.cookieHeader,
    { maxPages: options.maxPages ?? 3, executor },
  );
  const continuationStatus = detail.status;
  const continuationHasFocal = detail.status === 'ok' && detail.focalBound;
  const below = continuationHasFocal
    ? extractSameAuthorThreadBelow(detail.tweets, record.tweetId, record.authorHandle)
    : [];
  let quoteStatus: TweetFetchResult['status'] = 'ok';
  const quoteIdentityUnresolved = Boolean(root.snapshot.quotedStatusIdentityUnresolved);
  let quotedTweet = record.quotedStatusId && record.quotedTweet?.id === record.quotedStatusId
    ? record.quotedTweet
    : undefined;
  if (record.quotedStatusId) {
    const quoted = await fetchTweetByIdViaGraphQL(
      record.quotedStatusId,
      options.csrfToken,
      options.cookieHeader,
      { executor },
    );
    quoteStatus = quoted.status;
    if (quoted.status === 'ok' && quoted.snapshot) quotedTweet = quoted.snapshot;
  }
  if (quoteIdentityUnresolved && quoteStatus === 'ok') quoteStatus = 'empty';
  const articleStatus = refreshed.articleStatus;
  const complete = refreshComplete({ parents, detail, quoteStatus, articleStatus });

  return {
    record: {
      ...record,
      threadContext: parents.context,
      threadBelow: below,
      quotedTweet,
      threadExpandedAt: complete ? options.now ?? new Date().toISOString() : undefined,
    },
    observation: {
      status: complete ? 'complete' : 'partial',
      root_status: root.status,
      parent_status: parents.status,
      continuation_status: continuationStatus,
      continuation_enumeration_complete: detail.enumerationComplete,
      quote_status: quoteStatus,
      article_status: articleStatus,
      parent_limit_reached: parents.termination === 'limit',
      parent_termination: parents.termination,
      continuation_termination: detail.enumerationTermination,
      continuation_focal_bound: detail.focalBound,
    },
  };
}
