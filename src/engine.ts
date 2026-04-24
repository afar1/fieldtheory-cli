/**
 * LLM engine detection, selection, and invocation.
 *
 * Knows how to call `claude` and `codex` out of the box.
 * Remembers the user's choice in the bookmark data directory's .preferences file.
 */

import { spawn, spawnSync } from 'node:child_process';
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
    throw new PromptCancelledError(
      'Cancelled — no engine selected. Pick one with `ft model <engine>`, or pass `--engine claude` / `--engine codex`.',
      130,
    );
  }
  if (result.kind === 'close') {
    throw new PromptCancelledError(
      'No engine selected. Pick one with `ft model <engine>`, or pass `--engine claude` / `--engine codex`.',
      0,
    );
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

/**
 * Structured failure from an engine invocation.
 *
 * Carries the pieces a caller needs to build a useful error message:
 * - `stderr`: whatever the child wrote before it died (may be empty)
 * - `killed`: true when we killed it ourselves (timeout / maxBuffer cap)
 * - `code`/`signal`: standard exit info
 *
 * We avoid stuffing the prompt into `.message` — the prompt can be tens of
 * kilobytes, and `execFile`'s built-in "Command failed: <cmd + args>" format
 * blew up the `log.md` entries for `ft wiki` by consuming the entire
 * truncation budget with prompt bytes, leaving no room for the actual
 * failure signal. Callers should prefer `.stderr` / `.killed` over
 * `.message` for user-facing output.
 */
export class EngineInvocationError extends Error {
  readonly engine: string;
  readonly bin: string;
  readonly stderr: string;
  readonly killed: boolean;
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly reason: 'timeout' | 'maxbuffer' | 'exit' | 'spawn';

  constructor(params: {
    engine: string;
    bin: string;
    stderr: string;
    killed: boolean;
    code: number | null;
    signal: NodeJS.Signals | null;
    reason: 'timeout' | 'maxbuffer' | 'exit' | 'spawn';
    message: string;
  }) {
    super(params.message);
    this.name = 'EngineInvocationError';
    this.engine = params.engine;
    this.bin = params.bin;
    this.stderr = params.stderr;
    this.killed = params.killed;
    this.code = params.code;
    this.signal = params.signal;
    this.reason = params.reason;
  }
}

const DEFAULT_TIMEOUT   = 120_000;
const DEFAULT_MAXBUF    = 1024 * 1024;
const STDERR_TAIL_BYTES = 4096;     // clipped tail shown in errors/logs
const STDERR_HARD_CAP   = 64 * 1024; // hard ceiling on in-memory stderr buffering
const SIGKILL_GRACE_MS  = 2_000;     // grace period between SIGTERM and SIGKILL

/** Clip the tail of a buffer to a byte budget — engines put the "what went
 *  wrong" line at the end of stderr. */
function tailString(buf: Buffer, bytes: number): string {
  if (buf.length <= bytes) return buf.toString('utf-8');
  return '\u2026' + buf.subarray(buf.length - bytes).toString('utf-8');
}

/**
 * Strip high-confidence secret shapes from child stderr before it lands in
 * an error object or `log.md`. Deliberately narrow — only patterns that are
 * ~impossible to collide with legitimate error text:
 *
 *   - provider-prefixed API keys (sk-…, used by Anthropic/OpenAI/Stripe)
 *   - GitHub personal/app/oauth tokens (ghp_, gho_, ghu_, ghs_, ghr_)
 *   - `Bearer <token>` authorization headers
 *
 * `claude` / `codex` don't currently echo secrets to stderr, but this is
 * defense-in-depth: if an engine ever does, we don't want the raw token in
 * `~/.fieldtheory/library/log.md` forever.
 */
export function redactSecrets(s: string): string {
  return s
    .replace(/\bsk-[A-Za-z0-9_-]{16,}/g, 'sk-***REDACTED***')
    .replace(/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}/g, '$1_***REDACTED***')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer ***REDACTED***');
}

