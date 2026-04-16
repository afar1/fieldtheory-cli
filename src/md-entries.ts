/**
 * Authored entries — the wiki's lane for agent/human-authored knowledge.
 *
 * `writeEntry()` is the shared writer used by both `ft ask --save` (which
 * pre-fills the body with an LLM answer, source_type=ask) and the portable
 * `entry.md` command file (which accepts an agent-authored body,
 * source_type=authored). Both produce the same artifact shape at
 * `~/.ft-bookmarks/md/entries/YYYY-MM-DD-<slug>.md` and append a log line
 * in the existing grep-friendly `## [YYYY-MM-DD] type | detail` format.
 *
 * Phase 2 of the entries rollout. See council consensus at
 * `~/council-transcripts/.council-bg/2026-04-15_13-46-30_-wiki-entries-refining-debate-1-s-consen.consensus.md`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeMd, readMd, appendLine, listFiles, pathExists, writeJson } from './fs.js';
import {
  mdEntriesDir, mdLogPath, mdStatePath,
  mdCategoriesDir, mdDomainsDir, mdEntitiesDir, mdConceptsDir,
} from './paths.js';
import { slug, logEntry, writePage, type MdState } from './md.js';
import { extractWikilinks } from './md-lint.js';
import { buildReconcilePrompt } from './md-prompts.js';
import {
  invokeEngineAsync, EngineInvocationError,
  type ResolvedEngine, type InvokeOptions,
} from './engine.js';
import { stripLlmMarkdownFence } from './md-fence.js';

export type EntrySourceType = 'ask' | 'authored';

export interface WriteEntryOptions {
  /** Heading text and the source of the filename slug. */
  title: string;
  /** Body content rendered below the `# <title>` heading. */
  body: string;
  /** Secondary type tag joined with `ft/entry` — e.g. `ft/concept`, `ft/lesson`. */
  entryTag: string;
  /** Provenance marker written to frontmatter. */
  sourceType: EntrySourceType;
  /** Preserved in frontmatter when `sourceType === 'ask'`. */
  question?: string;
  /** Additional topical tags appended after `ft/entry` and `entryTag`. */
  topicalTags?: string[];
}

export interface WriteEntryResult {
  /** Absolute path to the written file. */
  filePath: string;
  /** Wiki-relative path without extension, suitable for wikilinks (e.g. `entries/2026-04-15-foo`). */
  relPath: string;
  /** The filename slug (no date prefix, no extension). */
  slug: string;
}

function yamlEscapeDoubleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

/**
 * Writes an authored entry to the wiki and appends a log line.
 * Overwrites any existing file at the same date+slug path — callers that
 * need collision avoidance should vary the title or add a disambiguator.
 */
export async function writeEntry(opts: WriteEntryOptions): Promise<WriteEntryResult> {
  const entrySlug = slug(opts.title);
  if (!entrySlug) {
    throw new Error(`writeEntry: title "${opts.title}" produced an empty slug; give the entry a title with at least one alphanumeric character`);
  }
  const now = new Date().toISOString().slice(0, 10);
  const filename = `${now}-${entrySlug}.md`;
  const filePath = path.join(mdEntriesDir(), filename);
  const relPath = `entries/${now}-${entrySlug}`;

  // Dedupe tags. Callers sometimes pass `ft/entry` or the type tag again
  // via `topicalTags`; quietly collapsing duplicates keeps the frontmatter
  // clean without surprising the caller.
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of ['ft/entry', opts.entryTag, ...(opts.topicalTags ?? [])]) {
    if (!seen.has(t)) {
      seen.add(t);
      tags.push(t);
    }
  }

  const frontmatter: string[] = [
    '---',
    `tags: [${tags.join(', ')}]`,
    `source_type: ${opts.sourceType}`,
  ];
  if (opts.sourceType === 'ask' && opts.question) {
    frontmatter.push(`question: "${yamlEscapeDoubleQuoted(opts.question)}"`);
  }
  frontmatter.push(`last_updated: ${now}`, '---', '');

  const content = [
    ...frontmatter,
    `# ${opts.title}`,
    '',
    opts.body,
  ].join('\n');

  await writeMd(filePath, content);
  await appendLine(mdLogPath(), logEntry('entry', `created ${relPath}`));

  return { filePath, relPath, slug: entrySlug };
}

