import { createIdeasSeedFromArtifacts, type IdeasSeed } from './ideas-seeds.js';
import type { SeedCandidate } from './seeds-query.js';

export interface SaveSeedFromCandidatesInput {
  candidates: SeedCandidate[];
  title: string;
  notes?: string;
  strategy?: string;
  strategyParams?: Record<string, string | number | boolean>;
  createdBy?: 'user' | 'model' | 'system';
}

export async function saveSeedFromCandidates(input: SaveSeedFromCandidatesInput): Promise<IdeasSeed> {
  return await createIdeasSeedFromArtifacts({
    artifactIds: input.candidates.map((item) => item.id),
    title: input.title,
    notes: input.notes,
    strategy: input.strategy,
    strategyParams: input.strategyParams,
    createdBy: input.createdBy,
  });
}
