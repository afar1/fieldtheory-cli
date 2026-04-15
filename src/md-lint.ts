/**
 * Markdown wiki health checks.
 *
 * ft lint [--fix]
 *
 * All checks are local — no LLM required.
 */

import path from 'node:path';
import { pathExists, listFiles, readJson, readMd } from './fs.js';
import {
  mdDir, mdIndexPath, mdCategoriesDir, mdDomainsDir, mdEntitiesDir,
  mdConceptsDir, mdEntriesDir, mdStatePath,
} from './paths.js';
import { getCategoryCounts, getDomainCounts, openBookmarksDb } from './bookmarks-db.js';
import { slug, type MdState } from './md.js';

const MIN_PAGE_COUNT    = 5;
const OVERSIZED_LIMIT   = 500;
const STALE_THRESHOLD   = 0.20;

export interface LintIssue {
  type: 'orphan' | 'stale' | 'missing' | 'broken-link' | 'oversized' | 'empty' | 'uncovered';
  page?: string;
  groupKey?: string;
  detail: string;
  fixable: boolean;
}

export interface LintResult {
  issues: LintIssue[];
  stats: { totalPages: number; totalLinks: number; healthScore: number };
}

export function extractWikilinks(content: string): string[] {
  const matches = content.matchAll(/\[\[([^\]]+)\]\]/g);
  return [...matches].map((m) => m[1]);
}

async function collectAllPagePaths(): Promise<Map<string, string>> {
  const pages = new Map<string, string>();

  async function scanDir(dir: string, prefix: string): Promise<void> {
    const files = await listFiles(dir);
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      pages.set(`${prefix}/${f.replace(/\.md$/, '')}`, path.join(dir, f));
    }
  }

  await Promise.all([
    scanDir(mdCategoriesDir(), 'categories'),
    scanDir(mdDomainsDir(), 'domains'),
    scanDir(mdEntitiesDir(), 'entities'),
    scanDir(mdConceptsDir(), 'concepts'),
    scanDir(mdEntriesDir(), 'entries'),
  ]);

  return pages;
}

async function collectAllLinks(pages: Map<string, string>): Promise<Map<string, string[]>> {
  const pageLinks = new Map<string, string[]>();

  const indexPath = mdIndexPath();
  if (await pathExists(indexPath)) {
    pageLinks.set('index', extractWikilinks(await readMd(indexPath)));
  }

  for (const [relPath, absPath] of pages) {
    try {
      pageLinks.set(relPath, extractWikilinks(await readMd(absPath)));
    } catch { /* skip */ }
  }

  return pageLinks;
}

