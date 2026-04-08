import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb, saveDb } from '../src/db.js';
import { extractFirefoxXCookies } from '../src/firefox-cookies.js';

async function createFirefoxProfile(cookies: Array<{ host: string; name: string; value: string }>): Promise<string> {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-firefox-profile-'));
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

  for (const [index, cookie] of cookies.entries()) {
    db.run(
      `INSERT INTO moz_cookies
        (id, host, name, value, path, expiry, isSecure, isHttpOnly, inBrowserElement, sameSite, rawSameSite, schemeMap, lastAccessed, creationTime)
       VALUES (?, ?, ?, ?, '/', 0, 0, 0, 0, 0, 0, 0, ?, ?);`,
      [index + 1, cookie.host, cookie.name, cookie.value, Date.now() + index, Date.now() + index],
    );
  }

  saveDb(db, dbPath);
  db.close();
  return profileDir;
}

test('extractFirefoxXCookies reads x.com cookies from a provided profile dir', async () => {
  const profileDir = await createFirefoxProfile([
    { host: '.x.com', name: 'ct0', value: 'csrf-token' },
    { host: '.x.com', name: 'auth_token', value: 'auth-token' },
  ]);

  try {
    const cookies = await extractFirefoxXCookies(profileDir);
    assert.equal(cookies.csrfToken, 'csrf-token');
    assert.match(cookies.cookieHeader, /ct0=csrf-token/);
    assert.match(cookies.cookieHeader, /auth_token=auth-token/);
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});
