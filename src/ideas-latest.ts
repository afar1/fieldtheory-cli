import path from 'node:path';
import { writeJson } from './fs.js';
import { ideasMdDir } from './paths.js';
import { listIdeasSeeds } from './ideas-seeds.js';
import { listIdeaRuns } from './ideas.js';
import { listIdeasTheories } from './ideas-theories.js';

export interface IdeasLatestPointers {
  generatedAt: string;
  latestSeedId?: string;
  latestRunId?: string;
  latestTheoryId?: string;
  status: {
    seedCount: number;
    runCount: number;
    theoryCount: number;
  };
}

export function ideasLatestPath(): string {
  return path.join(ideasMdDir(), 'latest.json');
}

export function buildIdeasLatestPointers(): IdeasLatestPointers {
  const seeds = listIdeasSeeds();
  const runs = listIdeaRuns();
  const theories = listIdeasTheories();

  return {
    generatedAt: new Date().toISOString(),
    latestSeedId: seeds[0]?.id,
    latestRunId: runs[0]?.id,
    latestTheoryId: theories[0]?.id,
    status: {
      seedCount: seeds.length,
      runCount: runs.length,
      theoryCount: theories.length,
    },
  };
}

export async function writeIdeasLatestPointers(): Promise<string> {
  const filePath = ideasLatestPath();
  await writeJson(filePath, buildIdeasLatestPointers());
  return filePath;
}
