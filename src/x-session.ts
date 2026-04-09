import { loadChromeSessionConfig } from './config.js';
import { extractChromeXCookies } from './chrome-cookies.js';
import { extractFirefoxXCookies } from './firefox-cookies.js';
import { XClientTransaction, type XClientTransactionIdGenerator } from './x-client-transaction.js';

export const X_PUBLIC_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

export const DEFAULT_X_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export interface XSessionOptions {
  browser?: string;
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  firefoxProfileDir?: string;
  csrfToken?: string;
  cookieHeader?: string;
  userAgent?: string;
  transactionIdGenerator?: XClientTransactionIdGenerator;
}

export interface XSessionAuth {
  csrfToken: string;
  cookieHeader: string;
}

export interface XSessionContext extends XSessionAuth {
  userAgent: string;
  headers: Record<string, string>;
  transactionIdGenerator: XClientTransactionIdGenerator;
}

export function buildXHeaders(
  auth: XSessionAuth,
  options: { userAgent?: string; contentType?: string } = {},
): Record<string, string> {
  const userAgent = options.userAgent ?? DEFAULT_X_USER_AGENT;
  const headers: Record<string, string> = {
    authorization: `Bearer ${X_PUBLIC_BEARER}`,
    'x-csrf-token': auth.csrfToken,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    referer: 'https://x.com/',
    'user-agent': userAgent,
    cookie: auth.cookieHeader,
  };
  if (options.contentType) headers['content-type'] = options.contentType;
  return headers;
}

export function resolveXSessionAuth(options: XSessionOptions = {}): XSessionAuth {
  if (options.csrfToken) {
    return {
      csrfToken: options.csrfToken,
      cookieHeader: options.cookieHeader ?? `ct0=${options.csrfToken}`,
    };
  }

  const config = loadChromeSessionConfig({ browserId: options.browser });

  if (config.browser.cookieBackend === 'firefox') {
    const cookies = extractFirefoxXCookies(options.firefoxProfileDir);
    return {
      csrfToken: cookies.csrfToken,
      cookieHeader: cookies.cookieHeader,
    };
  }

  const chromeDir = options.chromeUserDataDir ?? config.chromeUserDataDir;
  const chromeProfile = options.chromeProfileDirectory ?? config.chromeProfileDirectory;
  const cookies = extractChromeXCookies(chromeDir, chromeProfile, config.browser);
  return {
    csrfToken: cookies.csrfToken,
    cookieHeader: cookies.cookieHeader,
  };
}

export function createXSessionContext(options: XSessionOptions = {}): XSessionContext {
  const auth = resolveXSessionAuth(options);
  const userAgent = options.userAgent ?? DEFAULT_X_USER_AGENT;
  const transactionIdGenerator = options.transactionIdGenerator ?? new XClientTransaction(userAgent);
  return {
    ...auth,
    userAgent,
    headers: buildXHeaders(auth, { userAgent, contentType: 'application/json' }),
    transactionIdGenerator,
  };
}
