import { resolveEngine, invokeEngineAsync, type ResolvedEngine } from './engine.js';
import type { SeedCandidate } from './seeds-query.js';
import type { SeedFilterSpec } from './seeds-strategies.js';

export interface SeedOrganizationSuggestion {
  title: string;
  rationale: string;
  itemIds: string[];
}

export interface SeedModelPlan {
  explanation: string;
  suggestions: SeedOrganizationSuggestion[];
  engine: string;
}

export function buildSeedOrganizeExplainPrompt(input: {
  filters: SeedFilterSpec;
  candidateCount: number;
  candidatePreview: SeedCandidate[];
  suggestCount: number;
}): string {
  const preview = input.candidatePreview
    .slice(0, 12)
    .map((item, idx) => `${idx + 1}. ${item.id} | ${item.authorHandle ?? 'unknown'} | ${item.text.slice(0, 140)}`)
    .join('\n');

  return `You are helping organize bookmark seeds for idea generation.

Task: explain how you will organize a candidate bookmark pool into ${input.suggestCount} interesting seed groups.

Candidate pool size: ${input.candidateCount}
Filters: ${JSON.stringify(input.filters)}

Candidate preview:
${preview}

Output JSON only:
{
  "explanation": "4-6 sentence plain-English explanation of how you will organize the pool, what signal you will look for, and why the resulting seeds should be interesting"
}`;
}

export function buildSeedOrganizeSuggestPrompt(input: {
  filters: SeedFilterSpec;
  candidates: SeedCandidate[];
  suggestCount: number;
}): string {
  const preview = input.candidates
    .map((item) => ({
      id: item.id,
      authorHandle: item.authorHandle,
      text: item.text,
      category: item.category,
      domain: item.domain,
      folderNames: item.folderNames,
      postedAt: item.postedAt,
    }));

  return `You are organizing bookmark seeds for future idea-generation runs.

Create ${input.suggestCount} interesting seed groupings from the candidate bookmarks below.
Favor groups that are coherent, interesting, and likely to produce different kinds of repo-grounded ideas.
Use the bookmark IDs exactly as provided.

Filters: ${JSON.stringify(input.filters)}

Candidates:
${JSON.stringify(preview, null, 2)}

Output JSON only:
[
  {
    "title": "short seed title",
    "rationale": "2-3 sentence explanation of why this grouping is interesting",
    "itemIds": ["bookmark-id-1", "bookmark-id-2"]
  }
]`;
}

function extractJson<T>(raw: string): T {
  const stripped = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  const match = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return JSON.parse(match ? match[1] : stripped) as T;
}

export function parseSeedOrganizeExplanation(raw: string): string {
  const parsed = extractJson<{ explanation?: string }>(raw);
  if (!parsed.explanation || typeof parsed.explanation !== 'string') {
    throw new Error('Missing explanation in model organize response.');
  }
  return parsed.explanation.trim();
}

export function parseSeedOrganizationSuggestions(raw: string): SeedOrganizationSuggestion[] {
  const parsed = extractJson<SeedOrganizationSuggestion[]>(raw);
  if (!Array.isArray(parsed)) throw new Error('Expected suggestion array.');
  return parsed.map((entry) => ({
    title: String(entry.title ?? '').trim(),
    rationale: String(entry.rationale ?? '').trim(),
    itemIds: Array.isArray(entry.itemIds) ? entry.itemIds.map((id) => String(id)) : [],
  })).filter((entry) => entry.title && entry.rationale && entry.itemIds.length > 0);
}

export async function modelOrganizeSeeds(input: {
  filters: SeedFilterSpec;
  candidates: SeedCandidate[];
  suggestCount?: number;
  onProgress?: (message: string) => void;
  engine?: ResolvedEngine;
}): Promise<SeedModelPlan> {
  const engine = input.engine ?? await resolveEngine();
  const suggestCount = input.suggestCount ?? 3;

  input.onProgress?.('Explaining organization plan...');
  const explainRaw = await invokeEngineAsync(
    engine,
    buildSeedOrganizeExplainPrompt({
      filters: input.filters,
      candidateCount: input.candidates.length,
      candidatePreview: input.candidates,
      suggestCount,
    }),
    { timeout: 120_000, maxBuffer: 1024 * 1024 * 4 },
  );
  const explanation = parseSeedOrganizeExplanation(explainRaw);

  input.onProgress?.('Generating seed group suggestions...');
  const suggestRaw = await invokeEngineAsync(
    engine,
    buildSeedOrganizeSuggestPrompt({
      filters: input.filters,
      candidates: input.candidates,
      suggestCount,
    }),
    { timeout: 180_000, maxBuffer: 1024 * 1024 * 4 },
  );
  const suggestions = parseSeedOrganizationSuggestions(suggestRaw);

  return {
    explanation,
    suggestions,
    engine: engine.name,
  };
}
