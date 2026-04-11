import { openDb } from './db.js';
import { parseTimestampMs, toIsoDate, toIsoMonth, toMonthDayLabel, toUtcHour, toWeekdayShort, toYearLabel } from './date-utils.js';
import { twitterBookmarksIndexPath } from './paths.js';

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;

const rgb = (r: number, g: number, b: number) => `${ESC}38;2;${r};${g};${b}m`;

// Palette — muted, tasteful
const C = {
  title:   rgb(199, 146, 234),  // soft lavender
  accent:  rgb(130, 170, 255),  // periwinkle
  warm:    rgb(255, 180, 120),  // peach
  green:   rgb(120, 220, 170),  // mint
  dim:     rgb(100, 100, 120),  // muted gray
  text:    rgb(200, 200, 210),  // light gray
  hot:     rgb(255, 120, 140),  // coral
  gold:    rgb(240, 200, 100),  // amber
  cyan:    rgb(100, 220, 230),  // teal
  violet:  rgb(170, 130, 255),  // violet
};

// ── Block characters for bar charts ──────────────────────────────────────────

const BLOCKS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

function bar(value: number, max: number, width: number, color: string): string {
  const ratio = max > 0 ? value / max : 0;
  const filled = ratio * width;
  const full = Math.floor(filled);
  const partial = Math.round((filled - full) * 8);
  return (
    color +
    '█'.repeat(full) +
    (partial > 0 ? BLOCKS[partial] : '') +
    RESET +
    ' '.repeat(Math.max(0, width - full - (partial > 0 ? 1 : 0)))
  );
}

// ── Sparkline ────────────────────────────────────────────────────────────────

const SPARKS = '▁▂▃▄▅▆▇█';

function sparkline(data: number[], color: string): string {
  const max = Math.max(...data, 1);
  return (
    color +
    data.map((v) => SPARKS[Math.round((v / max) * 7)] || SPARKS[0]).join('') +
    RESET
  );
}

// ── Braille dot chart (2-wide × 4-tall per character) ────────────────────────

const BRAILLE_BASE = 0x2800;
const BRAILLE_DOTS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

function brailleChart(data: number[], width: number, color: string): string {
  const max = Math.max(...data, 1);
  const heights = data.map((v) => Math.round((v / max) * 7));
  const chars: number[] = new Array(Math.ceil(data.length / 2)).fill(BRAILLE_BASE);

  for (let i = 0; i < heights.length; i++) {
    const col = i % 2; // 0 = left, 1 = right
    const charIdx = Math.floor(i / 2);
    const h = heights[i];
    for (let row = 0; row < 4; row++) {
      if (7 - row * 2 <= h) {
        chars[charIdx] |= BRAILLE_DOTS[row][col];
      }
    }
  }

  return color + chars.map((c) => String.fromCharCode(c)).join('') + RESET;
}

// ── Box drawing ──────────────────────────────────────────────────────────────

