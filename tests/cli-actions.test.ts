import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildIndex, getBookmarkById } from '../src/bookmarks-db.js';
import { buildLikesIndex, getLikeById } from '../src/likes-db.js';
import { writeJson } from '../src/fs.js';

const execFileAsync = promisify(execFile);

const BOOKMARK_FIXTURE = {
  id: 'b1',
  tweetId: 'b1',
  url: 'https://x.com/alice/status/b1',
  text: 'Saved bookmark',
  authorHandle: 'alice',
  authorName: 'Alice',
  postedAt: '2026-03-01T00:00:00Z',
  bookmarkedAt: '2026-03-02T00:00:00Z',
  syncedAt: '2026-03-02T00:00:00Z',
  links: [],
  mediaObjects: [],
  tags: [],
  ingestedVia: 'graphql',
};

const LIKE_FIXTURE = {
  id: 'l1',
  tweetId: 'l1',
  url: 'https://x.com/bob/status/l1',
  text: 'Saved like',
  authorHandle: 'bob',
  authorName: 'Bob',
  postedAt: '2026-03-01T00:00:00Z',
  likedAt: '2026-03-03T00:00:00Z',
  syncedAt: '2026-03-03T00:00:00Z',
  links: [],
  mediaObjects: [],
  tags: [],
  ingestedVia: 'graphql',
};

async function startMockXServer(options: { unlikeStatus?: number; unbookmarkStatus?: number } = {}) {
  const server = http.createServer(async (req, res) => {
    const body = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => resolve(data));
    });

    if (req.method !== 'POST') {
      res.writeHead(404).end('not found');
      return;
    }

    const parsed = body ? JSON.parse(body) : {};
    if (req.url?.includes('/ZYKSe-w7KEslx3JhSIk5LA/UnfavoriteTweet')) {
      assert.equal(parsed.variables?.tweet_id, 'l1');
      const status = options.unlikeStatus ?? 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(status === 200 ? JSON.stringify({ data: { unfavorite_tweet: 'Done' } }) : 'upstream failure');
      return;
    }

    if (req.url?.includes('/Wlmlj2-xzyS1GN3a6cj-mQ/DeleteBookmark')) {
      assert.equal(parsed.variables?.tweet_id, 'b1');
      const status = options.unbookmarkStatus ?? 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(status === 200 ? JSON.stringify({ data: { tweet_bookmark_delete: 'Done' } }) : 'upstream failure');
      return;
    }

    res.writeHead(404).end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind mock X server.');

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function withCliDataDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ft-cli-actions-'));
  process.env.FT_DATA_DIR = dir;
  try {
    await writeFile(path.join(dir, 'bookmarks.jsonl'), `${JSON.stringify(BOOKMARK_FIXTURE)}\n`);
    await writeFile(path.join(dir, 'likes.jsonl'), `${JSON.stringify(LIKE_FIXTURE)}\n`);
    await writeJson(path.join(dir, 'bookmarks-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      totalBookmarks: 1,
    });
    await writeJson(path.join(dir, 'likes-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      totalLikes: 1,
    });
    await buildIndex({ force: true });
    await buildLikesIndex({ force: true });
    await fn(dir);
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
}

test('ft likes unlike removes the item remotely and from the local archive', async () => {
  await withCliDataDir(async (dir) => {
    const mockX = await startMockXServer();
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

    try {
      const { stdout } = await execFileAsync(tsx, ['src/cli.ts', 'likes', 'unlike', 'l1', '--cookies', 'ct0-token', 'auth'], {
        cwd: process.cwd(),
        env: { ...process.env, FT_DATA_DIR: dir, FT_X_API_ORIGIN: mockX.origin },
      });

      assert.match(stdout, /Unliked on X: l1/);
      assert.equal(await getLikeById('l1'), null);
      const likesCache = await readFile(path.join(dir, 'likes.jsonl'), 'utf8');
      assert.equal(likesCache.trim(), '');
    } finally {
      await mockX.close();
    }
  });
});

test('ft unbookmark removes the item remotely and from the local archive', async () => {
  await withCliDataDir(async (dir) => {
    const mockX = await startMockXServer();
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

    try {
      const { stdout } = await execFileAsync(tsx, ['src/cli.ts', 'unbookmark', 'b1', '--cookies', 'ct0-token', 'auth'], {
        cwd: process.cwd(),
        env: { ...process.env, FT_DATA_DIR: dir, FT_X_API_ORIGIN: mockX.origin },
      });

      assert.match(stdout, /Removed bookmark on X: b1/);
      assert.equal(await getBookmarkById('b1'), null);
      const bookmarksCache = await readFile(path.join(dir, 'bookmarks.jsonl'), 'utf8');
      assert.equal(bookmarksCache.trim(), '');
    } finally {
      await mockX.close();
    }
  });
});

