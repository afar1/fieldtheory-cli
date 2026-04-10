#!/usr/bin/env node
import { Command } from 'commander';
import { syncTwitterBookmarks } from './bookmarks.js';
import { getBookmarkStatusView, formatBookmarkStatus } from './bookmarks-service.js';
import { runTwitterOAuthFlow } from './xauth.js';
import { syncBookmarksGraphQL, syncGaps } from './graphql-bookmarks.js';
import type { SyncProgress, GapFillProgress } from './graphql-bookmarks.js';
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
import { dataDir, ensureDataDir, isFirstRun, twitterBookmarksIndexPath, twitterBackfillStatePath, mdDir } from './paths.js';
import { PromptCancelledError, promptText } from './prompt.js';
import { skillWithFrontmatter, installSkill, uninstallSkill } from './skill.js';
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
    .option('--gaps', 'Backfill missing data (quoted tweets, truncated articles)', false)
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

        // ── gaps mode: backfill missing data for existing bookmarks ──
        if (options.gaps) {
          const startTime = Date.now();
          process.stderr.write('  Filling gaps (quoted tweets, truncated text)...\n');
          let lastProgress: GapFillProgress = { done: 0, total: 0, quotedFetched: 0, textExpanded: 0, failed: 0 };
          const spinner = createSpinner(() => {
            const p = lastProgress;
            const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            return `${p.done}/${p.total} (${pct}%) \u2502 ${p.quotedFetched} quoted \u2502 ${p.textExpanded} expanded \u2502 ${p.failed} failed \u2502 ${elapsed}s`;
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
              fs.writeFileSync(logPath, JSON.stringify({ failures: result.failures, summary: byReason }, null, 2));

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
    .option('--limit <n>', 'Max results', (v: string) => Number(v), 30)
    .option('--offset <n>', 'Offset into results', (v: string) => Number(v), 0)
    .option('--json', 'JSON output')
    .action(safe(async (options) => {
      if (!requireIndex()) return;
      const items = await listBookmarks({
        query: options.query ? String(options.query) : undefined,
        author: options.author ? String(options.author) : undefined,
        after: options.after ? String(options.after) : undefined,
        before: options.before ? String(options.before) : undefined,
        category: options.category ? String(options.category) : undefined,
        domain: options.domain ? String(options.domain) : undefined,
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
    'categories', 'domains', 'model', 'index', 'auth', 'status', 'path', 'sample', 'fetch-media']) {
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
