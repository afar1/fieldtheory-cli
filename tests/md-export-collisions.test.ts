import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildIndex } from '../src/bookmarks-db.js';
import { exportBookmarks } from '../src/md-export.js';

const prefix = 'The same opening sentence repeated in multiple bookmarks. ';
function bookmark(id: string, text = prefix + id) {
  return {
    id, tweetId: id, url: `https://example.test/status/${id}`, text,
    authorHandle: 'example_author', authorName: 'Example Author',
    postedAt: '2026-04-30T12:00:00.000Z', syncedAt: '2026-05-01T12:00:00.000Z',
    mediaObjects: [], links: [], tags: [], ingestedVia: 'graphql',
  };
}
async function fixture(fn: (f: {
  dir: string; output: string;
  index: (items: ReturnType<typeof bookmark>[]) => Promise<void>;
  files: () => Promise<string[]>;
}) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-collisions-'));
  const previous = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  const output = path.join(dir, 'md', 'bookmarks');
  const f = {
    dir, output,
    index: async (items: ReturnType<typeof bookmark>[]) => {
      await writeFile(path.join(dir, 'bookmarks.jsonl'), items.map(x => JSON.stringify(x)).join('\n') + '\n');
      await buildIndex({ force: true });
    },
    files: () => readdir(output),
  };
  try { await fn(f); } finally {
    if (previous === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}
const quiet = { onProgress: () => {} };
async function identities(output: string) {
  const files = await readdir(output);
  return Promise.all(files.map(async file => (await readFile(path.join(output, file), 'utf8')).match(/^tweet_id: "([^"]+)"$/m)?.[1]));
}

test('same-prefix bookmarks are all exported', async () => fixture(async f => {
  await f.index([bookmark('100'), bookmark('200'), bookmark('300')]);
  const result = await exportBookmarks(quiet);
  assert.equal(result.exported, 3);
  assert.deepEqual((await identities(f.output)).sort(), ['100', '200', '300']);
}));

test('force keeps distinct colliding bookmark bodies', async () => fixture(async f => {
  await f.index([bookmark('100'), bookmark('200')]);
  await exportBookmarks({ ...quiet, force: true });
  assert.equal((await f.files()).length, 2);
  assert.deepEqual((await identities(f.output)).sort(), ['100', '200']);
}));

test('cross-run collision preserves an existing edited bookmark', async () => fixture(async f => {
  await f.index([bookmark('100')]);
  await exportBookmarks(quiet);
  const name = (await f.files())[0];
  const original = await readFile(path.join(f.output, name), 'utf8') + '\nUser annotation\n';
  await writeFile(path.join(f.output, name), original);
  await f.index([bookmark('100'), bookmark('200')]);
  const result = await exportBookmarks(quiet);
  assert.equal(result.exported, 1);
  assert.equal(result.skipped, 1);
  assert.equal((await f.files()).length, 2);
  assert.equal(await readFile(path.join(f.output, name), 'utf8'), original);
}));

test('repeat export reuses collision paths without new copies', async () => fixture(async f => {
  await f.index([bookmark('100'), bookmark('200')]);
  await exportBookmarks(quiet);
  const names = await f.files();
  const result = await exportBookmarks(quiet);
  assert.equal(names.length, 2);
  assert.deepEqual(await f.files(), names);
  assert.equal(result.exported, 0);
  assert.equal(result.skipped, 2);
}));

test('changed mode refreshes each stale collision path', async () => fixture(async f => {
  await f.index([bookmark('100'), bookmark('200')]);
  await exportBookmarks(quiet);
  for (const name of await f.files()) {
    await utimes(path.join(f.output, name), new Date(0), new Date(0));
  }
  const result = await exportBookmarks({ ...quiet, changed: true });
  assert.equal(result.exported, 2);
  assert.equal((await f.files()).length, 2);
  assert.deepEqual((await identities(f.output)).sort(), ['100', '200']);
}));

test('changed mode keeps a newer colliding export intact', async () => fixture(async f => {
  await f.index([bookmark('100'), bookmark('200')]);
  await exportBookmarks(quiet);
  const names = await f.files();
  for (const name of names) await utimes(path.join(f.output, name), new Date('2030-01-01'), new Date('2030-01-01'));
  const result = await exportBookmarks({ ...quiet, changed: true });
  assert.equal(names.length, 2);
  assert.equal(result.exported, 0);
  assert.equal(result.skipped, 2);
}));

test('force on a later run cannot overwrite another bookmark', async () => fixture(async f => {
  await f.index([bookmark('100')]);
  await exportBookmarks(quiet);
  const name = (await f.files())[0];
  const original = await readFile(path.join(f.output, name), 'utf8');
  await f.index([bookmark('200')]);
  await exportBookmarks({ ...quiet, force: true });
  assert.equal(await readFile(path.join(f.output, name), 'utf8'), original);
  assert.equal((await f.files()).length, 2);
}));

test('frontmatter ownership cannot be supplied by tweet_id in the body', async () => fixture(async f => {
  await f.index([bookmark('100')]);
  await exportBookmarks(quiet);
  const name = (await f.files())[0];
  const original = await readFile(path.join(f.output, name), 'utf8') + '\ntweet_id: "200"\n';
  await writeFile(path.join(f.output, name), original);
  await f.index([bookmark('200')]);
  await exportBookmarks({ ...quiet, force: true });
  assert.equal(await readFile(path.join(f.output, name), 'utf8'), original);
  assert.equal((await f.files()).length, 2);
}));

test('unidentified files are preserved even with force', async () => fixture(async f => {
  await f.index([bookmark('100')]);
  await exportBookmarks(quiet);
  const name = (await f.files())[0];
  await writeFile(path.join(f.output, name), 'A handwritten note.\n');
  await exportBookmarks({ ...quiet, force: true });
  assert.equal(await readFile(path.join(f.output, name), 'utf8'), 'A handwritten note.\n');
  assert.equal((await f.files()).length, 2);
}));

test('an occupied ID-suffixed path is not overwritten', async () => fixture(async f => {
  await f.index([bookmark('100')]);
  await exportBookmarks(quiet);
  const name = (await f.files())[0];
  const occupied = name.slice(0, -3) + '-200.md';
  await writeFile(path.join(f.output, occupied), 'An unrelated note.\n');
  await f.index([bookmark('100'), bookmark('200')]);
  await exportBookmarks({ ...quiet, force: true });
  assert.equal(await readFile(path.join(f.output, occupied), 'utf8'), 'An unrelated note.\n');
  assert.equal((await f.files()).length, 3);
}));

test('an unambiguous existing filename stays unchanged', async () => fixture(async f => {
  await f.index([bookmark('100', 'Unique bookmark')]);
  await exportBookmarks(quiet);
  assert.deepEqual(await f.files(), ['2026-04-30-example-author-unique-bookmark.md']);
  const result = await exportBookmarks(quiet);
  assert.equal(result.skipped, 1);
}));

test('CRLF frontmatter still identifies an existing export', async () => fixture(async f => {
  await f.index([bookmark('100')]);
  await exportBookmarks(quiet);
  const name = (await f.files())[0];
  await writeFile(path.join(f.output, name), (await readFile(path.join(f.output, name), 'utf8')).replace(/\n/g, '\r\n'));
  const result = await exportBookmarks(quiet);
  assert.equal(result.exported, 0);
  assert.equal(result.skipped, 1);
  assert.deepEqual(await f.files(), [name]);
}));

test('collision suffixes encode filename separators in imported IDs', async () => fixture(async f => {
  await f.index([bookmark('100')]);
  await exportBookmarks(quiet);
  await f.index([bookmark('100'), bookmark('id/with:separator')]);
  await exportBookmarks(quiet);
  const files = await f.files();
  assert.equal(files.length, 2);
  assert.ok(files.some(name => name.endsWith('-id%2Fwith%3Aseparator.md')));
  assert.deepEqual((await identities(f.output)).sort(), ['100', 'id/with:separator']);
}));
