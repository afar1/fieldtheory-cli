import type { BookmarkTimelineItem } from './bookmarks-db.js';
import { listBookmarks, sampleByCategory, sampleByDomain } from './bookmarks-db.js';
import type { SeedFilterSpec } from './seeds-strategies.js';

export interface SeedCandidate {
  id: string;
  text: string;
  url: string;
  authorHandle?: string;
  postedAt?: string | null;
  bookmarkedAt?: string | null;
  category?: string | null;
  domain?: string | null;
  folderNames?: string[];
}

function toSeedCandidate(item: BookmarkTimelineItem): SeedCandidate {
  return {
    id: item.id,
    text: item.text,
    url: item.url,
    authorHandle: item.authorHandle,
    postedAt: item.postedAt,
    bookmarkedAt: item.bookmarkedAt,
    category: item.primaryCategory,
    domain: item.primaryDomain,
    folderNames: item.folderNames,
  };
}

export function buildDateWindow(days?: number): { after?: string } {
  if (!days || !Number.isFinite(days) || days <= 0) return {};
  const now = Date.now();
  const after = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  return { after };
}

export async function querySeedCandidates(filters: SeedFilterSpec): Promise<SeedCandidate[]> {
  const limit = filters.limit ?? 12;
  const afterFromDays = buildDateWindow(filters.days).after;

  const items = await listBookmarks({
    query: filters.query,
    author: filters.author,
    category: filters.category,
    domain: filters.domain,
    folder: filters.folder,
    after: filters.after ?? afterFromDays,
    before: filters.before,
    limit,
    offset: 0,
  });

  return items.map(toSeedCandidate);
}

export async function queryRandomSeedCandidates(filters: SeedFilterSpec): Promise<SeedCandidate[]> {
  const limit = filters.limit ?? 5;

  if (filters.category) {
    const items = await sampleByCategory(filters.category, limit);
    return items.map((item) => ({
      id: item.id,
      text: item.text,
      url: item.url,
      authorHandle: item.authorHandle,
      category: filters.category,
    }));
  }

  if (filters.domain) {
    const items = await sampleByDomain(filters.domain, limit);
    return items.map((item) => ({
      id: item.id,
      text: item.text,
      url: item.url,
      authorHandle: item.authorHandle,
      domain: filters.domain,
    }));
  }

  const items = await listBookmarks({
    query: filters.query,
    author: filters.author,
    folder: filters.folder,
    after: filters.after ?? buildDateWindow(filters.days).after,
    before: filters.before,
    limit: Math.max(limit * 4, 12),
    offset: 0,
  });

  const shuffled = [...items].sort(() => Math.random() - 0.5).slice(0, limit);
  return shuffled.map(toSeedCandidate);
}

export function formatSeedCandidates(items: SeedCandidate[]): string {
  if (items.length === 0) return 'No candidate bookmarks found.';

  return items.map((item, idx) => {
    const meta = [
      item.authorHandle ? `@${item.authorHandle}` : undefined,
      item.postedAt ? item.postedAt.slice(0, 10) : undefined,
      item.category ?? undefined,
      item.domain ?? undefined,
    ].filter(Boolean).join(' · ');
    const text = item.text.length > 120 ? `${item.text.slice(0, 117)}...` : item.text;
    return `${idx + 1}. ${item.id}${meta ? `  ${meta}` : ''}\n   ${text}`;
  }).join('\n\n');
}
