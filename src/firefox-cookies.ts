import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform, homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

import type { ChromeCookieResult } from './chrome-cookies.js';

/**
 * Detect the default Firefox profile directory.
 *
 * Supports macOS and Linux. Reads profiles.ini to find the profile
 * marked as default-release (the one Firefox actually uses), falling
 * back to any profile that has a cookies.sqlite.
 */
function firefoxBaseDir(): string {
  const os = platform();
  if (os === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Firefox');
  if (os === 'linux') return join(homedir(), '.mozilla', 'firefox');
  throw new Error(
    `Firefox cookie extraction is not yet supported on ${os}.\n` +
    'Supported platforms: macOS, Linux.\n' +
    'Pass --firefox-profile-dir <path> to specify your profile manually.'
  );
}

export function detectFirefoxProfileDir(): string {
  const base = firefoxBaseDir();
  const iniPath = join(base, 'profiles.ini');

  if (!existsSync(iniPath)) {
    throw new Error(
      'Firefox profiles.ini not found.\n' +
      'Is Firefox installed? Expected: ' + iniPath
    );
  }

  const ini = readFileSync(iniPath, 'utf8');
  const profiles: { name: string; path: string; isRelative: boolean }[] = [];
  let current: { name?: string; path?: string; isRelative?: boolean } = {};

  for (const line of ini.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[Profile')) {
      if (current.path) profiles.push(current as any);
      current = {};
    } else if (trimmed.startsWith('Name=')) {
      current.name = trimmed.slice(5);
    } else if (trimmed.startsWith('Path=')) {
      current.path = trimmed.slice(5);
    } else if (trimmed.startsWith('IsRelative=')) {
      current.isRelative = trimmed.slice(11) === '1';
    }
  }
  if (current.path) profiles.push(current as any);

  // Prefer default-release, then any profile with cookies.sqlite
  const resolve = (p: { path: string; isRelative: boolean }) =>
    p.isRelative ? join(base, p.path) : p.path;

  const defaultRelease = profiles.find(p => p.name === 'default-release');
  if (defaultRelease) {
    const dir = resolve(defaultRelease);
    if (existsSync(join(dir, 'cookies.sqlite'))) return dir;
  }

  for (const p of profiles) {
    const dir = resolve(p);
    if (existsSync(join(dir, 'cookies.sqlite'))) return dir;
  }

  throw new Error(
    'No Firefox profile with cookies.sqlite found.\n' +
    'Open Firefox and log into x.com first, then retry.'
  );
}

function queryFirefoxCookies(
  dbPath: string,
  host: string,
  names: string[],
): { name: string; value: string }[] {
  if (!existsSync(dbPath)) {
    throw new Error(
      `Firefox cookies.sqlite not found at: ${dbPath}\n` +
      'Open Firefox and browse to any site first so the cookie DB is created.'
    );
  }

  const nameList = names.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
  const sql = `SELECT name, value FROM moz_cookies WHERE host LIKE '%${host}' AND name IN (${nameList});`;

  const tryQuery = (path: string): string =>
    execFileSync('sqlite3', ['-json', path, sql], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();

  let output: string;
  try {
    output = tryQuery(dbPath);
  } catch {
    // Firefox may hold a WAL lock — copy and query the copy
    const tmpDb = join(tmpdir(), `ft-ff-cookies-${randomUUID()}.db`);
    try {
      copyFileSync(dbPath, tmpDb);
      // Also copy WAL/SHM if they exist so the copy is consistent
      const walPath = dbPath + '-wal';
      const shmPath = dbPath + '-shm';
      if (existsSync(walPath)) copyFileSync(walPath, tmpDb + '-wal');
      if (existsSync(shmPath)) copyFileSync(shmPath, tmpDb + '-shm');
      output = tryQuery(tmpDb);
    } catch (e2: any) {
      throw new Error(
        `Could not read Firefox cookies database.\n` +
        `Path: ${dbPath}\n` +
        `Error: ${e2.message}\n` +
        'If Firefox is open, this is normal — the DB copy should work.\n' +
        'Try closing Firefox and retrying if this persists.'
      );
    } finally {
      try { unlinkSync(tmpDb); } catch {}
      try { unlinkSync(tmpDb + '-wal'); } catch {}
      try { unlinkSync(tmpDb + '-shm'); } catch {}
    }
  }

  if (!output || output === '[]') return [];
  try {
    return JSON.parse(output);
  } catch {
    return [];
  }
}

export function extractFirefoxXCookies(profileDir?: string): ChromeCookieResult {
  const dir = profileDir ?? detectFirefoxProfileDir();
  const dbPath = join(dir, 'cookies.sqlite');

  let cookies = queryFirefoxCookies(dbPath, '.x.com', ['ct0', 'auth_token']);
  if (cookies.length === 0) {
    cookies = queryFirefoxCookies(dbPath, '.twitter.com', ['ct0', 'auth_token']);
  }

  const cookieMap = new Map(cookies.map(c => [c.name, c.value]));

  const ct0 = cookieMap.get('ct0');
  const authToken = cookieMap.get('auth_token');

  if (!ct0) {
    throw new Error(
      'No ct0 CSRF cookie found for x.com in Firefox.\n' +
      'This means you are not logged into X in Firefox.\n\n' +
      'Fix:\n' +
      '  1. Open Firefox\n' +
      '  2. Go to https://x.com and log in\n' +
      '  3. Re-run this command\n'
    );
  }

  const cookieParts = [`ct0=${ct0}`];
  if (authToken) cookieParts.push(`auth_token=${authToken}`);

  return { csrfToken: ct0, cookieHeader: cookieParts.join('; ') };
}
