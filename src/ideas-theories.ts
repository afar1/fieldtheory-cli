import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from './paths.js';
import { writeMd } from './fs.js';
import { writeIdeasIndex } from './ideas-index.js';
import { writeIdeasLatestPointers } from './ideas-latest.js';

export interface IdeasTheory {
  id: string;
  title: string;
  summary: string;
  recommendation: string;
  runId: string;
  nodeIds: string[];
  createdAt: string;
  createdBy: 'user' | 'model' | 'system';
  prompt?: string;
}

interface TheoryStore {
  theories: IdeasTheory[];
}

function ideasDir(): string {
  return path.join(dataDir(), 'automation', 'ideas');
}

function theoriesPath(): string {
  return path.join(ideasDir(), 'theories.json');
}

function theoriesMdDir(date?: string): string {
  const base = path.join(ideasDir(), 'theories');
  return date ? path.join(base, date) : base;
}

function ensureIdeasDir(): void {
  fs.mkdirSync(ideasDir(), { recursive: true, mode: 0o700 });
}

function theoryId(): string {
  return `theory-${crypto.randomBytes(4).toString('hex')}`;
}

function loadStore(): TheoryStore {
  try {
    return JSON.parse(fs.readFileSync(theoriesPath(), 'utf-8')) as TheoryStore;
  } catch {
    return { theories: [] };
  }
}

function saveStore(store: TheoryStore): void {
  ensureIdeasDir();
  fs.writeFileSync(theoriesPath(), JSON.stringify(store, null, 2), 'utf-8');
}

function theoryMdPath(theory: IdeasTheory): string {
  return path.join(theoriesMdDir(theory.createdAt.slice(0, 10)), `${theory.id}.md`);
}

function renderTheoryMd(theory: IdeasTheory): string {
  return [
    '---',
    'type: ideas-theory',
    `id: ${theory.id}`,
    `run_id: ${theory.runId}`,
    `created_at: ${theory.createdAt}`,
    `created_by: ${theory.createdBy}`,
    `node_ids: [${theory.nodeIds.map((id) => `"${id}"`).join(', ')}]`,
    '---',
    '',
    `# ${theory.title}`,
    '',
    '## Summary',
    '',
    theory.summary,
    '',
    '## Recommendation',
    '',
    theory.recommendation,
    '',
    '## Nodes',
    '',
    ...theory.nodeIds.map((id) => `- ${id}`),
    '',
    ...(theory.prompt ? ['## Prompt', '', '```md', theory.prompt.trim(), '```', ''] : []),
  ].join('\n');
}

export function listIdeasTheories(): IdeasTheory[] {
  return loadStore().theories.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function readIdeasTheory(id: string): IdeasTheory | null {
  return loadStore().theories.find((theory) => theory.id === id) ?? null;
}

export async function createIdeasTheory(input: {
  title: string;
  summary: string;
  recommendation: string;
  runId: string;
  nodeIds: string[];
  prompt?: string;
  createdBy?: 'user' | 'model' | 'system';
}): Promise<IdeasTheory> {
  const theory: IdeasTheory = {
    id: theoryId(),
    title: input.title.trim(),
    summary: input.summary.trim(),
    recommendation: input.recommendation.trim(),
    runId: input.runId,
    nodeIds: [...new Set(input.nodeIds.map(String))],
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? 'user',
    prompt: input.prompt?.trim() || undefined,
  };

  const store = loadStore();
  store.theories.unshift(theory);
  saveStore(store);
  await writeMd(theoryMdPath(theory), renderTheoryMd(theory));
  await writeIdeasIndex();
  await writeIdeasLatestPointers();
  return theory;
}