function boxTop(width: number): string {
  return C.dim + '╭' + '─'.repeat(width - 2) + '╮' + RESET;
}
function boxBottom(width: number): string {
  return C.dim + '╰' + '─'.repeat(width - 2) + '╯' + RESET;
}
function boxRow(content: string, width: number): string {
  const stripped = content.replace(/\x1b\[[^m]*m/g, '');
  const pad = Math.max(0, width - 4 - stripped.length);
  return C.dim + '│ ' + RESET + content + ' '.repeat(pad) + C.dim + ' │' + RESET;
}
function boxDivider(width: number): string {
  return C.dim + '├' + '─'.repeat(width - 2) + '┤' + RESET;
}
// ── Gradient helpers ─────────────────────────────────────────────────────────

function lerpColor(
  from: [number, number, number],
  to: [number, number, number],
  t: number
): string {
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  return rgb(r, g, b);
}

// ── Data queries ─────────────────────────────────────────────────────────────

interface GemBookmark {
  author: string;
  text: string;
  tweetId: string;
  postedAt: string;
}

interface VizData {
  total: number;
  uniqueAuthors: number;
  dateRange: { earliest: string; latest: string };
  topAuthors: { handle: string; count: number }[];
  monthlyActivity: { month: string; count: number }[];
  dayOfWeekActivity: { day: string; count: number }[];
  hourActivity: { hour: number; count: number }[];
  topDomains: { domain: string; count: number }[];
  mediaStats: { withMedia: number; withLinks: number; total: number };
  recentAuthors: { handle: string; count: number }[];
  languages: { lang: string; count: number }[];
  avgTextLength: number;
  timeCapsules: GemBookmark[];
  hiddenGems: GemBookmark[];
  risingVoices: { handle: string; count: number }[];
  categories: { name: string; count: number }[];
  domains: { name: string; count: number }[];
}

interface TimelineAggregateRow {
  authorHandle?: string;
  postedAt?: string | null;
  syncedAt?: string | null;
}

function sortCountEntries<T extends string | number>(entries: Iterable<[T, number]>): Array<{ key: T; count: number }> {
  return [...entries]
    .sort((a, b) => a[0] === b[0] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1)
    .map(([key, count]) => ({ key, count }));
}

function aggregateTimelineData(rows: TimelineAggregateRow[]): {
  dateRange: { earliest: string; latest: string };
  monthlyActivity: { month: string; count: number }[];
  dayOfWeekActivity: { day: string; count: number }[];
  hourActivity: { hour: number; count: number }[];
  recentAuthors: { handle: string; count: number }[];
  risingVoices: { handle: string; count: number }[];
} {
  const monthCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();
  const authorPostedMonths = new Map<string, Set<string>>();
  const authorPostedCounts = new Map<string, number>();
  const recentSessionCounts = new Map<string, number>();

  let earliestMs = Number.POSITIVE_INFINITY;
  let latestMs = Number.NEGATIVE_INFINITY;
  let earliest = '?';
  let latest = '?';
  let latestPostedMonth: string | null = null;
  let latestSyncMs = Number.NEGATIVE_INFINITY;
  let latestSyncAt: string | null = null;

  for (const row of rows) {
    const postedAt = row.postedAt ?? null;
    const syncedAt = row.syncedAt ?? null;
    const handle = row.authorHandle ?? undefined;

    const postedMs = parseTimestampMs(postedAt);
    if (postedMs != null) {
      const isoDate = toIsoDate(postedAt);
      const isoMonth = toIsoMonth(postedAt);
      const weekday = toWeekdayShort(postedAt);
      const hour = toUtcHour(postedAt);

      if (isoDate) {
        if (postedMs < earliestMs) {
          earliestMs = postedMs;
          earliest = isoDate;
        }
        if (postedMs > latestMs) {
          latestMs = postedMs;
          latest = isoDate;
        }
      }

      if (isoMonth) {
        monthCounts.set(isoMonth, (monthCounts.get(isoMonth) ?? 0) + 1);
        if (latestPostedMonth == null || isoMonth > latestPostedMonth) {
          latestPostedMonth = isoMonth;
        }
        if (handle) {
          authorPostedCounts.set(handle, (authorPostedCounts.get(handle) ?? 0) + 1);
          const months = authorPostedMonths.get(handle) ?? new Set<string>();
          months.add(isoMonth);
          authorPostedMonths.set(handle, months);
        }
      }

      if (weekday) dayCounts.set(weekday, (dayCounts.get(weekday) ?? 0) + 1);
      if (hour != null) hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }

    const syncedMs = parseTimestampMs(syncedAt);
    if (syncedMs != null && syncedMs >= latestSyncMs) {
      if (syncedMs > latestSyncMs) recentSessionCounts.clear();
      latestSyncMs = syncedMs;
      latestSyncAt = syncedAt;
      if (handle) recentSessionCounts.set(handle, (recentSessionCounts.get(handle) ?? 0) + 1);
    }
  }

  const monthNameMap: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
    '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
  };

  const monthlyActivity = sortCountEntries(monthCounts.entries()).map(({ key, count }) => {
    const [year, monthNum] = String(key).split('-');
    return { month: `${monthNameMap[monthNum] ?? monthNum} ${year}`, count };
  });

  const dayOfWeekActivity = sortCountEntries(dayCounts.entries()).map(({ key, count }) => ({
    day: String(key),
    count,
  }));

  const hourActivity = sortCountEntries(hourCounts.entries()).map(({ key, count }) => ({
    hour: Number(key),
    count,
  }));

  const recentAuthors = [...recentSessionCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([handle, count]) => ({ handle, count }));

  const risingVoices = latestPostedMonth == null
    ? []
    : [...authorPostedCounts.entries()]
        .filter(([handle, count]) => count >= 3 && authorPostedMonths.get(handle)?.size === 1 && authorPostedMonths.get(handle)?.has(latestPostedMonth))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8)
        .map(([handle, count]) => ({ handle, count }));

  return {
    dateRange: { earliest, latest },
    monthlyActivity,
    dayOfWeekActivity,
    hourActivity,
    recentAuthors: latestSyncAt ? recentAuthors : [],
    risingVoices,
  };
}

