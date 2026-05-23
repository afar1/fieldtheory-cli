import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { formatAgentContext, getAgentContext } from '../src/agent-context.js';

test('getAgentContext returns last modified file and recent files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-agent-context-'));
  try {
    const older = path.join(tmpDir, 'older.md');
    const newer = path.join(tmpDir, 'newer.md');
    fs.writeFileSync(older, 'old');
    fs.writeFileSync(newer, 'new');
    const oldTime = new Date('2026-01-01T00:00:00.000Z');
    const newTime = new Date('2026-01-02T00:00:00.000Z');
    fs.utimesSync(older, oldTime, oldTime);
    fs.utimesSync(newer, newTime, newTime);

    const context = getAgentContext(tmpDir, 2);
    assert.equal(context.cwd, tmpDir);
    assert.equal(context.lastModifiedFile?.path, 'newer.md');
    assert.deepEqual(context.recentFiles.map((file) => file.path), ['newer.md', 'older.md']);
    assert.match(formatAgentContext(context), /lastModifiedFile: newer\.md/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('getAgentContext rejects a missing repo path', () => {
  const missing = path.join(os.tmpdir(), `ft-agent-context-missing-${Date.now()}`);
  assert.throws(
    () => getAgentContext(missing, 2),
    /Repo path not found/,
  );
});

test('getAgentContext rejects a file repo path', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-agent-context-file-'));
  try {
    const filePath = path.join(tmpDir, 'not-a-directory.md');
    fs.writeFileSync(filePath, 'hello');
    assert.throws(
      () => getAgentContext(filePath, 2),
      /Repo path is not a directory/,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