// ──────────────────────────────────────────────────────────────────────────
// Reconcile — Phase 3
// ──────────────────────────────────────────────────────────────────────────
//
// `reconcileEntries()` closes the loop Karpathy describes: when new authored
// knowledge arrives, the LLM integrates it into the existing compiled wiki
// pages instead of leaving entries as dead-letter sidecars. Dependency graph
// is driven entirely by wikilinks in entry bodies — an entry that mentions
// `[[domains/ai]]` declares `domains/ai` as a reconcile target.
//
// State tracking via MdState.entryHashes lets unchanged entries skip reconcile
// on every `ft wiki`. Change detection:
//   - Entry is "changed" when its content hash differs from state.entryHashes.
//   - Target page is "dirty" when doCompile just regenerated it (bookmark-
//     driven rewrite clobbered any prior reconcile state).
//   - A target is reconciled when it's dirty OR when any contributing entry
//     is changed. Otherwise skipped.
//
// A small consecutive-failure cap (3) protects against auth-outage runaway
// costs — the larger compile-phase cap (5) already fired if there's systemic
// failure before reconcile ever runs.

const RECONCILE_CONSECUTIVE_FAILURE_CAP = 3;
const RECONCILE_LLM_TIMEOUT_MS = 240_000;
const RECONCILE_LLM_MAX_BUFFER = 1024 * 1024 * 4;

type EngineInvoker = (engine: ResolvedEngine, prompt: string, opts: InvokeOptions) => Promise<string>;

export interface ReconcileOptions {
  state: MdState;
  engine: ResolvedEngine;
  /** Line-oriented progress sink. Defaults to no-op. */
  progress?: (s: string) => void;
  /** Restrict reconcile to this set of target relPaths (no `.md`). Undefined = all targets. */
  touchedPages?: Set<string>;
  /** Target relPaths (no `.md`) that were just regenerated by compile and must be reconciled regardless of entry hash state. */
  dirtyPages?: Set<string>;
  /** Test seam for injecting a fake engine invoker. Defaults to the real `invokeEngineAsync`. */
  engineInvoker?: EngineInvoker;
}

export interface ReconcileResult {
  pagesReconciled: number;
  pagesUnchanged: number;
  pagesSkipped: number;
  pagesFailed: number;
  aborted: boolean;
}

