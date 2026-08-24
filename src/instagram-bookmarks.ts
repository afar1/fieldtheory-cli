import { readFile } from 'node:fs/promises';
import { loadChromeSessionConfig } from './config.js';
import { extractChromeInstagramCookies } from './chrome-cookies.js';
import { extractFirefoxInstagramCookies } from './firefox-cookies.js';
import { ensureDir, pathExists, readJson, writeJson, writeJsonLines } from './fs.js';
import { dataDir, instagramSavedCachePath, instagramSavedStatePath } from './paths.js';
import type { BookmarkMediaObject, BookmarkMediaVariant, BookmarkRecord } from './types.js';

const INSTAGRAM_SAVED_ENDPOINT = 'https://www.instagram.com/api/v1/feed/saved/posts/';
const INSTAGRAM_APP_ID = '936619743392459';
const DEFAULT_DELAY_MS = 600;
const DEFAULT_MAX_MINUTES = 30;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface InstagramSession {
  csrfToken: string;
  cookieHeader: string;
}

export interface InstagramSavedPage {
  records: BookmarkRecord[];
  nextCursor?: string;
}

export interface InstagramSyncProgress {
  page: number;
  totalFetched: number;
  newAdded: number;
  running: boolean;
  complete: boolean;
  stopReason?: string;
}

export interface InstagramSyncResult {
  added: number;
  totalBookmarks: number;
  pages: number;
  complete: boolean;
  stopReason: string;
  cachePath: string;
  statePath: string;
}

interface InstagramSyncState {
  provider: 'instagram';
  schemaVersion: 1;
  complete: boolean;
  totalRuns: number;
  lastRunAt?: string;
  lastCursor?: string;
  stopReason?: string;
  mode?: 'backfill' | 'incremental';
}

export interface InstagramSyncOptions {
  session?: InstagramSession;
  sessionProvider?: () => InstagramSession;
  browser?: string;
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  firefoxProfileDir?: string;
  maxPages?: number;
  delayMs?: number;
  maxMinutes?: number;
  requestTimeoutMs?: number;
  rebuild?: boolean;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  onProgress?: (progress: InstagramSyncProgress) => void;
}

class InstagramStopError extends Error {
  constructor(readonly stopReason: string) {
    super(stopReason);
  }
}

function isAllowedHost(urlValue: unknown, suffixes: string[]): urlValue is string {
  if (typeof urlValue !== 'string') return false;
  try {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function canonicalInstagramUrl(code: unknown, reel: boolean): string | undefined {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]+$/.test(code)) return undefined;
  return `https://www.instagram.com/${reel ? 'reel' : 'p'}/${code}/`;
}

function mediaCandidates(item: any): BookmarkMediaObject[] {
  const preview = item?.image_versions2?.candidates?.find((candidate: any) =>
    isAllowedHost(candidate?.url, ['cdninstagram.com', 'fbcdn.net'])
  );
  const variants: BookmarkMediaVariant[] = Array.isArray(item?.video_versions)
    ? item.video_versions
        .filter((variant: any) => isAllowedHost(variant?.url, ['cdninstagram.com', 'fbcdn.net']))
        .map((variant: any) => ({
          url: variant.url,
          contentType: 'video/mp4',
          bitrate: typeof variant.bitrate === 'number' ? variant.bitrate : undefined,
        }))
    : [];

  if (!preview && variants.length === 0) return [];
  return [{
    type: Number(item?.media_type) === 2 ? 'video' : 'photo',
    previewUrl: preview?.url,
    width: typeof preview?.width === 'number' ? preview.width : undefined,
    height: typeof preview?.height === 'number' ? preview.height : undefined,
    videoVariants: variants.length ? variants : undefined,
  }];
}

function instagramContentType(item: any): BookmarkRecord['contentType'] {
  if (item.product_type === 'clips' || item.product_type === 'reels') return 'reel';
  switch (Number(item.media_type)) {
    case 1: return 'photo';
    case 2: return 'video';
    case 8: return 'carousel';
    default: return undefined;
  }
}

