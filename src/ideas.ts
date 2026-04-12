import path from 'node:path';
import {
  listConsiderations,
  readConsideration,
  readArtifact,
} from './adjacent/librarian.js';
import { DEFAULT_FRAMES, getFrame } from './adjacent/frames.js';
import { runPipeline, renderTwoByTwo, renderDotList } from './adjacent/pipeline.js';
import type { Consideration, Dot, Artifact } from './adjacent/types.js';
import { resolveEngine } from './engine.js';

export interface IdeasRunOptions {
  seedArtifactId: string;
  repo: string;
  frameId?: string;
  depth?: 'quick' | 'standard' | 'deep';
  steering?: string;
  onProgress?: (message: string) => void;
}

export interface IdeasRunSummary {
  runId: string;
  frameId: string;
  frameName: string;
  dotCount: number;
  topDots: Dot[];
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
    '  ft ideas run --seed-artifact <id> --repo .',
    '  ft ideas grid latest',
    '  ft ideas dots latest',
    '  ft ideas prompt <dot-id>',
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
    return 'No ideas runs yet. Start with: ft ideas run --seed-artifact <id> --repo .';
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

export async function runIdeas(options: IdeasRunOptions): Promise<IdeasRunSummary> {
  const engine = await resolveEngine();
  const frame = getFrame(options.frameId ?? 'leverage-specificity');
  if (!frame) {
    throw new Error(`Unknown frame: ${options.frameId}`);
  }

  const result = await runPipeline({
    seedArtifactId: options.seedArtifactId,
    frame,
    repo: ideasRoot(options.repo),
    depth: options.depth ?? 'standard',
    steering: options.steering,
    engine,
    onProgress: (_stage, message) => options.onProgress?.(message),
  });

  const topDots = [...result.dots]
    .sort((a, b) => (b.axisAScore + b.axisBScore) - (a.axisAScore + a.axisBScore))
    .slice(0, 3);

  return {
    runId: result.consideration.id,
    frameId: frame.id,
    frameName: frame.name,
    dotCount: result.dots.length,
    topDots,
  };
}
