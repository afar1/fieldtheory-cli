import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeJson } from '../src/fs.js';

test('writeJson: supports secure file mode for sensitive writes', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-fs-test-'));
  const filePath = path.join(tmpDir, 'secret.json');

  try {
    await writeJson(filePath, { token: 'abc' }, { mode: 0o600 });
    const mode = fs.statSync(filePath).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
