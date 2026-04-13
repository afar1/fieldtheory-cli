import { createIdeasSeedFromArtifacts, type IdeasSeed } from './ideas-seeds.js';
import { writeArtifact } from './adjacent/librarian.js';
import type { SeedCandidate } from './seeds-query.js';

export interface SaveSeedFromCandidatesInput {
  candidates: SeedCandidate[];
  title: string;
  notes?: string;
  strategy?: string;
  strategyParams?: Record<string, string | number | boolean>;
  frameId?: string;
  createdBy?: 'user' | 'model' | 'system';
}

/**
 * Render a SeedCandidate into the markdown body of a bookmark artifact. The
 * pipeline's `read` stage consumes this content verbatim, so keep the shape
 * close to "tweet text + a few provenance lines".
 */
function renderBookmarkArtifactContent(c: SeedCandidate): string {
  const lines = [c.text];
  const meta: string[] = [];
  if (c.authorHandle) meta.push(`Author: ${c.authorHandle}`);
  if (c.postedAt) meta.push(`Posted: ${c.postedAt}`);
  if (c.url) meta.push(`Source: ${c.url}`);
  if (meta.length > 0) lines.push('', ...meta);
  return lines.join('\n');
}

export async function saveSeedFromCandidates(input: SaveSeedFromCandidatesInput): Promise<IdeasSeed> {
  // Each bookmark candidate becomes a bookmark-type artifact in the adjacent
  // artifact store, because the ideas pipeline reads seed content from that
  // store rather than from the bookmarks SQLite DB. The original bookmark id
  // is carried in metadata so future code can cross-reference back.
  const createdBy = input.createdBy ?? 'user';
  // Provenance producer vocabulary is ('user' | 'llm' | 'system'). Map
  // createdBy = 'model' → 'llm'; everything else passes through. An earlier
  // version of this function squashed 'system' → 'user' by accident.
  const producer: 'user' | 'llm' | 'system' =
    createdBy === 'model' ? 'llm' : createdBy;

  const artifactIds = input.candidates.map((candidate) => {
    const artifact = writeArtifact({
      type: 'bookmark',
      source: 'field_theory',
      provenance: {
        createdAt: new Date().toISOString(),
        producer,
        inputIds: [],
        promptVersion: 'bookmark-from-seed-candidate-v1',
      },
      content: renderBookmarkArtifactContent(candidate),
      metadata: {
        kind: 'bookmark-from-seed-candidate',
        bookmarkId: candidate.id,
        authorHandle: candidate.authorHandle,
        url: candidate.url,
        postedAt: candidate.postedAt,
        bookmarkedAt: candidate.bookmarkedAt,
        category: candidate.category,
        domain: candidate.domain,
        folderNames: candidate.folderNames,
      },
    });
    return artifact.id;
  });

  return await createIdeasSeedFromArtifacts({
    artifactIds,
    title: input.title,
    notes: input.notes,
    strategy: input.strategy,
    strategyParams: input.strategyParams,
    frameId: input.frameId,
    createdBy,
  });
}
