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

test('resolveFrameIdForRun: empty-string explicit falls through to seed frame, not past it', async () => {
  const { resolveFrameIdForRun } = await import('../src/ideas.js');
  // Empty string on the explicit side is treated as "not provided" so a
  // stringly-typed caller cannot accidentally bypass a seed-pinned frame.
  assert.equal(resolveFrameIdForRun('', 'novelty-feasibility'), 'novelty-feasibility');
  // And when both are empty, we land on the default.
  assert.equal(resolveFrameIdForRun('', ''), 'leverage-specificity');
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
