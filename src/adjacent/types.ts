// ── Artifact ─────────────────────────────────────────────────────────────────

export type ArtifactType =
  | 'bookmark'
  | 'seed_brief'
  | 'surface_map'
  | 'candidate_list'
  | 'critique'
  | 'dot'
  | 'consideration_manifest'
  | 'batch_summary';

export type ArtifactSource = 'field_theory' | 'adjacent';

export interface Provenance {
  /** ISO timestamp of creation */
  createdAt: string;
  /** What produced this artifact */
  producer: 'user' | 'llm' | 'system';
  /** Model identifier, if LLM-produced */
  model?: string;
  /** IDs of artifacts that were inputs to this artifact */
  inputIds: string[];
  /** Prompt version or template name used, if applicable */
  promptVersion?: string;
}

export interface Artifact {
  /** Stable content-addressed ID (nanoid or similar) */
  id: string;
  type: ArtifactType;
  source: ArtifactSource;
  provenance: Provenance;
  /** Markdown body */
  content: string;
  /** Type-specific structured data */
  metadata: Record<string, unknown>;
}

// ── Dot ──────────────────────────────────────────────────────────────────────

export interface Dot {
  title: string;
  summary: string;
  /** Short essay explaining what should improve and why it matters. */
  essay?: string;
  /** Why this candidate is adjacent to the seed */
  rationale: string;
  /** Which files/areas of the repo this touches */
  repoSurface: string;
  /** Rough size estimate */
  effortEstimate: 'hours' | 'days' | 'weeks' | 'unknown';
  axisAScore: number;
  axisAJustification: string;
  axisBScore: number;
  axisBJustification: string;
  /** Self-contained markdown block, FT portable command shape */
  exportablePrompt: string;
  /** Self-contained implementation prompt for another agent or future run. */
  implementationPrompt?: string;
}

// ── Frame ─────────────────────────────────────────────────────────────────────

export type FrameGroup = 'building' | 'risk';

export interface FrameAxis {
  label: string;
  /** One sentence describing what 0 and 100 mean */
  rubricSentence: string;
}

export interface FrameQuadrantLabels {
  /** high axis_a, high axis_b */
  highHigh: string;
  /** high axis_a, low axis_b */
  highLow: string;
  /** low axis_a, high axis_b */
  lowHigh: string;
  /** low axis_a, low axis_b */
  lowLow: string;
}

export interface Frame {
  id: string;
  name: string;
  group: FrameGroup;
  /** Additional text appended to the generation prompt when this frame is active */
  generationPromptAddition: string;
  axisA: FrameAxis;
  axisB: FrameAxis;
  quadrantLabels: FrameQuadrantLabels;
}

// ── Consideration ─────────────────────────────────────────────────────────────

export type ConsiderationDepth = 'quick' | 'standard' | 'deep';

export type UserInteractionType = 'hover' | 'click' | 'export' | 'ignore';

export interface UserInteraction {
  type: UserInteractionType;
  dotTitle: string;
  timestamp: string;
}

export interface Consideration {
  id: string;
  /** IDs of seed artifacts */
  inputIds: string[];
  /** IDs of all produced artifacts */
  outputIds: string[];
  frame: Frame;
  /** Optional free-text steering nudge */
  steering?: string;
  /** ID of parent consideration in the navigation DAG */
  parentId?: string;
  /** Absolute path to the repo being explored */
  repo: string;
  depth: ConsiderationDepth;
  /** LLM profile used for this run, including model/effort when explicitly set. */
  model?: string;
  engine?: string;
  engineModel?: string;
  engineEffort?: string;
  /** Optional explicit number of nodes/debates requested for this run. */
  nodeTarget?: number;
  createdAt: string;
  userInteractions: UserInteraction[];
  /** Which pipeline stages have completed */
  completedStages: PipelineStage[];
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export type PipelineStage = 'read' | 'survey' | 'generate' | 'critique' | 'score';

export interface PipelineStageResult {
  stage: PipelineStage;
  artifactIds: string[];
  completedAt: string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

export interface RepoIndexMeta {
  repoPath: string;
  repoSlug: string;
  gitHead: string;
  indexedAt: string;
}

export interface SeedBriefCacheKey {
  artifactId: string;
  model: string;
}

export interface ResultCacheKey {
  seedId: string;
  frameId: string;
  steeringHash: string;
  gitHead: string;
}

// ── Librarian options ─────────────────────────────────────────────────────────

export interface ListArtifactsOptions {
  type?: ArtifactType;
  source?: ArtifactSource;
  limit?: number;
  after?: string;
}

export interface SearchArtifactsOptions {
  query: string;
  type?: ArtifactType;
  limit?: number;
}
