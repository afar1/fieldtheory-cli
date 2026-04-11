/**
 * Bookmark-to-markdown export.
 *
 * ft md [--force]
 *
 * Exports each bookmark as an individual .md file with YAML frontmatter,
 * full tweet text, and [[wikilinks]] to wiki category/domain/entity pages.
 * No LLM required — fast, deterministic, portable.
 *
 * Output: ~/.ft-bookmarks/md/bookmarks/<year>_<month>_<day>-<dow>-<slug>.md
 */

import fs from "node:fs";
import path from "node:path";
import { ensureDir, writeMd } from "./fs.js";
import { mdDir } from "./paths.js";
import {
  listBookmarks,
  countBookmarks,
  type BookmarkTimelineItem,
} from "./bookmarks-db.js";
import { slug } from "./md.js";

export type FilenameFormat = "legacy" | "rev-iso";

export type FormatMigrationStatus = "none" | "mismatch" | "empty";

export interface ExportOptions {
  force?: boolean;
  onProgress?: (status: string) => void;
  filenameFormat?: FilenameFormat;
}

export interface ExportResult {
  exported: number;
  skipped: number;
  total: number;
  elapsed: number;
}

const DATE_STR_REGEX = RegExp(
  /^(\w{3})\s+(\w{3})\s+(\d{1,2})\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4}\s+(\d{4})$/,
);

function bookmarksDir(): string {
  return path.join(mdDir(), "bookmarks");
}

/**
 * Detect whether existing exported files use a different format than
 * the one requested.  Returns:
 *   "empty"   — no .md files on disk (fresh export, no conflict)
 *   "none"    — files exist and likely match the requested format
 *   "mismatch"— files exist but wouldn't match (format change detected)
 */
export async function detectFormatMigration(
  format: FilenameFormat,
): Promise<FormatMigrationStatus> {
  let files: string[];
  try {
    files = fs.readdirSync(bookmarksDir()).filter((f) => f.endsWith(".md"));
  } catch {
    return "empty";
  }
  if (files.length === 0) return "empty";
  if (format === "legacy") return "none"; // legacy was the old default; safe

  // format is "rev-iso" — sample the first bookmark and check if its
  // new-style filename already exists on disk.
  const sample = await listBookmarks({ limit: 1, sort: "desc" });
  if (sample.length === 0) return "none";

  const newName = bookmarkFilename(sample[0], "rev-iso");
  const exists = files.includes(newName);

  return exists ? "none" : "mismatch";
}

function parsePostedAt(dateStr: string | null | undefined): {
  year: string;
  month: string;
  day: string;
  dow: string;
} | null {
  if (!dateStr) return null;

  if (dateStr.length === 10 && dateStr.includes("-")) {
    const year = parseInt(dateStr.slice(0, 4));
    const month = parseInt(dateStr.slice(5, 7)) - 1;
    const day = parseInt(dateStr.slice(8, 10));
    const dowNum = new Date(year, month, day).getDay();
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dowNum];
    return {
      year: dateStr.slice(0, 4),
      month: dateStr.slice(5, 7),
      day: dateStr.slice(8, 10),
      dow,
    };
  }

  const match = dateStr.match(DATE_STR_REGEX);
  if (match) {
    const [, dow, , day, year] = match;
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthStr = match[2];
    const month = String(monthNames.indexOf(monthStr) + 1).padStart(2, "0");
    return { year, month, day: day.padStart(2, "0"), dow };
  }

  return null;
}

type Author = string | null | undefined;

function bookmarkFilenameLegacy(b: BookmarkTimelineItem, a: Author): string {
  if (!a) a = "unknown";
  const date = (b.postedAt ?? b.bookmarkedAt ?? "").slice(0, 10) || "undated";
  const author = a;
  const textSlug = slug(b.text.slice(0, 50)) || b.id;
  return `${date}-${author}-${textSlug}.md`;
}

function bookmarkFilename(
  b: BookmarkTimelineItem,
  format: FilenameFormat = "rev-iso",
): string {
  const author = b.authorHandle ? slug(b.authorHandle) : "unknown";
  if (format === "legacy") {
    return bookmarkFilenameLegacy(b, author);
  }

  const dateInfo = parsePostedAt(b.postedAt ?? b.bookmarkedAt ?? null);
  const textSlug = slug(b.text.slice(0, 50)) || b.id;

  if (dateInfo) {
    return `${dateInfo.year}_${dateInfo.month}_${dateInfo.day}-${dateInfo.dow}-${author}-${textSlug}.md`;
  }

  return `undated-${author}-${textSlug}.md`;
}

