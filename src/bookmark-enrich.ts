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

/**
 * Block any URL that would resolve to a loopback, private, link-local,
 * or unique-local address in either IPv4 or IPv6, including numeric
 * encodings and IPv4-mapped-in-IPv6 forms. Also rejects non-http(s) schemes.
 *
 * This is called on the initial URL AND every redirect hop.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    // URL.hostname for IPv6 normalizes brackets differently across Node versions;
    // strip them so downstream string checks are uniform.
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (host === 'localhost') return false;

    // ─── Numeric IPv4 encodings (decimal, hex, octal) ───────────────
    // new URL('http://2130706433/').hostname === '2130706433'
    // new URL('http://0x7f000001/').hostname === '0x7f000001'
    if (/^\d+$/.test(host)) return false;           // decimal: 2130706433
    if (/^0x[0-9a-f]+$/.test(host)) return false;   // hex: 0x7f000001
    if (/^0\d/.test(host) && /^\d+$/.test(host.slice(1))) return false; // octal leading zero

    // ─── Standard IPv4 dotted quad checks ───────────────────────────
    // Match as dotted quad first so startsWith tests don't accidentally match domains
    // starting with "10" or "127" that happen to contain a dot.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      if (host === '0.0.0.0') return false;
      if (/^127\./.test(host)) return false;                    // 127.0.0.0/8 loopback
      if (/^10\./.test(host)) return false;                     // 10.0.0.0/8
      if (/^192\.168\./.test(host)) return false;               // 192.168.0.0/16
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false; // 172.16.0.0/12
      if (/^169\.254\./.test(host)) return false;               // 169.254.0.0/16 link-local + metadata
      if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return false; // 100.64/10 CGNAT
    }

    // ─── IPv6 checks ────────────────────────────────────────────────
    if (host === '::' || host === '::1') return false;
    if (host.startsWith('fe80:')) return false;  // fe80::/10 link-local
    if (host.startsWith('fc') && host.includes(':')) return false; // fc00::/8 unique-local
    if (host.startsWith('fd') && host.includes(':')) return false; // fd00::/8 unique-local
    if (host.startsWith('::ffff:')) return false; // IPv4-mapped IPv6: ::ffff:127.0.0.1 etc.
    if (host.startsWith('::') && /\./.test(host)) return false; // IPv4-compat IPv6

    return true;
  } catch { return false; }
}

// ── Manual redirect walker ─────────────────────────────────────────────────

const MAX_REDIRECT_HOPS = 5;

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

/**
 * Fetch a URL, walking redirects manually and re-validating every hop
 * against isSafeUrl. A safe-looking URL that redirects to 127.0.0.1 or
 * AWS metadata is blocked on the next hop, not allowed through.
 *
 * Returns null if any hop fails validation, the fetch errors, or the
 * redirect limit is exceeded.
 */
async function fetchFollowingRedirects(
  url: string,
  options: { signal?: AbortSignal; method?: 'GET' | 'HEAD' } = {},
): Promise<{ response: Response; finalUrl: string } | null> {
  const method = options.method ?? 'GET';
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (!isSafeUrl(current)) return null;

    let res: Response;
    try {
      res = await fetch(current, {
        method,
        headers: BROWSER_HEADERS,
        redirect: 'manual',
        signal: options.signal,
      });
    } catch {
      return null;
    }

    // 304 Not Modified is in the 3xx range but isn't a redirect.
    const isRedirect = res.status >= 300 && res.status < 400 && res.status !== 304;
    if (!isRedirect) {
      return { response: res, finalUrl: current };
    }

    const location = res.headers.get('location');
    if (!location) {
      return { response: res, finalUrl: current };
    }

    try { await res.body?.cancel(); } catch { /* ignore */ }

    try {
      // Relative redirects resolve against the current URL.
      current = new URL(location, current).toString();
    } catch {
      return null;
    }
  }

  return null;
}

// ── Fetch with size limit ──────────────────────────────────────────────────

async function fetchWithLimit(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const result = await fetchFollowingRedirects(url, { signal: controller.signal });
    if (!result) return null;
    const res = result.response;
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
 * Resolve t.co shortlinks — returns the expanded URL after walking
 * redirects, with isSafeUrl re-checked on every hop. Returns null if any
 * hop points at a blocked host or resolution fails.
 */
export async function resolveTcoLink(url: string): Promise<string | null> {
  if (!url.includes('t.co/')) return url;

  const result = await fetchFollowingRedirects(url, {
    method: 'HEAD',
    signal: AbortSignal.timeout(5_000),
  });
  if (!result) return null;

  try { await result.response.body?.cancel(); } catch { /* ignore */ }

  const resolved = result.finalUrl;
  if (resolved.includes('t.co/') || isTwitterUrl(resolved)) return null;
  return resolved;
}
