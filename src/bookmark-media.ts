import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat, writeFile } from 'node:fs/promises';
import { ensureDir, pathExists, readJson, readJsonLines, writeJson } from './fs.js';
import { bookmarkMediaDir, bookmarkMediaManifestPath, twitterBookmarksCachePath } from './paths.js';
import type { BookmarkRecord } from './types.js';
import { XRequestExecutor } from './x-request-policy.js';

export const DEFAULT_MEDIA_MAX_BYTES = 200 * 1024 * 1024;

export interface MediaFetchEntry {
  bookmarkId: string;
  tweetId: string;
  tweetUrl: string;
  authorHandle?: string;
  authorName?: string;
  sourceUrl: string;
  localPath?: string;
  contentType?: string;
  bytes?: number;
  status: 'downloaded' | 'skipped_too_large' | 'failed';
  reason?: string;
  fetchedAt: string;
}

export interface MediaFetchManifest {
  schemaVersion: 1;
  generatedAt: string;
  limit: number;
  maxBytes: number;
  processed: number;
  downloaded: number;
  skippedTooLarge: number;
  failed: number;
  entries: MediaFetchEntry[];
}

export interface MediaFetchProgress {
  candidateBookmarks: number;
  processed: number;
  downloaded: number;
  skippedTooLarge: number;
  failed: number;
  currentSourceUrl?: string;
}

export interface VerifiedDownloadedMediaAsset {
  bytes: number;
  sha256: string;
}

export type MediaVerificationCache = Map<string, VerifiedDownloadedMediaAsset | null>;

interface MediaFetchTarget {
  bookmarkId: string;
  tweetId: string;
  tweetUrl: string;
  authorHandle?: string;
  authorName?: string;
  sourceUrl: string;
  isProfileImage: boolean;
}

interface MediaTargetSource {
  tweetId: string;
  tweetUrl: string;
  authorHandle?: string;
  authorName?: string;
  authorProfileImageUrl?: string;
  media?: string[];
  mediaObjects?: BookmarkRecord['mediaObjects'];
}

interface CachedMediaResult {
  localPath?: string;
  contentType?: string;
  bytes?: number;
  status: MediaFetchEntry['status'];
  reason?: string;
  fetchedAt: string;
}

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

function strictlyInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

export async function verifyDownloadedMediaEntry(
  entry: MediaFetchEntry,
  cache?: MediaVerificationCache,
): Promise<VerifiedDownloadedMediaAsset | null> {
  if (entry.status !== 'downloaded' || !entry.localPath) return null;

  let verified = cache?.get(entry.localPath);
  if (verified === undefined) {
    try {
      const [mediaRoot, filePath] = await Promise.all([
        realpath(bookmarkMediaDir()),
        realpath(entry.localPath),
      ]);
      if (!strictlyInside(mediaRoot, filePath)) {
        verified = null;
      } else {
        const file = await stat(filePath);
        if (!file.isFile()) {
          verified = null;
        } else {
          const hash = createHash('sha256');
          for await (const chunk of createReadStream(filePath)) hash.update(chunk);
          const sha256 = hash.digest('hex');
          const filename = path.basename(filePath);
          const extension = path.extname(filename);
          const stem = extension ? filename.slice(0, -extension.length) : filename;
          const digestFromFilename = stem.match(/(?:^|-)([a-f0-9]{16})$/i)?.[1];
          verified = digestFromFilename?.toLowerCase() === sha256.slice(0, 16)
            ? { bytes: file.size, sha256 }
            : null;
        }
      }
    } catch {
      verified = null;
    }
    cache?.set(entry.localPath, verified);
  }

  if (!verified || (entry.bytes !== undefined && entry.bytes !== verified.bytes)) return null;
  return verified;
}

function mediaAssetKey(tweetId: string, sourceUrl: string, isProfileImage: boolean): string {
  return isProfileImage ? `profile::${sourceUrl}` : `${tweetId}::${sourceUrl}`;
}

function mediaAssociationKey(
  bookmarkId: string,
  tweetId: string,
  sourceUrl: string,
  isProfileImage: boolean,
): string {
  return isProfileImage ? mediaAssetKey(tweetId, sourceUrl, true) : `${bookmarkId}::${tweetId}::${sourceUrl}`;
}