export async function lintMd(): Promise<LintResult> {
  const issues: LintIssue[] = [];

  if (!(await pathExists(mdDir()))) {
    return {
      issues: [{ type: 'missing', detail: 'Markdown directory does not exist. Run: ft md', fixable: false }],
      stats: { totalPages: 0, totalLinks: 0, healthScore: 0 },
    };
  }

  const pages = await collectAllPagePaths();
  const pageLinks = await collectAllLinks(pages);
  const totalPages = pages.size;

  const inboundCount = new Map<string, number>();
  let totalLinks = 0;
  for (const [, links] of pageLinks) {
    for (const link of links) {
      inboundCount.set(link, (inboundCount.get(link) ?? 0) + 1);
      totalLinks++;
    }
  }

  // ── Broken links ─────────────────────────────────────────────────────────
  for (const [sourcePage, links] of pageLinks) {
    for (const link of links) {
      if (!pages.has(link) && link !== 'index') {
        issues.push({ type: 'broken-link', page: sourcePage, detail: `[[${link}]] not found`, fixable: false });
      }
    }
  }

  // ── Orphan pages ─────────────────────────────────────────────────────────
  for (const [relPath] of pages) {
    if ((inboundCount.get(relPath) ?? 0) === 0) {
      issues.push({ type: 'orphan', page: relPath, detail: `${relPath} has no inbound links`, fixable: false });
    }
  }

  // ── DB-based checks ─────────────────────────────────────────────────────
  const db = await openBookmarksDb();
  let categoryCounts: Record<string, number>;
  let domainCounts: Record<string, number>;
  try {
    categoryCounts = await getCategoryCounts(db);
    domainCounts   = await getDomainCounts(db);
  } finally {
    db.close();
  }

  let mdState: MdState | null = null;
  if (await pathExists(mdStatePath())) {
    try { mdState = await readJson<MdState>(mdStatePath()); } catch { /* skip */ }
  }

  // ── Uncovered ───────────────────────────────────────────────────────────
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count < MIN_PAGE_COUNT) continue;
    const s = slug(category);
    if (!pages.has(`categories/${s}`)) {
      issues.push({ type: 'uncovered', page: `categories/${s}`, groupKey: `categories/${category}`, detail: `category "${category}" has ${count} bookmarks but no page`, fixable: true });
    }
  }
  for (const [domain, count] of Object.entries(domainCounts)) {
    if (count < MIN_PAGE_COUNT) continue;
    const s = slug(domain);
    if (!pages.has(`domains/${s}`)) {
      issues.push({ type: 'uncovered', page: `domains/${s}`, groupKey: `domains/${domain}`, detail: `domain "${domain}" has ${count} bookmarks but no page`, fixable: true });
    }
  }

  // ── Stale pages ──────────────────────────────────────────────────────────
  if (mdState) {
    for (const [groupKey, storedCountStr] of Object.entries(mdState.groupCounts)) {
      const storedCount   = Number(storedCountStr);
      const [type, name]  = groupKey.split('/');
      let currentCount    = 0;
      if (type === 'categories') currentCount = categoryCounts[name] ?? 0;
      if (type === 'domains')    currentCount = domainCounts[name] ?? 0;

      const s = slug(name);
      if (currentCount === 0) {
        issues.push({ type: 'empty', page: `${type}/${s}`, groupKey, detail: `${groupKey} has 0 bookmarks now but page exists`, fixable: false });
      } else if (storedCount > 0) {
        const changePct = Math.abs(currentCount - storedCount) / storedCount;
        if (changePct >= STALE_THRESHOLD) {
          issues.push({ type: 'stale', page: `${type}/${s}`, groupKey, detail: `${groupKey} changed from ${storedCount} → ${currentCount} bookmarks (${Math.round(changePct * 100)}% change)`, fixable: true });
        }
      }
    }
  }

  // ── Oversized pages ──────────────────────────────────────────────────────
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count >= OVERSIZED_LIMIT) {
      issues.push({ type: 'oversized', page: `categories/${slug(category)}`, detail: `category "${category}" covers ${count} bookmarks — consider splitting`, fixable: false });
    }
  }
  for (const [domain, count] of Object.entries(domainCounts)) {
    if (count >= OVERSIZED_LIMIT) {
      issues.push({ type: 'oversized', page: `domains/${slug(domain)}`, detail: `domain "${domain}" covers ${count} bookmarks — consider splitting`, fixable: false });
    }
  }

  const healthScore = totalPages === 0
    ? 0
    : Math.max(0, Math.round(100 - (issues.length / Math.max(totalPages, 1)) * 100));

  return { issues, stats: { totalPages, totalLinks, healthScore } };
}

// ── Test exports ──────────────────────────────────────────────────────────
export const collectAllPagePathsForTest = collectAllPagePaths;

export async function fixLintIssues(issues: LintIssue[]): Promise<number> {
  const fixable = issues.filter((i) => i.fixable && i.groupKey);
  if (fixable.length === 0) return 0;

  const groupKeys = [...new Set(fixable.map((i) => i.groupKey!))];
  const { compileMd } = await import('./md.js');
  const result = await compileMd({ only: groupKeys });
  return result.pagesCreated + result.pagesUpdated;
}
