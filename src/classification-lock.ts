import fs from 'node:fs';
import path from 'node:path';
import { dataDir, ensureDataDir } from './paths.js';

export interface ClassificationLock {
  pid: number;
  kind: 'classify' | 'classify-domains';
  startedAt: string;
}

function lockPath(): string {
  return path.join(dataDir(), 'classification-lock.json');
}

export function readClassificationLock(): ClassificationLock | null {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath(), 'utf8'));
    if (!lock || typeof lock !== 'object') return null;
    if (!Number.isInteger(lock.pid) || lock.pid <= 0 ||
        !['classify', 'classify-domains'].includes(lock.kind) ||
        typeof lock.startedAt !== 'string') return null;
    try {
      process.kill(lock.pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return null;
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    }
    return lock;
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

// Every mutation uses this short critical section. Never reclaim the guard:
// deleting a guard based on an earlier read would recreate the stale-lock race.
async function mutateLock<T>(fn: () => T): Promise<T> {
  const guard = lockPath() + '.guard';
  for (let attempt = 0; attempt < 100; attempt++) {
    let fd: number;
    try {
      fd = fs.openSync(guard, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await new Promise(resolve => setTimeout(resolve, 10));
      continue;
    }
    try {
      return fn();
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(guard);
    }
  }
  throw new Error(`Classification lock guard is busy: ${guard}. If a process crashed during lock setup, stop classification processes before removing this guard.`);
}

export async function withClassificationLock<T>(
  kind: ClassificationLock['kind'], fn: () => Promise<T>,
): Promise<T> {
  ensureDataDir();
  const lock: ClassificationLock = { pid: process.pid, kind, startedAt: new Date().toISOString() };
  const contents = JSON.stringify(lock);
  await mutateLock(() => {
    const existing = readClassificationLock();
    if (existing) throw new Error(`Classification already running (${existing.kind}, pid ${existing.pid})`);
    // Readers never see a partial record. The guard serializes stale replacement.
    const temporary = lockPath() + '.tmp';
    try {
      fs.writeFileSync(temporary, contents, { mode: 0o600 });
      fs.renameSync(temporary, lockPath());
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  });
  try {
    return await fn();
  } finally {
    await mutateLock(() => {
      try {
        if (fs.readFileSync(lockPath(), 'utf8') === contents) fs.unlinkSync(lockPath());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    });
  }
}
