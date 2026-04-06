import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildGraphqlGetUrl,
  buildGraphqlPostBody,
  formatFolderName,
  parseBookmarkFolderTimelineResponse,
  parseBookmarkFoldersSliceResponse,
  selectFolderLabels,
  syncBookmarkFolders,
} from '../src/x-bookmark-folders.js';
import { twitterBookmarksCachePath, twitterBookmarksIndexPath } from '../src/paths.js';
import { buildIndex, openBookmarksIndexDb } from '../src/bookmarks-db.js';
import { saveDb } from '../src/db.js';

const originalDataDir = process.env.FT_DATA_DIR;

test.after(() => {
  if (originalDataDir) process.env.FT_DATA_DIR = originalDataDir;
  else delete process.env.FT_DATA_DIR;
});

function makeTimelineResponse(tweetIds: string[], cursor?: string) {
  return {
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                ...tweetIds.map((tweetId, index) => ({
                  entryId: `tweet-${index}`,
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          rest_id: tweetId,
                          legacy: {
                            id_str: tweetId,
                            full_text: `Tweet ${tweetId}`,
                            entities: { urls: [] },
                          },
                        },
                      },
                    },
                  },
                })),
                ...(cursor ? [{ entryId: 'cursor-bottom-1', content: { value: cursor } }] : []),
              ],
            },
          ],
        },
      },
    },
  };
}

async function setupFolderFixture(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'ft-folders-'));
  process.env.FT_DATA_DIR = cwd;
  await mkdir(cwd, { recursive: true });
  const records = [
    {
      id: '1',
      tweetId: '1',
      url: 'https://x.com/alice/status/1',
      text: 'AI systems',
      authorHandle: 'alice',
      authorName: 'Alice',
      syncedAt: '2026-01-01T00:00:00Z',
      postedAt: '2026-01-01T00:00:00Z',
      bookmarkedAt: '2026-01-01T01:00:00Z',
      language: 'en',
      links: [],
      tags: [],
      ingestedVia: 'graphql',
      categories: 'opinion',
      primaryCategory: 'opinion',
      domains: 'ai',
      primaryDomain: 'ai',
    },
    {
      id: '2',
      tweetId: '2',
      url: 'https://x.com/bob/status/2',
      text: 'Another AI bookmark',
      authorHandle: 'bob',
      authorName: 'Bob',
      syncedAt: '2026-01-02T00:00:00Z',
      postedAt: '2026-01-02T00:00:00Z',
      bookmarkedAt: '2026-01-02T01:00:00Z',
      language: 'en',
      links: [],
      tags: [],
      ingestedVia: 'graphql',
      categories: 'tool',
      primaryCategory: 'tool',
      domains: 'ai',
      primaryDomain: 'ai',
    },
    {
      id: '3',
      tweetId: '3',
      url: 'https://x.com/cara/status/3',
      text: 'Religion bookmark',
      authorHandle: 'cara',
      authorName: 'Cara',
      syncedAt: '2026-01-03T00:00:00Z',
      postedAt: '2026-01-03T00:00:00Z',
      bookmarkedAt: '2026-01-03T01:00:00Z',
      language: 'en',
      links: [],
      tags: [],
      ingestedVia: 'graphql',
      categories: 'research',
      primaryCategory: 'research',
      domains: 'religion',
      primaryDomain: 'religion',
    },
  ];
  const jsonl = records.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await writeFile(twitterBookmarksCachePath(), jsonl);
  await buildIndex({ force: true });
  const db = await openBookmarksIndexDb();
  try {
    db.run(`UPDATE bookmarks SET categories = 'opinion', primary_category = 'opinion', domains = 'ai', primary_domain = 'ai' WHERE tweet_id = '1'`);
    db.run(`UPDATE bookmarks SET categories = 'tool', primary_category = 'tool', domains = 'ai', primary_domain = 'ai' WHERE tweet_id = '2'`);
    db.run(`UPDATE bookmarks SET categories = 'research', primary_category = 'research', domains = 'religion', primary_domain = 'religion' WHERE tweet_id = '3'`);
    saveDb(db, twitterBookmarksIndexPath());
  } finally {
    db.close();
  }
  return cwd;
}

test('formatFolderName maps special slugs and title-cases the rest', () => {
  assert.equal(formatFolderName('ai'), 'AI');
  assert.equal(formatFolderName('web-dev'), 'Web Dev');
  assert.equal(formatFolderName('religion'), 'Religion');
});

test('selectFolderLabels applies thresholds and include/exclude overrides', () => {
  const labels = selectFolderLabels(
    { ai: 10, religion: 4, politics: 2, health: 1 },
    { minFolderSize: 3, includeLabels: ['health'], excludeLabels: ['politics'] },
  );

  assert.deepEqual(
    labels.map((item) => item.label),
    ['ai', 'religion', 'health'],
  );
});

