import test from 'node:test';
import assert from 'node:assert/strict';
import type { Prompter, WizardDeps } from '../src/possible-wizard.js';
import type { IdeasSeed } from '../src/ideas-seeds.js';
import type { Frame } from '../src/adjacent/types.js';
import {
  parseIndex,
  parseModelProfileAnswer,
  parseRepoList,
  runPossibleWizard,
  stepPickDepth,
  stepPickFrame,
  stepPickModelProfile,
  stepPickNodeTarget,
  stepPickRepos,
  stepPickSeed,
} from '../src/possible-wizard.js';

// ── Mock prompter + fixtures ───────────────────────────────────────────────

/**
 * A Prompter that replays a canned queue of answers and captures every line
 * the wizard writes. Tests push answers in order; step functions consume
 * them via prompter.ask().
 */
function mockPrompter(answers: string[]): Prompter & { lines: string[]; remaining: () => number } {
  const queue = [...answers];
  const lines: string[] = [];
  return {
    ask: async (question: string) => {
      if (queue.length === 0) {
        throw new Error(`mockPrompter: ran out of answers at question "${question}"`);
      }
      return queue.shift()!;
    },
    write: (line: string) => {
      lines.push(line);
    },
    lines,
    remaining: () => queue.length,
  };
}

function fakeSeed(overrides: Partial<IdeasSeed> = {}): IdeasSeed {
  return {
    id: 'seed-abc',
    title: 'Demo seed',
    sourceType: 'artifact',
    artifactIds: ['art-1', 'art-2', 'art-3'],
    createdAt: '2026-04-13T00:00:00.000Z',
    createdBy: 'user',
    ...overrides,
  };
}

function fakeFrame(overrides: Partial<Frame> = {}): Frame {
  return {
    id: 'impact-effort',
    name: 'Impact × Effort',
    group: 'building',
    generationPromptAddition: '',
    axisA: { label: 'Impact', rubricSentence: '0 low, 100 high' },
    axisB: { label: 'Effort', rubricSentence: '0 hard, 100 easy' },
    quadrantLabels: { highHigh: 'Sweep', highLow: 'Slog', lowHigh: 'Polish', lowLow: 'Detour' },
    ...overrides,
  };
}

// ── Pure helpers ───────────────────────────────────────────────────────────

test('parseIndex: rejects anything that is not a positive integer in range', () => {
  assert.equal(parseIndex('1', 3), 0);
  assert.equal(parseIndex('2', 3), 1);
  assert.equal(parseIndex('3', 3), 2);
  assert.equal(parseIndex('0', 3), null);
  assert.equal(parseIndex('4', 3), null);
  assert.equal(parseIndex('-1', 3), null);
  assert.equal(parseIndex('', 3), null);
  assert.equal(parseIndex('abc', 3), null);
  assert.equal(parseIndex('1.5', 3), 0); // parseInt truncates — pinned so we notice if we tighten
});

test('parseRepoList: splits on whitespace, trims, drops empties', () => {
  assert.deepEqual(parseRepoList('/a /b /c'), ['/a', '/b', '/c']);
  assert.deepEqual(parseRepoList('  /a   /b  '), ['/a', '/b']);
  assert.deepEqual(parseRepoList('/a\t/b\n/c'), ['/a', '/b', '/c']);
  assert.deepEqual(parseRepoList(''), []);
  assert.deepEqual(parseRepoList('   '), []);
});

test('parseModelProfileAnswer: supports default, effort-only, and engine/model/effort', () => {
  assert.deepEqual(parseModelProfileAnswer(''), {});
  assert.deepEqual(parseModelProfileAnswer('medium'), { effort: 'medium' });
  assert.deepEqual(parseModelProfileAnswer('opus medium'), { model: 'opus', effort: 'medium' });
  assert.deepEqual(parseModelProfileAnswer('claude medium'), { engine: 'claude', effort: 'medium' });
  assert.deepEqual(parseModelProfileAnswer('claude opus medium'), {
    engine: 'claude',
    model: 'opus',
    effort: 'medium',
  });
  assert.deepEqual(parseModelProfileAnswer('codex gpt-5.5 medium'), {
    engine: 'codex',
    model: 'gpt-5.5',
    effort: 'medium',
  });
  assert.equal(parseModelProfileAnswer('claude opus enormous'), null);
});

// ── stepPickSeed ───────────────────────────────────────────────────────────

