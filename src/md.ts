/**
 * Markdown wiki compilation engine.
 *
 * ft md [--full]
 *
 * Builds/updates a Karpathy-style LLM wiki from the bookmarks database.
 * Output lives in ~/.ft-bookmarks/md/ as plain markdown with [[wikilinks]],
 * compatible with Atomic and other markdown knowledge graph tools.
 *
 * Incremental by default: only pages whose source bookmark count changed are
 * regenerated. --full forces all pages to be rewritten.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, pathExists, readJson, writeMd, appendLine, writeJson, listFiles, readMd } from './fs.js';
import {
  mdDir, mdIndexPath, mdLogPath, mdStatePath, mdSchemaPath,
  mdCategoriesDir, mdDomainsDir, mdEntitiesDir, mdConceptsDir,
} from './paths.js';
import {
  getCategoryCounts, getDomainCounts, sampleByCategory, sampleByDomain,
  sampleByAuthor, getTopAuthorHandles, openBookmarksDb, type CategorySample,
} from './bookmarks-db.js';
import { resolveEngine, invokeEngineAsync, type ResolvedEngine } from './engine.js';
import {
  buildCategoryPagePrompt, buildDomainPagePrompt, buildEntityPagePrompt,
  type MdBookmark,
} from './md-prompts.js';

const MIN_CATEGORY_COUNT = 5;
const MIN_DOMAIN_COUNT   = 5;
const MIN_ENTITY_COUNT   = 10;
const MAX_SAMPLE_SIZE    = 50;

/** Scale timeout by sample count — large categories need more time. */
function llmOpts(sampleCount: number) {
  // Base 120s + 2s per bookmark sampled, capped at 10 min
  const timeout = Math.min(120_000 + sampleCount * 2_000, 600_000);
  return { timeout, maxBuffer: 1024 * 1024 * 4 };
}

export interface MdState {
  lastCompileAt: string;
  totalCompiles: number;
  groupCounts: Record<string, string>;
  pageHashes: Record<string, string>;
}

export interface CompileOptions {
  full?: boolean;
  only?: string[];
  onProgress?: (status: string) => void;
}

export interface CompileResult {
  engine: string;
  pagesCreated: number;
  pagesUpdated: number;
  pagesSkipped: number;
  pagesFailed: number;
  totalPages: number;
  elapsed: number;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function loadMdState(): Promise<MdState> {
  const statePath = mdStatePath();
  if (await pathExists(statePath)) {
    try {
      return await readJson<MdState>(statePath);
    } catch { /* corrupt state → fresh compile */ }
  }
  return {
    lastCompileAt: new Date(0).toISOString(),
    totalCompiles: 0,
    groupCounts: {},
    pageHashes: {},
  };
}

function hasChanged(state: MdState, key: string, currentCount: number): boolean {
  return state.groupCounts[key] !== String(currentCount);
}

function mapToMdBookmarks(samples: CategorySample[]): MdBookmark[] {
  return samples.map((s) => ({
    id: s.id,
    url: s.url,
    text: s.text,
    authorHandle: s.authorHandle,
    categories: s.categories,
    githubUrls: s.githubUrls,
  }));
}

async function writePage(
  filePath: string,
  content: string,
  state: MdState,
  relPath: string,
): Promise<'created' | 'updated' | 'unchanged'> {
  const hash = sha256(content);
  const existing = state.pageHashes[relPath];
  if (existing === hash) return 'unchanged';
  await writeMd(filePath, content);
  state.pageHashes[relPath] = hash;
  return existing ? 'updated' : 'created';
}

async function generateSchemaIfMissing(): Promise<void> {
  const schemaPath = mdSchemaPath();
  if (await pathExists(schemaPath)) return;

  const schema = `# Wiki Schema & Conventions

This file documents the structure and conventions for the FT knowledge base.
Edit it to evolve how the LLM maintains wiki pages.

## Directory Structure

\`\`\`
~/.ft-bookmarks/md/
├── index.md          # Content catalog (auto-generated, do not edit)
├── log.md            # Append-only compile + query log
├── md-state.json     # Internal compilation state
├── categories/       # Pages by bookmark type (tool, security, technique, …)
├── domains/          # Pages by subject matter (ai, finance, devops, …)
├── entities/         # Pages for individual authors/contributors
└── concepts/         # Q&A answers saved with ft ask --save
\`\`\`

## Frontmatter Requirements

Every page MUST have:
\`\`\`yaml
---
tags: [ft/category]  # or ft/domain, ft/entity, ft/concept
source_count: 42
source_type: bookmarks
last_updated: 2026-01-01
---
\`\`\`

## Wikilink Format

Internal cross-references use wikilink syntax:
- \`[[categories/tool]]\` — link to a category page
- \`[[domains/ai]]\` — link to a domain page
- \`[[entities/karpathy]]\` — link to an entity page

## Source Citation Rule

Every factual claim must link back to a bookmark URL:
> "Claude 3.5 Sonnet topped the LMSYS leaderboard ([source](https://x.com/...))."

## Contradiction Rule

When bookmarks in a group disagree, note it explicitly:
> **Contradiction**: Some bookmarks advocate X while others argue Y.
`;

  await writeMd(schemaPath, schema);
}

async function generateIndex(): Promise<string> {
  const categoryFiles = (await listFiles(mdCategoriesDir())).filter(f => f.endsWith('.md')).sort();
  const domainFiles   = (await listFiles(mdDomainsDir())).filter(f => f.endsWith('.md')).sort();
  const entityFiles   = (await listFiles(mdEntitiesDir())).filter(f => f.endsWith('.md')).sort();
  const conceptFiles  = (await listFiles(mdConceptsDir())).filter(f => f.endsWith('.md')).sort();

  const now = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    `---`,
    `tags: [ft/index]`,
    `last_updated: ${now}`,
    `---`,
    ``,
    `# FT Knowledge Base Index`,
    ``,
    `Auto-generated catalog. Edit individual pages, not this file.`,
    ``,
  ];

