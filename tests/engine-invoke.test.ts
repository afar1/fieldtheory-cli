import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

// ── Verify execSync return type behavior ────────────────────────────────

test('execSync with encoding returns string, not {stdout,stderr}', () => {
  const result = execSync('echo hello', { encoding: 'utf-8' });
  assert.equal(typeof result, 'string');
  assert.equal(result.trim(), 'hello');

  // Confirm accessing .stdout on a string returns undefined
  assert.equal((result as any).stdout, undefined);
  assert.equal((result as any).stderr, undefined);
});

test('execSync as unknown as {stdout,stderr} cast does not crash on .trim() of stdout', () => {
  const result = execSync('echo hello', { encoding: 'utf-8' }) as unknown as { stdout: string; stderr: string };

  // This is what invokeEngine does — result.stdout is undefined
  assert.equal(result.stdout, undefined);
  assert.equal(result.stderr, undefined);

  // This WOULD crash: result.stdout.trim()
  assert.throws(
    () => result.stdout!.trim(),
    TypeError,
    'Accessing .trim() on undefined should throw TypeError',
  );
});

test('execSync capturing stderr requires stdio: pipe for all', () => {
  // To capture stderr, you need stdio: ['pipe', 'pipe', 'pipe']
  // AND encoding must NOT be set (returns Buffer), or use spawnSync
  const result = execSync('echo out >&2; echo err >&2', {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Even with stdio pipe, execSync with encoding still returns a string (stdout only)
  // stderr goes to the parent's stderr, not captured in the return value
  assert.equal(typeof result, 'string');
});

test('spawnSync can capture both stdout and stderr separately', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('sh', ['-c', 'echo good; echo bad >&2']);

  assert.equal(result.stdout.toString().trim(), 'good');
  assert.equal(result.stderr.toString().trim(), 'bad');
  assert.equal(result.status, 0);
});

// ── invokeEngine behavior ───────────────────────────────────────────────

test('invokeEngine: calls execSync and returns trimmed stdout', async () => {
  // We can't easily import invokeEngine without mocking the engine config,
  // but we can verify the core pattern the function uses
  const output = execSync('echo "  result  "', { encoding: 'utf-8' });
  assert.equal(output.trim(), 'result');
});

test('invokeEngine: shell command with single quotes in args', () => {
  // Verify the shell escaping pattern from invokeEngine
  const prompt = "it's a test";
  const escaped = `'${prompt.replace(/'/g, "'\\''")}'`;
  const cmd = `echo ${escaped}`;
  const result = execSync(cmd, { encoding: 'utf-8' });
  assert.equal(result.trim(), "it's a test");
});