test('stepPickSeed: empty seed store → prints 3 strategy hints and returns the picked one', async () => {
  const prompter = mockPrompter(['2']); // recent
  const result = await stepPickSeed(prompter, { listSeeds: () => [] });

  assert.equal(result.kind, 'empty');
  if (result.kind === 'empty') {
    assert.equal(result.strategy, 'recent');
    assert.match(result.command, /ft seeds recent/);
  }
  assert.ok(prompter.lines.some((l) => l.includes('No saved seeds yet')), 'should warn no seeds');
  assert.ok(prompter.lines.some((l) => l.includes('search')), 'should list search strategy');
  assert.ok(prompter.lines.some((l) => l.includes('recent')), 'should list recent strategy');
  assert.ok(prompter.lines.some((l) => l.includes('random')), 'should list random strategy');
});

test('stepPickSeed: empty seed store, user quits → cancelled', async () => {
  const prompter = mockPrompter(['q']);
  const result = await stepPickSeed(prompter, { listSeeds: () => [] });
  assert.equal(result.kind, 'cancelled');
});

test('stepPickSeed: empty seed store, invalid pick → cancelled', async () => {
  const prompter = mockPrompter(['9']);
  const result = await stepPickSeed(prompter, { listSeeds: () => [] });
  assert.equal(result.kind, 'cancelled');
  if (result.kind === 'cancelled') assert.equal(result.reason, 'invalid-strategy-pick');
});

test('stepPickSeed: non-empty, user picks seed 2 → returns that seed', async () => {
  const seeds = [fakeSeed({ id: 'seed-a' }), fakeSeed({ id: 'seed-b' }), fakeSeed({ id: 'seed-c' })];
  const prompter = mockPrompter(['2']);
  const result = await stepPickSeed(prompter, { listSeeds: () => seeds });

  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.equal(result.seed.id, 'seed-b');
});

// ── stepPickRepos ──────────────────────────────────────────────────────────

test('stepPickRepos: saved set exists, user accepts → returns the saved set', async () => {
  const saved = ['/repo-a', '/repo-b'];
  const prompter = mockPrompter(['']); // enter = yes
  const result = await stepPickRepos(prompter, { listRepos: () => saved });

  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.deepEqual(result.repos, saved);
});

test('stepPickRepos: saved set exists, user types "y" → returns the saved set', async () => {
  const prompter = mockPrompter(['y']);
  const result = await stepPickRepos(prompter, { listRepos: () => ['/a', '/b'] });
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.deepEqual(result.repos, ['/a', '/b']);
});

test('stepPickRepos: saved set exists, user says "n" then types paths → uses the typed paths', async () => {
  const prompter = mockPrompter(['n', '/new-1 /new-2']);
  const result = await stepPickRepos(prompter, { listRepos: () => ['/saved'] });
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.deepEqual(result.repos, ['/new-1', '/new-2']);
});

test('stepPickRepos: saved set exists, user enters paths directly (skipping n) → uses them', async () => {
  const prompter = mockPrompter(['/direct-a /direct-b']);
  const result = await stepPickRepos(prompter, { listRepos: () => ['/saved'] });
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.deepEqual(result.repos, ['/direct-a', '/direct-b']);
});

test('stepPickRepos: no saved set, user enters paths → uses them', async () => {
  const prompter = mockPrompter(['/only-one']);
  const result = await stepPickRepos(prompter, { listRepos: () => [] });
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.deepEqual(result.repos, ['/only-one']);
});

test('stepPickRepos: no saved set, user quits → cancelled', async () => {
  const prompter = mockPrompter(['q']);
  const result = await stepPickRepos(prompter, { listRepos: () => [] });
  assert.equal(result.kind, 'cancelled');
});

// ── stepPickFrame ──────────────────────────────────────────────────────────

test('stepPickFrame: seed pinned frame is marked as default; enter accepts it', async () => {
  const frames = [
    fakeFrame({ id: 'leverage-specificity', name: 'Leverage × Specificity' }),
    fakeFrame({ id: 'impact-effort', name: 'Impact × Effort' }),
  ];
  const prompter = mockPrompter(['']); // enter = use seed default
  const result = await stepPickFrame(prompter, { listFrames: () => frames }, 'impact-effort');
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.equal(result.frameId, 'impact-effort');
  assert.ok(prompter.lines.some((l) => l.includes('(seed default)')), 'should mark the seed default');
});

test('stepPickFrame: no seed default, enter falls back to first frame', async () => {
  const frames = [
    fakeFrame({ id: 'leverage-specificity', name: 'Leverage × Specificity' }),
    fakeFrame({ id: 'impact-effort', name: 'Impact × Effort' }),
  ];
  const prompter = mockPrompter(['']);
  const result = await stepPickFrame(prompter, { listFrames: () => frames }, undefined);
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.equal(result.frameId, 'leverage-specificity');
});

