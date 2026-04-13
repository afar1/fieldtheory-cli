import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// ── Isolation helper ──────────────────────────────────────────────────────────

async function withAdjacentStore(fn: () => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-adjacent-test-'));
  const saved = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    await fn();
  } finally {
    if (saved !== undefined) process.env.FT_DATA_DIR = saved;
    else delete process.env.FT_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
}

// Lazy imports so FT_DATA_DIR override is in effect when modules load paths
async function getLibrarian() {
  return import('../src/adjacent/librarian.js');
}

async function getFrames() {
  return import('../src/adjacent/frames.js');
}

// ── Artifact CRUD ─────────────────────────────────────────────────────────────

test('writeArtifact creates a file and returns an artifact with an ID', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const artifact = lib.writeArtifact({
      type: 'seed_brief',
      source: 'adjacent',
      provenance: {
        createdAt: '2026-04-07T00:00:00Z',
        producer: 'user',
        inputIds: [],
      },
      content: '# Brief\n\nA test seed brief.',
      metadata: { seedText: 'hello world' },
    });

    assert.ok(artifact.id, 'should have an ID');
    assert.equal(artifact.type, 'seed_brief');
    assert.equal(artifact.source, 'adjacent');
    assert.ok(artifact.content.includes('test seed brief'));
  });
});

test('readArtifact returns the same data that was written', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const written = lib.writeArtifact({
      type: 'dot',
      source: 'adjacent',
      provenance: {
        createdAt: '2026-04-07T00:00:00Z',
        producer: 'llm',
        model: 'claude-opus-4-6',
        inputIds: ['abc123'],
        promptVersion: 'v1',
      },
      content: '# Dot\n\nTest dot content.',
      metadata: { axisAScore: 80, axisBScore: 60 },
    });

    const read = lib.readArtifact(written.id);
    assert.ok(read, 'should find written artifact');
    assert.equal(read.id, written.id);
    assert.equal(read.type, 'dot');
    assert.equal(read.provenance.model, 'claude-opus-4-6');
    assert.deepEqual(read.provenance.inputIds, ['abc123']);
    assert.equal(read.metadata['axisAScore'], 80);
    assert.ok(read.content.includes('Test dot content'));
  });
});

test('readArtifact returns null for unknown ID', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const result = lib.readArtifact('does-not-exist');
    assert.equal(result, null);
  });
});

test('deleteArtifact removes the file and returns true', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const artifact = lib.writeArtifact({
      type: 'bookmark',
      source: 'field_theory',
      provenance: { createdAt: '2026-04-07T00:00:00Z', producer: 'user', inputIds: [] },
      content: '# Bookmark',
      metadata: {},
    });

    const deleted = lib.deleteArtifact(artifact.id);
    assert.equal(deleted, true);
    assert.equal(lib.readArtifact(artifact.id), null);
  });
});

test('deleteArtifact returns false for unknown ID', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const result = lib.deleteArtifact('ghost-id');
    assert.equal(result, false);
  });
});

test('listArtifacts returns all written artifacts', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const provenance = { createdAt: '2026-04-07T00:00:00Z', producer: 'user' as const, inputIds: [] };

    lib.writeArtifact({ type: 'seed_brief', source: 'adjacent', provenance, content: 'brief 1', metadata: {} });
    lib.writeArtifact({ type: 'dot', source: 'adjacent', provenance, content: 'dot 1', metadata: {} });
    lib.writeArtifact({ type: 'seed_brief', source: 'adjacent', provenance, content: 'brief 2', metadata: {} });

    const all = lib.listArtifacts();
    assert.equal(all.length, 3);

    const briefs = lib.listArtifacts({ type: 'seed_brief' });
    assert.equal(briefs.length, 2);

    const dots = lib.listArtifacts({ type: 'dot' });
    assert.equal(dots.length, 1);
  });
});

test('listArtifacts respects limit', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const provenance = { createdAt: '2026-04-07T00:00:00Z', producer: 'user' as const, inputIds: [] };

    for (let i = 0; i < 5; i++) {
      lib.writeArtifact({ type: 'dot', source: 'adjacent', provenance, content: `dot ${i}`, metadata: {} });
    }

    const limited = lib.listArtifacts({ limit: 3 });
    assert.equal(limited.length, 3);
  });
});

