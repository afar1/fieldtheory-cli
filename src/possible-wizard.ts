/**
 * Interactive wizard for `ft possible` — the human-facing entry point to the
 * ideas pipeline. Walks the user through: seed → repos → frame → depth →
 * confirm → launch. Each step is a small function that takes an injectable
 * Prompter, so the orchestration is testable without touching real stdin.
 *
 * The wizard produces a WizardPlan, which the caller turns into a runIdeas
 * call. The wizard never imports runIdeas itself — that keeps the file free
 * of LLM-pipeline dependencies and makes the step logic pure.
 */

import type { IdeasSeed } from './ideas-seeds.js';
import type { Frame } from './adjacent/types.js';

/**
 * Minimal interface the wizard needs from a prompter. The prod implementation
 * wraps `promptText` from src/prompt.ts; tests substitute an in-memory
 * queue that returns canned answers.
 */
export interface Prompter {
  /** Ask a question and return the user's trimmed answer. Throws on cancel. */
  ask(question: string): Promise<string>;
  /** Write a line to the output the user sees (stderr in prod). */
  write(line: string): void;
}

/** The plan the wizard builds and the caller executes. */
export interface WizardPlan {
  seedId: string;
  repos: string[];
  frameId: string;
  depth: 'quick' | 'standard' | 'deep';
}

/** Result shape for the overall wizard flow. */
export type WizardResult =
  | { kind: 'ready'; plan: WizardPlan }
  | { kind: 'no-seeds'; strategy: SeedStrategyHint; command: string }
  | { kind: 'cancelled'; reason: string };

/** What the empty-seed state hints at. */
export type SeedStrategyHint = 'search' | 'recent' | 'random';

/** Dependencies the wizard reads from the environment. */
export interface WizardDeps {
  listSeeds(): IdeasSeed[];
  listRepos(): string[];
  listFrames(): Frame[];
}

// ── Step 1: pick a seed ────────────────────────────────────────────────────

const SEED_STRATEGY_HINTS: Array<{
  key: SeedStrategyHint;
  label: string;
  description: string;
  command: string;
}> = [
  {
    key: 'search',
    label: 'search',
    description: 'FTS-driven pool of bookmarks matching a query',
    command: 'ft seeds search "<query>" --days 180 --limit 8 --create',
  },
  {
    key: 'recent',
    label: 'recent',
    description: 'Most-recently-bookmarked pool over the last N days',
    command: 'ft seeds recent --days 30 --limit 8 --create',
  },
  {
    key: 'random',
    label: 'random',
    description: 'Mini-game: pick a random word-pair, model clusters bookmarks',
    command: 'ft seeds random --pick "<phrase>" --mode model --create',
  },
];

export async function stepPickSeed(
  prompter: Prompter,
  deps: Pick<WizardDeps, 'listSeeds'>,
): Promise<
  | { kind: 'picked'; seed: IdeasSeed }
  | { kind: 'empty'; strategy: SeedStrategyHint; command: string }
  | { kind: 'cancelled'; reason: string }
> {
  const seeds = deps.listSeeds();

  if (seeds.length === 0) {
    prompter.write('');
    prompter.write('No saved seeds yet. Seeds are groups of bookmarks applied to a repo.');
    prompter.write('Pick a strategy to gather your first seed:');
    prompter.write('');
    for (const [idx, hint] of SEED_STRATEGY_HINTS.entries()) {
      prompter.write(`  ${idx + 1}) ${hint.label.padEnd(8)} ${hint.description}`);
    }
    prompter.write('');
    const answer = await prompter.ask('Pick a strategy [1-3] (or `q` to quit): ');
    if (answer === 'q' || answer === 'Q') {
      return { kind: 'cancelled', reason: 'quit-at-seed-strategy' };
    }
    const pick = parseIndex(answer, SEED_STRATEGY_HINTS.length);
    if (pick === null) {
      return { kind: 'cancelled', reason: 'invalid-strategy-pick' };
    }
    const hint = SEED_STRATEGY_HINTS[pick]!;
    return { kind: 'empty', strategy: hint.key, command: hint.command };
  }

  prompter.write('');
  prompter.write(`Pick a seed (${seeds.length} saved):`);
  prompter.write('');
  for (const [idx, seed] of seeds.entries()) {
    const count = seed.artifactIds.length;
    const frame = seed.frameId ? `  frame: ${seed.frameId}` : '';
    const lastUsed = seed.lastUsedAt ? `  last used: ${seed.lastUsedAt.slice(0, 10)}` : '';
    prompter.write(`  ${(idx + 1).toString().padStart(2)}) ${seed.id}  ${count} artifact${count === 1 ? '' : 's'}${frame}${lastUsed}`);
    prompter.write(`      ${seed.title}`);
  }
  prompter.write('');
  const answer = await prompter.ask(`Pick a seed [1-${seeds.length}] (or \`q\` to quit): `);
  if (answer === 'q' || answer === 'Q') {
    return { kind: 'cancelled', reason: 'quit-at-seed-pick' };
  }
  const pick = parseIndex(answer, seeds.length);
  if (pick === null) {
    return { kind: 'cancelled', reason: 'invalid-seed-pick' };
  }
  return { kind: 'picked', seed: seeds[pick]! };
}

