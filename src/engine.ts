/**
 * LLM engine detection, selection, and invocation.
 *
 * Knows how to call `claude` and `codex` out of the box.
 * Remembers the user's choice in ~/.ft-bookmarks/.preferences.
 */

import { execFileSync, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadPreferences, savePreferences } from './preferences.js';
import { PromptCancelledError, promptText } from './prompt.js';

// ── Engine registry ────────────────────────────────────────────────────

export interface EngineConfig {
  bin: string;
  args: (prompt: string) => string[];
}

const KNOWN_ENGINES: Record<string, EngineConfig> = {
  claude: { bin: 'claude', args: (p) => ['-p', '--output-format', 'text', p] },
  codex:  { bin: 'codex',  args: (p) => ['exec', '--skip-git-repo-check', p] },
};

/** Order used when auto-detecting. */
const PREFERENCE_ORDER = ['claude', 'codex'];

// ── Detection ──────────────────────────────────────────────────────────

export function hasCommandOnPath(
  bin: string,
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): boolean {
  const searchPath = env.PATH ?? '';
  const pathDirs = searchPath.split(path.delimiter).filter(Boolean);
  const pathext = (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .map((ext) => ext.trim())
    .filter(Boolean);

  const hasPathSeparator = /[\\/]/.test(bin);
  const baseCandidates = hasPathSeparator
    ? [bin]
    : pathDirs.map((dir) => path.join(dir, bin));
  const candidates = platform === 'win32'
    ? baseCandidates.flatMap((candidate) => {
        if (path.extname(candidate)) return [candidate];
        return pathext.map((ext) => `${candidate}${ext}`);
      })
    : baseCandidates;

  return candidates.some((candidate) => {
    try {
      if (platform === 'win32') return fs.statSync(candidate).isFile();
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function detectAvailableEngines(): string[] {
  return PREFERENCE_ORDER.filter((name) => hasCommandOnPath(KNOWN_ENGINES[name].bin));
}

// ── Interactive prompt ─────────────────────────────────────────────────

async function askYesNo(question: string): Promise<boolean> {
  const result = await promptText(question);
  if (result.kind === 'interrupt') {
    throw new PromptCancelledError('Cancelled before selecting a model.', 130);
  }
  if (result.kind === 'close') {
    throw new PromptCancelledError('No model selected.', 0);
  }
  return result.value.toLowerCase().startsWith('y');
}

// ── Resolution ─────────────────────────────────────────────────────────

export interface ResolvedEngine {
  name: string;
  config: EngineConfig;
}

function resolve(name: string): ResolvedEngine {
  return { name, config: KNOWN_ENGINES[name] };
}

/**
 * Resolve which engine to use for classification.
 *
 * If `options.override` is set, require that specific engine: fails fast
 * if it's unknown or not on PATH. Saved preferences and prompting are
 * bypassed — this is meant for per-invocation overrides like `--engine`.
 *
 * Otherwise:
 * 1. If a saved default exists and is available, use it silently.
 * 2. If only one engine is available, use it silently.
 * 3. If multiple are available and stdin is a TTY, prompt y/n through
 *    the preference order and persist the choice.
 * 4. If not a TTY (CI/scripts), use the first available without prompting.
 *
 * Throws if no engine is found.
 */
export async function resolveEngine(options: { override?: string } = {}): Promise<ResolvedEngine> {
  if (options.override) {
    const name = options.override;
    if (!Object.hasOwn(KNOWN_ENGINES, name)) {
      const known = Object.keys(KNOWN_ENGINES).join(', ');
      throw new Error(`Unknown engine "${name}". Known engines: ${known}.`);
    }
    if (!hasCommandOnPath(KNOWN_ENGINES[name].bin)) {
      const available = detectAvailableEngines();
      const hint = available.length > 0
        ? ` Available on PATH: ${available.join(', ')}.`
        : '';
      throw new Error(
        `Engine "${name}" is not on PATH.${hint}\n` +
        `Install it and log in, or pick a different engine.`
      );
    }
    return resolve(name);
  }

  const available = detectAvailableEngines();

  if (available.length === 0) {
    throw new Error(
      'No supported LLM CLI found.\n' +
      'Install one of the following and log in:\n' +
      '  - Claude Code: https://docs.anthropic.com/en/docs/claude-code\n' +
      '  - Codex CLI:   https://github.com/openai/codex'
    );
  }

  // Check saved preference
  const prefs = loadPreferences();
  if (prefs.defaultEngine && available.includes(prefs.defaultEngine)) {
    return resolve(prefs.defaultEngine);
  }

  // Single engine — just use it
  if (available.length === 1) {
    return resolve(available[0]);
  }

  // Multiple engines — prompt if TTY, else use first
  if (!process.stdin.isTTY) {
    return resolve(available[0]);
  }

  for (const name of available) {
    const yes = await askYesNo(`  Use ${name} for classification? (y/n): `);
    if (yes) {
      savePreferences({ ...prefs, defaultEngine: name });
      process.stderr.write(`  \u2713 ${name} set as default (change anytime: ft model)\n`);
      return resolve(name);
    }
  }

  // Said no to everything — use first anyway but don't persist
  process.stderr.write(`  Using ${available[0]} (no default saved)\n`);
  return resolve(available[0]);
}

// ── Invocation ─────────────────────────────────────────────────────────

export interface InvokeOptions {
  timeout?: number;
  maxBuffer?: number;
}

export function invokeEngine(engine: ResolvedEngine, prompt: string, opts: InvokeOptions = {}): string {
  const { bin, args } = engine.config;
  return execFileSync(bin, args(prompt), {
    encoding: 'utf-8',
    timeout: opts.timeout ?? 120_000,
    maxBuffer: opts.maxBuffer ?? 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore'],
  }).trim();
}

/**
 * Async variant — does not block the event loop, so spinners and
 * setInterval callbacks continue to fire while the LLM runs.
 */
export function invokeEngineAsync(engine: ResolvedEngine, prompt: string, opts: InvokeOptions = {}): Promise<string> {
  const { bin, args } = engine.config;
  return new Promise((resolve, reject) => {
    execFile(bin, args(prompt), {
      encoding: 'utf-8',
      timeout: opts.timeout ?? 120_000,
      maxBuffer: opts.maxBuffer ?? 1024 * 1024,
    }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout.trim());
    });
  });
}
