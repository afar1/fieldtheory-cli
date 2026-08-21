import fs from 'node:fs';
import path from 'node:path';
import { type DocumentVersion, isPathInside, readDocumentVersion } from './document-ops.js';
import { canonicalLibraryDir, fieldTheoryDir, fieldTheoryRoot, legacyCodexContextSessionsDir, runtimeContextSessionStatePath, runtimeContextSessionsDir } from './paths.js';

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

export interface CurrentDocumentEditProtocol {
  readCommand: string;
  updateCommand: string;
  expectedHashField: string;
  instructions: string;
  warning: string;
}

export interface CurrentDocumentLineNumberEntry {
  visibleLine: number;
  sourceLine: number;
  rowInSourceLine?: number;
  rowsInSourceLine?: number;
  text: string;
}

export interface CurrentDocumentLineMapping {
  activeLineKind: string | null;
  contentMode: string | null;
  visibleRowsOnly: boolean;
  lines: CurrentDocumentLineNumberEntry[];
}

export interface CurrentDocumentLineNumbers {
  activeSurface: string | null;
  activeLineKind: string | null;
  visibleRowsOnly: boolean;
  instructions: string;
  lines: CurrentDocumentLineNumberEntry[];
}

export interface CurrentDocumentSummary {
  manifestPath: string;
  updatedAt: string | null;
  activeDocument: {
    title: string | null;
    path: string | null;
    shellQuotedPath: string | null;
    kind: string | null;
    contentMode: string | null;
    contentPath: string;
    shellQuotedContentPath: string;
    lineMapping: CurrentDocumentLineMapping | null;
    version: DocumentVersion | null;
  };
  documentEdit: CurrentDocumentEditProtocol;
  selection: CurrentDocumentSelection | null;
  recent: CurrentDocumentRelatedPage[];
  includedPages: CurrentDocumentRelatedPage[];
}

export interface CurrentDocumentContext extends CurrentDocumentSummary {
  content: string;
}

