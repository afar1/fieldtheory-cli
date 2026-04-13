import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function withIdeasStore(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-ideas-seed-test-'));
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

async function getIdeasSeeds() {
  return import('../src/ideas-seeds.js');
}

test('createIdeasSeedFromText persists strategy metadata and markdown', async () => {
  await withIdeasStore(async (dir) => {
    const seeds = await getIdeasSeeds();
    const seed = await seeds.createIdeasSeedFromText({
      text: 'repo-grounded tool idea seed',
      title: 'Test Seed',
      strategy: 'random',
      strategyParams: { pick: 'quiet leverage' },
    });

    assert.equal(seed.strategy, 'random');
    assert.deepEqual(seed.strategyParams, { pick: 'quiet leverage' });

    const mdPath = path.join(dir, 'ideas', 'seeds', seed.createdAt.slice(0, 10), `${seed.id}.md`);
    const raw = await readFile(mdPath, 'utf8');
    assert.ok(raw.includes('strategy: random'));
    assert.ok(raw.includes('quiet leverage'));
  });
});

test('createIdeasSeedFromText persists a pinned frameId and emits it in the md frontmatter', async () => {
  await withIdeasStore(async (dir) => {
    const seeds = await getIdeasSeeds();
    const seed = await seeds.createIdeasSeedFromText({
      text: 'seed with a pinned frame',
      title: 'Frame Seed',
      frameId: 'novelty-feasibility',
    });

    assert.equal(seed.frameId, 'novelty-feasibility');

    // The store round-trips the frame across a reload.
    const reloaded = seeds.readIdeasSeed(seed.id);
    assert.ok(reloaded);
    assert.equal(reloaded!.frameId, 'novelty-feasibility');

    // The md frontmatter and summary both mention the frame.
    const mdPath = path.join(dir, 'ideas', 'seeds', seed.createdAt.slice(0, 10), `${seed.id}.md`);
    const raw = await readFile(mdPath, 'utf8');
    assert.ok(raw.includes('frame_id: novelty-feasibility'));
    assert.ok(raw.includes('- Frame: novelty-feasibility'));
  });
});

test('createIdeasSeedFromText leaves frameId undefined when not supplied', async () => {
  await withIdeasStore(async (dir) => {
    const seeds = await getIdeasSeeds();
    const seed = await seeds.createIdeasSeedFromText({ text: 'no frame here', title: 'Bare Seed' });
    assert.equal(seed.frameId, undefined);

    const mdPath = path.join(dir, 'ideas', 'seeds', seed.createdAt.slice(0, 10), `${seed.id}.md`);
    const raw = await readFile(mdPath, 'utf8');
    assert.ok(!raw.includes('frame_id:'));
    assert.ok(!raw.includes('- Frame:'));
  });
});

test('resolveFrameIdForRun: explicit beats seed pinned beats default', async () => {
  const { resolveFrameIdForRun } = await import('../src/ideas.js');
  // Explicit beats everything.
  assert.equal(resolveFrameIdForRun('impact-effort', 'novelty-feasibility'), 'impact-effort');
  // Seed frame used when explicit is absent.
  assert.equal(resolveFrameIdForRun(undefined, 'novelty-feasibility'), 'novelty-feasibility');
  // Default used when neither is given.
  assert.equal(resolveFrameIdForRun(undefined, undefined), 'leverage-specificity');
});

test('pickMostRecentlyUsedSeed: returns null for an empty list', async () => {
  const seeds = await getIdeasSeeds();
  assert.equal(seeds.pickMostRecentlyUsedSeed([]), null);
});

test('pickMostRecentlyUsedSeed: picks the seed with the newest lastUsedAt', async () => {
  const seeds = await getIdeasSeeds();
  const list = [
    { id: 'seed-old-used',    title: 'old', sourceType: 'text' as const, artifactIds: ['a'], createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'user' as const, lastUsedAt: '2026-02-01T00:00:00.000Z' },
    { id: 'seed-new-unused',  title: 'new', sourceType: 'text' as const, artifactIds: ['a'], createdAt: '2026-03-01T00:00:00.000Z', createdBy: 'user' as const },
    { id: 'seed-recent-used', title: 'mid', sourceType: 'text' as const, artifactIds: ['a'], createdAt: '2026-02-15T00:00:00.000Z', createdBy: 'user' as const, lastUsedAt: '2026-04-10T00:00:00.000Z' },
  ];
  const pick = seeds.pickMostRecentlyUsedSeed(list);
  assert.ok(pick);
  assert.equal(pick!.id, 'seed-recent-used', 'seed with the latest lastUsedAt should win');
});

test('pickMostRecentlyUsedSeed: falls back to createdAt when no seed has been used', async () => {
  const seeds = await getIdeasSeeds();
  const list = [
    { id: 'seed-oldest', title: 'o', sourceType: 'text' as const, artifactIds: ['a'], createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'user' as const },
    { id: 'seed-newest', title: 'n', sourceType: 'text' as const, artifactIds: ['a'], createdAt: '2026-04-01T00:00:00.000Z', createdBy: 'user' as const },
    { id: 'seed-middle', title: 'm', sourceType: 'text' as const, artifactIds: ['a'], createdAt: '2026-02-15T00:00:00.000Z', createdBy: 'user' as const },
  ];
  const pick = seeds.pickMostRecentlyUsedSeed(list);
  assert.ok(pick);
  assert.equal(pick!.id, 'seed-newest');
});

test('pickMostRecentlyUsedSeed: a freshly-used seed beats a newer-but-unused seed', async () => {
  const seeds = await getIdeasSeeds();
  const list = [
    { id: 'seed-fresh-unused', title: 'u', sourceType: 'text' as const, artifactIds: ['a'], createdAt: '2026-04-01T00:00:00.000Z', createdBy: 'user' as const },
    { id: 'seed-old-used',     title: 'o', sourceType: 'text' as const, artifactIds: ['a'], createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'user' as const, lastUsedAt: '2026-04-12T00:00:00.000Z' },
  ];
  const pick = seeds.pickMostRecentlyUsedSeed(list);
  assert.ok(pick);
  assert.equal(pick!.id, 'seed-old-used', 'recency of *use* should outrank recency of *creation*');
});

test('pickMostRecentlyUsedSeed: does not mutate its input', async () => {
  const seeds = await getIdeasSeeds();
  const list = [
    { id: 'a', title: '', sourceType: 'text' as const, artifactIds: ['x'], createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'user' as const },
    { id: 'b', title: '', sourceType: 'text' as const, artifactIds: ['x'], createdAt: '2026-02-01T00:00:00.000Z', createdBy: 'user' as const },
  ];
  const before = list.map((s) => s.id);
  seeds.pickMostRecentlyUsedSeed(list);
  assert.deepEqual(list.map((s) => s.id), before);
});

test('resolveFrameIdForRun: empty-string explicit falls through to seed frame, not past it', async () => {
  const { resolveFrameIdForRun } = await import('../src/ideas.js');
  // Empty string on the explicit side is treated as "not provided" so a
  // stringly-typed caller cannot accidentally bypass a seed-pinned frame.
  assert.equal(resolveFrameIdForRun('', 'novelty-feasibility'), 'novelty-feasibility');
  // And when both are empty, we land on the default.
  assert.equal(resolveFrameIdForRun('', ''), 'leverage-specificity');
});

test('resolveSeedForRun: passes through explicit artifact ids without touching the seed store', async () => {
  await withIdeasStore(async () => {
    const { resolveSeedForRun } = await import('../src/ideas.js');
    const result = await resolveSeedForRun({
      seedArtifactIds: ['bm-1', 'bm-2'],
    });
    assert.deepEqual(result.seedArtifactIds, ['bm-1', 'bm-2']);
    assert.equal(result.seedFrameId, undefined);
  });
});

test('resolveSeedForRun: loads a saved seed, returns its artifacts + frameId, and touches lastUsedAt', async () => {
  await withIdeasStore(async () => {
    const seeds = await getIdeasSeeds();
    const seed = await seeds.createIdeasSeedFromText({
      text: 'pinned seed',
      title: 'Pinned',
      frameId: 'impact-effort',
    });
    assert.equal(seed.lastUsedAt, undefined, 'precondition: fresh seed has no lastUsedAt');

    const { resolveSeedForRun } = await import('../src/ideas.js');
    const result = await resolveSeedForRun({ seedId: seed.id });
    assert.deepEqual(result.seedArtifactIds, seed.artifactIds);
    assert.equal(result.seedFrameId, 'impact-effort');

    const reloaded = seeds.readIdeasSeed(seed.id);
    assert.ok(reloaded);
    assert.ok(reloaded!.lastUsedAt, 'resolveSeedForRun should touch the seed on use');
  });
});

test('resolveSeedForRun: throws a clear error when neither explicit artifacts nor a seed id is given', async () => {
  await withIdeasStore(async () => {
    const { resolveSeedForRun } = await import('../src/ideas.js');
    await assert.rejects(() => resolveSeedForRun({}), /--seed-artifact.*--seed/);
  });
});

test('resolveSeedForRun: throws when the saved seed id is unknown', async () => {
  await withIdeasStore(async () => {
    const { resolveSeedForRun } = await import('../src/ideas.js');
    await assert.rejects(() => resolveSeedForRun({ seedId: 'seed-nope' }), /Seed not found/);
  });
});

test('resolveSeedForRun: prefers explicit seedArtifactIds over a saved seed even when both are given', async () => {
  // If a caller passes both, explicit wins and the saved seed is not touched.
  await withIdeasStore(async () => {
    const seeds = await getIdeasSeeds();
    const seed = await seeds.createIdeasSeedFromText({ text: 'saved', title: 'Saved' });

    const { resolveSeedForRun } = await import('../src/ideas.js');
    const result = await resolveSeedForRun({
      seedArtifactIds: ['explicit-1'],
      seedId: seed.id,
    });
    assert.deepEqual(result.seedArtifactIds, ['explicit-1']);

    const reloaded = seeds.readIdeasSeed(seed.id);
    assert.ok(reloaded);
    assert.equal(reloaded!.lastUsedAt, undefined, 'saved seed should not be touched when explicit artifacts are supplied');
  });
});

test('linkIdeasSeedToRun deduplicates and updates markdown', async () => {
  await withIdeasStore(async (dir) => {
    const seeds = await getIdeasSeeds();
    const seed = await seeds.createIdeasSeedFromText({
      text: 'another seed',
      title: 'Graph Seed',
    });

    await seeds.linkIdeasSeedToRun({ seedId: seed.id, runId: 'run-1', nodeIds: ['dot-1', 'dot-1', 'dot-2'] });
    await seeds.linkIdeasSeedToRun({ seedId: seed.id, runId: 'run-1', nodeIds: ['dot-2'] });

    const refreshed = seeds.readIdeasSeed(seed.id)!;
    assert.deepEqual(refreshed.relatedRunIds, ['run-1']);
    assert.deepEqual(refreshed.relatedNodeIds, ['dot-1', 'dot-2']);

    const mdPath = path.join(dir, 'ideas', 'seeds', seed.createdAt.slice(0, 10), `${seed.id}.md`);
    const raw = await readFile(mdPath, 'utf8');
    assert.ok(raw.includes('## Related runs'));
    assert.ok(raw.includes('run-1'));
    assert.ok(raw.includes('dot-1'));
  });
});