function normalizeInstagramItem(raw: any, syncedAt: string): BookmarkRecord | null {
  const item = raw?.media ?? raw;
  const idValue = item?.pk ?? item?.id;
  if ((typeof idValue !== 'string' && typeof idValue !== 'number') || !item) return null;
  const id = String(idValue);
  if (!/^\d+$/.test(id) && !/^[A-Za-z0-9_-]+$/.test(id)) return null;

  const mediaType = Number(item.media_type);
  const contentType = instagramContentType(item);
  if (!contentType) return null;
  const isReel = contentType === 'reel';

  const url = canonicalInstagramUrl(item.code, isReel);
  if (!url || !isAllowedHost(url, ['instagram.com'])) return null;
  const children = mediaType === 8 && Array.isArray(item.carousel_media)
    ? item.carousel_media.flatMap((child: any) => mediaCandidates(child))
    : mediaCandidates(item);
  const takenAt = typeof item.taken_at === 'number'
    ? new Date(item.taken_at * 1000).toISOString()
    : null;

  return {
    id,
    tweetId: id,
    nativeId: id,
    source: 'instagram',
    contentType,
    url,
    canonicalUrl: url,
    text: typeof item.caption?.text === 'string' ? item.caption.text : '',
    authorHandle: typeof item.user?.username === 'string' ? item.user.username : undefined,
    authorName: typeof item.user?.full_name === 'string' ? item.user.full_name : undefined,
    authorProfileImageUrl: isAllowedHost(item.user?.profile_pic_url, ['cdninstagram.com', 'fbcdn.net'])
      ? item.user.profile_pic_url
      : undefined,
    postedAt: takenAt,
    bookmarkedAt: null,
    syncedAt,
    mediaObjects: children,
    media: children
      .flatMap((media: BookmarkMediaObject) => [
        media.previewUrl,
        ...(media.videoVariants ?? []).map((variant: BookmarkMediaVariant) => variant.url),
      ])
      .filter((value: string | undefined): value is string => Boolean(value)),
    links: [],
    tags: [],
    ingestedVia: 'instagram-web',
    untrustedFields: ['text', 'authorHandle', 'authorName'],
  };
}

export function parseInstagramSavedResponse(json: any, syncedAt = new Date().toISOString()): InstagramSavedPage {
  if (!json || typeof json !== 'object' || !Array.isArray(json.items)) {
    throw new InstagramStopError('response shape changed');
  }
  const normalized = json.items.map((item: any) => normalizeInstagramItem(item, syncedAt));
  if (normalized.some((record: BookmarkRecord | null) => record === null)) {
    throw new InstagramStopError('response shape changed');
  }
  const records = normalized as BookmarkRecord[];
  const moreAvailable = json.more_available === true;
  const nextCursor = typeof json.next_max_id === 'string' && json.next_max_id
    ? json.next_max_id
    : undefined;
  if (moreAvailable && !nextCursor) throw new InstagramStopError('response shape changed');
  return { records, nextCursor: moreAvailable ? nextCursor : undefined };
}

function buildSavedUrl(cursor?: string): string {
  const url = new URL(INSTAGRAM_SAVED_ENDPOINT);
  url.searchParams.set('count', '12');
  if (cursor) url.searchParams.set('max_id', cursor);
  return url.toString();
}

function validateSession(session: InstagramSession): InstagramSession {
  const csrfValid = Boolean(session.csrfToken) && /^[\x21-\x7E]+$/.test(session.csrfToken);
  const headerValid = Boolean(session.cookieHeader) && /^[\x20-\x7E]+$/.test(session.cookieHeader);
  if (!csrfValid || !headerValid) {
    throw new Error('Instagram session cookies are missing or invalid. Log into instagram.com in the selected browser and retry.');
  }
  return session;
}

function acquireSession(options: InstagramSyncOptions): InstagramSession {
  if (options.session) return validateSession(options.session);
  if (options.sessionProvider) return validateSession(options.sessionProvider());
  const config = loadChromeSessionConfig({ browserId: options.browser });
  if (config.browser.cookieBackend === 'firefox') {
    return validateSession(extractFirefoxInstagramCookies(options.firefoxProfileDir));
  }
  return validateSession(extractChromeInstagramCookies(
    options.chromeUserDataDir ?? config.chromeUserDataDir,
    options.chromeProfileDirectory ?? config.chromeProfileDirectory,
    config.browser,
  ));
}

