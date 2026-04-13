/**
 * Adjacent expansion pipeline — 5 stages, fully persisted.
 *
 * Each stage reads its inputs from prior artifacts and writes its outputs
 * to the librarian before advancing. The pipeline is restartable: if
 * interrupted, it resumes from the last completed stage.
 *
 *   Stage 1: read     — seed → seed_brief
 *   Stage 2: survey   — seed_brief + repo → surface_map
 *   Stage 3: generate — seed_brief + surface_map + frame → candidate_list
 *   Stage 4: critique — candidate_list → critique
 *   Stage 5: score    — surviving candidates → dot artifacts (one batch LLM call)
 */

import crypto from 'node:crypto';
import { invokeEngineAsync } from '../engine.js';
import type { ResolvedEngine } from '../engine.js';
import {
  writeArtifact,
  readArtifact,
  writeConsideration,
  readConsideration,
  readSeedBriefCache,
  writeSeedBriefCache,
  hashSteering,
  readResultCache,
  writeResultCache,
} from './librarian.js';
import type { Artifact, Consideration, Frame, Dot, PipelineStage, ConsiderationDepth } from './types.js';
import {
  buildReadPrompt,
  buildSurveyPrompt,
  buildGeneratePrompt,
  buildCritiquePrompt,
  buildBatchScorePrompt,
  buildExportablePrompt,
  parseSeedBrief,
  parseSurfaces,
  parseCandidates,
  parseCritiques,
  parseBatchScores,
  DEPTH_BUDGETS,
} from './prompts.js';
import type {
  SeedBriefParsed,
  SurfaceEntry,
  CandidateRaw,
  CritiqueEntry,
  ScoredCandidate,
  Depth,
  DepthBudget,
} from './prompts.js';
import { buildRepoSnapshot } from './repo-index.js';

// ── Progress reporting ────────────────────────────────────────────────────────

export type ProgressCallback = (stage: PipelineStage | 'init' | 'done', message: string) => void;

// ── Pipeline options ──────────────────────────────────────────────────────────

export interface RunPipelineOptions {
  /** One or more seed artifact ids. The pipeline reads them all and synthesizes a single seed brief across them. */
  seedArtifactIds: string[];
  frame: Frame;
  repo: string;
  depth: ConsiderationDepth;
  steering?: string;
  parentId?: string;
  engine: ResolvedEngine;
  onProgress?: ProgressCallback;
}

// ── Internal context (replaces 7-11 positional parameters per stage fn) ───────

interface PipelineContext {
  engine: ResolvedEngine;
  budget: DepthBudget;
  frame: Frame;
  steering: string | undefined;
  parentId: string | undefined;
  onProgress: ProgressCallback | undefined;
}

