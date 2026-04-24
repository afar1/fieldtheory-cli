/**
 * Markdown wiki compilation engine.
 *
 * ft md [--full]
 *
 * Builds/updates a Karpathy-style LLM wiki from the bookmarks database.
 * Output lives in ~/.fieldtheory/library/ as plain markdown with [[wikilinks]],
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
import { resolveEngine, invokeEngineAsync, EngineInvocationError, type ResolvedEngine } from './engine.js';
import {
  buildCategoryPagePrompt, buildDomainPagePrompt, buildEntityPagePrompt,
  type MdBookmark,
} from './md-prompts.js';
import { stripLlmMarkdownFence } from './md-fence.js';

const MIN_CATEGORY_COUNT = 5;
const MIN_DOMAIN_COUNT   = 5;
const MIN_ENTITY_COUNT   = 10;
const MAX_SAMPLE_SIZE    = 50;

/** Abort the compile after this many consecutive page failures — catches
 * auth expiry and rate-limit cascades before they waste hours. */
export const MAX_CONSECUTIVE_FAILURES = 5;

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
  engineOverride?: string;
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
  aborted: boolean;
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
~/.fieldtheory/library/
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

/** Short log label from an EngineInvocationError reason. */
function reasonLabel(reason: EngineInvocationError['reason']): string {
  switch (reason) {
    case 'timeout':   return 'TIMEOUT';
    case 'maxbuffer': return 'OVERFLOW';
    case 'spawn':     return 'SPAWN-FAIL';
    case 'exit':      return 'ERROR';
  }
}

/** Build the log detail from a structured engine failure. Prefers stderr,
 *  falls back to the reason-shaped message — never the raw prompt. */
function formatFailureDetail(err: EngineInvocationError): string {
  // For spawn failures (ENOENT etc) the message IS the useful content.
  if (err.reason === 'spawn') return err.message;
  const stderrLine = err.stderr.trim().split(/\r?\n/).filter(Boolean).pop();
  if (stderrLine) {
    return err.reason === 'timeout'
      ? `${err.message} [stderr: ${stderrLine}]`
      : stderrLine;
  }
  return err.message;
}

/** Reason-aware advice line shown when the breaker fires. */
function engineFailureHint(engineName: string, err: EngineInvocationError | null): string {
  if (err?.reason === 'timeout') {
    return `${engineName} ran to the full timeout on every page — usually a hung child, not auth. ` +
           `Upgrade ${engineName} (\`${engineName} --version\`) and retry with \`ft wiki\`.`;
  }
  if (err?.reason === 'spawn') {
    return `Could not spawn \`${engineName}\`. Check that it's installed and on PATH, then rerun \`ft wiki\`.`;
  }
  if (err?.stderr && /rate.?limit|quota|429/i.test(err.stderr)) {
    return `${engineName} is rate-limited. Wait a bit, then rerun \`ft wiki\`.`;
  }
  if (err?.stderr && /auth|login|unauthor|invalid.*token|expired/i.test(err.stderr)) {
    return `${engineName} reports an auth problem — re-authenticate (e.g. \`${engineName} /login\`) and rerun \`ft wiki\`.`;
  }
  return `Check that \`${engineName}\` is authenticated and not rate-limited, then rerun \`ft wiki\`.`;
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
      throw new Error(`Another ft wiki is already running (pid ${existingPid}). Wait for it to finish or remove ${lockPath}`);
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
  const engine = await resolveEngine({ override: options.engineOverride });
  progress(`Using ${engine.name}`);

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
  let aborted      = false;

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

    // Per-event line: echo to the terminal and append to log.md so the
    // user can `tail -f` the log from another shell while a compile runs.
    const logLine = async (msg: string): Promise<void> => {
      progress(msg);
      try { await appendLine(mdLogPath(), logEntry('compile', msg)); } catch { /* best effort */ }
    };

    if (toGenerate.length === 0) {
      progress('Nothing to compile — all pages up to date.');
    } else {
      const est = toGenerate.length > 3 ? ` (~${toGenerate.length}–${toGenerate.length * 2} min)` : '';
      progress(`\nGenerating ${toGenerate.length} pages with ${engine.name}${est}`);
      if (skipCount > 0) progress(`  ${skipCount} pages unchanged, skipping`);
      progress(`  Follow live: tail -f ${mdLogPath()}`);
      progress('');
      await appendLine(
        mdLogPath(),
        logEntry('compile', `start — ${toGenerate.length} pages, engine=${engine.name}`),
      );
    }

    // ── Generate each page ───────────────────────────────────────────────
    let consecutiveFailures = 0;
    let firstFailureMsg = '';
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
      await logLine(`${tag} ${item.key} (${samples.length} sampled, ${Math.round(opts.timeout / 1000)}s timeout)...`);

      let content: string;
      try {
        const raw = await invokeEngineAsync(engine, prompt, opts);
        content = stripLlmMarkdownFence(raw);
      } catch (err) {
        // Prefer the structured EngineInvocationError fields over err.message.
        // err.message used to be the execFile-formatted "Command failed: claude
        // -p --output-format text <FULL PROMPT>", which consumed the entire
        // log budget with prompt bytes and hid the real signal. We now log a
        // short label derived from the failure reason plus the tail of stderr,
        // which is usually where claude/codex put "auth expired" / "rate limit"
        // / "model not available".
        const eie = err instanceof EngineInvocationError ? err : null;
        const label = eie ? reasonLabel(eie.reason) : 'ERROR';
        const detail = eie ? formatFailureDetail(eie) : (err as Error).message ?? String(err);
        await logLine(`${tag} ${item.key} — ${label}: ${detail.slice(0, 200)}`);
        pagesFailed++;
        consecutiveFailures++;
        if (!firstFailureMsg) firstFailureMsg = eie?.message ?? (err as Error).message ?? String(err);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          aborted = true;
          await logLine(
            `Aborted after ${MAX_CONSECUTIVE_FAILURES} consecutive failures — first error: ${firstFailureMsg.slice(0, 300)}`,
          );
          await logLine(engineFailureHint(engine.name, eie));
          break;
        }
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

      await logLine(`${tag} ${item.key} → ${outcome}`);
      consecutiveFailures = 0;
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
    logEntry('compile', `${aborted ? 'aborted ' : ''}engine=${engine.name} created=${pagesCreated} updated=${pagesUpdated} skipped=${pagesSkipped} failed=${pagesFailed} elapsed=${elapsed}s`),
  );

  // ── Save state ───────────────────────────────────────────────────────────
  state.lastCompileAt  = new Date().toISOString();
  state.totalCompiles  = (state.totalCompiles ?? 0) + 1;
  await writeJson(mdStatePath(), state);

  return { engine: engine.name, pagesCreated, pagesUpdated, pagesSkipped, pagesFailed, totalPages, elapsed, aborted };
}