function mediaEntryKeyFromEntry(entry: MediaFetchEntry): string {
  return mediaAssociationKey(
    entry.bookmarkId,
    entry.tweetId,
    entry.sourceUrl,
    entry.sourceUrl.includes('/profile_images/'),
  );
}

function sanitizeExtFromContentType(contentType?: string, sourceUrl?: string): string {
  if (contentType?.includes('jpeg')) return '.jpg';
  if (contentType?.includes('png')) return '.png';
  if (contentType?.includes('gif')) return '.gif';
  if (contentType?.includes('webp')) return '.webp';
  if (contentType?.includes('mp4')) return '.mp4';
  try {
    const ext = path.extname(new URL(sourceUrl ?? '').pathname);
    if (ext) return ext;
  } catch {}
  return '.bin';
}

async function loadManifest(): Promise<MediaFetchManifest | null> {
  const manifestPath = bookmarkMediaManifestPath();
  if (!(await pathExists(manifestPath))) return null;
  return readJson<MediaFetchManifest>(manifestPath);
}

function hasTargets(source: { media?: unknown[]; mediaObjects?: unknown[]; authorProfileImageUrl?: string } | undefined): boolean {
  if (!source) return false;
  return (source.media?.length ?? 0) > 0 || (source.mediaObjects?.length ?? 0) > 0 || Boolean(source.authorProfileImageUrl);
}

function hasMediaCandidate(bookmark: BookmarkRecord): boolean {
  return hasTargets(bookmark)
    || hasTargets(bookmark.quotedTweet)
    || (bookmark.threadContext ?? []).some(hasTargets)
    || (bookmark.threadBelow ?? []).some(hasTargets);
}

function pushTarget(
  targets: MediaFetchTarget[],
  seenKeys: Set<string>,
  base: Omit<MediaFetchTarget, 'sourceUrl' | 'isProfileImage'>,
  sourceUrl: string | undefined,
  isProfileImage: boolean,
): void {
  if (!sourceUrl) return;
  const key = mediaAssetKey(base.tweetId, sourceUrl, isProfileImage);
  if (seenKeys.has(key)) return;
  seenKeys.add(key);
  targets.push({
    ...base,
    sourceUrl,
    isProfileImage,
  });
}

function appendMediaTargets(
  targets: MediaFetchTarget[],
  seenKeys: Set<string>,
  bookmarkId: string,
  source: MediaTargetSource,
  downloadedProfileImageUrls: Set<string>,
  skipProfileImages: boolean,
): void {
  const base = {
    bookmarkId,
    tweetId: source.tweetId,
    tweetUrl: source.tweetUrl,
    authorHandle: source.authorHandle,
    authorName: source.authorName,
  };

  if (source.mediaObjects?.length) {
    for (const mo of source.mediaObjects) {
      const previewUrl = mo.previewUrl ?? mo.url ?? mo.mediaUrl;
      if (mo.type === 'video' || mo.type === 'animated_gif') {
        pushTarget(targets, seenKeys, base, previewUrl, false);
        const mp4s = (mo.videoVariants ?? mo.variants ?? [])
          .filter((v) => v.url && (!v.contentType || v.contentType === 'video/mp4'))
          .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
        pushTarget(targets, seenKeys, base, mp4s[0]?.url, false);
        continue;
      }
      pushTarget(targets, seenKeys, base, previewUrl, false);
    }
  } else {
    for (const mediaUrl of source.media ?? []) {
      pushTarget(targets, seenKeys, base, mediaUrl, false);
    }
  }

  if (source.authorProfileImageUrl && !skipProfileImages) {
    const fullUrl = source.authorProfileImageUrl.replace('_normal.', '_400x400.');
    if (!downloadedProfileImageUrls.has(fullUrl)) {
      pushTarget(targets, seenKeys, base, fullUrl, true);
    }
  }
}