function emit(ctx: PipelineContext, stage: PipelineStage | 'init' | 'done', msg: string): void {
  ctx.onProgress?.(stage, msg);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function generateConsiderationId(): string {
  return `adj-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeProvenance(stage: PipelineStage, engine: ResolvedEngine, inputIds: string[]) {
  return {
    createdAt: nowIso(),
    producer: 'llm' as const,
    model: engine.name,
    inputIds,
    promptVersion: `adjacent-pipeline-v1/${stage}`,
  };
}

// ── Stage 1: Read ─────────────────────────────────────────────────────────────

async function stageRead(
  seedArtifacts: Artifact[],
  ctx: PipelineContext,
): Promise<{ briefArtifact: Artifact; brief: SeedBriefParsed }> {
  if (seedArtifacts.length === 0) {
    throw new Error('stageRead: at least one seed artifact is required.');
  }

  const seedIds = seedArtifacts.map((a) => a.id);
  const label = seedArtifacts.length === 1
    ? 'Reading seed...'
    : `Reading ${seedArtifacts.length} seed items...`;
  emit(ctx, 'read', label);

  const cached = readSeedBriefCache(seedIds, ctx.engine.name) as SeedBriefParsed | null;
  if (cached) {
    emit(ctx, 'read', 'Seed brief loaded from cache.');
    const briefArtifact = writeArtifact({
      type: 'seed_brief',
      source: 'adjacent',
      provenance: makeProvenance('read', ctx.engine, seedIds),
      content: JSON.stringify(cached, null, 2),
      metadata: cached as unknown as Record<string, unknown>,
    });
    return { briefArtifact, brief: cached };
  }

  const prompt = buildReadPrompt({
    seedItems: seedArtifacts.map((a) => ({ content: a.content, type: a.type })),
  });
  const raw = await invokeEngineAsync(ctx.engine, prompt, { timeout: ctx.budget.timeoutMs });
  const brief = parseSeedBrief(raw);

  writeSeedBriefCache(seedIds, ctx.engine.name, brief);

  const briefArtifact = writeArtifact({
    type: 'seed_brief',
    source: 'adjacent',
    provenance: makeProvenance('read', ctx.engine, seedIds),
    content: JSON.stringify(brief, null, 2),
    metadata: brief as unknown as Record<string, unknown>,
  });

  emit(ctx, 'read', `Brief: "${brief.domain}" — ${brief.keyClaim.slice(0, 60)}...`);
  return { briefArtifact, brief };
}

// ── Stage 2: Survey ───────────────────────────────────────────────────────────

async function stageSurvey(
  briefArtifact: Artifact,
  brief: SeedBriefParsed,
  repo: string,
  ctx: PipelineContext,
): Promise<{ surfaceArtifact: Artifact; surfaces: SurfaceEntry[]; gitHead: string }> {
  emit(ctx, 'survey', `Scanning repo (${repo.split('/').pop()})...`);

  const snapshot = await buildRepoSnapshot(repo, { maxFiles: ctx.budget.surveyFileLimit });
  const cacheNote = snapshot.fromCache ? ' (repo index from cache)' : '';
  emit(ctx, 'survey', `Repo indexed: ${snapshot.fileTree.length} files${cacheNote}`);

  const prompt = buildSurveyPrompt({
    seedBrief: brief,
    repoTree: snapshot.treeText,
    recentFiles: snapshot.recentFiles,
    budget: ctx.budget,
  });

  const raw = await invokeEngineAsync(ctx.engine, prompt, { timeout: ctx.budget.timeoutMs });
  const surfaces = parseSurfaces(raw);

  const surfaceArtifact = writeArtifact({
    type: 'surface_map',
    source: 'adjacent',
    provenance: makeProvenance('survey', ctx.engine, [briefArtifact.id]),
    content: surfaces.map((s) => `## ${s.path}\n${s.description}\n_${s.relevance}_`).join('\n\n'),
    metadata: { surfaces, repo, gitHead: snapshot.gitHead } as unknown as Record<string, unknown>,
  });

  emit(ctx, 'survey', `Found ${surfaces.length} relevant surfaces.`);
  // Return gitHead directly — callers shouldn't reach into artifact metadata for it
  return { surfaceArtifact, surfaces, gitHead: snapshot.gitHead };
}

// ── Stage 3: Generate ─────────────────────────────────────────────────────────

async function stageGenerate(
  briefArtifact: Artifact,
  surfaceArtifact: Artifact,
  brief: SeedBriefParsed,
  surfaces: SurfaceEntry[],
  gitHead: string,
  ctx: PipelineContext,
): Promise<{ candidateArtifact: Artifact; candidates: CandidateRaw[] }> {
  emit(ctx, 'generate', `Generating ${ctx.budget.candidateTarget} candidates...`);

  const steeringHash = hashSteering(ctx.steering);

  const cached = readResultCache(briefArtifact.id, ctx.frame.id, ctx.steering, gitHead) as { candidates: CandidateRaw[] } | null;
  if (cached?.candidates) {
    emit(ctx, 'generate', `${cached.candidates.length} candidates loaded from cache.`);
    const candidateArtifact = writeArtifact({
      type: 'candidate_list',
      source: 'adjacent',
      provenance: makeProvenance('generate', ctx.engine, [briefArtifact.id, surfaceArtifact.id]),
      content: cached.candidates.map((c, i) => `## ${i + 1}. ${c.title}\n${c.summary}\n\nRationale: ${c.rationale}`).join('\n\n'),
      metadata: { candidates: cached.candidates, frameId: ctx.frame.id, steeringHash } as unknown as Record<string, unknown>,
    });
    return { candidateArtifact, candidates: cached.candidates };
  }

  // Build archive context from parent consideration's prior dot titles
  let archiveContext: string | undefined;
  if (ctx.parentId) {
    const parent = readConsideration(ctx.parentId);
    if (parent) {
      const priorDotTitles = parent.outputIds
        .map((id) => readArtifact(id))
        .filter((a) => a?.type === 'dot')
        .slice(0, 5)
        .map((a) => `- ${(a!.metadata as unknown as Dot).title ?? ''}`);
      if (priorDotTitles.length > 0) archiveContext = priorDotTitles.join('\n');
    }
  }

  const prompt = buildGeneratePrompt({
    seedBrief: brief,
    surfaces,
    frame: ctx.frame,
    steering: ctx.steering,
    archiveContext,
    budget: ctx.budget,
  });

  const raw = await invokeEngineAsync(ctx.engine, prompt, { timeout: ctx.budget.timeoutMs });
  const candidates = parseCandidates(raw);

  writeResultCache(briefArtifact.id, ctx.frame.id, ctx.steering, gitHead, { candidates });

  const candidateArtifact = writeArtifact({
    type: 'candidate_list',
    source: 'adjacent',
    provenance: makeProvenance('generate', ctx.engine, [briefArtifact.id, surfaceArtifact.id]),
    content: candidates.map((c, i) => `## ${i + 1}. ${c.title}\n${c.summary}\n\nRationale: ${c.rationale}`).join('\n\n'),
    metadata: { candidates, frameId: ctx.frame.id, steeringHash } as unknown as Record<string, unknown>,
  });

  emit(ctx, 'generate', `Generated ${candidates.length} candidates.`);
  return { candidateArtifact, candidates };
}