// ── Step 2: pick repos ─────────────────────────────────────────────────────

export async function stepPickRepos(
  prompter: Prompter,
  deps: Pick<WizardDeps, 'listRepos'>,
): Promise<
  | { kind: 'picked'; repos: string[] }
  | { kind: 'cancelled'; reason: string }
> {
  const saved = deps.listRepos();

  prompter.write('');
  if (saved.length > 0) {
    prompter.write(`Saved repo set (${saved.length}):`);
    for (const r of saved) prompter.write(`  - ${r}`);
    prompter.write('');
    const answer = await prompter.ask(
      `Use all saved repos? [Y/n] (or enter space-separated paths): `,
    );
    if (answer === '' || answer.toLowerCase() === 'y') {
      return { kind: 'picked', repos: saved };
    }
    if (answer.toLowerCase() === 'n') {
      const override = await prompter.ask('Enter space-separated repo paths: ');
      const repos = parseRepoList(override);
      if (repos.length === 0) {
        return { kind: 'cancelled', reason: 'empty-repo-override' };
      }
      return { kind: 'picked', repos };
    }
    if (answer.toLowerCase() === 'q') {
      return { kind: 'cancelled', reason: 'quit-at-repos' };
    }
    // Any other non-empty answer is treated as a direct space-separated path
    // list. Lets users skip the "n, then type" two-step.
    const repos = parseRepoList(answer);
    if (repos.length === 0) {
      return { kind: 'cancelled', reason: 'invalid-repo-answer' };
    }
    return { kind: 'picked', repos };
  }

  prompter.write('No saved repos. Save some with `ft repos add <path>`, or enter them now.');
  const answer = await prompter.ask('Space-separated repo paths (or `q` to quit): ');
  if (answer === 'q' || answer === 'Q') {
    return { kind: 'cancelled', reason: 'quit-at-repos-empty' };
  }
  const repos = parseRepoList(answer);
  if (repos.length === 0) {
    return { kind: 'cancelled', reason: 'empty-repo-answer' };
  }
  return { kind: 'picked', repos };
}

// ── Step 3: pick a frame ───────────────────────────────────────────────────

export async function stepPickFrame(
  prompter: Prompter,
  deps: Pick<WizardDeps, 'listFrames'>,
  seedDefault: string | undefined,
): Promise<
  | { kind: 'picked'; frameId: string }
  | { kind: 'cancelled'; reason: string }
> {
  const frames = deps.listFrames();

  prompter.write('');
  prompter.write(`Pick a frame (${frames.length} available):`);
  prompter.write('');
  const seedDefaultIdx = seedDefault ? frames.findIndex((f) => f.id === seedDefault) : -1;
  for (const [idx, frame] of frames.entries()) {
    const marker = idx === seedDefaultIdx ? ' (seed default)' : '';
    prompter.write(`  ${(idx + 1).toString().padStart(2)}) ${frame.id.padEnd(28)} ${frame.name}${marker}`);
  }
  prompter.write('');

  const prompt = seedDefaultIdx >= 0
    ? `Pick a frame [1-${frames.length}], or press enter for ${seedDefault}: `
    : `Pick a frame [1-${frames.length}]: `;
  const answer = await prompter.ask(prompt);
  if (answer === 'q' || answer === 'Q') {
    return { kind: 'cancelled', reason: 'quit-at-frame' };
  }
  if (answer === '') {
    if (seedDefaultIdx >= 0) {
      return { kind: 'picked', frameId: frames[seedDefaultIdx]!.id };
    }
    // Fall through to the default-default (first built-in frame) to avoid
    // requiring a choice for the impatient.
    return { kind: 'picked', frameId: frames[0]!.id };
  }
  const pick = parseIndex(answer, frames.length);
  if (pick === null) {
    return { kind: 'cancelled', reason: 'invalid-frame-pick' };
  }
  return { kind: 'picked', frameId: frames[pick]!.id };
}

// ── Step 4: pick depth ─────────────────────────────────────────────────────

interface DepthOption {
  key: 'quick' | 'standard' | 'deep';
  label: string;
  estimate: string;
}

