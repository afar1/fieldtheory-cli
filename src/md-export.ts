/**
 * Bookmark-to-markdown export.
 *
 * ft md [--force|--changed]
 *
 * Exports each bookmark as an individual .md file with YAML frontmatter,
 * full tweet text, and [[wikilinks]] to wiki category/domain/entity pages.
 * No LLM required — fast, deterministic, portable.
 *
 * Output: ~/.ft-bookmarks/md/bookmarks/<date>-<author>-<slug>.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, writeMd } from './fs.js';
import { mdDir } from './paths.js';
import { listBookmarks, countBookmarks, type BookmarkTimelineItem } from './bookmarks-db.js';
import { parseTimestampMs, toIsoDate } from './date-utils.js';
import { slug } from './md.js';

export interface ExportOptions {
  force?: boolean;
  changed?: boolean;
  onProgress?: (status: string) => void;
}

export interface ExportResult {
  exported: number;
  skipped: number;
  total: number;
  elapsed: number;
}

function bookmarksDir(): string {
  return path.join(mdDir(), 'bookmarks');
}

function exportDate(value?: string | null): string | null {
  return toIsoDate(value);
}

function bookmarkFilename(b: BookmarkTimelineItem): string {
  const date = exportDate(b.postedAt ?? b.bookmarkedAt) ?? 'undated';
  const author = b.authorHandle ? slug(b.authorHandle) : 'unknown';
  const textSlug = slug(b.text.slice(0, 50)) || b.id;
  return `${date}-${author}-${textSlug}.md`;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function latestSourceUpdateMs(b: BookmarkTimelineItem): number | null {
  const values = [b.syncedAt, b.enrichedAt]
    .map((value) => value ? parseTimestampMs(value) : null)
    .filter((value): value is number => value != null);
  return values.length > 0 ? Math.max(...values) : null;
}

function shouldExportBookmark(b: BookmarkTimelineItem, filePath: string, options: ExportOptions): boolean {
  if (options.force) return true;
  if (!fs.existsSync(filePath)) return true;
  if (!options.changed) return false;

  const changedAt = latestSourceUpdateMs(b);
  if (changedAt == null) return false;

  const fileMtime = fs.statSync(filePath).mtimeMs;
  return changedAt > fileMtime;
}

function buildBookmarkMd(b: BookmarkTimelineItem): string {
  const lines: string[] = [];

  // ── Frontmatter ─────────────────────────────────────────────────────
  lines.push('---');
  if (b.authorHandle) lines.push(`author: "@${b.authorHandle}"`);
  if (b.authorName) lines.push(`author_name: "${b.authorName.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
  const postedAt = exportDate(b.postedAt);
  const bookmarkedAt = exportDate(b.bookmarkedAt);
  if (postedAt) lines.push(`posted_at: ${postedAt}`);
  if (bookmarkedAt) lines.push(`bookmarked_at: ${bookmarkedAt}`);
  if (b.primaryCategory) lines.push(`category: ${b.primaryCategory}`);
  if (b.primaryDomain) lines.push(`domain: ${b.primaryDomain}`);
  if (b.categories.length > 0) lines.push(`categories: [${b.categories.join(', ')}]`);
  if (b.domains.length > 0) lines.push(`domains: [${b.domains.join(', ')}]`);
  lines.push(`source_url: ${b.url}`);
  lines.push(`tweet_id: "${b.tweetId}"`);
  if (b.likeCount) lines.push(`likes: ${b.likeCount}`);
  if (b.repostCount) lines.push(`reposts: ${b.repostCount}`);
  if (b.viewCount) lines.push(`views: ${b.viewCount}`);
  lines.push('---');
  lines.push('');

  // ── Title ───────────────────────────────────────────────────────────
  const author = b.authorHandle ? `@${b.authorHandle}` : 'Unknown';
  lines.push(`# ${author}`);
  lines.push('');

  // ── Body ────────────────────────────────────────────────────────────
  lines.push(b.text);
  lines.push('');

  // ── Enriched article content ───────────────────────────────────────
  if (b.articleText) {
    lines.push('## Article');
    if (b.articleTitle) {
      lines.push(`### ${oneLine(b.articleTitle)}`);
      lines.push('');
    }
    if (b.articleSite) {
      lines.push(`Source: ${oneLine(b.articleSite)}`);
      lines.push('');
    }
    lines.push(b.articleText.trim());
    lines.push('');
  }

  // ── Links ───────────────────────────────────────────────────────────
  if (b.links.length > 0) {
    lines.push('## Links');
    for (const link of b.links) lines.push(`- ${link}`);
    lines.push('');
  }

  if (b.githubUrls.length > 0) {
    lines.push('## GitHub');
    for (const url of b.githubUrls) lines.push(`- ${url}`);
    lines.push('');
  }

  // ── Wikilinks to wiki pages ─────────────────────────────────────────
  const refs: string[] = [];
  if (b.primaryCategory) refs.push(`[[categories/${slug(b.primaryCategory)}]]`);
  if (b.primaryDomain) refs.push(`[[domains/${slug(b.primaryDomain)}]]`);
  if (b.authorHandle) refs.push(`[[entities/${slug(b.authorHandle)}]]`);

  if (refs.length > 0) {
    lines.push('## Related');
    for (const ref of refs) lines.push(`- ${ref}`);
    lines.push('');
  }

  // ── Source ──────────────────────────────────────────────────────────
  lines.push(`[Original tweet](${b.url})`);
  lines.push('');

  return lines.join('\n');
}

export async function exportBookmarks(options: ExportOptions = {}): Promise<ExportResult> {
  const progress = options.onProgress ?? ((s: string) => fs.writeSync(2, s + '\n'));
  const startTime = Date.now();

  await ensureDir(bookmarksDir());

  const total = await countBookmarks();
  progress(options.changed ? `Exporting changed bookmarks to markdown...` : `Exporting ${total} bookmarks to markdown...`);

  let exported = 0;
  let skipped = 0;
  const batchSize = 500;
  let offset = 0;

  while (offset < total) {
    const bookmarks = await listBookmarks({ limit: batchSize, offset, sort: 'desc' });
    if (bookmarks.length === 0) break;

    for (const b of bookmarks) {
      const filename = bookmarkFilename(b);
      const filePath = path.join(bookmarksDir(), filename);

      if (!shouldExportBookmark(b, filePath, options)) {
        skipped++;
        continue;
      }

      const content = buildBookmarkMd(b);
      await writeMd(filePath, content);
      exported++;

      if (exported % 100 === 0) {
        progress(`  ${exported}/${total} exported...`);
      }
    }

    offset += bookmarks.length;
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  return { exported, skipped, total, elapsed };
}
