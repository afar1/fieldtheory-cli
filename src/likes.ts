import { pathExists, readJson, readJsonLines } from './fs.js';
import { twitterLikesBackfillStatePath, twitterLikesCachePath, twitterLikesMetaPath } from './paths.js';
import type { LikeRecord, LikesBackfillState, LikesCacheMeta } from './types.js';

export function latestLikeSyncAt(
  meta?: Pick<LikesCacheMeta, 'lastIncrementalSyncAt' | 'lastFullSyncAt'> | null,
): string | null {
  let latestValue: string | null = null;
  let latestTs = Number.NEGATIVE_INFINITY;

  for (const candidate of [meta?.lastIncrementalSyncAt, meta?.lastFullSyncAt]) {
    if (!candidate) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isFinite(parsed) || parsed <= latestTs) continue;
    latestTs = parsed;
    latestValue = candidate;
  }

  return latestValue;
}

export async function getTwitterLikesStatus(): Promise<LikesCacheMeta & { cachePath: string; metaPath: string }> {
  const cachePath = twitterLikesCachePath();
  const metaPath = twitterLikesMetaPath();
  const statePath = twitterLikesBackfillStatePath();
  const meta = (await pathExists(metaPath))
    ? await readJson<LikesCacheMeta>(metaPath)
    : undefined;
  const state = (await pathExists(statePath))
    ? await readJson<LikesBackfillState>(statePath)
    : undefined;
  const metaUpdatedAt = latestLikeSyncAt(meta);
  const graphQlStatusIsNewer = Boolean(
    state?.lastRunAt && (!metaUpdatedAt || Date.parse(state.lastRunAt) > Date.parse(metaUpdatedAt))
  );

  if (graphQlStatusIsNewer) {
    const cache = await readJsonLines<LikeRecord>(cachePath);
    return {
      provider: 'twitter',
      schemaVersion: 1,
      lastFullSyncAt: meta?.lastFullSyncAt,
      lastIncrementalSyncAt: state?.lastRunAt,
      totalLikes: cache.length,
      cachePath,
      metaPath,
    };
  }

  return {
    provider: 'twitter',
    schemaVersion: 1,
    lastFullSyncAt: meta?.lastFullSyncAt,
    lastIncrementalSyncAt: meta?.lastIncrementalSyncAt,
    totalLikes: meta?.totalLikes ?? 0,
    cachePath,
    metaPath,
  };
}
