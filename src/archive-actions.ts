import { buildIndex } from './bookmarks-db.js';
import { readJson, readJsonLines, writeJson, writeJsonLines, pathExists } from './fs.js';
import { buildLikesIndex } from './likes-db.js';
import {
  twitterBookmarksCachePath,
  twitterBookmarksMetaPath,
  twitterLikesCachePath,
  twitterLikesMetaPath,
} from './paths.js';
import type { BookmarkCacheMeta, BookmarkRecord, LikeRecord, LikesCacheMeta } from './types.js';

export interface ArchiveRemovalResult {
  removed: boolean;
  tweetId: string;
  removedRecordId?: string;
  totalRemaining: number;
  cachePath: string;
  dbPath: string;
}

export interface ArchiveBulkRemovalResult {
  removedIds: string[];
  missingIds: string[];
  totalRemaining: number;
  cachePath: string;
  dbPath: string;
}

async function rewriteBookmarkMeta(totalBookmarks: number): Promise<void> {
  const metaPath = twitterBookmarksMetaPath();
  const existing: BookmarkCacheMeta = await pathExists(metaPath)
    ? await readJson<BookmarkCacheMeta>(metaPath)
    : { provider: 'twitter', schemaVersion: 1, totalBookmarks };

  await writeJson(metaPath, {
    ...existing,
    totalBookmarks,
  } satisfies BookmarkCacheMeta);
}

async function rewriteLikesMeta(totalLikes: number): Promise<void> {
  const metaPath = twitterLikesMetaPath();
  const existing: LikesCacheMeta = await pathExists(metaPath)
    ? await readJson<LikesCacheMeta>(metaPath)
    : { provider: 'twitter', schemaVersion: 1, totalLikes };

  await writeJson(metaPath, {
    ...existing,
    totalLikes,
  } satisfies LikesCacheMeta);
}

export async function removeBookmarkFromArchive(tweetId: string): Promise<ArchiveRemovalResult> {
  const cachePath = twitterBookmarksCachePath();
  const existing = await readJsonLines<BookmarkRecord>(cachePath);
  const removedRecord = existing.find((record) => record.id === tweetId || record.tweetId === tweetId);
  const next = existing.filter((record) => record.id !== tweetId && record.tweetId !== tweetId);

  await writeJsonLines(cachePath, next);
  await rewriteBookmarkMeta(next.length);
  const index = await buildIndex({ force: true });

  return {
    removed: Boolean(removedRecord),
    tweetId,
    removedRecordId: removedRecord?.id,
    totalRemaining: next.length,
    cachePath,
    dbPath: index.dbPath,
  };
}

export async function removeLikeFromArchive(tweetId: string): Promise<ArchiveRemovalResult> {
  const cachePath = twitterLikesCachePath();
  const existing = await readJsonLines<LikeRecord>(cachePath);
  const removedRecord = existing.find((record) => record.id === tweetId || record.tweetId === tweetId);
  const next = existing.filter((record) => record.id !== tweetId && record.tweetId !== tweetId);

  await writeJsonLines(cachePath, next);
  await rewriteLikesMeta(next.length);
  const index = await buildLikesIndex({ force: true });

  return {
    removed: Boolean(removedRecord),
    tweetId,
    removedRecordId: removedRecord?.id,
    totalRemaining: next.length,
    cachePath,
    dbPath: index.dbPath,
  };
}

export async function removeLikesFromArchive(tweetIds: string[]): Promise<ArchiveBulkRemovalResult> {
  const targets = new Set(tweetIds);
  const cachePath = twitterLikesCachePath();
  const existing = await readJsonLines<LikeRecord>(cachePath);
  const matchedTargets = new Set<string>();
  const removedIds = existing
    .filter((record) => {
      const matched = targets.has(record.id) || targets.has(record.tweetId);
      if (matched) {
        matchedTargets.add(record.id);
        matchedTargets.add(record.tweetId);
      }
      return matched;
    })
    .map((record) => record.id);
  const next = existing.filter((record) => !targets.has(record.id) && !targets.has(record.tweetId));

  await writeJsonLines(cachePath, next);
  await rewriteLikesMeta(next.length);
  const index = await buildLikesIndex({ force: true });

  return {
    removedIds,
    missingIds: tweetIds.filter((tweetId) => !matchedTargets.has(tweetId)),
    totalRemaining: next.length,
    cachePath,
    dbPath: index.dbPath,
  };
}
