import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface WorkflowStateOptions {
  repo?: string;
  fetch?: boolean;
}

export interface WorkflowStateRow {
  active: string;
  plainEnglish: string;
  includedInRoot: string;
  inOrigin: string;
  state: string;
  next: string;
}

export interface WorkflowStatePullRequest {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  mergeStateStatus?: string;
}

export interface WorkflowState {
  repo: string;
  root: string | null;
  rows: WorkflowStateRow[];
  openPullRequests: WorkflowStatePullRequest[];
  verdict: string;
  summary: string;
}

interface GitRunOptions {
  cwd: string;
  timeout?: number;
}

function runGit(args: string[], options: GitRunOptions): string | null {
  try {
    return execFileSync('git', args, {
      cwd: options.cwd,
      encoding: 'utf-8',
      timeout: options.timeout ?? 10_000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function runCommand(command: string, args: string[], options: GitRunOptions): string | null {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd,
      encoding: 'utf-8',
      timeout: options.timeout ?? 10_000,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function parseAheadBehind(statusLine: string): { ahead: number; behind: number } {
  const ahead = Number(statusLine.match(/ahead (\d+)/)?.[1] ?? 0);
  const behind = Number(statusLine.match(/behind (\d+)/)?.[1] ?? 0);
  return { ahead, behind };
}

function branchSummary(root: string): { branch: string; upstream: string | null; ahead: number; behind: number } {
  const branch = runGit(['branch', '--show-current'], { cwd: root }) || 'detached';
  const upstream = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd: root });
  const statusLine = runGit(['status', '--short', '--branch'], { cwd: root })?.split('\n')[0] ?? '';
  const { ahead, behind } = parseAheadBehind(statusLine);
  return { branch, upstream, ahead, behind };
}

function changedFiles(root: string): string[] {
  const output = runGit(['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root });
  return output ? output.split('\n').filter(Boolean) : [];
}

function revParse(root: string, rev: string): string | null {
  return runGit(['rev-parse', '--verify', rev], { cwd: root });
}

function refExists(root: string, ref: string): boolean {
  return Boolean(revParse(root, ref));
}

function isAncestor(root: string, ancestor: string, descendant: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: root,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function parseWorktrees(root: string): { path: string; branch: string | null; prunable: boolean }[] {
  const output = runGit(['worktree', 'list', '--porcelain'], { cwd: root });
  if (!output) return [];

  const blocks = output.split('\n\n').filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n');
    const worktreePath = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length) ?? '';
    const branch = lines.find((line) => line.startsWith('branch '))?.replace(/^branch refs\/heads\//, '') ?? null;
    return {
      path: worktreePath,
      branch,
      prunable: lines.some((line) => line.startsWith('prunable')),
    };
  }).filter((worktree) => worktree.path);
}

function countAbandonedRefs(root: string): number {
  const output = runGit(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/abandoned'], { cwd: root });
  return output ? output.split('\n').filter(Boolean).length : 0;
}

function readOpenPullRequests(root: string): WorkflowStatePullRequest[] {
  const output = runCommand('gh', [
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    'number,title,url,isDraft,mergeStateStatus',
    '--limit',
    '50',
  ], { cwd: root, timeout: 15_000 });
  if (!output) return [];

  try {
    const parsed = JSON.parse(output) as WorkflowStatePullRequest[];
    return parsed.map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      isDraft: Boolean(pr.isDraft),
      mergeStateStatus: pr.mergeStateStatus,
    }));
  } catch {
    return [];
  }
}

function formatCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function worktreeName(worktreePath: string): string {
  return path.basename(worktreePath);
}

function workerPlainEnglish(worktreePath: string, branch: string | null, changes: string[], includedInRoot: string, inOrigin: string): string {
  const name = branch ? `\`${branch}\`` : worktreeName(worktreePath);
  if (changes.length > 0) return `${name} has local file changes in its own worktree.`;
  if (includedInRoot === 'yes' && inOrigin === 'yes') return `${name} is clean and already preserved in root and remote history.`;
  if (includedInRoot === 'yes') return `${name} is clean and already present in root, but not obviously preserved remotely.`;
  if (inOrigin === 'yes') return `${name} is clean and preserved remotely, but not included in root.`;
  return `${name} is clean, local-only active work.`;
}

function workerNext(changes: string[], includedInRoot: string, inOrigin: string): string {
  if (changes.length > 0) return 'save, ship, or abandon';
  if (includedInRoot === 'yes' && inOrigin === 'yes') return 'clean';
  if (includedInRoot === 'yes') return 'ship or clean';
  return 'save, ship, or abandon';
}

export function getWorkflowState(options: WorkflowStateOptions = {}): WorkflowState {
  const repo = path.resolve(options.repo ?? process.cwd());
  const root = runGit(['rev-parse', '--show-toplevel'], { cwd: repo });

  if (!root) {
    const rows: WorkflowStateRow[] = [
      {
        active: 'Root',
        plainEnglish: 'This directory is not inside a Git checkout.',
        includedInRoot: 'root',
        inOrigin: 'unknown',
        state: 'not a git repo',
        next: 'choose a repo',
      },
    ];
    return {
      repo,
      root: null,
      rows,
      openPullRequests: [],
      verdict: 'not a repo',
      summary: 'Run `ft state --repo <path>` from inside a Git repo.',
    };
  }

  if (options.fetch !== false) {
    runGit(['fetch', '--quiet', '--all', '--prune'], { cwd: root, timeout: 30_000 });
  }

  const worktrees = parseWorktrees(root);
  const stagingRoot = worktrees.find((worktree) => !worktree.prunable)?.path ?? root;
  const { branch, upstream, ahead, behind } = branchSummary(stagingRoot);
  const changes = changedFiles(stagingRoot);
  const activeWorkers = worktrees.filter((worktree) => path.resolve(worktree.path) !== path.resolve(stagingRoot) && !worktree.prunable);
  const prunableWorktrees = worktrees.filter((worktree) => worktree.prunable);
  const abandonedCount = countAbandonedRefs(stagingRoot);
  const openPullRequests = readOpenPullRequests(stagingRoot);
  const rootHead = revParse(stagingRoot, 'HEAD');
  const targetRemote = upstream && upstream.startsWith('origin/')
    ? upstream
    : refExists(stagingRoot, 'origin/main')
      ? 'origin/main'
      : null;

  const rootBits = [
    changes.length === 0 ? 'clean' : `${formatCount(changes.length, 'changed file')}`,
    upstream ? `tracking ${upstream}` : 'no upstream',
  ];
  if (ahead > 0) rootBits.push(`ahead ${ahead}`);
  if (behind > 0) rootBits.push(`behind ${behind}`);

  const rows: WorkflowStateRow[] = activeWorkers.map((worktree) => {
    const workerChanges = changedFiles(worktree.path);
    const workerHead = revParse(worktree.path, 'HEAD');
    const branchRemote = worktree.branch ? `origin/${worktree.branch}` : null;
    const includedInRoot = workerHead && rootHead && isAncestor(stagingRoot, workerHead, rootHead) ? 'yes' : 'no';
    const inOrigin = workerHead && (
      (branchRemote && refExists(stagingRoot, branchRemote) && isAncestor(stagingRoot, workerHead, branchRemote)) ||
      (targetRemote && isAncestor(stagingRoot, workerHead, targetRemote))
    ) ? 'yes' : 'no';
    const stateBits = [
      worktree.branch ? `branch ${worktree.branch}` : 'detached',
      workerChanges.length === 0 ? 'clean' : formatCount(workerChanges.length, 'changed file'),
    ];

    return {
      active: worktreeName(worktree.path),
      plainEnglish: workerPlainEnglish(worktree.path, worktree.branch, workerChanges, includedInRoot, inOrigin),
      includedInRoot,
      inOrigin,
      state: stateBits.join(', '),
      next: workerNext(workerChanges, includedInRoot, inOrigin),
    };
  });

  rows.push({
    active: 'Root',
    plainEnglish: changes.length === 0
      ? 'The staging checkout has no local file changes.'
      : 'The staging checkout has local work that is not clean yet.',
    includedInRoot: 'root',
    inOrigin: [ahead > 0 ? `ahead ${ahead}` : null, behind > 0 ? `behind ${behind}` : null].filter(Boolean).join(', ') || 'up to date',
    state: `${branch}: ${rootBits.join(', ')}`,
    next: changes.length === 0 ? '' : 'save, ship, or abandon',
  });

  if (prunableWorktrees.length > 0) {
    rows.push({
      active: 'Local cleanup',
      plainEnglish: 'Git has stale worktree records that can be pruned after inspection.',
      includedInRoot: 'unknown',
      inOrigin: 'unknown',
      state: formatCount(prunableWorktrees.length, 'prunable worktree'),
      next: 'clean-slate',
    });
  }

  if (abandonedCount > 0) {
    rows.push({
      active: 'Abandoned work',
      plainEnglish: 'Old work is preserved remotely and is not active locally.',
      includedInRoot: 'no',
      inOrigin: 'yes',
      state: formatCount(abandonedCount, 'remote abandoned ref'),
      next: '',
    });
  }

  let verdict = 'clean working state';
  let summary = `Root is on ${branch}`;
  if (changes.length > 0 || activeWorkers.length > 0 || prunableWorktrees.length > 0 || ahead > 0 || behind > 0) {
    verdict = 'not clean yet';
    summary = [
      changes.length > 0 ? formatCount(changes.length, 'changed file') : null,
      activeWorkers.length > 0 ? formatCount(activeWorkers.length, 'active worker') : null,
      prunableWorktrees.length > 0 ? formatCount(prunableWorktrees.length, 'prunable worktree') : null,
      ahead > 0 ? `ahead ${ahead}` : null,
      behind > 0 ? `behind ${behind}` : null,
    ].filter(Boolean).join(', ');
  } else if (openPullRequests.length > 0) {
    summary = `Root is clean and ${formatCount(openPullRequests.length, 'PR')} remains open.`;
  } else {
    summary = `Root is clean on ${branch}, with no active local workers or open PRs.`;
  }

  rows.push({
    active: 'Recommended next',
    plainEnglish: summary,
    includedInRoot: 'root',
    inOrigin: [ahead > 0 ? `ahead ${ahead}` : null, behind > 0 ? `behind ${behind}` : null].filter(Boolean).join(', ') || 'up to date',
    state: verdict,
    next: verdict === 'clean working state' ? 'start' : 'clean-slate',
  });

  return { repo, root: stagingRoot, rows, openPullRequests, verdict, summary };
}

function pad(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - value.length));
}

