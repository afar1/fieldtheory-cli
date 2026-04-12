import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from './paths.js';
import { readArtifact, writeArtifact } from './adjacent/librarian.js';
import type { Artifact } from './adjacent/types.js';

export type IdeasSeedSourceType = 'artifact' | 'text';

export interface IdeasSeed {
  id: string;
  title: string;
  sourceType: IdeasSeedSourceType;
  artifactIds: string[];
  createdAt: string;
  createdBy: 'user' | 'model' | 'system';
  notes?: string;
  lastUsedAt?: string;
}

interface SeedStore {
  seeds: IdeasSeed[];
}

function ideasDir(): string {
  return path.join(dataDir(), 'automation', 'ideas');
}

function seedsPath(): string {
  return path.join(ideasDir(), 'seeds.json');
}

function ensureIdeasDir(): void {
  fs.mkdirSync(ideasDir(), { recursive: true, mode: 0o700 });
}

function generateSeedId(): string {
  return `seed-${crypto.randomBytes(4).toString('hex')}`;
}

function loadStore(): SeedStore {
  try {
    return JSON.parse(fs.readFileSync(seedsPath(), 'utf-8')) as SeedStore;
  } catch {
    return { seeds: [] };
  }
}

function saveStore(store: SeedStore): void {
  ensureIdeasDir();
  fs.writeFileSync(seedsPath(), JSON.stringify(store, null, 2), 'utf-8');
}

export function listIdeasSeeds(): IdeasSeed[] {
  return loadStore().seeds.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function readIdeasSeed(id: string): IdeasSeed | null {
  return loadStore().seeds.find((seed) => seed.id === id) ?? null;
}

export function deleteIdeasSeed(id: string): boolean {
  const store = loadStore();
  const before = store.seeds.length;
  store.seeds = store.seeds.filter((seed) => seed.id !== id);
  if (store.seeds.length === before) return false;
  saveStore(store);
  return true;
}

export function createIdeasSeedFromArtifacts(input: {
  artifactIds: string[];
  title?: string;
  notes?: string;
  createdBy?: 'user' | 'model' | 'system';
}): IdeasSeed {
  const artifactIds = [...new Set(input.artifactIds.map((id) => String(id)).filter(Boolean))];
  if (artifactIds.length === 0) throw new Error('At least one artifact id is required.');

  for (const id of artifactIds) {
    const artifact = readArtifact(id);
    if (!artifact) throw new Error(`Artifact not found: ${id}`);
  }

  const seed: IdeasSeed = {
    id: generateSeedId(),
    title: input.title?.trim() || `Seed from ${artifactIds.length} artifact${artifactIds.length === 1 ? '' : 's'}`,
    sourceType: 'artifact',
    artifactIds,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? 'user',
    notes: input.notes?.trim() || undefined,
  };

  const store = loadStore();
  store.seeds.unshift(seed);
  saveStore(store);
  return seed;
}

export function createIdeasSeedFromText(input: {
  text: string;
  title?: string;
  notes?: string;
  createdBy?: 'user' | 'model' | 'system';
}): IdeasSeed {
  const text = input.text.trim();
  if (!text) throw new Error('Seed text cannot be empty.');

  const artifact = writeArtifact({
    type: 'bookmark',
    source: 'field_theory',
    provenance: {
      createdAt: new Date().toISOString(),
      producer: input.createdBy ?? 'user',
      inputIds: [],
      promptVersion: 'ideas-seed-from-text-v1',
    },
    content: text,
    metadata: {
      title: input.title?.trim() || 'Seed text',
      kind: 'ideas-seed-text',
    },
  });

  return createIdeasSeedFromArtifacts({
    artifactIds: [artifact.id],
    title: input.title?.trim() || 'Seed from text',
    notes: input.notes,
    createdBy: input.createdBy,
  });
}

export function touchIdeasSeed(id: string): void {
  const store = loadStore();
  const seed = store.seeds.find((item) => item.id === id);
  if (!seed) return;
  seed.lastUsedAt = new Date().toISOString();
  saveStore(store);
}

export function getSeedArtifacts(seed: IdeasSeed): Artifact[] {
  return seed.artifactIds
    .map((id) => readArtifact(id))
    .filter((artifact): artifact is Artifact => Boolean(artifact));
}

export function formatIdeasSeed(seed: IdeasSeed): string {
  const lines = [
    `Seed: ${seed.id}`,
    `  title: ${seed.title}`,
    `  source: ${seed.sourceType}`,
    `  created: ${seed.createdAt}`,
    `  created by: ${seed.createdBy}`,
    `  artifacts: ${seed.artifactIds.join(', ')}`,
  ];
  if (seed.lastUsedAt) lines.push(`  last used: ${seed.lastUsedAt}`);
  if (seed.notes) lines.push(`  notes: ${seed.notes}`);
  return lines.join('\n');
}

export function formatIdeasSeedList(seeds: IdeasSeed[]): string {
  if (seeds.length === 0) {
    return 'No seeds yet. Try: ft ideas seed create --artifact <id> or ft ideas seed text "..."';
  }

  return seeds
    .slice(0, 50)
    .map((seed) => `${seed.id}  ${seed.sourceType}  ${seed.artifactIds.length} artifact${seed.artifactIds.length === 1 ? '' : 's'}  ${seed.title}`)
    .join('\n');
}
