#!/usr/bin/env node
import { Command } from 'commander';
import { syncTwitterBookmarks } from './bookmarks.js';
import { getBookmarkStatusView, formatBookmarkStatus } from './bookmarks-service.js';
import { runTwitterOAuthFlow } from './xauth.js';
import { syncBookmarksGraphQL, syncGaps, syncBookmarkFolders } from './graphql-bookmarks.js';
import type { SyncProgress, GapFillProgress, FolderSyncProgress } from './graphql-bookmarks.js';
import type { BookmarkFolder } from './types.js';
import { fetchBookmarkMediaBatch } from './bookmark-media.js';
import {
  buildIndex,
  searchBookmarks,
  formatSearchResults,
  getStats,
  classifyAndRebuild,
  getCategoryCounts,
  sampleByCategory,
  getDomainCounts,
  getFolderCounts,
  listBookmarks,
  getBookmarkById,
} from './bookmarks-db.js';
import { formatClassificationSummary } from './bookmark-classify.js';
import { classifyWithLlm, classifyDomainsWithLlm } from './bookmark-classify-llm.js';
import { resolveEngine, detectAvailableEngines } from './engine.js';
import { loadPreferences, savePreferences } from './preferences.js';
import { compileMd } from './md.js';
import { askMd } from './md-ask.js';
import { lintMd, fixLintIssues } from './md-lint.js';
import { exportBookmarks } from './md-export.js';
import { renderViz } from './bookmarks-viz.js';
import { listBrowserIds } from './browsers.js';
import { dataDir, ensureDataDir, isFirstRun, migrateLegacyIdeasData, twitterBookmarksIndexPath, twitterBackfillStatePath, mdDir } from './paths.js';
import { PromptCancelledError, promptText } from './prompt.js';
import { skillWithFrontmatter, installSkill, uninstallSkill } from './skill.js';
import {
  formatIdeasIntro,
  formatRunList,
  formatRunSummary,
  getIdeaPrompt,
  listIdeaRuns,
  renderRunDots,
  renderRunGrid,
  runIdeas,
  resolveIdeaRun,
} from './ideas.js';
import {
  createIdeasSeedFromArtifacts,
  createIdeasSeedFromText,
  deleteIdeasSeed,
  formatIdeasSeed,
  formatIdeasSeedList,
  listIdeasSeeds,
  pickMostRecentlyUsedSeed,
  readIdeasSeed,
} from './ideas-seeds.js';
import {
  addRepoToRegistry,
  clearReposRegistry,
  listSavedRepos,
  removeRepoFromRegistry,
  resolveRepoList,
} from './ideas-repos.js';
import { runPossibleWizard } from './possible-wizard.js';
import { DEFAULT_FRAMES } from './adjacent/frames.js';
import {
  addUserFrameFromFile,
  getFrame,
  listAllFrames,
  loadUserFrames,
  removeUserFrame,
  validateOptionalFrameId,
} from './frames-registry.js';
import {
  SEED_STRATEGIES,
  buildSeedStrategySpec,
  generateRandomSeedPrompts,
  getSeedStrategy,
  summarizeSeedIntent,
} from './seeds-strategies.js';
import { formatSeedCandidates, queryRandomSeedCandidates, querySeedCandidates } from './seeds-query.js';
import { formatSeedOrganization, organizeSeedCandidatesBy } from './seeds-organize.js';
import { modelOrganizeSeeds } from './seeds-model.js';
import { saveSeedFromCandidates } from './seeds-save.js';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// ── Helpers ─────────────────────────────────────────────────────────────────

const SPINNER = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
let spinnerIdx = 0;

/** Creates a spinner that animates independently of data callbacks. */
function createSpinner(renderLine: () => string): { update: () => void; stop: () => void } {
  let line = '';
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const spin = SPINNER[spinnerIdx++ % SPINNER.length];
    process.stderr.write(`\r\x1b[K  ${spin} ${line}`);
  };
  const interval = setInterval(tick, 80);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    process.stderr.write('\n');
  };

  // Graceful interrupt — stop spinner, show friendly message
  const onSigint = () => {
    stop();
    console.log('\n  Interrupted. Your data is safe \u2014 progress has been saved.');
    console.log('  Run the same command again to pick up where you left off.\n');
    process.exit(0);
  };
  process.once('SIGINT', onSigint);

  return {
    update: () => { line = renderLine(); },
    stop: () => { process.removeListener('SIGINT', onSigint); stop(); },
  };
}

export async function runWithSpinner<T>(
  spinner: { stop: () => void },
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } finally {
    spinner.stop();
  }
}

const FRIENDLY_STOP_REASONS: Record<string, string> = {
  'caught up to newest stored bookmark': 'All caught up \u2014 no new bookmarks since last sync.',
  'no new bookmarks (stale)': 'Sync complete \u2014 reached the end of new bookmarks.',
  'end of bookmarks': 'Sync complete \u2014 all bookmarks fetched.',
  'max runtime reached': 'Paused after 30 minutes. Run again to continue.',
  'max pages reached': 'Paused after reaching page limit. Run again to continue.',
  'target additions reached': 'Reached target bookmark count.',
};

function friendlyStopReason(raw?: string): string {
  if (!raw) return 'Sync complete.';
  return FRIENDLY_STOP_REASONS[raw] ?? `Sync complete \u2014 ${raw}`;
}

function warnIfEmpty(totalBookmarks: number): void {
  if (totalBookmarks > 0) return;
  console.log(`  \u26a0 No bookmarks were found. This usually means:`);
  console.log(`    \u2022 The browser needs to be fully quit first (Cmd+Q / close all windows)`);
  console.log(`    \u2022 Keychain/keyring access was denied`);
  console.log(`    \u2022 You may be logged into a different profile than the one with X/Twitter`);
  console.log(`    \u2022 Try: ft sync --cookies <ct0> <auth_token>  (paste from DevTools)\n`);
}

// ── Update checker ────────────────────────────────────────────────────────

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

function getLocalVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json');
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

async function checkForUpdate(): Promise<void> {
  try {
    const cacheFile = path.join(dataDir(), '.update-check');
    // Re-fetch from npm if cache is stale (>24hr)
    let needsFetch = true;
    try {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < UPDATE_CHECK_INTERVAL_MS) needsFetch = false;
    } catch { /* file doesn't exist, fetch */ }

    if (needsFetch) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('https://registry.npmjs.org/fieldtheory/latest', {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json() as any;
        if (data?.version) fs.writeFileSync(cacheFile, data.version);
      }
    }

    // Always show notice from cache
    showCachedUpdateNotice();
  } catch { /* network error, offline, etc — silently skip */ }
}

/** Sync version — reads cached check result. Used after help output where we can't await. */
function showCachedUpdateNotice(): void {
  try {
    const cacheFile = path.join(dataDir(), '.update-check');
    const latest = fs.readFileSync(cacheFile, 'utf-8').trim();
    const local = getLocalVersion();
    if (latest && compareVersions(latest, local) > 0) {
      console.log(`\n  \u2728 Update available: ${local} \u2192 ${latest}  \u2014  npm update -g fieldtheory`);
    }
  } catch { /* no cache yet, skip */ }
}

// ── What's new ────────────────────────────────────────────────────────────

const WHATS_NEW: Record<string, string[]> = {
  '1.3.5': [
    'ft sync --folders \u2014 sync X bookmark folder tags (read-only mirror)',
    'ft sync --folder <name> \u2014 sync a single folder by name',
    'ft list --folder <name> \u2014 filter bookmarks by folder',
    'ft folders \u2014 show folder distribution',
    'Security: SSRF fix in article enrichment (redirect chains now validated per hop)',
    'Durability: writes are now crash-safe against power loss (fsync)',
    'ft search handles punctuation like foo(bar) without FTS errors',
  ],
  '1.2.2': [
    'ft sync --gaps \u2014 backfill missing quoted tweets and expand truncated articles',
    'Quoted tweet content and full article text now captured automatically during sync',
    'Bookmark date (when you bookmarked, not just when it was posted) now tracked',
    'ft sync --rebuild replaces --full',
    'Update notifications when a new version is available',
  ],
};

function showWhatsNew(): void {
  const version = getLocalVersion();
  const versionFile = path.join(dataDir(), '.last-version');

  let lastSeen: string | undefined;
  try { lastSeen = fs.readFileSync(versionFile, 'utf-8').trim(); } catch { /* first run */ }

  // Update the stored version
  try { fs.writeFileSync(versionFile, version); } catch { /* read-only, etc */ }

  if (!lastSeen || lastSeen === version) return;

  // Collect features from all versions newer than lastSeen
  const newFeatures: string[] = [];
  for (const [v, features] of Object.entries(WHATS_NEW)) {
    if (compareVersions(v, lastSeen) > 0 && compareVersions(v, version) <= 0) {
      newFeatures.push(...features);
    }
  }

  if (newFeatures.length === 0) return;

  console.log(`\n  \x1b[1mWhat's new in v${version}:\x1b[0m`);
  for (const feature of newFeatures) {
    console.log(`    \u2022 ${feature}`);
  }
  console.log();
}

function logo(): string {
  const v = getLocalVersion();
  const vLabel = `v${v}`;
  const innerW = 33;
  const line1 = 'F i e l d   T h e o r y';
  const line2 = 'fieldtheory.dev/cli';
  const pad1 = innerW - line1.length - 3;
  const pad2 = innerW - line2.length - vLabel.length - 4;
  return `
     \x1b[2m\u250c${'\u2500'.repeat(innerW)}\u2510\x1b[0m
     \x1b[2m\u2502\x1b[0m  \x1b[1m${line1}\x1b[0m${' '.repeat(pad1)} \x1b[2m\u2502\x1b[0m
     \x1b[2m\u2502\x1b[0m  \x1b[2m${line2}\x1b[0m${' '.repeat(Math.max(pad2, 1))}\x1b[2m${vLabel}\x1b[0m  \x1b[2m\u2502\x1b[0m
     \x1b[2m\u2514${'\u2500'.repeat(innerW)}\u2518\x1b[0m`;
}

export function showWelcome(): void {
  console.log(logo());
  console.log(`
  Save a local copy of your X/Twitter bookmarks. Search them,
  classify them, and make them available to any AI agent.
  Your data never leaves your machine.

  Get started:

    1. Open your browser and log into x.com
    2. Run: ft sync

  Works with Chrome, Brave, Chromium, and Firefox on macOS/Linux.
  Data will be stored at: ${dataDir()}
`);
}