async function queryVizData(): Promise<VizData> {
  const db = await openDb(twitterBookmarksIndexPath());

  try {
    const total = db.exec('SELECT COUNT(*) FROM bookmarks')[0]?.values[0]?.[0] as number;
    const authors = db.exec('SELECT COUNT(DISTINCT author_handle) FROM bookmarks')[0]?.values[0]?.[0] as number;
    const timelineRows = db.exec(
      `SELECT author_handle, posted_at, synced_at
       FROM bookmarks
       WHERE posted_at IS NOT NULL OR synced_at IS NOT NULL OR author_handle IS NOT NULL`
    );
    const timelineData = aggregateTimelineData(
      (timelineRows[0]?.values ?? []).map((row) => ({
        authorHandle: (row[0] as string) ?? undefined,
        postedAt: (row[1] as string) ?? null,
        syncedAt: (row[2] as string) ?? null,
      }))
    );

    const topAuthorsRows = db.exec(
      `SELECT author_handle, COUNT(*) as c FROM bookmarks
       WHERE author_handle IS NOT NULL
       GROUP BY author_handle ORDER BY c DESC LIMIT 20`
    );

    // Domains from links_json
    const domainRows = db.exec(
      `SELECT links_json FROM bookmarks WHERE links_json IS NOT NULL AND links_json != '[]'`
    );
    const domainCounts = new Map<string, number>();
    for (const row of domainRows[0]?.values ?? []) {
      try {
        const links = JSON.parse(row[0] as string) as string[];
        for (const link of links) {
          const url = typeof link === 'string' ? link : (link as any).expanded_url ?? (link as any).url ?? '';
          try {
            const domain = new URL(url).hostname.replace(/^www\./, '');
            if (domain && domain !== 'x.com' && domain !== 't.co') {
              domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
            }
          } catch {}
        }
      } catch {}
    }
    const topDomains = [...domainCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([domain, count]) => ({ domain, count }));

    const mediaStats = {
      withMedia: db.exec('SELECT COUNT(*) FROM bookmarks WHERE media_count > 0')[0]?.values[0]?.[0] as number,
      withLinks: db.exec('SELECT COUNT(*) FROM bookmarks WHERE link_count > 0')[0]?.values[0]?.[0] as number,
      total,
    };

    const langRows = db.exec(
      `SELECT language, COUNT(*) as c FROM bookmarks WHERE language IS NOT NULL
       GROUP BY language ORDER BY c DESC LIMIT 8`
    );

    const avgLen = db.exec('SELECT AVG(length(text)) FROM bookmarks')[0]?.values[0]?.[0] as number;

    // Time capsules: oldest posts, one per year to spread the range
    const capsuleRows = db.exec(
      `SELECT author_handle, text, tweet_id, posted_at, substr(posted_at, -4) as yr
       FROM bookmarks
       WHERE posted_at IS NOT NULL
       AND CAST(substr(posted_at, -4) AS INTEGER) < 2023
       GROUP BY substr(posted_at, -4)
       ORDER BY posted_at ASC
       LIMIT 8`
    );
    const timeCapsules: GemBookmark[] = (capsuleRows[0]?.values ?? []).map((r) => ({
      author: r[0] as string,
      text: r[1] as string,
      tweetId: r[2] as string,
      postedAt: r[3] as string,
    }));

    // Hidden gems: authors bookmarked exactly once, with long text (> 250 chars)
    const gemRows = db.exec(
      `SELECT b.author_handle, b.text, b.tweet_id, b.posted_at
       FROM bookmarks b
       JOIN (
         SELECT author_handle FROM bookmarks
         WHERE author_handle IS NOT NULL
         GROUP BY author_handle HAVING COUNT(*) = 1
       ) singles ON b.author_handle = singles.author_handle
       WHERE length(b.text) > 250
       ORDER BY length(b.text) DESC
       LIMIT 8`
    );
    const hiddenGems: GemBookmark[] = (gemRows[0]?.values ?? []).map((r) => ({
      author: r[0] as string,
      text: r[1] as string,
      tweetId: r[2] as string,
      postedAt: r[3] as string,
    }));

    // Categories
    let categories: { name: string; count: number }[] = [];
    try {
      const catRows = db.exec(
        `SELECT primary_category, COUNT(*) as c FROM bookmarks
         WHERE primary_category IS NOT NULL AND primary_category != 'unclassified'
         GROUP BY primary_category ORDER BY c DESC LIMIT 15`
      );
      categories = (catRows[0]?.values ?? []).map((r) => ({
        name: r[0] as string,
        count: r[1] as number,
      }));
    } catch { /* column may not exist */ }

    // Domains
    let domains: { name: string; count: number }[] = [];
    try {
      const domRows = db.exec(
        `SELECT primary_domain, COUNT(*) as c FROM bookmarks
         WHERE primary_domain IS NOT NULL AND primary_domain != ''
         GROUP BY primary_domain ORDER BY c DESC LIMIT 15`
      );
      domains = (domRows[0]?.values ?? []).map((r) => ({
        name: r[0] as string,
        count: r[1] as number,
      }));
    } catch { /* column may not exist in v2 */ }

    return {
      total,
      uniqueAuthors: authors,
      dateRange: timelineData.dateRange,
      topAuthors: (topAuthorsRows[0]?.values ?? []).map((r) => ({
        handle: r[0] as string,
        count: r[1] as number,
      })),
      monthlyActivity: timelineData.monthlyActivity,
      dayOfWeekActivity: timelineData.dayOfWeekActivity,
      hourActivity: timelineData.hourActivity,
      topDomains,
      mediaStats,
      recentAuthors: timelineData.recentAuthors,
      languages: (langRows[0]?.values ?? []).map((r) => ({
        lang: r[0] as string,
        count: r[1] as number,
      })),
      avgTextLength: avgLen,
      timeCapsules,
      hiddenGems,
      risingVoices: timelineData.risingVoices,
      categories,
      domains,
    };
  } finally {
    db.close();
  }
}

