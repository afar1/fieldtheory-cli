import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readClassificationLock, withClassificationLock } from '../src/classification-lock.js';
import { formatBookmarkStatus, formatBookmarkSummary } from '../src/bookmarks-service.js';

test('bookmark status and summary expose the active classification job', () => {
  const view = {
    connected: false, bookmarkCount: 3, classificationTotal: 3,
    categoriesDone: 2, domainsDone: 1, lastUpdated: null, mode: 'GraphQL', cachePath: '/tmp/cache',
    classificationEngine: 'codex',
    classificationJob: { pid: 123, kind: 'classify' as const, startedAt: '2026-10-08T00:00:00Z' },
  };
  assert.match(formatBookmarkStatus(view), /classification: running \(classify, pid 123, 50\/batch\)/);
  assert.match(formatBookmarkSummary(view), /classification=classify:123:50/);
});

test('classification lock rejects overlap and cleans up after failure', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-'));
  const previous = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    assert.equal(readClassificationLock(), null);
    await assert.rejects(withClassificationLock('classify', async () => {
      assert.equal(readClassificationLock()?.kind, 'classify');
      await assert.rejects(withClassificationLock('classify-domains', async () => {}), /already running/);
      throw new Error('batch failed');
    }), /batch failed/);
    assert.equal(readClassificationLock(), null);
    fs.writeFileSync(path.join(dir, 'classification-lock.json'), 'null');
    assert.equal(readClassificationLock(), null);
    fs.writeFileSync(path.join(dir, 'classification-lock.json'), 'invalid');
    await withClassificationLock('classify-domains', async () => {
      assert.equal(readClassificationLock()?.kind, 'classify-domains');
    });
    assert.equal(readClassificationLock(), null);
  } finally {
    if (previous === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Real processes share one lock; an exclusive marker detects overlapping callbacks.
for (const stale of ['missing', 'malformed', 'dead']) {
  test(`multiprocess classification excludes overlap (stale=${stale})`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-process-'));
    const worker = path.join(dir, 'worker.mjs');
    const moduleUrl = new URL('../src/classification-lock.ts', import.meta.url).href;
    fs.writeFileSync(worker, `
      import fs from 'node:fs';
      import { withClassificationLock } from ${JSON.stringify(moduleUrl)};
      process.send('ready');
      process.once('message', async () => {
        try {
          await withClassificationLock('classify', async () => {
            const marker = process.env.FT_DATA_DIR + '/in-callback';
            fs.writeFileSync(marker, '', { flag: 'wx' });
            await new Promise(resolve => setTimeout(resolve, 150));
            fs.unlinkSync(marker);
          });
          process.exit(0);
        } catch (error) {
          if (/already running/.test(error.message)) process.exit(0);
          console.error(error);
          process.exit(1);
        }
      });
    `);
    try {
      for (let round = 0; round < 8; round++) {
        if (stale === 'malformed') fs.writeFileSync(path.join(dir, 'classification-lock.json'), 'invalid');
        if (stale === 'dead') {
          const dead = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
          await once(dead, 'exit');
          fs.writeFileSync(path.join(dir, 'classification-lock.json'), JSON.stringify({
            pid: dead.pid, kind: 'classify', startedAt: new Date().toISOString(),
          }));
        }
        const workers = Array.from({ length: 6 }, () => spawn(process.execPath,
          ['--import', 'tsx', worker], {
            env: { ...process.env, FT_DATA_DIR: dir }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
          }));
        let errors = '';
        workers.forEach(child => child.stderr?.on('data', data => { errors += data; }));
        const exits = workers.map(child => once(child, 'exit'));
        await Promise.all(workers.map(child => once(child, 'message')));
        workers.forEach(child => child.send('start'));
        const results = await Promise.all(exits);
        assert.ok(results.every(([code]) => code === 0), errors);
        assert.equal(fs.existsSync(path.join(dir, 'classification-lock.json')), false);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('release keeps a replacement owner and a stranded guard fails closed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-lock-owner-'));
  const previous = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  const file = path.join(dir, 'classification-lock.json');
  try {
    const replacement = JSON.stringify({ pid: process.pid, kind: 'classify-domains', startedAt: 'replacement' });
    await withClassificationLock('classify', async () => {
      fs.writeFileSync(file, replacement);
    });
    assert.equal(fs.readFileSync(file, 'utf8'), replacement);
    fs.unlinkSync(file);
    fs.writeFileSync(file + '.guard', '');
    let entered = false;
    await assert.rejects(withClassificationLock('classify', async () => { entered = true; }), /guard is busy/);
    assert.equal(entered, false);
    assert.equal(fs.existsSync(file + '.guard'), true);
  } finally {
    if (previous === undefined) delete process.env.FT_DATA_DIR;
    else process.env.FT_DATA_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
