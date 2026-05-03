/**
 * Librarian — Adjacent artifact store.
 *
 * Owns: artifact CRUD, provenance tracking, store directory layout.
 * Does NOT own: expansion pipeline, UI, export layer.
 *
 * Disk layout (under adjacentDir()):
 *   artifacts/{id}.md                     - artifact files (YAML frontmatter + body)
 *   considerations/{id}/manifest.md       - consideration manifests
 *   considerations/{id}/stage-{n}-{type}.md
 *   repo-indices/{slug}/index.json
 *   repo-indices/{slug}/meta.json
 *   frames/custom-{id}.json
 *   cache/seed-briefs/{artifact-id}-{model}.json
 *   cache/results/{cache-key}.json
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  adjacentDir,
  adjacentArtifactsDir,
  adjacentConsiderationsDir,
  adjacentFramesDir,
  adjacentCacheDir,
  ensureAdjacentDirs,
} from '../paths.js';
import type {
  Artifact,
  ArtifactType,
  ArtifactSource,
  Consideration,
  Frame,
  ListArtifactsOptions,
  SearchArtifactsOptions,
  RepoIndexMeta,
} from './types.js';

// ── ID generation ─────────────────────────────────────────────────────────────

/** Generate a short random ID (12 hex chars). */
function generateId(): string {
  return crypto.randomBytes(6).toString('hex');
}

// ── Frontmatter ───────────────────────────────────────────────────────────────

interface ArtifactFrontmatter {
  id: string;
  type: ArtifactType;
  source: ArtifactSource;
  provenance: Artifact['provenance'];
  metadata: Record<string, unknown>;
}

function serializeArtifact(artifact: Artifact): string {
  const { content, ...frontmatterFields } = artifact;
  const frontmatter = JSON.stringify(frontmatterFields, null, 2);
  return `---\n${frontmatter}\n---\n\n${content}`;
}

function parseArtifact(raw: string): Artifact {
  const match = raw.match(/^---\n([\s\S]+?)\n---\n\n?([\s\S]*)$/);
  if (!match) throw new Error('Invalid artifact format — missing YAML frontmatter delimiters');
  const frontmatter = JSON.parse(match[1]) as ArtifactFrontmatter;
  return { ...frontmatter, content: match[2] };
}

// ── Artifact CRUD ─────────────────────────────────────────────────────────────

/** Write an artifact to disk. Generates an ID if not set. Returns the artifact with its final ID. */
export function writeArtifact(artifact: Omit<Artifact, 'id'> & { id?: string }): Artifact {
  ensureAdjacentDirs();
  const id = artifact.id ?? generateId();
  const full: Artifact = { ...artifact, id } as Artifact;
  const filePath = path.join(adjacentArtifactsDir(), `${id}.md`);
  fs.writeFileSync(filePath, serializeArtifact(full), 'utf-8');
  return full;
}

/** Read an artifact by ID. Returns null if not found. */
export function readArtifact(id: string): Artifact | null {
  const filePath = path.join(adjacentArtifactsDir(), `${id}.md`);
  try {
    return parseArtifact(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Failed to parse artifact ${id}: ${(err as Error).message}`);
  }
}

/** Delete an artifact by ID. Returns true if deleted, false if not found. */
export function deleteArtifact(id: string): boolean {
  const filePath = path.join(adjacentArtifactsDir(), `${id}.md`);
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

/** List artifacts, optionally filtered by type or source. Most-recently-modified first. */
export function listArtifacts(options: ListArtifactsOptions = {}): Artifact[] {
  const dir = adjacentArtifactsDir();
  if (!fs.existsSync(dir)) return [];

  const limit = options.limit ?? 100;
  const entries = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  const artifacts: Artifact[] = [];
  for (const entry of entries) {
    if (artifacts.length >= limit) break;
    try {
      const artifact = parseArtifact(fs.readFileSync(path.join(dir, entry.name), 'utf-8'));
      if (options.type && artifact.type !== options.type) continue;
      if (options.source && artifact.source !== options.source) continue;
      if (options.after && artifact.provenance.createdAt <= options.after) continue;
      artifacts.push(artifact);
    } catch {
      // Skip malformed files
    }
  }
  return artifacts;
}

/** Simple substring search over artifact content and metadata. */
export function searchArtifacts(options: SearchArtifactsOptions): Artifact[] {
  const all = listArtifacts({ type: options.type, limit: 10_000 });
  const q = options.query.toLowerCase();
  const limit = options.limit ?? 20;

  return all
    .filter((a) => {
      const hay = (a.content + JSON.stringify(a.metadata)).toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit);
}

// ── Consideration CRUD ────────────────────────────────────────────────────────

function considerationDir(id: string): string {
  return path.join(adjacentConsiderationsDir(), id);
}

/** Persist a consideration manifest to disk. */
export function writeConsideration(consideration: Consideration): void {
  ensureAdjacentDirs();
  const dir = considerationDir(consideration.id);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'manifest.json');
  fs.writeFileSync(filePath, JSON.stringify(consideration, null, 2), 'utf-8');
}

/** Read a consideration by ID. Returns null if not found. */
export function readConsideration(id: string): Consideration | null {
  const filePath = path.join(considerationDir(id), 'manifest.json');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Consideration;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Failed to parse consideration ${id}: ${(err as Error).message}`);
  }
}