interface ScannedEntry {
  relPath: string;  // entries/YYYY-MM-DD-slug (no `.md`)
  content: string;
  hash: string;
  wikilinks: string[]; // only those that resolve to compiled-page dirs
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function targetDirFor(relPath: string): string | null {
  // Require exactly `<type>/<slug>` with no further nesting. Malformed
  // wikilinks like `[[categories/foo/bar]]` are ignored — they'd otherwise
  // silently map to `categories/foo.md` via startsWith + split[1].
  const parts = relPath.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (parts[0] === 'categories') return mdCategoriesDir();
  if (parts[0] === 'domains') return mdDomainsDir();
  if (parts[0] === 'entities') return mdEntitiesDir();
  return null;
}

async function scanEntries(): Promise<ScannedEntry[]> {
  const dir = mdEntriesDir();
  if (!(await pathExists(dir))) return [];
  const files = (await listFiles(dir)).filter((f) => f.endsWith('.md'));
  const scanned: ScannedEntry[] = [];
  for (const f of files) {
    const content = await readMd(path.join(dir, f));
    const relPath = `entries/${f.replace(/\.md$/, '')}`;
    const hash = sha256(content);
    // Dedupe wikilinks per entry so a body that mentions [[domains/ai]]
    // twice doesn't produce two copies of the entry in the target's
    // reconcile prompt.
    const raw = extractWikilinks(content).filter((l) => targetDirFor(l) !== null);
    const wikilinks = [...new Set(raw)];
    scanned.push({ relPath, content, hash, wikilinks });
  }
  return scanned;
}

function groupByTarget(entries: ScannedEntry[]): Map<string, ScannedEntry[]> {
  const map = new Map<string, ScannedEntry[]>();
  for (const entry of entries) {
    for (const target of entry.wikilinks) {
      const list = map.get(target) ?? [];
      list.push(entry);
      map.set(target, list);
    }
  }
  return map;
}

export async function reconcileEntries(options: ReconcileOptions): Promise<ReconcileResult> {
  const { state, engine, touchedPages, dirtyPages } = options;
  const progress = options.progress ?? (() => {});
  const invoker: EngineInvoker = options.engineInvoker ?? invokeEngineAsync;

  const logLine = async (msg: string): Promise<void> => {
    progress(msg);
    try { await appendLine(mdLogPath(), logEntry('reconcile', msg)); } catch { /* best effort */ }
  };

  const result: ReconcileResult = {
    pagesReconciled: 0,
    pagesUnchanged: 0,
    pagesSkipped: 0,
    pagesFailed: 0,
    aborted: false,
  };

  state.entryHashes ??= {};

  const scanned = await scanEntries();
  if (scanned.length === 0) return result;

  const targetMap = groupByTarget(scanned);
  if (targetMap.size === 0) return result;

  progress(`Reconciling ${targetMap.size} target page(s) against ${scanned.length} entries...`);

  let consecutiveFailures = 0;
  let idx = 0;

  for (const [targetRel, contributingEntries] of targetMap.entries()) {
    idx++;
    const tag = `[${idx}/${targetMap.size}]`;

    if (touchedPages && !touchedPages.has(targetRel)) {
      result.pagesSkipped++;
      continue;
    }

    const dir = targetDirFor(targetRel)!;
    const slugPart = targetRel.split('/')[1];
    const filePath = path.join(dir, `${slugPart}.md`);

    if (!(await pathExists(filePath))) {
      // Karpathy compounding: future compile may create this page; future reconcile picks it up.
      result.pagesSkipped++;
      await logLine(`${tag} ${targetRel} — target missing, will pick up on a later compile`);
      continue;
    }

    const isDirty = dirtyPages?.has(targetRel) ?? false;
    const hasChangedEntries = contributingEntries.some(
      (e) => state.entryHashes![e.relPath] !== e.hash,
    );
    if (!isDirty && !hasChangedEntries) {
      result.pagesUnchanged++;
      continue;
    }

    const existingContent = await readMd(filePath);
    const prompt = buildReconcilePrompt(
      targetRel,
      existingContent,
      contributingEntries.map((e) => ({ relPath: e.relPath, content: e.content })),
    );

    await logLine(`${tag} ${targetRel} — reconciling (${contributingEntries.length} entries)...`);

    let rawOutput: string;
    try {
      rawOutput = await invoker(engine, prompt, {
        timeout: RECONCILE_LLM_TIMEOUT_MS,
        maxBuffer: RECONCILE_LLM_MAX_BUFFER,
      });
    } catch (err) {
      const eie = err instanceof EngineInvocationError ? err : null;
      const label = eie?.reason ?? 'ERROR';
      const detail = (eie?.stderr.trim().split(/\r?\n/).filter(Boolean).pop())
        ?? (err as Error).message ?? String(err);
      await logLine(`${tag} ${targetRel} — ${label}: ${detail.slice(0, 200)}`);
      result.pagesFailed++;
      consecutiveFailures++;
      if (consecutiveFailures >= RECONCILE_CONSECUTIVE_FAILURE_CAP) {
        result.aborted = true;
        await logLine(`Reconcile aborted after ${RECONCILE_CONSECUTIVE_FAILURE_CAP} consecutive failures`);
        break;
      }
      continue;
    }

    const newContent = stripLlmMarkdownFence(rawOutput);
    const pageRelWithExt = `${targetRel}.md`;
    const outcome = await writePage(filePath, newContent, state, pageRelWithExt);

    if (outcome === 'unchanged') {
      result.pagesUnchanged++;
    } else {
      result.pagesReconciled++;
    }

    for (const e of contributingEntries) {
      state.entryHashes![e.relPath] = e.hash;
    }
    await writeJson(mdStatePath(), state);

    await logLine(`${tag} ${targetRel} → ${outcome}`);
    consecutiveFailures = 0;
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────────
// Concepts → entries migration — Phase 4
// ──────────────────────────────────────────────────────────────────────────
//
// Debate 2 deprecated the `concepts/` lane in favor of a unified `entries/`
// directory. Legacy `ft ask --save` output under `concepts/` is rewritten
// into entry-shaped frontmatter and moved on every `ft wiki` run. Idempotent:
// after the first successful migration the concepts/ dir is empty and the
// function is a no-op. Safe to run repeatedly.

export interface MigrateConceptsResult {
  migrated: number;
  skipped: number;
  failed: number;
}

export interface MigrateConceptsOptions {
  progress?: (s: string) => void;
}

/**
 * Rewrites a legacy `concepts/` file's frontmatter into the new entry shape.
 *
 * Old shape (from `md-ask.ts` pre-refactor save block):
 *   ---
 *   tags: [ft/concept]
 *   question: "…"
 *   source_type: bookmarks
 *   last_updated: YYYY-MM-DD
 *   ---
 *
 * New shape:
 *   ---
 *   tags: [ft/entry, ft/concept]
 *   source_type: ask         # or 'authored' if no question field was present
 *   question: "…"            # only when source_type: ask
 *   last_updated: YYYY-MM-DD
 *   ---
 *
 * Body is preserved verbatim. If the input has no recognizable frontmatter
 * block, a minimal entry frontmatter is prepended and the entire original
 * content is treated as the body — preserves hand-edited files.
 */
function rewriteConceptFrontmatter(content: string, today: string): string {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return [
      '---',
      'tags: [ft/entry, ft/concept]',
      'source_type: authored',
      `last_updated: ${today}`,
      '---',
      '',
      content.trimStart(),
    ].join('\n');
  }

  const [, frontmatter, body] = match;
  const fields: Record<string, string> = {};
  for (const line of frontmatter.split('\n')) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (m) fields[m[1]] = m[2];
  }

  const hasQuestion = Boolean(fields.question);
  const sourceType = hasQuestion ? 'ask' : 'authored';
  const lastUpdated = fields.last_updated ?? today;

  const newFrontmatter: string[] = [
    '---',
    'tags: [ft/entry, ft/concept]',
    `source_type: ${sourceType}`,
  ];
  if (hasQuestion) newFrontmatter.push(`question: ${fields.question}`);
  newFrontmatter.push(`last_updated: ${lastUpdated}`, '---');

  return `${newFrontmatter.join('\n')}\n${body.replace(/^\n*/, '')}`;
}

export async function migrateConceptsToEntries(
  options: MigrateConceptsOptions = {},
): Promise<MigrateConceptsResult> {
  const progress = options.progress ?? (() => {});
  const result: MigrateConceptsResult = { migrated: 0, skipped: 0, failed: 0 };

  const conceptsDir = mdConceptsDir();
  if (!(await pathExists(conceptsDir))) return result;

  const files = (await listFiles(conceptsDir)).filter((f) => f.endsWith('.md'));
  if (files.length === 0) return result;

  const today = new Date().toISOString().slice(0, 10);

  for (const filename of files) {
    const oldPath = path.join(conceptsDir, filename);
    const newPath = path.join(mdEntriesDir(), filename);
    const relPath = `entries/${filename.replace(/\.md$/, '')}`;

    if (await pathExists(newPath)) {
      // Destination already has a file — either this ran before or there's
      // a legitimate collision. Skip without touching either file.
      result.skipped++;
      progress(`concepts/${filename} → entries/ (skipped: destination exists)`);
      continue;
    }

    try {
      const original = await readMd(oldPath);
      const migrated = rewriteConceptFrontmatter(original, today);
      await writeMd(newPath, migrated);
      await fs.rm(oldPath);
      await appendLine(mdLogPath(), logEntry('migrate', `${relPath} <- concepts/${filename.replace(/\.md$/, '')}`));
      result.migrated++;
      progress(`concepts/${filename} → ${relPath}`);
    } catch (err) {
      result.failed++;
      await appendLine(
        mdLogPath(),
        logEntry('migrate', `FAILED ${filename}: ${(err as Error).message ?? String(err)}`),
      );
    }
  }

  return result;
}

// ── Test exports ──────────────────────────────────────────────────────────
export const yamlEscapeDoubleQuotedForTest = yamlEscapeDoubleQuoted;
export const targetDirForTest = targetDirFor;
export const scanEntriesForTest = scanEntries;
export const groupByTargetForTest = groupByTarget;
export const rewriteConceptFrontmatterForTest = rewriteConceptFrontmatter;
