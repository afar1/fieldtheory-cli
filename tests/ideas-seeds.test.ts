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

    const mdPath = path.join(dir, 'automation', 'ideas', 'seeds', seed.createdAt.slice(0, 10), `${seed.id}.md`);
    const raw = await readFile(mdPath, 'utf8');
    assert.ok(raw.includes('strategy: random'));
    assert.ok(raw.includes('quiet leverage'));
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

    const mdPath = path.join(dir, 'automation', 'ideas', 'seeds', seed.createdAt.slice(0, 10), `${seed.id}.md`);
    const raw = await readFile(mdPath, 'utf8');
    assert.ok(raw.includes('## Related runs'));
    assert.ok(raw.includes('run-1'));
    assert.ok(raw.includes('dot-1'));
  });
});
