import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { ideasRoot } from './paths.js';
import { resolveFrameIdForRun } from './ideas.js';
import { listIdeasSeeds, pickMostRecentlyUsedSeed, readIdeasSeed, type IdeasSeed } from './ideas-seeds.js';
import { listSavedRepos, resolveRepoList } from './ideas-repos.js';
import { startIdeasBackgroundJob, type IdeasJob, type IdeasJobPlan, type StartIdeasJobOptions } from './ideas-jobs.js';

export interface IdeasNightlyPlan {
  defaults: boolean;
  seedArtifactIds?: string[];
  seedId?: string;
  repos?: string[];
  frameId?: string;
  depth: 'quick' | 'standard' | 'deep';
  engine?: string;
  model?: string;
  effort?: string;
  nodeTarget?: number;
  steering?: string;
}

export interface IdeasNightlySchedule {
  id: string;
  createdAt: string;
  updatedAt: string;
  time: string;
  cwd: string;
  plan: IdeasNightlyPlan;
  schedulePath: string;
  logPath: string;
  launchAgent?: IdeasLaunchAgent;
}

export interface IdeasLaunchAgent {
  label: string;
  plistPath: string;
  loadedAt?: string;
}

export interface CliInvocation {
  command: string;
  args: string[];
}

export interface IdeasNightlyTickDeps {
  listSeeds?: () => IdeasSeed[];
  readSeed?: (id: string) => IdeasSeed | null;
  listRepos?: () => string[];
  startBackgroundJob?: (plan: IdeasJobPlan, opts?: StartIdeasJobOptions) => IdeasJob;
}

export interface LaunchctlResult {
  ok: boolean;
  command: string[];
  stdout: string;
  stderr: string;
  status: number | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function nightlyDir(): string {
  return path.join(ideasRoot(), 'nightly');
}

function schedulePathFor(id: string): string {
  return path.join(nightlyDir(), `${id}.json`);
}

function logPathFor(id: string): string {
  return path.join(nightlyDir(), `${id}.log`);
}

function normalizeScheduleId(input: string | undefined): string {
  const id = (input?.trim() || 'default').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)) {
    throw new Error('Nightly id must be lowercase letters, numbers, or dashes, and start with a letter or number.');
  }
  return id;
}

export function validateNightlyTime(input: string | undefined): string {
  const time = input?.trim() || '02:00';
  const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) throw new Error('Nightly time must be HH:MM in 24-hour local time.');
  return `${match[1]}:${match[2]}`;
}

export function listIdeasNightlySchedules(): IdeasNightlySchedule[] {
  const dir = nightlyDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => readIdeasNightlySchedule(path.basename(file, '.json')))
    .filter((schedule): schedule is IdeasNightlySchedule => Boolean(schedule))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function readIdeasNightlySchedule(id: string): IdeasNightlySchedule | null {
  try {
    return JSON.parse(fs.readFileSync(schedulePathFor(normalizeScheduleId(id)), 'utf-8')) as IdeasNightlySchedule;
  } catch {
    return null;
  }
}

export function createIdeasNightlySchedule(input: {
  id?: string;
  time?: string;
  cwd?: string;
  plan: IdeasNightlyPlan;
}): IdeasNightlySchedule {
  const id = normalizeScheduleId(input.id);
  const createdAt = readIdeasNightlySchedule(id)?.createdAt ?? nowIso();
  const schedule: IdeasNightlySchedule = {
    id,
    createdAt,
    updatedAt: nowIso(),
    time: validateNightlyTime(input.time),
    cwd: input.cwd ?? process.cwd(),
    plan: {
      ...input.plan,
      depth: input.plan.depth ?? 'quick',
      defaults: Boolean(input.plan.defaults),
    },
    schedulePath: schedulePathFor(id),
    logPath: logPathFor(id),
  };

  ensureDir(nightlyDir());
  fs.writeFileSync(schedule.schedulePath, JSON.stringify(schedule, null, 2), { mode: 0o600 });
  appendNightlyLog(schedule, `saved: ${formatNightlyPlan(schedule.plan)}`);
  return schedule;
}

export function deleteIdeasNightlySchedule(id: string): boolean {
  const schedule = readIdeasNightlySchedule(id);
  if (!schedule) return false;
  fs.rmSync(schedule.schedulePath, { force: true });
  return true;
}