test('searchArtifacts finds by content substring', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const provenance = { createdAt: '2026-04-07T00:00:00Z', producer: 'user' as const, inputIds: [] };

    lib.writeArtifact({ type: 'seed_brief', source: 'adjacent', provenance, content: 'exploring gaze tracking models', metadata: {} });
    lib.writeArtifact({ type: 'seed_brief', source: 'adjacent', provenance, content: 'improving clipboard history UX', metadata: {} });

    const results = lib.searchArtifacts({ query: 'gaze' });
    assert.equal(results.length, 1);
    assert.ok(results[0].content.includes('gaze'));
  });
});

// ── Consideration CRUD ────────────────────────────────────────────────────────

test('writeConsideration and readConsideration round-trip', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const frames = await getFrames();
    const frame = frames.DEFAULT_FRAMES[0];

    lib.writeConsideration({
      id: 'test-consideration-1',
      inputIds: ['seed-abc'],
      outputIds: [],
      frame,
      repo: '/Users/test/myrepo',
      depth: 'standard',
      createdAt: '2026-04-07T10:00:00Z',
      userInteractions: [],
      completedStages: [],
    });

    const read = lib.readConsideration('test-consideration-1');
    assert.ok(read, 'should find consideration');
    assert.equal(read.id, 'test-consideration-1');
    assert.equal(read.frame.id, frame.id);
    assert.equal(read.repo, '/Users/test/myrepo');
    assert.equal(read.depth, 'standard');
    assert.deepEqual(read.inputIds, ['seed-abc']);
  });
});

test('readConsideration returns null for unknown ID', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const result = lib.readConsideration('no-such-consideration');
    assert.equal(result, null);
  });
});

test('listConsiderations returns considerations sorted newest first', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const frames = await getFrames();
    const frame = frames.DEFAULT_FRAMES[0];

    lib.writeConsideration({
      id: 'c-older',
      inputIds: [],
      outputIds: [],
      frame,
      repo: '/repo',
      depth: 'quick',
      createdAt: '2026-04-01T00:00:00Z',
      userInteractions: [],
      completedStages: [],
    });

    lib.writeConsideration({
      id: 'c-newer',
      inputIds: [],
      outputIds: [],
      frame,
      repo: '/repo',
      depth: 'quick',
      createdAt: '2026-04-07T00:00:00Z',
      userInteractions: [],
      completedStages: [],
    });

    const list = lib.listConsiderations();
    assert.equal(list.length, 2);
    assert.equal(list[0].id, 'c-newer');
    assert.equal(list[1].id, 'c-older');
  });
});

// ── Cache ─────────────────────────────────────────────────────────────────────

test('seedBriefCache: write and read (single artifact)', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    lib.writeSeedBriefCache(['artifact-abc'], 'claude-opus-4-6', { brief: 'A test brief', topics: ['gaze', 'ml'] });
    const cached = lib.readSeedBriefCache(['artifact-abc'], 'claude-opus-4-6');
    assert.ok(cached, 'should find cache entry');
    assert.deepEqual((cached as any).topics, ['gaze', 'ml']);
  });
});

test('seedBriefCache: miss returns null', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const result = lib.readSeedBriefCache(['missing'], 'claude-opus-4-6');
    assert.equal(result, null);
  });
});

test('seedBriefCache: multi-artifact key is order-independent', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    lib.writeSeedBriefCache(['art-1', 'art-2', 'art-3'], 'claude-opus-4-6', { brief: 'group brief' });
    // A different order should hit the same cache file.
    const cached = lib.readSeedBriefCache(['art-3', 'art-1', 'art-2'], 'claude-opus-4-6');
    assert.ok(cached, 'should find cache entry regardless of input order');
    assert.equal((cached as any).brief, 'group brief');
  });
});

test('seedBriefCache: different artifact sets do not collide', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    lib.writeSeedBriefCache(['art-1', 'art-2'], 'claude-opus-4-6', { brief: 'pair' });
    lib.writeSeedBriefCache(['art-1', 'art-2', 'art-3'], 'claude-opus-4-6', { brief: 'triple' });

    const pair = lib.readSeedBriefCache(['art-2', 'art-1'], 'claude-opus-4-6');
    const triple = lib.readSeedBriefCache(['art-3', 'art-2', 'art-1'], 'claude-opus-4-6');
    assert.equal((pair as any).brief, 'pair');
    assert.equal((triple as any).brief, 'triple');
  });
});