function resolveMediaTargets(
  bookmark: BookmarkRecord,
  downloadedProfileImageUrls: Set<string>,
  skipProfileImages: boolean,
): MediaFetchTarget[] {
  const targets: MediaFetchTarget[] = [];
  const seenKeys = new Set<string>();

  appendMediaTargets(targets, seenKeys, bookmark.id, {
    tweetId: bookmark.tweetId,
    tweetUrl: bookmark.url,
    authorHandle: bookmark.authorHandle,
    authorName: bookmark.authorName,
    authorProfileImageUrl: bookmark.authorProfileImageUrl,
    media: bookmark.media,
    mediaObjects: bookmark.mediaObjects,
  }, downloadedProfileImageUrls, skipProfileImages);

  if (bookmark.quotedTweet) {
    appendMediaTargets(targets, seenKeys, bookmark.id, {
      tweetId: bookmark.quotedTweet.id,
      tweetUrl: bookmark.quotedTweet.url,
      authorHandle: bookmark.quotedTweet.authorHandle,
      authorName: bookmark.quotedTweet.authorName,
      authorProfileImageUrl: bookmark.quotedTweet.authorProfileImageUrl,
      media: bookmark.quotedTweet.media,
      mediaObjects: bookmark.quotedTweet.mediaObjects,
    }, downloadedProfileImageUrls, skipProfileImages);
  }

  for (const threadTweet of [
    ...(bookmark.threadContext ?? []),
    ...(bookmark.threadBelow ?? []),
  ]) {
    appendMediaTargets(targets, seenKeys, bookmark.id, {
      tweetId: threadTweet.id,
      tweetUrl: threadTweet.url,
      authorHandle: threadTweet.authorHandle,
      authorName: threadTweet.authorName,
      authorProfileImageUrl: threadTweet.authorProfileImageUrl,
      media: threadTweet.media,
      mediaObjects: threadTweet.mediaObjects,
    }, downloadedProfileImageUrls, skipProfileImages);
  }

  return targets;
}

function failedEntryBackoffMs(entry: MediaFetchEntry): number {
  if (entry.reason === 'HTTP 404' && entry.sourceUrl.includes('/profile_images/')) {
    return 365 * DAY_MS;
  }
  if (entry.reason === 'HTTP 403' && (entry.sourceUrl.includes('video.twimg.com') || entry.sourceUrl.includes('/amplify_video/'))) {
    return 30 * DAY_MS;
  }
  if (entry.reason === 'HTTP 404' && entry.sourceUrl.includes('pbs.twimg.com/media/')) {
    return DAY_MS;
  }
  return HOUR_MS;
}

function isFailedEntryCovered(entry: MediaFetchEntry, nowMs: number): boolean {
  const fetchedAtMs = new Date(entry.fetchedAt).getTime();
  if (Number.isNaN(fetchedAtMs)) return false;
  return nowMs - fetchedAtMs < failedEntryBackoffMs(entry);
}

function isCoveredEntry(entry: MediaFetchEntry, maxBytes: number, retryFailed: boolean, nowMs: number): boolean {
  if (entry.status === 'downloaded') return true;
  if (entry.status === 'failed') return !retryFailed && isFailedEntryCovered(entry, nowMs);
  if (entry.status !== 'skipped_too_large') return false;
  return typeof entry.bytes === 'number' && !Number.isNaN(entry.bytes) && entry.bytes > maxBytes;
}

