import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readClassificationLock, withClassificationLock } from '../src/bookmark-classify-llm.js';

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
