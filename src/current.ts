import fs from 'node:fs';
import path from 'node:path';
import { codexContextSessionsDir } from './paths.js';

export interface CurrentDocumentContext {
  manifestPath: string;
  updatedAt: string | null;
  activeDocument: {
    title: string | null;
    path: string | null;
    kind: string | null;
    contentMode: string | null;
    contentPath: string;
  };
  content: string;
}

type ManifestRecord = Record<string, unknown>;

function readJsonObject(filePath: string): ManifestRecord {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Context manifest is not an object: ${filePath}`);
  }
  return parsed as ManifestRecord;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function statMtimeMs(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function assertInsideDirectory(filePath: string, dirPath: string): void {
  const resolvedFilePath = path.resolve(filePath);
  const resolvedDirPath = path.resolve(dirPath);
  const relativePath = path.relative(resolvedDirPath, resolvedFilePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Context content path must stay inside its session directory: ${filePath}`);
  }
}

export function findCurrentContextManifest(sessionsDir = codexContextSessionsDir()): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const manifests = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(sessionsDir, entry.name, 'context.json'))
    .filter((manifestPath) => fs.existsSync(manifestPath))
    .sort((a, b) => statMtimeMs(b) - statMtimeMs(a));

  return manifests[0] ?? null;
}

export function readCurrentDocumentContext(manifestPath = findCurrentContextManifest()): CurrentDocumentContext {
  if (!manifestPath) {
    throw new Error('No active Field Theory context found. Open a Field Theory document and attach a Codex terminal first.');
  }

  const manifest = readJsonObject(manifestPath);
  const activeDocument = manifest.activeDocument;
  if (!activeDocument || typeof activeDocument !== 'object' || Array.isArray(activeDocument)) {
    throw new Error(`Context manifest has no activeDocument object: ${manifestPath}`);
  }

  const documentRecord = activeDocument as ManifestRecord;
  const contentPath = stringField(documentRecord.contentPath);
  if (!contentPath) {
    throw new Error(`Context manifest has no activeDocument.contentPath: ${manifestPath}`);
  }
  assertInsideDirectory(contentPath, path.dirname(manifestPath));

  return {
    manifestPath,
    updatedAt: stringField(manifest.updatedAt),
    activeDocument: {
      title: stringField(documentRecord.title),
      path: stringField(documentRecord.path),
      kind: stringField(documentRecord.kind),
      contentMode: stringField(documentRecord.contentMode),
      contentPath,
    },
    content: fs.readFileSync(contentPath, 'utf-8'),
  };
}

export function formatCurrentDocumentContext(context: CurrentDocumentContext): string {
  const lines = [
    '# Field Theory Current Document',
    '',
    `title: ${context.activeDocument.title ?? '(untitled)'}`,
    `source: ${context.activeDocument.path ?? '(unknown)'}`,
    `kind: ${context.activeDocument.kind ?? '(unknown)'}`,
    `contentMode: ${context.activeDocument.contentMode ?? '(unknown)'}`,
    `updatedAt: ${context.updatedAt ?? '(unknown)'}`,
    `manifest: ${context.manifestPath}`,
    `content: ${context.activeDocument.contentPath}`,
    '',
    '---',
    '',
    context.content,
  ];

  return `${lines.join('\n')}${context.content.endsWith('\n') ? '' : '\n'}`;
}