// ── Render sections ──────────────────────────────────────────────────────────

const W = 72; // box width

function renderHeader(data: VizData): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(boxTop(W));
  lines.push(boxRow(
    `${C.title}${BOLD}  ✦  FIELD THEORY  ·  BOOKMARK OBSERVATORY  ✦  ${RESET}`, W
  ));
  lines.push(boxDivider(W));
  lines.push(boxRow(
    `${C.text}${data.total.toLocaleString()} bookmarks${C.dim}  ·  ${C.text}${data.uniqueAuthors.toLocaleString()} voices${C.dim}  ·  ${C.text}${data.languages.length} languages`, W
  ));
  lines.push(boxRow(
    `${C.dim}${data.dateRange.earliest} → ${data.dateRange.latest}`, W
  ));
  lines.push(boxBottom(W));
  return lines;
}

function renderTopAuthors(data: VizData): string[] {
  const lines: string[] = [];
  const maxCount = data.topAuthors[0]?.count ?? 1;
  const barWidth = 28;

  lines.push('');
  lines.push(`  ${C.accent}${BOLD}WHO YOU LISTEN TO${RESET}`);
  lines.push(`  ${C.dim}top 20 most-bookmarked voices${RESET}`);
  lines.push('');

  for (const author of data.topAuthors) {
    const t = author.count / maxCount;
    const color = lerpColor([100, 160, 255], [255, 120, 180], t);
    const handle = `@${author.handle}`.padEnd(20);
    const count = String(author.count).padStart(4);
    lines.push(
      `  ${C.text}${handle}${RESET} ${bar(author.count, maxCount, barWidth, color)} ${C.dim}${count}${RESET}`
    );
  }
  return lines;
}

