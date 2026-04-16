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

test('withClassificationLock preserves callback errors even when they carry EEXIST', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const error = Object.assign(new Error('boom'), { code: 'EEXIST' });
    await assert.rejects(
      () => withClassificationLock('classify', async () => { throw error; }),
      (caught: unknown) => caught === error,
    );
    assert.equal(readClassificationLock(), null);
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

test('readClassificationLock tolerates lock removal while checking malformed content', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-'));
  process.env.FT_DATA_DIR = tmpDir;

  const originalStatSync = fs.statSync;
  try {
    const lockPath = classificationLockPath();
    fs.writeFileSync(lockPath, '{\n', 'utf8');
    fs.statSync = ((targetPath: fs.PathLike, options?: fs.StatOptions) => {
      if (String(targetPath) === lockPath) {
        const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
        throw error;
      }
      return originalStatSync(targetPath, options as any);
    }) as typeof fs.statSync;

    assert.equal(readClassificationLock(), null);
  } finally {
    fs.statSync = originalStatSync;
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

test('withClassificationLock does not delete a replacement lock after stale cleanup', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-'));
  process.env.FT_DATA_DIR = tmpDir;

  const originalRmSync = fs.rmSync;
  let injectedReplacement = false;
  try {
    const lockPath = classificationLockPath();
    fs.writeFileSync(lockPath, '{\n', 'utf8');
    const staleTime = new Date(Date.now() - 10_000);
    fs.utimesSync(lockPath, staleTime, staleTime);

    fs.rmSync = ((targetPath: fs.PathLike, options?: fs.RmOptions) => {
      originalRmSync(targetPath, options);
      if (!injectedReplacement && String(targetPath) === lockPath) {
        injectedReplacement = true;
        fs.writeFileSync(lockPath, JSON.stringify({
          pid: process.pid,
          kind: 'classify-domains',
          startedAt: '2026-04-16T22:27:00.000Z',
          processStartedAt: new Date(Math.floor((Date.now() - (process.uptime() * 1000)) / 1000) * 1000).toISOString(),
        }), 'utf8');
      }
    }) as typeof fs.rmSync;

    await assert.rejects(
      () => withClassificationLock('classify', async () => 'nope'),
      /Classification already running \(classify-domains, pid \d+\)/,
    );

    const lock = readClassificationLock();
    assert.equal(lock?.kind, 'classify-domains');
  } finally {
    fs.rmSync = originalRmSync;
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

test('readClassificationLock removes stale locks when pid was recycled', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const lockPath = classificationLockPath();
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      kind: 'classify',
      startedAt: '2026-04-16T00:00:00.000Z',
      processStartedAt: '2000-01-01T00:00:00.000Z',
    }), 'utf8');

    assert.equal(readClassificationLock(), null);
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    delete process.env.FT_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readClassificationLock normalizes equivalent process start timestamps', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-'));
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const lockPath = classificationLockPath();
    const startedAt = new Date(Math.floor((Date.now() - (process.uptime() * 1000)) / 1000) * 1000).toISOString();
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      kind: 'classify',
      startedAt: '2026-04-16T00:00:00.000Z',
      processStartedAt: startedAt.replace('.000Z', 'Z'),
    }), 'utf8');

    const lock = readClassificationLock();
    assert.equal(lock?.pid, process.pid);
    assert.equal(lock?.kind, 'classify');
  } finally {
    delete process.env.FT_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
