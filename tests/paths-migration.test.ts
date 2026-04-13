import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The migration helper moves ideas data from the legacy
 *   <data-dir>/automation/{ideas,adjacent}
 * layout to the new
 *   <field-theory-root>/ideas
 * layout. In tests, FT_DATA_DIR forces both roots to the same temp dir, so
 * the legacy paths live at <tmp>/automation/ideas and <tmp>/automation/adjacent,
 * and the new root is <tmp>/ideas.
 */
async function withTmpRoot(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-migration-test-'));
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

async function getPaths() {
  return import('../src/paths.js');
}

async function seedLegacyLayout(root: string, opts: { withIdeas?: boolean; withAdjacent?: boolean } = {}): Promise<void> {
  if (opts.withIdeas) {
    const legacySeeds = path.join(root, 'automation', 'ideas', 'seeds', '2026-04-13');
    await mkdir(legacySeeds, { recursive: true });
    await writeFile(path.join(legacySeeds, 'seed-abc.md'), '# seed md', 'utf-8');
    await writeFile(path.join(root, 'automation', 'ideas', 'seeds.json'), JSON.stringify({ seeds: [] }), 'utf-8');
  }
  if (opts.withAdjacent) {
    const legacyArtifacts = path.join(root, 'automation', 'adjacent', 'artifacts');
    await mkdir(legacyArtifacts, { recursive: true });
    await writeFile(path.join(legacyArtifacts, 'art-1.json'), JSON.stringify({ id: 'art-1' }), 'utf-8');
  }
}

test('migrateLegacyIdeasData: no-op when nothing legacy exists and new root is empty', async () => {
  await withTmpRoot(async (dir) => {
    const paths = await getPaths();
    const result = paths.migrateLegacyIdeasData();
    assert.equal(result.migrated, false);
    assert.equal(result.reason, 'nothing-to-migrate');
    assert.equal(fs.existsSync(path.join(dir, 'ideas')), false);
  });
});

test('migrateLegacyIdeasData: copies legacy ideas content into the new root', async () => {
  await withTmpRoot(async (dir) => {
    await seedLegacyLayout(dir, { withIdeas: true });
    const paths = await getPaths();
    const result = paths.migrateLegacyIdeasData();
    assert.equal(result.migrated, true);

    const newSeedMd = path.join(dir, 'ideas', 'seeds', '2026-04-13', 'seed-abc.md');
    const newSeedsJson = path.join(dir, 'ideas', 'seeds.json');
    assert.ok(fs.existsSync(newSeedMd), 'legacy seed md should be copied');
    assert.ok(fs.existsSync(newSeedsJson), 'legacy seeds.json should be copied');
    assert.equal(await readFile(newSeedMd, 'utf-8'), '# seed md');

    // Legacy copy is intentionally left in place for user review.
    assert.ok(fs.existsSync(path.join(dir, 'automation', 'ideas', 'seeds', '2026-04-13', 'seed-abc.md')));
  });
});

test('migrateLegacyIdeasData: copies legacy adjacent content under ideas/adjacent', async () => {
  await withTmpRoot(async (dir) => {
    await seedLegacyLayout(dir, { withAdjacent: true });
    const paths = await getPaths();
    const result = paths.migrateLegacyIdeasData();
    assert.equal(result.migrated, true);

    const newArtifact = path.join(dir, 'ideas', 'adjacent', 'artifacts', 'art-1.json');
    assert.ok(fs.existsSync(newArtifact), 'legacy adjacent artifact should land under ideas/adjacent');
  });
});

test('migrateLegacyIdeasData: handles the full legacy layout in one pass', async () => {
  await withTmpRoot(async (dir) => {
    await seedLegacyLayout(dir, { withIdeas: true, withAdjacent: true });
    const paths = await getPaths();
    const result = paths.migrateLegacyIdeasData();
    assert.equal(result.migrated, true);
    assert.ok(fs.existsSync(path.join(dir, 'ideas', 'seeds.json')));
    assert.ok(fs.existsSync(path.join(dir, 'ideas', 'adjacent', 'artifacts', 'art-1.json')));
    assert.ok(fs.existsSync(path.join(dir, 'ideas', '.migrated-from-ft-bookmarks')));
  });
});

test('migrateLegacyIdeasData: is idempotent — a second call is a no-op', async () => {
  await withTmpRoot(async (dir) => {
    await seedLegacyLayout(dir, { withIdeas: true });
    const paths = await getPaths();
    const first = paths.migrateLegacyIdeasData();
    assert.equal(first.migrated, true);

    // Touch a new file in the migrated root to prove the second pass does
    // not re-copy and clobber it.
    await writeFile(path.join(dir, 'ideas', 'user-added.md'), 'user text', 'utf-8');

    const second = paths.migrateLegacyIdeasData();
    assert.equal(second.migrated, false);
    assert.equal(second.reason, 'already-migrated');
    assert.equal(await readFile(path.join(dir, 'ideas', 'user-added.md'), 'utf-8'), 'user text');
  });
});

test('migrateLegacyIdeasData: skips when new root already has content, even without a marker', async () => {
  await withTmpRoot(async (dir) => {
    // User has already populated the new root by hand (e.g. from a backup).
    await mkdir(path.join(dir, 'ideas', 'seeds'), { recursive: true });
    await writeFile(path.join(dir, 'ideas', 'seeds.json'), JSON.stringify({ seeds: ['new'] }), 'utf-8');
    // And some legacy content sits alongside.
    await seedLegacyLayout(dir, { withIdeas: true });

    const paths = await getPaths();
    const result = paths.migrateLegacyIdeasData();
    assert.equal(result.migrated, false);
    assert.equal(result.reason, 'already-migrated');

    // New content is untouched.
    const after = JSON.parse(await readFile(path.join(dir, 'ideas', 'seeds.json'), 'utf-8'));
    assert.deepEqual(after.seeds, ['new']);
  });
});

test('migrateLegacyIdeasData: recovers from a partial copy left by a previous interrupted run', async () => {
  // Regression guard for the real-machine bug where the first run's copy
  // got interrupted partway, leaving 18/54 repo-indices in the new root,
  // no complete marker, and the next run short-circuiting as
  // "already-migrated". With the two-marker guard (begin + complete), a
  // begin-marker-only new root is treated as a partial and retried cleanly.
  await withTmpRoot(async (dir) => {
    // Full legacy layout with 3 repo-indices we want to see at the end.
    await seedLegacyLayout(dir, { withAdjacent: true });
    const legacyRepoIndices = path.join(dir, 'automation', 'adjacent', 'repo-indices');
    await mkdir(legacyRepoIndices, { recursive: true });
    await writeFile(path.join(legacyRepoIndices, 'repo-a.json'), '{"repo":"a"}', 'utf-8');
    await writeFile(path.join(legacyRepoIndices, 'repo-b.json'), '{"repo":"b"}', 'utf-8');
    await writeFile(path.join(legacyRepoIndices, 'repo-c.json'), '{"repo":"c"}', 'utf-8');

    // Simulate a prior interrupted run: new root exists with a begin marker
    // plus a subset of the legacy content (only repo-a was copied before
    // the process died). No complete marker.
    const newRoot = path.join(dir, 'ideas');
    const partialRepoIndices = path.join(newRoot, 'adjacent', 'repo-indices');
    await mkdir(partialRepoIndices, { recursive: true });
    await writeFile(path.join(partialRepoIndices, 'repo-a.json'), '{"repo":"a"}', 'utf-8');
    await writeFile(
      path.join(newRoot, '.migration-in-progress'),
      JSON.stringify({ startedAt: '2026-04-13T00:00:00.000Z' }),
      'utf-8',
    );

    const paths = await getPaths();
    const result = paths.migrateLegacyIdeasData();

    assert.equal(result.migrated, true);
    assert.equal(result.reason, 'recovered-partial');

    // The new root now has all three repo-indices from the legacy set.
    const finalEntries = (await (await import('node:fs/promises')).readdir(partialRepoIndices)).sort();
    assert.deepEqual(finalEntries, ['repo-a.json', 'repo-b.json', 'repo-c.json']);

    // Complete marker is written; begin marker is gone.
    assert.ok(fs.existsSync(path.join(newRoot, '.migrated-from-ft-bookmarks')));
    assert.ok(!fs.existsSync(path.join(newRoot, '.migration-in-progress')));
  });
});

test('migrateLegacyIdeasData: respects the complete marker even when content looks partial', async () => {
  // The complete marker is the authoritative "done" signal. If it is
  // present, we must never touch the new root — even if content looks
  // lighter than the legacy set (e.g. the user pruned files after the
  // migration, or the legacy tree has grown since).
  await withTmpRoot(async (dir) => {
    const newRoot = path.join(dir, 'ideas');
    const newRepoIndices = path.join(newRoot, 'adjacent', 'repo-indices');
    await mkdir(newRepoIndices, { recursive: true });
    await writeFile(path.join(newRepoIndices, 'only-this.json'), '{"repo":"x"}', 'utf-8');
    await writeFile(
      path.join(newRoot, '.migrated-from-ft-bookmarks'),
      JSON.stringify({ migratedAt: '2026-04-13T00:00:00.000Z' }),
      'utf-8',
    );
    // Legacy has a lot more.
    await seedLegacyLayout(dir, { withAdjacent: true });

    const paths = await getPaths();
    const result = paths.migrateLegacyIdeasData();
    assert.equal(result.migrated, false);
    assert.equal(result.reason, 'already-migrated');

    // New root still has the exact one entry the user kept.
    const entries = (await (await import('node:fs/promises')).readdir(newRepoIndices)).sort();
    assert.deepEqual(entries, ['only-this.json']);
  });
});