export function formatWorkflowState(state: WorkflowState): string {
  const headers = ['Active', 'Plain English', 'Included In Root', 'In Origin?', 'State', 'Next'];
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...state.rows.map((row) => [row.active, row.plainEnglish, row.includedInRoot, row.inOrigin, row.state, row.next][index].length),
  ));

  const lines = ['FT state', ''];
  lines.push(`| ${headers.map((header, index) => pad(header, widths[index])).join(' | ')} |`);
  lines.push(`| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`);
  for (const row of state.rows) {
    lines.push(`| ${[
      row.active,
      row.plainEnglish,
      row.includedInRoot,
      row.inOrigin,
      row.state,
      row.next,
    ].map((value, index) => pad(value, widths[index])).join(' | ')} |`);
  }

  lines.push('');
  if (state.openPullRequests.length === 0) {
    lines.push('Open PRs: none');
  } else {
    lines.push('Open PRs (merge sequentially):', '');
    state.openPullRequests.forEach((pr, index) => {
      const conflict = pr.mergeStateStatus === 'DIRTY' ? 'conflicts' : 'no conflicts';
      const draft = pr.isDraft ? 'draft, ' : '';
      lines.push(`${index + 1}. ${pr.title} - ${pr.url} - ${draft}${conflict}`);
    });
  }

  lines.push('', `Verdict: ${state.verdict}.`, state.summary);
  if (state.root && !fs.existsSync(path.join(state.root, '.git'))) {
    lines.push(`Repo root: ${state.root}`);
  }
  return `${lines.join('\n')}\n`;
}
