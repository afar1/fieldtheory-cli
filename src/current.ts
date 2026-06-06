import fs from 'node:fs';
import path from 'node:path';
import { legacyCodexContextSessionsDir, runtimeContextSessionStatePath, runtimeContextSessionsDir } from './paths.js';

export interface CurrentDocumentSelection {
  textPath: string;
  preview: string | null;
}

export interface CurrentDocumentRelatedPage {
  title: string | null;
  path: string | null;
  kind: string | null;
  contentPath: string | null;
}

export interface CurrentDocumentSummary {
  manifestPath: string;
  updatedAt: string | null;
  activeDocument: {
    title: string | null;
    path: string | null;
    kind: string | null;
    contentMode: string | null;
    contentPath: string;
  };
  selection: CurrentDocumentSelection | null;
  recent: CurrentDocumentRelatedPage[];
  includedPages: CurrentDocumentRelatedPage[];
}

export interface CurrentDocumentContext extends CurrentDocumentSummary {
  content: string;
}

type ManifestRecord = Record<string, unknown>;

interface SessionStateManifestCandidate {
  manifestPath: string;
  cwdMatches: boolean;
  active: boolean;
  attachedAtMs: number;
  mtimeMs: number;
}

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

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function timestampMs(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cwdMatchesSession(value: unknown, cwd = process.cwd()): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  return path.resolve(value) === path.resolve(cwd);
}

function assertInsideDirectory(filePath: string, dirPath: string): void {
  const resolvedFilePath = path.resolve(filePath);
  const resolvedDirPath = path.resolve(dirPath);
  const relativePath = path.relative(resolvedDirPath, resolvedFilePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Context content path must stay inside its session directory: ${filePath}`);
  }
}

function readSessionManifests(sessionsDir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(sessionsDir, entry.name, 'context.json'))
    .filter((manifestPath) => fs.existsSync(manifestPath));
}

function contextSessionDirs(): string[] {
  return Array.from(new Set([
    runtimeContextSessionsDir(),
    legacyCodexContextSessionsDir(),
  ]));
}

function readSessionStateManifestCandidates(sessionStatePath: string): SessionStateManifestCandidate[] {
  let sessions: unknown[];
  try {
    sessions = arrayField(JSON.parse(fs.readFileSync(sessionStatePath, 'utf-8')));
  } catch {
    return [];
  }

  return sessions.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const session = item as ManifestRecord;
    const attachedContexts = arrayField(session.attachedContexts);
    return attachedContexts.flatMap((context) => {
      if (!context || typeof context !== 'object' || Array.isArray(context)) return [];
      const manifestPath = stringField((context as ManifestRecord).filePath);
      if (!manifestPath || !fs.existsSync(manifestPath)) return [];
      return [{
        manifestPath,
        cwdMatches: cwdMatchesSession(session.cwd) || cwdMatchesSession(session.sessionCwd) || cwdMatchesSession((context as ManifestRecord).sessionCwd),
        active: !stringField(session.exitedAt),
        attachedAtMs: timestampMs((context as ManifestRecord).attachedAt),
        mtimeMs: statMtimeMs(manifestPath),
      }];
    });
  });
}

function findAttachedContextManifest(sessionStatePath = runtimeContextSessionStatePath()): string | null {
  const candidates = readSessionStateManifestCandidates(sessionStatePath)
    .sort((a, b) => {
      if (a.cwdMatches !== b.cwdMatches) return a.cwdMatches ? -1 : 1;
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (b.attachedAtMs - a.attachedAtMs) || (b.mtimeMs - a.mtimeMs);
    });

  return candidates[0]?.manifestPath ?? null;
}

export function findCurrentContextManifest(sessionsDir?: string): string | null {
  if (!sessionsDir) {
    const attachedManifest = findAttachedContextManifest();
    if (attachedManifest) return attachedManifest;
  }

  const manifests = (sessionsDir ? readSessionManifests(sessionsDir) : contextSessionDirs().flatMap(readSessionManifests))
    .sort((a, b) => statMtimeMs(b) - statMtimeMs(a));

  return manifests[0] ?? null;
}

function readSelection(value: unknown, sessionDir: string): CurrentDocumentSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as ManifestRecord;
  const textPath = stringField(record.textPath);
  if (!textPath) return null;
  assertInsideDirectory(textPath, sessionDir);
  return {
    textPath,
    preview: stringField(record.preview),
  };
}

function readRelatedPages(value: unknown, sessionDir: string): CurrentDocumentRelatedPage[] {
  return arrayField(value)
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as ManifestRecord;
      const contentPath = stringField(record.contentPath);
      if (contentPath) assertInsideDirectory(contentPath, sessionDir);
      return {
        title: stringField(record.title),
        path: stringField(record.path),
        kind: stringField(record.kind),
        contentPath,
      };
    })
    .filter((item): item is CurrentDocumentRelatedPage => item !== null);
}

export function readCurrentDocumentSummary(manifestPath = findCurrentContextManifest()): CurrentDocumentSummary {
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
  const sessionDir = path.dirname(manifestPath);
  assertInsideDirectory(contentPath, sessionDir);

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
    selection: readSelection(manifest.selection, sessionDir),
    recent: readRelatedPages(manifest.recent, sessionDir),
    includedPages: readRelatedPages(manifest.includedPages, sessionDir),
  };
}

export function readCurrentDocumentContext(manifestPath = findCurrentContextManifest()): CurrentDocumentContext {
  const summary = readCurrentDocumentSummary(manifestPath);
  return {
    ...summary,
    content: fs.readFileSync(summary.activeDocument.contentPath, 'utf-8'),
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

export function formatCurrentDocumentSummary(context: CurrentDocumentSummary): string {
  return [
    `title: ${context.activeDocument.title ?? '(untitled)'}`,
    `source: ${context.activeDocument.path ?? '(unknown)'}`,
    `kind: ${context.activeDocument.kind ?? '(unknown)'}`,
    `contentMode: ${context.activeDocument.contentMode ?? '(unknown)'}`,
    `updatedAt: ${context.updatedAt ?? '(unknown)'}`,
    `manifest: ${context.manifestPath}`,
    `content: ${context.activeDocument.contentPath}`,
    '',
  ].join('\n');
}