async function selectMediaCandidates(
  bookmarks: BookmarkRecord[],
  previous: MediaFetchManifest | null,
  limit: number,
  maxBytes: number,
  retryFailed: boolean,
  nowMs: number,
  skipProfileImages: boolean,
): Promise<{
  candidates: BookmarkRecord[];
  coveredAssetKeys: Set<string>;
  coveredProfileImageUrls: Set<string>;
  bySourceUrl: Map<string, CachedMediaResult>;
}> {
  const coveredAssetKeys = buildNonDownloadedCoveredAssetKeys(previous, maxBytes, retryFailed, nowMs);
  const coveredProfileImageUrls = buildNonDownloadedCoveredProfileImageUrls(previous, maxBytes, retryFailed, nowMs);
  const bySourceUrl = new Map<string, CachedMediaResult>();
  const verifiedFiles: MediaVerificationCache = new Map();
  const downloadedByAssociation = new Map<string, MediaFetchEntry>();
  const downloadedBySourceUrl = new Map<string, MediaFetchEntry[]>();
  for (const entry of previous?.entries ?? []) {
    if (entry.status !== 'downloaded') continue;
    downloadedByAssociation.set(mediaEntryKeyFromEntry(entry), entry);
    const sourceEntries = downloadedBySourceUrl.get(entry.sourceUrl) ?? [];
    sourceEntries.push(entry);
    downloadedBySourceUrl.set(entry.sourceUrl, sourceEntries);
  }

  const admitReusable = async (entry: MediaFetchEntry): Promise<boolean> => {
    const verified = await verifyDownloadedMediaEntry(entry, verifiedFiles);
    if (!verified) return false;
    if (!bySourceUrl.has(entry.sourceUrl)) {
      bySourceUrl.set(entry.sourceUrl, {
        localPath: entry.localPath,
        contentType: entry.contentType,
        bytes: verified.bytes,
        status: 'downloaded',
        fetchedAt: entry.fetchedAt,
      });
    }
    return true;
  };

  const admitSource = async (sourceUrl: string): Promise<boolean> => {
    if (bySourceUrl.has(sourceUrl)) return true;
    for (const entry of downloadedBySourceUrl.get(sourceUrl) ?? []) {
      if (await admitReusable(entry)) return true;
    }
    return false;
  };

  const candidates: BookmarkRecord[] = [];
  if (limit === 0) {
    return {
      candidates,
      coveredAssetKeys,
      coveredProfileImageUrls,
      bySourceUrl,
    };
  }
  for (const bookmark of bookmarks) {
    if (!hasMediaCandidate(bookmark)) continue;
    let pending = false;
    const targets = resolveMediaTargets(bookmark, coveredProfileImageUrls, skipProfileImages);
    for (const { bookmarkId, tweetId, sourceUrl, isProfileImage } of targets) {
      if (isProfileImage) {
        if (await admitSource(sourceUrl)) {
          coveredProfileImageUrls.add(sourceUrl);
        } else {
          pending = true;
        }
        continue;
      }

      const key = mediaAssociationKey(bookmarkId, tweetId, sourceUrl, false);
      if (coveredAssetKeys.has(key)) continue;
      const association = downloadedByAssociation.get(key);
      if (association && await admitReusable(association)) {
        coveredAssetKeys.add(key);
        continue;
      }
      // Reusable bytes avoid HTTP, but this root/tweet association remains pending
      // until applyCachedResult writes its own custody entry into the manifest.
      await admitSource(sourceUrl);
      pending = true;
    }
    if (pending) candidates.push(bookmark);
    if (candidates.length >= limit) break;
  }
  return {
    candidates,
    coveredAssetKeys,
    coveredProfileImageUrls,
    bySourceUrl,
  };
}

function buildNonDownloadedCoveredAssetKeys(
  previous: MediaFetchManifest | null,
  maxBytes: number,
  retryFailed: boolean,
  nowMs: number,
): Set<string> {
  return new Set(
    (previous?.entries ?? [])
      .filter((entry) => !entry.sourceUrl.includes('/profile_images/'))
      .filter((entry) => entry.status !== 'downloaded')
      .filter((entry) => isCoveredEntry(entry, maxBytes, retryFailed, nowMs))
      .map(mediaEntryKeyFromEntry),
  );
}

function buildNonDownloadedCoveredProfileImageUrls(
  previous: MediaFetchManifest | null,
  maxBytes: number,
  retryFailed: boolean,
  nowMs: number,
): Set<string> {
  return new Set(
    (previous?.entries ?? [])
      .filter((entry) => entry.sourceUrl.includes('/profile_images/'))
      .filter((entry) => entry.status !== 'downloaded')
      .filter((entry) => isCoveredEntry(entry, maxBytes, retryFailed, nowMs))
      .map((entry) => entry.sourceUrl),
  );
}

