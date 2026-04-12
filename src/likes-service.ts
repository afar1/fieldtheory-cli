import { getTwitterLikesStatus, latestLikeSyncAt } from './likes.js';

export interface LikesStatusView {
  likeCount: number;
  lastUpdated: string | null;
  mode: string;
  cachePath: string;
}

export async function getLikesStatusView(): Promise<LikesStatusView> {
  const status = await getTwitterLikesStatus();
  return {
    likeCount: status.totalLikes,
    lastUpdated: latestLikeSyncAt(status),
    mode: 'Full archive sync via browser session',
    cachePath: status.cachePath,
  };
}

export function formatLikesStatus(view: LikesStatusView): string {
  return [
    'Likes',
    `  likes: ${view.likeCount}`,
    `  last updated: ${view.lastUpdated ?? 'never'}`,
    `  sync mode: ${view.mode}`,
    `  cache: ${view.cachePath}`,
  ].join('\n');
}