function renderActivity(data: VizData): string[] {
  const lines: string[] = [];
  if (data.monthlyActivity.length === 0) return [];
  const counts = data.monthlyActivity.map((m) => m.count);
  const maxCount = Math.max(...counts, 1);

  lines.push('');
  lines.push(`  ${C.warm}${BOLD}PUBLICATION RHYTHM${RESET}`);
  lines.push(`  ${C.dim}monthly cadence of posts in your library${RESET}`);
  lines.push('');

  // Sparkline overview
  lines.push(`  ${sparkline(counts, C.warm)}`);
  lines.push('');

  // Monthly bars
  for (const m of data.monthlyActivity) {
    const label = m.month.padEnd(8);
    const t = m.count / maxCount;
    const color = lerpColor([255, 160, 100], [255, 100, 120], t);
    const count = String(m.count).padStart(5);
    lines.push(
      `  ${C.dim}${label}${RESET} ${bar(m.count, maxCount, 36, color)} ${C.dim}${count}${RESET}`
    );
  }
  return lines;
}

function renderDayOfWeek(data: VizData): string[] {
  const lines: string[] = [];
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const ordered = dayOrder
    .map((d) => data.dayOfWeekActivity.find((r) => r.day === d))
    .filter(Boolean) as { day: string; count: number }[];

  if (ordered.length === 0) return [];

  const maxCount = Math.max(...ordered.map((d) => d.count), 1);
  const counts = ordered.map((d) => d.count);

  lines.push('');
  lines.push(`  ${C.green}${BOLD}POST WEEKDAYS${RESET}`);
  lines.push(`  ${C.dim}which weekdays your saved posts were published${RESET}`);
  lines.push('');
  lines.push(`  ${brailleChart(counts, 14, C.green)}`);
  lines.push('');

  for (const d of ordered) {
    const label = d.day.padEnd(5);
    const t = d.count / maxCount;
    const color = lerpColor([80, 200, 160], [120, 255, 200], t);
    const count = String(d.count).padStart(5);
    lines.push(
      `  ${C.text}${label}${RESET} ${bar(d.count, maxCount, 36, color)} ${C.dim}${count}${RESET}`
    );
  }
  return lines;
}