// ── Stage 4: Critique ─────────────────────────────────────────────────────────

async function stageCritique(
  candidateArtifact: Artifact,
  candidates: CandidateRaw[],
  brief: SeedBriefParsed,
  ctx: PipelineContext,
): Promise<{ critiqueArtifact: Artifact; surviving: ScoredCandidate[] }> {
  emit(ctx, 'critique', `Critiquing ${candidates.length} candidates...`);

  const prompt = buildCritiquePrompt({ candidates, seedBrief: brief, frame: ctx.frame, budget: ctx.budget });
  const raw = await invokeEngineAsync(ctx.engine, prompt, { timeout: ctx.budget.timeoutMs });
  const critiques = parseCritiques(raw);

  // Pair candidates with their critiques; drop fatal ones
  const surviving: ScoredCandidate[] = critiques
    .filter((c) => c.verdict !== 'drop')
    .map((critique) => ({ candidate: candidates[critique.index]!, critique }))
    .filter((pair) => pair.candidate != null);

  // If too many were dropped, reinstate the least-bad dropped ones to meet minimum
  if (surviving.length < ctx.budget.critiqueMinSurvivors) {
    const dropped = critiques.filter((c) => c.verdict === 'drop');
    for (const d of dropped) {
      if (surviving.length >= ctx.budget.critiqueMinSurvivors) break;
      const candidate = candidates[d.index];
      if (candidate) surviving.push({ candidate, critique: { ...d, verdict: 'keep' } });
    }
  }

  const summaryLines = critiques.map((c) => {
    const title = candidates[c.index]?.title ?? `Candidate ${c.index}`;
    return `## [${c.verdict.toUpperCase()}] ${title}\n${c.steelman}\n⚡ ${c.objection}`;
  });

  const critiqueArtifact = writeArtifact({
    type: 'critique',
    source: 'adjacent',
    provenance: makeProvenance('critique', ctx.engine, [candidateArtifact.id]),
    content: summaryLines.join('\n\n'),
    metadata: { critiques, survivingCount: surviving.length } as unknown as Record<string, unknown>,
  });

  emit(ctx, 'critique', `${surviving.length} candidates survived critique.`);
  return { critiqueArtifact, surviving };
}

// ── Stage 5: Score ────────────────────────────────────────────────────────────

async function stageScore(
  critiqueArtifact: Artifact,
  surviving: ScoredCandidate[],
  brief: SeedBriefParsed,
  ctx: PipelineContext,
): Promise<Artifact[]> {
  emit(ctx, 'score', `Scoring ${surviving.length} candidates (batch)...`);

  // One LLM call for all candidates — faster and produces better-calibrated relative scores
  const prompt = buildBatchScorePrompt({ surviving, seedBrief: brief, frame: ctx.frame });
  const raw = await invokeEngineAsync(ctx.engine, prompt, { timeout: ctx.budget.timeoutMs });
  const allScores = parseBatchScores(raw, surviving.length);

  const dotArtifacts: Artifact[] = [];

  for (const scores of allScores) {
    const { candidate, critique } = surviving[scores.index]!;

    const title = critique.revisedTitle ?? candidate.title;
    const summary = critique.revisedSummary ?? candidate.summary;
    const effortEstimate = candidate.effortEstimate as Dot['effortEstimate'];

    const exportablePrompt = buildExportablePrompt({
      title,
      summary,
      rationale: candidate.rationale,
      repoSurface: candidate.repoSurface,
      frame: ctx.frame,
      seedBrief: brief,
      axisAScore: scores.axisAScore,
      axisBScore: scores.axisBScore,
      axisAJustification: scores.axisAJustification,
      axisBJustification: scores.axisBJustification,
    });

    const dot: Dot = {
      title,
      summary,
      rationale: candidate.rationale,
      repoSurface: candidate.repoSurface,
      effortEstimate,
      axisAScore: scores.axisAScore,
      axisAJustification: scores.axisAJustification,
      axisBScore: scores.axisBScore,
      axisBJustification: scores.axisBJustification,
      exportablePrompt,
    };

    const dotArtifact = writeArtifact({
      type: 'dot',
      source: 'adjacent',
      provenance: makeProvenance('score', ctx.engine, [critiqueArtifact.id]),
      content: exportablePrompt,
      metadata: dot as unknown as Record<string, unknown>,
    });

    dotArtifacts.push(dotArtifact);
    emit(ctx, 'score', `  [A:${scores.axisAScore} B:${scores.axisBScore}] ${title}`);
  }

  return dotArtifacts;
}

