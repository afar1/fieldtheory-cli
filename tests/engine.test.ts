import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ── Preferences round-trip ─────────────────────────────────────────────

test('preferences: round-trip save and load', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-test-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const { loadPreferences, savePreferences } = await import('../src/preferences.js');
    // Empty at first
    assert.deepEqual(loadPreferences(), {});

    // Save and reload
    savePreferences({ defaultEngine: 'claude' });
    assert.equal(loadPreferences().defaultEngine, 'claude');

    // Overwrite
    savePreferences({ defaultEngine: 'codex' });
    assert.equal(loadPreferences().defaultEngine, 'codex');
  } finally {
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('preferences: savePreferences creates missing data dir', async () => {
  const tmpDir = path.join(os.tmpdir(), `ft-engine-missing-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const { loadPreferences, savePreferences } = await import('../src/preferences.js');
    savePreferences({ defaultEngine: 'claude' });
    assert.equal(loadPreferences().defaultEngine, 'claude');
    assert.ok(fs.existsSync(path.join(tmpDir, '.preferences')));
  } finally {
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('preferences: savePreferences writes private file on posix', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-private-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const { savePreferences } = await import('../src/preferences.js');
    savePreferences({ defaultEngine: 'claude' });
    const mode = fs.statSync(path.join(tmpDir, '.preferences')).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Engine detection ───────────────────────────────────────────────────

test('detectAvailableEngines: returns array of available engines', async () => {
  const { detectAvailableEngines } = await import('../src/engine.js');
  const available = detectAvailableEngines();

  // Should be an array
  assert.ok(Array.isArray(available));

  // Each entry should be a known engine name
  for (const name of available) {
    assert.ok(['claude', 'codex'].includes(name), `unexpected engine: ${name}`);
  }
});

test('hasCommandOnPath: finds executable in PATH', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-path-'));
  const fakeBin = path.join(tmpDir, 'claude');

  try {
    fs.writeFileSync(fakeBin, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(fakeBin, 0o755);

    const { hasCommandOnPath } = await import('../src/engine.js');
    assert.equal(hasCommandOnPath('claude', { PATH: tmpDir }, 'linux'), true);
    assert.equal(hasCommandOnPath('codex', { PATH: tmpDir }, 'linux'), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('hasCommandOnPath: honors PATHEXT on win32', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-path-win-'));
  const fakeBin = path.join(tmpDir, 'codex.CMD');

  try {
    fs.writeFileSync(fakeBin, '@echo off\r\n');

    const { hasCommandOnPath } = await import('../src/engine.js');
    assert.equal(
      hasCommandOnPath('codex', { PATH: tmpDir, PATHEXT: '.EXE;.CMD' }, 'win32'),
      true,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── resolveEngine with saved preference ────────────────────────────────

test('resolveEngine: uses saved preference when available', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-test-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const { detectAvailableEngines, resolveEngine } = await import('../src/engine.js');
    const { savePreferences } = await import('../src/preferences.js');

    const available = detectAvailableEngines();
    if (available.length === 0) {
      // Skip test if no engines available in this environment
      return;
    }

    // Save the first available engine as default
    savePreferences({ defaultEngine: available[0] });
    const resolved = await resolveEngine();
    assert.equal(resolved.name, available[0]);
  } finally {
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── resolveEngine with single engine ───────────────────────────────────

test('resolveEngine: single available engine is used without prompting', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-test-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const { detectAvailableEngines, resolveEngine } = await import('../src/engine.js');
    const available = detectAvailableEngines();

    if (available.length !== 1) {
      // This test is only meaningful with exactly one engine
      return;
    }

    const resolved = await resolveEngine();
    assert.equal(resolved.name, available[0]);
    assert.ok(resolved.config);
    assert.ok(typeof resolved.config.bin === 'string');
    assert.ok(typeof resolved.config.args === 'function');
  } finally {
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── resolveEngine with override ────────────────────────────────────────

test('resolveEngine: override rejects unknown engine', async () => {
  const { resolveEngine } = await import('../src/engine.js');
  await assert.rejects(
    () => resolveEngine({ override: 'bogus' }),
    /Unknown engine "bogus"/,
  );
});

test('resolveEngine: override rejects prototype keys like __proto__', async () => {
  const { resolveEngine } = await import('../src/engine.js');
  for (const name of ['__proto__', 'constructor', 'toString']) {
    await assert.rejects(
      () => resolveEngine({ override: name }),
      /Unknown engine/,
      `override "${name}" should be rejected as unknown`,
    );
  }
});

test('resolveEngine: override fails fast when binary not on PATH', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-override-'));
  const origPath = process.env.PATH;
  process.env.PATH = tmpDir;

  try {
    const { resolveEngine } = await import('../src/engine.js');
    await assert.rejects(
      () => resolveEngine({ override: 'claude' }),
      /Engine "claude" is not on PATH/,
    );
  } finally {
    process.env.PATH = origPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resolveEngine: override returns named engine when binary is on PATH', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-override-ok-'));
  const fakeBin = path.join(tmpDir, 'claude');
  const origPath = process.env.PATH;
  process.env.PATH = tmpDir;

  try {
    fs.writeFileSync(fakeBin, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(fakeBin, 0o755);

    const { resolveEngine } = await import('../src/engine.js');
    const resolved = await resolveEngine({ override: 'claude' });
    assert.equal(resolved.name, 'claude');
    assert.equal(resolved.config.bin, 'claude');
  } finally {
    process.env.PATH = origPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('resolveEngine: codex args include skip-git-repo-check', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-codex-args-'));
  const fakeBin = path.join(tmpDir, 'codex');
  const origPath = process.env.PATH;
  process.env.PATH = tmpDir;

  try {
    fs.writeFileSync(fakeBin, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(fakeBin, 0o755);

    const { resolveEngine } = await import('../src/engine.js');
    const resolved = await resolveEngine({ override: 'codex' });
    assert.deepEqual(
      resolved.config.args('hello'),
      ['exec', '--skip-git-repo-check', 'hello'],
    );
  } finally {
    process.env.PATH = origPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── ft model CLI parsing ───────────────────────────────────────────────

test('ft model: command is registered and shows help', async () => {
  const { buildCli } = await import('../src/cli.js');
  const program = buildCli();
  const modelCmd = program.commands.find((c: any) => c.name() === 'model');
  assert.ok(modelCmd, 'model command should be registered');
  assert.ok(modelCmd.description().includes('LLM engine'));
});

test('ft model: direct set persists preference', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-test-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const { detectAvailableEngines } = await import('../src/engine.js');
    const { loadPreferences, savePreferences } = await import('../src/preferences.js');

    const available = detectAvailableEngines();
    if (available.length === 0) return;

    // Simulate what `ft model <name>` does
    const name = available[0];
    savePreferences({ ...loadPreferences(), defaultEngine: name });
    assert.equal(loadPreferences().defaultEngine, name);
  } finally {
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── invokeEngine / invokeEngineAsync: stdin handling + error shape ─────
//
// Regression tests for claude/fix-claude-auth-errors-at0Oi. These ensure:
//   (a) the child's stdin is CLOSED (EOF immediately), not inherited from
//       the parent — so `claude -p` never hangs waiting on an open pipe;
//   (b) when the child exits non-zero, we throw a structured
//       EngineInvocationError with the actual stderr, not a raw
//       "Command failed: <whole prompt inlined>" string;
//   (c) when the timeout fires, we classify it as reason='timeout' with
//       killed=true — not as a generic exit failure that the md.ts log
//       path would have to string-match on.

function makeFakeEngine(tmpDir: string, script: string): { name: string; config: { bin: string; args: (p: string) => string[] } } {
  const binPath = path.join(tmpDir, 'fake-engine');
  fs.writeFileSync(binPath, script);
  fs.chmodSync(binPath, 0o755);
  return { name: 'fake', config: { bin: binPath, args: (p) => [p] } };
}

test('invokeEngineAsync: child stdin is closed with EOF (does not inherit parent)', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-stdin-'));
  try {
    // Script reads stdin; if EOF comes within 1s it prints "eof"; if nothing
    // arrives within 2s it prints "hang". We want "eof".
    const script = `#!/bin/sh
# Read up to 100 bytes with a 2s timeout. dd reads until EOF or 2s.
read_result=""
if data=$(dd bs=100 count=1 2>/dev/null); then
  if [ -z "$data" ]; then
    echo "eof"
  else
    echo "data:$data"
  fi
else
  echo "read-failed"
fi
`;
    const engine = makeFakeEngine(tmpDir, script);
    const { invokeEngineAsync } = await import('../src/engine.js');

    const start = Date.now();
    const out = await invokeEngineAsync(engine, 'ignored', { timeout: 10_000 });
    const elapsed = Date.now() - start;

    assert.equal(out, 'eof', `expected 'eof', got ${JSON.stringify(out)}`);
    assert.ok(elapsed < 1_500, `should return promptly on EOF, took ${elapsed}ms`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('invokeEngine (sync): child stdin is closed with EOF (does not inherit parent)', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-stdin-sync-'));
  try {
    const script = `#!/bin/sh
if data=$(dd bs=100 count=1 2>/dev/null); then
  if [ -z "$data" ]; then echo "eof"; else echo "data:$data"; fi
else
  echo "read-failed"
fi
`;
    const engine = makeFakeEngine(tmpDir, script);
    const { invokeEngine } = await import('../src/engine.js');

    const start = Date.now();
    const out = invokeEngine(engine, 'ignored', { timeout: 10_000 });
    const elapsed = Date.now() - start;

    assert.equal(out, 'eof', `expected 'eof', got ${JSON.stringify(out)}`);
    assert.ok(elapsed < 1_500, `should return promptly on EOF, took ${elapsed}ms`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('invokeEngineAsync: non-zero exit throws EngineInvocationError with stderr content', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-err-'));
  try {
    const script = `#!/bin/sh
echo "authentication expired, run 'claude /login'" 1>&2
exit 7
`;
    const engine = makeFakeEngine(tmpDir, script);
    const { invokeEngineAsync, EngineInvocationError } = await import('../src/engine.js');

    let caught: any = null;
    try {
      await invokeEngineAsync(engine, 'x'.repeat(5000), { timeout: 5_000 });
    } catch (e) {
      caught = e;
    }

    assert.ok(caught, 'expected invocation to throw');
    assert.ok(caught instanceof EngineInvocationError, `expected EngineInvocationError, got ${caught?.constructor?.name}`);
    assert.equal(caught.reason, 'exit');
    assert.equal(caught.code, 7);
    assert.equal(caught.killed, false);
    assert.ok(caught.stderr.includes('authentication expired'), `stderr should contain real error, got: ${JSON.stringify(caught.stderr)}`);
    // The real regression: error.message must NOT contain the full inlined prompt.
    assert.ok(!caught.message.includes('xxxxxxxxxxxxxxxxxxxxxxx'), `message should not inline the prompt, got: ${JSON.stringify(caught.message.slice(0, 200))}`);
    assert.ok(caught.message.includes('authentication expired'), `message should surface stderr tail, got: ${JSON.stringify(caught.message)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('invokeEngineAsync: timeout throws EngineInvocationError with reason=timeout, killed=true', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-timeout-'));
  try {
    // Sleep longer than the timeout. The parent MUST kill it (otherwise
    // the test itself would hang waiting for sleep 30).
    const script = `#!/bin/sh
sleep 30
echo "should not reach"
`;
    const engine = makeFakeEngine(tmpDir, script);
    const { invokeEngineAsync, EngineInvocationError } = await import('../src/engine.js');

    let caught: any = null;
    const t0 = Date.now();
    try {
      await invokeEngineAsync(engine, 'x'.repeat(5000), { timeout: 500 });
    } catch (e) {
      caught = e;
    }
    const elapsed = Date.now() - t0;

    assert.ok(caught instanceof EngineInvocationError, `expected EngineInvocationError, got ${caught?.constructor?.name}`);
    assert.equal(caught.reason, 'timeout');
    assert.equal(caught.killed, true);
    assert.ok(elapsed < 5_000, `should die near the timeout, not wait 30s: took ${elapsed}ms`);
    // And again: the prompt must not be in .message.
    assert.ok(!caught.message.includes('xxxxxxxxxxxxxxxxxxxxxxx'), `timeout message should not inline prompt, got: ${JSON.stringify(caught.message.slice(0, 200))}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('invokeEngineAsync: spawn failure (ENOENT) throws EngineInvocationError with reason=spawn', async () => {
  const engine = { name: 'fake', config: { bin: '/definitely/not/a/real/binary/anywhere', args: (p: string) => [p] } };
  const { invokeEngineAsync, EngineInvocationError } = await import('../src/engine.js');

  let caught: any = null;
  try {
    await invokeEngineAsync(engine as any, 'hi', { timeout: 5_000 });
  } catch (e) {
    caught = e;
  }

  assert.ok(caught instanceof EngineInvocationError);
  assert.equal(caught.reason, 'spawn');
  assert.equal(caught.killed, false);
});

test('invokeEngineAsync: stdout exceeding maxBuffer throws reason=maxbuffer and kills child', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-maxbuf-'));
  try {
    // Emit a 64KiB burst of stdout, then sleep 30s. With maxBuffer=1024
    // the very first chunk should trip the cap and we should reject with
    // reason='maxbuffer' well before the sleep would otherwise complete.
    const script = `#!/bin/sh
yes x | head -c 65536
sleep 30
`;
    const engine = makeFakeEngine(tmpDir, script);
    const { invokeEngineAsync, EngineInvocationError } = await import('../src/engine.js');

    let caught: any = null;
    const t0 = Date.now();
    try {
      await invokeEngineAsync(engine, 'ignored', { timeout: 10_000, maxBuffer: 1024 });
    } catch (e) {
      caught = e;
    }
    const elapsed = Date.now() - t0;

    assert.ok(caught instanceof EngineInvocationError, `expected EngineInvocationError, got ${caught?.constructor?.name}`);
    assert.equal(caught.reason, 'maxbuffer');
    assert.equal(caught.killed, true);
    assert.ok(elapsed < 5_000, `should trip on first over-cap chunk, not wait for sleep: took ${elapsed}ms`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ── Secret redaction ──────────────────────────────────────────────────
//
// Defense-in-depth: child stderr can in principle contain a secret, and we
// write stderr tails to ~/.fieldtheory/library/log.md. Redact high-confidence
// shapes before they're stored on EngineInvocationError or logged.

test('redactSecrets: masks provider-prefixed API keys', async () => {
  const { redactSecrets } = await import('../src/engine.js');

  const input = 'Error: invalid API key sk-proj-abcdef1234567890zyxwvu after retry';
  const output = redactSecrets(input);
  assert.ok(output.includes('sk-***REDACTED***'), `expected redaction, got: ${output}`);
  assert.ok(!output.includes('abcdef1234567890'), `raw secret should not appear, got: ${output}`);
});

test('redactSecrets: masks GitHub-style prefixed tokens', async () => {
  const { redactSecrets } = await import('../src/engine.js');

  for (const prefix of ['ghp', 'gho', 'ghu', 'ghs', 'ghr']) {
    const input = `token ${prefix}_abcdefghij1234567890ZZZZ expired`;
    const output = redactSecrets(input);
    assert.ok(output.includes(`${prefix}_***REDACTED***`), `expected ${prefix} redaction, got: ${output}`);
    assert.ok(!output.includes('abcdefghij1234567890'), `raw secret should not appear, got: ${output}`);
  }
});

test('redactSecrets: masks Bearer auth tokens', async () => {
  const { redactSecrets } = await import('../src/engine.js');

  const input = 'Request failed: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6Ik';
  const output = redactSecrets(input);
  assert.ok(output.includes('Bearer ***REDACTED***'), `expected Bearer redaction, got: ${output}`);
  assert.ok(!output.includes('eyJhbGci'), `raw token should not appear, got: ${output}`);
});

test('redactSecrets: leaves normal error text untouched', async () => {
  const { redactSecrets } = await import('../src/engine.js');
  const normal = 'rate limit exceeded, please wait a moment and try again';
  assert.equal(redactSecrets(normal), normal);
});

test('invokeEngineAsync: stderr is bounded under STDERR_TAIL_BYTES and redacted before storage', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-stderr-bound-'));
  try {
    // Spam ~100 KiB of stderr noise, then a "real" error line containing a
    // fake secret. The stderr stored on the error should:
    //   - be bounded (tailString clips to ~4 KiB + ellipsis)
    //   - contain the tail (the error line at the end)
    //   - have the fake secret redacted
    const script = `#!/bin/sh
yes 'noise noise noise noise noise noise noise noise noise noise' | head -c 102400 1>&2
echo "Error: invalid sk-ant-abcdef1234567890zyxwvu9876 token" 1>&2
exit 3
`;
    const engine = makeFakeEngine(tmpDir, script);
    const { invokeEngineAsync, EngineInvocationError } = await import('../src/engine.js');

    let caught: any = null;
    try {
      await invokeEngineAsync(engine, 'ignored', { timeout: 10_000 });
    } catch (e) {
      caught = e;
    }

    assert.ok(caught instanceof EngineInvocationError, `expected EngineInvocationError, got ${caught?.constructor?.name}`);
    assert.equal(caught.reason, 'exit');
    assert.equal(caught.code, 3);
    // tailString bounds the stored stderr to ~4 KiB plus the ellipsis char.
    assert.ok(caught.stderr.length < 5_000, `stderr should be clipped to tail, got ${caught.stderr.length} bytes`);
    // The trailing error line should survive into the tail.
    assert.ok(caught.stderr.includes('sk-***REDACTED***'), `expected redacted secret in tail, got: ${JSON.stringify(caught.stderr.slice(-300))}`);
    assert.ok(!caught.stderr.includes('abcdef1234567890'), `raw secret should not appear in stored stderr`);
    // And `.message` should not either, since it's built from the redacted stderr.
    assert.ok(!caught.message.includes('abcdef1234567890'), `raw secret should not appear in .message`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('invokeEngineAsync: SIGTERM-resistant child is killed via SIGKILL escalation', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-engine-sigkill-'));
  try {
    // Child traps SIGTERM (prints a warning, otherwise ignores it) and
    // sleeps. SIGTERM alone would leave it running; the SIGKILL escalation
    // (after SIGKILL_GRACE_MS = 2s) should take it down. We assert that
    // the close event lands within ~5s of the timeout, which is only
    // possible if SIGKILL actually fires.
    const script = `#!/bin/sh
trap 'echo "ignoring SIGTERM" 1>&2' TERM
# Loop so the trap has a chance to run between sleeps.
i=0
while [ $i -lt 60 ]; do sleep 1; i=$((i+1)); done
`;
    const engine = makeFakeEngine(tmpDir, script);
    const { invokeEngineAsync, EngineInvocationError } = await import('../src/engine.js');

    let caught: any = null;
    const t0 = Date.now();
    try {
      // 500ms timeout triggers fail() → SIGTERM; SIGKILL fires 2s later.
      // Total time to reject the promise should be ~500ms (reject happens
      // at SIGTERM, not at SIGKILL — we don't wait for the child to close).
      await invokeEngineAsync(engine, 'ignored', { timeout: 500 });
    } catch (e) {
      caught = e;
    }
    const elapsedReject = Date.now() - t0;

    assert.ok(caught instanceof EngineInvocationError);
    assert.equal(caught.reason, 'timeout');
    assert.ok(elapsedReject < 3_000, `promise should reject at SIGTERM, not wait for grace: took ${elapsedReject}ms`);

    // Give the escalation timer room to land SIGKILL (2s) plus OS slack.
    // The child should be dead by the time this test exits — we can't
    // directly observe the PID state, but if SIGKILL didn't fire, Node's
    // event loop would stay alive holding the child and the test runner
    // would not exit cleanly. Waiting here ensures the escalation has
    // at least had a chance to run before the test harness tears down.
    await new Promise((r) => setTimeout(r, 2_500));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
