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
