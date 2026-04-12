import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, createCipheriv } from 'node:crypto';
import type { spawnSync, SpawnSyncReturns } from 'node:child_process';
import {
  buildWindowsDpapiScript,
  decryptCookieValue,
  runWindowsDpapi,
  windowsPowerShellCandidates,
} from '../src/chrome-cookies.js';

function encryptLikeChrome(plaintext: string, password = 'test-password'): { encrypted: Buffer; key: Buffer } {
  const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  const iv = Buffer.alloc(16, 0x20);
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const encrypted = Buffer.concat([Buffer.from('v10'), ciphertext]);
  return { encrypted, key };
}

function makeSpawnResult(overrides: Partial<SpawnSyncReturns<string>>): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [null, '', ''],
    stdout: '',
    stderr: '',
    status: 0,
    signal: null,
    ...overrides,
  };
}

test('decryptCookieValue: decrypts v10-prefixed Chrome cookie', () => {
  const { encrypted, key } = encryptLikeChrome('my-secret-csrf-token');
  const result = decryptCookieValue(encrypted, key);
  assert.equal(result, 'my-secret-csrf-token');
});

test('decryptCookieValue: returns empty string for empty buffer', () => {
  const key = pbkdf2Sync('test', 'saltysalt', 1003, 16, 'sha1');
  const result = decryptCookieValue(Buffer.alloc(0), key);
  assert.equal(result, '');
});

test('decryptCookieValue: returns raw utf8 for non-v10 prefix (unencrypted)', () => {
  const key = pbkdf2Sync('test', 'saltysalt', 1003, 16, 'sha1');
  const buf = Buffer.from('plain-cookie-value', 'utf8');
  const result = decryptCookieValue(buf, key);
  assert.equal(result, 'plain-cookie-value');
});

test('decryptCookieValue: round-trips various cookie values', () => {
  const values = [
    'abc123',
    'a-much-longer-csrf-token-that-is-over-16-bytes-long-and-needs-multiple-blocks',
    '特殊文字',
    '{"json":"value"}',
  ];
  for (const value of values) {
    const { encrypted, key } = encryptLikeChrome(value);
    const result = decryptCookieValue(encrypted, key);
    assert.equal(result, value, `Round-trip failed for: ${value}`);
  }
});

test('decryptCookieValue: uses correct PBKDF2 parameters (1003 iterations, sha1, saltysalt)', () => {
  const password = 'Chrome-Safe-Storage-Password';
  const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  const { encrypted } = encryptLikeChrome('test-value', password);
  const result = decryptCookieValue(encrypted, key);
  assert.equal(result, 'test-value');
});

test('buildWindowsDpapiScript: probes assemblies before calling ProtectedData', () => {
  const script = buildWindowsDpapiScript('base64');
  assert.match(script, /Add-Type -AssemblyName \$assembly/);
  assert.match(script, /System\.Security\.Cryptography\.ProtectedData/);
  assert.match(script, /DPAPI types are unavailable in this PowerShell runtime/);
  assert.match(script, /ToBase64String/);
});

test('windowsPowerShellCandidates: only returns trusted absolute paths', () => {
  const candidates = windowsPowerShellCandidates({
    SystemRoot: 'C:\\Windows',
  } as NodeJS.ProcessEnv, () => true);
  assert.equal(candidates[0], 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(candidates[1], 'C:\\Windows\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(candidates.length, 2);
});

test('windowsPowerShellCandidates: returns empty when SystemRoot is missing or relative', () => {
  assert.deepEqual(windowsPowerShellCandidates({} as NodeJS.ProcessEnv), []);
  assert.deepEqual(windowsPowerShellCandidates({ SystemRoot: 'Windows' } as NodeJS.ProcessEnv), []);
});

test('runWindowsDpapi: falls back to Sysnative when the System32 path is unavailable', () => {
  const calls: string[] = [];
  const fakeSpawn = ((command: string) => {
    calls.push(command);
    if (calls.length === 1) {
      const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
      return makeSpawnResult({ error: err, status: null });
    }
    return makeSpawnResult({ stdout: 'ZGVjcnlwdGVk\n' });
  }) as unknown as typeof spawnSync;

  const out = runWindowsDpapi(Buffer.from('secret'), 'base64', {
    env: { SystemRoot: 'C:\\Windows' },
    failureLabel: 'Could not decrypt encryption key via DPAPI.',
    pathExists: () => true,
    spawn: fakeSpawn,
    timeoutMs: 1000,
  });

  assert.equal(out, 'ZGVjcnlwdGVk');
  assert.equal(calls[0], 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(calls[1], 'C:\\Windows\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe');
});

test('runWindowsDpapi: surfaces runtime mismatch clearly', () => {
  const fakeSpawn = (() => makeSpawnResult({
    status: 1,
    stderr: 'DPAPI types are unavailable in this PowerShell runtime. Prefer Windows PowerShell (powershell.exe).',
  })) as unknown as typeof spawnSync;

  assert.throws(
    () => runWindowsDpapi(Buffer.from('secret'), 'base64', {
      env: { SystemRoot: 'C:\\Windows' },
      failureLabel: 'Could not decrypt encryption key via DPAPI.',
      pathExists: () => true,
      spawn: fakeSpawn,
      timeoutMs: 1000,
    }),
    /Could not decrypt encryption key via DPAPI\.[\s\S]*DPAPI types are unavailable in this PowerShell runtime/,
  );
});

test('runWindowsDpapi: reports when no PowerShell runtime is available', () => {
  const fakeSpawn = (() => {
    const err = Object.assign(new Error('not found'), { code: 'ENOENT' });
    return makeSpawnResult({ error: err, status: null });
  }) as unknown as typeof spawnSync;

  assert.throws(
    () => runWindowsDpapi(Buffer.from('secret'), 'base64', {
      env: { SystemRoot: 'C:\\Windows' },
      failureLabel: 'Could not decrypt encryption key via DPAPI.',
      spawn: fakeSpawn,
      timeoutMs: 1000,
    }),
    /Could not decrypt encryption key via DPAPI\.[\s\S]*Could not find a trusted Windows PowerShell binary for DPAPI decryption/,
  );
});
