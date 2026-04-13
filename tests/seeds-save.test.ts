import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function withSeedStore(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-seeds-save-test-'));
  const saved = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (saved !== undefined) process.env.FT_DATA_DIR = saved;
    else delete process.env.FT_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
}

function fakeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: '2040864758145167373',
    text: 'Agents that review contracts in under 60 seconds.',
    url: 'https://x.com/example/status/2040864758145167373',
    authorHandle: '@ihtesham2005',
    postedAt: '2026-04-05T12:00:00.000Z',
    bookmarkedAt: '2026-04-06T09:30:00.000Z',
    category: 'tool',
    domain: 'ai',
    folderNames: [],
    ...overrides,
  };
}

test('saveSeedFromCandidates: materializes bookmark artifacts and returns a valid seed', async () => {
  // Regression guard for the bug where the seed-create flow passed raw
  // bookmark ids (from the SQLite bookmarks table) straight to
  // createIdeasSeedFromArtifacts, which validates against the adjacent
  // artifact store and therefore always failed with "Artifact not found".
  await withSeedStore(async () => {
    const { saveSeedFromCandidates } = await import('../src/seeds-save.js');
    const { readArtifact } = await import('../src/adjacent/librarian.js');
    const { readIdeasSeed } = await import('../src/ideas-seeds.js');

    const candidates = [
      fakeCandidate(),
      fakeCandidate({ id: 'bm-2', text: 'Second bookmark' }),
      fakeCandidate({ id: 'bm-3', text: 'Third bookmark' }),
    ];

    const seed = await saveSeedFromCandidates({
      candidates,
      title: 'Agents search seed',
      notes: 'strategy=search',
      strategy: 'search',
    });

    // Seed has N artifact ids, one per candidate, and each id resolves in
    // the adjacent store (not in the bookmarks DB).
    assert.equal(seed.artifactIds.length, 3);
    for (const id of seed.artifactIds) {
      const artifact = readArtifact(id);
      assert.ok(artifact, `artifact ${id} should exist in the adjacent store`);
      assert.equal(artifact!.type, 'bookmark');
      assert.equal(artifact!.source, 'field_theory');
      assert.equal((artifact!.metadata as Record<string, unknown>).kind, 'bookmark-from-seed-candidate');
    }

    // The bookmark ids are NOT the same as the artifact ids — the bridge
    // means we get a fresh adjacent-store id and carry the original
    // bookmark id in metadata.
    const first = readArtifact(seed.artifactIds[0]!);
    assert.ok(first);
    assert.notEqual(seed.artifactIds[0], '2040864758145167373');
    assert.equal((first!.metadata as Record<string, unknown>).bookmarkId, '2040864758145167373');

    // Seed is round-trippable via readIdeasSeed.
    const reloaded = readIdeasSeed(seed.id);
    assert.ok(reloaded);
    assert.deepEqual(reloaded!.artifactIds, seed.artifactIds);
  });
});

test('saveSeedFromCandidates: preserves pinned frameId through to the saved seed', async () => {
  await withSeedStore(async () => {
    const { saveSeedFromCandidates } = await import('../src/seeds-save.js');
    const seed = await saveSeedFromCandidates({
      candidates: [fakeCandidate()],
      title: 'Framed seed',
      frameId: 'impact-effort',
    });
    assert.equal(seed.frameId, 'impact-effort');
  });
});

test('saveSeedFromCandidates: carries tweet text + author + posted + url into the artifact body', async () => {
  await withSeedStore(async () => {
    const { saveSeedFromCandidates } = await import('../src/seeds-save.js');
    const { readArtifact } = await import('../src/adjacent/librarian.js');

    const candidate = fakeCandidate({
      text: 'Inner tweet text here.',
      authorHandle: '@demo',
      postedAt: '2026-04-05T12:00:00.000Z',
      url: 'https://x.com/demo/status/1',
    });
    const seed = await saveSeedFromCandidates({
      candidates: [candidate],
      title: 'Content seed',
    });

    const artifact = readArtifact(seed.artifactIds[0]!);
    assert.ok(artifact);
    assert.match(artifact!.content, /Inner tweet text here\./);
    assert.match(artifact!.content, /Author: @demo/);
    assert.match(artifact!.content, /Posted: 2026-04-05T12:00:00\.000Z/);
    assert.match(artifact!.content, /Source: https:\/\/x\.com\/demo\/status\/1/);
  });
});