// ── Main pipeline entry point ─────────────────────────────────────────────────

export interface PipelineResult {
  consideration: Consideration;
  dots: Dot[];
  dotArtifacts: Artifact[];
  brief: SeedBriefParsed;
  surfaces: SurfaceEntry[];
}

export async function runPipeline(opts: RunPipelineOptions): Promise<PipelineResult> {
  const { seedArtifactIds, frame, repo, depth, steering, parentId, engine, onProgress } = opts;

  if (!Array.isArray(seedArtifactIds) || seedArtifactIds.length === 0) {
    throw new Error('runPipeline: seedArtifactIds must contain at least one id.');
  }

  const ctx: PipelineContext = {
    engine,
    budget: DEPTH_BUDGETS[depth as Depth],
    frame,
    steering,
    parentId,
    onProgress,
  };

  const seedArtifacts: Artifact[] = [];
  for (const id of seedArtifactIds) {
    const artifact = readArtifact(id);
    if (!artifact) throw new Error(`Seed artifact not found: ${id}`);
    seedArtifacts.push(artifact);
  }

  const considerationId = generateConsiderationId();
  const createdAt = nowIso();
  emit(ctx, 'init', `Starting consideration ${considerationId}`);

  const outputIds: string[] = [];
  const completedStages: PipelineStage[] = [];

  // Captures stable fields; only outputIds and completedStages vary per checkpoint.
  const checkpoint = () => writeConsideration({
    id: considerationId,
    inputIds: [...seedArtifactIds],
    outputIds: [...outputIds],
    frame,
    steering,
    parentId,
    repo,
    depth: depth as ConsiderationDepth,
    createdAt,
    userInteractions: [],
    completedStages: [...completedStages],
  });

  // ── Stage 1 ────────────────────────────────────────────────────────────────
  const { briefArtifact, brief } = await stageRead(seedArtifacts, ctx);
  outputIds.push(briefArtifact.id);
  completedStages.push('read');
  checkpoint();

  // ── Stage 2 ────────────────────────────────────────────────────────────────
  const { surfaceArtifact, surfaces, gitHead } = await stageSurvey(briefArtifact, brief, repo, ctx);
  outputIds.push(surfaceArtifact.id);
  completedStages.push('survey');
  checkpoint();

  // ── Stage 3 ────────────────────────────────────────────────────────────────
  const { candidateArtifact, candidates } = await stageGenerate(briefArtifact, surfaceArtifact, brief, surfaces, gitHead, ctx);
  outputIds.push(candidateArtifact.id);
  completedStages.push('generate');
  checkpoint();

  // ── Stage 4 ────────────────────────────────────────────────────────────────
  const { critiqueArtifact, surviving } = await stageCritique(candidateArtifact, candidates, brief, ctx);
  outputIds.push(critiqueArtifact.id);
  completedStages.push('critique');
  checkpoint();

  // ── Stage 5 ────────────────────────────────────────────────────────────────
  const dotArtifacts = await stageScore(critiqueArtifact, surviving, brief, ctx);
  outputIds.push(...dotArtifacts.map((a) => a.id));
  completedStages.push('score');

  const finalConsideration: Consideration = {
    id: considerationId,
    inputIds: [...seedArtifactIds],
    outputIds: [...outputIds],
    frame,
    steering,
    parentId,
    repo,
    depth: depth as ConsiderationDepth,
    createdAt,
    userInteractions: [],
    completedStages: [...completedStages],
  };
  writeConsideration(finalConsideration);

  const dots = dotArtifacts.map((a) => a.metadata as unknown as Dot);
  emit(ctx, 'done', `Done — ${dots.length} dots in consideration ${considerationId}`);

  return { consideration: finalConsideration, dots, dotArtifacts, brief, surfaces };
}

