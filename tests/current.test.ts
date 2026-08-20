import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  findCurrentContextManifest,
  formatCurrentDocumentContext,
  formatCurrentDocumentSummary,
  readCurrentDocumentView,
  readCurrentDocumentContext,
  readCurrentDocumentSummary,
  updateCurrentDocument,
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

async function withLibraryDir<T>(libraryDir: string, fn: () => T | Promise<T>): Promise<T> {
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  process.env.FT_LIBRARY_DIR = libraryDir;
  try {
    return await fn();
  } finally {
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
  }
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
    assert.equal('content' in summary, false);

    const context = readCurrentDocumentContext(newerManifest);
    assert.equal(context.activeDocument.title, 'Newer Page');
    assert.equal(context.content, '# Newer\n');
    assert.match(formatCurrentDocumentContext(context), /title: Newer Page/);
    assert.match(formatCurrentDocumentContext(context), /# Newer/);
    assert.match(formatCurrentDocumentSummary(context), /title: Newer Page/);
    assert.doesNotMatch(formatCurrentDocumentSummary(context), /# Newer/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readCurrentDocumentView reads editable source content and version', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-view-'));
  try {
    const libraryDir = path.join(tmpDir, 'library');
    await withLibraryDir(libraryDir, () => {
      const sessionsDir = path.join(tmpDir, 'sessions');
      const sourcePath = path.join(libraryDir, 'Library Page.md');
      fs.mkdirSync(libraryDir, { recursive: true });
      fs.writeFileSync(sourcePath, '# Source\n');
      const manifestPath = writeContext(sessionsDir, 'session', 'Library Page', '# Cached\n', '2026-01-01T00:00:00.000Z');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.activeDocument.path = sourcePath;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));

      const view = readCurrentDocumentView(manifestPath);

      assert.equal(view.title, 'Library Page');
      assert.equal(fs.realpathSync(view.sourcePath ?? ''), fs.realpathSync(sourcePath));
      assert.equal(view.editable, true);
      assert.equal(view.content, '# Source\n');
      assert.equal(view.version?.size, 9);
      assert.match(view.updateCommand ?? '', /^ft current update --stdin --expected-sha256 [a-f0-9]{64}$/);
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('updateCurrentDocument writes the editable source when the expected hash matches', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-update-'));
  try {
    const libraryDir = path.join(tmpDir, 'library');
    await withLibraryDir(libraryDir, async () => {
      const sessionsDir = path.join(tmpDir, 'sessions');
      const sourcePath = path.join(libraryDir, 'Library Page.md');
      fs.mkdirSync(libraryDir, { recursive: true });
      fs.writeFileSync(sourcePath, '# Before\n');
      const manifestPath = writeContext(sessionsDir, 'session', 'Library Page', '# Cached\n', '2026-01-01T00:00:00.000Z');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.activeDocument.path = sourcePath;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));

      const before = readCurrentDocumentView(manifestPath);
      const after = await updateCurrentDocument({
        manifestPath,
        content: '# After\n',
        expectedSha256: before.version?.sha256,
      });

      assert.equal(fs.readFileSync(sourcePath, 'utf-8'), '# After\n');
      assert.equal(readCurrentDocumentContext(manifestPath).content, '# Cached\n');
      assert.equal(fs.realpathSync(after.sourcePath ?? ''), fs.realpathSync(sourcePath));
      assert.notEqual(after.version?.sha256, before.version?.sha256);
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('updateCurrentDocument rejects stale expected hashes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-stale-'));
  try {
    const libraryDir = path.join(tmpDir, 'library');
    await withLibraryDir(libraryDir, async () => {
      const sessionsDir = path.join(tmpDir, 'sessions');
      const sourcePath = path.join(libraryDir, 'Library Page.md');
      fs.mkdirSync(libraryDir, { recursive: true });
      fs.writeFileSync(sourcePath, '# Before\n');
      const manifestPath = writeContext(sessionsDir, 'session', 'Library Page', '# Cached\n', '2026-01-01T00:00:00.000Z');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.activeDocument.path = sourcePath;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));

      const before = readCurrentDocumentView(manifestPath);
      fs.writeFileSync(sourcePath, '# Changed elsewhere\n');

      await assert.rejects(
        () => updateCurrentDocument({
          manifestPath,
          content: '# After\n',
          expectedSha256: before.version?.sha256,
        }),
        /File changed on disk/,
      );
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('updateCurrentDocument rejects non-editable current documents', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-readonly-'));
  try {
    const sessionsDir = path.join(tmpDir, 'sessions');
    const manifestPath = writeContext(sessionsDir, 'session', 'Generated Page', '# Cached\n', '2026-01-01T00:00:00.000Z');
    const view = readCurrentDocumentView(manifestPath);

    assert.equal(view.editable, false);
    assert.equal(view.sourcePath, null);
    assert.equal(view.version, null);
    assert.equal(view.content, '# Cached\n');

    await assert.rejects(
      () => updateCurrentDocument({
        manifestPath,
        content: '# After\n',
        expectedSha256: '0'.repeat(64),
      }),
      /not editable/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('updateCurrentDocument rejects app-owned River shared cache documents', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-river-'));
  try {
    const libraryDir = path.join(tmpDir, 'library');
    await withLibraryDir(libraryDir, async () => {
      const sessionsDir = path.join(tmpDir, 'sessions');
      const sourcePath = path.join(libraryDir, 'River (shared)', 'Brief.md');
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.writeFileSync(sourcePath, '# River\n');
      const manifestPath = writeContext(sessionsDir, 'session', 'River Brief', '# Cached\n', '2026-01-01T00:00:00.000Z');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.activeDocument.path = sourcePath;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      const view = readCurrentDocumentView(manifestPath);

      assert.equal(view.editable, false);
      assert.equal(view.content, '# Cached\n');
      await assert.rejects(
        () => updateCurrentDocument({
          manifestPath,
          content: '# After\n',
          expectedSha256: '0'.repeat(64),
        }),
        /not editable/,
      );
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('updateCurrentDocument rejects outside symlinks to editable documents', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-symlink-'));
  try {
    const libraryDir = path.join(tmpDir, 'library');
    await withLibraryDir(libraryDir, async () => {
      const sessionsDir = path.join(tmpDir, 'sessions');
      const sourcePath = path.join(libraryDir, 'Allowed.md');
      const outsidePath = path.join(tmpDir, 'outside.md');
      fs.mkdirSync(libraryDir, { recursive: true });
      fs.writeFileSync(sourcePath, '# Allowed\n');
      fs.symlinkSync(sourcePath, outsidePath);
      const manifestPath = writeContext(sessionsDir, 'session', 'Allowed', '# Cached\n', '2026-01-01T00:00:00.000Z');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.activeDocument.path = outsidePath;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      const view = readCurrentDocumentView(manifestPath);

      assert.equal(view.editable, false);
      await assert.rejects(
        () => updateCurrentDocument({
          manifestPath,
          content: '# After\n',
          expectedSha256: '0'.repeat(64),
        }),
        /not editable/,
      );
      assert.equal(fs.lstatSync(outsidePath).isSymbolicLink(), true);
      assert.equal(fs.readFileSync(sourcePath, 'utf-8'), '# Allowed\n');
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('updateCurrentDocument rejects River shared cache under the active legacy library root', async () => {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-current-legacy-river-'));
  const previousHome = process.env.HOME;
  const previousLibraryDir = process.env.FT_LIBRARY_DIR;
  const previousCommandsDir = process.env.FT_COMMANDS_DIR;
  delete process.env.FT_LIBRARY_DIR;
  delete process.env.FT_COMMANDS_DIR;
  process.env.HOME = homeDir;
  try {
    const legacyLibraryDir = path.join(homeDir, '.ft-bookmarks', 'md');
    const sourcePath = path.join(legacyLibraryDir, 'River (shared)', 'Brief.md');
    const sessionsDir = path.join(homeDir, 'sessions');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, '# Legacy River\n');
    const manifestPath = writeContext(sessionsDir, 'session', 'Legacy River', '# Cached\n', '2026-01-01T00:00:00.000Z');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.activeDocument.path = sourcePath;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const view = readCurrentDocumentView(manifestPath);

    assert.equal(view.editable, false);
    await assert.rejects(
      () => updateCurrentDocument({
        manifestPath,
        content: '# After\n',
        expectedSha256: '0'.repeat(64),
      }),
      /not editable/,
    );
    assert.equal(fs.readFileSync(sourcePath, 'utf-8'), '# Legacy River\n');
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousLibraryDir === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previousLibraryDir;
    if (previousCommandsDir === undefined) delete process.env.FT_COMMANDS_DIR;
    else process.env.FT_COMMANDS_DIR = previousCommandsDir;
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