const DEPTH_OPTIONS: DepthOption[] = [
  { key: 'quick',    label: 'quick',    estimate: '~3-5 min per repo, ~3-5 ideas per repo' },
  { key: 'standard', label: 'standard', estimate: '~8-12 min per repo, ~6-8 ideas per repo' },
  { key: 'deep',     label: 'deep',     estimate: '~20+ min per repo, ~10+ ideas per repo' },
];

export async function stepPickDepth(
  prompter: Prompter,
): Promise<
  | { kind: 'picked'; depth: 'quick' | 'standard' | 'deep' }
  | { kind: 'cancelled'; reason: string }
> {
  prompter.write('');
  prompter.write('Pick a depth:');
  prompter.write('');
  for (const [idx, opt] of DEPTH_OPTIONS.entries()) {
    prompter.write(`  ${idx + 1}) ${opt.label.padEnd(9)} ${opt.estimate}`);
  }
  prompter.write('');
  const answer = await prompter.ask('Pick a depth [1-3] (or press enter for quick): ');
  if (answer === 'q' || answer === 'Q') {
    return { kind: 'cancelled', reason: 'quit-at-depth' };
  }
  if (answer === '') {
    return { kind: 'picked', depth: 'quick' };
  }
  const pick = parseIndex(answer, DEPTH_OPTIONS.length);
  if (pick === null) {
    return { kind: 'cancelled', reason: 'invalid-depth-pick' };
  }
  return { kind: 'picked', depth: DEPTH_OPTIONS[pick]!.key };
}

// ── Step 5: confirm ────────────────────────────────────────────────────────

export async function stepConfirm(
  prompter: Prompter,
  plan: WizardPlan,
  seedTitle: string,
  frameName: string,
): Promise<'go' | 'cancel'> {
  prompter.write('');
  prompter.write('Plan:');
  prompter.write(`  seed:  ${plan.seedId}  ${seedTitle}`);
  prompter.write(`  repos: ${plan.repos.length}`);
  for (const repo of plan.repos) prompter.write(`    - ${repo}`);
  prompter.write(`  frame: ${plan.frameId}  (${frameName})`);
  prompter.write(`  depth: ${plan.depth}`);
  prompter.write('');
  const answer = await prompter.ask('Launch? [Y/n]: ');
  if (answer === '' || answer.toLowerCase() === 'y') return 'go';
  return 'cancel';
}

// ── Orchestration ──────────────────────────────────────────────────────────

export async function runPossibleWizard(
  prompter: Prompter,
  deps: WizardDeps,
): Promise<WizardResult> {
  prompter.write('');
  prompter.write('ft possible — walk a bookmark seed through to a scored 2x2 grid');
  prompter.write('(press `q` at any prompt to quit without launching)');

  const seedResult = await stepPickSeed(prompter, deps);
  if (seedResult.kind === 'cancelled') {
    return { kind: 'cancelled', reason: seedResult.reason };
  }
  if (seedResult.kind === 'empty') {
    prompter.write('');
    prompter.write('Run this to gather your first seed:');
    prompter.write(`  ${seedResult.command}`);
    prompter.write('');
    prompter.write('Then run `ft possible` again to continue from here.');
    return { kind: 'no-seeds', strategy: seedResult.strategy, command: seedResult.command };
  }
  const seed = seedResult.seed;

  const reposResult = await stepPickRepos(prompter, deps);
  if (reposResult.kind === 'cancelled') {
    return { kind: 'cancelled', reason: reposResult.reason };
  }

  const frameResult = await stepPickFrame(prompter, deps, seed.frameId);
  if (frameResult.kind === 'cancelled') {
    return { kind: 'cancelled', reason: frameResult.reason };
  }

  const depthResult = await stepPickDepth(prompter);
  if (depthResult.kind === 'cancelled') {
    return { kind: 'cancelled', reason: depthResult.reason };
  }

  const plan: WizardPlan = {
    seedId: seed.id,
    repos: reposResult.repos,
    frameId: frameResult.frameId,
    depth: depthResult.depth,
  };

  const frames = deps.listFrames();
  const frameName = frames.find((f) => f.id === plan.frameId)?.name ?? plan.frameId;
  const confirmation = await stepConfirm(prompter, plan, seed.title, frameName);
  if (confirmation === 'cancel') {
    return { kind: 'cancelled', reason: 'user-cancelled-at-confirm' };
  }

  return { kind: 'ready', plan };
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Parse a 1-based numeric answer into a 0-based array index. Returns null
 * if the answer is not a positive integer in range.
 */
export function parseIndex(answer: string, length: number): number | null {
  const n = Number.parseInt(answer, 10);
  if (!Number.isFinite(n) || n < 1 || n > length) return null;
  return n - 1;
}

/** Split a space-separated repo list into a trimmed, non-empty string array. */
export function parseRepoList(answer: string): string[] {
  return answer.split(/\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}
