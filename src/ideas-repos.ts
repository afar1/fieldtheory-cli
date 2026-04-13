import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ideasMdDir, ideasReposRegistryPath } from './paths.js';

export interface ReposRegistry {
  repos: string[];
}

function ensureRegistryDir(): void {
  fs.mkdirSync(ideasMdDir(), { recursive: true, mode: 0o700 });
}

export function loadReposRegistry(): ReposRegistry {
  try {
    const raw = fs.readFileSync(ideasReposRegistryPath(), 'utf-8');
    const parsed = JSON.parse(raw) as ReposRegistry;
    if (!parsed || !Array.isArray(parsed.repos)) return { repos: [] };
    return parsed;
  } catch {
    return { repos: [] };
  }
}

export function saveReposRegistry(registry: ReposRegistry): void {
  ensureRegistryDir();
  fs.writeFileSync(ideasReposRegistryPath(), JSON.stringify(registry, null, 2), { mode: 0o600 });
}

export function listSavedRepos(): string[] {
  return loadReposRegistry().repos;
}

/**
 * Resolve a user-provided path into the canonical absolute form we store.
 * Expands ~, resolves relative-to-cwd, and strips trailing slashes so add/remove
 * are stable across cosmetic differences.
 */
export function normalizeRepoPath(input: string): string {
  let p = input.trim();
  if (!p) throw new Error('Repo path cannot be empty.');
  if (p.startsWith('~/') || p === '~') {
    p = path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(p);
}

export function addRepoToRegistry(repoPath: string): { added: boolean; canonical: string } {
  const canonical = normalizeRepoPath(repoPath);
  const registry = loadReposRegistry();
  if (registry.repos.includes(canonical)) {
    return { added: false, canonical };
  }
  registry.repos.push(canonical);
  saveReposRegistry(registry);
  return { added: true, canonical };
}

export function removeRepoFromRegistry(repoPath: string): { removed: boolean; canonical: string } {
  const canonical = normalizeRepoPath(repoPath);
  const registry = loadReposRegistry();
  const before = registry.repos.length;
  registry.repos = registry.repos.filter((r) => r !== canonical);
  if (registry.repos.length === before) {
    return { removed: false, canonical };
  }
  saveReposRegistry(registry);
  return { removed: true, canonical };
}

export function clearReposRegistry(): number {
  const registry = loadReposRegistry();
  const count = registry.repos.length;
  saveReposRegistry({ repos: [] });
  return count;
}

export interface RepoListResolutionInput {
  /** A single explicit repo path (e.g. from --repo). */
  singleRepo?: string;
  /** Multiple explicit repo paths (e.g. from --repos). */
  multiRepos?: string[];
  /** Saved registry contents — kept as a parameter so callers can pass test fixtures. */
  savedRepos: string[];
}

export type RepoListResolution =
  | { kind: 'ok'; repos: string[] }
  | { kind: 'error'; reason: 'both-flags' | 'none' };

/**
 * Resolve which repos a run should target, in order of precedence:
 *   1. multiRepos (from --repos)
 *   2. singleRepo (from --repo)
 *   3. savedRepos (from the registry)
 * Returns an explicit error result if both --repo and --repos were given,
 * or if no source produced any repos.
 */
export function resolveRepoList(input: RepoListResolutionInput): RepoListResolution {
  const hasSingle = Boolean(input.singleRepo);
  const hasMulti = Array.isArray(input.multiRepos) && input.multiRepos.length > 0;

  if (hasSingle && hasMulti) {
    return { kind: 'error', reason: 'both-flags' };
  }
  if (hasMulti) {
    return { kind: 'ok', repos: input.multiRepos! };
  }
  if (hasSingle) {
    return { kind: 'ok', repos: [input.singleRepo!] };
  }
  if (input.savedRepos.length > 0) {
    return { kind: 'ok', repos: input.savedRepos };
  }
  return { kind: 'error', reason: 'none' };
}
