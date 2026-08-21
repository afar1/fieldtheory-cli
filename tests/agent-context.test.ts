import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

test('getAgentContext prefers dirty git files before scanning every tracked file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-agent-context-git-'));
  try {
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'clean.md'), 'clean');
    fs.writeFileSync(path.join(tmpDir, 'dirty.md'), 'dirty');
    execFileSync('git', ['add', 'clean.md', 'dirty.md'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'init'], { cwd: tmpDir, stdio: 'ignore' });

    fs.writeFileSync(path.join(tmpDir, 'dirty.md'), 'dirty changed');
    fs.utimesSync(path.join(tmpDir, 'clean.md'), new Date('2026-01-03T00:00:00.000Z'), new Date('2026-01-03T00:00:00.000Z'));
    fs.utimesSync(path.join(tmpDir, 'dirty.md'), new Date('2026-01-02T00:00:00.000Z'), new Date('2026-01-02T00:00:00.000Z'));

    const context = getAgentContext(tmpDir, 5);
    assert.deepEqual(context.recentFiles.map((file) => file.path), ['dirty.md']);
    assert.equal(context.lastModifiedFile?.path, 'dirty.md');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
