/**
 * Article extraction for link-heavy bookmarks.
 *
 * Fetches linked page content and extracts readable text so it becomes
 * searchable via FTS5. Used by syncGaps as "Gap 3".
 *
 * Strategies:
 *   1. HTML fetch → extract <article>, <main>, or body text
 *   2. JSON-LD structured data
 *   3. OpenGraph / meta description fallback
 */

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB
const FETCH_TIMEOUT_MS = 15_000;

// ── Types ──────────────────────────────────────────────────────────────────

export interface ArticleContent {
  title: string;
  text: string;
  siteName?: string;
}

// ── HTML helpers ───────────────────────────────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// ── Extraction ─────────────────────────────────────────────────────────────

export function extractReadableText(html: string): ArticleContent | null {
  const ogTitle = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]*)"[^>]*>/i);
  const htmlTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = stripHtml(ogTitle?.[1] ?? htmlTitle?.[1] ?? '');

  const siteMatch = html.match(/<meta\s+(?:property|name)="og:site_name"\s+content="([^"]*)"[^>]*>/i);
  const siteName = siteMatch ? decodeEntities(siteMatch[1]) : undefined;

  // Remove non-content blocks
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Try content selectors in specificity order
  let text = '';
  const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

  if (articleMatch) text = stripHtml(articleMatch[1]);
  else if (mainMatch) text = stripHtml(mainMatch[1]);
  else text = stripHtml(cleaned);

  // Fallback to meta description
  if (text.length < 100) {
    const ogDesc = html.match(/<meta\s+(?:property|name)="(?:og:)?description"\s+content="([^"]*)"[^>]*>/i);
    if (ogDesc && ogDesc[1].length > text.length) {
      text = stripHtml(ogDesc[1]);
    }
  }

  // Fallback to JSON-LD
  if (text.length < 100) {
    const jsonLd = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (jsonLd) {
      try {
        const data = JSON.parse(jsonLd[1]);
        const body = data.articleBody ?? data.text ?? data.description ?? '';
        if (body.length > text.length) text = body;
      } catch { /* invalid JSON-LD */ }
    }
  }

  if (text.length < 50) return null;
  if (text.length > 15_000) text = text.slice(0, 15_000);

  return { title, text, siteName };
}

// ── URL filtering ──────────────────────────────────────────────────────────

function isTwitterUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'twitter.com' || host === 'x.com' || host.endsWith('.twitter.com') || host.endsWith('.x.com');
  } catch { return false; }
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // Block common private/reserved hostnames
    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
    if (host.startsWith('10.') || host.startsWith('192.168.')) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (host === '169.254.169.254') return false; // cloud metadata
    return true;
  } catch { return false; }
}

// ── Fetch with size limit ──────────────────────────────────────────────────

async function fetchWithLimit(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null;

    // Read body with size limit
    const reader = res.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        reader.cancel();
        break;
      }
      chunks.push(value);
    }

    const decoder = new TextDecoder();
    return chunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function fetchArticle(url: string): Promise<ArticleContent | null> {
  if (isTwitterUrl(url)) return null;
  if (!isSafeUrl(url)) return null;
  const html = await fetchWithLimit(url);
  if (!html) return null;
  return extractReadableText(html);
}

/**
 * Resolve t.co shortlinks — returns the expanded URL without fetching the full page.
 * Returns null if resolution fails.
 */
export async function resolveTcoLink(url: string): Promise<string | null> {
  if (!url.includes('t.co/')) return url;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(5_000),
    });
    const resolved = res.url;
    // Skip if it resolved to another t.co or to a twitter media URL
    if (resolved.includes('t.co/') || isTwitterUrl(resolved)) return null;
    return resolved;
  } catch { return null; }
}
