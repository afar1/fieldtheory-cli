import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  currentDocumentJson,
  findCurrentContextManifest,
  formatCurrentDocumentContext,
  formatCurrentDocumentSummary,
  readCurrentDocumentContext,
  readCurrentDocumentSummary,
} from '../src/current.js';

function writeContext(root: string, id: string, title: string, content: string, updatedAt: string, extra: Record<string, unknown> = {}): string {
  const sessionDir = path.join(root, id);
  fs.mkdirSync(sessionDir, { recursive: true });
  const contentPath = path.join(sessionDir, 'active.md');
  const manifestPath = path.join(sessionDir, 'context.json');
  fs.writeFileSync(contentPath, content);
  fs.writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    updatedAt,
    activeDocument: {
      title,
      path: `/library/${title}.md`,
      kind: 'wiki',
      contentMode: 'rendered',
      contentPath,
    },
    ...extra,
  }));
  return manifestPath;
}

test('readCurrentDocumentContext reads newest Field Theory context manifest', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-'));
  try {
    const sessionsDir = path.join(tmpDir, 'sessions');
    const olderManifest = writeContext(sessionsDir, 'older', 'Older Page', 'old body', '2026-01-01T00:00:00.000Z');
    const newerManifest = writeContext(sessionsDir, 'newer', 'Newer Page', '# Newer\n', '2026-01-02T00:00:00.000Z');
    const olderTime = new Date('2026-01-01T00:00:00.000Z');
    const newerTime = new Date('2026-01-02T00:00:00.000Z');
    fs.utimesSync(olderManifest, olderTime, olderTime);
    fs.utimesSync(newerManifest, newerTime, newerTime);

    assert.equal(findCurrentContextManifest(sessionsDir), newerManifest);

    const summary = readCurrentDocumentSummary(newerManifest);
    assert.equal(summary.activeDocument.title, 'Newer Page');
    assert.equal(summary.documentEdit.readCommand, 'ft current --json');
    assert.equal(summary.documentEdit.updateCommand, 'ft current update --stdin --expected-sha256 <sha>');
    assert.equal(summary.documentEdit.expectedHashField, 'version.sha256');
    assert.match(summary.documentEdit.warning, /write edits through updateCommand/);
    assert.equal('content' in summary, false);
    const agentSummary = currentDocumentJson(summary);
    assert.deepEqual(Object.keys(agentSummary).slice(0, 2), ['title', 'kind']);
    assert.equal(agentSummary.sourcePath, '/library/Newer Page.md');
    assert.equal(agentSummary.lineNumbers.activeSurface, 'rendered');
    assert.equal(agentSummary.lineNumbers.activeLineKind, null);
    assert.match(agentSummary.lineNumbers.instructions, /no line map was attached/i);
    assert.equal(agentSummary.updateCommand, 'ft current update --stdin --expected-sha256 <sha>');
    assert.equal('activeDocument' in agentSummary, false);
    assert.equal('documentEdit' in agentSummary, false);
    assert.equal('contentPath' in agentSummary, false);
    assert.equal('manifestPath' in agentSummary, false);
    assert.equal('content' in agentSummary, false);

    const context = readCurrentDocumentContext(newerManifest);
    assert.equal(context.activeDocument.title, 'Newer Page');
    assert.equal(context.content, '# Newer\n');
    assert.equal(currentDocumentJson(context).content, '# Newer\n');
    assert.match(formatCurrentDocumentContext(context), /title: Newer Page/);
    assert.match(formatCurrentDocumentContext(context), /# Newer/);
    assert.match(formatCurrentDocumentSummary(context), /title: Newer Page/);
    assert.doesNotMatch(formatCurrentDocumentSummary(context), /# Newer/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readCurrentDocumentContext prefers the active source file over stale rendered context', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-source-'));
  const originalLibraryDir = process.env.FT_LIBRARY_DIR;
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, 'library');
  try {
    const sourcePath = path.join(process.env.FT_LIBRARY_DIR, 'scratchpad', 'Sunday Jun 14th.md');
    const sessionDir = path.join(tmpDir, 'session');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sourcePath, '- real source\n');
    const contentPath = path.join(sessionDir, 'active.md');
    const manifestPath = path.join(sessionDir, 'context.json');
    fs.writeFileSync(contentPath, '- stale context\n');
    fs.writeFileSync(manifestPath, JSON.stringify({
      activeDocument: {
        title: 'Sunday Jun 14th',
        path: sourcePath,
        kind: 'wiki',
        contentMode: 'rendered',
        contentPath,
      },
    }));

    const context = readCurrentDocumentContext(manifestPath);
    assert.equal(context.content, '- real source\n');
    assert.equal(context.activeDocument.version?.sha256.length, 64);
  } finally {
    if (originalLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = originalLibraryDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readCurrentDocumentContext supports Field Theory markdown sources outside the Library root', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-librarian-source-'));
  const originalHome = process.env.HOME;
  const originalLibraryDir = process.env.FT_LIBRARY_DIR;
  process.env.HOME = tmpDir;
  process.env.FT_LIBRARY_DIR = path.join(tmpDir, '.fieldtheory', 'library');
  try {
    const sourcePath = path.join(tmpDir, '.fieldtheory', 'librarian', 'artifacts', 'artifact.md');
    const sessionDir = path.join(tmpDir, 'session');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sourcePath, '- real artifact source\n');
    const contentPath = path.join(sessionDir, 'active.md');
    const manifestPath = path.join(sessionDir, 'context.json');
    fs.writeFileSync(contentPath, '- stale rendered context\n');
    fs.writeFileSync(manifestPath, JSON.stringify({
      activeDocument: {
        title: 'Artifact',
        path: sourcePath,
        kind: 'artifact',
        contentMode: 'rendered',
        contentPath,
      },
    }));

    const context = readCurrentDocumentContext(manifestPath);
    assert.equal(context.content, '- real artifact source\n');
    assert.equal(context.activeDocument.version?.sha256.length, 64);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = originalLibraryDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readCurrentDocumentContext treats context cache paths as rendered copies, not editable source files', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-cache-source-'));
  const originalHome = process.env.HOME;
  const originalLibraryDir = process.env.FT_LIBRARY_DIR;
  process.env.HOME = homeDir;
  process.env.FT_LIBRARY_DIR = path.join(homeDir, '.fieldtheory', 'library');
  try {
    const sourcePath = path.join(homeDir, '.fieldtheory', '.codex-context', 'sessions', 'session', 'active.md');
    const sessionDir = path.dirname(sourcePath);
    const manifestPath = path.join(sessionDir, 'context.json');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sourcePath, '- rendered cache only\n');
    fs.writeFileSync(manifestPath, JSON.stringify({
      activeDocument: {
        title: 'Cache Copy',
        path: sourcePath,
        kind: 'wiki',
        contentMode: 'rendered',
        contentPath: sourcePath,
      },
    }));

    const context = readCurrentDocumentContext(manifestPath);
    assert.equal(context.content, '- rendered cache only\n');
    assert.equal(context.activeDocument.version, null);
    const agentJson = currentDocumentJson(context);
    assert.equal(agentJson.editable, false);
    assert.equal(agentJson.version, null);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = originalLibraryDir;
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('findCurrentContextManifest reads the app runtime context before legacy Library context', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-home-'));
  const originalHome = process.env.HOME;
  const originalLibraryDir = process.env.FT_LIBRARY_DIR;
  delete process.env.FT_LIBRARY_DIR;
  process.env.HOME = homeDir;

  try {
    const runtimeSessionsDir = path.join(homeDir, '.fieldtheory', '.codex-context', 'sessions');
    const legacySessionsDir = path.join(homeDir, '.fieldtheory', 'library', 'Codex Context', 'sessions');
    const runtimeManifest = writeContext(runtimeSessionsDir, 'runtime', 'Runtime Page', 'runtime body', '2026-01-03T00:00:00.000Z');
    const legacyManifest = writeContext(legacySessionsDir, 'legacy', 'Legacy Page', 'legacy body', '2026-01-02T00:00:00.000Z');
    const runtimeTime = new Date('2026-01-03T00:00:00.000Z');
    const legacyTime = new Date('2026-01-02T00:00:00.000Z');
    fs.utimesSync(runtimeManifest, runtimeTime, runtimeTime);
    fs.utimesSync(legacyManifest, legacyTime, legacyTime);

    assert.equal(findCurrentContextManifest(), runtimeManifest);
    assert.equal(readCurrentDocumentSummary().activeDocument.title, 'Runtime Page');
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = originalLibraryDir;
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('findCurrentContextManifest prefers the terminal attached context from session state', () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-attached-home-'));
  const originalHome = process.env.HOME;
  const originalLibraryDir = process.env.FT_LIBRARY_DIR;
  delete process.env.FT_LIBRARY_DIR;
  process.env.HOME = homeDir;

  try {
    const runtimeSessionsDir = path.join(homeDir, '.fieldtheory', '.codex-context', 'sessions');
    const attachedManifest = writeContext(runtimeSessionsDir, 'attached', 'Attached Artifact', 'attached body', '2026-01-02T00:00:00.000Z');
    const newerUnattachedManifest = writeContext(runtimeSessionsDir, 'unattached', 'Workflow', 'workflow body', '2026-01-03T00:00:00.000Z');
    fs.utimesSync(attachedManifest, new Date('2026-01-02T00:00:00.000Z'), new Date('2026-01-02T00:00:00.000Z'));
    fs.utimesSync(newerUnattachedManifest, new Date('2026-01-03T00:00:00.000Z'), new Date('2026-01-03T00:00:00.000Z'));

    const sessionStatePath = path.join(homeDir, '.fieldtheory', '.codex-context', 'session-state.json');
    fs.writeFileSync(sessionStatePath, JSON.stringify([{
      id: 'terminal-1',
      cwd: process.cwd(),
      exitedAt: null,
      attachedContexts: [{
        filePath: attachedManifest,
        attachedAt: '2026-01-04T00:00:00.000Z',
        sourcePath: '/Users/afar/.fieldtheory/librarian/artifacts/fieldtheory-2026-05-08-093112-artifact.md',
      }],
    }]));

    assert.equal(findCurrentContextManifest(), attachedManifest);
    assert.equal(readCurrentDocumentSummary().activeDocument.title, 'Attached Artifact');
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = originalLibraryDir;
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('readCurrentDocumentSummary exposes selection, recent, and included page metadata', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-context-fields-'));
  try {
    const sessionsDir = path.join(tmpDir, 'sessions');
    const sessionDir = path.join(sessionsDir, 'session');
    const selectionPath = path.join(sessionDir, 'selection.md');
    const recentPath = path.join(sessionDir, 'recent.md');
    const includedPath = path.join(sessionDir, 'included.md');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(selectionPath, 'selected text');
    fs.writeFileSync(recentPath, 'recent text');
    fs.writeFileSync(includedPath, 'included text');
    const manifestPath = writeContext(sessionsDir, 'session', 'Page', 'body', '2026-01-01T00:00:00.000Z', {
      selection: {
        textPath: selectionPath,
        preview: 'selected text',
      },
      recent: [{
        title: 'Recent Page',
        path: '/library/recent.md',
        kind: 'wiki',
        contentPath: recentPath,
      }],
      includedPages: [{
        title: 'Included Page',
        path: '/library/included.md',
        kind: 'wiki',
        contentPath: includedPath,
      }],
    });

    const summary = readCurrentDocumentSummary(manifestPath);
    assert.equal(summary.selection?.textPath, selectionPath);
    assert.equal(summary.selection?.preview, 'selected text');
    assert.equal(summary.recent[0]?.path, '/library/recent.md');
    assert.equal(summary.recent[0]?.contentPath, recentPath);
    assert.equal(summary.includedPages[0]?.path, '/library/included.md');
    assert.equal(summary.includedPages[0]?.contentPath, includedPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readCurrentDocumentSummary exposes active document line mapping', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-line-map-'));
  try {
    const sessionsDir = path.join(tmpDir, 'sessions');
    const manifestPath = writeContext(sessionsDir, 'session', 'Page', 'body', '2026-01-01T00:00:00.000Z');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const lineMapping = {
      activeLineKind: 'renderedVisual',
      contentMode: 'rendered',
      visibleRowsOnly: true,
      lines: [{
        visibleLine: 20,
        sourceLine: 15,
        rowInSourceLine: 1,
        rowsInSourceLine: 3,
        text: 'The phrase "Ego sum" is Latin for "I am."',
      }],
    };
    manifest.activeDocument.lineMapping = lineMapping;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    const summary = readCurrentDocumentSummary(manifestPath);
    assert.deepEqual(summary.activeDocument.lineMapping, lineMapping);
    assert.match(formatCurrentDocumentSummary(summary), /lineMapping: available/);
    const agentJson = currentDocumentJson(summary);
    assert.equal(agentJson.lineNumbers.activeSurface, 'rendered');
    assert.equal(agentJson.lineNumbers.activeLineKind, 'renderedVisual');
    assert.equal(agentJson.lineNumbers.visibleRowsOnly, true);
    assert.match(agentJson.lineNumbers.instructions, /visible or on-screen line questions/);
    assert.deepEqual(agentJson.lineNumbers.lines, lineMapping.lines);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('formatCurrentDocumentSummary prints the single current-document edit protocol', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-shell-'));
  try {
    const sessionsDir = path.join(tmpDir, 'sessions');
    const manifestPath = writeContext(sessionsDir, 'session', 'Sunday Jun 14th', 'body', '2026-01-01T00:00:00.000Z');

    const summary = readCurrentDocumentSummary(manifestPath);
    assert.equal(summary.activeDocument.path, '/library/Sunday Jun 14th.md');
    assert.equal(summary.activeDocument.shellQuotedPath, "'/library/Sunday Jun 14th.md'");

    const output = formatCurrentDocumentSummary(summary);
    assert.match(output, /readCurrentCommand: ft current --json/);
    assert.match(output, /editCurrentCommand: ft current update --stdin --expected-sha256 <sha>/);
    assert.match(output, /editInstructions: Edit the content field as normal Markdown/);
    assert.match(output, /editWarning: Use sourcePath for identity\/debugging only; write edits through updateCommand\./);
    assert.match(output, /source: \/library\/Sunday Jun 14th\.md/);
    assert.doesNotMatch(output, /readSourceCommand/);
    assert.doesNotMatch(output, /cat '\/library\/Sunday Jun 14th\.md'/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readCurrentDocumentContext rejects content paths outside the session directory', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-'));
  try {
    const sessionsDir = path.join(tmpDir, 'sessions');
    const manifestPath = writeContext(sessionsDir, 'session', 'Page', 'body', '2026-01-01T00:00:00.000Z');
    const secretPath = path.join(tmpDir, 'secret.md');
    fs.writeFileSync(secretPath, 'do not read');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.activeDocument.contentPath = secretPath;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    assert.throws(
      () => readCurrentDocumentContext(manifestPath),
      /must stay inside its session directory/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