export function currentCliInvocation(): CliInvocation {
  const entry = process.argv[1] ?? path.join(process.cwd(), 'bin', 'ft.mjs');
  return {
    command: process.execPath,
    args: [...process.execArgv, entry],
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseHourMinute(time: string): { hour: number; minute: number } {
  const [hour, minute] = validateNightlyTime(time).split(':').map(Number);
  return { hour: hour!, minute: minute! };
}

export function launchAgentLabel(id: string): string {
  return `com.fieldtheory.possible.nightly.${normalizeScheduleId(id)}`;
}

export function launchAgentPlistPath(id: string, homeDir = os.homedir()): string {
  return path.join(homeDir, 'Library', 'LaunchAgents', `${launchAgentLabel(id)}.plist`);
}

export function buildLaunchAgentPlist(input: {
  schedule: IdeasNightlySchedule;
  invocation: CliInvocation;
  pathEnv?: string;
}): string {
  const { hour, minute } = parseHourMinute(input.schedule.time);
  const args = [
    input.invocation.command,
    ...input.invocation.args,
    'possible',
    'nightly',
    '_tick',
    input.schedule.id,
  ];
  const pathEnv = input.pathEnv ?? process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(launchAgentLabel(input.schedule.id))}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(input.schedule.cwd)}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(pathEnv)}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(input.schedule.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(input.schedule.logPath)}</string>
</dict>
</plist>
`;
}

export function writeNightlyLaunchAgent(input: {
  schedule: IdeasNightlySchedule;
  invocation: CliInvocation;
  homeDir?: string;
  pathEnv?: string;
}): IdeasNightlySchedule {
  const plistPath = launchAgentPlistPath(input.schedule.id, input.homeDir);
  ensureDir(path.dirname(plistPath));
  fs.writeFileSync(plistPath, buildLaunchAgentPlist({
    schedule: input.schedule,
    invocation: input.invocation,
    pathEnv: input.pathEnv,
  }), { mode: 0o600 });

  const next: IdeasNightlySchedule = {
    ...input.schedule,
    updatedAt: nowIso(),
    launchAgent: {
      label: launchAgentLabel(input.schedule.id),
      plistPath,
      loadedAt: input.schedule.launchAgent?.loadedAt,
    },
  };
  fs.writeFileSync(next.schedulePath, JSON.stringify(next, null, 2), { mode: 0o600 });
  appendNightlyLog(next, `launchd plist: ${plistPath}`);
  return next;
}

function runLaunchctl(args: string[]): LaunchctlResult {
  const result: SpawnSyncReturns<string> = spawnSync('launchctl', args, { encoding: 'utf-8' });
  return {
    ok: result.status === 0,
    command: ['launchctl', ...args],
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

function launchctlDomain(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  return uid === null ? 'gui/501' : `gui/${uid}`;
}

export function loadNightlyLaunchAgent(schedule: IdeasNightlySchedule): { schedule: IdeasNightlySchedule; result: LaunchctlResult } {
  if (!schedule.launchAgent) throw new Error('No LaunchAgent plist has been written for this schedule.');
  const domain = launchctlDomain();
  runLaunchctl(['bootout', domain, schedule.launchAgent.plistPath]);
  const result = runLaunchctl(['bootstrap', domain, schedule.launchAgent.plistPath]);
  if (!result.ok) return { schedule, result };

  const next = {
    ...schedule,
    updatedAt: nowIso(),
    launchAgent: {
      ...schedule.launchAgent,
      loadedAt: nowIso(),
    },
  };
  fs.writeFileSync(next.schedulePath, JSON.stringify(next, null, 2), { mode: 0o600 });
  appendNightlyLog(next, 'launchd loaded');
  return { schedule: next, result };
}

export function unloadNightlyLaunchAgent(schedule: IdeasNightlySchedule): LaunchctlResult | null {
  if (!schedule.launchAgent) return null;
  return runLaunchctl(['bootout', launchctlDomain(), schedule.launchAgent.plistPath]);
}

function appendNightlyLog(schedule: IdeasNightlySchedule, message: string): void {
  ensureDir(path.dirname(schedule.logPath));
  fs.appendFileSync(schedule.logPath, `${new Date().toISOString()} ${message}\n`, 'utf-8');
}

export function resolveNightlyJobPlan(schedule: IdeasNightlySchedule, deps: IdeasNightlyTickDeps = {}): IdeasJobPlan {
  const listSeeds = deps.listSeeds ?? listIdeasSeeds;
  const readSeed = deps.readSeed ?? readIdeasSeed;
  const listRepos = deps.listRepos ?? listSavedRepos;

  let seedId = schedule.plan.seedId;
  const seedArtifactIds = schedule.plan.seedArtifactIds;

  if (!seedId && (!seedArtifactIds || seedArtifactIds.length === 0) && schedule.plan.defaults) {
    const seed = pickMostRecentlyUsedSeed(listSeeds());
    if (!seed) throw new Error('No saved seeds available for nightly defaults.');
    seedId = seed.id;
  }

  if (!seedId && (!seedArtifactIds || seedArtifactIds.length === 0)) {
    throw new Error('Nightly schedule needs a seed, seed artifacts, or defaults enabled.');
  }

  const repoResolution = resolveRepoList({
    multiRepos: schedule.plan.repos && schedule.plan.repos.length > 0 ? schedule.plan.repos : undefined,
    savedRepos: listRepos(),
  });
  if (repoResolution.kind === 'error') {
    throw new Error('Nightly schedule needs explicit repos or saved repos.');
  }

  const seedFrameId = seedId ? readSeed(seedId)?.frameId : undefined;
  const frameId = resolveFrameIdForRun(schedule.plan.frameId, seedFrameId);

  return {
    seedArtifactIds,
    seedId,
    repos: repoResolution.repos,
    frameId,
    depth: schedule.plan.depth,
    engine: schedule.plan.engine,
    model: schedule.plan.model,
    effort: schedule.plan.effort,
    nodeTarget: schedule.plan.nodeTarget,
    steering: schedule.plan.steering,
  };
}

export function runIdeasNightlyTick(id: string, deps: IdeasNightlyTickDeps = {}): IdeasJob {
  const schedule = readIdeasNightlySchedule(id);
  if (!schedule) throw new Error(`Nightly schedule not found: ${id}`);
  appendNightlyLog(schedule, 'tick started');
  try {
    const plan = resolveNightlyJobPlan(schedule, deps);
    const job = (deps.startBackgroundJob ?? startIdeasBackgroundJob)(plan, { cwd: schedule.cwd });
    appendNightlyLog(schedule, `background job: ${job.id}`);
    return job;
  } catch (err) {
    appendNightlyLog(schedule, `tick failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

