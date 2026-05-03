import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IdeasJobPlan } from '../src/ideas-jobs.js';

async function withNightlyStore(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-ideas-nightly-test-'));
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

async function getNightly() {
  return import('../src/ideas-nightly.js');
}

const nightlyPlan = {
  defaults: true,
  depth: 'quick' as const,
  model: 'opus',
  effort: 'medium',
  nodeTarget: 5,
};

test('createIdeasNightlySchedule: stores a reusable nightly plan under ideas', async () => {
  await withNightlyStore(async (dir) => {
    const nightly = await getNightly();
    const schedule = nightly.createIdeasNightlySchedule({
      id: 'default',
      time: '02:30',
      cwd: '/tmp/work',
      plan: nightlyPlan,
    });

    assert.equal(schedule.id, 'default');
    assert.equal(schedule.time, '02:30');
    assert.equal(schedule.cwd, '/tmp/work');
    assert.ok(schedule.schedulePath.startsWith(path.join(dir, 'ideas', 'nightly')));
    assert.ok(schedule.logPath.startsWith(path.join(dir, 'ideas', 'nightly')));

    const reloaded = nightly.readIdeasNightlySchedule('default');
    assert.equal(reloaded?.plan.defaults, true);
    assert.equal(reloaded?.plan.nodeTarget, 5);

    const log = await readFile(schedule.logPath, 'utf-8');
    assert.match(log, /saved:/);
  });
});

test('writeNightlyLaunchAgent: creates a LaunchAgent plist that ticks the schedule', async () => {
  await withNightlyStore(async () => {
    const nightly = await getNightly();
    const home = await mkdtemp(path.join(tmpdir(), 'ft-launch-agent-home-'));
    try {
      const schedule = nightly.createIdeasNightlySchedule({
        id: 'goal-machine',
        time: '23:05',
        cwd: '/tmp/work',
        plan: nightlyPlan,
      });

      const withAgent = nightly.writeNightlyLaunchAgent({
        schedule,
        invocation: { command: '/usr/local/bin/node', args: ['/usr/local/bin/ft'] },
        homeDir: home,
        pathEnv: '/opt/homebrew/bin:/usr/bin:/bin',
      });

      assert.ok(withAgent.launchAgent);
      const plist = await readFile(withAgent.launchAgent!.plistPath, 'utf-8');
      assert.match(plist, /com\.fieldtheory\.possible\.nightly\.goal-machine/);
      assert.match(plist, /<integer>23<\/integer>/);
      assert.match(plist, /<integer>5<\/integer>/);
      assert.match(plist, /possible/);
      assert.match(plist, /nightly/);
      assert.match(plist, /_tick/);
      assert.match(plist, /goal-machine/);
      assert.match(plist, /\/opt\/homebrew\/bin:\/usr\/bin:\/bin/);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

test('runIdeasNightlyTick: resolves defaults at tick time and starts a background job', async () => {
  await withNightlyStore(async () => {
    const nightly = await getNightly();
    nightly.createIdeasNightlySchedule({
      id: 'default',
      time: '02:00',
      cwd: '/tmp/work',
      plan: nightlyPlan,
    });

    let resolvedPlan: IdeasJobPlan | null = null;
    const job = nightly.runIdeasNightlyTick('default', {
      listSeeds: () => [{
        id: 'seed-1',
        title: 'Saved seed',
        sourceType: 'artifact',
        artifactIds: ['a1'],
        createdAt: '2026-05-01T00:00:00.000Z',
        createdBy: 'user',
        frameId: 'novelty-feasibility',
      }],
      readSeed: () => ({
        id: 'seed-1',
        title: 'Saved seed',
        sourceType: 'artifact',
        artifactIds: ['a1'],
        createdAt: '2026-05-01T00:00:00.000Z',
        createdBy: 'user',
        frameId: 'novelty-feasibility',
      }),
      listRepos: () => ['/repo/a', '/repo/b'],
      startBackgroundJob: (plan) => {
        resolvedPlan = plan;
        return {
          id: 'job-1',
          status: 'running',
          createdAt: '2026-05-03T00:00:00.000Z',
          updatedAt: '2026-05-03T00:00:00.000Z',
          cwd: '/tmp/work',
          plan,
          jobPath: '/tmp/job.json',
          logPath: '/tmp/job.log',
          pid: 123,
        };
      },
    });

    assert.equal(job.id, 'job-1');
    assert.deepEqual(resolvedPlan, {
      seedArtifactIds: undefined,
      seedId: 'seed-1',
      repos: ['/repo/a', '/repo/b'],
      frameId: 'novelty-feasibility',
      depth: 'quick',
      engine: undefined,
      model: 'opus',
      effort: 'medium',
      nodeTarget: 5,
      steering: undefined,
    });
  });
});

test('validateNightlyTime: requires a 24-hour HH:MM time', async () => {
  const nightly = await getNightly();
  assert.equal(nightly.validateNightlyTime('00:00'), '00:00');
  assert.equal(nightly.validateNightlyTime('23:59'), '23:59');
  assert.throws(() => nightly.validateNightlyTime('24:00'), /HH:MM/);
  assert.throws(() => nightly.validateNightlyTime('2:00'), /HH:MM/);
});