export async function showDashboard(): Promise<void> {
  console.log(logo());
  try {
    const view = await getBookmarkStatusView();
    const ago = view.lastUpdated ? timeAgo(view.lastUpdated) : 'never';
    console.log(`
  \x1b[1m${view.bookmarkCount.toLocaleString()}\x1b[0m bookmarks  \x1b[2m\u2502\x1b[0m  last synced \x1b[1m${ago}\x1b[0m  \x1b[2m\u2502\x1b[0m  ${dataDir()}
`);

    if (fs.existsSync(twitterBookmarksIndexPath())) {
      const counts = await getCategoryCounts();
      const cats = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7);
      if (cats.length > 0) {
        const catLine = cats.map(([c, n]) => `${c} (${n})`).join(' \u00b7 ');
        console.log(`  \x1b[2m${catLine}\x1b[0m`);
      }
    }

    console.log(`
  \x1b[2mSync now:\x1b[0m     ft sync
  \x1b[2mSearch:\x1b[0m       ft search "query"
  \x1b[2mExplore:\x1b[0m      ft viz
  \x1b[2mAll commands:\x1b[0m  ft --help
`);
  } catch {
    console.log(`
  Data: ${dataDir()}

  Run: ft sync
`);
  }
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function showSyncWelcome(): void {
  const browsers = listBrowserIds().join(', ');
  console.log(`
  Make sure your browser is open and logged into x.com.
  Your browser session is used to authenticate \u2014 no passwords
  are stored or transmitted.

  Browser ids: ${browsers}
  Use --browser <name> to choose.
  Default auto-detect prefers installed Chrome-family browsers.
  Firefox on Windows requires Node.js 22.5+ or sqlite3 on PATH.
`);
}