function renderHourOfDay(data: VizData): string[] {
  const lines: string[] = [];

  if (data.hourActivity.length === 0) return [];

  // Fill in all 24 hours
  const hourMap = new Map(data.hourActivity.map((h) => [h.hour, h.count]));
  const allHours = Array.from({ length: 24 }, (_, i) => hourMap.get(i) ?? 0);
  const maxCount = Math.max(...allHours, 1);

  lines.push('');
  lines.push(`  ${C.cyan}${BOLD}POSTING HOURS${RESET}`);
  lines.push(`  ${C.dim}UTC posting hours for the tweets you saved${RESET}`);
  lines.push('');

  // Vertical bar chart using blocks
  const chartHeight = 8;
  for (let row = chartHeight; row >= 1; row--) {
    let line = '  ';
    for (let h = 0; h < 24; h++) {
      const t = allHours[h] / maxCount;
      const barH = t * chartHeight;
      if (barH >= row) {
        const color = lerpColor([60, 180, 200], [100, 240, 255], t);
        line += color + '██' + RESET;
      } else if (barH >= row - 1 && barH > 0) {
        const frac = barH - Math.floor(barH);
        const partials = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇'];
        const idx = Math.round(frac * 7);
        const color = lerpColor([60, 180, 200], [100, 240, 255], t);
        line += color + partials[idx] + partials[idx] + RESET;
      } else {
        line += '  ';
      }
    }
    lines.push(line);
  }

  // Hour labels
  let labelLine = '  ';
  for (let h = 0; h < 24; h++) {
    if (h % 3 === 0) {
      labelLine += C.dim + String(h).padStart(2, '0') + RESET;
      if (h + 1 < 24) labelLine += C.dim + RESET;
    } else {
      labelLine += '  ';
    }
  }
  lines.push(labelLine);

  // Peak hours annotation
  const peak = data.hourActivity.reduce((a, b) => (a.count > b.count ? a : b));
  const quiet = data.hourActivity.reduce((a, b) => (a.count < b.count ? a : b));
  lines.push('');
  lines.push(`  ${C.cyan}peak${RESET} ${C.text}${peak.hour}:00${RESET}${C.dim}  ·  ${C.cyan}quiet${RESET} ${C.text}${quiet.hour}:00${RESET}`);

  return lines;
}

function renderDomains(data: VizData): string[] {
  const lines: string[] = [];
  if (data.topDomains.length === 0) return [];

  const maxCount = data.topDomains[0]?.count ?? 1;

  lines.push('');
  lines.push(`  ${C.violet}${BOLD}WHERE LINKS LEAD${RESET}`);
  lines.push(`  ${C.dim}most-bookmarked external domains${RESET}`);
  lines.push('');

  for (const d of data.topDomains) {
    const label = d.domain.padEnd(24);
    const t = d.count / maxCount;
    const color = lerpColor([140, 100, 230], [200, 150, 255], t);
    const count = String(d.count).padStart(4);
    lines.push(
      `  ${C.text}${label}${RESET} ${bar(d.count, maxCount, 22, color)} ${C.dim}${count}${RESET}`
    );
  }
  return lines;
}

function renderMediaBreakdown(data: VizData): string[] {
  const lines: string[] = [];
  const { withMedia, withLinks, total } = data.mediaStats;

  lines.push('');
  lines.push(`  ${C.gold}${BOLD}COMPOSITION${RESET}`);
  lines.push(`  ${C.dim}what your bookmarks contain${RESET}`);
  lines.push('');

  const barWidth = 50;

  const mediaPct = (withMedia / total) * 100;
  const linkPct = (withLinks / total) * 100;
  const textPct = Math.max(0, 100 - mediaPct - linkPct);

  const mediaW = Math.round((withMedia / total) * barWidth);
  const linkW = Math.round((withLinks / total) * barWidth);
  const textW = barWidth - mediaW - linkW;

  // Stacked bar
  const stackedBar =
    rgb(120, 220, 170) + '█'.repeat(mediaW) +
    rgb(130, 170, 255) + '█'.repeat(linkW) +
    rgb(100, 100, 120) + '█'.repeat(Math.max(0, textW)) +
    RESET;

  lines.push(`  ${stackedBar}`);
  lines.push('');
  lines.push(`  ${rgb(120, 220, 170)}██${RESET} ${C.text}media  ${withMedia.toLocaleString()} (${mediaPct.toFixed(0)}%)${RESET}    ${rgb(130, 170, 255)}██${RESET} ${C.text}links  ${withLinks.toLocaleString()} (${linkPct.toFixed(0)}%)${RESET}    ${rgb(100, 100, 120)}██${RESET} ${C.text}text  ${textPct.toFixed(0)}%${RESET}`);

  return lines;
}

