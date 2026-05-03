import test from 'node:test';
import assert from 'node:assert/strict';

async function getIdeasFiles() {
  return import('../src/ideas-files.js');
}

test('renderIdeasNodeMd includes prompt and source context', async () => {
  const { renderIdeasNodeMd } = await getIdeasFiles();
  const markdown = renderIdeasNodeMd({
    run: {
      id: 'run-1',
      inputIds: ['seed-artifact-1'],
      outputIds: ['dot-1'],
      frame: {
        id: 'impact-effort',
        name: 'Impact × Effort',
        group: 'building',
        generationPromptAddition: '',
        axisA: { label: 'Impact', rubricSentence: '0 low, 100 high' },
        axisB: { label: 'Effort', rubricSentence: '0 hard, 100 easy' },
        quadrantLabels: { highHigh: 'Sweep', highLow: 'Slog', lowHigh: 'Polish', lowLow: 'Detour' },
      },
      repo: '/tmp/repo',
      depth: 'standard',
      createdAt: '2026-04-12T12:00:00.000Z',
      userInteractions: [],
      completedStages: ['read', 'survey', 'generate', 'critique', 'score'],
    },
    artifactId: 'dot-1',
    dot: {
      title: 'Tighten repo prompt loop',
      summary: 'Create a clearer prompt export flow for ideas.',
      rationale: 'This makes generated ideas easier to act on in coding agents.',
      repoSurface: 'src/ideas.ts',
      effortEstimate: 'days',
      axisAScore: 84,
      axisAJustification: 'high leverage',
      axisBScore: 72,
      axisBJustification: 'tractable',
      exportablePrompt: 'Read src/ideas.ts and implement a prompt panel.',
    },
  });

  assert.ok(markdown.includes('# Tighten repo prompt loop'));
  assert.ok(markdown.includes('## Goal'));
  assert.ok(markdown.includes('Improve src/ideas.ts by delivering "Tighten repo prompt loop".'));
  assert.ok(markdown.includes('## Prompt'));
  assert.ok(markdown.includes('Read src/ideas.ts and implement a prompt panel.'));
  assert.ok(markdown.includes('Run: run-1'));
});

test('renderIdeasBatchMd: includes per-repo runs, top dots, and a re-run command', async () => {
  const { renderIdeasBatchMd } = await getIdeasFiles();
  const md = renderIdeasBatchMd({
    id: 'batch-abc123',
    createdAt: '2026-04-12T12:00:00.000Z',
    seedId: 'seed-xyz',
    seedArtifactIds: ['art-1', 'art-2'],
    frameId: 'leverage-specificity',
    frameName: 'Leverage × Specificity',
    depth: 'quick',
    model: 'claude/opus/effort=medium',
    engine: 'claude',
    engineModel: 'opus',
    engineEffort: 'medium',
    steering: 'focus on auth',
    repoRuns: [
      { repo: '/tmp/repo-a', runId: 'adj-1' },
      { repo: '/tmp/repo-b', runId: 'adj-2' },
    ],
    totalDotCount: 6,
    topDots: [
      {
        runId: 'adj-1',
        repo: '/tmp/repo-a',
        dotArtifactId: 'dot-1',
        dot: {
          title: 'Tighten the auth boundary',
          summary: 'Move token validation into a shared middleware.',
          rationale: 'Currently duplicated across handlers.',
          repoSurface: 'src/auth/handlers.ts',
          effortEstimate: 'days',
          axisAScore: 88,
          axisAJustification: 'high leverage',
          axisBScore: 70,
          axisBJustification: 'specific pain',
          exportablePrompt: 'Refactor auth handlers...',
        },
      },
    ],
  });

  assert.ok(md.includes('# Ideas batch batch-abc123'));
  assert.ok(md.includes('type: ideas-batch-summary'));
  assert.ok(md.includes('seed_id: seed-xyz'));
  assert.ok(md.includes('frame_id: leverage-specificity'));
  assert.ok(md.includes('depth: quick'));
  assert.ok(md.includes('model: "claude/opus/effort=medium"'));
  assert.ok(md.includes('total_dot_count: 6'));
  assert.ok(md.includes('/tmp/repo-a → adj-1'));
  assert.ok(md.includes('/tmp/repo-b → adj-2'));
  assert.ok(md.includes('## Top ideas across all repos'));
  assert.ok(md.includes('Tighten the auth boundary'));
  assert.ok(md.includes('Move token validation into a shared middleware.'));
  assert.ok(md.includes('--repos "/tmp/repo-a" "/tmp/repo-b"'));
  assert.ok(md.includes('--frame leverage-specificity'));
  assert.ok(md.includes('--engine "claude" --model "opus" --effort "medium"'));
});

test('renderIdeasBatchMd: omits the top-dots section when no dots produced', async () => {
  const { renderIdeasBatchMd } = await getIdeasFiles();
  const md = renderIdeasBatchMd({
    id: 'batch-empty',
    createdAt: '2026-04-12T12:00:00.000Z',
    seedArtifactIds: ['art-1'],
    frameId: 'impact-effort',
    frameName: 'Impact × Effort',
    depth: 'standard',
    model: 'claude',
    repoRuns: [
      { repo: '/tmp/x', runId: 'adj-1' },
      { repo: '/tmp/y', runId: 'adj-2' },
    ],
    totalDotCount: 0,
    topDots: [],
  });

  assert.ok(!md.includes('## Top ideas across all repos'));
  assert.ok(md.includes('total_dot_count: 0'));
});

test('renderIdeasBatchMd: parallel YAML arrays stay in lockstep with repoRuns order', async () => {
  // Regression guard for the repo↔runId pairing. The renderer derives the two
  // YAML arrays (consideration_ids, repos) from a single source so they cannot
  // drift out of order even if a future refactor reorders one.
  const { renderIdeasBatchMd } = await getIdeasFiles();
  const md = renderIdeasBatchMd({
    id: 'batch-order',
    createdAt: '2026-04-12T12:00:00.000Z',
    seedArtifactIds: ['art-1'],
    frameId: 'impact-effort',
    frameName: 'Impact × Effort',
    depth: 'standard',
    model: 'claude',
    repoRuns: [
      { repo: '/tmp/zeta',  runId: 'adj-zeta' },
      { repo: '/tmp/alpha', runId: 'adj-alpha' },
      { repo: '/tmp/mid',   runId: 'adj-mid' },
    ],
    totalDotCount: 0,
    topDots: [],
  });

  // Per-repo body section: each line zips the right pair.
  assert.ok(md.includes('/tmp/zeta → adj-zeta'));
  assert.ok(md.includes('/tmp/alpha → adj-alpha'));
  assert.ok(md.includes('/tmp/mid → adj-mid'));
  // Frontmatter parallel arrays: same order, same length.
  assert.ok(md.includes('consideration_ids: ["adj-zeta", "adj-alpha", "adj-mid"]'));
  assert.ok(md.includes('repos: ["/tmp/zeta", "/tmp/alpha", "/tmp/mid"]'));
});
