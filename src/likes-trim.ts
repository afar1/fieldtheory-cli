import { removeLikesFromArchive } from './archive-actions.js';
import { readJsonLines } from './fs.js';
import { RemoteTweetActionError, unlikeTweet } from './graphql-actions.js';
import { twitterLikesCachePath } from './paths.js';
import type { LikeRecord } from './types.js';
import type { XSessionOptions } from './x-graphql.js';

export interface LikesTrimPlan {
  totalLikes: number;
  keepCount: number;
  removeCount: number;
  keepBoundaryId?: string;
  firstRemoveId?: string;
  removalIds: string[];
}

export interface LikesTrimProgress {
  batchNumber: number;
  batchTotal: number;
  completed: number;
  totalToRemove: number;
  currentTweetId?: string;
  pausedSeconds?: number;
}

export interface TrimLikesOptions extends XSessionOptions {
  keep: number;
  batchSize: number;
  pauseSeconds: number;
  rateLimitBackoffSeconds?: number;
  maxRateLimitRetries?: number;
  onProgress?: (progress: LikesTrimProgress) => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface TrimLikesResult {
  totalBefore: number;
  totalAfter: number;
  kept: number;
  removed: number;
  batchesCompleted: number;
  keepBoundaryId?: string;
  firstRemovedId?: string;
  cachePath?: string;
  dbPath?: string;
}

export class LikesTrimRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'LikesTrimRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function likeTimestamp(record: LikeRecord): number {
  const raw = record.likedAt ?? record.postedAt ?? '';
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : 0;
}

function compareLikesByRecency(a: LikeRecord, b: LikeRecord): number {
  const delta = likeTimestamp(b) - likeTimestamp(a);
  if (delta !== 0) return delta;
  return String(b.id).localeCompare(String(a.id));
}

export async function planLikesTrim(keep: number): Promise<LikesTrimPlan> {
  const existing = await readJsonLines<LikeRecord>(twitterLikesCachePath());
  const sorted = [...existing].sort(compareLikesByRecency);
  const keepCount = Math.max(0, Math.min(keep, sorted.length));
  const keepBoundary = keepCount > 0 ? sorted[keepCount - 1] : undefined;
  const removable = sorted.slice(keepCount);

  return {
    totalLikes: sorted.length,
    keepCount,
    removeCount: removable.length,
    keepBoundaryId: keepBoundary?.id,
    firstRemoveId: removable[0]?.id,
    removalIds: removable.map((record) => record.id),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const width = Math.max(1, size);
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += width) {
    batches.push(items.slice(i, i + width));
  }
  return batches;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function trimLikes(options: TrimLikesOptions): Promise<TrimLikesResult> {
  const keep = Math.max(0, Math.trunc(options.keep));
  const batchSize = Math.max(1, Math.trunc(options.batchSize));
  const pauseSeconds = Math.max(0, options.pauseSeconds);
  const rateLimitBackoffSeconds = Math.max(
    1,
    Math.trunc(options.rateLimitBackoffSeconds ?? Math.max(pauseSeconds, 300)),
  );
  const maxRateLimitRetries = Math.max(0, Math.trunc(options.maxRateLimitRetries ?? 3));
  const plan = await planLikesTrim(keep);

  if (plan.removeCount === 0) {
    return {
      totalBefore: plan.totalLikes,
      totalAfter: plan.totalLikes,
      kept: plan.keepCount,
      removed: 0,
      batchesCompleted: 0,
      keepBoundaryId: plan.keepBoundaryId,
    };
  }

  const batches = chunk(plan.removalIds, batchSize);
  const sleep = options.sleep ?? defaultSleep;
  let completed = 0;
  let lastArchiveState: Awaited<ReturnType<typeof removeLikesFromArchive>> | undefined;

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index]!;
    const succeededIds: string[] = [];

    for (const tweetId of batch) {
      let attempts = 0;

      while (true) {
        options.onProgress?.({
          batchNumber: index + 1,
          batchTotal: batches.length,
          completed,
          totalToRemove: plan.removeCount,
          currentTweetId: tweetId,
        });

        try {
          await unlikeTweet(tweetId, options);
          succeededIds.push(tweetId);
          completed += 1;
          break;
        } catch (error) {
          const isRateLimited = error instanceof RemoteTweetActionError && error.status === 429;
          if (isRateLimited && attempts < maxRateLimitRetries) {
            attempts += 1;
            options.onProgress?.({
              batchNumber: index + 1,
              batchTotal: batches.length,
              completed,
              totalToRemove: plan.removeCount,
              currentTweetId: tweetId,
              pausedSeconds: rateLimitBackoffSeconds,
            });
            await sleep(rateLimitBackoffSeconds * 1000);
            continue;
          }

          if (succeededIds.length > 0) {
            lastArchiveState = await removeLikesFromArchive(succeededIds);
          }

          if (isRateLimited) {
            throw new LikesTrimRateLimitError(
              `Rate limited after ${completed}/${plan.removeCount} removals.\n` +
              `Retry after ${rateLimitBackoffSeconds}s or rerun the command later.\n` +
              `${(error as Error).message}`,
              rateLimitBackoffSeconds,
            );
          }

          const prefix = succeededIds.length > 0
            ? `Processed ${completed}/${plan.removeCount} likes before stopping.\n`
            : '';
          throw new Error(`${prefix}${(error as Error).message}`);
        }
      }
    }

    if (succeededIds.length > 0) {
      lastArchiveState = await removeLikesFromArchive(succeededIds);
    }

    if (pauseSeconds > 0 && index < batches.length - 1) {
      options.onProgress?.({
        batchNumber: index + 1,
        batchTotal: batches.length,
        completed,
        totalToRemove: plan.removeCount,
        pausedSeconds: pauseSeconds,
      });
      await sleep(pauseSeconds * 1000);
    }
  }

  return {
    totalBefore: plan.totalLikes,
    totalAfter: lastArchiveState?.totalRemaining ?? plan.keepCount,
    kept: keep,
    removed: completed,
    batchesCompleted: batches.length,
    keepBoundaryId: plan.keepBoundaryId,
    firstRemovedId: plan.firstRemoveId,
    cachePath: lastArchiveState?.cachePath,
    dbPath: lastArchiveState?.dbPath,
  };
}
