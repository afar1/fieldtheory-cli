export function canonicalHttpLocator(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return null;
  }
}

export function xArticleIdentity(value: string): string | null {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const match = parsed.pathname.match(/^\/i\/article\/([^/]+)\/?$/);
    if ((host !== 'x.com' && host !== 'twitter.com') || !match) return null;
    return match[1];
  } catch {
    return null;
  }
}

export function isXArticleLocator(value: string): boolean {
  return xArticleIdentity(value) !== null;
}

export function sameSourceLocator(left: string, right: string): boolean {
  const leftArticle = xArticleIdentity(left);
  const rightArticle = xArticleIdentity(right);
  if (leftArticle || rightArticle) return leftArticle !== null && leftArticle === rightArticle;
  const leftCanonical = canonicalHttpLocator(left);
  return leftCanonical !== null && leftCanonical === canonicalHttpLocator(right);
}

function preferredLocator(values: string[]): string | undefined {
  return values.find((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'x.com';
    } catch {
      return false;
    }
  }) ?? values[0];
}

export function bindArticleLocator(
  sourceLinks: string[],
  requestedLocator?: string | null,
): string | undefined {
  const candidates = sourceLinks.filter((value) => canonicalHttpLocator(value) !== null);
  if (requestedLocator) {
    const matches = candidates.filter((value) => sameSourceLocator(value, requestedLocator));
    return preferredLocator(matches);
  }

  const articleLinks = candidates.filter(isXArticleLocator);
  const identities = new Set(articleLinks.map(xArticleIdentity).filter((value): value is string => value !== null));
  if (identities.size !== 1) return undefined;
  return preferredLocator(articleLinks);
}

export function bindArticleEnrichment(
  rootTweetId: string,
  sourceLinks: string[],
  enrichment: {
    articleText?: string | null;
    sourceTweetId?: string | null;
    sourceLocator?: string | null;
  },
): string | undefined {
  if (!enrichment.articleText?.trim() || enrichment.sourceTweetId !== rootTweetId) return undefined;
  return bindArticleLocator(sourceLinks, enrichment.sourceLocator);
}