// ── 2×2 rendering ─────────────────────────────────────────────────────────────

const QUADRANT_WIDTH = 36;
const QUADRANT_HEIGHT = 6;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

interface GridCell {
  label: string;
  dots: Dot[];
}

export function renderTwoByTwo(dots: Dot[], frame: Frame): string {
  // Split into quadrants by median of each axis so dots spread across all four cells
  const aScores = dots.map((d) => d.axisAScore).sort((a, b) => a - b);
  const bScores = dots.map((d) => d.axisBScore).sort((a, b) => a - b);
  const aMid = aScores[Math.floor(aScores.length / 2)] ?? 50;
  const bMid = bScores[Math.floor(bScores.length / 2)] ?? 50;

  const highA = (d: Dot) => d.axisAScore >= aMid;
  const highB = (d: Dot) => d.axisBScore >= bMid;

  const quadrants: Record<string, GridCell> = {
    highA_highB: { label: frame.quadrantLabels.highHigh, dots: dots.filter((d) => highA(d) && highB(d)) },
    highA_lowB:  { label: frame.quadrantLabels.highLow,  dots: dots.filter((d) => highA(d) && !highB(d)) },
    lowA_highB:  { label: frame.quadrantLabels.lowHigh,  dots: dots.filter((d) => !highA(d) && highB(d)) },
    lowA_lowB:   { label: frame.quadrantLabels.lowLow,   dots: dots.filter((d) => !highA(d) && !highB(d)) },
  };

  function renderCell(cell: GridCell): string[] {
    const lines: string[] = [`[ ${cell.label} ]`.slice(0, QUADRANT_WIDTH)];
    for (const dot of cell.dots.slice(0, 4)) {
      const score = `A:${dot.axisAScore} B:${dot.axisBScore}`;
      const title = truncate(dot.title, QUADRANT_WIDTH - score.length - 3);
      lines.push(`  • ${title}`);
      lines.push(`    ${score}`);
    }
    while (lines.length < QUADRANT_HEIGHT) lines.push('');
    return lines.map((l) => l.padEnd(QUADRANT_WIDTH));
  }

  const topLeft  = renderCell(quadrants['highA_highB']);
  const topRight = renderCell(quadrants['lowA_highB']);
  const botLeft  = renderCell(quadrants['highA_lowB']);
  const botRight = renderCell(quadrants['lowA_lowB']);

  const sep = '─'.repeat(QUADRANT_WIDTH);
  const header = `\n  ${frame.name}\n  ${frame.axisA.label} (rows) × ${frame.axisB.label} (cols)\n`;
  const colHeader = `  ${'high ' + frame.axisB.label}`.padEnd(QUADRANT_WIDTH + 4) + `low ${frame.axisB.label}`;

  const rows: string[] = [header, colHeader, `  ${sep}┬${sep}`];
  for (let i = 0; i < QUADRANT_HEIGHT; i++) {
    const rowLabel = i === 0 ? `high ${frame.axisA.label}`.padStart(2) : '  ';
    rows.push(`${rowLabel}${topLeft[i]}│${topRight[i]}`);
  }
  rows.push(`  ${sep}┼${sep}`);
  for (let i = 0; i < QUADRANT_HEIGHT; i++) {
    const rowLabel = i === 0 ? ` low ${frame.axisA.label}`.padStart(2) : '  ';
    rows.push(`${rowLabel}${botLeft[i]}│${botRight[i]}`);
  }
  rows.push(`  ${sep}┴${sep}\n`);

  return rows.join('\n');
}

/** Print all dots sorted by axis A score descending with their justifications. */
export function renderDotList(dots: Dot[], frame: Frame): string {
  const sorted = [...dots].sort((a, b) => b.axisAScore - a.axisAScore);
  const lines: string[] = [`\n  All dots — sorted by ${frame.axisA.label} (axis A)\n`];

  for (const dot of sorted) {
    lines.push(`  ┌─ ${dot.title}`);
    lines.push(`  │  ${dot.summary}`);
    lines.push(`  │  ${frame.axisA.label}: ${dot.axisAScore}/100 — ${dot.axisAJustification}`);
    lines.push(`  │  ${frame.axisB.label}: ${dot.axisBScore}/100 — ${dot.axisBJustification}`);
    lines.push(`  │  Surface: ${dot.repoSurface}  Effort: ${dot.effortEstimate}`);
    lines.push(`  └`);
    lines.push('');
  }

  return lines.join('\n');
}
