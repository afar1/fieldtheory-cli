import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb, saveDb } from '../src/db.js';

function setHomeEnv(homeDir: string): () => void {
  const oldHome = process.env.HOME;
  const oldUserProfile = process.env.USERPROFILE;
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  return () => {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oldUserProfile;
  };
}

async function createFirefoxProfile(profileDir: string): Promise<void> {
  fs.mkdirSync(profileDir, { recursive: true });
  const dbPath = path.join(profileDir, 'cookies.sqlite');
  const db = await createDb();
  db.run(`
    CREATE TABLE moz_cookies (
      id INTEGER PRIMARY KEY,
      host TEXT,
      name TEXT,
      value TEXT,
      path TEXT,
      expiry INTEGER,
      isSecure INTEGER,
      isHttpOnly INTEGER,
      inBrowserElement INTEGER,
      sameSite INTEGER,
      rawSameSite INTEGER,
      schemeMap INTEGER,
      lastAccessed INTEGER,
      creationTime INTEGER
    );
  `);
  saveDb(db, dbPath);
  db.close();
}

test('listFirefoxProfileDirs prefers install-default profile roots before stale alternatives', async () => {
  if (process.platform !== 'linux') return;

  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-firefox-detect-home-'));
  const legacyRoot = path.join(homeDir, '.mozilla', 'firefox');
  const configRoot = path.join(homeDir, '.config', 'mozilla', 'firefox');
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.mkdirSync(configRoot, { recursive: true });

  await createFirefoxProfile(path.join(legacyRoot, 'wrong.default'));
  fs.writeFileSync(
    path.join(legacyRoot, 'profiles.ini'),
    ['[Profile0]', 'Name=default', 'IsRelative=1', 'Path=wrong.default', 'Default=1', ''].join('\n'),
    'utf8',
  );

  await createFirefoxProfile(path.join(configRoot, 'chosen.default-release'));
  fs.writeFileSync(
    path.join(configRoot, 'profiles.ini'),
    [
      '[InstallTEST]',
      'Default=chosen.default-release',
      'Locked=1',
      '',
      '[Profile0]',
      'Name=default-release',
      'IsRelative=1',
      'Path=chosen.default-release',
      '',
    ].join('\n'),
    'utf8',
  );

  const restore = setHomeEnv(homeDir);
  try {
    const { listFirefoxProfileDirs, detectFirefoxProfileDir } = await import('../src/firefox-cookies.js');
    const dirs = listFirefoxProfileDirs();
    assert.equal(dirs[0], path.join(configRoot, 'chosen.default-release'));
    assert.equal(detectFirefoxProfileDir(), path.join(configRoot, 'chosen.default-release'));
  } finally {
    restore();
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test('detectFirefoxProfileDir explains checked roots when no profiles are found', async () => {
  if (process.platform !== 'linux') return;

  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-firefox-detect-empty-'));
  const restore = setHomeEnv(homeDir);
  try {
    const { detectFirefoxProfileDir } = await import('../src/firefox-cookies.js');
    assert.throws(
      () => detectFirefoxProfileDir(),
      /Checked:[\s\S]*--firefox-profile-dir <path>/i,
    );
  } finally {
    restore();
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});