/** Build a user-facing failure message. Deliberately does NOT inline the
 *  prompt — see EngineInvocationError for why. */
function buildMessage(
  engineName: string,
  reason: 'timeout' | 'maxbuffer' | 'exit' | 'spawn',
  stderr: string,
  code: number | null,
  signal: NodeJS.Signals | null,
  timeoutMs: number,
): string {
  const stderrSnippet = stderr.trim().slice(-500);
  const detail = stderrSnippet ? ` \u2014 ${stderrSnippet}` : '';
  switch (reason) {
    case 'timeout':
      return `${engineName} timed out after ${Math.round(timeoutMs / 1000)}s${detail}`;
    case 'maxbuffer':
      return `${engineName} output exceeded buffer cap${detail}`;
    case 'spawn':
      return `${engineName} failed to start${detail}`;
    case 'exit':
    default: {
      const signalPart = signal ? ` (signal ${signal})` : '';
      const codePart   = code !== null ? ` exit ${code}` : '';
      return `${engineName} failed${codePart}${signalPart}${detail}`;
    }
  }
}

/**
 * Synchronous engine call — uses `spawnSync` with `input: ''` so the child's
 * stdin is closed with EOF before it starts reading.
 *
 * Background: claude-code's `claude -p` reads stdin when it's not a TTY and
 * concatenates it with the `-p` argument. Leaving stdin open as an unwritten
 * pipe makes older claude versions block forever (and newer versions eat a
 * 3s "no stdin data received" delay per call). Passing `input: ''` sends
 * EOF immediately so the child proceeds with just the prompt arg.
 */
export function invokeEngine(engine: ResolvedEngine, prompt: string, opts: InvokeOptions = {}): string {
  const { bin, args } = engine.config;
  const timeout   = opts.timeout   ?? DEFAULT_TIMEOUT;
  const maxBuffer = opts.maxBuffer ?? DEFAULT_MAXBUF;

  const result = spawnSync(bin, args(prompt), {
    input: '',              // EOF on stdin — do not inherit parent stdin
    timeout,
    maxBuffer,
    encoding: 'buffer',
  });

  const stderrBuf = result.stderr ?? Buffer.alloc(0);
  const stderr    = redactSecrets(tailString(stderrBuf, STDERR_TAIL_BYTES));

  if (result.error) {
    const anyErr = result.error as NodeJS.ErrnoException & { code?: string };
    if (anyErr.code === 'ETIMEDOUT') {
      throw new EngineInvocationError({
        engine: engine.name, bin, stderr,
        killed: true, code: null, signal: 'SIGTERM', reason: 'timeout',
        message: buildMessage(engine.name, 'timeout', stderr, null, 'SIGTERM', timeout),
      });
    }
    if (anyErr.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      throw new EngineInvocationError({
        engine: engine.name, bin, stderr,
        killed: true, code: null, signal: null, reason: 'maxbuffer',
        message: buildMessage(engine.name, 'maxbuffer', stderr, null, null, timeout),
      });
    }
    throw new EngineInvocationError({
      engine: engine.name, bin,
      stderr: '', killed: false, code: null, signal: null, reason: 'spawn',
      message: buildMessage(engine.name, 'spawn', anyErr.message ?? '', null, null, timeout),
    });
  }

  if (result.signal === 'SIGTERM' && (result.status === null || result.status === 143)) {
    // spawnSync sets .signal='SIGTERM' when the timeout kills the child.
    throw new EngineInvocationError({
      engine: engine.name, bin, stderr,
      killed: true, code: result.status, signal: result.signal, reason: 'timeout',
      message: buildMessage(engine.name, 'timeout', stderr, result.status, result.signal, timeout),
    });
  }

  if (result.status !== 0) {
    throw new EngineInvocationError({
      engine: engine.name, bin, stderr,
      killed: false, code: result.status, signal: result.signal, reason: 'exit',
      message: buildMessage(engine.name, 'exit', stderr, result.status, result.signal, timeout),
    });
  }

  return (result.stdout ?? Buffer.alloc(0)).toString('utf-8').trim();
}

