import { listBookmarks } from './bookmarks-db.js';
import type { SeedFilterSpec } from './seeds-strategies.js';
import { buildDateWindow } from './seeds-query.js';

export type SeedOrganizeMode = 'category' | 'domain' | 'folder' | 'time';

export interface SeedOrganizationGroup {
  key: string;
  label: string;
  itemIds: string[];
  count: number;
  rationale: string;
}

export interface SeedOrganizationResult {
  mode: SeedOrganizeMode;
  groups: SeedOrganizationGroup[];
}

function isoDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function monthBucket(value?: string | null): string {
  const date = isoDate(value);
  return date ? date.slice(0, 7) : 'unknown';
}

export async function organizeSeedCandidatesBy(
  mode: SeedOrganizeMode,
  filters: SeedFilterSpec,
): Promise<SeedOrganizationResult> {
  const items = await listBookmarks({
    query: filters.query,
    author: filters.author,
    category: filters.category,
    domain: filters.domain,
    folder: filters.folder,
    after: filters.after ?? buildDateWindow(filters.days).after,
    before: filters.before,
    limit: filters.limit ?? 60,
    offset: 0,
  });

  const groups = new Map<string, SeedOrganizationGroup>();

  const push = (key: string, label: string, itemId: string, rationale: string) => {
    const existing = groups.get(key);
    if (existing) {
      existing.itemIds.push(itemId);
      existing.count += 1;
      return;
    }
    groups.set(key, {
      key,
      label,
      itemIds: [itemId],
      count: 1,
      rationale,
    });
  };

  for (const item of items) {
    if (mode === 'category') {
      const value = item.primaryCategory ?? 'unclassified';
      push(value, value, item.id, `Bookmarks grouped by category: ${value}.`);
      continue;
    }
    if (mode === 'domain') {
      const value = item.primaryDomain ?? 'unknown';
      push(value, value, item.id, `Bookmarks grouped by domain: ${value}.`);
      continue;
    }
    if (mode === 'folder') {
      const folderNames = item.folderNames.length > 0 ? item.folderNames : ['untagged'];
      for (const folder of folderNames) {
        push(folder, folder, item.id, `Bookmarks grouped by folder: ${folder}.`);
      }
      continue;
    }
    if (mode === 'time') {
      const bucket = monthBucket(item.postedAt ?? item.bookmarkedAt ?? null);
      push(bucket, bucket, item.id, `Bookmarks grouped by month bucket: ${bucket}.`);
    }
  }

  return {
    mode,
    groups: [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  };
}

export function formatSeedOrganization(result: SeedOrganizationResult): string {
  if (result.groups.length === 0) {
    return `No bookmark groups found for mode: ${result.mode}.`;
  }

  return result.groups
    .map((group, index) => `${index + 1}. ${group.label}  (${group.count})\n   ${group.rationale}`)
    .join('\n\n');
}