test('stepPickFrame: user picks frame 2 → returns it', async () => {
  const frames = [
    fakeFrame({ id: 'leverage-specificity' }),
    fakeFrame({ id: 'impact-effort' }),
  ];
  const prompter = mockPrompter(['2']);
  const result = await stepPickFrame(prompter, { listFrames: () => frames }, undefined);
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.equal(result.frameId, 'impact-effort');
});

// ── stepPickDepth ──────────────────────────────────────────────────────────

test('stepPickDepth: enter defaults to quick', async () => {
  const prompter = mockPrompter(['']);
  const result = await stepPickDepth(prompter);
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.equal(result.depth, 'quick');
});

test('stepPickDepth: user picks 2 → standard', async () => {
  const prompter = mockPrompter(['2']);
  const result = await stepPickDepth(prompter);
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.equal(result.depth, 'standard');
});

test('stepPickDepth: user picks 3 → deep', async () => {
  const prompter = mockPrompter(['3']);
  const result = await stepPickDepth(prompter);
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.equal(result.depth, 'deep');
});

// ── stepPickNodeTarget ────────────────────────────────────────────────────

test('stepPickNodeTarget: enter accepts the depth default without an override', async () => {
  const prompter = mockPrompter(['']);
  const result = await stepPickNodeTarget(prompter, 'quick');
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.equal(result.nodeTarget, undefined);
  assert.ok(prompter.lines.some((l) => l.includes('quick defaults to 6')));
});

test('stepPickNodeTarget: user can request an explicit node count', async () => {
  const prompter = mockPrompter(['7']);
  const result = await stepPickNodeTarget(prompter, 'standard');
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.equal(result.nodeTarget, 7);
});

test('stepPickNodeTarget: invalid count cancels the wizard', async () => {
  const prompter = mockPrompter(['31']);
  const result = await stepPickNodeTarget(prompter, 'deep');
  assert.equal(result.kind, 'cancelled');
  if (result.kind === 'cancelled') assert.equal(result.reason, 'invalid-node-count');
});

// ── stepPickModelProfile ──────────────────────────────────────────────────

test('stepPickModelProfile: enter accepts the default profile', async () => {
  const prompter = mockPrompter(['']);
  const result = await stepPickModelProfile(prompter);
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') assert.deepEqual(result.profile, {});
});

test('stepPickModelProfile: parses an explicit high-quality medium profile', async () => {
  const prompter = mockPrompter(['claude opus medium']);
  const result = await stepPickModelProfile(prompter);
  assert.equal(result.kind, 'picked');
  if (result.kind === 'picked') {
    assert.deepEqual(result.profile, { engine: 'claude', model: 'opus', effort: 'medium' });
  }
});

// ── runPossibleWizard orchestration ────────────────────────────────────────

test('runPossibleWizard: full happy path with saved set and seed default frame', async () => {
  const seed = fakeSeed({ id: 'seed-x', frameId: 'impact-effort' });
  const frames = [
    fakeFrame({ id: 'leverage-specificity', name: 'Leverage × Specificity' }),
    fakeFrame({ id: 'impact-effort', name: 'Impact × Effort' }),
  ];
  const deps: WizardDeps = {
    listSeeds: () => [seed],
    listRepos: () => ['/repo-a', '/repo-b'],
    listFrames: () => frames,
  };
  // Answers: seed pick (1), accept saved repos (enter), accept seed default frame (enter),
  //          accept quick depth (enter), accept depth default nodes (enter),
  //          accept default model profile (enter), confirm (enter).
  const prompter = mockPrompter(['1', '', '', '', '', '', '']);
  const result = await runPossibleWizard(prompter, deps);

  assert.equal(result.kind, 'ready');
  if (result.kind === 'ready') {
    assert.equal(result.plan.seedId, 'seed-x');
    assert.deepEqual(result.plan.repos, ['/repo-a', '/repo-b']);
    assert.equal(result.plan.frameId, 'impact-effort');
    assert.equal(result.plan.depth, 'quick');
    assert.equal(result.plan.nodeTarget, undefined);
    assert.equal(result.plan.effort, undefined);
  }
  assert.equal(prompter.remaining(), 0, 'all canned answers should have been consumed');
});

