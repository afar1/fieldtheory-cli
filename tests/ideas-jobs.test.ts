import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function withJobsStore(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-ideas-jobs-test-'));
  const saved = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (saved !== undefined) process.env.FT_DATA_DIR = saved;
    else delete process.env.FT_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
}

async function getJobs() {
  return import('../src/ideas-jobs.js');
}

const plan = {
  seedId: 'seed-1',
  repos: ['/tmp/repo-a', '/tmp/repo-b'],
  frameId: 'impact-effort',
  depth: 'quick' as const,
  nodeTarget: 7,
};

test('createIdeasJob: stores job json and log beside ideas artifacts', async () => {
  await withJobsStore(async (dir) => {
    const jobs = await getJobs();
    const job = jobs.createIdeasJob(plan, { cwd: '/tmp/work' });

    assert.equal(job.status, 'queued');
    assert.equal(job.cwd, '/tmp/work');
    assert.ok(job.jobPath.startsWith(path.join(dir, 'ideas', 'jobs')));
    assert.ok(job.logPath.startsWith(path.join(dir, 'ideas', 'jobs')));

    const reloaded = jobs.readIdeasJob(job.id);
    assert.equal(reloaded?.id, job.id);
    assert.deepEqual(reloaded?.plan.repos, ['/tmp/repo-a', '/tmp/repo-b']);

    const log = await readFile(job.logPath, 'utf-8');
    assert.match(log, /queued:/);
    assert.match(log, /nodes=7/);
  });
});

test('startIdeasBackgroundJob: spawns the hidden worker and marks the job running', async () => {
  await withJobsStore(async () => {
    const jobs = await getJobs();
    const calls: Array<{ command: string; args: string[]; cwd: string | undefined }> = [];
    const fakeSpawn = ((command: string, args: string[], options: { cwd?: string }) => {
      calls.push({ command, args, cwd: options.cwd });
      return { pid: process.pid, unref: () => undefined };
    }) as unknown as typeof import('node:child_process').spawn;

    const job = jobs.startIdeasBackgroundJob(plan, { cwd: '/tmp/work', spawnImpl: fakeSpawn });

    assert.equal(job.status, 'running');
    assert.equal(job.pid, process.pid);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.command, process.execPath);
    assert.ok(calls[0]!.args.includes('possible'));
    assert.ok(calls[0]!.args.includes('_run-job'));
    assert.ok(calls[0]!.args.includes(job.id));
    assert.equal(calls[0]!.cwd, '/tmp/work');
  });
});

test('markIdeasJobRunning: does not duplicate the same running log entry', async () => {
  await withJobsStore(async () => {
    const jobs = await getJobs();
    const job = jobs.createIdeasJob(plan);

    jobs.markIdeasJobRunning(job.id, process.pid);
    jobs.markIdeasJobRunning(job.id, process.pid);

    const log = await readFile(job.logPath, 'utf-8');
    assert.equal((log.match(new RegExp(`running: pid=${process.pid}`, 'g')) ?? []).length, 1);
  });
});

test('completeIdeasJob: records result ids and formats job detail with logs', async () => {
  await withJobsStore(async () => {
    const jobs = await getJobs();
    const job = jobs.createIdeasJob(plan);
    const completed = jobs.completeIdeasJob(job.id, {
      runIds: ['adj-1', 'adj-2'],
      batchId: 'batch-1',
      frameId: 'impact-effort',
      frameName: 'Impact × Effort',
      model: 'claude/opus/effort=medium',
      nodeTarget: 7,
      dotCount: 14,
      topDots: [],
    });

    assert.equal(completed.status, 'succeeded');
    assert.deepEqual(completed.runIds, ['adj-1', 'adj-2']);
    assert.equal(completed.batchId, 'batch-1');
    assert.equal(completed.dotCount, 14);

    const formatted = jobs.formatIdeasJob(completed, { includeLog: true });
    assert.match(formatted, /status: succeeded/);
    assert.match(formatted, /runs: adj-1, adj-2/);
    assert.match(formatted, /batch: batch-1/);
    assert.match(formatted, /Last \d+ log lines?:/);
  });
});

test('formatIdeasJobList: shows status, shape, and result summary', async () => {
  const jobs = await getJobs();
  const output = jobs.formatIdeasJobList([
    {
      id: 'job-1',
      status: 'succeeded',
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:01:00.000Z',
      cwd: '/tmp/work',
      plan,
      jobPath: '/tmp/job.json',
      logPath: '/tmp/job.log',
      runIds: ['adj-1'],
      dotCount: 7,
    },
  ]);

  assert.match(output, /job-1/);
  assert.match(output, /succeeded/);
  assert.match(output, /seed=seed-1/);
  assert.match(output, /repos=2/);
  assert.match(output, /runs:1 dots:7/);
});
