import path from 'node:path';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { ensureDir, pathExists, readJson, readJsonLines, writeJson } from './fs.js';
import { bookmarkMediaDir, bookmarkMediaManifestPath, twitterBookmarksCachePath } from './paths.js';
import type { BookmarkRecord } from './types.js';

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

export async function fetchBookmarkMediaBatch(
  options: { limit?: number; maxBytes?: number } = {}
): Promise<MediaFetchManifest> {
  const limit = options.limit ?? 100;
  const maxBytes = options.maxBytes ?? 50 * 1024 * 1024;
  const mediaDir = bookmarkMediaDir();
  const manifestPath = bookmarkMediaManifestPath();
  await ensureDir(mediaDir);

  const bookmarks = await readJsonLines<BookmarkRecord>(twitterBookmarksCachePath());
  const candidates = bookmarks
    .filter((b) => (b.media?.length ?? 0) > 0 || (b.mediaObjects?.length ?? 0) > 0 || b.authorProfileImageUrl)
    .slice(0, limit);
  const previous = await loadManifest();
  const priorKeys = new Set((previous?.entries ?? []).map((e) => `${e.bookmarkId}::${e.sourceUrl}`));
  const entries: MediaFetchEntry[] = previous?.entries ? [...previous.entries] : [];

  let downloaded = 0;
  let skippedTooLarge = 0;
  let failed = 0;
  let processed = 0;

  for (const bookmark of candidates) {
    // Resolve media URLs: prefer mediaObjects (richer, includes video variants), fall back to media[]
    const mediaUrls: string[] = [];
    if (bookmark.mediaObjects?.length) {
      for (const mo of bookmark.mediaObjects) {
        if (mo.type === 'video' || mo.type === 'animated_gif') {
          const mp4s = (mo.videoVariants ?? mo.variants ?? [])
            .filter((v) => v.url && (!v.contentType || v.contentType === 'video/mp4'))
            .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
          if (mp4s.length > 0 && mp4s[0].url) { mediaUrls.push(mp4s[0].url); continue; }
        }
        const mediaUrl = mo.url ?? mo.mediaUrl;
        if (mediaUrl) mediaUrls.push(mediaUrl);
      }
    } else {
      mediaUrls.push(...(bookmark.media ?? []));
    }

    // Also include author profile image (upgraded to 400x400)
    if (bookmark.authorProfileImageUrl) {
      const fullUrl = bookmark.authorProfileImageUrl.replace('_normal.', '_400x400.');
      if (!priorKeys.has(`${bookmark.id}::${fullUrl}`)) mediaUrls.push(fullUrl);
    }

    for (const sourceUrl of mediaUrls) {
      const key = `${bookmark.id}::${sourceUrl}`;
      if (priorKeys.has(key)) continue;
      processed += 1;

      const fetchedAt = new Date().toISOString();

      try {
        const head = await fetch(sourceUrl, { method: 'HEAD' });
        const contentLengthHeader = head.headers.get('content-length');
        const contentType = head.headers.get('content-type') ?? undefined;
        const declaredBytes = contentLengthHeader ? Number(contentLengthHeader) : undefined;

        if (typeof declaredBytes === 'number' && !Number.isNaN(declaredBytes) && declaredBytes > maxBytes) {
          entries.push({
            bookmarkId: bookmark.id,
            tweetId: bookmark.tweetId,
            tweetUrl: bookmark.url,
            authorHandle: bookmark.authorHandle,
            authorName: bookmark.authorName,
            sourceUrl,
            contentType,
            bytes: declaredBytes,
            status: 'skipped_too_large',
            reason: `content-length ${declaredBytes} exceeds max ${maxBytes}`,
            fetchedAt,
          });
          skippedTooLarge += 1;
          continue;
        }

        const response = await fetch(sourceUrl);
        if (!response.ok) {
          entries.push({
            bookmarkId: bookmark.id,
            tweetId: bookmark.tweetId,
            tweetUrl: bookmark.url,
            authorHandle: bookmark.authorHandle,
            authorName: bookmark.authorName,
            sourceUrl,
            status: 'failed',
            reason: `HTTP ${response.status}`,
            fetchedAt,
          });
          failed += 1;
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.byteLength > maxBytes) {
          entries.push({
            bookmarkId: bookmark.id,
            tweetId: bookmark.tweetId,
            tweetUrl: bookmark.url,
            authorHandle: bookmark.authorHandle,
            authorName: bookmark.authorName,
            sourceUrl,
            contentType: response.headers.get('content-type') ?? contentType ?? undefined,
            bytes: buffer.byteLength,
            status: 'skipped_too_large',
            reason: `downloaded size ${buffer.byteLength} exceeds max ${maxBytes}`,
            fetchedAt,
          });
          skippedTooLarge += 1;
          continue;
        }

        const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
        const ext = sanitizeExtFromContentType(response.headers.get('content-type') ?? contentType ?? undefined, sourceUrl);
        const filename = `${bookmark.tweetId}-${digest}${ext}`;
        const localPath = path.join(mediaDir, filename);
        await writeFile(localPath, buffer);

        entries.push({
          bookmarkId: bookmark.id,
          tweetId: bookmark.tweetId,
          tweetUrl: bookmark.url,
          authorHandle: bookmark.authorHandle,
          authorName: bookmark.authorName,
          sourceUrl,
          localPath,
          contentType: response.headers.get('content-type') ?? contentType ?? undefined,
          bytes: buffer.byteLength,
          status: 'downloaded',
          fetchedAt,
        });
        downloaded += 1;
      } catch (error) {
        entries.push({
          bookmarkId: bookmark.id,
          tweetId: bookmark.tweetId,
          tweetUrl: bookmark.url,
          authorHandle: bookmark.authorHandle,
          authorName: bookmark.authorName,
          sourceUrl,
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
          fetchedAt,
        });
        failed += 1;
      }
    }
  }

  const manifest: MediaFetchManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    limit,
    maxBytes,
    processed,
    downloaded,
    skippedTooLarge,
    failed,
    entries,
  };

  await writeJson(manifestPath, manifest);
  return manifest;
}
