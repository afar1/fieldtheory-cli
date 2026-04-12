import { loadChromeSessionConfig } from './config.js';
import { extractChromeXCookies } from './chrome-cookies.js';
import { extractFirefoxXCookies } from './firefox-cookies.js';

export const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export const X_PUBLIC_BEARER =
  'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

export interface XSessionOptions {
  browser?: string;
  chromeUserDataDir?: string;
  chromeProfileDirectory?: string;
  firefoxProfileDir?: string;
  csrfToken?: string;
  cookieHeader?: string;
}

export interface XSessionAuth {
  csrfToken: string;
  cookieHeader?: string;
}

export function xGraphqlOrigin(): string {
  return (process.env.FT_X_API_ORIGIN ?? 'https://x.com').replace(/\/+$/, '');
}

export function buildGraphqlUrl(queryId: string, operationName: string): string {
  return `${xGraphqlOrigin()}/i/api/graphql/${queryId}/${operationName}`;
}

export function buildXGraphqlHeaders(session: XSessionAuth): Record<string, string> {
  return {
    authorization: `Bearer ${X_PUBLIC_BEARER}`,
    'x-csrf-token': session.csrfToken,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'content-type': 'application/json',
    'user-agent': CHROME_UA,
    cookie: session.cookieHeader ?? `ct0=${session.csrfToken}`,
  };
}

export function resolveXSessionAuth(options: XSessionOptions = {}): XSessionAuth {
  if (options.csrfToken) {
    return {
      csrfToken: options.csrfToken,
      cookieHeader: options.cookieHeader,
    };
  }

  const config = loadChromeSessionConfig({ browserId: options.browser });
  if (config.browser.cookieBackend === 'firefox') {
    return extractFirefoxXCookies(options.firefoxProfileDir);
  }

  const chromeDir = options.chromeUserDataDir ?? config.chromeUserDataDir;
  const chromeProfile = options.chromeProfileDirectory ?? config.chromeProfileDirectory;
  return extractChromeXCookies(chromeDir, chromeProfile, config.browser);
}
