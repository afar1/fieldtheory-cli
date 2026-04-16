import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readClassificationLock, withClassificationLock } from '../src/bookmark-classify-llm.js';
import { classificationLockPath } from '../src/paths.js';

test('withClassificationLock writes and clears a live lock file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    assert.equal(readClassificationLock(), null);

    const result = await withClassificationLock('classify-domains', async () => {
      const lock = readClassificationLock();
      assert.equal(lock?.kind, 'classify-domains');
      assert.equal(lock?.pid, process.pid);
      assert.match(lock?.startedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
      return 'ok';
    });

    assert.equal(result, 'ok');
    assert.equal(readClassificationLock(), null);
  } finally {
    delete process.env.FT_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('withClassificationLock rejects a second concurrent classify run', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    await assert.rejects(
      () => withClassificationLock('classify', async () => withClassificationLock('classify-domains', async () => 'nope')),
      /Classification already running \(classify, pid \d+\)/,
    );
  } finally {
    delete process.env.FT_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readClassificationLock leaves a freshly malformed lock file in place', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const lockPath = classificationLockPath();
    fs.writeFileSync(lockPath, '{\n', 'utf8');

    assert.equal(readClassificationLock(), null);
    assert.equal(fs.existsSync(lockPath), true);
  } finally {
    delete process.env.FT_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('withClassificationLock does not delete a freshly malformed lock file created by another process', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const lockPath = classificationLockPath();
    fs.writeFileSync(lockPath, '{\n', 'utf8');

    await assert.rejects(
      () => withClassificationLock('classify', async () => 'nope'),
      /Classification already running \(lock file initializing\)/,
    );

    assert.equal(fs.existsSync(lockPath), true);
  } finally {
    delete process.env.FT_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readClassificationLock removes malformed lock files only after the grace window', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const lockPath = classificationLockPath();
    fs.writeFileSync(lockPath, '{\n', 'utf8');
    const staleTime = new Date(Date.now() - 10_000);
    fs.utimesSync(lockPath, staleTime, staleTime);

    assert.equal(readClassificationLock(), null);
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    delete process.env.FT_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