function formatNightlyPlan(plan: IdeasNightlyPlan): string {
  const seed = plan.seedId
    ? `seed=${plan.seedId}`
    : plan.seedArtifactIds?.length
      ? `seed_artifacts=${plan.seedArtifactIds.join(',')}`
      : 'seed=runtime-default';
  const repos = plan.repos?.length ? `repos=${plan.repos.length}` : 'repos=runtime-default';
  const model = plan.model ? ` model=${plan.model}` : '';
  const effort = plan.effort ? ` effort=${plan.effort}` : '';
  const nodes = plan.nodeTarget ? ` nodes=${plan.nodeTarget}` : '';
  return `${seed} ${repos} frame=${plan.frameId ?? 'runtime-default'} depth=${plan.depth}${model}${effort}${nodes}`;
}

export function formatIdeasNightlySchedule(schedule: IdeasNightlySchedule): string {
  return [
    `Nightly: ${schedule.id}`,
    `  time: ${schedule.time} local`,
    `  cwd: ${schedule.cwd}`,
    `  plan: ${formatNightlyPlan(schedule.plan)}`,
    `  schedule: ${schedule.schedulePath}`,
    `  log: ${schedule.logPath}`,
    ...(schedule.launchAgent ? [
      `  launchd label: ${schedule.launchAgent.label}`,
      `  launchd plist: ${schedule.launchAgent.plistPath}`,
      ...(schedule.launchAgent.loadedAt ? [`  launchd loaded: ${schedule.launchAgent.loadedAt}`] : []),
    ] : []),
  ].join('\n');
}

export function formatIdeasNightlyScheduleList(schedules: IdeasNightlySchedule[]): string {
  if (schedules.length === 0) return 'No nightly Possible schedules yet.';
  return schedules
    .map((schedule) => `${schedule.id}  ${schedule.time}  ${formatNightlyPlan(schedule.plan)}`)
    .join('\n');
}