/** List all considerations, most-recently-created first. */
export function listConsiderations(): Consideration[] {
  const dir = adjacentConsiderationsDir();
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      try { return readConsideration(e.name); } catch { return null; }
    })
    .filter((c): c is Consideration => c !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Custom frame CRUD ─────────────────────────────────────────────────────────

/** Persist a custom frame to disk (default frames are in-memory only). */
export function writeCustomFrame(frame: Frame): void {
  ensureAdjacentDirs();
  const filePath = path.join(adjacentFramesDir(), `custom-${frame.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(frame, null, 2), 'utf-8');
}

/** Read a custom frame by ID. Returns null if not found. */
export function readCustomFrame(id: string): Frame | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(adjacentFramesDir(), `custom-${id}.json`), 'utf-8')) as Frame;
  } catch {
    return null;
  }
}

/** List all custom frames stored on disk. */
export function listCustomFrames(): Frame[] {
  const dir = adjacentFramesDir();
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((f) => f.startsWith('custom-') && f.endsWith('.json'))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as Frame; } catch { return null; }
    })
    .filter((f): f is Frame => f !== null);
}

// ── Repo index ────────────────────────────────────────────────────────────────

function repoSlug(repoPath: string): string {
  return repoPath.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function repoIndexDir(repoPath: string): string {
  return path.join(adjacentDir(), 'repo-indices', repoSlug(repoPath));
}

/** Read cached repo index meta. Returns null if not cached. */
export function readRepoIndexMeta(repoPath: string): RepoIndexMeta | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoIndexDir(repoPath), 'meta.json'), 'utf-8')) as RepoIndexMeta;
  } catch {
    return null;
  }
}

/** Write repo index data and meta. */
export function writeRepoIndex(repoPath: string, gitHead: string, indexData: unknown): RepoIndexMeta {
  const dir = repoIndexDir(repoPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  const meta: RepoIndexMeta = {
    repoPath,
    repoSlug: repoSlug(repoPath),
    gitHead,
    indexedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(indexData, null, 2), 'utf-8');
  return meta;
}

/** Read the repo index data. Returns null if not cached. */
export function readRepoIndex(repoPath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoIndexDir(repoPath), 'index.json'), 'utf-8'));
  } catch {
    return null;
  }
}

// ── Cache ─────────────────────────────────────────────────────────────────────

function seedBriefCachePath(artifactIds: string[], model: string): string {
  if (artifactIds.length === 0) {
    throw new Error('seedBriefCachePath: artifactIds must not be empty.');
  }
  const sortedIds = [...artifactIds].sort();
  const idHash = sortedIds.length === 1
    ? sortedIds[0]!
    : crypto.createHash('sha256').update(sortedIds.join('\n')).digest('hex').slice(0, 16);
  const key = `${idHash}-${model.replace(/[^a-z0-9-]/gi, '-')}`;
  return path.join(adjacentCacheDir(), 'seed-briefs', `${key}.json`);
}

function resultCachePath(seedId: string, frameId: string, steeringHash: string, gitHead: string, model = 'default'): string {
  const key = `${seedId}-${frameId}-${model}-${steeringHash}-${gitHead}`.replace(/[^a-z0-9-]/gi, '-');
  return path.join(adjacentCacheDir(), 'results', `${key}.json`);
}

export function readSeedBriefCache(artifactIds: string[], model: string): unknown | null {
  try { return JSON.parse(fs.readFileSync(seedBriefCachePath(artifactIds, model), 'utf-8')); } catch { return null; }
}

export function writeSeedBriefCache(artifactIds: string[], model: string, data: unknown): void {
  const p = seedBriefCachePath(artifactIds, model);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

export function hashSteering(steering: string | undefined): string {
  if (!steering) return '0';
  return crypto.createHash('sha256').update(steering).digest('hex').slice(0, 8);
}

export function readResultCache(seedId: string, frameId: string, steering: string | undefined, gitHead: string, model?: string): unknown | null {
  try { return JSON.parse(fs.readFileSync(resultCachePath(seedId, frameId, hashSteering(steering), gitHead, model), 'utf-8')); } catch { return null; }
}

export function writeResultCache(seedId: string, frameId: string, steering: string | undefined, gitHead: string, data: unknown, model?: string): void {
  const p = resultCachePath(seedId, frameId, hashSteering(steering), gitHead, model);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Store health ──────────────────────────────────────────────────────────────

export interface StoreStats {
  totalArtifacts: number;
  totalConsiderations: number;
  customFrames: number;
  storePath: string;
}

export function getStoreStats(): StoreStats {
  const artifactsDir = adjacentArtifactsDir();
  const consDir = adjacentConsiderationsDir();
  const framesDir = adjacentFramesDir();

  const totalArtifacts = fs.existsSync(artifactsDir)
    ? fs.readdirSync(artifactsDir).filter((f) => f.endsWith('.md')).length
    : 0;

  const totalConsiderations = fs.existsSync(consDir)
    ? fs.readdirSync(consDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
    : 0;

  const customFrames = fs.existsSync(framesDir)
    ? fs.readdirSync(framesDir).filter((f) => f.startsWith('custom-') && f.endsWith('.json')).length
    : 0;

  return { totalArtifacts, totalConsiderations, customFrames, storePath: adjacentDir() };
}
