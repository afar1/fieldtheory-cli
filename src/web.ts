import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { parse as parseUrl } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Database } from 'sql.js';
import { buildVizData } from './bookmarks-viz.js';
import {
  listBookmarks,
  listBookmarkIds,
  countBookmarks,
  getBookmarkById,
  getFilterSuggestions,
  deleteBookmark,
  ensureMigrations,
} from './bookmarks-db.js';
import { openDb } from './db.js';
import { pathExists, readJson } from './fs.js';
import { bookmarkMediaDir, bookmarkMediaManifestPath, twitterBookmarksIndexPath } from './paths.js';
import type { MediaFetchEntry, MediaFetchManifest } from './bookmark-media.js';
import { WEB_CSS } from './web-styles.js';
import { createUnbookmarker } from './x-unbookmark.js';
import type { UnbookmarkResult, UnbookmarkStatus } from './x-unbookmark.js';
import type { XSessionOptions } from './graphql-bookmarks.js';

// ── Request origin checks ─────────────────────────────────────────────────────

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Browsers send Origin on cross-site mutations; refuse any that isn't this server. */
function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

// ── File-backed caches ────────────────────────────────────────────────────────

async function fileVersion(filePath: string): Promise<string | null> {
  try {
    const s = await stat(filePath);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return null;
  }
}

/** How long a replaced value stays usable by requests already holding it. */
const DISPOSE_DELAY_MS = 5_000;

/**
 * Keep one loaded copy of a file-backed value and reload it only when the file
 * changes on disk (a sync, classify, media fetch, or a delete from this server).
 * Loading the WASM SQLite index costs a full file read, so doing it once per
 * change instead of once per request keeps search responsive.
 */
function cachedByFile<T>(
  getPath: () => string,
  load: () => Promise<T>,
  dispose?: (value: T) => void,
): { get: () => Promise<T>; dispose: () => void } {
  let cached: { version: string | null; value: Promise<T> } | undefined;

  const get = async (): Promise<T> => {
    const version = await fileVersion(getPath());
    if (!cached || cached.version !== version) {
      const previous = cached;
      const entry = { version, value: load() };
      cached = entry;
      // Never cache a failed load.
      entry.value.catch(() => { if (cached === entry) cached = undefined; });
      if (previous && dispose) {
        previous.value.then(
          (value) => { setTimeout(() => dispose(value), DISPOSE_DELAY_MS).unref(); },
          () => { /* nothing to dispose */ },
        );
      }
    }
    return cached.value;
  };

  return {
    get,
    dispose: () => {
      if (cached && dispose) cached.value.then(dispose, () => { /* nothing to dispose */ });
      cached = undefined;
    },
  };
}

async function loadIndexDb(): Promise<Database> {
  const db = await openDb(twitterBookmarksIndexPath());
  ensureMigrations(db);
  return db;
}

// ── Static assets ─────────────────────────────────────────────────────────────

const requireFromHere = createRequire(import.meta.url);

/** Vendored front-end libraries, served from node_modules so the dashboard works offline. */
const VENDOR_ASSETS: Record<string, { resolve: () => string; contentType: string }> = {
  '/assets/chart.umd.min.js': {
    resolve: () => path.join(path.dirname(requireFromHere.resolve('chart.js')), 'chart.umd.min.js'),
    contentType: 'text/javascript; charset=utf-8',
  },
  '/assets/alpine.min.js': {
    resolve: () => path.join(path.dirname(requireFromHere.resolve('alpinejs')), 'cdn.min.js'),
    contentType: 'text/javascript; charset=utf-8',
  },
};

// ── Media index ───────────────────────────────────────────────────────────────

interface MediaEntry { filename: string; contentType: string; isProfileImage: boolean }

/** One cell of the media grid: an image or video poster, plus its video when there is one. */
interface MediaTile {
  src?: string;
  videoSrc?: string;
  /** The tweet the media belongs to: the bookmark itself or the tweet it quotes. */
  tweetId: string;
  tweetUrl: string;
  authorHandle?: string;
}

interface MediaIndex {
  byTweet: Map<string, MediaEntry[]>;
  /** Grid tiles per bookmark id, including quoted-tweet media, in download order. */
  byBookmark: Map<string, MediaTile[]>;
}

const EXT_CONTENT_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

function emptyMediaIndex(): MediaIndex {
  return { byTweet: new Map(), byBookmark: new Map() };
}

function isVideoEntry(entry: MediaFetchEntry): boolean {
  return (entry.contentType ?? '').includes('mp4') || /\.mp4(\?|$)/i.test(entry.localPath ?? entry.sourceUrl);
}

