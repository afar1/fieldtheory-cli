import { getTwitterBookmarksStatus, latestBookmarkSyncAt } from './bookmarks.js';
import { buildIndex, getClassificationProgress } from './bookmarks-db.js';
import { loadTwitterOAuthToken } from './xauth.js';
import { syncBookmarksGraphQL, type SyncProgress } from './graphql-bookmarks.js';

export interface BookmarkEnableResult {
  synced: boolean;
  bookmarkCount: number;
  indexedCount: number;
  cachePath: string;
  messageLines: string[];
}

export interface BookmarkStatusView {
  connected: boolean;
  bookmarkCount: number;
  classificationTotal: number;
  categoriesDone: number;
  domainsDone: number;
  lastUpdated: string | null;
  mode: string;
  cachePath: string;
}

export async function enableBookmarks(): Promise<BookmarkEnableResult> {
  const syncResult = await syncBookmarksGraphQL({
    onProgress: (status: SyncProgress) => {
      if (status.page % 25 === 0 || status.done) {
        process.stderr.write(
          `\r[sync] page ${status.page} | ${status.totalFetched} fetched | ${status.newAdded} new${status.done ? ` | ${status.stopReason}\n` : ''}`
        );
      }
    },
  });

  const indexResult = await buildIndex();

  return {
    synced: true,
    bookmarkCount: syncResult.totalBookmarks,
    indexedCount: indexResult.recordCount,
    cachePath: syncResult.cachePath,
    messageLines: [
      'Bookmarks enabled.',
      `- sync completed: ${syncResult.totalBookmarks} bookmarks (${syncResult.added} new)`,
      `- indexed: ${indexResult.recordCount} records → ${indexResult.dbPath}`,
      `- cache: ${syncResult.cachePath}`,
    ],
  };
}

export async function getBookmarkStatusView(): Promise<BookmarkStatusView> {
  const token = await loadTwitterOAuthToken();
  const status = await getTwitterBookmarksStatus();
  const progress = await getClassificationProgress();
  return {
    connected: Boolean(token?.access_token),
    bookmarkCount: status.totalBookmarks,
    classificationTotal: progress.total,
    categoriesDone: progress.categoriesDone,
    domainsDone: progress.domainsDone,
    lastUpdated: latestBookmarkSyncAt(status),
    mode: token?.access_token ? 'Incremental by default (GraphQL + API available)' : 'Incremental by default (GraphQL)',
    cachePath: status.cachePath,
  };
}

function classificationDenominator(view: BookmarkStatusView): number {
  return Math.max(view.bookmarkCount, view.classificationTotal);
}

export function formatBookmarkStatus(view: BookmarkStatusView): string {
  const total = classificationDenominator(view);
  return [
    'Bookmarks',
    `  bookmarks: ${view.bookmarkCount}`,
    `  categories: ${view.categoriesDone}/${total}`,
    `  domains: ${view.domainsDone}/${total}`,
    `  last updated: ${view.lastUpdated ?? 'never'}`,
    `  sync mode: ${view.mode}`,
    `  cache: ${view.cachePath}`,
  ].join('\n');
}

export function formatBookmarkSummary(view: BookmarkStatusView): string {
  const total = classificationDenominator(view);
  return `bookmarks=${view.bookmarkCount} categories=${view.categoriesDone}/${total} domains=${view.domainsDone}/${total} updated=${view.lastUpdated ?? 'never'} mode="${view.mode}"`;
}