test('runPossibleWizard: empty seed store bails with no-seeds result and prints the strategy command', async () => {
  const prompter = mockPrompter(['1']); // pick search
  const result = await runPossibleWizard(prompter, {
    listSeeds: () => [],
    listRepos: () => [],
    listFrames: () => [fakeFrame()],
  });
  assert.equal(result.kind, 'no-seeds');
  if (result.kind === 'no-seeds') {
    assert.equal(result.strategy, 'search');
    assert.match(result.command, /ft seeds search/);
  }
  assert.ok(prompter.lines.some((l) => l.includes('Run this to gather your first seed')));
});

test('runPossibleWizard: user cancels at confirm → returns cancelled, no plan', async () => {
  const seed = fakeSeed();
  const deps: WizardDeps = {
    listSeeds: () => [seed],
    listRepos: () => ['/r1'],
    listFrames: () => [fakeFrame()],
  };
  // Answers: seed 1, accept repos, accept frame, quick, depth default nodes, default model, cancel with "n".
  const prompter = mockPrompter(['1', '', '', '', '', '', 'n']);
  const result = await runPossibleWizard(prompter, deps);
  assert.equal(result.kind, 'cancelled');
  if (result.kind === 'cancelled') assert.equal(result.reason, 'user-cancelled-at-confirm');
});

test('runPossibleWizard: quit at seed pick (non-empty store) short-circuits', async () => {
  const deps: WizardDeps = {
    listSeeds: () => [fakeSeed()],
    listRepos: () => ['/r1'],
    listFrames: () => [fakeFrame()],
  };
  const prompter = mockPrompter(['q']);
  const result = await runPossibleWizard(prompter, deps);
  assert.equal(result.kind, 'cancelled');
  if (result.kind === 'cancelled') assert.equal(result.reason, 'quit-at-seed-pick');
  assert.equal(prompter.remaining(), 0);
});

test('runPossibleWizard: quit at repos picker short-circuits', async () => {
  const deps: WizardDeps = {
    listSeeds: () => [fakeSeed()],
    listRepos: () => [], // no saved → wizard asks for paths
    listFrames: () => [fakeFrame()],
  };
  // Answers: seed 1, then quit at repos.
  const prompter = mockPrompter(['1', 'q']);
  const result = await runPossibleWizard(prompter, deps);
  assert.equal(result.kind, 'cancelled');
  if (result.kind === 'cancelled') assert.equal(result.reason, 'quit-at-repos-empty');
});

test('runPossibleWizard: quit at frame picker short-circuits', async () => {
  const deps: WizardDeps = {
    listSeeds: () => [fakeSeed()],
    listRepos: () => ['/r1'],
    listFrames: () => [fakeFrame()],
  };
  // Answers: seed 1, accept repos, quit at frame.
  const prompter = mockPrompter(['1', '', 'q']);
  const result = await runPossibleWizard(prompter, deps);
  assert.equal(result.kind, 'cancelled');
  if (result.kind === 'cancelled') assert.equal(result.reason, 'quit-at-frame');
});

test('runPossibleWizard: quit at depth picker short-circuits', async () => {
  const deps: WizardDeps = {
    listSeeds: () => [fakeSeed()],
    listRepos: () => ['/r1'],
    listFrames: () => [fakeFrame()],
  };
  // Answers: seed 1, accept repos, accept frame, quit at depth.
  const prompter = mockPrompter(['1', '', '', 'q']);
  const result = await runPossibleWizard(prompter, deps);
  assert.equal(result.kind, 'cancelled');
  if (result.kind === 'cancelled') assert.equal(result.reason, 'quit-at-depth');
});

test('runPossibleWizard: invalid seed pick (out of range) short-circuits', async () => {
  const deps: WizardDeps = {
    listSeeds: () => [fakeSeed(), fakeSeed({ id: 'seed-b' })],
    listRepos: () => ['/r1'],
    listFrames: () => [fakeFrame()],
  };
  const prompter = mockPrompter(['99']);
  const result = await runPossibleWizard(prompter, deps);
  assert.equal(result.kind, 'cancelled');
  if (result.kind === 'cancelled') assert.equal(result.reason, 'invalid-seed-pick');
});

test('runPossibleWizard: invalid frame pick short-circuits', async () => {
  const deps: WizardDeps = {
    listSeeds: () => [fakeSeed()],
    listRepos: () => ['/r1'],
    listFrames: () => [fakeFrame()],
  };
  // Answers: seed 1, accept repos, out-of-range frame pick.
  const prompter = mockPrompter(['1', '', '99']);
  const result = await runPossibleWizard(prompter, deps);
  assert.equal(result.kind, 'cancelled');
  if (result.kind === 'cancelled') assert.equal(result.reason, 'invalid-frame-pick');
});
