import path from 'node:path';
import crypto from 'node:crypto';
import {
  listConsiderations,
  readConsideration,
  readArtifact,
  writeArtifact,
} from './adjacent/librarian.js';
import { linkIdeasSeedToRun, readIdeasSeed, touchIdeasSeed } from './ideas-seeds.js';
import { writeIdeasBatchMd, writeIdeasNodeMds, writeIdeasRunMd } from './ideas-files.js';
import { refreshIdeasDerivedState } from './ideas-derived.js';
import { DEFAULT_FRAMES } from './adjacent/frames.js';
import { getFrame } from './frames-registry.js';
import { runPipeline, renderTwoByTwo, renderDotList } from './adjacent/pipeline.js';
import type { Consideration, Dot, Artifact, Frame } from './adjacent/types.js';
import { resolveEngine, type ResolvedEngine } from './engine.js';

export interface IdeasRunOptions {
  /** Run against an explicit list of seed artifacts (bypasses any saved seed). */
  seedArtifactIds?: string[];
  /** Run against a saved seed by id; the seed's artifact group is passed through to the pipeline. */
  seedId?: string;
  /** One or more repo paths. Each repo gets its own consideration; runs >1 produce a batch summary. */
  repos: string[];
  frameId?: string;
  depth?: 'quick' | 'standard' | 'deep';
  steering?: string;
  onProgress?: (message: string) => void;
}

export interface IdeasRunSummary {
  /** All consideration ids produced by this invocation, in repo order. */
  runIds: string[];
  /** Set only when runIds.length > 1. */
  batchId?: string;
  frameId: string;
  frameName: string;
  /** Total scored dots across every run in this invocation. */
  dotCount: number;
  /** Top dots across every run, with the repo each came from. */
  topDots: Array<Dot & { repo: string }>;
}

export interface RepoRun {
  repo: string;
  runId: string;
}

export interface DotEntry {
  runId: string;
  repo: string;
  dotArtifactId: string;
  dot: Dot;
}

export interface IdeasBatchSummary {
  id: string;
  createdAt: string;
  seedId?: string;
  seedArtifactIds: string[];
  frameId: string;
  frameName: string;
  depth: 'quick' | 'standard' | 'deep';
  steering?: string;
  /** Single source of truth for the repo→run pairing. The md renderer derives the parallel YAML arrays from this. */
  repoRuns: RepoRun[];
  totalDotCount: number;
  topDots: DotEntry[];
}

/**
 * Sort scored dots from any number of runs by combined axis A + B score and
 * return the top `limit`. Pure helper so the aggregation can be tested in
 * isolation from the LLM pipeline.
 */
export function aggregateTopDots(entries: DotEntry[], limit: number): DotEntry[] {
  if (limit <= 0) return [];
  return [...entries]
    .sort((a, b) => (b.dot.axisAScore + b.dot.axisBScore) - (a.dot.axisAScore + a.dot.axisBScore))
    .slice(0, limit);
}

function ideasRoot(repo?: string): string {
  return repo ? path.resolve(repo) : process.cwd();
}

export function formatIdeasIntro(): string {
  const frameNames = DEFAULT_FRAMES.map((f) => f.id).join(', ');
  return [
    'Ideas turns a seed into a structured exploration against a repo.',
    '',
    'What happens in a run:',
    '  1. read the seed and extract the core idea',
    '  2. scan your repo for relevant surfaces',
    '  3. generate candidate directions',
    '  4. critique them',
    '  5. score them onto a 2x2 grid',
    '',
    'Runtime truth:',
    '  - runs are orchestrated from your local machine',
    '  - keep your laptop awake while longer debates are running',
    '  - results are saved locally so you can reopen them later',
    '',
    'Useful commands:',
    '  ft ideas explain',
    '  ft ideas run --seed <seed-id> --repo .',
    '  ft ideas grid latest',
    '  ft ideas dots latest',
    '  ft ideas prompt <node-id>',
    '',
    `Available frames: ${frameNames}`,
  ].join('\n');
}

export function listIdeaRuns(): Consideration[] {
  return listConsiderations();
}

export function resolveIdeaRun(target?: string): Consideration | null {
  const runs = listIdeaRuns();
  if (!target || target === 'latest') return runs[0] ?? null;
  return readConsideration(target);
}

export function dotsFromRun(run: Consideration): Array<{ artifact: Artifact; dot: Dot }> {
  return run.outputIds
    .map((id) => readArtifact(id))
    .filter((artifact): artifact is Artifact => Boolean(artifact && artifact.type === 'dot'))
    .map((artifact) => ({ artifact, dot: artifact.metadata as unknown as Dot }));
}

