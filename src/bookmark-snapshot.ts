import { getBookmarkById, type BookmarkTimelineItem } from './bookmarks-db.js';
import type { MediaFetchManifest } from './bookmark-media.js';
import { pathExists, readJson, readJsonLines } from './fs.js';
import {
  bookmarkMediaManifestPath,
  twitterBookmarksCachePath,
  twitterBookmarksIndexPath,
} from './paths.js';
import { bindArticleEnrichment } from './source-bindings.js';
import type { BookmarkRecord } from './types.js';

export interface CanonicalBookmarkSnapshot {
  record: BookmarkRecord;
  manifest: MediaFetchManifest | null;
}

function boundArchivedRecord(archived: BookmarkRecord): BookmarkRecord {
  const quotedTweet = archived.quotedStatusId
    && archived.quotedTweet?.id === archived.quotedStatusId
      ? archived.quotedTweet
      : undefined;
  const articleLocator = bindArticleEnrichment(archived.tweetId, archived.links ?? [], {
    articleText: archived.articleText,
    sourceTweetId: archived.articleSourceTweetId,
    sourceLocator: archived.articleLocator,
  });

  return {
    ...archived,
    quotedTweet,
    articleTitle: archived.articleTitle ?? null,
    articleText: articleLocator ? archived.articleText : null,
    articleSite: archived.articleSite ?? null,
    articleSourceTweetId: articleLocator ? archived.tweetId : null,
    articleLocator: articleLocator ?? null,
  };
}

export function hydrateCanonicalBookmark(
  archived: BookmarkRecord,
  indexed: BookmarkTimelineItem | null,
): BookmarkRecord {
  const record = boundArchivedRecord(archived);
  if (!indexed || indexed.id !== archived.id || indexed.tweetId !== archived.tweetId) return record;

  const indexedQuote = !record.quotedTweet
    && archived.quotedStatusId
    && indexed.quotedStatusId === archived.quotedStatusId
    && indexed.quotedTweet?.id === archived.quotedStatusId
      ? indexed.quotedTweet
      : undefined;

  const indexedArticleLocator = !record.articleText
    ? bindArticleEnrichment(archived.tweetId, archived.links ?? [], {
        articleText: indexed.articleText,
        sourceTweetId: indexed.articleSourceTweetId,
        sourceLocator: indexed.articleLocator,
      })
    : undefined;

  return {
    ...record,
    quotedTweet: record.quotedTweet ?? indexedQuote,
    articleTitle: indexedArticleLocator ? indexed.articleTitle : record.articleTitle,
    articleText: indexedArticleLocator ? indexed.articleText : record.articleText,
    articleSite: indexedArticleLocator ? indexed.articleSite : record.articleSite,
    articleSourceTweetId: indexedArticleLocator ? archived.tweetId : record.articleSourceTweetId,
    articleLocator: indexedArticleLocator ?? record.articleLocator,
    enrichedAt: indexedArticleLocator ? indexed.enrichedAt : record.enrichedAt,
  };
}

function bindManifest(
  bookmarkId: string,
  manifest: MediaFetchManifest | null,
): MediaFetchManifest | null {
  if (!manifest) return null;
  const entries = manifest.entries.filter((entry) => entry.bookmarkId === bookmarkId);
  return { ...manifest, entries };
}

export async function loadBoundMediaManifest(bookmarkId: string): Promise<MediaFetchManifest | null> {
  const manifest = await pathExists(bookmarkMediaManifestPath())
    ? await readJson<MediaFetchManifest>(bookmarkMediaManifestPath())
    : null;
  return bindManifest(bookmarkId, manifest);
}

/** Load by the response-owned X tweet ID accepted by `ft materialize <id>`. */
export async function loadCanonicalBookmarkSnapshot(exactTweetId: string): Promise<CanonicalBookmarkSnapshot> {
  const archived = (await readJsonLines<BookmarkRecord>(twitterBookmarksCachePath()))
    .find((row) => row.tweetId === exactTweetId);
  if (!archived) {
    throw new Error(`Archived X bookmark not found: ${exactTweetId}`);
  }

  const indexed = await pathExists(twitterBookmarksIndexPath())
    ? await getBookmarkById(archived.id)
    : null;
  return {
    record: hydrateCanonicalBookmark(archived, indexed),
    manifest: await loadBoundMediaManifest(archived.id),
  };
}
