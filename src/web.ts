import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { parse as parseUrl } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildVizData } from './bookmarks-viz.js';
import {
  listBookmarks,
  countBookmarks,
  getBookmarkById,
  getFilterSuggestions,
  deleteBookmark,
} from './bookmarks-db.js';
import { pathExists, readJson } from './fs.js';
import { bookmarkMediaDir, bookmarkMediaManifestPath } from './paths.js';
import type { MediaFetchManifest } from './bookmark-media.js';

// ── Media index ───────────────────────────────────────────────────────────────

interface MediaEntry { filename: string; contentType: string; isProfileImage: boolean }
type MediaIndex = Map<string, MediaEntry[]>; // tweetId → entries

const EXT_CONTENT_TYPE: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

async function buildMediaIndex(): Promise<MediaIndex> {
  const manifestPath = bookmarkMediaManifestPath();
  if (!(await pathExists(manifestPath))) return new Map();
  try {
    const manifest = await readJson<MediaFetchManifest>(manifestPath);
    const index = new Map<string, MediaEntry[]>();
    for (const entry of manifest.entries) {
      if (entry.status !== 'downloaded' || !entry.localPath) continue;
      const filename = path.basename(entry.localPath);
      const arr = index.get(entry.tweetId) ?? [];
      arr.push({
        filename,
        contentType: entry.contentType ?? 'application/octet-stream',
        isProfileImage: entry.sourceUrl.includes('/profile_images/'),
      });
      index.set(entry.tweetId, arr);
    }
    return index;
  } catch {
    return new Map();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
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
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/cdn.min.js"></script>
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
<body x-data="app()" x-init="init()" x-cloak>

  <!-- Nav -->
  <nav class="sticky top-0 z-50 bg-[#0f0f14]/90 backdrop-blur border-b border-white/5">
    <div class="max-w-7xl mx-auto px-4 flex items-center gap-6 h-12">
      <span class="text-purple-300 font-semibold tracking-wide text-sm">✦ FIELD THEORY</span>
      <div class="flex gap-1 ml-4">
        <button @click="page='overview'"
          :class="page==='overview' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'"
          class="px-3 py-1 rounded text-sm transition-colors">Overview</button>
        <button @click="page='bookmarks'; loadBookmarks()"
          :class="page==='bookmarks' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'"
          class="px-3 py-1 rounded text-sm transition-colors">Bookmarks</button>
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

  <!-- ── BOOKMARKS ──────────────────────────────────────────────────────────── -->
  <div x-show="page==='bookmarks'" class="max-w-7xl mx-auto px-4 py-8">

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
      <div class="text-sm text-white/40" x-text="totalCount.toLocaleString() + ' results'"></div>
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

    <!-- Bookmark cards -->
    <div x-show="!bookmarksLoading" class="space-y-3">
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
                  <span x-show="b.likeCount > 0" x-text="'♥ ' + b.likeCount.toLocaleString()"></span>
                  <span x-show="b.repostCount > 0" x-text="'↺ ' + b.repostCount.toLocaleString()"></span>
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
    @keydown.escape.window="detailOpen = false">

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
                    <a :href="url" target="_blank" rel="noopener" class="block rounded-lg overflow-hidden bg-white/5">
                      <img :src="url" class="w-full object-cover max-h-52"
                        @error="$el.closest('a').style.display='none'" />
                    </a>
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
                <div class="text-pink-300 font-bold" x-text="detail.likeCount.toLocaleString()"></div>
                <div class="text-white/40 text-xs">likes</div>
              </div>
              <div x-show="detail.repostCount > 0" class="bg-white/5 rounded-lg p-3 text-center">
                <div class="text-green-300 font-bold" x-text="detail.repostCount.toLocaleString()"></div>
                <div class="text-white/40 text-xs">reposts</div>
              </div>
              <div x-show="detail.replyCount > 0" class="bg-white/5 rounded-lg p-3 text-center">
                <div class="text-blue-300 font-bold" x-text="detail.replyCount.toLocaleString()"></div>
                <div class="text-white/40 text-xs">replies</div>
              </div>
              <div x-show="detail.quoteCount > 0" class="bg-white/5 rounded-lg p-3 text-center">
                <div class="text-purple-300 font-bold" x-text="detail.quoteCount.toLocaleString()"></div>
                <div class="text-white/40 text-xs">quotes</div>
              </div>
              <div x-show="detail.bookmarkCount > 0" class="bg-white/5 rounded-lg p-3 text-center">
                <div class="text-amber-300 font-bold" x-text="detail.bookmarkCount.toLocaleString()"></div>
                <div class="text-white/40 text-xs">bookmarks</div>
              </div>
              <div x-show="detail.viewCount > 0" class="bg-white/5 rounded-lg p-3 text-center">
                <div class="text-white/60 font-bold" x-text="detail.viewCount.toLocaleString()"></div>
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

            <!-- Delete bookmark -->
            <button @click="deleteBookmark(detail.id, detail.url)"
              class="flex items-center justify-center gap-2 w-full py-2 bg-red-900/20 hover:bg-red-900/40 rounded-lg text-sm text-red-400 hover:text-red-300 transition-colors border border-red-900/30">
              🗑 Delete from local archive &amp; open on X to unbookmark
            </button>

          </div>
        </template>
      </div>
    </div>
  </div>

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

    async loadBookmarks() {
      this.bookmarksLoading = true;
      try {
        const params = this.buildParams();
        const [listRes, countRes] = await Promise.all([
          fetch('/api/bookmarks?' + params),
          fetch('/api/count?' + params),
        ]);
        this.bookmarks = await listRes.json();
        const countData = await countRes.json();
        this.totalCount = countData.count ?? 0;
      } catch (e) {
        console.error('Failed to load bookmarks:', e);
      } finally {
        this.bookmarksLoading = false;
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

    async deleteBookmark(id, tweetUrl) {
      try {
        const res = await fetch('/api/bookmarks/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!res.ok) { console.error('Delete failed', await res.text()); return; }
      } catch (e) {
        console.error('Delete failed:', e);
        return;
      }
      this.detailOpen = false;
      await this.loadBookmarks();
      this.detail = null;
      if (tweetUrl) window.open(tweetUrl, '_blank', 'noopener,noreferrer');
    },
  };
}
</script>
</body>
</html>`;
}

// ── Request router ────────────────────────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse, mediaIndex: MediaIndex): Promise<void> {
  const parsed = parseUrl(req.url ?? '', true);
  const pathname = parsed.pathname ?? '/';

  // Static HTML shell
  if (req.method === 'GET' && pathname === '/') {
    html(res, buildHtml());
    return;
  }

  // DELETE /api/bookmarks/:id
  if (req.method === 'DELETE') {
    const deleteMatch = pathname.match(/^\/api\/bookmarks\/(.+)$/);
    if (!deleteMatch) {
      json(res, { error: 'not found' }, 404);
      return;
    }
    const id = decodeURIComponent(deleteMatch[1]);
    const deleted = await deleteBookmark(id);
    if (!deleted) {
      json(res, { error: 'not found' }, 404);
      return;
    }
    json(res, { deleted: true, url: deleted.url });
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
    const data = await buildVizData();
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
    const suggestions = await getFilterSuggestions(field, prefix);
    json(res, suggestions);
    return;
  }

  // /api/count
  if (pathname === '/api/count') {
    const q = qs(req);
    const count = await countBookmarks({
      query: q.q || undefined,
      author: q.author || undefined,
      category: q.category || undefined,
      domain: q.domain || undefined,
      after: q.after || undefined,
      before: q.before || undefined,
    });
    json(res, { count });
    return;
  }

  // /api/bookmarks/:id
  const detailMatch = pathname.match(/^\/api\/bookmarks\/(.+)$/);
  if (detailMatch) {
    const id = decodeURIComponent(detailMatch[1]);
    const bookmark = await getBookmarkById(id);
    if (!bookmark) {
      json(res, { error: 'not found' }, 404);
      return;
    }
    const mediaEntries = mediaIndex.get(bookmark.tweetId) ?? [];
    const localMediaUrls = mediaEntries
      .filter((e) => !e.isProfileImage)
      .map((e) => `/media/${e.filename}`);
    const localProfileImageUrl = mediaEntries.find((e) => e.isProfileImage)
      ? `/media/${mediaEntries.find((e) => e.isProfileImage)!.filename}`
      : undefined;
    json(res, { ...bookmark, localMediaUrls, localProfileImageUrl });
    return;
  }

  // /api/bookmarks
  if (pathname === '/api/bookmarks') {
    const q = qs(req);
    const items = await listBookmarks({
      query: q.q || undefined,
      author: q.author || undefined,
      category: q.category || undefined,
      domain: q.domain || undefined,
      after: q.after || undefined,
      before: q.before || undefined,
      sort: q.sort === 'asc' ? 'asc' : 'desc',
      limit: q.limit ? Math.min(200, Math.max(1, parseInt(q.limit, 10))) : 50,
      offset: q.offset ? Math.max(0, parseInt(q.offset, 10)) : 0,
    });
    const enriched = items.map((b) => {
      const entries = mediaIndex.get(b.tweetId) ?? [];
      const localMediaUrls = entries
        .filter((e) => !e.isProfileImage)
        .map((e) => `/media/${e.filename}`);
      return { ...b, localMediaUrls };
    });
    json(res, enriched);
    return;
  }

  json(res, { error: 'not found' }, 404);
}

// ── Server factory (exported for testing) ────────────────────────────────────

export async function createWebServer(port: number): Promise<{ port: number; close: () => Promise<void> }> {
  const mediaIndex = await buildMediaIndex();
  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res, mediaIndex);
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
    new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  return { port: actualPort, close };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function startWeb(port: number, openBrowser: boolean): Promise<void> {
  const { port: actualPort, close } = await createWebServer(port);

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