export function formatRunSummary(run: Consideration): string {
  const dots = dotsFromRun(run);
  const top = [...dots]
    .sort((a, b) => (b.dot.axisAScore + b.dot.axisBScore) - (a.dot.axisAScore + a.dot.axisBScore))
    .slice(0, 3);

  const lines = [
    `Ideas run: ${run.id}`,
    `  repo: ${run.repo}`,
    `  frame: ${run.frame.name} (${run.frame.id})`,
    `  depth: ${run.depth}`,
    `  created: ${run.createdAt}`,
    `  completed stages: ${run.completedStages.join(', ') || 'none'}`,
    `  ideas: ${dots.length}`,
  ];

  if (run.steering) lines.push(`  steering: ${run.steering}`);
  if (top.length > 0) {
    lines.push('', 'Top ideas:');
    for (const { artifact, dot } of top) {
      lines.push(`  - ${artifact.id}: ${dot.title}  [A:${dot.axisAScore} B:${dot.axisBScore}]`);
    }
  }

  return lines.join('\n');
}

export function formatRunList(runs: Consideration[]): string {
  if (runs.length === 0) {
    return 'No ideas runs yet. Start with: ft seeds list, then ft ideas run --seed <seed-id> --repo .';
  }

  return runs
    .slice(0, 20)
    .map((run) => {
      const dotCount = dotsFromRun(run).length;
      return `${run.id}  ${run.frame.id}  ${run.depth}  ${dotCount} ideas  ${path.basename(run.repo)}  ${run.createdAt}`;
    })
    .join('\n');
}

export function renderRunGrid(target?: string): string {
  const run = resolveIdeaRun(target);
  if (!run) throw new Error('No ideas run found.');
  const dots = dotsFromRun(run).map(({ dot }) => dot);
  if (dots.length === 0) throw new Error(`Run ${run.id} has no scored ideas yet.`);
  return renderTwoByTwo(dots, run.frame);
}

export function renderRunDots(target?: string): string {
  const run = resolveIdeaRun(target);
  if (!run) throw new Error('No ideas run found.');
  const dots = dotsFromRun(run).map(({ dot }) => dot);
  if (dots.length === 0) throw new Error(`Run ${run.id} has no scored ideas yet.`);
  return renderDotList(dots, run.frame);
}

export function getIdeaPrompt(dotId: string): string {
  const artifact = readArtifact(dotId);
  if (!artifact || artifact.type !== 'dot') {
    throw new Error(`Dot not found: ${dotId}`);
  }
  const dot = artifact.metadata as unknown as Dot;
  return dot.exportablePrompt || artifact.content;
}

