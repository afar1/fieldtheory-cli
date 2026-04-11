import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { saveTwitterOAuthToken } from '../src/xauth.js';

test('saveTwitterOAuthToken: writes private token file on posix', async () => {
  if (process.platform === 'win32') return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-xauth-test-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;

  try {
    const tokenPath = await saveTwitterOAuthToken({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      scope: 'bookmark.read',
      token_type: 'bearer',
      obtained_at: new Date().toISOString(),
    });

    const mode = fs.statSync(tokenPath).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    process.env.FT_DATA_DIR = origEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
