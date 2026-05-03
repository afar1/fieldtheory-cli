import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureDir, pathExists, readMd, writeMd } from './fs.js';

export interface DocumentVersion {
  mtimeMs: number;
  size: number;
  sha256: string;
}

export interface DocumentUpdateOptions {
  expectedSha256?: string;
  force?: boolean;
}

export interface DocumentUpdateResult {
  path: string;
  version: DocumentVersion;
}

export interface TrashedDocument {
  originalPath: string;
  trashPath: string;
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function isPathInside(parentPath: string, childPath: string): boolean {
  const relPath = path.relative(parentPath, childPath);
  return relPath === '' || (!!relPath && !relPath.startsWith(`..${path.sep}`) && !path.isAbsolute(relPath));
}

export function normalizeMarkdownFileName(name: string, options: { rejectLeadingUnderscore?: boolean } = {}): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes('\0') || /[\\/]/.test(trimmed)) return null;

  const withoutExt = trimmed.replace(/\.(md|markdown)$/i, '').trim();
  if (!withoutExt || withoutExt === '.' || withoutExt === '..' || withoutExt.startsWith('.')) return null;
  if (options.rejectLeadingUnderscore && withoutExt.startsWith('_')) return null;

  const fileName = /\.(md|markdown)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
  return path.basename(fileName) === fileName ? fileName : null;
}

export function normalizeMarkdownRelPath(input: string, options: { rejectHiddenSegments?: boolean } = {}): string | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.includes('\0') || path.isAbsolute(trimmed)) return null;

  const parts = trimmed.split(/[\\/]+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((part) => part === '.' || part === '..' || part.startsWith('.'))) return null;
  if (options.rejectHiddenSegments && parts.some((part) => part.startsWith('_'))) return null;

  const last = parts[parts.length - 1];
  if (!/\.(md|markdown)$/i.test(last)) parts[parts.length - 1] = `${last}.md`;
  return parts.join('/');
}

export function resolveMarkdownPath(rootDir: string, target: string): string | null {
  const root = path.resolve(rootDir);
  const raw = target.trim();
  if (!raw || raw.includes('\0')) return null;

  const candidate = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(root, normalizeMarkdownRelPath(raw) ?? '');

  if (!isPathInside(root, candidate)) return null;
  if (!/\.(md|markdown)$/i.test(path.basename(candidate))) return null;
  return candidate;
}

export function relativeMarkdownPath(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

export function readDocumentVersion(filePath: string): DocumentVersion {
  const content = fs.readFileSync(filePath, 'utf-8');
  const stats = fs.statSync(filePath);
  return {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    sha256: sha256(content),
  };
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export async function readContentInput(options: { stdin?: boolean; file?: string; fallback?: string }): Promise<string> {
  if (options.stdin && options.file) {
    throw new Error('--stdin and --file cannot be used together.');
  }
  if (options.stdin) return readStdin();
  if (options.file) return fs.readFileSync(options.file, 'utf-8');
  return options.fallback ?? '';
}

export async function createMarkdownFile(filePath: string, content: string): Promise<DocumentUpdateResult> {
  if (await pathExists(filePath)) {
    throw new Error(`File already exists: ${filePath}`);
  }
  await writeMd(filePath, content);
  return { path: filePath, version: readDocumentVersion(filePath) };
}

export async function updateMarkdownFile(filePath: string, content: string, options: DocumentUpdateOptions): Promise<DocumentUpdateResult> {
  if (!await pathExists(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const current = readDocumentVersion(filePath);
  if (options.expectedSha256 && current.sha256 !== options.expectedSha256) {
    throw new Error(`File changed on disk. Expected ${options.expectedSha256}, found ${current.sha256}.`);
  }
  if (!options.force && !options.expectedSha256) {
    throw new Error('Refusing to overwrite without --expected-sha256 or --force.');
  }
  await writeMd(filePath, content);
  return { path: filePath, version: readDocumentVersion(filePath) };
}

export async function renameMarkdownFile(oldPath: string, newPath: string): Promise<DocumentUpdateResult> {
  if (!await pathExists(oldPath)) throw new Error(`File not found: ${oldPath}`);
  if (await pathExists(newPath)) throw new Error(`Target already exists: ${newPath}`);
  await ensureDir(path.dirname(newPath));
  fs.renameSync(oldPath, newPath);
  return { path: newPath, version: readDocumentVersion(newPath) };
}

export function moveToTrash(filePath: string): TrashedDocument {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) throw new Error(`Not a file: ${filePath}`);

  const trashDir = path.join(os.homedir(), '.Trash');
  fs.mkdirSync(trashDir, { recursive: true });

  const parsed = path.parse(filePath);
  let trashPath = path.join(trashDir, path.basename(filePath));
  if (fs.existsSync(trashPath)) {
    trashPath = path.join(trashDir, `${parsed.name} ${Date.now()}${parsed.ext}`);
  }

  fs.renameSync(filePath, trashPath);
  return { originalPath: filePath, trashPath };
}

export async function readMarkdownDocument(filePath: string): Promise<{ content: string; version: DocumentVersion }> {
  const content = await readMd(filePath);
  return { content, version: readDocumentVersion(filePath) };
}