function generateBatchId(): string {
  return `batch-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * Frame precedence for a run: explicit --frame wins over a seed-pinned frame,
 * which in turn wins over the built-in default. Empty strings are treated as
 * "not provided" so callers that round-trip through stringly-typed layers do
 * not accidentally bypass a seed-pinned frame with a blank explicit value.
 * Exported so tests can pin the rule without having to drive the pipeline.
 */
export function resolveFrameIdForRun(
  explicit: string | undefined,
  seedFrameId: string | undefined,
): string {
  if (explicit && explicit.length > 0) return explicit;
  if (seedFrameId && seedFrameId.length > 0) return seedFrameId;
  return 'leverage-specificity';
}

/**
 * Resolve a frame id against the combined built-in + user registry. Throws
 * with a descriptive message if the resolved id is unknown. One call site in
 * runIdeas uses this; keeping the wrapper so runIdeas stays orchestration-only.
 */
function resolveFrameForRun(
  explicit: string | undefined,
  seedFrameId: string | undefined,
): Frame {
  const id = resolveFrameIdForRun(explicit, seedFrameId);
  const frame = getFrame(id);
  if (!frame) {
    throw new Error(`Unknown frame: ${id}`);
  }
  return frame;
}

/**
 * Resolve the seed artifact group for a run. Accepts either an explicit list
 * of artifact ids (the `--seed-artifact <id...>` path) or a saved seed id
 * (the `--seed <seed-id>` path). In the saved-seed case, the saved seed's
 * lastUsedAt is touched as a side-effect so the seed listing reflects usage.
 *
 * Exported for testing: runIdeas itself needs the LLM pipeline to exercise,
 * but seed resolution is pure-ish (only touches the disk store) and worth
 * pinning in isolation.
 */
export async function resolveSeedForRun(
  options: Pick<IdeasRunOptions, 'seedArtifactIds' | 'seedId'>,
): Promise<{ seedArtifactIds: string[]; seedFrameId: string | undefined }> {
  if (options.seedArtifactIds && options.seedArtifactIds.length > 0) {
    return { seedArtifactIds: options.seedArtifactIds, seedFrameId: undefined };
  }

  if (!options.seedId) {
    throw new Error('Provide either --seed-artifact <id...> or --seed <seed-id>.');
  }

  const seed = readIdeasSeed(options.seedId);
  if (!seed) throw new Error(`Seed not found: ${options.seedId}`);
  if (seed.artifactIds.length === 0) throw new Error(`Seed has no artifacts: ${options.seedId}`);

  await touchIdeasSeed(seed.id);
  return { seedArtifactIds: seed.artifactIds, seedFrameId: seed.frameId };
}

/**
 * Shared context for every per-repo iteration of a run. Frozen before the
 * loop starts so no stage can accidentally mutate options mid-batch.
 */
interface RunContext {
  engine: ResolvedEngine;
  frame: Frame;
  seedArtifactIds: string[];
  seedId: string | undefined;
  depth: 'quick' | 'standard' | 'deep';
  steering: string | undefined;
  onProgress: ((message: string) => void) | undefined;
}

/**
 * Execute one repo's worth of the pipeline: runPipeline → write run md →
 * write node mds → link the seed (if saved) → convert the dots into the
 * cross-repo DotEntry shape that aggregateTopDots expects. Kept as its own
 * function so the batch loop in runIdeas is a one-liner instead of a
 * 40-line inline block.
 */
async function runOneRepo(
  ctx: RunContext,
  repo: string,
  batched: boolean,
  repoIdx: number,
  repoTotal: number,
): Promise<{ runId: string; resolvedRepo: string; dotEntries: DotEntry[]; dotCount: number }> {
  const resolvedRepo = ideasRoot(repo);
  if (batched) {
    ctx.onProgress?.(`[repo ${repoIdx + 1}/${repoTotal}] ${resolvedRepo}`);
  }

  const result = await runPipeline({
    seedArtifactIds: ctx.seedArtifactIds,
    frame: ctx.frame,
    repo: resolvedRepo,
    depth: ctx.depth,
    steering: ctx.steering,
    engine: ctx.engine,
    onProgress: (_stage, message) => ctx.onProgress?.(message),
  });

  await writeIdeasRunMd(result.consideration);
  await writeIdeasNodeMds(result.consideration);

  if (ctx.seedId) {
    await linkIdeasSeedToRun({
      seedId: ctx.seedId,
      runId: result.consideration.id,
      nodeIds: result.dotArtifacts.map((artifact) => artifact.id),
    });
  }

  const dotEntries: DotEntry[] = result.dots.map((dot, i) => ({
    runId: result.consideration.id,
    repo: resolvedRepo,
    dotArtifactId: result.dotArtifacts[i]!.id,
    dot,
  }));

  return {
    runId: result.consideration.id,
    resolvedRepo,
    dotEntries,
    dotCount: result.dots.length,
  };
}

export async function runIdeas(options: IdeasRunOptions): Promise<IdeasRunSummary> {
  if (!Array.isArray(options.repos) || options.repos.length === 0) {
    throw new Error('Provide at least one repo via repos: [...]');
  }

  const engine = await resolveEngine();
  const { seedArtifactIds, seedFrameId } = await resolveSeedForRun(options);
  const frame = resolveFrameForRun(options.frameId, seedFrameId);

  const ctx: RunContext = {
    engine,
    frame,
    seedArtifactIds,
    seedId: options.seedId,
    depth: options.depth ?? 'standard',
    steering: options.steering,
    onProgress: options.onProgress,
  };

  const batched = options.repos.length > 1;
  const repoRuns: RepoRun[] = [];
  const allDotEntries: DotEntry[] = [];
  let totalDotCount = 0;

  for (const [idx, repo] of options.repos.entries()) {
    const perRepo = await runOneRepo(ctx, repo, batched, idx, options.repos.length);
    repoRuns.push({ repo: perRepo.resolvedRepo, runId: perRepo.runId });
    allDotEntries.push(...perRepo.dotEntries);
    totalDotCount += perRepo.dotCount;
  }

  const topDotsAggregated = aggregateTopDots(allDotEntries, 5);

  let batchId: string | undefined;
  if (repoRuns.length > 1) {
    batchId = await persistBatchSummary({
      repoRuns,
      seedId: ctx.seedId,
      seedArtifactIds: ctx.seedArtifactIds,
      frame: ctx.frame,
      depth: ctx.depth,
      steering: ctx.steering,
      totalDotCount,
      topDots: topDotsAggregated,
    });
  }

  await refreshIdeasDerivedState();

  return {
    runIds: repoRuns.map((r) => r.runId),
    batchId,
    frameId: frame.id,
    frameName: frame.name,
    dotCount: totalDotCount,
    topDots: topDotsAggregated.map((entry) => ({ ...entry.dot, repo: entry.repo })),
  };
}

async function persistBatchSummary(input: {
  repoRuns: RepoRun[];
  seedId?: string;
  seedArtifactIds: string[];
  frame: Frame;
  depth: 'quick' | 'standard' | 'deep';
  steering?: string;
  totalDotCount: number;
  topDots: DotEntry[];
}): Promise<string> {
  const id = generateBatchId();
  const createdAt = new Date().toISOString();

  const summary: IdeasBatchSummary = {
    id,
    createdAt,
    seedId: input.seedId,
    seedArtifactIds: input.seedArtifactIds,
    frameId: input.frame.id,
    frameName: input.frame.name,
    depth: input.depth,
    steering: input.steering,
    repoRuns: input.repoRuns,
    totalDotCount: input.totalDotCount,
    topDots: input.topDots,
  };

  writeArtifact({
    type: 'batch_summary',
    source: 'adjacent',
    provenance: {
      createdAt,
      producer: 'system',
      inputIds: input.repoRuns.map((r) => r.runId),
      promptVersion: 'ideas-batch-summary-v1',
    },
    content: JSON.stringify(summary, null, 2),
    metadata: summary as unknown as Record<string, unknown>,
  });

  await writeIdeasBatchMd(summary);
  return id;
}
