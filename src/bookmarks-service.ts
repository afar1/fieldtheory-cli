import { getTwitterBookmarksStatus, latestBookmarkSyncAt } from './bookmarks.js';
import { buildIndex } from './bookmarks-db.js';
import { loadTwitterOAuthToken } from './xauth.js';
import { syncBookmarksGraphQL, type SyncProgress } from './graphql-bookmarks.js';
import { renderStatusSections } from './status-render.js';

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
  return {
    connected: Boolean(token?.access_token),
    bookmarkCount: status.totalBookmarks,
    lastUpdated: latestBookmarkSyncAt(status),
    mode: token?.access_token ? 'Incremental by default (GraphQL + API available)' : 'Incremental by default (GraphQL)',
    cachePath: status.cachePath,
  };
}

export function formatBookmarkStatus(view: BookmarkStatusView): string {
  return renderStatusSections([
    {
      title: 'Bookmarks',
      lines: [
        { label: 'bookmarks:', value: String(view.bookmarkCount) },
        { label: 'last updated:', value: view.lastUpdated ?? 'never' },
        { label: 'sync mode:', value: view.mode },
        { label: 'cache:', value: view.cachePath },
      ],
    },
  ]);
}

export function formatBookmarkSummary(view: BookmarkStatusView): string {
  return `bookmarks=${view.bookmarkCount} updated=${view.lastUpdated ?? 'never'} mode="${view.mode}"`;
}
