export type SeedStrategyId =
  | 'filtered'
  | 'recent'
  | 'search'
  | 'random'
  | 'lucky'
  | 'builder-mix'
  | 'repo-relevant';

export interface SeedFilterSpec {
  query?: string;
  category?: string;
  domain?: string;
  folder?: string;
  author?: string;
  days?: number;
  after?: string;
  before?: string;
  limit?: number;
}

export interface SeedStrategySpec {
  strategy: SeedStrategyId;
  filters: SeedFilterSpec;
  strategyParams?: Record<string, string | number | boolean>;
}

export interface SeedStrategyDefinition {
  id: SeedStrategyId;
  label: string;
  summary: string;
  playful?: boolean;
  buildTitle: (filters: SeedFilterSpec) => string;
}

export const SEED_STRATEGIES: SeedStrategyDefinition[] = [
  {
    id: 'filtered',
    label: 'Filtered set',
    summary: 'Use a plain filtered bookmark set as the seed.',
    buildTitle: (filters) => summarizeSeedIntent('Filtered seed', filters),
  },
  {
    id: 'recent',
    label: 'Recent',
    summary: 'Use the most recent bookmarks that match the current filters.',
    buildTitle: (filters) => summarizeSeedIntent('Recent seed', filters),
  },
  {
    id: 'search',
    label: 'Search',
    summary: 'Use bookmarks matching a search query.',
    buildTitle: (filters) => summarizeSeedIntent('Search seed', filters),
  },
  {
    id: 'random',
    label: 'Random',
    summary: 'Pick from a candidate pool in a playful, non-deterministic way.',
    playful: true,
    buildTitle: (filters) => summarizeSeedIntent('Random seed', filters),
  },
  {
    id: 'lucky',
    label: 'Lucky',
    summary: 'Pick a likely-interesting subset from a filtered pool.',
    playful: true,
    buildTitle: (filters) => summarizeSeedIntent('Lucky seed', filters),
  },
  {
    id: 'builder-mix',
    label: 'Builder mix',
    summary: 'Blend different bookmark shapes into a seed with variety and tension.',
    playful: true,
    buildTitle: (filters) => summarizeSeedIntent('Builder mix', filters),
  },
  {
    id: 'repo-relevant',
    label: 'Repo relevant',
    summary: 'Favor bookmarks likely to connect to the selected repo.',
    buildTitle: (filters) => summarizeSeedIntent('Repo-relevant seed', filters),
  },
];

export const SEED_STRATEGIES_BY_ID: Record<SeedStrategyId, SeedStrategyDefinition> = Object.fromEntries(
  SEED_STRATEGIES.map((strategy) => [strategy.id, strategy]),
) as Record<SeedStrategyId, SeedStrategyDefinition>;

export function getSeedStrategy(id: string): SeedStrategyDefinition | undefined {
  return SEED_STRATEGIES_BY_ID[id as SeedStrategyId];
}

export function normalizeSeedFilters(filters: SeedFilterSpec): SeedFilterSpec {
  const normalized: SeedFilterSpec = {};

  const put = (key: keyof SeedFilterSpec, value: string | number | undefined) => {
    if (value == null) return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return;
      normalized[key] = trimmed as never;
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = value as never;
    }
  };

  put('query', filters.query);
  put('category', filters.category);
  put('domain', filters.domain);
  put('folder', filters.folder);
  put('author', filters.author);
  put('days', filters.days);
  put('after', filters.after);
  put('before', filters.before);
  put('limit', filters.limit);

  return normalized;
}

export function summarizeSeedIntent(prefix: string, filters: SeedFilterSpec): string {
  const normalized = normalizeSeedFilters(filters);
  const parts: string[] = [];

  if (normalized.query) parts.push(`query:${normalized.query}`);
  if (normalized.category) parts.push(`category:${normalized.category}`);
  if (normalized.domain) parts.push(`domain:${normalized.domain}`);
  if (normalized.folder) parts.push(`folder:${normalized.folder}`);
  if (normalized.author) parts.push(`author:${normalized.author}`);
  if (normalized.days) parts.push(`last ${normalized.days}d`);
  if (normalized.after) parts.push(`after:${normalized.after}`);
  if (normalized.before) parts.push(`before:${normalized.before}`);
  if (normalized.limit) parts.push(`limit:${normalized.limit}`);

  return parts.length > 0 ? `${prefix} — ${parts.join(' · ')}` : prefix;
}

export function buildSeedStrategySpec(input: {
  strategy?: SeedStrategyId;
  filters?: SeedFilterSpec;
  strategyParams?: Record<string, string | number | boolean>;
}): SeedStrategySpec {
  const strategy = input.strategy ?? inferSeedStrategy(input.filters ?? {});
  return {
    strategy,
    filters: normalizeSeedFilters(input.filters ?? {}),
    strategyParams: input.strategyParams,
  };
}

export function inferSeedStrategy(filters: SeedFilterSpec): SeedStrategyId {
  const normalized = normalizeSeedFilters(filters);
  if (normalized.query) return 'search';
  if (normalized.days || normalized.after || normalized.before) return 'recent';
  return 'filtered';
}

const RANDOM_WORDS_LEFT = [
  'quiet',
  'stubborn',
  'strange',
  'hidden',
  'sharp',
  'patient',
  'weird',
  'brittle',
  'curious',
  'sleepy',
];

const RANDOM_WORDS_RIGHT = [
  'leverage',
  'tools',
  'reliability',
  'workflows',
  'edges',
  'systems',
  'polish',
  'magic',
  'signals',
  'patterns',
];

export function generateRandomSeedPrompts(count = 6): string[] {
  const results = new Set<string>();
  let i = 0;
  while (results.size < count && i < 200) {
    const left = RANDOM_WORDS_LEFT[i % RANDOM_WORDS_LEFT.length];
    const right = RANDOM_WORDS_RIGHT[(i * 3 + 1) % RANDOM_WORDS_RIGHT.length];
    results.add(`${left} ${right}`);
    i += 1;
  }
  return [...results];
}