export async function fetchBookmarkMediaBatch(
  requestExecutor: XRequestExecutor,
  options: { limit?: number; maxBytes?: number; skipProfileImages?: boolean; retryFailed?: boolean; records?: BookmarkRecord[]; signal?: AbortSignal; onProgress?: (progress: MediaFetchProgress) => void } = {}
): Promise<MediaFetchManifest> {
  const limit = typeof options.limit === 'number' && !Number.isNaN(options.limit)
    ? Math.max(0, options.limit)
    : Infinity;
  const maxBytes = options.maxBytes ?? DEFAULT_MEDIA_MAX_BYTES;
  const skipProfileImages = options.skipProfileImages ?? false;
  const retryFailed = options.retryFailed ?? false;
  const nowMs = Date.now();
  const mediaDir = bookmarkMediaDir();
  const manifestPath = bookmarkMediaManifestPath();
  await ensureDir(mediaDir);

  const previous = await loadManifest();
  const bookmarks = options.records ?? await readJsonLines<BookmarkRecord>(twitterBookmarksCachePath());
  const selected = await selectMediaCandidates(
    bookmarks,
    previous,
    limit,
    maxBytes,
    retryFailed,
    nowMs,
    skipProfileImages,
  );
  const {
    candidates,
    coveredAssetKeys,
    coveredProfileImageUrls,
    bySourceUrl: cachedResultsBySourceUrl,
  } = selected;
  const entriesByKey = new Map((previous?.entries ?? []).map((entry) => [mediaEntryKeyFromEntry(entry), entry]));

  let downloaded = 0;
  let skippedTooLarge = 0;
  let failed = 0;
  let processed = 0;

  const emitProgress = (currentSourceUrl?: string) => {
    options.onProgress?.({
      candidateBookmarks: candidates.length,
      processed,
      downloaded,
      skippedTooLarge,
      failed,
      currentSourceUrl,
    });
  };

  const upsertEntry = (entry: MediaFetchEntry): void => {
    entriesByKey.set(mediaEntryKeyFromEntry(entry), entry);
  };

  const applyCachedResult = (
    target: MediaFetchTarget,
    key: string,
    cached: CachedMediaResult,
  ): void => {
    const { bookmarkId, tweetId, tweetUrl, authorHandle, authorName, sourceUrl, isProfileImage } = target;
    if (isProfileImage) return;
    upsertEntry({
      bookmarkId,
      tweetId,
      tweetUrl,
      authorHandle,
      authorName,
      sourceUrl,
      localPath: cached.localPath,
      contentType: cached.contentType,
      bytes: cached.bytes,
      status: cached.status,
      reason: cached.reason,
      fetchedAt: cached.fetchedAt,
    });
    if (cached.status === 'downloaded') {
      coveredAssetKeys.add(key);
      downloaded += 1;
    } else if (cached.status === 'skipped_too_large') {
      coveredAssetKeys.add(key);
      skippedTooLarge += 1;
    } else {
      failed += 1;
    }
    processed += 1;
    emitProgress(sourceUrl);
  };

  emitProgress();

  for (const bookmark of candidates) {
    if (options.signal?.aborted) break;
    const mediaTargets = resolveMediaTargets(bookmark, coveredProfileImageUrls, skipProfileImages);

    for (const target of mediaTargets) {
      if (options.signal?.aborted) break;
      const { bookmarkId, tweetId, tweetUrl, authorHandle, authorName, sourceUrl, isProfileImage } = target;
      const key = mediaAssociationKey(bookmarkId, tweetId, sourceUrl, isProfileImage);
      if (!isProfileImage && coveredAssetKeys.has(key)) continue;
      const cachedResult = cachedResultsBySourceUrl.get(sourceUrl);
      if (cachedResult) {
        applyCachedResult(target, key, cachedResult);
        continue;
      }

      const fetchedAt = new Date().toISOString();

      try {
        const head = await requestExecutor.requestHeaders(sourceUrl, {
          method: 'HEAD',
          signal: options.signal,
        });
        if (head.failureKind === 'aborted') break;
        if (head.failureKind === 'network') {
          throw new Error(head.errorMessage ?? head.failureKind);
        }
        const contentLengthHeader = head.status === 'ok' ? head.headers?.contentLength : undefined;
        const contentType = head.status === 'ok' ? head.headers?.contentType : undefined;
        const declaredBytes = contentLengthHeader ? Number(contentLengthHeader) : undefined;

        if (typeof declaredBytes === 'number' && !Number.isNaN(declaredBytes) && declaredBytes > maxBytes) {
          const entry = {
            bookmarkId,
            tweetId,
            tweetUrl,
            authorHandle,
            authorName,
            sourceUrl,
            contentType,
            bytes: declaredBytes,
            status: 'skipped_too_large',
            reason: `content-length ${declaredBytes} exceeds max ${maxBytes}`,
            fetchedAt,
          } satisfies MediaFetchEntry;
          upsertEntry(entry);
          cachedResultsBySourceUrl.set(sourceUrl, {
            contentType,
            bytes: declaredBytes,
            status: entry.status,
            reason: entry.reason,
            fetchedAt,
          });
          skippedTooLarge += 1;
          if (isProfileImage) coveredProfileImageUrls.add(sourceUrl);
          else coveredAssetKeys.add(key);
          processed += 1;
          emitProgress(sourceUrl);
          continue;
        }

        const response = await requestExecutor.requestBytes(sourceUrl, { signal: options.signal });
        if (response.failureKind === 'aborted') break;
        if (response.status !== 'ok' || !response.bytes) {
          const reason = response.httpStatus
            ? `HTTP ${response.httpStatus}`
            : response.errorMessage ?? response.failureKind ?? response.status;
          const entry = {
            bookmarkId,
            tweetId,
            tweetUrl,
            authorHandle,
            authorName,
            sourceUrl,
            status: 'failed',
            reason,
            fetchedAt,
          } satisfies MediaFetchEntry;
          upsertEntry(entry);
          cachedResultsBySourceUrl.set(sourceUrl, {
            status: entry.status,
            reason: entry.reason,
            fetchedAt,
          });
          failed += 1;
          processed += 1;
          emitProgress(sourceUrl);
          continue;
        }

        const buffer = response.bytes;
        if (buffer.byteLength > maxBytes) {
          const entry = {
            bookmarkId,
            tweetId,
            tweetUrl,
            authorHandle,
            authorName,
            sourceUrl,
            contentType: response.contentType ?? contentType,
            bytes: buffer.byteLength,
            status: 'skipped_too_large',
            reason: `downloaded size ${buffer.byteLength} exceeds max ${maxBytes}`,
            fetchedAt,
          } satisfies MediaFetchEntry;
          upsertEntry(entry);
          cachedResultsBySourceUrl.set(sourceUrl, {
            contentType: entry.contentType,
            bytes: buffer.byteLength,
            status: entry.status,
            reason: entry.reason,
            fetchedAt,
          });
          skippedTooLarge += 1;
          if (isProfileImage) coveredProfileImageUrls.add(sourceUrl);
          else coveredAssetKeys.add(key);
          processed += 1;
          emitProgress(sourceUrl);
          continue;
        }

        const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
        const ext = sanitizeExtFromContentType(response.contentType ?? contentType, sourceUrl);
        const filename = isProfileImage
          ? `${digest}${ext}`
          : `${tweetId}-${digest}${ext}`;
        const localPath = path.join(mediaDir, filename);
        await writeFile(localPath, buffer);
        if (isProfileImage) coveredProfileImageUrls.add(sourceUrl);
        else coveredAssetKeys.add(key);

        const entry = {
          bookmarkId,
          tweetId,
          tweetUrl,
          authorHandle,
          authorName,
          sourceUrl,
          localPath,
          contentType: response.contentType ?? contentType,
          bytes: buffer.byteLength,
          status: 'downloaded',
          fetchedAt,
        } satisfies MediaFetchEntry;
        upsertEntry(entry);
        cachedResultsBySourceUrl.set(sourceUrl, {
          localPath,
          contentType: entry.contentType,
          bytes: buffer.byteLength,
          status: entry.status,
          fetchedAt,
        });
        downloaded += 1;
        processed += 1;
        emitProgress(sourceUrl);
      } catch (error) {
        const entry = {
          bookmarkId,
          tweetId,
          tweetUrl,
          authorHandle,
          authorName,
          sourceUrl,
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
          fetchedAt,
        } satisfies MediaFetchEntry;
        upsertEntry(entry);
        cachedResultsBySourceUrl.set(sourceUrl, {
          status: entry.status,
          reason: entry.reason,
          fetchedAt,
        });
        failed += 1;
        processed += 1;
        emitProgress(sourceUrl);
      }
    }
  }

  const manifestLimit = Number.isFinite(limit) ? limit : candidates.length;
  const manifest: MediaFetchManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    limit: manifestLimit,
    maxBytes,
    processed,
    downloaded,
    skippedTooLarge,
    failed,
    entries: Array.from(entriesByKey.values()),
  };

  await writeJson(manifestPath, manifest);
  return manifest;
}