test('GraphQL builders encode variables correctly', () => {
  const operation = { queryId: 'qid123', operationName: 'BookmarkFoldersSlice', method: 'GET' as const };
  const url = buildGraphqlGetUrl(operation, { cursor: 'abc' }, { featureA: true });
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/i/api/graphql/qid123/BookmarkFoldersSlice');
  assert.equal(parsed.searchParams.get('variables'), JSON.stringify({ cursor: 'abc' }));
  assert.equal(parsed.searchParams.get('features'), JSON.stringify({ featureA: true }));

  const body = buildGraphqlPostBody(
    { queryId: 'qid456', operationName: 'createBookmarkFolder', method: 'POST' },
    { name: 'AI' },
  );
  assert.deepEqual(body, { queryId: 'qid456', variables: { name: 'AI' } });
});

test('parseBookmarkFoldersSliceResponse extracts folders recursively', () => {
  const parsed = parseBookmarkFoldersSliceResponse({
    data: {
      viewer: {
        folders: [
          { bookmark_collection_id: 'folder-1', name: 'AI', media: { icon: 'star' } },
          { bookmark_collection_id: 'folder-2', name: 'Religion' },
        ],
      },
    },
  });

  assert.deepEqual(parsed.folders.map((folder) => folder.id), ['folder-1', 'folder-2']);
  assert.equal(parsed.folders[0].name, 'AI');
});

test('parseBookmarkFoldersSliceResponse accepts current id-based X folder items', () => {
  const parsed = parseBookmarkFoldersSliceResponse({
    data: {
      viewer: {
        user_results: {
          result: {
            bookmark_collections_slice: {
              items: [
                { id: '2041087987396583655', name: 'AI', media: { media_key: '3_1' } },
              ],
            },
          },
        },
      },
    },
  });

  assert.deepEqual(parsed.folders, [{ id: '2041087987396583655', name: 'AI', media: { media_key: '3_1' } }]);
});

test('parseBookmarkFolderTimelineResponse extracts tweet ids and cursor', () => {
  const parsed = parseBookmarkFolderTimelineResponse(makeTimelineResponse(['123', '456'], 'next-cursor'));
  assert.deepEqual(parsed.tweetIds, ['123', '456']);
  assert.equal(parsed.nextCursor, 'next-cursor');
});

test('syncBookmarkFolders dry-run plans assignments and sends transaction headers', async () => {
  await setupFolderFixture();
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const result = await syncBookmarkFolders({
    dryRun: true,
    minFolderSize: 2,
    session: {
      csrfToken: 'csrf',
      cookieHeader: 'ct0=csrf; auth_token=token',
      userAgent: 'TestAgent/1.0',
      headers: {},
      transactionIdGenerator: { generate: async () => 'txid-123' },
    },
    fetchImpl: async (input: string | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      return new Response(JSON.stringify({
        data: {
          viewer: {
            folders: [{ bookmark_collection_id: 'folder-1', name: 'AI' }],
          },
        },
      }), { status: 200 });
    },
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.eligibleLabels.length, 1);
  assert.equal(result.eligibleLabels[0].label, 'ai');
  assert.equal(result.assignmentsPlanned, 2);
  assert.equal(requests.length > 0, true);
  assert.equal(requests[0].headers['x-client-transaction-id'], 'txid-123');
});

test('syncBookmarkFolders recovers folder id by re-listing folders after create response omits it', async () => {
  await setupFolderFixture();
  const requests: string[] = [];
  let listCount = 0;

  const result = await syncBookmarkFolders({
    minFolderSize: 2,
    maxActions: 0,
    sleep: async () => {},
    session: {
      csrfToken: 'csrf',
      cookieHeader: 'ct0=csrf; auth_token=token',
      userAgent: 'TestAgent/1.0',
      headers: {},
      transactionIdGenerator: { generate: async () => 'txid-456' },
    },
    fetchImpl: async (input: string | URL) => {
      const url = String(input);
      requests.push(url);

      if (url.includes('/BookmarkFoldersSlice')) {
        listCount += 1;
        const folders = listCount === 1
          ? []
          : [{ id: 'folder-1', name: 'AI', media: { media_key: '3_1' } }];
        return new Response(JSON.stringify({
          data: {
            viewer: {
              user_results: {
                result: {
                  bookmark_collections_slice: {
                    items: folders,
                  },
                },
              },
            },
          },
        }), { status: 200 });
      }

      if (url.includes('/createBookmarkFolder')) {
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      }

      throw new Error(`Unexpected request: ${url}`);
    },
  });

  assert.equal(result.foldersCreated, 1);
  assert.equal(result.foldersMatched, 0);
  assert.equal(result.assignmentsPending, 2);
  assert.equal(result.stopReason, 'batch complete (more pending)');
  assert.equal(requests.some((url) => url.includes('/createBookmarkFolder')), true);
});

test('openBookmarksIndexDb exposes folder sync tables after migration', async () => {
  await setupFolderFixture();
  const db = await openBookmarksIndexDb();
  try {
    const rows = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('x_bookmark_folders', 'x_bookmark_folder_sync') ORDER BY name`,
    );
    assert.deepEqual(rows[0].values.map((row) => row[0]), ['x_bookmark_folder_sync', 'x_bookmark_folders']);
  } finally {
    db.close();
  }
});