async function fetchSavedPage(
  session: InstagramSession,
  cursor: string | undefined,
  fetchImpl: typeof fetch,
  syncedAt: string,
  signal: AbortSignal,
): Promise<InstagramSavedPage> {
  const response = await fetchImpl(buildSavedUrl(cursor), {
    method: 'GET',
    redirect: 'manual',
    signal,
    headers: {
      accept: '*/*',
      cookie: session.cookieHeader,
      referer: 'https://www.instagram.com/saved/',
      'x-csrftoken': session.csrfToken,
      'x-ig-app-id': INSTAGRAM_APP_ID,
      'x-requested-with': 'XMLHttpRequest',
    },
  });

  if (response.status >= 300 && response.status < 400) {
    throw new InstagramStopError('redirect refused');
  }
  if (response.status === 429) throw new InstagramStopError('rate limited');

  let json: any;
  try {
    json = await response.json();
  } catch {
    throw new InstagramStopError('response shape changed');
  }
  const challenged = Boolean(json?.challenge || json?.challenge_url || json?.checkpoint_url) ||
    /challenge|required checkpoint/i.test(String(json?.message ?? ''));
  if (challenged) throw new InstagramStopError('challenge required');
  if (response.status === 401 || response.status === 403 || json?.message === 'login_required') {
    throw new InstagramStopError('authentication required');
  }
  if (!response.ok) throw new InstagramStopError(`request failed (${response.status})`);
  return parseInstagramSavedResponse(json, syncedAt);
}

function mergeRecords(existing: BookmarkRecord[], incoming: BookmarkRecord[]): { records: BookmarkRecord[]; added: number } {
  const byId = new Map(existing.map((record) => [record.id, record]));
  let added = 0;
  for (const record of incoming) {
    const previous = byId.get(record.id);
    if (!previous) added += 1;
    byId.set(record.id, previous ? {
      ...previous,
      ...record,
      text: record.text || previous.text,
      authorHandle: record.authorHandle ?? previous.authorHandle,
      authorName: record.authorName ?? previous.authorName,
      authorProfileImageUrl: record.authorProfileImageUrl ?? previous.authorProfileImageUrl,
      postedAt: record.postedAt ?? previous.postedAt,
      bookmarkedAt: record.bookmarkedAt ?? previous.bookmarkedAt,
      mediaObjects: record.mediaObjects?.length ? record.mediaObjects : previous.mediaObjects,
      media: record.media?.length ? record.media : previous.media,
    } : record);
  }
  const records = [...byId.values()].sort((a, b) =>
    String(b.postedAt ?? b.syncedAt).localeCompare(String(a.postedAt ?? a.syncedAt))
  );
  return { records, added };
}

async function readInstagramCache(cachePath: string): Promise<BookmarkRecord[]> {
  if (!await pathExists(cachePath)) return [];
  try {
    const raw = await readFile(cachePath, 'utf8');
    if (!raw.trim()) return [];
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const record = JSON.parse(line) as Partial<BookmarkRecord>;
        if (!record ||
            typeof record !== 'object' ||
            typeof record.id !== 'string' ||
            typeof record.tweetId !== 'string' ||
            typeof record.url !== 'string' ||
            typeof record.text !== 'string' ||
            typeof record.syncedAt !== 'string') {
          throw new Error('invalid record');
        }
        return record as BookmarkRecord;
      });
  } catch {
    throw new Error(`Instagram cache is unreadable or malformed at ${cachePath}. No changes were written.`);
  }
}

