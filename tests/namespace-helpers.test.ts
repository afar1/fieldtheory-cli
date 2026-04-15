import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureNamespaceDataDir, resolveNamespaceDataDir } from '../src/namespace-paths.js';
import { renderStatusSections } from '../src/status-render.js';

test('resolveNamespaceDataDir prefers primary env, then legacy env, then dataDir subdir', () => {
  const oldRoot = process.env.FT_DATA_DIR;
  const oldPrimary = process.env.FT_TEST_PRIMARY_DIR;
  const oldLegacy = process.env.FT_TEST_LEGACY_DIR;

  process.env.FT_DATA_DIR = '/tmp/ft-root';
  delete process.env.FT_TEST_PRIMARY_DIR;
  delete process.env.FT_TEST_LEGACY_DIR;
  assert.equal(resolveNamespaceDataDir('FT_TEST_PRIMARY_DIR', 'FT_TEST_LEGACY_DIR', 'demo'), '/tmp/ft-root/demo');

  process.env.FT_TEST_LEGACY_DIR = '/tmp/legacy-demo';
  assert.equal(resolveNamespaceDataDir('FT_TEST_PRIMARY_DIR', 'FT_TEST_LEGACY_DIR', 'demo'), '/tmp/legacy-demo');

  process.env.FT_TEST_PRIMARY_DIR = '/tmp/primary-demo';
  assert.equal(resolveNamespaceDataDir('FT_TEST_PRIMARY_DIR', 'FT_TEST_LEGACY_DIR', 'demo'), '/tmp/primary-demo');

  if (oldRoot === undefined) delete process.env.FT_DATA_DIR; else process.env.FT_DATA_DIR = oldRoot;
  if (oldPrimary === undefined) delete process.env.FT_TEST_PRIMARY_DIR; else process.env.FT_TEST_PRIMARY_DIR = oldPrimary;
  if (oldLegacy === undefined) delete process.env.FT_TEST_LEGACY_DIR; else process.env.FT_TEST_LEGACY_DIR = oldLegacy;
});

test('resolveNamespaceDataDir ignores empty-string overrides', () => {
  const oldRoot = process.env.FT_DATA_DIR;
  const oldPrimary = process.env.FT_TEST_PRIMARY_DIR;
  const oldLegacy = process.env.FT_TEST_LEGACY_DIR;

  process.env.FT_DATA_DIR = '/tmp/ft-root';
  process.env.FT_TEST_PRIMARY_DIR = '';
  process.env.FT_TEST_LEGACY_DIR = '';

  assert.equal(resolveNamespaceDataDir('FT_TEST_PRIMARY_DIR', 'FT_TEST_LEGACY_DIR', 'demo'), '/tmp/ft-root/demo');

  if (oldRoot === undefined) delete process.env.FT_DATA_DIR; else process.env.FT_DATA_DIR = oldRoot;
  if (oldPrimary === undefined) delete process.env.FT_TEST_PRIMARY_DIR; else process.env.FT_TEST_PRIMARY_DIR = oldPrimary;
  if (oldLegacy === undefined) delete process.env.FT_TEST_LEGACY_DIR; else process.env.FT_TEST_LEGACY_DIR = oldLegacy;
});

test('ensureNamespaceDataDir creates missing directory and returns it', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-namespace-dir-'));
  const target = path.join(tmpRoot, 'nested', 'demo');
  try {
    assert.equal(fs.existsSync(target), false);
    assert.equal(ensureNamespaceDataDir(target), target);
    assert.equal(fs.existsSync(target), true);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('renderStatusSections renders titled padded status blocks', () => {
  const rendered = renderStatusSections([
    {
      title: 'Demo',
      lines: [
        { label: 'alpha:', value: 'one' },
        { label: 'beta:', value: 'two' },
      ],
    },
  ]);

  assert.equal(rendered, '\nDemo\n  alpha:         one\n  beta:          two');
});