  if (categoryFiles.length > 0) {
    lines.push(`## Categories (${categoryFiles.length})`);
    lines.push('');
    for (const f of categoryFiles) lines.push(`- [[categories/${f.replace(/\.md$/, '')}]]`);
    lines.push('');
  }

  if (domainFiles.length > 0) {
    lines.push(`## Domains (${domainFiles.length})`);
    lines.push('');
    for (const f of domainFiles) lines.push(`- [[domains/${f.replace(/\.md$/, '')}]]`);
    lines.push('');
  }

  if (entityFiles.length > 0) {
    lines.push(`## Entities (${entityFiles.length})`);
    lines.push('');
    for (const f of entityFiles) lines.push(`- [[entities/${f.replace(/\.md$/, '')}]]`);
    lines.push('');
  }

  if (conceptFiles.length > 0) {
    lines.push(`## Concepts (${conceptFiles.length})`);
    lines.push('');
    for (const f of conceptFiles) lines.push(`- [[concepts/${f.replace(/\.md$/, '')}]]`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Grep-friendly log entry: `## [YYYY-MM-DD] type | detail` */
export function logEntry(type: string, detail: string): string {
  const ts = new Date().toISOString().slice(0, 10);
  return `## [${ts}] ${type} | ${detail}`;
}

export async function compileMd(options: CompileOptions = {}): Promise<CompileResult> {
  const progress  = options.onProgress ?? ((s: string) => fs.writeSync(2, s + '\n'));
  const startTime = Date.now();
  const onlySet   = options.only ? new Set(options.only) : null;

  // ── Lock file to prevent concurrent runs ──────────────────────────────
  const lockPath = path.join(mdDir(), '.lock');
  await ensureDir(mdDir());
  try {
    fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  } catch {
    const existingPid = fs.readFileSync(lockPath, 'utf8').trim();
    let alive = false;
    try { process.kill(Number(existingPid), 0); alive = true; } catch { /* not running */ }
    if (alive) {
      throw new Error(`Another ft md is already running (pid ${existingPid}). Wait for it to finish or remove ${lockPath}`);
    }
    // Stale lock from a crashed run — take over
    fs.writeFileSync(lockPath, String(process.pid));
  }

  try {
    return await doCompile(options, progress, startTime, onlySet);
  } finally {
    try { fs.unlinkSync(lockPath); } catch { /* best effort */ }
  }
}

async function doCompile(
  options: CompileOptions,
  progress: (s: string) => void,
  startTime: number,
  onlySet: Set<string> | null,
): Promise<CompileResult> {
  const engine = await resolveEngine();

  progress('Initializing md directories...');
  await ensureDir(mdDir());
  await ensureDir(mdCategoriesDir());
  await ensureDir(mdDomainsDir());
  await ensureDir(mdEntitiesDir());
  await ensureDir(mdConceptsDir());

  await generateSchemaIfMissing();

  const state = await loadMdState();
  const isFullCompile = Boolean(options.full);

  let pagesCreated = 0;
  let pagesUpdated = 0;
  let pagesSkipped = 0;
  let pagesFailed  = 0;

  const db = await openBookmarksDb();

  try {
    // ── Scan all groups up front so we can show a plan ───────────────────
    progress('Scanning bookmarks...');
    const categoryCounts = await getCategoryCounts(db);
    const domainCounts   = await getDomainCounts(db);
    const topAuthors     = await getTopAuthorHandles(MIN_ENTITY_COUNT, db);

    // Build the work queue: everything that needs an LLM call
    interface WorkItem {
      key: string;
      type: 'category' | 'domain' | 'entity';
      name: string;
      count: number;
    }
    const toGenerate: WorkItem[] = [];
    let skipCount = 0;

    for (const [category, count] of Object.entries(categoryCounts)) {
      if (count < MIN_CATEGORY_COUNT) continue;
      const key = `categories/${category}`;
      if (onlySet && !onlySet.has(key)) continue;
      if (!isFullCompile && !onlySet && !hasChanged(state, key, count)) { skipCount++; continue; }
      toGenerate.push({ key, type: 'category', name: category, count });
    }

    for (const [domain, count] of Object.entries(domainCounts)) {
      if (count < MIN_DOMAIN_COUNT) continue;
      const key = `domains/${domain}`;
      if (onlySet && !onlySet.has(key)) continue;
      if (!isFullCompile && !onlySet && !hasChanged(state, key, count)) { skipCount++; continue; }
      toGenerate.push({ key, type: 'domain', name: domain, count });
    }

    for (const { handle, count } of topAuthors) {
      const key = `entities/${handle}`;
      if (onlySet && !onlySet.has(key)) continue;
      if (!isFullCompile && !onlySet && !hasChanged(state, key, count)) { skipCount++; continue; }
      toGenerate.push({ key, type: 'entity', name: handle, count });
    }

    pagesSkipped = skipCount;

    if (toGenerate.length === 0) {
      progress('Nothing to compile — all pages up to date.');
    } else {
      const est = toGenerate.length > 3 ? ` (~${toGenerate.length}–${toGenerate.length * 2} min)` : '';
      progress(`\nGenerating ${toGenerate.length} pages with ${engine.name}${est}`);
      if (skipCount > 0) progress(`  ${skipCount} pages unchanged, skipping`);
      progress('');
    }

    // ── Generate each page ───────────────────────────────────────────────
    for (let i = 0; i < toGenerate.length; i++) {
      const item = toGenerate[i];
      const tag = `[${i + 1}/${toGenerate.length}]`;

      let samples: CategorySample[];
      let prompt: string;
      if (item.type === 'category') {
        samples = await sampleByCategory(item.name, MAX_SAMPLE_SIZE, db);
        prompt  = buildCategoryPagePrompt(item.name, mapToMdBookmarks(samples));
      } else if (item.type === 'domain') {
        samples = await sampleByDomain(item.name, MAX_SAMPLE_SIZE, db);
        prompt  = buildDomainPagePrompt(item.name, mapToMdBookmarks(samples));
      } else {
        samples = await sampleByAuthor(item.name, MAX_SAMPLE_SIZE, db);
        prompt  = buildEntityPagePrompt(item.name, mapToMdBookmarks(samples));
      }

      const opts = llmOpts(samples.length);
      progress(`${tag} ${item.key} (${samples.length} sampled, ${Math.round(opts.timeout / 1000)}s timeout)...`);

      let content: string;
      try {
        content = await invokeEngineAsync(engine, prompt, opts);
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        const isTimeout = msg.includes('ETIMEDOUT') || msg.includes('timed out');
        progress(`${tag} ${item.key} — ${isTimeout ? 'TIMEOUT' : 'ERROR'}: ${msg.slice(0, 120)}`);
        pagesFailed++;
        continue;
      }

      const dirFn = item.type === 'category' ? mdCategoriesDir
        : item.type === 'domain' ? mdDomainsDir : mdEntitiesDir;
      const filePath = path.join(dirFn(), `${slug(item.name)}.md`);
      const relPath  = `${item.type === 'category' ? 'categories' : item.type === 'domain' ? 'domains' : 'entities'}/${slug(item.name)}.md`;
      const outcome  = await writePage(filePath, content, state, relPath);
      state.groupCounts[item.key] = String(item.count);

      if (outcome === 'created') pagesCreated++;
      else if (outcome === 'updated') pagesUpdated++;
      else pagesSkipped++;

      // Save state after each page so Ctrl-C resumes where we left off
      await writeJson(mdStatePath(), state);

      progress(`${tag} ${item.key} → ${outcome}`);
    }
  } finally {
    db.close();
  }

  // ── Index ───────────────────────────────────────────────────────────────
  progress('Regenerating index.md...');
  const indexContent = await generateIndex();
  await writeMd(mdIndexPath(), indexContent);

  // ── Log entry ───────────────────────────────────────────────────────────
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const totalPages = pagesCreated + pagesUpdated;
  await appendLine(
    mdLogPath(),
    logEntry('compile', `engine=${engine.name} created=${pagesCreated} updated=${pagesUpdated} skipped=${pagesSkipped} failed=${pagesFailed} elapsed=${elapsed}s`),
  );

  // ── Save state ───────────────────────────────────────────────────────────
  state.lastCompileAt  = new Date().toISOString();
  state.totalCompiles  = (state.totalCompiles ?? 0) + 1;
  await writeJson(mdStatePath(), state);

  return { engine: engine.name, pagesCreated, pagesUpdated, pagesSkipped, pagesFailed, totalPages, elapsed };
}