export interface CurrentDocumentAgentJson {
  title: string | null;
  kind: string | null;
  contentMode: string | null;
  lineNumbers: CurrentDocumentLineNumbers;
  sourcePath: string | null;
  editable: boolean;
  version: DocumentVersion | null;
  updateCommand: string;
  updatedAt: string | null;
  selection: { preview: string | null } | null;
  recent: Array<{ title: string | null; kind: string | null }>;
  includedPages: Array<{ title: string | null; kind: string | null }>;
  content?: string;
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

function positiveIntegerField(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function quoteForPosixShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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

function readLineMappingEntry(value: unknown): CurrentDocumentLineNumberEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as ManifestRecord;
  const visibleLine = positiveIntegerField(record.visibleLine);
  const sourceLine = positiveIntegerField(record.sourceLine);
  if (visibleLine === null || sourceLine === null) return null;

  const entry: CurrentDocumentLineNumberEntry = {
    visibleLine,
    sourceLine,
    text: typeof record.text === 'string' ? record.text : '',
  };
  const rowInSourceLine = positiveIntegerField(record.rowInSourceLine);
  const rowsInSourceLine = positiveIntegerField(record.rowsInSourceLine);
  if (rowInSourceLine !== null) entry.rowInSourceLine = rowInSourceLine;
  if (rowsInSourceLine !== null) entry.rowsInSourceLine = rowsInSourceLine;
  return entry;
}

function readLineMapping(value: unknown): CurrentDocumentLineMapping | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as ManifestRecord;
  const activeLineKind = stringField(record.activeLineKind);
  const contentMode = stringField(record.contentMode);
  const lines = arrayField(record.lines)
    .map(readLineMappingEntry)
    .filter((line): line is CurrentDocumentLineNumberEntry => line !== null);
  if (!activeLineKind && !contentMode && lines.length === 0) return null;
  return {
    activeLineKind,
    contentMode,
    visibleRowsOnly: typeof record.visibleRowsOnly === 'boolean' ? record.visibleRowsOnly : false,
    lines,
  };
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

function currentDocumentEditProtocol(): CurrentDocumentEditProtocol {
  return {
    readCommand: 'ft current --json',
    updateCommand: 'ft current update --stdin --expected-sha256 <sha>',
    expectedHashField: 'version.sha256',
    instructions: 'Edit the content field as normal Markdown, then pipe the complete edited Markdown to updateCommand on stdin. Never run updateCommand without stdin content.',
    warning: 'Use sourcePath for identity/debugging only; write edits through updateCommand.',
  };
}

function isMarkdownPath(filePath: string): boolean {
  return /\.(md|markdown)$/i.test(path.basename(filePath));
}

export function isEditableCurrentSourcePath(sourcePath: string | null): boolean {
  if (!sourcePath || !path.isAbsolute(sourcePath) || !isMarkdownPath(sourcePath)) {
    return false;
  }
  const resolvedSourcePath = path.resolve(sourcePath);
  const blockedRoots = [
    path.resolve(runtimeContextSessionsDir()),
    path.resolve(legacyCodexContextSessionsDir()),
  ];
  if (blockedRoots.some((root) => isPathInside(root, resolvedSourcePath))) {
    return false;
  }
  const allowedRoots = Array.from(new Set([
    path.resolve(canonicalLibraryDir()),
    path.resolve(path.join(fieldTheoryDir(), 'librarian', 'artifacts')),
    path.resolve(path.join(fieldTheoryRoot(), 'librarian', 'artifacts')),
  ]));
  if (!allowedRoots.some((root) => isPathInside(root, resolvedSourcePath))) {
    return false;
  }
  try {
    return fs.statSync(resolvedSourcePath).isFile();
  } catch {
    return false;
  }
}

function sourceDocumentVersion(sourcePath: string | null): DocumentVersion | null {
  if (!isEditableCurrentSourcePath(sourcePath)) return null;
  try {
    return readDocumentVersion(path.resolve(sourcePath!));
  } catch {
    return null;
  }
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
  const sourcePath = stringField(documentRecord.path);

  return {
    manifestPath,
    updatedAt: stringField(manifest.updatedAt),
    activeDocument: {
      title: stringField(documentRecord.title),
      path: sourcePath,
      shellQuotedPath: stringField(documentRecord.shellQuotedPath) ?? (sourcePath ? quoteForPosixShell(sourcePath) : null),
      kind: stringField(documentRecord.kind),
      contentMode: stringField(documentRecord.contentMode),
      contentPath,
      shellQuotedContentPath: stringField(documentRecord.shellQuotedContentPath) ?? quoteForPosixShell(contentPath),
      lineMapping: readLineMapping(documentRecord.lineMapping),
      version: sourceDocumentVersion(sourcePath),
    },
    documentEdit: currentDocumentEditProtocol(),
    selection: readSelection(manifest.selection, sessionDir),
    recent: readRelatedPages(manifest.recent, sessionDir),
    includedPages: readRelatedPages(manifest.includedPages, sessionDir),
  };
}

export function readCurrentDocumentContext(manifestPath = findCurrentContextManifest()): CurrentDocumentContext {
  const summary = readCurrentDocumentSummary(manifestPath);
  const sourcePath = summary.activeDocument.path;
  const contentPath = isEditableCurrentSourcePath(sourcePath) ? path.resolve(sourcePath!) : summary.activeDocument.contentPath;
  return {
    ...summary,
    content: fs.readFileSync(contentPath, 'utf-8'),
  };
}

function lineNumberInstructions(lineMapping: CurrentDocumentLineMapping | null, contentMode: string | null): string {
  if (lineMapping?.activeLineKind === 'renderedVisual') {
    return 'The user is viewing rendered visual lines. For visible or on-screen line questions, use lineNumbers.lines[].visibleLine. Do not derive visible line numbers by splitting content on newlines; sourceLine maps each visible row back to Markdown.';
  }
  if (lineMapping?.activeLineKind === 'source') {
    return 'The user is viewing Markdown source lines. Visible line numbers match sourceLine and the content field newline numbers.';
  }
  if (contentMode && contentMode !== 'markdown') {
    return `The user is viewing ${contentMode}, but no line map was attached. Treat content newline numbers as Markdown source lines, and say when a visible line cannot be resolved.`;
  }
  return 'No line map was attached. Treat content newline numbers as Markdown source lines.';
}

function currentDocumentLineNumbers(activeDocument: CurrentDocumentSummary['activeDocument']): CurrentDocumentLineNumbers {
  const lineMapping = activeDocument.lineMapping;
  return {
    activeSurface: lineMapping?.contentMode ?? activeDocument.contentMode,
    activeLineKind: lineMapping?.activeLineKind ?? (activeDocument.contentMode === 'markdown' ? 'source' : null),
    visibleRowsOnly: lineMapping?.visibleRowsOnly ?? false,
    instructions: lineNumberInstructions(lineMapping, activeDocument.contentMode),
    lines: lineMapping?.lines ?? [],
  };
}

export function currentDocumentJson(context: CurrentDocumentSummary | CurrentDocumentContext): CurrentDocumentAgentJson {
  const output: CurrentDocumentAgentJson = {
    title: context.activeDocument.title,
    kind: context.activeDocument.kind,
    contentMode: context.activeDocument.contentMode,
    lineNumbers: currentDocumentLineNumbers(context.activeDocument),
    sourcePath: context.activeDocument.path,
    editable: context.activeDocument.version !== null,
    version: context.activeDocument.version,
    updateCommand: context.documentEdit.updateCommand,
    updatedAt: context.updatedAt,
    selection: context.selection ? { preview: context.selection.preview } : null,
    recent: context.recent.map((page) => ({ title: page.title, kind: page.kind })),
    includedPages: context.includedPages.map((page) => ({ title: page.title, kind: page.kind })),
  };
  if ('content' in context) output.content = context.content;
  return output;
}

export function formatCurrentDocumentContext(context: CurrentDocumentContext): string {
  const lines = [
    '# Field Theory Current Document',
    '',
    `title: ${context.activeDocument.title ?? '(untitled)'}`,
    `readCurrentCommand: ${context.documentEdit.readCommand}`,
    `editCurrentCommand: ${context.documentEdit.updateCommand}`,
    `editInstructions: ${context.documentEdit.instructions}`,
    `editWarning: ${context.documentEdit.warning}`,
    `source: ${context.activeDocument.path ?? '(unknown)'}`,
    `kind: ${context.activeDocument.kind ?? '(unknown)'}`,
    `contentMode: ${context.activeDocument.contentMode ?? '(unknown)'}`,
    `updatedAt: ${context.updatedAt ?? '(unknown)'}`,
    `manifest: ${context.manifestPath}`,
    `lineMapping: ${context.activeDocument.lineMapping ? 'available' : '(none)'}`,
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
    `readCurrentCommand: ${context.documentEdit.readCommand}`,
    `editCurrentCommand: ${context.documentEdit.updateCommand}`,
    `editInstructions: ${context.documentEdit.instructions}`,
    `editWarning: ${context.documentEdit.warning}`,
    `source: ${context.activeDocument.path ?? '(unknown)'}`,
    `kind: ${context.activeDocument.kind ?? '(unknown)'}`,
    `contentMode: ${context.activeDocument.contentMode ?? '(unknown)'}`,
    `updatedAt: ${context.updatedAt ?? '(unknown)'}`,
    `manifest: ${context.manifestPath}`,
    `lineMapping: ${context.activeDocument.lineMapping ? 'available' : '(none)'}`,
    '',
  ].join('\n');
}
