import { ensureDataDir, twitterBookmarksCachePath } from './paths.js';
import { readJsonLines, writeJsonLines } from './fs.js';
import { loadChromeSessionConfig } from './config.js';
import { extractChromeXCookies } from './chrome-cookies.js';
import { convertTweetToRecord, mergeRecords, buildHeaders, GRAPHQL_FEATURES } from './graphql-bookmarks.js';
import type { BookmarkFolder, BookmarkRecord } from './types.js';

// Query IDs — sniff from X web client, override via env vars
const FOLDERS_LIST_QUERY_ID = process.env.FT_FOLDERS_QUERY_ID ?? 'i78YDd0Tza-dV4SYs58kRg';
const FOLDERS_LIST_OPERATION = 'BookmarkFoldersSlice';

const FOLDER_TIMELINE_QUERY_ID = process.env.FT_FOLDER_TIMELINE_QUERY_ID ?? '13H7EUATwethsj-XxX5ohw';
const FOLDER_TIMELINE_OPERATION = 'BookmarkFolderTimeline';

export interface FolderSyncOptions {
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  csrfToken?: string;
  cookieHeader?: string;
  delayMs?: number;
  maxPagesPerFolder?: number;
  onProgress?: (status: { folder: string; page: number; added: number }) => void;
}

export interface FolderSyncResult {
  folders: BookmarkFolder[];
  addedPerFolder: Record<string, number>;
  added: number;
  totalBookmarks: number;
}

// --- Folder list ---

function buildFolderListUrl(): string {
  const params = new URLSearchParams({
    variables: JSON.stringify({}),
    features: JSON.stringify(GRAPHQL_FEATURES),
  });
  return `https://x.com/i/api/graphql/${FOLDERS_LIST_QUERY_ID}/${FOLDERS_LIST_OPERATION}?${params}`;
}

export async function fetchFolderList(
  csrfToken: string,
  cookieHeader?: string,
): Promise<BookmarkFolder[]> {
  const response = await fetch(buildFolderListUrl(), {
    headers: buildHeaders(csrfToken, cookieHeader),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `BookmarkFolders API returned ${response.status}.\n` +
        `Response: ${text.slice(0, 300)}\n\n` +
        (response.status === 401 || response.status === 403
          ? 'Your X session may have expired. Open Chrome, go to https://x.com, and make sure you are logged in.'
          : 'This may be a temporary issue. Try again in a few minutes.'),
    );
  }

  const json = await response.json();

  // Response shape: data.viewer.user_results.result.bookmark_collections_slice.items[]
  const items =
    json?.data?.viewer?.user_results?.result?.bookmark_collections_slice?.items ??
    json?.data?.viewer?.bookmark_collections_slice?.items ??
    json?.data?.bookmark_collections_slice?.items ??
    [];

  return items.map((item: any) => ({
    id: item.id ?? item.rest_id,
    name: item.name,
  }));
}

// --- Folder bookmark timeline ---

function buildFolderTimelineUrl(folderId: string, cursor?: string): string {
  const variables: Record<string, unknown> = {
    bookmark_collection_id: folderId,
    count: 20,
  };
  if (cursor) variables.cursor = cursor;

  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(GRAPHQL_FEATURES),
  });
  return `https://x.com/i/api/graphql/${FOLDER_TIMELINE_QUERY_ID}/${FOLDER_TIMELINE_OPERATION}?${params}`;
}

interface FolderPageResult {
  records: BookmarkRecord[];
  nextCursor?: string;
}

function parseFolderTimelineResponse(json: any, folderName: string, folderId: string): FolderPageResult {
  const now = new Date().toISOString();

  // Response shape mirrors regular bookmarks but under bookmark_folder_timeline
  const instructions =
    json?.data?.bookmark_folder_timeline?.timeline?.instructions ??
    json?.data?.bookmark_collection_timeline?.timeline?.instructions ??
    [];

  const entries: any[] = [];
  for (const inst of instructions) {
    if (inst.type === 'TimelineAddEntries' && Array.isArray(inst.entries)) {
      entries.push(...inst.entries);
    }
  }

  const records: BookmarkRecord[] = [];
  let nextCursor: string | undefined;

  for (const entry of entries) {
    if (entry.entryId?.startsWith('cursor-bottom')) {
      nextCursor = entry.content?.value;
      continue;
    }

    const tweetResult = entry?.content?.itemContent?.tweet_results?.result;
    if (!tweetResult) continue;

    const record = convertTweetToRecord(tweetResult, now);
    if (record) {
      record.xFolder = folderName;
      record.xFolderId = folderId;
      records.push(record);
    }
  }

  return { records, nextCursor };
}

async function fetchFolderPage(
  csrfToken: string,
  folderId: string,
  folderName: string,
  cursor?: string,
  cookieHeader?: string,
): Promise<FolderPageResult> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(buildFolderTimelineUrl(folderId, cursor), {
      headers: buildHeaders(csrfToken, cookieHeader),
    });

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

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `BookmarkFolderTimeline API returned ${response.status}.\n` +
          `Response: ${text.slice(0, 300)}`,
      );
    }

    const json = await response.json();
    return parseFolderTimelineResponse(json, folderName, folderId);
  }

  throw lastError ?? new Error('BookmarkFolderTimeline: all retry attempts failed.');
}

// --- Orchestrator ---

export async function syncFolders(options: FolderSyncOptions = {}): Promise<FolderSyncResult> {
  const delayMs = options.delayMs ?? 600;
  const maxPagesPerFolder = options.maxPagesPerFolder ?? 100;

  let csrfToken: string;
  let cookieHeader: string | undefined;

  if (options.csrfToken) {
    csrfToken = options.csrfToken;
    cookieHeader = options.cookieHeader;
  } else {
    const chromeConfig = loadChromeSessionConfig();
    const chromeDir = options.chromeUserDataDir ?? chromeConfig.chromeUserDataDir;
    const chromeProfile = options.chromeProfileDirectory ?? chromeConfig.chromeProfileDirectory;
    const cookies = extractChromeXCookies(chromeDir, chromeProfile);
    csrfToken = cookies.csrfToken;
    cookieHeader = cookies.cookieHeader;
  }

  ensureDataDir();
  const cachePath = twitterBookmarksCachePath();
  let existing = await readJsonLines<BookmarkRecord>(cachePath);

  // Step 1: Fetch folder list
  const folders = await fetchFolderList(csrfToken, cookieHeader);

  if (folders.length === 0) {
    return { folders: [], addedPerFolder: {}, added: 0, totalBookmarks: existing.length };
  }

  const addedPerFolder: Record<string, number> = {};
  let totalAdded = 0;

  // Step 2: Fetch each folder's bookmarks
  for (const folder of folders) {
    let page = 0;
    let cursor: string | undefined;
    let folderAdded = 0;

    while (page < maxPagesPerFolder) {
      const result = await fetchFolderPage(csrfToken, folder.id, folder.name, cursor, cookieHeader);
      page++;

      if (result.records.length === 0 && !result.nextCursor) break;

      const { merged, added } = mergeRecords(existing, result.records);
      existing = merged;
      folderAdded += added;

      options.onProgress?.({ folder: folder.name, page, added: folderAdded });

      if (!result.nextCursor) break;
      cursor = result.nextCursor;
      await new Promise((r) => setTimeout(r, delayMs));
    }

    addedPerFolder[folder.name] = folderAdded;
    totalAdded += folderAdded;
  }

  // Write merged results
  await writeJsonLines(cachePath, existing);

  return {
    folders,
    addedPerFolder,
    added: totalAdded,
    totalBookmarks: existing.length,
  };
}
