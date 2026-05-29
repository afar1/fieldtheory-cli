import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  findCurrentContextManifest,
  formatCurrentDocumentContext,
  formatCurrentDocumentSummary,
  readCurrentDocumentContext,
  readCurrentDocumentSummary,
} from '../src/current.js';

function writeContext(root: string, id: string, title: string, content: string, updatedAt: string): string {
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