function renderCategories(data: VizData): string[] {
  const lines: string[] = [];
  if (data.categories.length === 0) return [];

  const maxCount = data.categories[0].count;

  lines.push('');
  lines.push(`  ${C.title}${BOLD}CATEGORIES${RESET}`);
  lines.push(`  ${C.dim}what you bookmark${RESET}`);
  lines.push('');

  for (let i = 0; i < data.categories.length; i++) {
    const cat = data.categories[i];
    const barLen = Math.max(1, Math.round((cat.count / maxCount) * 30));
    const fade = Math.max(0.3, 1 - (i / data.categories.length) * 0.7);
    const r = Math.round(255 * fade), g = Math.round(180 * fade), b = Math.round(120 * fade);
    const bar = rgb(r, g, b) + '\u2588'.repeat(barLen) + RESET;
    lines.push(`  ${C.warm}${cat.name.padEnd(18)}${RESET} ${bar} ${C.dim}${cat.count}${RESET}`);
  }
  return lines;
}

function renderDomainBreakdown(data: VizData): string[] {
  const lines: string[] = [];
  if (data.domains.length === 0) return [];

  const maxCount = data.domains[0].count;

  lines.push('');
  lines.push(`  ${C.accent}${BOLD}DOMAINS${RESET}`);
  lines.push(`  ${C.dim}subject areas${RESET}`);
  lines.push('');

  for (let i = 0; i < data.domains.length; i++) {
    const dom = data.domains[i];
    const barLen = Math.max(1, Math.round((dom.count / maxCount) * 30));
    const fade = Math.max(0.3, 1 - (i / data.domains.length) * 0.7);
    const r = Math.round(100 * fade), g = Math.round(220 * fade), b = Math.round(230 * fade);
    const bar = rgb(r, g, b) + '\u2588'.repeat(barLen) + RESET;
    lines.push(`  ${C.cyan}${dom.name.padEnd(18)}${RESET} ${bar} ${C.dim}${dom.count}${RESET}`);
  }
  return lines;
}

function renderFingerprint(data: VizData): string[] {
  const lines: string[] = [];

  lines.push('');
  lines.push(boxTop(W));
  lines.push(boxRow(`${C.title}${BOLD}FINGERPRINT${RESET}`, W));
  lines.push(boxDivider(W));

  const mediaPct = ((data.mediaStats.withMedia / data.total) * 100).toFixed(0);
  const longTailPct = data.uniqueAuthors > 0
    ? (((data.uniqueAuthors - data.topAuthors.length) / data.uniqueAuthors) * 100).toFixed(0)
    : '0';

  lines.push(boxRow(`${C.dim}avg bookmark length${RESET}    ${C.text}${Math.round(data.avgTextLength)} chars${RESET}`, W));
  lines.push(boxRow(`${C.dim}media-bearing${RESET}          ${C.text}${mediaPct}%${RESET}`, W));
  lines.push(boxRow(`${C.dim}long-tail authors${RESET}      ${C.text}${longTailPct}% bookmarked ≤ once${RESET}`, W));
  lines.push(boxRow(`${C.dim}top voice${RESET}              ${C.text}@${data.topAuthors[0]?.handle ?? '?'} (${data.topAuthors[0]?.count ?? 0})${RESET}`, W));

  if (data.recentAuthors.length > 0) {
    lines.push(boxDivider(W));
    lines.push(boxRow(`${C.accent}${BOLD}LATEST SESSION${RESET}`, W));
    for (const a of data.recentAuthors.slice(0, 5)) {
      lines.push(boxRow(`  ${C.text}@${a.handle}${RESET} ${C.dim}×${a.count}${RESET}`, W));
    }
  }

  lines.push(boxBottom(W));
  return lines;
}

