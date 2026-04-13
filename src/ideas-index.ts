import path from 'node:path';
import { writeJson } from './fs.js';
import { ideasMdDir } from './paths.js';
import { listIdeasSeeds, type IdeasSeed } from './ideas-seeds.js';
import { listIdeaRuns, dotsFromRun } from './ideas.js';
import { listIdeasTheories, type IdeasTheory } from './ideas-theories.js';
import type { Consideration } from './adjacent/types.js';

export interface IdeasIndexSeedEntry {
  id: string;
  title: string;
  createdAt: string;
  strategy?: string;
  relatedRunIds?: string[];
  relatedNodeIds?: string[];
}

export interface IdeasIndexRunEntry {
  id: string;
  createdAt: string;
  repo: string;
  frameId: string;
  nodeCount: number;
}

export interface IdeasIndexNodeEntry {
  id: string;
  runId: string;
  title: string;
  repoSurface: string;
  axisAScore: number;
  axisBScore: number;
  createdAt: string;
}

export interface IdeasIndexTheoryEntry {
  id: string;
  title: string;
  runId: string;
  nodeIds: string[];
  createdAt: string;
}

export interface IdeasIndex {
  generatedAt: string;
  seeds: IdeasIndexSeedEntry[];
  runs: IdeasIndexRunEntry[];
  nodes: IdeasIndexNodeEntry[];
  theories: IdeasIndexTheoryEntry[];
}

export function ideasIndexPath(): string {
  return path.join(ideasMdDir(), 'index.json');
}

function mapSeed(seed: IdeasSeed): IdeasIndexSeedEntry {
  return {
    id: seed.id,
    title: seed.title,
    createdAt: seed.createdAt,
    strategy: seed.strategy,
    relatedRunIds: seed.relatedRunIds,
    relatedNodeIds: seed.relatedNodeIds,
  };
}

function mapRun(run: Consideration): IdeasIndexRunEntry {
  return {
    id: run.id,
    createdAt: run.createdAt,
    repo: run.repo,
    frameId: run.frame.id,
    nodeCount: dotsFromRun(run).length,
  };
}

function mapNodes(run: Consideration): IdeasIndexNodeEntry[] {
  return dotsFromRun(run).map(({ artifact, dot }) => ({
    id: artifact.id,
    runId: run.id,
    title: dot.title,
    repoSurface: dot.repoSurface,
    axisAScore: dot.axisAScore,
    axisBScore: dot.axisBScore,
    createdAt: run.createdAt,
  }));
}

function mapTheory(theory: IdeasTheory): IdeasIndexTheoryEntry {
  return {
    id: theory.id,
    title: theory.title,
    runId: theory.runId,
    nodeIds: theory.nodeIds,
    createdAt: theory.createdAt,
  };
}

export function buildIdeasIndex(): IdeasIndex {
  const seeds = listIdeasSeeds().slice(0, 200).map(mapSeed);
  const runs = listIdeaRuns().slice(0, 200);

  return {
    generatedAt: new Date().toISOString(),
    seeds,
    runs: runs.map(mapRun),
    nodes: runs.flatMap(mapNodes).slice(0, 500),
    theories: listIdeasTheories().slice(0, 200).map(mapTheory),
  };
}

export async function writeIdeasIndex(): Promise<string> {
  const index = buildIdeasIndex();
  const filePath = ideasIndexPath();
  await writeJson(filePath, index);
  return filePath;
}
