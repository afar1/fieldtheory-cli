/**
 * Remove a bookmark on X — the one write this CLI makes to X.
 *
 * Uses the same browser-session GraphQL transport as `ft sync` (the user's
 * ct0/auth_token cookies plus X's public web bearer). Failures come back as a
 * typed result instead of an exception, so callers can keep the local copy and
 * offer a manual fallback with a useful reason.
 */

import { buildHeaders, resolveXSessionCookies } from './graphql-bookmarks.js';
import type { XSessionCookies, XSessionOptions } from './graphql-bookmarks.js';

// Refresh by searching the current abs.twimg.com/responsive-web/client-web/main.<hash>.js
// bundle for operationName:"DeleteBookmark". Verified against main.59435dbf6f40166da.js
// on 2026-09-13. createUnbookmarker() rediscovers it if X rotates it.
export const DELETE_BOOKMARK_QUERY_ID = 'Wlmlj2-xzyS1GN3a6cj-mQ';
const DELETE_BOOKMARK_OPERATION = 'DeleteBookmark';
const REQUEST_TIMEOUT_MS = 15_000;

export type UnbookmarkStatus = 'removed' | 'not_bookmarked' | 'auth' | 'rate_limited' | 'rejected' | 'network';

export interface UnbookmarkResult {
  /** True when the tweet is no longer bookmarked on X. */
  ok: boolean;
  status: UnbookmarkStatus;
  message: string;
  httpStatus?: number;
  /** Seconds until X lifts a rate limit, when it said so. */
  retryAfterSec?: number;
}

type FetchLike = typeof fetch;

/** Errors meaning "already not bookmarked" — safe to treat as success. */
const NOT_BOOKMARKED_ERROR = /not\s+(been\s+)?bookmarked|no status found/i;
/** Errors meaning the queryId or operation is no longer known to X. */
const STALE_QUERY_ERROR = /query.*(not found|unspecified)|unknown operation/i;

export async function unbookmarkTweetOnX(
  tweetId: string,
  opts: { session: XSessionCookies; queryId?: string; fetchImpl?: FetchLike },
): Promise<UnbookmarkResult & { staleQueryId?: boolean }> {
  if (!/^\d+$/.test(tweetId)) {
    return { ok: false, status: 'rejected', message: `Invalid tweet id "${tweetId}"` };
  }
  const queryId = opts.queryId ?? DELETE_BOOKMARK_QUERY_ID;
  const fetchImpl = opts.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(`https://x.com/i/api/graphql/${queryId}/${DELETE_BOOKMARK_OPERATION}`, {
      method: 'POST',
      headers: buildHeaders(opts.session.csrfToken, opts.session.cookieHeader),
      body: JSON.stringify({ variables: { tweet_id: tweetId }, queryId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, status: 'network', message: `Could not reach X: ${(err as Error).message}` };
  }

  const httpStatus = response.status;
  const body: any = await response.json().catch(() => null);
  const errorMessage = Array.isArray(body?.errors)
    ? body.errors.map((e: any) => e?.message).filter(Boolean).join('; ')
    : '';

  if (body?.data?.tweet_bookmark_delete === 'Done') {
    return { ok: true, status: 'removed', message: 'Removed from your X bookmarks.', httpStatus };
  }
  if (errorMessage && NOT_BOOKMARKED_ERROR.test(errorMessage)) {
    return { ok: true, status: 'not_bookmarked', message: 'It was already gone from your X bookmarks.', httpStatus };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      ok: false, status: 'auth', httpStatus,
      message: 'X did not accept your browser session (logged out or expired).',
    };
  }
  if (httpStatus === 429) {
    const resetAt = Number(response.headers.get('x-rate-limit-reset'));
    const retryAfterSec = resetAt > 0 ? Math.max(0, Math.ceil(resetAt - Date.now() / 1000)) : undefined;
    return { ok: false, status: 'rate_limited', httpStatus, retryAfterSec, message: 'X is rate limiting requests. Try again in a minute.' };
  }
  if (httpStatus >= 500) {
    return { ok: false, status: 'rejected', httpStatus, message: `X had a server error (HTTP ${httpStatus}). Try again shortly.` };
  }

  // A 400/404 with no recognisable error, or an "unknown query" error, usually
  // means X rotated the queryId.
  const staleQueryId = STALE_QUERY_ERROR.test(errorMessage) || (!response.ok && !errorMessage && (httpStatus === 400 || httpStatus === 404));
  return {
    ok: false,
    status: 'rejected',
    httpStatus,
    staleQueryId,
    message: errorMessage ? `X rejected the request: ${errorMessage}` : `X rejected the request (HTTP ${httpStatus}).`,
  };
}

/** Find the current queryId for a GraphQL operation in X's web client bundle. */
export async function discoverQueryId(
  operation: string,
  session: XSessionCookies,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  try {
    const headers = buildHeaders(session.csrfToken, session.cookieHeader);
    const page = await fetchImpl('https://x.com/home', {
      headers: { cookie: headers.cookie, 'user-agent': headers['user-agent'] },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const bundleUrl = (await page.text())
      .match(/https:\/\/abs\.twimg\.com\/responsive-web\/client-web[^"'\s]*\/main\.[\w.]+\.js/)?.[0];
    if (!bundleUrl) return null;
    const bundle = await (await fetchImpl(bundleUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })).text();
    const escaped = operation.replace(/[^\w]/g, '');
    return bundle.match(new RegExp(`queryId:"([^"]+)",operationName:"${escaped}"`))?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Build an unbookmark function for a long-running process such as `ft web`.
 * Reads the browser session once and reuses it; re-reads it once if X rejects
 * it, and looks up a fresh queryId once if X no longer recognises ours.
 */
export function createUnbookmarker(
  sessionOptions: XSessionOptions = {},
  fetchImpl: FetchLike = fetch,
): (tweetId: string) => Promise<UnbookmarkResult> {
  let session: XSessionCookies | undefined;
  let queryId = DELETE_BOOKMARK_QUERY_ID;
  let rediscovered = false;

  const loadSession = (): UnbookmarkResult | null => {
    try {
      session = resolveXSessionCookies(sessionOptions);
      return null;
    } catch (err) {
      return {
        ok: false,
        status: 'auth',
        message: `Could not read your X session from the browser: ${(err as Error).message}`,
      };
    }
  };

  return async (tweetId) => {
    if (!session) {
      const failure = loadSession();
      if (failure) return failure;
    }

    let result = await unbookmarkTweetOnX(tweetId, { session: session!, queryId, fetchImpl });

    if (result.status === 'auth' && !sessionOptions.csrfToken) {
      // Cookies may have rotated since the server started; read them again once.
      const failure = loadSession();
      if (failure) return failure;
      result = await unbookmarkTweetOnX(tweetId, { session: session!, queryId, fetchImpl });
    }

    if (result.staleQueryId && !rediscovered) {
      rediscovered = true;
      const fresh = await discoverQueryId(DELETE_BOOKMARK_OPERATION, session!, fetchImpl);
      if (fresh && fresh !== queryId) {
        queryId = fresh;
        result = await unbookmarkTweetOnX(tweetId, { session: session!, queryId, fetchImpl });
      }
    }
    if (result.ok) rediscovered = false;

    const { staleQueryId: _stale, ...publicResult } = result;
    return publicResult;
  };
}