function buildBookmarkMd(b: BookmarkTimelineItem): string {
  const lines: string[] = [];

  // ── Frontmatter ─────────────────────────────────────────────────────
  lines.push("---");
  if (b.authorHandle) lines.push(`author: "@${b.authorHandle}"`);
  if (b.authorName)
    lines.push(
      `author_name: "${b.authorName.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`,
    );
  if (b.postedAt) lines.push(`posted_at: ${b.postedAt.slice(0, 10)}`);
  if (b.bookmarkedAt)
    lines.push(`bookmarked_at: ${b.bookmarkedAt.slice(0, 10)}`);
  if (b.primaryCategory) lines.push(`category: ${b.primaryCategory}`);
  if (b.primaryDomain) lines.push(`domain: ${b.primaryDomain}`);
  if (b.categories.length > 0)
    lines.push(`categories: [${b.categories.join(", ")}]`);
  if (b.domains.length > 0) lines.push(`domains: [${b.domains.join(", ")}]`);
  lines.push(`source_url: ${b.url}`);
  lines.push(`tweet_id: "${b.tweetId}"`);
  if (b.likeCount) lines.push(`likes: ${b.likeCount}`);
  if (b.repostCount) lines.push(`reposts: ${b.repostCount}`);
  if (b.viewCount) lines.push(`views: ${b.viewCount}`);
  lines.push("---");
  lines.push("");

  // ── Title ───────────────────────────────────────────────────────────
  const author = b.authorHandle ? `@${b.authorHandle}` : "Unknown";
  lines.push(`# ${author}`);
  lines.push("");

  // ── Body ────────────────────────────────────────────────────────────
  lines.push(b.text);
  lines.push("");

  // ── Links ───────────────────────────────────────────────────────────
  if (b.links.length > 0) {
    lines.push("## Links");
    for (const link of b.links) lines.push(`- ${link}`);
    lines.push("");
  }

  if (b.githubUrls.length > 0) {
    lines.push("## GitHub");
    for (const url of b.githubUrls) lines.push(`- ${url}`);
    lines.push("");
  }

  // ── Wikilinks to wiki pages ─────────────────────────────────────────
  const refs: string[] = [];
  if (b.primaryCategory) refs.push(`[[categories/${slug(b.primaryCategory)}]]`);
  if (b.primaryDomain) refs.push(`[[domains/${slug(b.primaryDomain)}]]`);
  if (b.authorHandle) refs.push(`[[entities/${slug(b.authorHandle)}]]`);

  if (refs.length > 0) {
    lines.push("## Related");
    for (const ref of refs) lines.push(`- ${ref}`);
    lines.push("");
  }

  // ── Source ──────────────────────────────────────────────────────────
  lines.push(`[Original tweet](${b.url})`);
  lines.push("");

  return lines.join("\n");
}

export async function exportBookmarks(
  options: ExportOptions = {},
): Promise<ExportResult> {
  const progress =
    options.onProgress ?? ((s: string) => fs.writeSync(2, s + "\n"));
  const startTime = Date.now();

  await ensureDir(bookmarksDir());

  const total = await countBookmarks();
  progress(`Exporting ${total} bookmarks to markdown...`);

  // Track existing files to skip unless --force
  const existingFiles = new Set<string>();
  if (!options.force) {
    try {
      const files = fs.readdirSync(bookmarksDir());
      for (const f of files) {
        if (f.endsWith(".md")) existingFiles.add(f);
      }
    } catch {
      /* dir may not exist yet */
    }
  }

  let exported = 0;
  let skipped = 0;
  const batchSize = 500;
  let offset = 0;

  while (offset < total) {
    const bookmarks = await listBookmarks({
      limit: batchSize,
      offset,
      sort: "desc",
    });
    if (bookmarks.length === 0) break;

    for (const b of bookmarks) {
      const filename = bookmarkFilename(b, options.filenameFormat);

      if (!options.force && existingFiles.has(filename)) {
        skipped++;
        continue;
      }

      const content = buildBookmarkMd(b);
      const filePath = path.join(bookmarksDir(), filename);
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
