import { buildGraphqlUrl, buildXGraphqlHeaders, resolveXSessionAuth, type XSessionOptions } from './x-graphql.js';

interface MutationSpec {
  queryId: string;
  operationName: string;
  responseKey: string;
  failureLabel: string;
}

export class RemoteTweetActionError extends Error {
  status?: number;

  constructor(message: string, options: { status?: number } = {}) {
    super(message);
    this.name = 'RemoteTweetActionError';
    this.status = options.status;
  }
}

export interface RemoteTweetActionResult {
  tweetId: string;
  operation: 'unlike' | 'unbookmark';
  responseKey: string;
}

const UNLIKE_MUTATION: MutationSpec = {
  queryId: 'ZYKSe-w7KEslx3JhSIk5LA',
  operationName: 'UnfavoriteTweet',
  responseKey: 'unfavorite_tweet',
  failureLabel: 'Failed to unlike tweet',
};

const UNBOOKMARK_MUTATION: MutationSpec = {
  queryId: 'Wlmlj2-xzyS1GN3a6cj-mQ',
  operationName: 'DeleteBookmark',
  responseKey: 'tweet_bookmark_delete',
  failureLabel: 'Failed to delete bookmark',
};

async function runMutation(
  spec: MutationSpec,
  tweetId: string,
  options: XSessionOptions = {},
): Promise<RemoteTweetActionResult> {
  const session = resolveXSessionAuth(options);
  const response = await fetch(buildGraphqlUrl(spec.queryId, spec.operationName), {
    method: 'POST',
    headers: buildXGraphqlHeaders(session),
    body: JSON.stringify({
      variables: { tweet_id: tweetId },
      queryId: spec.queryId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new RemoteTweetActionError(
      `${spec.failureLabel} (${response.status}).\n` +
      `Response: ${text.slice(0, 300)}\n\n` +
      (response.status === 401 || response.status === 403
        ? 'Fix: Your X session may have expired. Open your browser, go to https://x.com, and make sure you are logged in. Then retry.'
        : 'This may be a temporary X issue. Try again in a few minutes.'),
      { status: response.status },
    );
  }

  const json = await response.json() as Record<string, any>;
  if (json?.data?.[spec.responseKey] !== 'Done') {
    throw new RemoteTweetActionError(
      `${spec.failureLabel}.\n` +
      `Response: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }

  return {
    tweetId,
    operation: spec === UNLIKE_MUTATION ? 'unlike' : 'unbookmark',
    responseKey: spec.responseKey,
  };
}

export async function unlikeTweet(
  tweetId: string,
  options: XSessionOptions = {},
): Promise<RemoteTweetActionResult> {
  return runMutation(UNLIKE_MUTATION, tweetId, options);
}

export async function unbookmarkTweet(
  tweetId: string,
  options: XSessionOptions = {},
): Promise<RemoteTweetActionResult> {
  return runMutation(UNBOOKMARK_MUTATION, tweetId, options);
}