export async function syncInstagramSaved(options: InstagramSyncOptions = {}): Promise<InstagramSyncResult> {
  // Acquire credentials before creating directories or writing any state.
  const session = acquireSession(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const delayMs = Math.max(options.fetchImpl ? 0 : DEFAULT_DELAY_MS, options.delayMs ?? DEFAULT_DELAY_MS);
  const maxPages = options.maxPages ?? Infinity;
  const maxMinutes = options.maxMinutes ?? DEFAULT_MAX_MINUTES;
  const requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  const now = options.now ?? (() => new Date());
  const cachePath = instagramSavedCachePath();
  const statePath = instagramSavedStatePath();

  const existing = await readInstagramCache(cachePath);
  let records = existing;
  const knownIds = new Set(existing.map((record) => record.id));
  const previousState = await pathExists(statePath)
    ? await readJson<InstagramSyncState>(statePath)
    : undefined;
  const resuming = Boolean(!options.rebuild && previousState && !previousState.complete && previousState.lastCursor);
  const resumingIncremental = Boolean(resuming && previousState?.mode === 'incremental');
  let cursor = resuming ? previousState?.lastCursor : undefined;
  const incremental = Boolean(!options.rebuild && (
    previousState?.complete ||
    resumingIncremental ||
    (existing.length > 0 && !resuming)
  ));
  const runMode: InstagramSyncState['mode'] = incremental ? 'incremental' : 'backfill';
  const started = Date.now();
  let page = 0;
  let totalFetched = 0;
  let totalAdded = 0;
  let stopReason = 'unknown';
  let complete = false;

  while (page < maxPages) {
    if (options.signal?.aborted) {
      stopReason = 'interrupted';
      break;
    }
    if (Date.now() - started > maxMinutes * 60_000) {
      stopReason = 'max runtime reached';
      break;
    }

    let result: InstagramSavedPage;
    const requestController = new AbortController();
    const abortRequest = () => requestController.abort();
    options.signal?.addEventListener('abort', abortRequest, { once: true });
    const remainingRuntimeMs = Math.max(1, maxMinutes * 60_000 - (Date.now() - started));
    const requestBudgetMs = Math.min(requestTimeoutMs, remainingRuntimeMs);
    const requestTimer = setTimeout(abortRequest, requestBudgetMs);
    try {
      result = await fetchSavedPage(
        session,
        cursor,
        fetchImpl,
        now().toISOString(),
        requestController.signal,
      );
    } catch (error) {
      if (requestController.signal.aborted) {
        if (options.signal?.aborted) stopReason = 'interrupted';
        else if (requestBudgetMs === remainingRuntimeMs) stopReason = 'max runtime reached';
        else stopReason = 'request timed out';
        break;
      }
      if (!(error instanceof InstagramStopError)) throw error;
      stopReason = error.stopReason;
      break;
    } finally {
      clearTimeout(requestTimer);
      options.signal?.removeEventListener('abort', abortRequest);
    }

    page += 1;
    totalFetched += result.records.length;
    const reachedKnown = incremental && result.records.some((record) => knownIds.has(record.id));
    const merged = mergeRecords(records, result.records);
    records = merged.records;
    totalAdded += merged.added;
    cursor = result.nextCursor;

    await ensureDir(dataDir());
    await writeJsonLines(cachePath, records);
    await writeJson(statePath, {
      provider: 'instagram',
      schemaVersion: 1,
      complete: false,
      totalRuns: previousState?.totalRuns ?? 0,
      lastRunAt: now().toISOString(),
      lastCursor: cursor,
      stopReason: 'in progress',
      mode: runMode,
    } satisfies InstagramSyncState);

    options.onProgress?.({
      page,
      totalFetched,
      newAdded: totalAdded,
      running: true,
      complete: false,
    });

    if (reachedKnown) {
      stopReason = 'caught up to saved archive';
      complete = true;
      cursor = undefined;
      break;
    }
    if (!cursor) {
      stopReason = 'end of saved collection';
      complete = true;
      break;
    }
    if (page < maxPages) await sleep(delayMs);
  }

  if (stopReason === 'unknown') stopReason = page >= maxPages ? 'max pages reached' : 'incomplete';
  if (page > 0) {
    await writeJson(statePath, {
      provider: 'instagram',
      schemaVersion: 1,
      complete,
      totalRuns: (previousState?.totalRuns ?? 0) + 1,
      lastRunAt: now().toISOString(),
      lastCursor: complete ? undefined : cursor,
      stopReason,
      mode: runMode,
    } satisfies InstagramSyncState);
  }

  options.onProgress?.({
    page,
    totalFetched,
    newAdded: totalAdded,
    running: false,
    complete,
    stopReason,
  });

  return {
    added: totalAdded,
    totalBookmarks: records.length,
    pages: page,
    complete,
    stopReason,
    cachePath,
    statePath,
  };
}
