import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface WorkflowStateOptions {
  repo?: string;
  fetch?: boolean;
}

export interface WorkflowStateRow {
  category: string;
  state: string;
  plainEnglish: string;
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

export function getWorkflowState(options: WorkflowStateOptions = {}): WorkflowState {
  const repo = path.resolve(options.repo ?? process.cwd());
  const root = runGit(['rev-parse', '--show-toplevel'], { cwd: repo });

  if (!root) {
    const rows = [
      {
        category: 'Root',
        state: 'not a git repo',
        plainEnglish: 'This directory is not inside a Git checkout.',
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

  const { branch, upstream, ahead, behind } = branchSummary(root);
  const changes = changedFiles(root);
  const worktrees = parseWorktrees(root);
  const activeWorkers = worktrees.filter((worktree) => path.resolve(worktree.path) !== path.resolve(root) && !worktree.prunable);
  const prunableWorktrees = worktrees.filter((worktree) => worktree.prunable);
  const abandonedCount = countAbandonedRefs(root);
  const openPullRequests = readOpenPullRequests(root);

  const rootBits = [
    changes.length === 0 ? 'clean' : `${formatCount(changes.length, 'changed file')}`,
    upstream ? `tracking ${upstream}` : 'no upstream',
  ];
  if (ahead > 0) rootBits.push(`ahead ${ahead}`);
  if (behind > 0) rootBits.push(`behind ${behind}`);

  const rows: WorkflowStateRow[] = [
    {
      category: 'Root',
      state: `${branch}: ${rootBits.join(', ')}`,
      plainEnglish: changes.length === 0
        ? 'The main checkout has no local file changes.'
        : 'The main checkout has local work that is not clean yet.',
      next: changes.length === 0 ? 'no action' : 'save, ship, or abandon',
    },
    {
      category: 'Active workers',
      state: activeWorkers.length === 0 ? 'none' : formatCount(activeWorkers.length, 'worktree'),
      plainEnglish: activeWorkers.length === 0
        ? 'There are no separate local task worktrees.'
        : 'Separate local work exists outside this checkout.',
      next: activeWorkers.length === 0 ? 'no action' : 'inspect each worker',
    },
    {
      category: 'Included work',
      state: changes.length === 0 && ahead === 0 ? 'none' : `${formatCount(changes.length, 'changed file')}, ahead ${ahead}`,
      plainEnglish: changes.length === 0 && ahead === 0
        ? 'Root does not contain obvious unsaved local work.'
        : 'Root contains local changes or commits that may need to be saved or shipped.',
      next: changes.length === 0 && ahead === 0 ? 'no action' : 'ship or clean up',
    },
    {
      category: 'Excluded work',
      state: activeWorkers.length === 0 ? 'none' : formatCount(activeWorkers.length, 'worker'),
      plainEnglish: activeWorkers.length === 0
        ? 'There is no separate local work waiting outside root.'
        : 'Work in task worktrees is outside root until it is saved or shipped.',
      next: activeWorkers.length === 0 ? 'no action' : 'save, ship, or abandon',
    },
    {
      category: 'Shipped work',
      state: openPullRequests.length === 0 ? 'none' : formatCount(openPullRequests.length, 'open PR'),
      plainEnglish: openPullRequests.length === 0
        ? 'No GitHub PRs are currently open for this repo.'
        : 'GitHub has active review surfaces for this repo.',
      next: openPullRequests.length === 0 ? 'no action' : 'review, merge, or abandon',
    },
    {
      category: 'Landed work',
      state: behind > 0 ? `behind ${behind}` : 'up to date or unknown',
      plainEnglish: behind > 0
        ? 'Remote has commits that are not in this checkout yet.'
        : 'This checkout is not obviously missing remote base commits.',
      next: behind > 0 ? 'update root' : 'no action',
    },
    {
      category: 'Abandoned work',
      state: abandonedCount === 0 ? 'none' : formatCount(abandonedCount, 'remote abandoned ref'),
      plainEnglish: abandonedCount === 0
        ? 'No abandoned remote refs were found under origin/abandoned.'
        : 'Old work is preserved remotely and is not active locally.',
      next: 'no action',
    },
    {
      category: 'Open PRs',
      state: openPullRequests.length === 0 ? 'none' : formatCount(openPullRequests.length, 'open PR'),
      plainEnglish: openPullRequests.length === 0
        ? 'There are no open PR decisions visible from GitHub.'
        : 'These PRs still need review, merge, or abandon decisions.',
      next: openPullRequests.length === 0 ? 'no action' : 'review, merge, or abandon',
    },
    {
      category: 'Local cleanup',
      state: prunableWorktrees.length === 0 ? 'none' : formatCount(prunableWorktrees.length, 'prunable worktree'),
      plainEnglish: prunableWorktrees.length === 0
        ? 'There are no stale worktree registrations.'
        : 'Git has stale worktree records that can be pruned after inspection.',
      next: prunableWorktrees.length === 0 ? 'no action' : 'clean-slate',
    },
  ];

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
    category: 'Recommended next',
    state: verdict,
    plainEnglish: summary,
    next: verdict === 'clean working state' ? 'start' : 'clean-slate',
  });

  return { repo, root, rows, openPullRequests, verdict, summary };
}

function pad(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - value.length));
}

export function formatWorkflowState(state: WorkflowState): string {
  const headers = ['Category', 'State', 'Plain English', 'Next'];
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...state.rows.map((row) => [row.category, row.state, row.plainEnglish, row.next][index].length),
  ));

  const lines = ['FT state', ''];
  lines.push(`| ${headers.map((header, index) => pad(header, widths[index])).join(' | ')} |`);
  lines.push(`| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`);
  for (const row of state.rows) {
    lines.push(`| ${[
      row.category,
      row.state,
      row.plainEnglish,
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