test('resultCache: write and read', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const data = { dots: [{ title: 'Idea A' }] };
    lib.writeResultCache('seed-1', 'novelty-feasibility', 'focus on mobile', 'abc123git', data);
    const cached = lib.readResultCache('seed-1', 'novelty-feasibility', 'focus on mobile', 'abc123git');
    assert.ok(cached);
    assert.deepEqual((cached as any).dots[0].title, 'Idea A');
  });
});

test('hashSteering: undefined produces stable zero hash', async () => {
  const lib = await getLibrarian();
  assert.equal(lib.hashSteering(undefined), '0');
});

test('hashSteering: same input produces same hash', async () => {
  const lib = await getLibrarian();
  assert.equal(lib.hashSteering('focus on mobile'), lib.hashSteering('focus on mobile'));
});

test('hashSteering: different inputs produce different hashes', async () => {
  const lib = await getLibrarian();
  assert.notEqual(lib.hashSteering('focus on mobile'), lib.hashSteering('focus on auth'));
});

// ── Frames ────────────────────────────────────────────────────────────────────

test('DEFAULT_FRAMES contains exactly 6 frames', async () => {
  const frames = await getFrames();
  assert.equal(frames.DEFAULT_FRAMES.length, 6);
});

test('DEFAULT_FRAMES has 4 building frames and 2 risk frames', async () => {
  const frames = await getFrames();
  assert.equal(frames.getFramesByGroup('building').length, 4);
  assert.equal(frames.getFramesByGroup('risk').length, 2);
});

test('getFrame returns correct frame by ID', async () => {
  const frames = await getFrames();
  const frame = frames.getFrame('impact-effort');
  assert.ok(frame, 'should find impact-effort');
  assert.equal(frame.name, 'Impact × Effort');
  assert.equal(frame.group, 'building');
});

test('getFrame returns undefined for unknown ID', async () => {
  const frames = await getFrames();
  assert.equal(frames.getFrame('nonexistent'), undefined);
});

test('all frames have valid axis rubrics and quadrant labels', async () => {
  const frames = await getFrames();
  for (const frame of frames.DEFAULT_FRAMES) {
    assert.ok(frame.axisA.rubricSentence.length > 10, `${frame.id} axis A rubric too short`);
    assert.ok(frame.axisB.rubricSentence.length > 10, `${frame.id} axis B rubric too short`);
    assert.ok(frame.quadrantLabels.highHigh, `${frame.id} missing highHigh label`);
    assert.ok(frame.quadrantLabels.lowLow, `${frame.id} missing lowLow label`);
  }
});

// ── Store stats ───────────────────────────────────────────────────────────────

test('getStoreStats returns zeros for empty store', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const stats = lib.getStoreStats();
    assert.equal(stats.totalArtifacts, 0);
    assert.equal(stats.totalConsiderations, 0);
    assert.equal(stats.customFrames, 0);
    assert.ok(stats.storePath.includes('automation/adjacent'));
  });
});

test('getStoreStats counts correctly after writes', async () => {
  await withAdjacentStore(async () => {
    const lib = await getLibrarian();
    const frames = await getFrames();
    const provenance = { createdAt: '2026-04-07T00:00:00Z', producer: 'user' as const, inputIds: [] };

    lib.writeArtifact({ type: 'dot', source: 'adjacent', provenance, content: 'x', metadata: {} });
    lib.writeArtifact({ type: 'dot', source: 'adjacent', provenance, content: 'y', metadata: {} });
    lib.writeConsideration({
      id: 'c1',
      inputIds: [],
      outputIds: [],
      frame: frames.DEFAULT_FRAMES[0],
      repo: '/r',
      depth: 'quick',
      createdAt: '2026-04-07T00:00:00Z',
      userInteractions: [],
      completedStages: [],
    });

    const stats = lib.getStoreStats();
    assert.equal(stats.totalArtifacts, 2);
    assert.equal(stats.totalConsiderations, 1);
  });
});
