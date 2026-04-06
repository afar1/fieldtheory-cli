/**
 * Enrich bookmarks with quoted tweet content.
 *
 * For bookmarks that have a quotedStatusId but no quotedTweet snapshot,
 * fetches the quoted tweet via X's syndication API and updates both the
 * JSONL cache and SQLite index.
 */

import { readJsonLines, writeJsonLines } from './fs.js';
import { twitterBookmarksCachePath } from './paths.js';
import { updateQuotedTweets } from './bookmarks-db.js';
import type { BookmarkRecord, QuotedTweetSnapshot } from './types.js';

const SYNDICATION_URL = 'https://cdn.syndication.twimg.com/tweet-result';

export interface EnrichProgress {
  done: number;
  total: number;
  fetched: number;
  failed: number;
}

export interface EnrichResult {
  total: number;
  enriched: number;
  failed: number;
  skipped: number;
}

/** Parse a syndication API response into a QuotedTweetSnapshot. */
function parseSyndicationResponse(data: any, tweetId: string): QuotedTweetSnapshot | null {
  if (!data || !data.text) return null;

  const authorHandle = data.user?.screen_name;
  const mediaEntities: any[] = data.mediaDetails ?? [];

  return {
    id: String(data.id_str ?? tweetId),
    text: data.text,
    authorHandle,
    authorName: data.user?.name,
    authorProfileImageUrl: data.user?.profile_image_url_https,
    postedAt: data.created_at ?? null,
    media: mediaEntities
      .map((m: any) => m.media_url_https ?? m.media_url)
      .filter(Boolean),
    mediaObjects: mediaEntities.map((m: any) => ({
      type: m.type,
      url: m.media_url_https ?? m.media_url,
      width: m.original_info?.width,
      height: m.original_info?.height,
    })),
    url: `https://x.com/${authorHandle ?? '_'}/status/${data.id_str ?? tweetId}`,
  };
}

/**
 * Fetch a tweet via X's syndication API with retry.
 * Returns null for permanently unavailable tweets (deleted, private).
 */
async function fetchTweetWithRetry(tweetId: string): Promise<QuotedTweetSnapshot | null> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${SYNDICATION_URL}?id=${tweetId}&token=x`, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      },
    });

    if (response.ok) {
      return parseSyndicationResponse(await response.json(), tweetId);
    }

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

    // 404, 403, etc. — tweet is unavailable, don't retry
    return null;
  }

  throw lastError ?? new Error(`Failed to fetch tweet ${tweetId} after 4 attempts`);
}

/**
 * Enrich bookmarks that have a quotedStatusId but no quotedTweet.
 * Updates both the JSONL cache and the SQLite index.
 */
export async function enrichQuotedTweets(options?: {
  onProgress?: (progress: EnrichProgress) => void;
  delayMs?: number;
}): Promise<EnrichResult> {
  const delayMs = options?.delayMs ?? 300;
  const cachePath = twitterBookmarksCachePath();
  const records = await readJsonLines<BookmarkRecord>(cachePath);

  // Find bookmarks that need enrichment
  const needsEnrichment = records.filter(
    (r) => r.quotedStatusId && !r.quotedTweet
  );

  if (needsEnrichment.length === 0) {
    return { total: 0, enriched: 0, failed: 0, skipped: 0 };
  }

  // Deduplicate quoted tweet IDs (multiple bookmarks may quote the same tweet)
  const quotedIdToSnapshot = new Map<string, QuotedTweetSnapshot | null>();
  const uniqueIds = [...new Set(needsEnrichment.map((r) => r.quotedStatusId!))];

  let fetched = 0;
  let failed = 0;

  for (const quotedId of uniqueIds) {
    try {
      const snapshot = await fetchTweetWithRetry(quotedId);
      quotedIdToSnapshot.set(quotedId, snapshot);
      if (snapshot) fetched++;
      else failed++;
    } catch {
      quotedIdToSnapshot.set(quotedId, null);
      failed++;
    }

    options?.onProgress?.({
      done: fetched + failed,
      total: uniqueIds.length,
      fetched,
      failed,
    });

    // Rate limit between requests
    if (fetched + failed < uniqueIds.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Apply snapshots to all matching records
  let enriched = 0;
  let skipped = 0;
  const enrichedRecords: Array<{ id: string; quotedTweet: QuotedTweetSnapshot }> = [];

  for (const record of records) {
    if (record.quotedStatusId && !record.quotedTweet) {
      const snapshot = quotedIdToSnapshot.get(record.quotedStatusId);
      if (snapshot) {
        record.quotedTweet = snapshot;
        enrichedRecords.push({ id: record.id, quotedTweet: snapshot });
        enriched++;
      } else {
        skipped++;
      }
    }
  }

  // Write updated JSONL
  await writeJsonLines(cachePath, records);

  // Update SQLite index
  if (enrichedRecords.length > 0) {
    await updateQuotedTweets(enrichedRecords);
  }

  return { total: uniqueIds.length, enriched, failed, skipped };
}