async function buildMediaIndex(): Promise<MediaIndex> {
  const manifestPath = bookmarkMediaManifestPath();
  if (!(await pathExists(manifestPath))) return emptyMediaIndex();
  try {
    const manifest = await readJson<MediaFetchManifest>(manifestPath);
    const index = emptyMediaIndex();
    // A video is fetched right after its poster, so the manifest lists the
    // poster just before the mp4. Failed entries stay in the walk so a video
    // whose poster failed is never paired with an unrelated image.
    const previous = new Map<string, { tweetId: string; isVideo: boolean; tile?: MediaTile; paired: boolean }>();

    for (const entry of manifest.entries) {
      const isProfileImage = entry.sourceUrl.includes('/profile_images/');
      const downloaded = entry.status === 'downloaded' && Boolean(entry.localPath);
      const url = entry.localPath ? `/media/${path.basename(entry.localPath)}` : undefined;

      if (downloaded && entry.localPath) {
        const arr = index.byTweet.get(entry.tweetId) ?? [];
        arr.push({
          filename: path.basename(entry.localPath),
          contentType: entry.contentType ?? 'application/octet-stream',
          isProfileImage,
        });
        index.byTweet.set(entry.tweetId, arr);
      }
      if (isProfileImage) continue;

      const isVideo = isVideoEntry(entry);
      const prev = previous.get(entry.bookmarkId);
      const base = { tweetId: entry.tweetId, tweetUrl: entry.tweetUrl, authorHandle: entry.authorHandle };
      let tile: MediaTile | undefined;

      if (isVideo && prev && !prev.isVideo && !prev.paired && prev.tweetId === entry.tweetId) {
        prev.paired = true;
        if (downloaded && prev.tile) prev.tile.videoSrc = url;
        else if (downloaded) tile = { ...base, videoSrc: url };
      } else if (downloaded) {
        tile = isVideo ? { ...base, videoSrc: url } : { ...base, src: url };
      }

      if (tile) {
        const tiles = index.byBookmark.get(entry.bookmarkId) ?? [];
        tiles.push(tile);
        index.byBookmark.set(entry.bookmarkId, tiles);
      }
      previous.set(entry.bookmarkId, { tweetId: entry.tweetId, isVideo, tile, paired: false });
    }
    return index;
  } catch {
    return emptyMediaIndex();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// No CORS headers on purpose: the dashboard is same-origin, and allowing any
// origin would let every website open in the browser read the local archive.
function json(res: ServerResponse, data: unknown, status = 200, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...headers,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Parse an integer query param, clamped to [min, max]; bad input uses the fallback. */
function intParam(value: string | undefined, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function qs(req: IncomingMessage): Record<string, string> {
  const parsed = parseUrl(req.url ?? '', true);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.query)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

function openInBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

// ── HTML shell ────────────────────────────────────────────────────────────────

function buildHtml(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Field Theory · Bookmark Observatory</title>
  <link rel="stylesheet" href="/assets/app.css" />
  <script src="/assets/chart.umd.min.js"></script>
  <script defer src="/assets/alpine.min.js"></script>
  <style>
    [x-cloak] { display: none !important; }
    body { background: #0f0f14; color: #ccd0da; font-family: 'Inter', system-ui, sans-serif; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #1a1a24; }
    ::-webkit-scrollbar-thumb { background: #383850; border-radius: 3px; }
    .chart-container { position: relative; height: 260px; }
    .chart-container-tall { position: relative; height: 340px; }
    .chart-container-sm { position: relative; height: 180px; }
  </style>
</head>
<body x-data="app()" x-cloak>

  <!-- Nav -->
  <nav class="sticky top-0 z-50 bg-[#0f0f14]/90 backdrop-blur border-b border-white/5">
    <div class="max-w-7xl mx-auto px-4 flex items-center gap-6 h-12">
      <span class="text-purple-300 font-semibold tracking-wide text-sm">✦ FIELD THEORY</span>
      <div class="flex gap-1 ml-4">
        <button @click="page='overview'"
          :class="page==='overview' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'"
          class="px-3 py-1 rounded text-sm transition-colors">Overview</button>
        <button @click="showResults('bookmarks')"
          :class="page==='bookmarks' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'"
          class="px-3 py-1 rounded text-sm transition-colors">Bookmarks</button>
        <button @click="showResults('media')"
          :class="page==='media' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'"
          class="px-3 py-1 rounded text-sm transition-colors">Media</button>
      </div>
      <div class="ml-auto text-xs text-white/30" x-text="overview ? overview.total.toLocaleString() + ' bookmarks' : ''"></div>
    </div>
  </nav>

  <!-- ── OVERVIEW ─────────────────────────────────────────────────────────── -->
  <div x-show="page==='overview'" class="max-w-7xl mx-auto px-4 py-8 space-y-8">

    <!-- Loading -->
    <div x-show="!overview" class="flex items-center justify-center h-64 text-white/40">
      <svg class="animate-spin h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
      </svg>
      Loading observatory data…
    </div>

    <template x-if="overview">
      <div class="space-y-8">

        <!-- Stats cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white/5 rounded-xl p-4 border border-white/5">
            <div class="text-white/40 text-xs uppercase tracking-wider mb-1">Bookmarks</div>
            <div class="text-2xl font-bold text-purple-300" x-text="overview.total.toLocaleString()"></div>
          </div>
          <div class="bg-white/5 rounded-xl p-4 border border-white/5">
            <div class="text-white/40 text-xs uppercase tracking-wider mb-1">Voices</div>
            <div class="text-2xl font-bold text-blue-300" x-text="overview.uniqueAuthors.toLocaleString()"></div>
          </div>
          <div class="bg-white/5 rounded-xl p-4 border border-white/5">
            <div class="text-white/40 text-xs uppercase tracking-wider mb-1">Languages</div>
            <div class="text-2xl font-bold text-teal-300" x-text="overview.languages.length"></div>
          </div>
          <div class="bg-white/5 rounded-xl p-4 border border-white/5">
            <div class="text-white/40 text-xs uppercase tracking-wider mb-1">Date range</div>
            <div class="text-sm font-medium text-white/70 mt-1" x-text="overview.dateRange.earliest + ' → ' + overview.dateRange.latest"></div>
          </div>
        </div>

        <!-- Fingerprint stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white/5 rounded-xl p-4 border border-white/5">
            <div class="text-white/40 text-xs uppercase tracking-wider mb-1">Avg length</div>
            <div class="text-xl font-bold text-amber-300" x-text="Math.round(overview.avgTextLength) + ' chars'"></div>
          </div>
          <div class="bg-white/5 rounded-xl p-4 border border-white/5">
            <div class="text-white/40 text-xs uppercase tracking-wider mb-1">With media</div>
            <div class="text-xl font-bold text-green-300" x-text="Math.round(overview.mediaStats.withMedia / overview.total * 100) + '%'"></div>
          </div>
          <div class="bg-white/5 rounded-xl p-4 border border-white/5">
            <div class="text-white/40 text-xs uppercase tracking-wider mb-1">With links</div>
            <div class="text-xl font-bold text-indigo-300" x-text="Math.round(overview.mediaStats.withLinks / overview.total * 100) + '%'"></div>
          </div>
          <div class="bg-white/5 rounded-xl p-4 border border-white/5">
            <div class="text-white/40 text-xs uppercase tracking-wider mb-1">Top voice</div>
            <div class="text-sm font-bold text-pink-300 truncate" x-text="'@' + (overview.topAuthors[0]?.handle ?? '—') + '  ×' + (overview.topAuthors[0]?.count ?? 0)"></div>
          </div>
        </div>

        <!-- Charts row 1: Authors + Composition -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-4">Who you listen to — Top 20</div>
            <div class="chart-container-tall">
              <canvas id="chartAuthors"></canvas>
            </div>
          </div>
          <div class="bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-4">Composition</div>
            <div class="chart-container">
              <canvas id="chartComposition"></canvas>
            </div>
          </div>
        </div>

        <!-- Charts row 2: Categories + Domains -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-4">Categories</div>
            <div class="chart-container-tall">
              <canvas id="chartCategories"></canvas>
            </div>
          </div>
          <div class="bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-4">Domains</div>
            <div class="chart-container-tall">
              <canvas id="chartDomains"></canvas>
            </div>
          </div>
        </div>

        <!-- Charts row 3: Publication rhythm + Weekdays -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-4">Publication rhythm</div>
            <div class="chart-container">
              <canvas id="chartMonthly"></canvas>
            </div>
          </div>
          <div class="bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-4">Post weekdays</div>
            <div class="chart-container">
              <canvas id="chartWeekdays"></canvas>
            </div>
          </div>
        </div>

        <!-- Charts row 4: Posting hours + Where links lead -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-4">Posting hours (UTC)</div>
            <div class="chart-container">
              <canvas id="chartHours"></canvas>
            </div>
          </div>
          <div class="bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-4">Where links lead</div>
            <div class="chart-container">
              <canvas id="chartLinkDomains"></canvas>
            </div>
          </div>
        </div>

        <!-- Bottom row: Rising, Latest session, Hidden gems, Time capsules -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

          <!-- Rising voices -->
          <div class="bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-3">Rising voices</div>
            <template x-if="overview.risingVoices.length === 0">
              <div class="text-white/30 text-sm">None detected</div>
            </template>
            <ul class="space-y-2">
              <template x-for="v in overview.risingVoices" :key="v.handle">
                <li class="flex items-center justify-between">
                  <span class="text-green-300 text-sm" x-text="'@' + v.handle"></span>
                  <span class="text-white/40 text-xs" x-text="'×' + v.count"></span>
                </li>
              </template>
            </ul>
          </div>

          <!-- Latest session -->
          <div class="bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-3">Latest session</div>
            <template x-if="overview.recentAuthors.length === 0">
              <div class="text-white/30 text-sm">No session data</div>
            </template>
            <ul class="space-y-2">
              <template x-for="a in overview.recentAuthors.slice(0,8)" :key="a.handle">
                <li class="flex items-center justify-between">
                  <span class="text-blue-300 text-sm" x-text="'@' + a.handle"></span>
                  <span class="text-white/40 text-xs" x-text="'×' + a.count"></span>
                </li>
              </template>
            </ul>
          </div>

          <!-- Hidden gems -->
          <div class="bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-3">Hidden gems</div>
            <template x-if="overview.hiddenGems.length === 0">
              <div class="text-white/30 text-sm">None found</div>
            </template>
            <ul class="space-y-3">
              <template x-for="g in overview.hiddenGems.slice(0,4)" :key="g.tweetId">
                <li>
                  <button @click="openDetail(g.tweetId)"
                    class="text-left w-full group">
                    <div class="text-teal-300 text-xs mb-0.5" x-text="'@' + g.author"></div>
                    <div class="text-white/50 text-xs line-clamp-2 group-hover:text-white/80 transition-colors"
                      x-text="g.text.slice(0,80) + '…'"></div>
                  </button>
                </li>
              </template>
            </ul>
          </div>

          <!-- Time capsules -->
          <div class="bg-white/5 rounded-xl p-5 border border-white/5">
            <div class="text-white/60 text-xs uppercase tracking-wider mb-3">Time capsules</div>
            <template x-if="overview.timeCapsules.length === 0">
              <div class="text-white/30 text-sm">No pre-2023 bookmarks</div>
            </template>
            <ul class="space-y-3">
              <template x-for="t in overview.timeCapsules.slice(0,4)" :key="t.tweetId">
                <li>
                  <button @click="openDetail(t.tweetId)"
                    class="text-left w-full group">
                    <div class="text-amber-300 text-xs mb-0.5" x-text="'@' + t.author + '  ·  ' + t.postedAt"></div>
                    <div class="text-white/50 text-xs line-clamp-2 group-hover:text-white/80 transition-colors"
                      x-text="t.text.slice(0,80) + '…'"></div>
                  </button>
                </li>
              </template>
            </ul>
          </div>

        </div>

      </div>
    </template>
  </div>

  <!-- ── BOOKMARKS + MEDIA (same filters, list or grid) ─────────────────────── -->
  <div x-show="page==='bookmarks' || page==='media'" class="max-w-7xl mx-auto px-4 py-8">

    <!-- Filters bar -->
    <div class="bg-white/5 border border-white/5 rounded-xl p-4 mb-6 space-y-3">
      <div class="flex flex-wrap gap-3">
        <input x-model="filters.q" @input.debounce.300ms="searchBookmarks()"
          placeholder="Search bookmarks…"
          class="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500" />

        <!-- Author searchable dropdown -->
        <div class="relative" @click.outside="autocomplete.author.open = false">
          <button @click="toggleDropdown('author')"
            :class="filters.author ? 'border-purple-500/50 text-white' : 'text-white/40'"
            class="flex items-center gap-2 w-40 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors">
            <span class="flex-1 text-left truncate" x-text="filters.author || 'Author…'"></span>
            <svg class="w-3 h-3 shrink-0 opacity-40" :class="autocomplete.author.open && 'rotate-180'" style="transition:transform .15s" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div x-show="autocomplete.author.open" x-transition
            class="absolute z-50 top-full mt-1 w-52 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl">
            <div class="p-2 border-b border-white/5">
              <input x-ref="authorSearch" x-model="autocomplete.author.search"
                @input.debounce.200ms="fetchSuggestions('author', autocomplete.author.search)"
                placeholder="Search author…"
                class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500" />
            </div>
            <div class="overflow-auto max-h-48 py-1">
              <button x-show="filters.author" @click="selectSuggestion('author', '')"
                class="block w-full text-left px-3 py-1.5 text-xs text-white/40 hover:bg-white/10 hover:text-white/70 italic transition-colors">Clear selection</button>
              <template x-for="s in autocomplete.author.items" :key="s">
                <button @click="selectSuggestion('author', s)"
                  :class="s === filters.author ? 'bg-purple-900/40 text-purple-300' : 'text-white/70 hover:bg-white/10 hover:text-white'"
                  class="block w-full text-left px-3 py-1.5 text-sm transition-colors"
                  x-text="s"></button>
              </template>
              <div x-show="autocomplete.author.items.length === 0"
                class="px-3 py-3 text-xs text-white/30 text-center">No results</div>
            </div>
          </div>
        </div>

        <!-- Category searchable dropdown -->
        <div class="relative" @click.outside="autocomplete.category.open = false">
          <button @click="toggleDropdown('category')"
            :class="filters.category ? 'border-purple-500/50 text-white' : 'text-white/40'"
            class="flex items-center gap-2 w-36 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors">
            <span class="flex-1 text-left truncate" x-text="filters.category || 'Category…'"></span>
            <svg class="w-3 h-3 shrink-0 opacity-40" :class="autocomplete.category.open && 'rotate-180'" style="transition:transform .15s" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div x-show="autocomplete.category.open" x-transition
            class="absolute z-50 top-full mt-1 w-52 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl">
            <div class="p-2 border-b border-white/5">
              <input x-ref="categorySearch" x-model="autocomplete.category.search"
                @input.debounce.200ms="fetchSuggestions('category', autocomplete.category.search)"
                placeholder="Search category…"
                class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500" />
            </div>
            <div class="overflow-auto max-h-48 py-1">
              <button x-show="filters.category" @click="selectSuggestion('category', '')"
                class="block w-full text-left px-3 py-1.5 text-xs text-white/40 hover:bg-white/10 hover:text-white/70 italic transition-colors">Clear selection</button>
              <template x-for="s in autocomplete.category.items" :key="s">
                <button @click="selectSuggestion('category', s)"
                  :class="s === filters.category ? 'bg-purple-900/40 text-purple-300' : 'text-white/70 hover:bg-white/10 hover:text-white'"
                  class="block w-full text-left px-3 py-1.5 text-sm transition-colors"
                  x-text="s"></button>
              </template>
              <div x-show="autocomplete.category.items.length === 0"
                class="px-3 py-3 text-xs text-white/30 text-center">No results</div>
            </div>
          </div>
        </div>

        <!-- Domain searchable dropdown -->
        <div class="relative" @click.outside="autocomplete.domain.open = false">
          <button @click="toggleDropdown('domain')"
            :class="filters.domain ? 'border-purple-500/50 text-white' : 'text-white/40'"
            class="flex items-center gap-2 w-36 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors">
            <span class="flex-1 text-left truncate" x-text="filters.domain || 'Domain…'"></span>
            <svg class="w-3 h-3 shrink-0 opacity-40" :class="autocomplete.domain.open && 'rotate-180'" style="transition:transform .15s" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div x-show="autocomplete.domain.open" x-transition
            class="absolute z-50 top-full mt-1 w-52 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl">
            <div class="p-2 border-b border-white/5">
              <input x-ref="domainSearch" x-model="autocomplete.domain.search"
                @input.debounce.200ms="fetchSuggestions('domain', autocomplete.domain.search)"
                placeholder="Search domain…"
                class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-purple-500" />
            </div>
            <div class="overflow-auto max-h-48 py-1">
              <button x-show="filters.domain" @click="selectSuggestion('domain', '')"
                class="block w-full text-left px-3 py-1.5 text-xs text-white/40 hover:bg-white/10 hover:text-white/70 italic transition-colors">Clear selection</button>
              <template x-for="s in autocomplete.domain.items" :key="s">
                <button @click="selectSuggestion('domain', s)"
                  :class="s === filters.domain ? 'bg-purple-900/40 text-purple-300' : 'text-white/70 hover:bg-white/10 hover:text-white'"
                  class="block w-full text-left px-3 py-1.5 text-sm transition-colors"
                  x-text="s"></button>
              </template>
              <div x-show="autocomplete.domain.items.length === 0"
                class="px-3 py-3 text-xs text-white/30 text-center">No results</div>
            </div>
          </div>
        </div>

        <select x-model="filters.sort" @change="searchBookmarks()"
          class="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500">
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </div>
      <div class="flex flex-wrap gap-3">
        <label class="flex items-center gap-2 text-xs text-white/50">
          <span>After</span>
          <input type="date" x-model="filters.after" @change="searchBookmarks()"
            class="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </label>
        <label class="flex items-center gap-2 text-xs text-white/50">
          <span>Before</span>
          <input type="date" x-model="filters.before" @change="searchBookmarks()"
            class="bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500" />
        </label>
        <button @click="clearFilters()"
          class="ml-auto text-xs text-white/30 hover:text-white/60 transition-colors px-2">Clear filters</button>
      </div>
    </div>

    <!-- Count + pagination info -->
    <div class="flex items-center justify-between mb-4">
      <div class="text-sm text-white/40" x-text="totalCount.toLocaleString() + (page==='media' ? ' media' : ' results')"></div>
      <div class="flex items-center gap-3">
        <button @click="prevPage()" :disabled="filters.offset === 0"
          class="px-3 py-1 text-sm bg-white/5 rounded disabled:opacity-30 hover:bg-white/10 transition-colors">← Prev</button>
        <span class="text-xs text-white/40"
          x-text="'Page ' + (Math.floor(filters.offset / filters.limit) + 1) + ' of ' + Math.max(1, Math.ceil(totalCount / filters.limit))"></span>
        <button @click="nextPage()" :disabled="filters.offset + filters.limit >= totalCount"
          class="px-3 py-1 text-sm bg-white/5 rounded disabled:opacity-30 hover:bg-white/10 transition-colors">Next →</button>
      </div>
    </div>

    <!-- Loading state -->
    <div x-show="bookmarksLoading" class="flex justify-center py-16 text-white/40">
      <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
      </svg>
    </div>

    <!-- Media grid: a tile opens the bookmark; "X ↗" opens the tweet the media is from -->
    <div x-show="!bookmarksLoading && page==='media'">
      <template x-if="mediaTiles.length === 0">
        <div class="text-center py-16 text-white/30">
          No downloaded media here. Run <code class="text-white/60">ft fetch-media</code> to download it.
        </div>
      </template>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        <template x-for="t in mediaTiles" :key="t.bookmarkId + ':' + (t.src || t.videoSrc)">
          <div class="relative group aspect-square rounded-lg overflow-hidden bg-white/5">
            <button type="button" @click="openDetail(t.bookmarkId)"
              class="block w-full h-full focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-lg"
              :aria-label="'Open bookmark by @' + (t.authorHandle || 'unknown')">
              <template x-if="t.src">
                <img :src="t.src" alt="" loading="lazy" class="w-full h-full object-cover"
                  @error="$el.closest('.group').style.display='none'" />
              </template>
              <template x-if="!t.src">
                <video :src="t.videoSrc" preload="metadata" muted playsinline class="w-full h-full object-cover"></video>
              </template>
            </button>
            <span x-show="t.videoSrc" aria-label="Video"
              class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white/90 text-[10px] pointer-events-none">▶</span>
            <span x-show="t.quoted"
              class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white/70 text-[10px] pointer-events-none">quoted</span>
            <div class="absolute inset-x-0 bottom-0 flex items-center gap-2 px-2 py-1.5 bg-black/70 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              <span class="flex-1 min-w-0 text-xs text-white/80 truncate pointer-events-none" x-text="'@' + (t.authorHandle || '?')"></span>
              <a :href="t.tweetUrl" target="_blank" rel="noopener noreferrer" @click.stop
                class="shrink-0 text-xs text-white/80 hover:text-white">X ↗</a>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Bookmark cards -->
    <div x-show="!bookmarksLoading && page==='bookmarks'" class="space-y-3">
      <template x-if="bookmarks.length === 0">
        <div class="text-center py-16 text-white/30">No bookmarks found</div>
      </template>
      <template x-for="b in bookmarks" :key="b.id">
        <article @click="openDetail(b.id)"
          class="bg-white/5 hover:bg-white/8 border border-white/5 hover:border-white/10 rounded-xl p-4 cursor-pointer transition-all group">
          <div class="flex items-start gap-3">
            <!-- Avatar -->
            <img :src="b.authorProfileImageUrl || ''" :alt="b.authorHandle"
              x-show="b.authorProfileImageUrl"
              class="w-9 h-9 rounded-full shrink-0 bg-white/10"
              @error="$el.style.display='none'" />
            <div x-show="!b.authorProfileImageUrl"
              class="w-9 h-9 rounded-full bg-purple-900/50 flex items-center justify-center text-purple-300 text-sm font-bold shrink-0"
              x-text="(b.authorHandle || '?')[0].toUpperCase()"></div>

            <div class="flex-1 min-w-0">
              <!-- Header -->
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="text-purple-300 text-sm font-medium" x-text="'@' + b.authorHandle"></span>
                <span x-show="b.authorName && b.authorName !== b.authorHandle"
                  class="text-white/40 text-xs" x-text="b.authorName"></span>
                <span class="text-white/25 text-xs ml-auto" x-text="b.postedAt ? b.postedAt.slice(0,10) : ''"></span>
              </div>

              <!-- Text -->
              <p class="text-white/80 text-sm leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all"
                x-text="b.text"></p>

              <!-- Footer row -->
              <div class="flex items-center gap-3 mt-2 flex-wrap">
                <span x-show="b.primaryCategory"
                  class="px-2 py-0.5 bg-purple-900/40 text-purple-300 text-xs rounded-full"
                  x-text="b.primaryCategory"></span>
                <span x-show="b.primaryDomain"
                  class="px-2 py-0.5 bg-teal-900/40 text-teal-300 text-xs rounded-full"
                  x-text="b.primaryDomain"></span>
                <div class="ml-auto flex items-center gap-3 text-white/30 text-xs">
                  <span x-show="b.likeCount > 0" x-text="'♥ ' + (b.likeCount ?? 0).toLocaleString()"></span>
                  <span x-show="b.repostCount > 0" x-text="'↺ ' + (b.repostCount ?? 0).toLocaleString()"></span>
                  <span x-show="b.mediaCount > 0 && (!b.localMediaUrls || b.localMediaUrls.length === 0)" x-text="'📎 ' + b.mediaCount"></span>
                </div>
              </div>

              <!-- Thumbnail strip (only when local files exist) -->
              <template x-if="b.localMediaUrls && b.localMediaUrls.length > 0">
                <div class="mt-2 flex gap-1.5">
                  <template x-for="url in b.localMediaUrls.slice(0, 4)" :key="url">
                    <img :src="url" class="h-16 w-16 object-cover rounded-md bg-white/5 shrink-0"
                      @error="$el.style.display='none'" />
                  </template>
                  <span x-show="b.localMediaUrls.length > 4"
                    class="flex items-center px-2 text-xs text-white/40"
                    x-text="'+' + (b.localMediaUrls.length - 4) + ' more'"></span>
                </div>
              </template>
            </div>
          </div>
        </article>
      </template>
    </div>

    <!-- Bottom pagination -->
    <div class="flex justify-center gap-3 mt-8" x-show="totalCount > filters.limit">
      <button @click="prevPage()" :disabled="filters.offset === 0"
        class="px-4 py-2 text-sm bg-white/5 rounded-lg disabled:opacity-30 hover:bg-white/10 transition-colors">← Prev</button>
      <button @click="nextPage()" :disabled="filters.offset + filters.limit >= totalCount"
        class="px-4 py-2 text-sm bg-white/5 rounded-lg disabled:opacity-30 hover:bg-white/10 transition-colors">Next →</button>
    </div>
  </div>

  <!-- ── DETAIL SLIDE-OVER ──────────────────────────────────────────────────── -->
  <div x-show="detailOpen && detail"
    class="fixed inset-0 z-50 flex"
    @keydown.escape.window="removing.open ? closeRemoveDialog() : (detailOpen = false)">

    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/60" @click="detailOpen = false"></div>

    <!-- Panel -->
    <div class="relative ml-auto w-full max-w-xl h-full bg-[#13131c] border-l border-white/10 overflow-y-auto shadow-2xl">
      <div class="p-6">

        <!-- Close button -->
        <button @click="detailOpen = false"
          class="absolute top-4 right-4 text-white/40 hover:text-white/80 transition-colors text-xl">✕</button>

        <!-- Loading -->
        <div x-show="detailLoading" class="flex justify-center py-16 text-white/40">
          <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
          </svg>
        </div>

        <template x-if="detail && !detailLoading">
          <div class="space-y-5">

            <!-- Author -->
            <div class="flex items-center gap-3">
              <img :src="detail.localProfileImageUrl || detail.authorProfileImageUrl || ''" :alt="detail.authorHandle"
                x-show="detail.localProfileImageUrl || detail.authorProfileImageUrl"
                class="w-12 h-12 rounded-full bg-white/10"
                @error="$el.src = detail.authorProfileImageUrl || ''" />
              <div x-show="!detail.localProfileImageUrl && !detail.authorProfileImageUrl"
                class="w-12 h-12 rounded-full bg-purple-900/50 flex items-center justify-center text-purple-300 text-lg font-bold"
                x-text="(detail.authorHandle || '?')[0].toUpperCase()"></div>
              <div>
                <div class="text-purple-300 font-medium" x-text="'@' + detail.authorHandle"></div>
                <div x-show="detail.authorName" class="text-white/50 text-sm" x-text="detail.authorName"></div>
              </div>
            </div>

            <!-- Full text -->
            <p class="text-white/90 text-sm leading-relaxed whitespace-pre-wrap" x-text="detail.text"></p>

            <!-- Media gallery -->
            <template x-if="detail.localMediaUrls && detail.localMediaUrls.length > 0">
              <div>
                <div class="text-white/40 text-xs uppercase tracking-wider mb-2">Media</div>
                <div class="grid grid-cols-2 gap-2">
                  <template x-for="url in detail.localMediaUrls" :key="url">
                    <div class="rounded-lg overflow-hidden bg-white/5">
                      <template x-if="url.endsWith('.mp4')">
                        <video :src="url" controls preload="metadata" playsinline class="w-full max-h-52 bg-black"></video>
                      </template>
                      <template x-if="!url.endsWith('.mp4')">
                        <a :href="url" target="_blank" rel="noopener" class="block">
                          <img :src="url" class="w-full object-cover max-h-52"
                            @error="$el.closest('a').parentElement.style.display='none'" />
                        </a>
                      </template>
                    </div>
                  </template>
                </div>
              </div>
            </template>
            <div class="flex gap-4 text-xs text-white/40 border-t border-white/5 pt-4">
              <span x-show="detail.postedAt" x-text="'Posted: ' + (detail.postedAt || '').slice(0,10)"></span>
              <span x-show="detail.bookmarkedAt" x-text="'Bookmarked: ' + (detail.bookmarkedAt || '').slice(0,10)"></span>
            </div>

            <!-- Tags -->
            <div class="flex flex-wrap gap-2">
              <span x-show="detail.primaryCategory"
                class="px-2 py-1 bg-purple-900/40 text-purple-300 text-xs rounded-full"
                x-text="detail.primaryCategory"></span>
              <span x-show="detail.primaryDomain"
                class="px-2 py-1 bg-teal-900/40 text-teal-300 text-xs rounded-full"
                x-text="detail.primaryDomain"></span>
              <span x-show="detail.language"
                class="px-2 py-1 bg-white/5 text-white/40 text-xs rounded-full"
                x-text="detail.language"></span>
            </div>

            <!-- Engagement -->
            <div class="grid grid-cols-3 gap-3">
              <div x-show="detail.likeCount > 0" class="bg-white/5 rounded-lg p-3 text-center">
                <div class="text-pink-300 font-bold" x-text="(detail.likeCount ?? 0).toLocaleString()"></div>
                <div class="text-white/40 text-xs">likes</div>
              </div>
              <div x-show="detail.repostCount > 0" class="bg-white/5 rounded-lg p-3 text-center">
                <div class="text-green-300 font-bold" x-text="(detail.repostCount ?? 0).toLocaleString()"></div>
                <div class="text-white/40 text-xs">reposts</div>
              </div>
              <div x-show="detail.replyCount > 0" class="bg-white/5 rounded-lg p-3 text-center">
                <div class="text-blue-300 font-bold" x-text="(detail.replyCount ?? 0).toLocaleString()"></div>
                <div class="text-white/40 text-xs">replies</div>
              </div>
              <div x-show="detail.quoteCount > 0" class="bg-white/5 rounded-lg p-3 text-center">
                <div class="text-purple-300 font-bold" x-text="(detail.quoteCount ?? 0).toLocaleString()"></div>
                <div class="text-white/40 text-xs">quotes</div>
              </div>
              <div x-show="detail.bookmarkCount > 0" class="bg-white/5 rounded-lg p-3 text-center">
                <div class="text-amber-300 font-bold" x-text="(detail.bookmarkCount ?? 0).toLocaleString()"></div>
                <div class="text-white/40 text-xs">bookmarks</div>
              </div>
              <div x-show="detail.viewCount > 0" class="bg-white/5 rounded-lg p-3 text-center">
                <div class="text-white/60 font-bold" x-text="(detail.viewCount ?? 0).toLocaleString()"></div>
                <div class="text-white/40 text-xs">views</div>
              </div>
            </div>

            <!-- Article enrichment -->
            <div x-show="detail.articleTitle" class="bg-white/5 rounded-xl p-4 border border-white/5">
              <div class="text-white/40 text-xs uppercase tracking-wider mb-2">Article</div>
              <div class="text-white/80 font-medium text-sm mb-1" x-text="detail.articleTitle"></div>
              <div x-show="detail.articleSite" class="text-white/40 text-xs" x-text="detail.articleSite"></div>
              <p x-show="detail.articleText"
                class="text-white/50 text-xs mt-2 line-clamp-4"
                x-text="detail.articleText"></p>
            </div>

            <!-- Links -->
            <div x-show="detail.links && detail.links.length > 0">
              <div class="text-white/40 text-xs uppercase tracking-wider mb-2">Links</div>
              <ul class="space-y-1">
                <template x-for="link in (detail.links || []).slice(0,6)" :key="link">
                  <li>
                    <a :href="link" target="_blank" rel="noopener noreferrer"
                      class="text-blue-400 text-xs hover:underline break-all"
                      x-text="link"></a>
                  </li>
                </template>
              </ul>
            </div>

            <!-- Open on X -->
            <a :href="detail.url" target="_blank" rel="noopener noreferrer"
              class="flex items-center justify-center gap-2 w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/60 hover:text-white/90 transition-colors border border-white/5">
              View on X ↗
            </a>

            <!-- Remove bookmark: on X first, then from the local archive -->
            <button @click="removeBookmark(detail)" :disabled="removing.busy"
              class="flex items-center justify-center gap-2 w-full py-2 bg-red-900/20 hover:bg-red-900/40 rounded-lg text-sm text-red-400 hover:text-red-300 transition-colors border border-red-900/30 disabled:opacity-60 disabled:cursor-wait">
              <svg x-show="removing.busy && !removing.open" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
              </svg>
              <span x-text="removing.busy && !removing.open ? 'Removing on X…' : '🗑 Remove bookmark on X and from archive'"></span>
            </button>

          </div>
        </template>
      </div>
    </div>
  </div>

  <!-- ── REMOVE FAILED DIALOG ────────────────────────────────────────────────── -->
  <div x-show="removing.open" x-transition.opacity
    class="fixed inset-0 z-[60] flex items-center justify-center p-4"
    role="dialog" aria-modal="true" aria-labelledby="remove-dialog-title">
    <div class="absolute inset-0 bg-black/70" @click="closeRemoveDialog()"></div>
    <div class="relative w-full max-w-md bg-[#16161f] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-4">
      <div class="flex items-start gap-3">
        <div class="shrink-0 w-9 h-9 rounded-full bg-amber-900/40 text-amber-300 flex items-center justify-center font-bold" aria-hidden="true">!</div>
        <div class="min-w-0">
          <h2 id="remove-dialog-title" class="text-white font-medium">Couldn't remove it on X</h2>
          <p class="text-white/70 text-sm mt-1 break-words" x-text="removing.error"></p>
          <p class="text-white/40 text-xs mt-2" x-show="removeHint()" x-text="removeHint()"></p>
        </div>
      </div>

      <p class="text-white/40 text-xs leading-relaxed">
        It's still in your archive. If you only remove it locally while it's bookmarked on X, the next
        <code class="text-white/60">ft sync</code> brings it back.
      </p>

      <div class="flex flex-col gap-2">
        <button x-ref="removeRetry" @click="removeBookmark(removing.bookmark)" :disabled="removing.busy"
          class="w-full py-2 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-60 disabled:cursor-wait focus:outline-none focus:ring-2 focus:ring-purple-400"
          x-text="removing.busy ? 'Trying again…' : 'Try again'"></button>
        <a :href="removing.bookmark ? removing.bookmark.url : '#'" target="_blank" rel="noopener noreferrer"
          @click="removing.openedOnX = true"
          class="w-full py-2 rounded-lg text-sm text-center bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-400">
          Open on X to unbookmark it yourself ↗
        </a>
        <button @click="removeLocally()" :disabled="removing.busy"
          :class="removing.openedOnX ? 'bg-red-900/40 text-red-200 border-red-800/60' : 'bg-transparent text-red-400/80 border-red-900/30'"
          class="w-full py-2 rounded-lg text-sm border hover:bg-red-900/40 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-red-400"
          x-text="removing.openedOnX ? 'Done on X — remove from archive' : 'Remove from archive only'"></button>
        <button @click="closeRemoveDialog()"
          class="w-full py-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">Cancel</button>
      </div>
    </div>
  </div>

  <!-- ── TOAST ───────────────────────────────────────────────────────────────── -->
  <div x-show="toast.show" x-transition
    class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-lg bg-[#1e1e2e] border border-white/10 text-sm text-white/80 shadow-xl"
    role="status" aria-live="polite" x-text="toast.message"></div>

<script>
const CHART_DEFAULTS = {
  color: 'rgba(200,200,210,0.7)',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#1e1e2e',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      titleColor: '#ccd0da',
      bodyColor: 'rgba(200,200,210,0.7)',
    },
  },
  scales: {
    x: { ticks: { color: 'rgba(200,200,210,0.5)', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
    y: { ticks: { color: 'rgba(200,200,210,0.5)', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
  },
};

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
function rgbStr(r, g, b, a = 1) { return \`rgba(\${r},\${g},\${b},\${a})\`; }

function gradientColors(count, from, to, alpha = 0.85) {
  return Array.from({ length: count }, (_, i) => {
    const [r, g, b] = lerp(from, to, count > 1 ? i / (count - 1) : 0);
    return rgbStr(r, g, b, alpha);
  });
}

function buildAuthorsChart(data) {
  const ctx = document.getElementById('chartAuthors');
  if (!ctx || !data.topAuthors?.length) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.topAuthors.map(a => '@' + a.handle),
      datasets: [{
        data: data.topAuthors.map(a => a.count),
        backgroundColor: gradientColors(data.topAuthors.length, [100,160,255], [255,120,180]),
        borderRadius: 4,
        barThickness: 14,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      indexAxis: 'y',
      plugins: { ...CHART_DEFAULTS.plugins },
      scales: {
        x: { ...CHART_DEFAULTS.scales.x },
        y: { ...CHART_DEFAULTS.scales.y, ticks: { ...CHART_DEFAULTS.scales.y.ticks, font: { size: 11 } } },
      },
    },
  });
}

function buildCompositionChart(data) {
  const ctx = document.getElementById('chartComposition');
  if (!ctx || !data.mediaStats) return;
  const { withMedia, withLinks, total } = data.mediaStats;
  const textOnly = Math.max(0, total - withMedia - withLinks);
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Media', 'Links', 'Text only'],
      datasets: [{
        data: [withMedia, withLinks, textOnly],
        backgroundColor: ['rgba(120,220,170,0.8)', 'rgba(130,170,255,0.8)', 'rgba(100,100,120,0.8)'],
        borderColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
      }],
    },
    options: {
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: 'rgba(200,200,210,0.6)', font: { size: 11 }, padding: 12 } },
        tooltip: CHART_DEFAULTS.plugins.tooltip,
      },
    },
  });
}

function buildCategoriesChart(data) {
  const ctx = document.getElementById('chartCategories');
  if (!ctx || !data.categories?.length) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.categories.map(c => c.name),
      datasets: [{
        data: data.categories.map(c => c.count),
        backgroundColor: gradientColors(data.categories.length, [255,180,120], [200,100,80]),
        borderRadius: 4,
        barThickness: 14,
      }],
    },
    options: { ...CHART_DEFAULTS, indexAxis: 'y' },
  });
}

function buildDomainsChart(data) {
  const ctx = document.getElementById('chartDomains');
  if (!ctx || !data.domains?.length) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.domains.map(d => d.name),
      datasets: [{
        data: data.domains.map(d => d.count),
        backgroundColor: gradientColors(data.domains.length, [100,220,230], [60,150,180]),
        borderRadius: 4,
        barThickness: 14,
      }],
    },
    options: { ...CHART_DEFAULTS, indexAxis: 'y' },
  });
}

function buildMonthlyChart(data) {
  const ctx = document.getElementById('chartMonthly');
  if (!ctx || !data.monthlyActivity?.length) return;
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.monthlyActivity.map(m => m.month),
      datasets: [{
        data: data.monthlyActivity.map(m => m.count),
        borderColor: 'rgba(255,180,120,0.9)',
        backgroundColor: 'rgba(255,180,120,0.1)',
        tension: 0.3,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: 'rgba(255,180,120,0.9)',
      }],
    },
    options: CHART_DEFAULTS,
  });
}

function buildWeekdaysChart(data) {
  const ctx = document.getElementById('chartWeekdays');
  if (!ctx || !data.dayOfWeekActivity?.length) return;
  const order = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const map = Object.fromEntries(data.dayOfWeekActivity.map(d => [d.day, d.count]));
  const counts = order.map(d => map[d] ?? 0);
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: order,
      datasets: [{
        data: counts,
        backgroundColor: gradientColors(7, [80,200,160], [120,255,200]),
        borderRadius: 4,
      }],
    },
    options: CHART_DEFAULTS,
  });
}

function buildHoursChart(data) {
  const ctx = document.getElementById('chartHours');
  if (!ctx || !data.hourActivity?.length) return;
  const map = Object.fromEntries(data.hourActivity.map(h => [h.hour, h.count]));
  const counts = Array.from({ length: 24 }, (_, i) => map[i] ?? 0);
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: counts.map((_, i) => i + 'h'),
      datasets: [{
        data: counts,
        backgroundColor: gradientColors(24, [60,180,200], [100,240,255]),
        borderRadius: 2,
      }],
    },
    options: CHART_DEFAULTS,
  });
}

function buildLinkDomainsChart(data) {
  const ctx = document.getElementById('chartLinkDomains');
  if (!ctx || !data.topDomains?.length) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.topDomains.map(d => d.domain),
      datasets: [{
        data: data.topDomains.map(d => d.count),
        backgroundColor: gradientColors(data.topDomains.length, [140,100,230], [200,150,255]),
        borderRadius: 4,
        barThickness: 16,
      }],
    },
    options: { ...CHART_DEFAULTS, indexAxis: 'y' },
  });
}

function app() {
  return {
    page: 'overview',
    overview: null,
    bookmarks: [],
    mediaTiles: [],
    totalCount: 0,
    bookmarksLoading: false,
    detailOpen: false,
    detail: null,
    detailLoading: false,
    filters: {
      q: '',
      author: '',
      category: '',
      domain: '',
      after: '',
      before: '',
      sort: 'desc',
      limit: 50,
      offset: 0,
    },
    autocomplete: {
      author:   { open: false, search: '', items: [] },
      category: { open: false, search: '', items: [] },
      domain:   { open: false, search: '', items: [] },
    },
    chartsBuilt: false,
    removing: { open: false, busy: false, bookmark: null, error: '', reason: '', retryAfterSec: null, openedOnX: false },
    toast: { show: false, message: '', timer: null },

    async init() {
      await this.loadOverview();
    },

    async loadOverview() {
      try {
        const res = await fetch('/api/overview');
        this.overview = await res.json();
        this.$nextTick(() => this.buildCharts());
      } catch (e) {
        console.error('Failed to load overview:', e);
      }
    },

    buildCharts() {
      if (this.chartsBuilt || !this.overview) return;
      this.chartsBuilt = true;
      const d = this.overview;
      buildAuthorsChart(d);
      buildCompositionChart(d);
      buildCategoriesChart(d);
      buildDomainsChart(d);
      buildMonthlyChart(d);
      buildWeekdaysChart(d);
      buildHoursChart(d);
      buildLinkDomainsChart(d);
    },

    // The Bookmarks list and the Media grid share the filters; the grid pages
    // by tile, so switching resets the page and its size.
    showResults(page) {
      if (this.page !== page) {
        this.filters.offset = 0;
        this.filters.limit = page === 'media' ? 60 : 50;
      }
      this.page = page;
      this.loadBookmarks();
    },

    // Loads the current page's results: bookmark cards or media tiles.
    // keepPosition refreshes the list in place (e.g. after a removal). Swapping
    // the list for the loading spinner collapses the page and jumps to the top.
    async loadBookmarks({ keepPosition = false } = {}) {
      const page = this.page;
      const scrollY = window.scrollY;
      if (!keepPosition) this.bookmarksLoading = true;
      try {
        const endpoint = page === 'media' ? '/api/media?' : '/api/bookmarks?';
        const res = await fetch(endpoint + this.buildParams());
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        // Switched tabs while this was loading: the newer load owns the page.
        if (this.page !== page) return;
        const total = Number(res.headers.get('X-Total-Count')) || 0;

        // Removing the last item on a later page leaves it empty: show the new last page.
        if (keepPosition && data.length === 0 && total > 0 && this.filters.offset > 0) {
          this.filters.offset = Math.floor((total - 1) / this.filters.limit) * this.filters.limit;
          return this.loadBookmarks({ keepPosition });
        }

        if (page === 'media') this.mediaTiles = data;
        else this.bookmarks = data;
        this.totalCount = total;
        if (keepPosition) {
          this.$nextTick(() => {
            const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            window.scrollTo({ top: Math.min(scrollY, maxY) });
          });
        }
      } catch (e) {
        console.error('Failed to load bookmarks:', e);
      } finally {
        if (this.page === page) this.bookmarksLoading = false;
      }
    },

    buildParams() {
      const p = new URLSearchParams();
      if (this.filters.q) p.set('q', this.filters.q);
      if (this.filters.author) p.set('author', this.filters.author);
      if (this.filters.category) p.set('category', this.filters.category);
      if (this.filters.domain) p.set('domain', this.filters.domain);
      if (this.filters.after) p.set('after', this.filters.after);
      if (this.filters.before) p.set('before', this.filters.before);
      p.set('sort', this.filters.sort);
      p.set('limit', String(this.filters.limit));
      p.set('offset', String(this.filters.offset));
      return p.toString();
    },

    searchBookmarks() {
      this.filters.offset = 0;
      this.loadBookmarks();
    },

    clearFilters() {
      Object.assign(this.filters, { q: '', author: '', category: '', domain: '', after: '', before: '', sort: 'desc', offset: 0 });
      for (const f of ['author', 'category', 'domain']) {
        Object.assign(this.autocomplete[f], { open: false, search: '', items: [] });
      }
      this.loadBookmarks();
    },

    async toggleDropdown(field) {
      const isOpen = this.autocomplete[field].open;
      // Close all others first
      for (const f of ['author', 'category', 'domain']) {
        this.autocomplete[f].open = false;
      }
      if (!isOpen) {
        this.autocomplete[field].open = true;
        await this.fetchSuggestions(field, this.autocomplete[field].search);
        // Focus the search input after opening
        this.$nextTick(() => {
          const ref = this.$refs[field + 'Search'];
          if (ref) ref.focus();
        });
      }
    },

    async fetchSuggestions(field, value) {
      try {
        const url = value
          ? '/api/suggestions?field=' + field + '&q=' + encodeURIComponent(value)
          : '/api/suggestions?field=' + field;
        const res = await fetch(url);
        this.autocomplete[field].items = await res.json();
      } catch { /* silent */ }
    },

    selectSuggestion(field, value) {
      this.filters[field] = value;
      this.autocomplete[field].open = false;
      this.searchBookmarks();
    },

    prevPage() {
      this.filters.offset = Math.max(0, this.filters.offset - this.filters.limit);
      this.loadBookmarks();
    },

    nextPage() {
      this.filters.offset += this.filters.limit;
      this.loadBookmarks();
    },

    async openDetail(id) {
      this.detail = null;
      this.detailLoading = true;
      this.detailOpen = true;
      try {
        const res = await fetch('/api/bookmarks/' + encodeURIComponent(id));
        this.detail = await res.json();
      } catch (e) {
        console.error('Failed to load detail:', e);
      } finally {
        this.detailLoading = false;
      }
    },

    // Remove a bookmark on X, then from the archive. On failure the server keeps
    // the local copy and a dialog offers retry, manual removal on X (a real link,
    // so popup blockers never interfere), or local-only removal.
    async removeBookmark(bookmark, scope) {
      if (!bookmark || this.removing.busy) return;
      this.removing.busy = true;
      this.removing.bookmark = { id: bookmark.id, url: bookmark.url };
      try {
        const query = scope === 'local' ? '?scope=local' : '';
        const res = await fetch('/api/bookmarks/' + encodeURIComponent(bookmark.id) + query, { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          Object.assign(this.removing, {
            open: true,
            error: data.error || ('Request failed (HTTP ' + res.status + ')'),
            reason: data.reason || '',
            retryAfterSec: data.retryAfterSec ?? null,
          });
          this.$nextTick(() => this.$refs.removeRetry && this.$refs.removeRetry.focus());
          return;
        }
        this.closeRemoveDialog();
        this.detailOpen = false;
        if (this.overview) this.overview.total = Math.max(0, this.overview.total - 1);
        await this.loadBookmarks({ keepPosition: true });
        this.detail = null;
        this.showToast(
          data.remote === 'removed' ? 'Removed from X and your archive'
            : data.remote === 'not_bookmarked' ? 'Already gone on X — removed from your archive'
            : 'Removed from your archive'
        );
      } catch (e) {
        Object.assign(this.removing, {
          open: true,
          error: 'Could not reach the Field Theory server: ' + e.message,
          reason: 'server',
        });
      } finally {
        this.removing.busy = false;
      }
    },

    removeLocally() {
      return this.removeBookmark(this.removing.bookmark, 'local');
    },

    closeRemoveDialog() {
      Object.assign(this.removing, { open: false, error: '', reason: '', retryAfterSec: null, openedOnX: false });
    },

    removeHint() {
      switch (this.removing.reason) {
        case 'auth': return 'Check that you are logged into x.com in the browser ft uses (or restart ft web with --browser / --cookies).';
        case 'rate_limited': return this.removing.retryAfterSec
          ? 'X asks to wait about ' + Math.max(1, Math.ceil(this.removing.retryAfterSec / 60)) + ' min before retrying.'
          : 'Wait a minute, then try again.';
        case 'network': return 'Check your internet connection, then try again.';
        case 'rejected': return 'X may have changed its web API. Removing it yourself on X always works.';
        default: return '';
      }
    },

    showToast(message) {
      clearTimeout(this.toast.timer);
      this.toast.message = message;
      this.toast.show = true;
      this.toast.timer = setTimeout(() => { this.toast.show = false; }, 3500);
    },
  };
}
</script>
</body>
</html>`;
}

// ── Request router ────────────────────────────────────────────────────────────

interface WebState {
  getDb: () => Promise<Database>;
  getMediaIndex: () => Promise<MediaIndex>;
  unbookmark: (tweetId: string) => Promise<UnbookmarkResult>;
}

export interface WebServerOptions {
  /** Where to read the X session from when removing bookmarks on X. */
  xSession?: XSessionOptions;
  /** Override the X unbookmark call (tests). Defaults to the browser-session GraphQL mutation. */
  unbookmark?: (tweetId: string) => Promise<UnbookmarkResult>;
}

function filtersFromQuery(q: Record<string, string>) {
  return {
    query: q.q || undefined,
    author: q.author || undefined,
    category: q.category || undefined,
    domain: q.domain || undefined,
    after: q.after || undefined,
    before: q.before || undefined,
  };
}

function sendAsset(res: ServerResponse, body: string | Buffer, contentType: string): void {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'public, max-age=3600',
  });
  res.end(body);
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, state: WebState): Promise<void> {
  const parsed = parseUrl(req.url ?? '', true);
  const pathname = parsed.pathname ?? '/';

  // Only answer requests addressed to this machine. Blocks DNS-rebinding pages
  // from reaching the API, which can remove bookmarks on X.
  if (!LOCAL_HOST.test(req.headers.host ?? '')) {
    json(res, { error: 'forbidden host' }, 403);
    return;
  }

  // Static HTML shell
  if (req.method === 'GET' && pathname === '/') {
    html(res, buildHtml());
    return;
  }

  // Bundled CSS and vendored scripts
  if (req.method === 'GET' && pathname === '/assets/app.css') {
    sendAsset(res, WEB_CSS, 'text/css; charset=utf-8');
    return;
  }
  const vendorAsset = req.method === 'GET' ? VENDOR_ASSETS[pathname] : undefined;
  if (vendorAsset) {
    sendAsset(res, await readFile(vendorAsset.resolve()), vendorAsset.contentType);
    return;
  }

  // DELETE /api/bookmarks/:id[?scope=local]
  //
  // By default the bookmark is removed on X first and only then from the local
  // archive: deleting locally while it is still bookmarked on X would just
  // bring it back on the next `ft sync`. If X fails, the local copy is kept and
  // the reason is returned so the dashboard can offer retry / manual removal.
  // `scope=local` skips X (used after the user removed it on X by hand).
  if (req.method === 'DELETE') {
    const deleteMatch = pathname.match(/^\/api\/bookmarks\/(.+)$/);
    if (!deleteMatch) {
      json(res, { error: 'not found' }, 404);
      return;
    }
    if (!isSameOrigin(req)) {
      json(res, { error: 'cross-origin request refused' }, 403);
      return;
    }
    const id = decodeURIComponent(deleteMatch[1]);
    const bookmark = await getBookmarkById(id, await state.getDb());
    if (!bookmark) {
      json(res, { error: 'not found' }, 404);
      return;
    }

    let remote: UnbookmarkStatus | 'skipped' = 'skipped';
    if (qs(req).scope !== 'local') {
      const result = await state.unbookmark(bookmark.tweetId);
      if (!result.ok) {
        json(res, {
          error: result.message,
          reason: result.status,
          retryAfterSec: result.retryAfterSec,
          url: bookmark.url,
        }, 502);
        return;
      }
      remote = result.status;
    }

    const deleted = await deleteBookmark(id);
    if (!deleted) {
      json(res, { error: 'not found' }, 404);
      return;
    }
    json(res, { deleted: true, url: deleted.url, remote });
    return;
  }

  if (req.method !== 'GET') {
    json(res, { error: 'method not allowed' }, 405);
    return;
  }

  // /media/:filename — serve locally cached media files
  const mediaFileMatch = pathname.match(/^\/media\/([^/]+)$/);
  if (mediaFileMatch) {
    const filename = mediaFileMatch[1];
    const mediaDir = bookmarkMediaDir();
    const resolved = path.resolve(mediaDir, filename);
    // Security: reject path traversal — resolved path must stay inside mediaDir
    if (!resolved.startsWith(mediaDir + path.sep) && resolved !== mediaDir) {
      json(res, { error: 'invalid filename' }, 400);
      return;
    }
    try {
      const buf = await readFile(resolved);
      const ext = path.extname(filename).toLowerCase();
      const contentType = EXT_CONTENT_TYPE[ext] ?? 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': buf.length,
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(buf);
    } catch {
      json(res, { error: 'not found' }, 404);
    }
    return;
  }

  // /api/overview
  if (pathname === '/api/overview') {
    const data = await buildVizData(await state.getDb());
    json(res, data);
    return;
  }

  // /api/suggestions
  if (pathname === '/api/suggestions') {
    const q = qs(req);
    const field = q.field;
    if (field !== 'author' && field !== 'category' && field !== 'domain') {
      json(res, { error: 'field must be author, category, or domain' }, 400);
      return;
    }
    const prefix = q.q ?? '';
    const suggestions = await getFilterSuggestions(field, prefix, 20, await state.getDb());
    json(res, suggestions);
    return;
  }

  // /api/count
  if (pathname === '/api/count') {
    const count = await countBookmarks(filtersFromQuery(qs(req)), await state.getDb());
    json(res, { count });
    return;
  }

  // /api/bookmarks/:id
  const detailMatch = pathname.match(/^\/api\/bookmarks\/(.+)$/);
  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    const bookmark = await getBookmarkById(id, await state.getDb());
    if (!bookmark) {
      json(res, { error: 'not found' }, 404);
      return;
    }
    const mediaEntries = (await state.getMediaIndex()).byTweet.get(bookmark.tweetId) ?? [];
    const localMediaUrls = mediaEntries
      .filter((e) => !e.isProfileImage)
      .map((e) => `/media/${e.filename}`);
    const profileImage = mediaEntries.find((e) => e.isProfileImage);
    const localProfileImageUrl = profileImage ? `/media/${profileImage.filename}` : undefined;
    json(res, { ...bookmark, localMediaUrls, localProfileImageUrl });
    return;
  }

  // /api/bookmarks — the total match count rides along in X-Total-Count so the
  // dashboard needs one request per search instead of two.
  if (pathname === '/api/bookmarks') {
    const q = qs(req);
    const filters = filtersFromQuery(q);
    const db = await state.getDb();
    const mediaIndex = await state.getMediaIndex();
    const items = await listBookmarks({
      ...filters,
      sort: q.sort === 'asc' ? 'asc' : 'desc',
      limit: intParam(q.limit, 50, 1, 200),
      offset: intParam(q.offset, 0, 0),
    }, db);
    const total = await countBookmarks(filters, db);
    const enriched = items.map((b) => {
      const entries = mediaIndex.byTweet.get(b.tweetId) ?? [];
      const localMediaUrls = entries
        .filter((e) => !e.isProfileImage)
        .map((e) => `/media/${e.filename}`);
      return { ...b, localMediaUrls };
    });
    json(res, enriched, 200, { 'X-Total-Count': String(total) });
    return;
  }

  // /api/media — downloaded media of the bookmarks matching the filters, one
  // tile per image or video, in timeline order. Paged by tile, total in X-Total-Count.
  if (pathname === '/api/media') {
    const q = qs(req);
    const { byBookmark } = await state.getMediaIndex();
    const matches = byBookmark.size === 0 ? [] : await listBookmarkIds({
      ...filtersFromQuery(q),
      sort: q.sort === 'asc' ? 'asc' : 'desc',
    }, await state.getDb());
    const tiles = matches.flatMap(({ id, tweetId }) =>
      (byBookmark.get(id) ?? []).map((tile) => ({ ...tile, bookmarkId: id, quoted: tile.tweetId !== tweetId })));
    const offset = intParam(q.offset, 0, 0);
    const page = tiles.slice(offset, offset + intParam(q.limit, 60, 1, 200));
    json(res, page, 200, { 'X-Total-Count': String(tiles.length) });
    return;
  }

  json(res, { error: 'not found' }, 404);
}

// ── Server factory (exported for testing) ────────────────────────────────────

export async function createWebServer(
  port: number,
  options: WebServerOptions = {},
): Promise<{ port: number; close: () => Promise<void> }> {
  const dbCache = cachedByFile(twitterBookmarksIndexPath, loadIndexDb, (db) => db.close());
  const mediaCache = cachedByFile(bookmarkMediaManifestPath, buildMediaIndex);
  const state: WebState = {
    getDb: dbCache.get,
    getMediaIndex: mediaCache.get,
    unbookmark: options.unbookmark ?? createUnbookmarker(options.xSession),
  };

  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res, state);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, { error: message }, 500);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve());
    server.once('error', reject);
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr !== null ? addr.port : port;
  const close = (): Promise<void> =>
    new Promise((resolve, reject) => server.close((err) => {
      dbCache.dispose();
      mediaCache.dispose();
      if (err) reject(err);
      else resolve();
    }));

  return { port: actualPort, close };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function startWeb(port: number, openBrowser: boolean, options: WebServerOptions = {}): Promise<void> {
  const { port: actualPort, close } = await createWebServer(port, options);

  const url = `http://localhost:${actualPort}`;
  process.stdout.write(`\nField Theory web running at ${url}\nPress Ctrl+C to stop.\n\n`);

  if (openBrowser) {
    openInBrowser(url);
  }

  // Keep alive until interrupted
  await new Promise<void>((resolve) => {
    process.once('SIGINT', () => { close().then(resolve).catch(resolve); });
    process.once('SIGTERM', () => { close().then(resolve).catch(resolve); });
  });
}