function truncateText(text: string, max: number): string {
  const clean = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + '…';
}

function renderTimeCapsules(data: VizData): string[] {
  const lines: string[] = [];
  if (data.timeCapsules.length === 0) return [];

  lines.push('');
  lines.push(`  ${C.gold}${BOLD}TIME CAPSULES${RESET}`);
  lines.push(`  ${C.dim}your oldest bookmarked posts — still saved after all these years${RESET}`);
  lines.push('');

  for (const b of data.timeCapsules) {
    const year = toYearLabel(b.postedAt);
    const monthDay = toMonthDayLabel(b.postedAt).padStart(6, ' ');
    const color = lerpColor([240, 200, 100], [200, 160, 80], 0.5);
    const url = `x.com/${b.author}/status/${b.tweetId}`;
    lines.push(`  ${color}${year}${RESET}${C.dim}${monthDay}${RESET}  ${C.text}@${b.author}${RESET}`);
    lines.push(`  ${C.dim}${truncateText(b.text, 62)}${RESET}`);
    lines.push(`  ${DIM}${url}${RESET}`);
    lines.push('');
  }
  return lines;
}

function renderHiddenGems(data: VizData): string[] {
  const lines: string[] = [];
  if (data.hiddenGems.length === 0) return [];

  lines.push('');
  lines.push(`  ${C.cyan}${BOLD}HIDDEN GEMS${RESET}`);
  lines.push(`  ${C.dim}one-time voices you saved — long, substantive, easy to forget${RESET}`);
  lines.push('');

  for (const b of data.hiddenGems) {
    const url = `x.com/${b.author}/status/${b.tweetId}`;
    lines.push(`  ${C.cyan}◆${RESET} ${C.text}@${b.author}${RESET}`);
    lines.push(`  ${C.dim}${truncateText(b.text, 62)}${RESET}`);
    lines.push(`  ${DIM}${url}${RESET}`);
    lines.push('');
  }
  return lines;
}

function renderRisingVoices(data: VizData): string[] {
  const lines: string[] = [];
  if (data.risingVoices.length === 0) return [];

  const maxCount = data.risingVoices[0]?.count ?? 1;

  lines.push('');
  lines.push(`  ${C.green}${BOLD}RISING${RESET}`);
  lines.push(`  ${C.dim}voices concentrated in the latest publication month in your library${RESET}`);
  lines.push('');

  for (const v of data.risingVoices) {
    const handle = `@${v.handle}`.padEnd(22);
    const dots = C.green + '●'.repeat(v.count) + C.dim + '○'.repeat(Math.max(0, maxCount - v.count)) + RESET;
    lines.push(`  ${C.text}${handle}${RESET} ${dots}  ${C.dim}${v.count}${RESET}`);
  }
  return lines;
}

// ── Main render ──────────────────────────────────────────────────────────────

export async function renderViz(): Promise<string> {
  const data = await queryVizData();

  const sections = [
    ...renderHiddenGems(data),
    ...renderTimeCapsules(data),
    ...renderTopAuthors(data),
    ...renderCategories(data),
    ...renderDomainBreakdown(data),
    ...renderActivity(data),
    ...renderDayOfWeek(data),
    ...renderHourOfDay(data),
    ...renderDomains(data),
    ...renderMediaBreakdown(data),
    ...renderRisingVoices(data),
    ...renderFingerprint(data),
    ...renderHeader(data),
    '', // trailing newline
  ];

  return sections.join('\n');
}