/** Check that bookmarks have been synced. Returns true if data exists. */
function requireData(): boolean {
  if (isFirstRun()) {
    console.log(`
  No bookmarks synced yet.

  Get started:

    1. Open your browser and log into x.com
    2. Run: ft sync
`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

/** Check that the search index exists. Returns true if it does. */
function requireIndex(): boolean {
  if (!requireData()) return false;
  if (!fs.existsSync(twitterBookmarksIndexPath())) {
    console.log(`
  Search index not built yet.

  Run: ft index
`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

/**
 * Strip control characters and ANSI escape sequences from user-controlled
 * strings before printing them. Folder names come from X — in principle
 * the user controls them, but if their account is compromised an attacker
 * could set a folder name that wipes the terminal or injects escape codes.
 * Replacement character keeps lengths roughly stable for padding.
 */
export function sanitizeForDisplay(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, '?');
}

export function formatFolderMirrorStats(stats: { added: number; tagged: number; untagged: number; unchanged: number }): string {
  const parts: string[] = [];
  if (stats.added > 0) parts.push(`${stats.added} new`);
  if (stats.tagged > 0) parts.push(`${stats.tagged} tagged`);
  if (stats.untagged > 0) parts.push(`${stats.untagged} removed`);
  if (stats.unchanged > 0) parts.push(`${stats.unchanged} unchanged`);
  return parts.length > 0 ? parts.join(', ') : 'no changes';
}

/**
 * Resolve a folder query to a specific folder, case-insensitive.
 * Priority: exact match > unambiguous prefix. Ambiguity/no-match throws.
 * Trims whitespace on both sides so `"  Coding  "` matches `"Coding"`.
 */
export function resolveFolder(folders: BookmarkFolder[], query: string): BookmarkFolder {
  const lower = query.trim().toLowerCase();
  const exact = folders.find((f) => f.name.trim().toLowerCase() === lower);
  if (exact) return exact;
  const prefix = folders.filter((f) => f.name.trim().toLowerCase().startsWith(lower));
  if (prefix.length === 1) return prefix[0];
  if (prefix.length > 1) {
    throw new Error(
      `Multiple folders match "${query}": ${prefix.map((f) => f.name).join(', ')}. Be more specific.`
    );
  }
  const available = folders.map((f) => f.name).join(', ') || '(none)';
  throw new Error(`No folder matches "${query}". Available: ${available}`);
}

/**
 * Format and print the human-facing summary of an `ft ideas run` invocation.
 * Single-repo and multi-repo runs share most of the output but diverge on the
 * "complete" header, the per-line repo tag, and the "next steps" suggestions.
 */
function printIdeasRunReport(summary: import('./ideas.js').IdeasRunSummary): void {
  const isBatch = summary.runIds.length > 1;
  if (isBatch) {
    console.log(`\n  ✓ Ideas batch complete: ${summary.batchId}`);
    console.log(`  Runs: ${summary.runIds.length} (one per repo)`);
  } else {
    console.log(`\n  ✓ Ideas run complete: ${summary.runIds[0]}`);
  }
  console.log(`  Frame: ${summary.frameName}`);
  console.log(`  Ideas generated: ${summary.dotCount}`);

  if (summary.topDots.length > 0) {
    console.log(`\n  Top ideas${isBatch ? ' across all repos' : ''}:`);
    for (const dot of summary.topDots) {
      const repoTag = isBatch ? `  (${path.basename(dot.repo)})` : '';
      console.log(`    - ${dot.title}  [A:${dot.axisAScore} B:${dot.axisBScore}]${repoTag}`);
    }
  }

  console.log(`\n  Next:`);
  if (isBatch) {
    for (const runId of summary.runIds) {
      console.log(`    ft ideas grid ${runId}`);
    }
  } else {
    console.log(`    ft ideas grid ${summary.runIds[0]}`);
    console.log(`    ft ideas dots ${summary.runIds[0]}`);
  }
}

/** Wrap an async action with graceful error handling. */
function safe(fn: (...args: any[]) => Promise<void>): (...args: any[]) => Promise<void> {
  return async (...args: any[]) => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof PromptCancelledError) {
        console.log(`\n  ${err.message}\n`);
        process.exitCode = err.exitCode;
        return;
      }
      const msg = (err as Error).message;
      console.error(`\n  Error: ${msg}\n`);
      process.exitCode = 1;
    }
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function buildCli() {
  // One-time migration of ideas data from ~/.ft-bookmarks/automation/{ideas,adjacent}/
  // to ~/.fieldtheory/ideas/. Idempotent and cheap on hot paths — two fs.existsSync
  // calls after the first run. Runs before any command so every subcommand sees
  // the new layout.
  try {
    const migration = migrateLegacyIdeasData();
    if (migration.migrated) {
      process.stderr.write(`  Migrated ideas data → ${migration.newRoot}\n`);
      process.stderr.write(`  Legacy copies left intact at ${migration.legacyIdeasRoot} and ${migration.legacyAdjacentRoot}.\n`);
    }
  } catch (err) {
    process.stderr.write(`  Warning: ideas data migration failed — ${(err as Error).message}\n`);
  }

  const program = new Command();

  async function rebuildIndex(): Promise<number> {
    process.stderr.write('  Building search index...\n');
    const idx = await buildIndex();
    process.stderr.write(`  \u2713 ${idx.recordCount} bookmarks indexed (${idx.newRecords} new)\n`);
    return idx.newRecords;
  }

  async function classifyNew(): Promise<void> {
    const engine = await resolveEngine();

    const start = Date.now();
    process.stderr.write('  Classifying new bookmarks (categories)...\n');
    const catResult = await classifyWithLlm({
      engine,
      onBatch: (done: number, total: number) => {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const elapsed = Math.round((Date.now() - start) / 1000);
        process.stderr.write(`  Categories: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
      },
    });
    if (catResult.classified > 0) {
      process.stderr.write(`  \u2713 ${catResult.classified} categorized\n`);
    }

    const domStart = Date.now();
    process.stderr.write('  Classifying new bookmarks (domains)...\n');
    const domResult = await classifyDomainsWithLlm({
      engine,
      all: false,
      onBatch: (done: number, total: number) => {
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const elapsed = Math.round((Date.now() - domStart) / 1000);
        process.stderr.write(`  Domains: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
      },
    });
    if (domResult.classified > 0) {
      process.stderr.write(`  \u2713 ${domResult.classified} domains assigned\n`);
    }
  }

  program
    .name('ft')
    .description('Self-custody for your X/Twitter bookmarks. Sync, search, classify, and explore locally.')
    .version(getLocalVersion())
    .showHelpAfterError()
    .hook('preAction', () => {
      console.log(logo());
      showWhatsNew();
    });

  // ── sync ────────────────────────────────────────────────────────────────

  program
    .command('sync')
    .description('Sync bookmarks from X into your local database')
    .option('--api', 'Use OAuth v2 API instead of Chrome session', false)
    .option('--rebuild', 'Full re-crawl of all bookmarks', false)
    .option('--continue', 'Resume a previous sync that was interrupted or hit the page limit', false)
    .option('--gaps', 'Backfill missing data (quoted tweets, truncated articles, linked article content)', false)
    .option('--yes', 'Skip confirmation prompts', false)
    .option('--classify', 'Classify new bookmarks with LLM after syncing', false)
    .option('--max-pages <n>', 'Max pages to fetch (default: unlimited)', (v: string) => Number(v))
    .option('--target-adds <n>', 'Stop after N new bookmarks', (v: string) => Number(v))
    .option('--delay-ms <n>', 'Delay between requests in ms', (v: string) => Number(v), 600)
    .option('--max-minutes <n>', 'Max runtime in minutes', (v: string) => Number(v), 30)
    .option('--browser <name>', 'Browser to read session from (chrome, chromium, brave, firefox, ...)')
    .option('--cookies <values...>', 'Pass ct0 and auth_token directly (skips browser extraction)')
    .option('--chrome-user-data-dir <path>', 'Chrome-family user-data directory')
    .option('--chrome-profile-directory <name>', 'Chrome-family profile name')
    .option('--firefox-profile-dir <path>', 'Firefox profile directory')
    .option('--folders', 'Also sync bookmark folder tags (mirrors X\u2019s current folder state)', false)
    .option('--folder <name>', 'Sync only this folder (case-insensitive, supports unambiguous prefix)')
    .action(async (options) => {
      const firstRun = isFirstRun();
      if (firstRun) showSyncWelcome();
      ensureDataDir();

      try {
        const mutuallyExclusive = [options.rebuild, options.continue, options.gaps].filter(Boolean).length;
        if (mutuallyExclusive > 1) {
          console.error('  Error: --rebuild, --continue, and --gaps cannot be used together.');
          process.exitCode = 1;
          return;
        }

        // Folder flags: --folders (all) and --folder <name> (one) are mutually exclusive.
        const folderAll = Boolean(options.folders);
        const folderName = options.folder ? String(options.folder) : undefined;
        if (folderAll && folderName) {
          console.error('  Error: --folders and --folder cannot be used together. Pick one.');
          process.exitCode = 1;
          return;
        }
        const folderMode: 'off' | 'all' | 'one' = folderName ? 'one' : folderAll ? 'all' : 'off';
        if (folderMode !== 'off' && options.api) {
          console.error('  Error: Folder sync requires browser session (GraphQL). Remove --api.');
          process.exitCode = 1;
          return;
        }
        if (folderMode !== 'off' && options.gaps) {
          console.error('  Error: --folders/--folder cannot be combined with --gaps. Run them separately.');
          process.exitCode = 1;
          return;
        }

        // ── gaps mode: backfill missing data for existing bookmarks ──
        if (options.gaps) {
          const startTime = Date.now();
          process.stderr.write('  Filling gaps (quoted tweets, truncated text, articles)...\n');
          let lastProgress: GapFillProgress = { done: 0, total: 0, quotedFetched: 0, textExpanded: 0, articlesEnriched: 0, failed: 0 };
          const spinner = createSpinner(() => {
            const p = lastProgress;
            const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const parts = [`${p.done}/${p.total} (${pct}%)`];
            if (p.quotedFetched) parts.push(`${p.quotedFetched} quoted`);
            if (p.textExpanded) parts.push(`${p.textExpanded} expanded`);
            if (p.articlesEnriched) parts.push(`${p.articlesEnriched} articles`);
            if (p.failed) parts.push(`${p.failed} failed`);
            parts.push(`${elapsed}s`);
            return parts.join(' \u2502 ');
          });
          const result = await runWithSpinner(spinner, () => syncGaps({
            delayMs: Number(options.delayMs) || 300,
            onProgress: (progress: GapFillProgress) => {
              lastProgress = progress;
              spinner.update();
            },
          }));
          if (result.total === 0 && result.bookmarkedAtRepaired === 0) {
            console.log('  No gaps found \u2014 all bookmarks are fully enriched.');
          } else {
            if (result.quotedTweetsFilled > 0) console.log(`  \u2713 ${result.quotedTweetsFilled} quoted tweets filled`);
            if (result.textExpanded > 0) console.log(`  \u2713 ${result.textExpanded} truncated texts expanded`);
            if (result.articlesEnriched > 0) console.log(`  \u2713 ${result.articlesEnriched} linked articles enriched`);
            if (result.bookmarkedAtRepaired > 0) {
              console.log(`  \u2713 ${result.bookmarkedAtRepaired} invalid bookmark dates cleared`);
              await rebuildIndex();
            }
            if (result.failed > 0) {
              // Write failure log
              const logPath = path.join(dataDir(), 'gaps-failures.json');
              const byReason: Record<string, number> = {};
              for (const f of result.failures) {
                byReason[f.reason] = (byReason[f.reason] ?? 0) + 1;
              }
              fs.writeFileSync(logPath, JSON.stringify({ failures: result.failures, summary: byReason }, null, 2), { mode: 0o600 });

              console.log(`  ${result.failed} unavailable:`);
              for (const [reason, count] of Object.entries(byReason)) {
                console.log(`    \u2022 ${count} ${reason}`);
              }
              console.log(`  Details: ${logPath}`);
            }
            if (result.bookmarkedAtMissing > 0) {
              console.log(`  ${result.bookmarkedAtMissing} bookmarks missing a reliable bookmark date`);
            }
          }
          return;
        }

        // ── rebuild confirmation ──
        if (options.rebuild) {
          const dir = dataDir();
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const backupDir = `${dir}-backup-${timestamp}`;

          console.log(`  \u26a0 Rebuild will re-crawl all bookmarks from X.`);
          console.log(`  Your existing data will be merged (not deleted), but`);
          console.log(`  this is a full re-sync and may take a while.\n`);
          console.log(`  To back up first, run:`);
          console.log(`    cp -r ${dir} ${backupDir}\n`);

          // Allow --yes to skip confirmation
          if (!options.yes) {
            const answer = await promptText('  Continue? (y/N) ', { output: process.stdout });
            if (answer.kind === 'interrupt') {
              throw new PromptCancelledError('Cancelled. Rebuild aborted.', 130);
            }
            if (answer.kind !== 'answer' || answer.value.toLowerCase() !== 'y') {
              console.log('  Aborted.');
              return;
            }
          }
        }

        const useApi = Boolean(options.api);
        const mode = Boolean(options.rebuild) ? 'full' : 'incremental';

        if (useApi) {
          const result = await syncTwitterBookmarks(mode, {
            targetAdds: typeof options.targetAdds === 'number' && !Number.isNaN(options.targetAdds) ? options.targetAdds : undefined,
          });
          console.log(`\n  \u2713 ${result.added} new bookmarks synced (${result.totalBookmarks} total)`);
          console.log(`  \u2713 Data: ${dataDir()}\n`);
          warnIfEmpty(result.totalBookmarks);
          const newCount = await rebuildIndex();
          if (options.classify && newCount > 0) {
            await classifyNew();
          }
        } else {
          const startTime = Date.now();
          let lastSync: SyncProgress = { page: 0, totalFetched: 0, newAdded: 0, running: true, done: false };
          const spinner = createSpinner(() => {
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            if (lastSync.stopReason && lastSync.running) {
              return `${lastSync.stopReason}  \u2502  ${lastSync.newAdded} new  \u2502  ${elapsed}s`;
            }
            return `Syncing bookmarks...  ${lastSync.newAdded} new  \u2502  page ${lastSync.page}  \u2502  ${elapsed}s`;
          });
          // Parse --cookies <ct0> [auth_token] — variadic, gives us an array
          let csrfToken: string | undefined;
          let cookieHeader: string | undefined;
          if (options.cookies && Array.isArray(options.cookies) && options.cookies.length > 0) {
            csrfToken = String(options.cookies[0]);
            const authToken = options.cookies.length > 1 ? String(options.cookies[1]) : undefined;
            const parts = [`ct0=${csrfToken}`];
            if (authToken) parts.push(`auth_token=${authToken}`);
            cookieHeader = parts.join('; ');
          }

          // Load saved cursor for --continue mode
          let resumeCursor: string | undefined;
          if (options.continue) {
            try {
              const statePath = twitterBackfillStatePath();
              const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
              resumeCursor = state?.lastCursor;
            } catch { /* no state file yet */ }
            if (resumeCursor) {
              console.log('  Resuming from saved position...\n');
            } else {
              console.log('  No saved cursor — scanning past existing bookmarks to find new ones...\n');
            }
          }

          // When continuing without a cursor, disable stale page limit so we can
          // page through all existing bookmarks to reach the ones beyond the old cap.
          // With a saved cursor we skip straight to where we left off, so the normal
          // stale limit is fine.
          const continueWithoutCursor = Boolean(options.continue) && !resumeCursor;

          const result = await runWithSpinner(spinner, () => syncBookmarksGraphQL({
            incremental: !Boolean(options.rebuild) && !Boolean(options.continue),
            resumeCursor,
            stalePageLimit: continueWithoutCursor ? Infinity : undefined,
            maxPages: options.maxPages != null ? Number(options.maxPages) : undefined,
            targetAdds: typeof options.targetAdds === 'number' && !Number.isNaN(options.targetAdds) ? options.targetAdds : undefined,
            delayMs: Number(options.delayMs) || 600,
            maxMinutes: Number(options.maxMinutes) || 30,
            browser: options.browser ? String(options.browser) : undefined,
            csrfToken,
            cookieHeader,
            chromeUserDataDir: options.chromeUserDataDir ? String(options.chromeUserDataDir) : undefined,
            chromeProfileDirectory: options.chromeProfileDirectory ? String(options.chromeProfileDirectory) : undefined,
            firefoxProfileDir: options.firefoxProfileDir ? String(options.firefoxProfileDir) : undefined,
            onProgress: (status: SyncProgress) => {
              lastSync = status;
              spinner.update();
            },
          }));

          console.log(`\n  \u2713 ${result.added} new bookmarks synced (${result.totalBookmarks} total)`);
          console.log(`  ${friendlyStopReason(result.stopReason)}`);
          if (result.bookmarkedAtRepaired > 0) {
            console.log(`  \u2713 ${result.bookmarkedAtRepaired} invalid bookmark dates cleared`);
          }
          if (result.bookmarkedAtMissing > 0) {
            console.log(`  ${result.bookmarkedAtMissing} bookmarks missing a reliable bookmark date`);
          }
          console.log(`  \u2713 Data: ${dataDir()}\n`);

          warnIfEmpty(result.totalBookmarks);

          // ── Folder sync (runs after main timeline when --folders is passed) ──
          if (folderMode !== 'off') {
            try {
              process.stderr.write(`\n  Syncing bookmark folders...\n`);
              const folderResult = await syncBookmarkFolders({
                csrfToken,
                cookieHeader,
                browser: options.browser ? String(options.browser) : undefined,
                chromeUserDataDir: options.chromeUserDataDir ? String(options.chromeUserDataDir) : undefined,
                chromeProfileDirectory: options.chromeProfileDirectory ? String(options.chromeProfileDirectory) : undefined,
                firefoxProfileDir: options.firefoxProfileDir ? String(options.firefoxProfileDir) : undefined,
                delayMs: Number(options.delayMs) || 600,
                onlyFolderName: folderMode === 'one' ? folderName : undefined,
                onProgress: (status: FolderSyncProgress) => {
                  if (status.phase === 'walking' && status.folder) {
                    process.stderr.write(`  \u2192 ${sanitizeForDisplay(status.folder.name)}...\n`);
                  }
                },
              });

              // Summary output — one line per folder that we actually walked
              const synced = folderResult.perFolder.filter((f) => f.stats);
              if (synced.length > 0) {
                console.log('');
                for (const { folder, stats } of synced) {
                  if (!stats) continue;
                  const safeName = sanitizeForDisplay(folder.name);
                  console.log(`  \u2713 ${safeName.padEnd(24)}  ${formatFolderMirrorStats(stats)}`);
                }
              }

              if (folderResult.skippedFolders.length > 0) {
                console.log('');
                for (const { folder, reason } of folderResult.skippedFolders) {
                  console.log(`  \u26a0 Skipped ${sanitizeForDisplay(folder.name)}: ${reason}`);
                }
                const retryCmd = folderMode === 'one' ? `ft sync --folder "${folderName}"` : `ft sync --folders`;
                console.log(`  Re-run \`${retryCmd}\` to retry.`);
              }

              if (folderResult.orphanFoldersCleared.length > 0) {
                const total = folderResult.orphanFoldersCleared.reduce((a, b) => a + b.recordsAffected, 0);
                console.log(`\n  \u2713 Cleaned up ${total} tags from ${folderResult.orphanFoldersCleared.length} deleted folder(s).`);
              }

              console.log('');
            } catch (err) {
              console.error(`\n  Folder sync error: ${(err as Error).message}\n`);
              // Continue — main sync already succeeded, folders are bonus
            }
          }

          const newCount = await rebuildIndex();
          if (options.classify && newCount > 0) {
            await classifyNew();
          }
        }

        if (firstRun) {
          console.log(`\n  Next steps:`);
          console.log(`        ft classify              Classify by category and domain (LLM)`);
          console.log(`        ft classify --regex      Classify by category (simple)`);
          console.log(`\n  Explore:`);
          console.log(`        ft search "machine learning"`);
          console.log(`        ft viz`);
          console.log(`        ft categories`);
          console.log(`\n  You can also just tell Claude to use the ft CLI to search and`);
          console.log(`  explore your bookmarks. It already knows how.\n`);
        }

      } catch (err) {
        const msg = (err as Error).message;
        if (firstRun && (msg.includes('cookie') || msg.includes('Cookie') || msg.includes('Keychain') || msg.includes('Safe Storage'))) {
          console.log(`
  Couldn't connect to your browser session.

  To sync your bookmarks:

    1. Open your browser and log into x.com
    2. Run: ft sync

  Options:
    ft sync --browser brave           Use a specific browser
    ft sync --browser firefox          Use Firefox
    ft sync --cookies <ct0> <auth>     Pass cookies directly
    ft sync --chrome-profile-directory "Profile 1"
`);
        } else {
          console.error(`\n  Error: ${msg}\n`);
        }
        process.exitCode = 1;
      }
    });

  // ── search ──────────────────────────────────────────────────────────────

  program
    .command('search')
    .description('Full-text search across bookmarks')
    .argument('<query>', 'Search query (supports FTS5 syntax: AND, OR, NOT, "exact phrase")')
    .option('--author <handle>', 'Filter by author handle')
    .option('--after <date>', 'Bookmarks posted after this date (YYYY-MM-DD)')
    .option('--before <date>', 'Bookmarks posted before this date (YYYY-MM-DD)')
    .option('--limit <n>', 'Max results', (v: string) => Number(v), 20)
    .action(safe(async (query: string, options) => {
      if (!requireIndex()) return;
      const results = await searchBookmarks({
        query,
        author: options.author ? String(options.author) : undefined,
        after: options.after ? String(options.after) : undefined,
        before: options.before ? String(options.before) : undefined,
        limit: Number(options.limit) || 20,
      });
      console.log(formatSearchResults(results));
    }));

  // ── list ────────────────────────────────────────────────────────────────

  program
    .command('list')
    .description('List bookmarks with filters')
    .option('--query <query>', 'Text query (FTS5 syntax)')
    .option('--author <handle>', 'Filter by author handle')
    .option('--after <date>', 'Posted after (YYYY-MM-DD)')
    .option('--before <date>', 'Posted before (YYYY-MM-DD)')
    .option('--category <category>', 'Filter by category')
    .option('--domain <domain>', 'Filter by domain')
    .option('--folder <name>', 'Filter by X bookmark folder name (exact or unambiguous prefix)')
    .option('--limit <n>', 'Max results', (v: string) => Number(v), 30)
    .option('--offset <n>', 'Offset into results', (v: string) => Number(v), 0)
    .option('--json', 'JSON output')
    .action(safe(async (options) => {
      if (!requireIndex()) return;

      // Resolve --folder to an exact name via the same exact-then-prefix rules
      // that `ft sync --folder` uses, so both flags behave identically.
      let resolvedFolder: string | undefined;
      if (options.folder) {
        const { counts } = await getFolderCounts();
        const names = Object.keys(counts);
        if (names.length === 0) {
          console.error(`  No folder data in local cache. Run: ft sync --folders`);
          process.exitCode = 1;
          return;
        }
        const stubFolders: BookmarkFolder[] = names.map((name) => ({ id: name, name }));
        resolvedFolder = resolveFolder(stubFolders, String(options.folder)).name;
      }

      const items = await listBookmarks({
        query: options.query ? String(options.query) : undefined,
        author: options.author ? String(options.author) : undefined,
        after: options.after ? String(options.after) : undefined,
        before: options.before ? String(options.before) : undefined,
        category: options.category ? String(options.category) : undefined,
        domain: options.domain ? String(options.domain) : undefined,
        folder: resolvedFolder,
        limit: Number(options.limit) || 30,
        offset: Number(options.offset) || 0,
      });
      if (options.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }
      for (const item of items) {
        const tags = [item.primaryCategory, item.primaryDomain].filter(Boolean).join(' \u00b7 ');
        const summary = item.text.length > 120 ? `${item.text.slice(0, 117)}...` : item.text;
        console.log(`${item.id}  ${item.authorHandle ? `@${item.authorHandle}` : '@?'}  ${item.postedAt?.slice(0, 10) ?? '?'}${tags ? `  ${tags}` : ''}`);
        console.log(`  ${summary}`);
        console.log(`  ${item.url}`);
        console.log();
      }
    }));

  // ── show ─────────────────────────────────────────────────────────────────

  program
    .command('show')
    .description('Show one bookmark in detail')
    .argument('<id>', 'Bookmark id')
    .option('--json', 'JSON output')
    .action(safe(async (id: string, options) => {
      if (!requireIndex()) return;
      const item = await getBookmarkById(String(id));
      if (!item) {
        console.log(`  Bookmark not found: ${String(id)}`);
        process.exitCode = 1;
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(item, null, 2));
        return;
      }
      console.log(`${item.id} \u00b7 ${item.authorHandle ? `@${item.authorHandle}` : '@?'}`);
      console.log(item.url);
      console.log(item.text);
      if (item.links.length) console.log(`links: ${item.links.join(', ')}`);
      if (item.categories) console.log(`categories: ${item.categories}`);
      if (item.domains) console.log(`domains: ${item.domains}`);
    }));

  // ── stats ───────────────────────────────────────────────────────────────

  program
    .command('stats')
    .description('Aggregate statistics from your bookmarks')
    .action(safe(async () => {
      if (!requireIndex()) return;
      const stats = await getStats();
      console.log(`Bookmarks: ${stats.totalBookmarks}`);
      console.log(`Unique authors: ${stats.uniqueAuthors}`);
      console.log(`Date range: ${stats.dateRange.earliest?.slice(0, 10) ?? '?'} to ${stats.dateRange.latest?.slice(0, 10) ?? '?'}`);
      console.log(`\nTop authors:`);
      for (const a of stats.topAuthors) console.log(`  @${a.handle}: ${a.count}`);
      console.log(`\nLanguages:`);
      for (const l of stats.languageBreakdown) console.log(`  ${l.language}: ${l.count}`);
    }));

  // ── viz ─────────────────────────────────────────────────────────────────

  program
    .command('viz')
    .description('Visual dashboard of your bookmarking patterns')
    .action(safe(async () => {
      if (!requireIndex()) return;
      console.log(await renderViz());
    }));

  // ── classify ────────────────────────────────────────────────────────────

  program
    .command('classify')
    .description('Classify bookmarks by category and domain using LLM (requires claude or codex CLI)')
    .option('--regex', 'Use simple regex classification instead of LLM')
    .action(safe(async (options) => {
      if (!requireData()) return;
      if (options.regex) {
        process.stderr.write('Classifying bookmarks (regex)...\n');
        const result = await classifyAndRebuild();
        console.log(`Indexed ${result.recordCount} bookmarks \u2192 ${result.dbPath}`);
        console.log(formatClassificationSummary(result.summary));
      } else {
        const engine = await resolveEngine();

        let catStart = Date.now();
        process.stderr.write('Classifying categories with LLM (batches of 50, ~2 min per batch)...\n');
        const catResult = await classifyWithLlm({
          engine,
          onBatch: (done: number, total: number) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const elapsed = Math.round((Date.now() - catStart) / 1000);
            process.stderr.write(`  Categories: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
          },
        });
        console.log(`\nEngine: ${catResult.engine}`);
        console.log(`Categories: ${catResult.classified}/${catResult.totalUnclassified} classified`);

        let domStart = Date.now();
        process.stderr.write('\nClassifying domains with LLM (batches of 50, ~2 min per batch)...\n');
        const domResult = await classifyDomainsWithLlm({
          engine,
          all: false,
          onBatch: (done: number, total: number) => {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const elapsed = Math.round((Date.now() - domStart) / 1000);
            process.stderr.write(`  Domains: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
          },
        });
        console.log(`\nDomains: ${domResult.classified}/${domResult.totalUnclassified} classified`);
      }
    }));

  // ── classify-domains ────────────────────────────────────────────────────

  program
    .command('classify-domains')
    .description('Classify bookmarks by subject domain using LLM (ai, finance, etc.)')
    .option('--all', 'Re-classify all bookmarks, not just missing')
    .action(safe(async (options) => {
      if (!requireData()) return;
      const engine = await resolveEngine();
      const start = Date.now();
      process.stderr.write('Classifying bookmark domains with LLM (batches of 50, ~2 min per batch)...\n');
      const result = await classifyDomainsWithLlm({
        engine,
        all: options.all ?? false,
        onBatch: (done: number, total: number) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const elapsed = Math.round((Date.now() - start) / 1000);
          process.stderr.write(`  Domains: ${done}/${total} (${pct}%) \u2502 ${elapsed}s elapsed\n`);
        },
      });
      console.log(`\nDomains: ${result.classified}/${result.totalUnclassified} classified`);
    }));

  // ── model ───────────────────────────────────────────────────────────────

  program
    .command('model')
    .description('View or change the default LLM engine for classification')
    .argument('[engine]', 'Set default engine directly (e.g. claude, codex)')
    .action(safe(async (engineArg?: string) => {
      const available = detectAvailableEngines();
      const prefs = loadPreferences();

      if (available.length === 0) {
        console.log('  No LLM engines found on PATH.');
        console.log('  Install one of:');
        console.log('    - Claude Code: https://docs.anthropic.com/en/docs/claude-code');
        console.log('    - Codex CLI:   https://github.com/openai/codex');
        return;
      }

      // Direct set: ft model claude
      if (engineArg) {
        if (!available.includes(engineArg)) {
          console.log(`  "${engineArg}" is not available. Found: ${available.join(', ')}`);
          process.exitCode = 1;
          return;
        }
        savePreferences({ ...prefs, defaultEngine: engineArg });
        console.log(`  \u2713 Default model set to ${engineArg}`);
        return;
      }

      // Interactive picker
      console.log('  Available engines:\n');
      for (const name of available) {
        const marker = name === prefs.defaultEngine ? ' (default)' : '';
        console.log(`    ${name}${marker}`);
      }
      console.log();

      if (!process.stdin.isTTY) {
        if (prefs.defaultEngine) console.log(`  Current default: ${prefs.defaultEngine}`);
        console.log('  Set with: ft model <engine>');
        return;
      }

      const answer = await promptText('  Select default: ');
      if (answer.kind === 'interrupt') {
        throw new PromptCancelledError('Cancelled. No default model saved.', 130);
      }
      if (answer.kind === 'close' || !answer.value) {
        console.log('  No default model saved.');
        return;
      }

      if (available.includes(answer.value)) {
        savePreferences({ ...prefs, defaultEngine: answer.value });
        console.log(`  \u2713 Default model set to ${answer.value}`);
      } else {
        console.log(`  "${answer.value}" is not available. Found: ${available.join(', ')}`);
        process.exitCode = 1;
      }
    }));

  // ── categories ──────────────────────────────────────────────────────────

  program
    .command('categories')
    .description('Show category distribution')
    .action(safe(async () => {
      if (!requireIndex()) return;
      const counts = await getCategoryCounts();
      if (Object.keys(counts).length === 0) {
        console.log('  No categories found. Run: ft classify');
        return;
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      for (const [cat, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        const pct = ((count / total) * 100).toFixed(1);
        console.log(`  ${cat.padEnd(14)} ${String(count).padStart(5)}  (${pct}%)`);
      }
    }));

  // ── domains ─────────────────────────────────────────────────────────────

  program
    .command('domains')
    .description('Show domain distribution')
    .action(safe(async () => {
      if (!requireIndex()) return;
      const counts = await getDomainCounts();
      if (Object.keys(counts).length === 0) {
        console.log('  No domains found. Run: ft classify-domains');
        return;
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      for (const [dom, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
        const pct = ((count / total) * 100).toFixed(1);
        console.log(`  ${dom.padEnd(20)} ${String(count).padStart(5)}  (${pct}%)`);
      }
    }));

  // ── folders ─────────────────────────────────────────────────────────────

  program
    .command('folders')
    .description('Show X bookmark folder distribution (local counts)')
    .action(safe(async () => {
      if (!requireIndex()) return;
      const { counts, untagged } = await getFolderCounts();
      if (Object.keys(counts).length === 0) {
        console.log('  No folder data. Run: ft sync --folders');
        return;
      }
      const tagged = Object.values(counts).reduce((a, b) => a + b, 0);
      const total = tagged + untagged;
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      for (const [name, count] of sorted) {
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
        console.log(`  ${sanitizeForDisplay(name).padEnd(24)} ${String(count).padStart(5)}  (${pct}%)`);
      }
      if (untagged > 0) {
        const pct = total > 0 ? ((untagged / total) * 100).toFixed(1) : '0.0';
        console.log(`  ${'(untagged)'.padEnd(24)} ${String(untagged).padStart(5)}  (${pct}%)`);
      }
      console.log(`\n  Total: ${total} bookmarks, ${Object.keys(counts).length} folder(s)`);
    }));

  // ── index ───────────────────────────────────────────────────────────────

  program
    .command('index')
    .description('Rebuild the SQLite search index from the JSONL cache')
    .option('--force', 'Drop and rebuild from scratch (loses classifications)')
    .action(safe(async (options) => {
      if (!requireData()) return;
      process.stderr.write('Building search index...\n');
      const result = await buildIndex({ force: Boolean(options.force) });
      console.log(`Indexed ${result.recordCount} bookmarks (${result.newRecords} new) \u2192 ${result.dbPath}`);
    }));

  // ── auth ────────────────────────────────────────────────────────────────

  program
    .command('auth')
    .description('Set up OAuth for API-based sync (optional, needed for ft sync --api)')
    .action(safe(async () => {
      const result = await runTwitterOAuthFlow();
      console.log(`Saved token to ${result.tokenPath}`);
      if (result.scope) console.log(`Scope: ${result.scope}`);
    }));

  // ── status ──────────────────────────────────────────────────────────────

  program
    .command('status')
    .description('Show sync status and data location')
    .action(safe(async () => {
      if (!requireData()) return;
      const view = await getBookmarkStatusView();
      console.log(formatBookmarkStatus(view));
    }));

  // ── path ────────────────────────────────────────────────────────────────

  program
    .command('path')
    .description('Print the data directory path')
    .action(() => { console.log(dataDir()); });

  // ── sample ──────────────────────────────────────────────────────────────

  program
    .command('sample')
    .description('Sample bookmarks by category')
    .argument('<category>', 'Category: tool, security, technique, launch, research, opinion, commerce')
    .option('--limit <n>', 'Max results', (v: string) => Number(v), 10)
    .action(safe(async (category: string, options) => {
      if (!requireIndex()) return;
      const results = await sampleByCategory(category, Number(options.limit) || 10);
      if (results.length === 0) {
        console.log(`  No bookmarks found with category "${category}". Run: ft classify`);
        return;
      }
      for (const r of results) {
        const text = r.text.length > 120 ? r.text.slice(0, 120) + '...' : r.text;
        console.log(`[@${r.authorHandle ?? '?'}] ${text}`);
        console.log(`  ${r.url}  [${r.categories}]`);
        if (r.githubUrls) console.log(`  github: ${r.githubUrls}`);
        console.log();
      }
    }));

  // ── fetch-media ─────────────────────────────────────────────────────────

  program
    .command('fetch-media')
    .description('Download media assets for bookmarks (static images only)')
    .option('--limit <n>', 'Max bookmarks to process', (v: string) => Number(v), 100)
    .option('--max-bytes <n>', 'Per-asset byte limit', (v: string) => Number(v), 50 * 1024 * 1024)
    .action(safe(async (options) => {
      if (!requireData()) return;
      const result = await fetchBookmarkMediaBatch({
        limit: Number(options.limit) || 100,
        maxBytes: Number(options.maxBytes) || 50 * 1024 * 1024,
      });
      console.log(JSON.stringify(result, null, 2));
    }));

  // ── ft md ── Export bookmarks as markdown files ────────────────────────

  program
    .command('md')
    .description('Export bookmarks as individual markdown files')
    .option('--force', 'Re-export all bookmarks (overwrite existing files)')
    .action(safe(async (options) => {
      if (!requireIndex()) return;
      let lastLine = '';
      const spinner = createSpinner(() => lastLine);
      const result = await exportBookmarks({
        force: options.force,
        onProgress: (s) => {
          lastLine = s;
          spinner.update();
        },
      });
      spinner.stop();
      const skippedNote = result.skipped > 0 ? ` (${result.skipped} already existed)` : '';
      console.log(`Exported ${result.exported}/${result.total} bookmarks${skippedNote}`);
      console.log(`  ${result.elapsed}s elapsed`);
      console.log(`\n  Open in your markdown viewer:\n  ${mdDir()}`);
    }));

  // ── ft wiki ── Compile Karpathy-style knowledge base ────────────────────

  program
    .command('wiki')
    .description('Compile Karpathy-style markdown wiki from bookmarks')
    .option('--full', 'Recompile all pages (ignore incremental cache)')
    .action(safe(async (options) => {
      if (!requireIndex()) return;
      const start = Date.now();
      let lastLine = '';
      const spinner = createSpinner(() => lastLine);
      const result = await compileMd({
        full: options.full,
        onProgress: (s) => {
          lastLine = s;
          spinner.update();
        },
      });
      spinner.stop();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const failed = result.pagesFailed > 0 ? ` failed=${result.pagesFailed}` : '';
      console.log(`Done (${elapsed}s) — engine=${result.engine} created=${result.pagesCreated} updated=${result.pagesUpdated} skipped=${result.pagesSkipped}${failed} total=${result.totalPages}`);
      if (result.pagesFailed > 0) {
        console.log(`\n  ${result.pagesFailed} page(s) failed — re-run ft wiki to retry them.`);
      }
      console.log(`\n  Open in your markdown viewer:\n  ${mdDir()}`);
    }));

  // ── ft ask ── Q&A against the knowledge base ──────────────────────────

  program
    .command('ask')
    .description('Ask a question against the markdown knowledge base')
    .argument('<question>', 'The question to answer')
    .option('--save', 'Save the answer as a concept page')
    .option('--json', 'Output JSON instead of text')
    .action(safe(async (question, options) => {
      if (!requireIndex()) return;
      let lastLine = '';
      const spinner = createSpinner(() => lastLine);
      const result = await askMd(question, {
        save: options.save,
        onProgress: (s) => {
          lastLine = s;
          spinner.update();
        },
      });
      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\n${result.answer}`);
        if (result.pagesRead.length > 0) {
          console.log(`\nSources: ${result.pagesRead.join(', ')}`);
        }
        if (result.wikiUpdates.length > 0) {
          console.log('\nSuggested updates:');
          for (const u of result.wikiUpdates) console.log(`  - ${u}`);
        }
        if (result.savedAs) {
          console.log(`\nSaved to: ${result.savedAs}`);
        }
      }
    }));

  // ── ft lint ── Health-check the markdown wiki ─────────────────────────

  program
    .command('lint')
    .description('Health-check the markdown knowledge base')
    .option('--fix', 'Auto-fix fixable issues with targeted recompile')
    .option('--json', 'Output JSON instead of text')
    .action(safe(async (options) => {
      if (!requireIndex()) return;
      const result = await lintMd();

      if (options.fix && result.issues.some((i) => i.fixable)) {
        console.log('Fixing issues...');
        const fixed = await fixLintIssues(result.issues);
        console.log(`Fixed ${fixed} pages.`);
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`Pages: ${result.stats.totalPages}  Links: ${result.stats.totalLinks}  Health: ${result.stats.healthScore}%`);
      if (result.issues.length === 0) {
        console.log('No issues found.');
      } else {
        for (const issue of result.issues) {
          const page = issue.page ? ` ${issue.page}` : '';
          const fix = issue.fixable ? ' (fixable)' : '';
          console.log(`  [${issue.type}]${page}: ${issue.detail}${fix}`);
        }
      }
    }));

  // ── possible ───────────────────────────────────────────────────────────
  //
  // User-facing surface for the "apply a bookmark group to a repo → scored
  // ideas on a 2x2 grid" feature. Previously named `ft ideas`; the old name
  // still works as an alias. Internal module names, types, and on-disk md
  // frontmatter types remain `ideas*` on purpose — renaming them would
  // require a second migration and the mac app will eventually consume
  // those shapes.

  const possible = program
    .command('possible')
    .alias('ideas')
    .description('Apply a bookmark group to one or more repos — produces scored ideas on a 2x2 grid');

  // Bare `ft possible` runs the interactive wizard when stdin is a TTY, and
  // falls back to the help intro when it is not (pipes, CI, test harness).
  possible
    .action(safe(async () => {
      if (!process.stdin.isTTY) {
        console.log(formatIdeasIntro());
        return;
      }
      const wizardResult = await runPossibleWizard(
        {
          ask: async (question) => {
            const result = await promptText(question);
            if (result.kind === 'interrupt') {
              throw new PromptCancelledError('Cancelled.', 130);
            }
            if (result.kind === 'close') {
              throw new PromptCancelledError('No answer.', 0);
            }
            return result.value;
          },
          write: (line) => process.stderr.write(`${line}\n`),
        },
        {
          listSeeds: () => listIdeasSeeds(),
          listRepos: () => listSavedRepos(),
          listFrames: () => listAllFrames(),
        },
      );

      if (wizardResult.kind === 'cancelled') {
        process.stderr.write(`\n  Wizard cancelled (${wizardResult.reason}).\n`);
        return;
      }
      if (wizardResult.kind === 'no-seeds') {
        // stepPickSeed already printed the command hint.
        return;
      }

      const { plan } = wizardResult;
      process.stderr.write('\n  Launching...\n');
      const summary = await runIdeas({
        seedId: plan.seedId,
        repos: plan.repos,
        frameId: plan.frameId,
        depth: plan.depth,
        onProgress: (message) => {
          process.stderr.write(`  ${message}\n`);
        },
      });
      printIdeasRunReport(summary);
    }));

  possible
    .command('explain')
    .description('Explain what `ft possible` does and what to expect during a run')
    .action(() => {
      console.log(formatIdeasIntro());
    });

  possible
    .command('run')
    .description('Run a possibility exploration from a seed or seed artifact group, against one or more repos')
    .option('--seed-artifact <id...>', 'One or more seed artifact ids to start from')
    .option('--seed <id>', 'Saved seed id to start from')
    .option('--repo <path>', 'Single repo path to explore against (shorthand for --repos with one path)')
    .option('--repos <path...>', 'Multiple repo paths; produces one consideration per repo plus a batch summary')
    .option('--frame <id>', 'Frame id (overrides any frame pinned on the seed)')
    .option('--depth <depth>', 'Depth: quick | standard | deep (default: standard, or quick under --defaults)')
    .option('--steering <text>', 'Optional steering nudge')
    .option('--defaults', 'Re-run with sensible defaults: most-recently-used seed, saved repo registry, seed-pinned frame, quick depth', false)
    .action(safe(async (options) => {
      // ── --defaults: fill in the blanks from the store ────────────────
      // Commander no longer sets a default on --depth, so options.depth is
      // undefined when the user did not pass --depth. That lets the
      // --defaults branch distinguish "user asked for standard" from
      // "user asked for nothing" and only rewrite the latter.
      let seedArtifactIds = Array.isArray(options.seedArtifact)
        ? (options.seedArtifact as string[]).map(String)
        : options.seedArtifact ? [String(options.seedArtifact)] : undefined;
      let seedId = options.seed ? String(options.seed) : undefined;
      const depthExplicit = options.depth !== undefined;
      let depth: 'quick' | 'standard' | 'deep' = (options.depth as 'quick' | 'standard' | 'deep' | undefined) ?? 'standard';

      if (options.defaults) {
        if (!seedId && (!seedArtifactIds || seedArtifactIds.length === 0)) {
          const mostRecent = pickMostRecentlyUsedSeed(listIdeasSeeds());
          if (!mostRecent) {
            console.log('  No saved seeds to default to. Create one with `ft seeds search "..." --create`.');
            process.exitCode = 1;
            return;
          }
          seedId = mostRecent.id;
          console.log(`  Using most recently used seed: ${mostRecent.id}  ${mostRecent.title}`);
        }
        if (!depthExplicit) {
          // Only override when the user did NOT pass --depth. This way
          // `ft possible run --defaults --depth standard` stays standard
          // instead of being silently rewritten to quick.
          depth = 'quick';
        }
      }

      if ((!seedArtifactIds || seedArtifactIds.length === 0) && !seedId) {
        console.log('  Provide either --seed-artifact <id...> or --seed <seed-id>. (Or --defaults to auto-pick.)');
        process.exitCode = 1;
        return;
      }

      const resolution = resolveRepoList({
        singleRepo: options.repo ? String(options.repo) : undefined,
        multiRepos: Array.isArray(options.repos) ? (options.repos as string[]).map(String) : undefined,
        savedRepos: listSavedRepos(),
      });
      if (resolution.kind === 'error') {
        if (resolution.reason === 'both-flags') {
          console.log('  Use either --repo or --repos, not both.');
        } else {
          console.log('  No repo specified and no saved repos found.');
          console.log('  Pass --repo <path> or --repos <path...>, or save defaults with `ft repos add <path>`.');
        }
        process.exitCode = 1;
        return;
      }
      const repos = resolution.repos;

      console.log('  Runs on your local machine. Keep your laptop awake for longer debates.');
      if (repos.length > 1) {
        console.log(`  Batched run across ${repos.length} repos. The seed brief is computed once and reused.`);
      }

      const summary = await runIdeas({
        seedArtifactIds,
        seedId,
        repos,
        frameId: options.frame ? String(options.frame) : undefined,
        depth,
        steering: options.steering ? String(options.steering) : undefined,
        onProgress: (message) => {
          process.stderr.write(`  ${message}\n`);
        },
      });

      printIdeasRunReport(summary);
    }));

  possible
    .command('list')
    .description('List recent possibility runs')
    .action(safe(async () => {
      console.log(formatRunList(listIdeaRuns()));
    }));

  possible
    .command('show')
    .description('Show one possibility run in detail')
    .argument('[runId]', 'Run id, or omit for latest', 'latest')
    .action(safe(async (runId?: string) => {
      const run = resolveIdeaRun(runId);
      if (!run) {
        console.log('  No possibility run found.');
        process.exitCode = 1;
        return;
      }
      console.log(formatRunSummary(run));
    }));

  possible
    .command('grid')
    .description('Render the 2x2 grid for a possibility run')
    .argument('[runId]', 'Run id, or omit for latest', 'latest')
    .action(safe(async (runId?: string) => {
      console.log(renderRunGrid(runId));
    }));

  possible
    .command('dots')
    .description('Render all scored ideas for a run')
    .argument('[runId]', 'Run id, or omit for latest', 'latest')
    .action(safe(async (runId?: string) => {
      console.log(renderRunDots(runId));
    }));

  possible
    .command('prompt')
    .description('Print the exportable prompt for a scored idea')
    .argument('<dotId>', 'Dot artifact id')
    .action(safe(async (dotId: string) => {
      console.log(getIdeaPrompt(String(dotId)));
    }));

  const seeds = program
    .command('seeds')
    .description('Create, inspect, and manage reusable seed context for ideas runs');

  seeds
    .action(() => {
      console.log('Seeds shape context. Use them to gather, save, and reuse source material before running ft possible.');
      console.log('');
      console.log('Useful commands:');
      console.log('  ft seeds list');
      console.log('  ft seeds create --artifact <id...>');
      console.log('  ft seeds text "..."');
      console.log('  ft possible run --seed <seed-id> --repo .');
    });

  seeds
    .command('list')
    .description('List saved seeds')
    .action(safe(async () => {
      console.log(formatIdeasSeedList(listIdeasSeeds()));
    }));

  seeds
    .command('show')
    .description('Show one saved seed')
    .argument('<seedId>', 'Seed id')
    .action(safe(async (seedId: string) => {
      const seed = readIdeasSeed(String(seedId));
      if (!seed) {
        console.log(`  Seed not found: ${String(seedId)}`);
        process.exitCode = 1;
        return;
      }
      console.log(formatIdeasSeed(seed));
    }));

  seeds
    .command('create')
    .description('Create a saved seed from one or more existing artifacts')
    .requiredOption('--artifact <id...>', 'One or more artifact ids')
    .option('--title <text>', 'Seed title')
    .option('--notes <text>', 'Optional notes')
    .option('--frame <id>', 'Pin a 2x2 frame on the saved seed')
    .action(safe(async (options) => {
      const frameId = validateOptionalFrameId(options.frame);
      const seed = await createIdeasSeedFromArtifacts({
        artifactIds: (options.artifact as string[]).map(String),
        title: options.title ? String(options.title) : undefined,
        notes: options.notes ? String(options.notes) : undefined,
        frameId,
      });
      console.log(`  ✓ Created seed: ${seed.id}`);
      console.log(`  Title: ${seed.title}`);
      console.log(`  Artifacts: ${seed.artifactIds.join(', ')}`);
      if (frameId) console.log(`  Frame: ${frameId}`);
      console.log(`\n  Next:`);
      console.log(`    ft ideas run --seed ${seed.id} --repo .`);
    }));

  seeds
    .command('text')
    .description('Create a saved seed from raw text')
    .argument('<text>', 'Seed text')
    .option('--title <text>', 'Seed title')
    .option('--notes <text>', 'Optional notes')
    .option('--frame <id>', 'Pin a 2x2 frame on the saved seed')
    .action(safe(async (text: string, options) => {
      const frameId = validateOptionalFrameId(options.frame);
      const seed = await createIdeasSeedFromText({
        text: String(text),
        title: options.title ? String(options.title) : undefined,
        notes: options.notes ? String(options.notes) : undefined,
        frameId,
      });
      console.log(`  ✓ Created seed: ${seed.id}`);
      console.log(`  Title: ${seed.title}`);
      if (frameId) console.log(`  Frame: ${frameId}`);
      console.log(`\n  Next:`);
      console.log(`    ft ideas run --seed ${seed.id} --repo .`);
    }));

  seeds
    .command('delete')
    .description('Delete a saved seed')
    .argument('<seedId>', 'Seed id')
    .action(safe(async (seedId: string) => {
      const deleted = deleteIdeasSeed(String(seedId));
      if (!deleted) {
        console.log(`  Seed not found: ${String(seedId)}`);
        process.exitCode = 1;
        return;
      }
      console.log(`  Deleted seed: ${String(seedId)}`);
    }));

  seeds
    .command('strategies')
    .description('List available seed strategies')
    .action(() => {
      for (const strategy of SEED_STRATEGIES) {
        const flair = strategy.playful ? ' playful' : ' standard';
        console.log(`${strategy.id.padEnd(14)} ${flair}  ${strategy.summary}`);
      }
    });

  seeds
    .command('strategy')
    .description('Inspect one seed strategy')
    .argument('<name>', 'Strategy id')
    .action((name: string) => {
      const strategy = getSeedStrategy(String(name));
      if (!strategy) {
        console.log(`  Unknown strategy: ${String(name)}`);
        process.exitCode = 1;
        return;
      }
      console.log(`${strategy.label} (${strategy.id})`);
      console.log(`${strategy.summary}`);
      console.log(`Playful: ${strategy.playful ? 'yes' : 'no'}`);
      console.log('');
      console.log(`Example title:`);
      console.log(`  ${strategy.buildTitle({ category: 'tool', days: 30 })}`);
    });

  seeds
    .command('search')
    .description('Preview or save a search-shaped seed from bookmarks')
    .argument('<query>', 'Search query')
    .option('--category <name>', 'Filter by category')
    .option('--domain <name>', 'Filter by domain')
    .option('--folder <name>', 'Filter by folder')
    .option('--author <handle>', 'Filter by author handle')
    .option('--days <n>', 'Limit to the last N days', (v: string) => Number(v))
    .option('--limit <n>', 'Max bookmarks to use', (v: string) => Number(v), 8)
    .option('--create', 'Save the result as a seed', false)
    .option('--title <text>', 'Seed title override')
    .option('--frame <id>', 'Pin a 2x2 frame on the saved seed')
    .action(safe(async (query: string, options) => {
      const frameId = validateOptionalFrameId(options.frame);
      const spec = buildSeedStrategySpec({
        strategy: 'search',
        filters: {
          query: String(query),
          category: options.category ? String(options.category) : undefined,
          domain: options.domain ? String(options.domain) : undefined,
          folder: options.folder ? String(options.folder) : undefined,
          author: options.author ? String(options.author) : undefined,
          days: typeof options.days === 'number' ? options.days : undefined,
          limit: Number(options.limit) || 8,
        },
      });
      const candidates = await querySeedCandidates(spec.filters);
      console.log(formatSeedCandidates(candidates));
      if (options.create && candidates.length > 0) {
        const seed = await saveSeedFromCandidates({
          candidates,
          title: options.title ? String(options.title) : summarizeSeedIntent('Search seed', spec.filters),
          notes: `strategy=${spec.strategy}`,
          strategy: spec.strategy,
          strategyParams: spec.strategyParams,
          frameId,
        });
        console.log(`\n  ✓ Created seed: ${seed.id}${frameId ? `  (frame: ${frameId})` : ''}`);
      }
    }));

  seeds
    .command('recent')
    .description('Preview or save a recent seed from bookmarks')
    .option('--category <name>', 'Filter by category')
    .option('--domain <name>', 'Filter by domain')
    .option('--folder <name>', 'Filter by folder')
    .option('--author <handle>', 'Filter by author handle')
    .option('--days <n>', 'Limit to the last N days', (v: string) => Number(v), 30)
    .option('--limit <n>', 'Max bookmarks to use', (v: string) => Number(v), 8)
    .option('--create', 'Save the result as a seed', false)
    .option('--title <text>', 'Seed title override')
    .option('--frame <id>', 'Pin a 2x2 frame on the saved seed')
    .action(safe(async (options) => {
      const frameId = validateOptionalFrameId(options.frame);
      const spec = buildSeedStrategySpec({
        strategy: 'recent',
        filters: {
          category: options.category ? String(options.category) : undefined,
          domain: options.domain ? String(options.domain) : undefined,
          folder: options.folder ? String(options.folder) : undefined,
          author: options.author ? String(options.author) : undefined,
          days: typeof options.days === 'number' ? options.days : 30,
          limit: Number(options.limit) || 8,
        },
      });
      const candidates = await querySeedCandidates(spec.filters);
      console.log(formatSeedCandidates(candidates));
      if (options.create && candidates.length > 0) {
        const seed = await saveSeedFromCandidates({
          candidates,
          title: options.title ? String(options.title) : summarizeSeedIntent('Recent seed', spec.filters),
          notes: `strategy=${spec.strategy}`,
          strategy: spec.strategy,
          strategyParams: spec.strategyParams,
          frameId,
        });
        console.log(`\n  ✓ Created seed: ${seed.id}${frameId ? `  (frame: ${frameId})` : ''}`);
      }
    }));

  seeds
    .command('random')
    .description('Play a random prompt mini-game and shape a seed from it')
    .option('--mode <kind>', 'Random mode: sample | model', 'sample')
    .option('--category <name>', 'Filter by category')
    .option('--domain <name>', 'Filter by domain')
    .option('--folder <name>', 'Filter by folder')
    .option('--author <handle>', 'Filter by author handle')
    .option('--days <n>', 'Limit to the last N days', (v: string) => Number(v))
    .option('--limit <n>', 'Max bookmarks to use', (v: string) => Number(v), 5)
    .option('--prompts <n>', 'Show N random word-pair prompts', (v: string) => Number(v), 6)
    .option('--pick <text>', 'Chosen random prompt phrase')
    .option('--suggest <n>', 'Number of model suggestions', (v: string) => Number(v), 3)
    .option('--create', 'Save the result as a seed', false)
    .option('--title <text>', 'Seed title override')
    .option('--frame <id>', 'Pin a 2x2 frame on the saved seed')
    .action(safe(async (options) => {
      const frameId = validateOptionalFrameId(options.frame);
      const prompts = generateRandomSeedPrompts(Number(options.prompts) || 6);
      console.log('Mini-game prompts');
      console.log('');
      for (const [idx, prompt] of prompts.entries()) console.log(`${idx + 1}. ${prompt}`);
      console.log('');
      console.log('Choose one with:');
      console.log('  ft seeds random --pick "<phrase>" --create');
      console.log('');

      const spec = buildSeedStrategySpec({
        strategy: 'random',
        filters: {
          category: options.category ? String(options.category) : undefined,
          domain: options.domain ? String(options.domain) : undefined,
          folder: options.folder ? String(options.folder) : undefined,
          author: options.author ? String(options.author) : undefined,
          days: typeof options.days === 'number' ? options.days : undefined,
          limit: Number(options.limit) || 5,
        },
        strategyParams: options.pick ? { pick: String(options.pick) } : undefined,
      });

      const mode = String(options.mode || 'sample');
      if (mode === 'model' && options.pick) {
        const candidates = await querySeedCandidates({ ...spec.filters, limit: Math.max((spec.filters.limit ?? 5) * 3, 15) });
        if (candidates.length === 0) {
          console.log('No candidate bookmarks found.');
          return;
        }

        const result = await modelOrganizeSeeds({
          filters: spec.filters,
          candidates,
          suggestCount: Number(options.suggest) || 3,
          theme: String(options.pick),
          onProgress: (message) => process.stderr.write(`  ${message}\n`),
        });

        console.log(`Picked prompt: ${String(options.pick)}`);
        console.log('');
        console.log('Plan');
        console.log('');
        console.log(result.explanation);
        console.log('');
        console.log('Suggestions');
        console.log('');
        for (const [idx, suggestion] of result.suggestions.entries()) {
          console.log(`${idx + 1}. ${suggestion.title}  (${suggestion.itemIds.length})`);
          console.log(`   ${suggestion.rationale}`);
          console.log(`   ids: ${suggestion.itemIds.join(', ')}`);
          console.log('');
        }

        if (options.create && result.suggestions.length > 0) {
          console.log('Saved seeds');
          console.log('');
          for (const suggestion of result.suggestions) {
            const seed = await createIdeasSeedFromArtifacts({
              artifactIds: suggestion.itemIds,
              title: options.title ? String(options.title) : suggestion.title,
              notes: suggestion.rationale,
              strategy: 'random-model',
              strategyParams: {
                pick: String(options.pick),
                suggest: Number(options.suggest) || 3,
              },
              frameId,
              createdBy: 'model',
            });
            console.log(`- ${seed.id}  ${seed.title}${frameId ? `  (frame: ${frameId})` : ''}`);
          }
          console.log('');
        }
        return;
      }

      const candidates = await queryRandomSeedCandidates(spec.filters);
      if (options.pick) {
        console.log(`Picked prompt: ${String(options.pick)}`);
        console.log('');
        console.log('The model/app can use this phrase to interpret the resulting seed grouping later.');
        console.log('');
      }
      console.log(formatSeedCandidates(candidates));
      if (options.create && candidates.length > 0) {
        const seed = await saveSeedFromCandidates({
          candidates,
          title: options.title ? String(options.title) : (options.pick ? `Random seed — ${String(options.pick)}` : summarizeSeedIntent('Random seed', spec.filters)),
          notes: `strategy=${spec.strategy}${options.pick ? ` pick=${String(options.pick)}` : ''}`,
          strategy: spec.strategy,
          strategyParams: spec.strategyParams,
          frameId,
        });
        console.log(`\n  ✓ Created seed: ${seed.id}${frameId ? `  (frame: ${frameId})` : ''}`);
      }
    }));

  seeds
    .command('lucky')
    .description('Preview or save a likely-interesting seed from a filtered pool')
    .option('--query <text>', 'Optional query filter')
    .option('--category <name>', 'Filter by category')
    .option('--domain <name>', 'Filter by domain')
    .option('--folder <name>', 'Filter by folder')
    .option('--author <handle>', 'Filter by author handle')
    .option('--days <n>', 'Limit to the last N days', (v: string) => Number(v), 30)
    .option('--limit <n>', 'Max bookmarks to use', (v: string) => Number(v), 5)
    .option('--create', 'Save the result as a seed', false)
    .option('--title <text>', 'Seed title override')
    .option('--frame <id>', 'Pin a 2x2 frame on the saved seed')
    .action(safe(async (options) => {
      const frameId = validateOptionalFrameId(options.frame);
      const spec = buildSeedStrategySpec({
        strategy: 'lucky',
        filters: {
          query: options.query ? String(options.query) : undefined,
          category: options.category ? String(options.category) : undefined,
          domain: options.domain ? String(options.domain) : undefined,
          folder: options.folder ? String(options.folder) : undefined,
          author: options.author ? String(options.author) : undefined,
          days: typeof options.days === 'number' ? options.days : 30,
          limit: Number(options.limit) || 5,
        },
      });
      const candidates = await querySeedCandidates({ ...spec.filters, limit: Math.max((spec.filters.limit ?? 5) * 2, 8) });
      const picked = candidates.slice(0, spec.filters.limit ?? 5);
      console.log(formatSeedCandidates(picked));
      if (options.create && picked.length > 0) {
        const seed = await saveSeedFromCandidates({
          candidates: picked,
          title: options.title ? String(options.title) : summarizeSeedIntent('Lucky seed', spec.filters),
          notes: `strategy=${spec.strategy}`,
          strategy: spec.strategy,
          strategyParams: spec.strategyParams,
          frameId,
        });
        console.log(`\n  ✓ Created seed: ${seed.id}${frameId ? `  (frame: ${frameId})` : ''}`);
      }
    }));

  seeds
    .command('organize')
    .description('Group bookmark candidates into reusable seed organizations')
    .option('--by <mode>', 'Grouping mode: category | domain | folder | time')
    .option('--mode <kind>', 'Organize mode: deterministic | model', 'deterministic')
    .option('--suggest <n>', 'Number of model suggestions', (v: string) => Number(v), 3)
    .option('--save', 'Save model suggestions as seeds', false)
    .option('--query <text>', 'Optional query filter')
    .option('--category <name>', 'Filter by category')
    .option('--domain <name>', 'Filter by domain')
    .option('--folder <name>', 'Filter by folder')
    .option('--author <handle>', 'Filter by author handle')
    .option('--days <n>', 'Limit to the last N days', (v: string) => Number(v))
    .option('--limit <n>', 'Max bookmarks to scan', (v: string) => Number(v), 60)
    .option('--frame <id>', 'Pin a 2x2 frame on the saved seeds')
    .action(safe(async (options) => {
      const frameId = validateOptionalFrameId(options.frame);
      const filters = {
        query: options.query ? String(options.query) : undefined,
        category: options.category ? String(options.category) : undefined,
        domain: options.domain ? String(options.domain) : undefined,
        folder: options.folder ? String(options.folder) : undefined,
        author: options.author ? String(options.author) : undefined,
        days: typeof options.days === 'number' ? options.days : undefined,
        limit: Number(options.limit) || 60,
      };

      if (String(options.mode) === 'model') {
        const candidates = await querySeedCandidates(filters);
        if (candidates.length === 0) {
          console.log('No candidate bookmarks found.');
          return;
        }

        const result = await modelOrganizeSeeds({
          filters,
          candidates,
          suggestCount: Number(options.suggest) || 3,
          onProgress: (message) => process.stderr.write(`  ${message}\n`),
        });

        console.log('Plan');
        console.log('');
        console.log(result.explanation);
        console.log('');
        console.log('Suggestions');
        console.log('');
        for (const [idx, suggestion] of result.suggestions.entries()) {
          console.log(`${idx + 1}. ${suggestion.title}  (${suggestion.itemIds.length})`);
          console.log(`   ${suggestion.rationale}`);
          console.log(`   ids: ${suggestion.itemIds.join(', ')}`);
          console.log('');
        }

        if (options.save && result.suggestions.length > 0) {
          console.log('Saved seeds');
          console.log('');
          for (const suggestion of result.suggestions) {
            const seed = await createIdeasSeedFromArtifacts({
              artifactIds: suggestion.itemIds,
              title: suggestion.title,
              notes: suggestion.rationale,
              strategy: 'model-organize',
              strategyParams: {
                suggest: Number(options.suggest) || 3,
              },
              frameId,
              createdBy: 'model',
            });
            console.log(`- ${seed.id}  ${seed.title}${frameId ? `  (frame: ${frameId})` : ''}`);
          }
          console.log('');
        }
        return;
      }

      const mode = String(options.by || '') as 'category' | 'domain' | 'folder' | 'time';
      if (!['category', 'domain', 'folder', 'time'].includes(mode)) {
        console.log('  Deterministic organize mode requires --by category|domain|folder|time');
        process.exitCode = 1;
        return;
      }

      const result = await organizeSeedCandidatesBy(mode, filters);
      console.log(formatSeedOrganization(result));
    }));

  const possibleSeed = possible
    .command('seed')
    .description('(alias) Seed commands live under `ft seeds`');

  for (const cmd of ['list', 'show', 'create', 'text', 'delete']) {
    possibleSeed.command(cmd).description(`Alias for: ft seeds ${cmd}`).allowUnknownOption(true)
      .action(async () => {
        const args = ['node', 'ft', 'seeds', cmd, ...process.argv.slice(4)];
        await program.parseAsync(args);
      });
  }

  // ── repos ──────────────────────────────────────────────────────────────

  const repos = program
    .command('repos')
    .description('Save and manage the default repo set used by `ft ideas run`');

  repos.action(() => {
    const saved = listSavedRepos();
    if (saved.length === 0) {
      console.log('No saved repos. Add one with: ft repos add <path>');
    } else {
      console.log(`Saved repos (${saved.length}):`);
      for (const r of saved) console.log(`  ${r}`);
    }
  });

  repos
    .command('list')
    .description('List saved repo paths')
    .action(safe(async () => {
      const saved = listSavedRepos();
      if (saved.length === 0) {
        console.log('No saved repos. Add one with: ft repos add <path>');
        return;
      }
      for (const r of saved) console.log(r);
    }));

  repos
    .command('add')
    .description('Add a repo path to the default set')
    .argument('<path>', 'Repo path (absolute, ~, or relative)')
    .action(safe(async (repoPath: string) => {
      const result = addRepoToRegistry(String(repoPath));
      if (result.added) {
        console.log(`  ✓ Added: ${result.canonical}`);
      } else {
        console.log(`  Already saved: ${result.canonical}`);
      }
    }));

  repos
    .command('remove')
    .description('Remove a repo path from the default set')
    .argument('<path>', 'Repo path to remove')
    .action(safe(async (repoPath: string) => {
      const result = removeRepoFromRegistry(String(repoPath));
      if (result.removed) {
        console.log(`  ✓ Removed: ${result.canonical}`);
      } else {
        console.log(`  Not in registry: ${result.canonical}`);
        process.exitCode = 1;
      }
    }));

  repos
    .command('clear')
    .description('Remove all saved repo paths')
    .action(safe(async () => {
      const count = clearReposRegistry();
      console.log(`  ✓ Cleared ${count} saved repo${count === 1 ? '' : 's'}.`);
    }));

  // ── frames ─────────────────────────────────────────────────────────────

  const frames = program
    .command('frames')
    .description('List built-in and user-defined 2x2 frames');

  frames.action(() => {
    const all = listAllFrames();
    const userIds = new Set(loadUserFrames().map((f) => f.id));
    console.log(`Frames (${all.length} total: ${all.length - userIds.size} built-in, ${userIds.size} user):`);
    for (const f of all) {
      const origin = userIds.has(f.id) ? 'user' : 'built-in';
      console.log(`  ${f.id.padEnd(28)} ${f.group.padEnd(9)} ${origin.padEnd(9)} ${f.name}`);
    }
  });

  frames
    .command('list')
    .description('List every available frame (built-in + user)')
    .action(safe(async () => {
      const all = listAllFrames();
      const userIds = new Set(loadUserFrames().map((f) => f.id));
      for (const f of all) {
        const origin = userIds.has(f.id) ? 'user' : 'built-in';
        console.log(`${f.id}  ${f.group}  ${origin}  ${f.name}`);
      }
    }));

  frames
    .command('show')
    .description('Show one frame in detail')
    .argument('<id>', 'Frame id (built-in or user)')
    .action(safe(async (id: string) => {
      const frame = getFrame(String(id));
      if (!frame) {
        const known = listAllFrames().map((f) => f.id).join(', ');
        console.log(`  Unknown frame: ${String(id)}`);
        console.log(`  Available: ${known}`);
        process.exitCode = 1;
        return;
      }
      console.log(`${frame.name} (${frame.id})`);
      console.log(`  group: ${frame.group}`);
      console.log(`  axis A: ${frame.axisA.label}`);
      console.log(`    ${frame.axisA.rubricSentence}`);
      console.log(`  axis B: ${frame.axisB.label}`);
      console.log(`    ${frame.axisB.rubricSentence}`);
      console.log(`  quadrants:`);
      console.log(`    high A × high B: ${frame.quadrantLabels.highHigh}`);
      console.log(`    high A × low  B: ${frame.quadrantLabels.highLow}`);
      console.log(`    low  A × high B: ${frame.quadrantLabels.lowHigh}`);
      console.log(`    low  A × low  B: ${frame.quadrantLabels.lowLow}`);
      console.log(`  generation addition:`);
      console.log(`    ${frame.generationPromptAddition}`);
    }));

  frames
    .command('add')
    .description('Add a user-defined frame from a JSON file')
    .argument('<file>', 'Path to a JSON file describing the frame')
    .action(safe(async (file: string) => {
      const result = addUserFrameFromFile(String(file));
      const verb = result.replacedExisting ? 'Updated' : 'Added';
      console.log(`  ✓ ${verb} user frame: ${result.frame.id}`);
      console.log(`  ${result.frame.name} (${result.frame.group})`);
      console.log(`\n  Next:`);
      console.log(`    ft frames show ${result.frame.id}`);
      console.log(`    ft ideas run --seed <seed-id> --repo . --frame ${result.frame.id}`);
    }));

  frames
    .command('remove')
    .description('Remove a user-defined frame (built-ins cannot be removed)')
    .argument('<id>', 'Frame id')
    .action(safe(async (id: string) => {
      const removed = removeUserFrame(String(id));
      if (!removed) {
        console.log(`  Not a user frame: ${String(id)}`);
        process.exitCode = 1;
        return;
      }
      console.log(`  ✓ Removed user frame: ${String(id)}`);
    }));

  // ── skill ──────────────────────────────────────────────────────────────

  const skill = program
    .command('skill')
    .description('Install the /fieldtheory skill for AI coding agents');

  skill
    .command('install')
    .description('Install skill for detected agents (Claude Code, Codex)')
    .action(safe(async () => {
      const results = await installSkill();
      if (results.length === 0) {
        console.log('  No agents detected. Use `ft skill show` to copy manually.');
        return;
      }
      const labels: Record<string, string> = {
        installed: 'Installed',
        updated: 'Updated',
        'up-to-date': 'Already up to date',
      };
      for (const r of results) {
        console.log(`  ${labels[r.action] ?? r.action} for ${r.agent}: ${r.path}`);
      }
      if (results.some((r) => r.action === 'installed' || r.action === 'updated')) {
        console.log(`\n  Try: /fieldtheory in Claude Code, or ask about your bookmarks in Codex.`);
      }
    }));

  skill
    .command('show')
    .description('Print skill content to stdout')
    .action(() => {
      process.stdout.write(skillWithFrontmatter());
    });

  skill
    .command('uninstall')
    .description('Remove installed skill files')
    .action(safe(async () => {
      const results = uninstallSkill();
      if (results.length === 0) {
        console.log('  No installed skills found.');
        return;
      }
      for (const r of results) {
        console.log(`  Removed from ${r.agent}: ${r.path}`);
      }
    }));

  // ── hidden backward-compat aliases ────────────────────────────────────

  const bookmarksAlias = program.command('bookmarks').description('(alias) Bookmark commands').helpOption(false);
  for (const cmd of ['sync', 'search', 'list', 'show', 'stats', 'viz', 'classify', 'classify-domains',
    'categories', 'domains', 'folders', 'model', 'index', 'auth', 'status', 'path', 'sample', 'fetch-media']) {
    bookmarksAlias.command(cmd).description(`Alias for: ft ${cmd}`).allowUnknownOption(true)
      .action(async () => {
        const args = ['node', 'ft', cmd, ...process.argv.slice(4)];
        await program.parseAsync(args);
      });
  }
  bookmarksAlias.command('enable').description('Alias for: ft sync').action(async () => {
    const args = ['node', 'ft', 'sync', ...process.argv.slice(4)];
    await program.parseAsync(args);
  });

  program.on('afterHelp', showCachedUpdateNotice);

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const program = buildCli();
  program.hook('postAction', async () => { await checkForUpdate(); });
  await program.parseAsync(process.argv);
}
