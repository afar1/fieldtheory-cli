import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.next', 'dist', 'build', 'out', 'coverage',
  '.turbo', '.cache', '__pycache__', '.venv', 'venv', 'DerivedData',
]);

const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.mp4', '.mov',
  '.mp3', '.wav', '.pdf', '.zip', '.tar', '.gz', '.wasm', '.bin',
]);

export type AgentContextFile = {
  path: string;
  modifiedAt: string;
};

export type AgentContext = {
  cwd: string;
  lastModifiedFile: AgentContextFile | null;
  recentFiles: AgentContextFile[];
};

function tryGitFiles(repoPath: string): string[] {
  try {
    return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseGitStatusPorcelain(output: string): string[] {
  const entries = output.split('\0');
  const files: string[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry) continue;
    const status = entry.slice(0, 2);
    const filePath = entry.slice(3);
    if (status.includes('R') || status.includes('C')) {
      const renamedPath = entries[i + 1];
      i += 1;
      if (renamedPath) files.push(renamedPath);
    } else if (!status.includes('D')) {
      files.push(filePath);
    }
  }
  return [...new Set(files)];
}

function tryGitChangedFiles(repoPath: string): string[] {
  try {
    return parseGitStatusPorcelain(execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }));
  } catch {
    return [];
  }
}

function shouldSkipFile(relPath: string): boolean {
  const parts = relPath.split(path.sep);
  if (parts.some((part) => SKIP_DIRS.has(part))) return true;
  return SKIP_EXTENSIONS.has(path.extname(relPath).toLowerCase());
}

function collectFallbackFiles(dir: string, root: string, limit: number, depth = 0): string[] {
  if (depth > 6) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];
  for (const entry of entries) {
    if (results.length >= limit) break;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(root, fullPath);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      results.push(...collectFallbackFiles(fullPath, root, limit - results.length, depth + 1));
    } else if (entry.isFile() && !shouldSkipFile(relPath)) {
      results.push(relPath);
    }
  }
  return results;
}

export function getAgentContext(repoPath = process.cwd(), limit = 10): AgentContext {
  const cwd = path.resolve(repoPath);
  const changedCandidates = tryGitChangedFiles(cwd);
  const candidates = changedCandidates.length > 0 ? changedCandidates : tryGitFiles(cwd);
  const relPaths = candidates.length > 0 ? candidates : collectFallbackFiles(cwd, cwd, 500);
  const recentFiles = relPaths
    .filter((relPath) => !shouldSkipFile(relPath))
    .map((relPath) => {
      try {
        const stat = fs.statSync(path.join(cwd, relPath));
        if (!stat.isFile()) return null;
        return {
          path: relPath,
          modifiedAt: stat.mtime.toISOString(),
        };
      } catch {
        return null;
      }
    })
    .filter((file): file is AgentContextFile => file !== null)
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, limit);

  return {
    cwd,
    lastModifiedFile: recentFiles[0] ?? null,
    recentFiles,
  };
}

export function formatAgentContext(context: AgentContext): string {
  const lines = [`cwd: ${context.cwd}`];
  lines.push(`lastModifiedFile: ${context.lastModifiedFile?.path ?? '(none)'}`);
  lines.push('recentFiles:');
  if (context.recentFiles.length === 0) {
    lines.push('  (none)');
  } else {
    for (const file of context.recentFiles) {
      lines.push(`  ${file.modifiedAt}  ${file.path}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
