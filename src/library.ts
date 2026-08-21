import fs from 'node:fs';
import path from 'node:path';
import { canonicalLibraryDir, codexContextSessionsDir } from './paths.js';
import {
  createMarkdownFile,
  DocumentVersion,
  isPathInside,
  moveToTrash,
  readContentInput,
  readMarkdownDocument,
  relativeMarkdownPath,
  renameMarkdownFile,
  resolveMarkdownPath,
  TrashedDocument,
  updateMarkdownFile,
} from './document-ops.js';

export interface LibraryDocumentSummary {
  path: string;
  relPath: string;
  title: string;
  updatedAt: string;
  size: number;
}

export interface LibrarySearchResult extends LibraryDocumentSummary {
  snippet: string;
}

export interface LibraryDocument extends LibraryDocumentSummary {
  content: string;
  version: DocumentVersion;
}

export interface LibraryWriteInput {
  stdin?: boolean;
  file?: string;
  content?: string;
  title?: string;
}

export interface LibraryUpdateInput extends LibraryWriteInput {
  expectedSha256?: string;
  force?: boolean;
  allowEmpty?: boolean;
}

export interface LibraryListOptions {
  limit?: number;
  includeRelPathPrefixes?: string[];
  excludeDirs?: string[];
  includeInternal?: boolean;
}

function libraryRoot(): string {
  return canonicalLibraryDir();
}

function titleFromContent(filePath: string, content: string): string {
  const heading = content.split('\n').find((line) => /^#\s+/.test(line));
  if (heading) return heading.replace(/^#\s+/, '').trim();
  return path.basename(filePath, path.extname(filePath));
}

function summaryForFile(filePath: string, content?: string): LibraryDocumentSummary {
  const fileContent = content ?? fs.readFileSync(filePath, 'utf-8');
  const stats = fs.statSync(filePath);
  return {
    path: filePath,
    relPath: relativeMarkdownPath(libraryRoot(), filePath),
    title: titleFromContent(filePath, fileContent),
    updatedAt: new Date(stats.mtimeMs).toISOString(),
    size: stats.size,
  };
}

function defaultExcludedDirs(): string[] {
  return [codexContextSessionsDir()];
}

function normalizedRelPathPrefix(prefix: string): string {
  return prefix.replace(/\\/g, '/').replace(/^\/+/, '');
}

function excludedDirsFor(options: LibraryListOptions): string[] {
  const explicit = options.excludeDirs ?? [];
  return options.includeInternal ? explicit : [...defaultExcludedDirs(), ...explicit];
}

function shouldSkipDir(dirPath: string, excludedDirs: string[]): boolean {
  const resolved = path.resolve(dirPath);
  return excludedDirs.some((excludedDir) => {
    const excluded = path.resolve(excludedDir);
    return resolved === excluded || isPathInside(excluded, resolved);
  });
}

function matchesRelPathPrefix(filePath: string, root: string, prefixes: string[] | undefined): boolean {
  if (!prefixes || prefixes.length === 0) return true;
  const relPath = relativeMarkdownPath(root, filePath);
  return prefixes.some((prefix) => relPath.startsWith(prefix));
}

function walkMarkdownFiles(dirPath: string, options: LibraryListOptions = {}): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dirPath)) return files;
  const root = path.resolve(dirPath);
  const includePrefixes = options.includeRelPathPrefixes?.map(normalizedRelPathPrefix);
  const excludedDirs = excludedDirsFor(options);
  const limit = options.limit && options.limit > 0 ? options.limit : undefined;

  function walk(current: string): void {
    if (limit !== undefined && files.length >= limit) return;
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (limit !== undefined && files.length >= limit) break;
      const absPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || shouldSkipDir(absPath, excludedDirs)) continue;
        walk(absPath);
      } else if (
        entry.isFile()
        && !entry.name.startsWith('.')
        && /\.(md|markdown)$/i.test(entry.name)
        && matchesRelPathPrefix(absPath, root, includePrefixes)
      ) {
        files.push(absPath);
      }
    }
  }

  walk(dirPath);
  return files;
}

function snippetFor(content: string, query: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  const idx = compact.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return compact.slice(0, 180);
  const start = Math.max(0, idx - 70);
  const end = Math.min(compact.length, idx + query.length + 110);
  return `${start > 0 ? '...' : ''}${compact.slice(start, end)}${end < compact.length ? '...' : ''}`;
}

function resolveLibraryPath(target: string): string {
  const resolved = resolveMarkdownPath(libraryRoot(), target);
  if (!resolved) throw new Error(`Invalid Library path: ${target}`);
  return resolved;
}

function defaultContent(targetPath: string, input: LibraryWriteInput): string {
  if (input.content !== undefined) return input.content;
  if (!input.title) return '';
  return `# ${input.title.trim() || path.basename(targetPath, path.extname(targetPath))}\n`;
}

export function listLibraryDocuments(options: LibraryListOptions = {}): LibraryDocumentSummary[] {
  return walkMarkdownFiles(libraryRoot(), options).map((filePath) => summaryForFile(filePath));
}

export function searchLibraryDocuments(query: string, options: LibraryListOptions = {}): LibrarySearchResult[] {
  const needle = query.trim();
  if (!needle) return [];

  const results: LibrarySearchResult[] = [];
  for (const filePath of walkMarkdownFiles(libraryRoot(), { ...options, limit: undefined })) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.toLowerCase().includes(needle.toLowerCase())) continue;
    results.push({
      ...summaryForFile(filePath, content),
      snippet: snippetFor(content, needle),
    });
    if (results.length >= (options.limit ?? 20)) break;
  }
  return results;
}

export async function showLibraryDocument(target: string): Promise<LibraryDocument> {
  const filePath = resolveLibraryPath(target);
  const { content, version } = await readMarkdownDocument(filePath);
  return {
    ...summaryForFile(filePath),
    content,
    version,
  };
}

export async function createLibraryDocument(target: string, input: LibraryWriteInput): Promise<LibraryDocument> {
  const filePath = resolveLibraryPath(target);
  const content = await readContentInput({ stdin: input.stdin, file: input.file, fallback: defaultContent(filePath, input) });
  await createMarkdownFile(filePath, content);
  return showLibraryDocument(filePath);
}

export async function updateLibraryDocument(target: string, input: LibraryUpdateInput): Promise<LibraryDocument> {
  const filePath = resolveLibraryPath(target);
  const content = await readContentInput({ stdin: input.stdin, file: input.file, fallback: input.content });
  await updateMarkdownFile(filePath, content, {
    expectedSha256: input.expectedSha256,
    force: input.force,
    allowEmpty: input.allowEmpty,
  });
  return showLibraryDocument(filePath);
}

export async function renameLibraryDocument(target: string, nextTarget: string): Promise<LibraryDocument> {
  const oldPath = resolveLibraryPath(target);
  const newPath = resolveLibraryPath(nextTarget);
  await renameMarkdownFile(oldPath, newPath);
  return showLibraryDocument(newPath);
}

export function deleteLibraryDocument(target: string): TrashedDocument {
  return moveToTrash(resolveLibraryPath(target));
}