/**
 * Async variant — does not block the event loop, so spinners and
 * setInterval callbacks continue to fire while the LLM runs.
 *
 * Uses `spawn` (not `execFile`) because `execFile` with a callback builds
 * its own internal stdio pipes and silently overrides any stdio option we
 * pass — so we can't close the child's stdin through the execFile API. With
 * `spawn` we get direct control and can `child.stdin.end()` immediately.
 */
export function invokeEngineAsync(engine: ResolvedEngine, prompt: string, opts: InvokeOptions = {}): Promise<string> {
  const { bin, args } = engine.config;
  const timeout   = opts.timeout   ?? DEFAULT_TIMEOUT;
  const maxBuffer = opts.maxBuffer ?? DEFAULT_MAXBUF;

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args(prompt), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Close stdin immediately with EOF so `claude -p` doesn't wait on it.
    // If spawn itself failed (ENOENT etc) `child.stdin` may be null — guard.
    try { child.stdin?.end(); } catch { /* spawn error will surface below */ }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Compute the redacted tail of buffered stderr for error reporting. */
    const stderrTail = () =>
      redactSecrets(tailString(Buffer.concat(stderrChunks), STDERR_TAIL_BYTES));

    /** Send SIGTERM, then escalate to SIGKILL after a grace period in case
     *  the child traps SIGTERM. `.unref()` so the escalation timer does not
     *  keep the event loop alive past shutdown. */
    const killChild = () => {
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
      const escalate = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already dead */ }
      }, SIGKILL_GRACE_MS);
      escalate.unref();
    };

    const fail = (err: EngineInvocationError) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      killChild();
      reject(err);
    };

    const succeed = (out: string) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(out);
    };

    child.stdout?.on('data', (d: Buffer) => {
      stdoutBytes += d.length;
      if (stdoutBytes > maxBuffer) {
        const stderr = stderrTail();
        fail(new EngineInvocationError({
          engine: engine.name, bin, stderr,
          killed: true, code: null, signal: null, reason: 'maxbuffer',
          message: buildMessage(engine.name, 'maxbuffer', stderr, null, null, timeout),
        }));
        return;
      }
      stdoutChunks.push(d);
    });

    child.stderr?.on('data', (d: Buffer) => {
      // Bound in-memory stderr by bytes, dropping the oldest chunks first.
      // Keep at least one chunk so a single giant line still shows its tail.
      stderrChunks.push(d);
      stderrBytes += d.length;
      while (stderrBytes > STDERR_HARD_CAP && stderrChunks.length > 1) {
        const dropped = stderrChunks.shift()!;
        stderrBytes -= dropped.length;
      }
    });

    timer = setTimeout(() => {
      const stderr = stderrTail();
      fail(new EngineInvocationError({
        engine: engine.name, bin, stderr,
        killed: true, code: null, signal: 'SIGTERM', reason: 'timeout',
        message: buildMessage(engine.name, 'timeout', stderr, null, 'SIGTERM', timeout),
      }));
    }, timeout);

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (timer !== undefined) clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(new EngineInvocationError({
        engine: engine.name, bin,
        stderr: '', killed: false, code: null, signal: null, reason: 'spawn',
        message: buildMessage(engine.name, 'spawn', err.message ?? '', null, null, timeout),
      }));
    });

    child.on('close', (code, signal) => {
      if (timer !== undefined) clearTimeout(timer);
      if (settled) return;
      const stderr = stderrTail();
      if (code === 0) {
        succeed(Buffer.concat(stdoutChunks).toString('utf-8').trim());
        return;
      }
      settled = true;
      reject(new EngineInvocationError({
        engine: engine.name, bin, stderr,
        killed: false, code, signal, reason: 'exit',
        message: buildMessage(engine.name, 'exit', stderr, code, signal, timeout),
      }));
    });
  });
}
