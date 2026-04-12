import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildLikesIndex } from '../src/likes-db.js';
import { writeJson } from '../src/fs.js';
import { buildCli } from '../src/cli.js';

const execFileAsync = promisify(execFile);

const FIXTURES = [
  {
    id: '1',
    tweetId: '1',
    url: 'https://x.com/alice/status/1',
    text: 'Machine learning is transforming healthcare',
    authorHandle: 'alice',
    authorName: 'Alice Smith',
    syncedAt: '2026-01-01T00:00:00Z',
    postedAt: '2026-01-01T12:00:00Z',
    likedAt: '2026-03-05T12:00:00Z',
    engagement: { likeCount: 100, repostCount: 10 },
    mediaObjects: [],
    links: ['https://example.com'],
    tags: [],
    ingestedVia: 'browser',
  },
];

async function withLikesDataDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ft-cli-likes-'));
  process.env.FT_DATA_DIR = dir;
  try {
    await writeFile(path.join(dir, 'likes.jsonl'), FIXTURES.map((r) => JSON.stringify(r)).join('\n') + '\n');
    await writeJson(path.join(dir, 'likes-meta.json'), {
      provider: 'twitter',
      schemaVersion: 1,
      lastFullSyncAt: '2026-04-05T12:34:56Z',
      totalLikes: 1,
    });
    await buildLikesIndex();
    await fn(dir);
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
}

test('buildCli help includes likes command group', () => {
  const help = buildCli().helpInformation();
  assert.match(help, /\blikes\b/);
});

test('ft likes status prints likes-specific summary', async () => {
  await withLikesDataDir(async (dir) => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const { stdout } = await execFileAsync(tsx, ['src/cli.ts', 'likes', 'status'], {
      cwd: process.cwd(),
      env: { ...process.env, FT_DATA_DIR: dir },
    });

    assert.match(stdout, /Likes/);
    assert.match(stdout, /likes: 1/);
    assert.match(stdout, /cache: .*likes\.jsonl/);
  });
});

test('ft likes list lists liked items', async () => {
  await withLikesDataDir(async (dir) => {
    const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const { stdout } = await execFileAsync(tsx, ['src/cli.ts', 'likes', 'list', '--limit', '1'], {
      cwd: process.cwd(),
      env: { ...process.env, FT_DATA_DIR: dir },
    });

    assert.match(stdout, /@alice/);
    assert.match(stdout, /https:\/\/x\.com\/alice\/status\/1/);
  });
});
