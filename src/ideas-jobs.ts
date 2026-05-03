import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { ideasJobsDir } from './paths.js';
import { runIdeas, type IdeasRunOptions, type IdeasRunSummary } from './ideas.js';

export type IdeasJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface IdeasJobPlan {
  seedArtifactIds?: string[];
  seedId?: string;
  repos: string[];
  frameId: string;
  depth: 'quick' | 'standard' | 'deep';
  engine?: string;
  model?: string;
  effort?: string;
  nodeTarget?: number;
  steering?: string;
}

export interface IdeasJob {
  id: string;
  status: IdeasJobStatus;
  createdAt: string;
  updatedAt: string;
  cwd: string;
  pid?: number;
  plan: IdeasJobPlan;
  jobPath: string;
  logPath: string;
  runIds?: string[];
  batchId?: string;
  dotCount?: number;
  error?: string;
}

export interface StartIdeasJobOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  spawnImpl?: typeof spawn;
}

function dayStamp(iso: string): string {
  return iso.slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function generateJobId(): string {
  return `job-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function jobPathFor(id: string, createdAt: string): string {
  return path.join(ideasJobsDir(dayStamp(createdAt)), `${id}.json`);
}

function logPathFor(id: string, createdAt: string): string {
  return path.join(ideasJobsDir(dayStamp(createdAt)), `${id}.log`);
}

function writeJob(job: IdeasJob): void {
  ensureDir(path.dirname(job.jobPath));
  fs.writeFileSync(job.jobPath, JSON.stringify(job, null, 2), { mode: 0o600 });
}

function appendJobLog(job: IdeasJob, message: string): void {
  ensureDir(path.dirname(job.logPath));
  fs.appendFileSync(job.logPath, `${new Date().toISOString()} ${message}\n`, 'utf-8');
}

function listJobFiles(): string[] {
  const root = ideasJobsDir();
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.json')) files.push(path.join(dir, file));
    }
  }
  return files;
}

function readJobFile(filePath: string): IdeasJob | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as IdeasJob;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

function refreshJob(job: IdeasJob): IdeasJob {
  if (job.status !== 'running' || isProcessAlive(job.pid)) return job;
  const next = {
    ...job,
    status: 'failed' as const,
    updatedAt: nowIso(),
    error: job.error ?? 'Background worker exited before recording a result.',
  };
  writeJob(next);
  appendJobLog(next, `failed: ${next.error}`);
  return next;
}

export function createIdeasJob(plan: IdeasJobPlan, opts: { cwd?: string } = {}): IdeasJob {
  const createdAt = nowIso();
  const id = generateJobId();
  const job: IdeasJob = {
    id,
    status: 'queued',
    createdAt,
    updatedAt: createdAt,
    cwd: opts.cwd ?? process.cwd(),
    plan,
    jobPath: jobPathFor(id, createdAt),
    logPath: logPathFor(id, createdAt),
  };
  writeJob(job);
  appendJobLog(job, `queued: ${formatRunShape(plan)}`);
  return job;
}

export function readIdeasJob(id: string): IdeasJob | null {
  const job = listJobFiles()
    .map(readJobFile)
    .find((item): item is IdeasJob => Boolean(item && item.id === id));
  return job ? refreshJob(job) : null;
}

export function listIdeasJobs(): IdeasJob[] {
  return listJobFiles()
    .map(readJobFile)
    .filter((job): job is IdeasJob => Boolean(job))
    .map(refreshJob)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function markIdeasJobRunning(id: string, pid: number): IdeasJob {
  const job = readIdeasJob(id);
  if (!job) throw new Error(`Job not found: ${id}`);
  if (job.status === 'running' && job.pid === pid) return job;
  const next = { ...job, status: 'running' as const, pid, updatedAt: nowIso() };
  writeJob(next);
  appendJobLog(next, `running: pid=${pid}`);
  return next;
}

export function completeIdeasJob(id: string, summary: IdeasRunSummary): IdeasJob {
  const job = readIdeasJob(id);
  if (!job) throw new Error(`Job not found: ${id}`);
  const next: IdeasJob = {
    ...job,
    status: 'succeeded',
    updatedAt: nowIso(),
    runIds: summary.runIds,
    batchId: summary.batchId,
    dotCount: summary.dotCount,
    error: undefined,
  };
  writeJob(next);
  appendJobLog(next, `succeeded: runs=${summary.runIds.join(', ')} dots=${summary.dotCount}`);
  return next;
}

export function failIdeasJob(id: string, err: unknown): IdeasJob {
  const job = readIdeasJob(id);
  if (!job) throw new Error(`Job not found: ${id}`);
  const error = err instanceof Error ? err.message : String(err);
  const next = { ...job, status: 'failed' as const, updatedAt: nowIso(), error };
  writeJob(next);
  appendJobLog(next, `failed: ${error}`);
  return next;
}

function currentCliInvocation(): { command: string; args: string[] } {
  const entry = process.argv[1] ?? path.join(process.cwd(), 'bin', 'ft.mjs');
  return {
    command: process.execPath,
    args: [...process.execArgv, entry],
  };
}

function openLogForAppend(filePath: string): number {
  ensureDir(path.dirname(filePath));
  return fs.openSync(filePath, 'a');
}

export function startIdeasBackgroundJob(plan: IdeasJobPlan, opts: StartIdeasJobOptions = {}): IdeasJob {
  const job = createIdeasJob(plan, { cwd: opts.cwd });
  const { command, args } = currentCliInvocation();
  const logFd = openLogForAppend(job.logPath);
  let child: ChildProcess;
  try {
    child = (opts.spawnImpl ?? spawn)(
      command,
      [...args, 'possible', '_run-job', job.id],
      {
        cwd: job.cwd,
        env: opts.env ?? process.env,
        detached: true,
        stdio: ['ignore', logFd, logFd],
      },
    );
  } finally {
    fs.closeSync(logFd);
  }

  if (!child.pid) {
    failIdeasJob(job.id, new Error('Background worker did not expose a pid.'));
    throw new Error('Background worker did not expose a pid.');
  }

  child.unref();
  return markIdeasJobRunning(job.id, child.pid);
}

export async function runIdeasJobWorker(jobId: string): Promise<IdeasJob> {
  const job = readIdeasJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  markIdeasJobRunning(job.id, process.pid);
  appendJobLog(job, 'worker started');
  try {
    const summary = await runIdeas({
      ...job.plan,
      onProgress: (message) => appendJobLog(job, message),
    } satisfies IdeasRunOptions);
    return completeIdeasJob(job.id, summary);
  } catch (err) {
    return failIdeasJob(job.id, err);
  }
}

function formatRunShape(plan: IdeasJobPlan): string {
  const seed = plan.seedId ? `seed=${plan.seedId}` : `seed_artifacts=${plan.seedArtifactIds?.join(',') ?? '?'}`;
  const engine = plan.engine ? ` engine=${plan.engine}` : '';
  const model = plan.model ? ` model=${plan.model}` : '';
  const effort = plan.effort ? ` effort=${plan.effort}` : '';
  const nodes = plan.nodeTarget ? ` nodes=${plan.nodeTarget}` : '';
  const steering = plan.steering ? ' steering=yes' : '';
  return `${seed} repos=${plan.repos.length} frame=${plan.frameId} depth=${plan.depth}${engine}${model}${effort}${nodes}${steering}`;
}

export function formatIdeasJobList(jobs: IdeasJob[]): string {
  if (jobs.length === 0) return 'No background possibility jobs yet.';
  return jobs
    .slice(0, 30)
    .map((job) => {
      const result = job.status === 'succeeded'
        ? ` runs:${job.runIds?.length ?? 0} dots:${job.dotCount ?? 0}`
        : job.status === 'failed'
          ? ` error:${job.error ?? 'unknown'}`
          : ` pid:${job.pid ?? '?'}`;
      return `${job.id}  ${job.status.padEnd(9)}  ${formatRunShape(job.plan)}${result}  ${job.createdAt}`;
    })
    .join('\n');
}

function tailLog(filePath: string, lines = 20): string[] {
  try {
    return fs.readFileSync(filePath, 'utf-8').trimEnd().split('\n').slice(-lines);
  } catch {
    return [];
  }
}

export function formatIdeasJob(job: IdeasJob, opts: { includeLog?: boolean; logLines?: number } = {}): string {
  const lines = [
    `Job: ${job.id}`,
    `  status: ${job.status}`,
    `  created: ${job.createdAt}`,
    `  updated: ${job.updatedAt}`,
    ...(job.pid ? [`  pid: ${job.pid}`] : []),
    `  cwd: ${job.cwd}`,
    `  plan: ${formatRunShape(job.plan)}`,
    `  log: ${job.logPath}`,
    ...(job.runIds && job.runIds.length > 0 ? [`  runs: ${job.runIds.join(', ')}`] : []),
    ...(job.batchId ? [`  batch: ${job.batchId}`] : []),
    ...(job.dotCount !== undefined ? [`  dots: ${job.dotCount}`] : []),
    ...(job.error ? [`  error: ${job.error}`] : []),
  ];

  if (opts.includeLog) {
    const logLines = tailLog(job.logPath, opts.logLines ?? 20);
    lines.push('', `Last ${logLines.length} log line${logLines.length === 1 ? '' : 's'}:`);
    lines.push(...(logLines.length > 0 ? logLines.map((line) => `  ${line}`) : ['  (no log output yet)']));
  }

  return lines.join('\n');
}
