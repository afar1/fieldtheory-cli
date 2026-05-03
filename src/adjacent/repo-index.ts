/**
 * Repo indexer — builds a lightweight file tree + recent activity snapshot
 * for use in the Survey stage of the Adjacent pipeline.
 *
 * Caches per (repo path, git HEAD). Invalidates on new commits.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readRepoIndexMeta, writeRepoIndex, readRepoIndex } from './librarian.js';

// ── File tree scanning ────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  '.turbo', '.cache', '__pycache__', '.venv', 'venv', '.tox', 'vendor',
  'Pods', 'DerivedData', '.gradle', 'target', 'bin', 'obj',
]);

const FALLBACK_SKIP_DIRS = new Set(
  [...SKIP_DIRS].filter((name) => !['dist', 'build', 'out'].includes(name)),
);

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.mp4', '.mov', '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz',
  '.wasm', '.bin', '.exe', '.dll', '.so', '.dylib', '.o', '.a',
  '.lock', '.sum',
]);

const EXCERPT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.swift', '.kt', '.java', '.py', '.rb', '.go', '.rs',
  '.md', '.mdx', '.json', '.toml', '.yaml', '.yml',
  '.sh', '.sql', '.css',
]);

export interface RepoFileEntry {
  path: string;
  ext: string;
  depth: number;
}

export interface RepoFileExcerpt {
  path: string;
  text: string;
}

function collectFiles(
  dir: string,
  rootDir: string,
  maxFiles: number,
  currentDepth = 0,
  skipDirs: Set<string> = SKIP_DIRS,
): RepoFileEntry[] {
  const results: RepoFileEntry[] = [];
  if (currentDepth > 6) return results;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (results.length >= maxFiles) break;

    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name) || entry.name.startsWith('.')) continue;
      const sub = collectFiles(path.join(dir, entry.name), rootDir, maxFiles - results.length, currentDepth + 1, skipDirs);
      results.push(...sub);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SKIP_EXTENSIONS.has(ext)) continue;
      results.push({
        path: path.relative(rootDir, path.join(dir, entry.name)),
        ext,
        depth: currentDepth,
      });
    }
  }

  return results;
}

/** Format file tree as an indented text block for inclusion in prompts. */
export function formatFileTree(files: RepoFileEntry[], limit: number): string {
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  return sorted
    .slice(0, limit)
    .map((f) => f.path)
    .join('\n');
}

// ── Git helpers ───────────────────────────────────────────────────────────────

function tryGit(repoPath: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function getGitHead(repoPath: string): string {
  const head = tryGit(repoPath, ['rev-parse', 'HEAD']);
  return head || 'unknown';
}

export function getRecentlyModifiedFiles(repoPath: string, limit = 20): string[] {
  const output = tryGit(repoPath, ['log', '--name-only', '--pretty=format:', '-30', '--diff-filter=AM']);
  if (!output) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of output.split('\n')) {
    const l = line.trim();
    if (l.length === 0 || seen.has(l)) continue;
    seen.add(l);
    result.push(l);
    if (result.length >= limit) break;
  }
  return result;
}

function readFileExcerpt(repoPath: string, relPath: string, maxChars = 900): RepoFileExcerpt | null {
  const ext = path.extname(relPath).toLowerCase();
  if (!EXCERPT_EXTENSIONS.has(ext)) return null;

  const fullPath = path.join(repoPath, relPath);
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile() || stat.size > 250_000) return null;
    const text = fs.readFileSync(fullPath, 'utf-8')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .slice(0, 80)
      .join('\n')
      .trim()
      .slice(0, maxChars);
    if (!text || text.includes('\u0000')) return null;
    return { path: relPath, text };
  } catch {
    return null;
  }
}

function collectFileExcerpts(repoPath: string, files: RepoFileEntry[], recentFiles: string[], limit: number): RepoFileExcerpt[] {
  const candidates = [
    ...recentFiles,
    ...files
      .filter((file) => file.depth <= 2 || /readme|package|config|main|index|app|cli/i.test(file.path))
      .map((file) => file.path),
  ];
  const seen = new Set<string>();
  const excerpts: RepoFileExcerpt[] = [];
  for (const relPath of candidates) {
    if (seen.has(relPath)) continue;
    seen.add(relPath);
    const excerpt = readFileExcerpt(repoPath, relPath);
    if (!excerpt) continue;
    excerpts.push(excerpt);
    if (excerpts.length >= limit) break;
  }
  return excerpts;
}

// ── Main index builder ────────────────────────────────────────────────────────

export interface RepoSnapshot {
  repoPath: string;
  gitHead: string;
  fileTree: RepoFileEntry[];
  recentFiles: string[];
  fileExcerpts: RepoFileExcerpt[];
  treeText: string;
  fromCache: boolean;
}

export interface BuildRepoIndexOptions {
  maxFiles?: number;
  maxExcerpts?: number;
}

interface RepoIndexData {
  fileTree: RepoFileEntry[];
  recentFiles: string[];
  fileExcerpts?: RepoFileExcerpt[];
  treeText: string;
  maxFiles?: number;
  complete?: boolean;
}

function cacheSatisfiesRequest(
  cached: RepoIndexData,
  maxFiles: number,
): cached is RepoIndexData & { fileExcerpts: RepoFileExcerpt[] } {
  if (!Array.isArray(cached.fileExcerpts)) return false;
  if (cached.complete) return true;
  return (cached.maxFiles ?? cached.fileTree.length) >= maxFiles;
}

export async function buildRepoSnapshot(
  repoPath: string,
  opts: BuildRepoIndexOptions = {},
): Promise<RepoSnapshot> {
  const maxFiles = opts.maxFiles ?? 200;
  const gitHead = getGitHead(repoPath);

  // Check cache
  const meta = readRepoIndexMeta(repoPath);
  if (meta && meta.gitHead === gitHead) {
    const cached = readRepoIndex(repoPath) as RepoIndexData | null;
    if (cached && cacheSatisfiesRequest(cached, maxFiles)) {
      return {
        repoPath,
        gitHead,
        fileTree: cached.fileTree,
        recentFiles: cached.recentFiles,
        fileExcerpts: cached.fileExcerpts,
        treeText: cached.treeText,
        fromCache: true,
      };
    }
  }

  // Build fresh index
  let fileTree = collectFiles(repoPath, repoPath, maxFiles);
  if (fileTree.length === 0) {
    fileTree = collectFiles(repoPath, repoPath, maxFiles, 0, FALLBACK_SKIP_DIRS);
  }
  const recentFiles = getRecentlyModifiedFiles(repoPath, 20);
  const fileExcerpts = collectFileExcerpts(repoPath, fileTree, recentFiles, opts.maxExcerpts ?? 8);
  const treeText = formatFileTree(fileTree, maxFiles);

  const indexData: RepoIndexData = {
    fileTree,
    recentFiles,
    fileExcerpts,
    treeText,
    maxFiles,
    complete: fileTree.length < maxFiles,
  };
  writeRepoIndex(repoPath, gitHead, indexData);

  return { repoPath, gitHead, fileTree, recentFiles, fileExcerpts, treeText, fromCache: false };
}