test('ft likes unlike does not mutate local cache when the remote mutation fails', async () => {
  await withCliDataDir(async (dir) => {
    const mockX = await startMockXServer({ unlikeStatus: 500 });
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');

    try {
      await assert.rejects(
        execFileAsync(tsx, ['src/cli.ts', 'likes', 'unlike', 'l1', '--cookies', 'ct0-token', 'auth'], {
          cwd: process.cwd(),
          env: { ...process.env, FT_DATA_DIR: dir, FT_X_API_ORIGIN: mockX.origin },
        }),
      );

      assert.ok(await getLikeById('l1'));
      const likesCache = await readFile(path.join(dir, 'likes.jsonl'), 'utf8');
      assert.match(likesCache, /Saved like/);
    } finally {
      await mockX.close();
    }
  });
});

test('ft likes trim keeps the newest likes and removes older ones in batches', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ft-cli-trim-'));
  process.env.FT_DATA_DIR = dir;

  const likes = [
    {
      ...LIKE_FIXTURE,
      id: 'l3',
      tweetId: 'l3',
      likedAt: '2026-03-05T00:00:00Z',
      url: 'https://x.com/bob/status/l3',
      text: 'Newest like',
    },
    {
      ...LIKE_FIXTURE,
      id: 'l2',
      tweetId: 'l2',
      likedAt: '2026-03-04T00:00:00Z',
      url: 'https://x.com/bob/status/l2',
      text: 'Middle like',
    },
    {
      ...LIKE_FIXTURE,
      id: 'l1',
      tweetId: 'l1',
      likedAt: '2026-03-03T00:00:00Z',
      url: 'https://x.com/bob/status/l1',
      text: 'Oldest like',
    },
  ];

  const requests: string[] = [];
  const server = http.createServer(async (req, res) => {
    const body = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => resolve(data));
    });
    const parsed = body ? JSON.parse(body) : {};
    requests.push(parsed.variables?.tweet_id);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { unfavorite_tweet: 'Done' } }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind mock trim server.');

  try {
    await writeFile(path.join(dir, 'likes.jsonl'), likes.map((row) => JSON.stringify(row)).join('\n') + '\n');
    await writeJson(path.join(dir, 'likes-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      totalLikes: 3,
    });
    await buildLikesIndex({ force: true });

    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const { stdout } = await execFileAsync(
      tsx,
      ['src/cli.ts', 'likes', 'trim', '--keep', '1', '--batch-size', '2', '--pause-seconds', '0', '--cookies', 'ct0-token', 'auth'],
      {
        cwd: process.cwd(),
        env: { ...process.env, FT_DATA_DIR: dir, FT_X_API_ORIGIN: `http://127.0.0.1:${address.port}` },
      },
    );

    assert.match(stdout, /Removed 2 old likes on X/);
    assert.deepEqual(requests.sort(), ['l1', 'l2']);
    assert.ok(await getLikeById('l3'));
    assert.equal(await getLikeById('l2'), null);
    assert.equal(await getLikeById('l1'), null);
  } finally {
    delete process.env.FT_DATA_DIR;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test('ft likes trim retries a 429 before succeeding', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ft-cli-trim-429-'));
  process.env.FT_DATA_DIR = dir;

  const likes = [
    {
      ...LIKE_FIXTURE,
      id: 'l2',
      tweetId: 'l2',
      likedAt: '2026-03-04T00:00:00Z',
      url: 'https://x.com/bob/status/l2',
      text: 'Newest like',
    },
    {
      ...LIKE_FIXTURE,
      id: 'l1',
      tweetId: 'l1',
      likedAt: '2026-03-03T00:00:00Z',
      url: 'https://x.com/bob/status/l1',
      text: 'Oldest like',
    },
  ];

  let requests = 0;
  const server = http.createServer(async (_req, res) => {
    requests += 1;
    if (requests === 1) {
      res.writeHead(429, { 'content-type': 'text/plain' });
      res.end('Rate limit exceeded');
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { unfavorite_tweet: 'Done' } }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to bind mock trim server.');

  try {
    await writeFile(path.join(dir, 'likes.jsonl'), likes.map((row) => JSON.stringify(row)).join('\n') + '\n');
    await writeJson(path.join(dir, 'likes-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      totalLikes: 2,
    });
    await buildLikesIndex({ force: true });

    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const { stdout } = await execFileAsync(
      tsx,
      [
        'src/cli.ts',
        'likes',
        'trim',
        '--keep', '1',
        '--batch-size', '1',
        '--pause-seconds', '0',
        '--rate-limit-backoff-seconds', '1',
        '--max-rate-limit-retries', '1',
        '--cookies', 'ct0-token', 'auth',
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, FT_DATA_DIR: dir, FT_X_API_ORIGIN: `http://127.0.0.1:${address.port}` },
      },
    );

    assert.match(stdout, /Removed 1 old likes on X/);
    assert.equal(requests, 2);
    assert.ok(await getLikeById('l2'));
    assert.equal(await getLikeById('l1'), null);
  } finally {
    delete process.env.FT_DATA_DIR;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
