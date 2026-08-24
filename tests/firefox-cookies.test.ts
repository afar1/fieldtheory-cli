import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb, saveDb } from '../src/db.js';
import {
  extractFirefoxInstagramCookies,
  extractFirefoxXCookies,
  ensureFirefoxCookieBackendAvailable,
} from '../src/firefox-cookies.js';

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
    const cookies = extractFirefoxXCookies(profileDir);
    assert.equal(cookies.csrfToken, 'csrf-token');
    assert.match(cookies.cookieHeader, /ct0=csrf-token/);
    assert.match(cookies.cookieHeader, /auth_token=auth-token/);
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});

test('extractFirefoxXCookies falls back to twitter.com cookies when x.com is absent', async () => {
  const profileDir = await createFirefoxProfile([
    { host: '.twitter.com', name: 'ct0', value: 'legacy-csrf-token' },
    { host: '.twitter.com', name: 'auth_token', value: 'legacy-auth-token' },
  ]);

  try {
    const cookies = extractFirefoxXCookies(profileDir);
    assert.equal(cookies.csrfToken, 'legacy-csrf-token');
    assert.match(cookies.cookieHeader, /ct0=legacy-csrf-token/);
    assert.match(cookies.cookieHeader, /auth_token=legacy-auth-token/);
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});

test('extractFirefoxInstagramCookies reads only the fixed Instagram session cookie set', async () => {
  const profileDir = await createFirefoxProfile([
    { host: '.instagram.com', name: 'sessionid', value: 'ig-session' },
    { host: '.instagram.com', name: 'csrftoken', value: 'ig-csrf' },
    { host: '.instagram.com', name: 'ds_user_id', value: '123' },
    { host: '.instagram.com', name: 'rur', value: 'bad\noptional' },
    { host: '.example.com', name: 'sessionid', value: 'wrong-domain' },
  ]);
  try {
    const cookies = extractFirefoxInstagramCookies(profileDir);
    assert.equal(cookies.csrfToken, 'ig-csrf');
    assert.match(cookies.cookieHeader, /sessionid=ig-session/);
    assert.match(cookies.cookieHeader, /csrftoken=ig-csrf/);
    assert.doesNotMatch(cookies.cookieHeader, /bad|rur=/);
    assert.doesNotMatch(cookies.cookieHeader, /wrong-domain/);
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
});

test('extractFirefoxInstagramCookies rewrites shared X recovery guidance for Instagram', () => {
  assert.throws(
    () => extractFirefoxInstagramCookies('/definitely/missing/firefox-profile'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /ft sync --cookies|x\.com/);
      assert.match(error.message, /Instagram|instagram/);
      return true;
    },
  );
});

test('ensureFirefoxCookieBackendAvailable: rejects unsupported Windows runtime clearly', () => {
  assert.throws(
    () => ensureFirefoxCookieBackendAvailable('win32', false, false),
    /Firefox on Windows requires Node\.js 22\.5\+ or sqlite3 on PATH/,
  );
});

test('ensureFirefoxCookieBackendAvailable: allows Windows when a supported backend exists', () => {
  assert.doesNotThrow(() => ensureFirefoxCookieBackendAvailable('win32', true, false));
  assert.doesNotThrow(() => ensureFirefoxCookieBackendAvailable('win32', false, true));
  assert.doesNotThrow(() => ensureFirefoxCookieBackendAvailable('linux', false, false));
});
