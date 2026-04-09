import { existsSync, readFileSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir, platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { SqlJsStatic } from 'sql.js';
import type { ChromeCookieResult } from './chrome-cookies.js';
import { getBrowser, browserUserDataDir } from './browsers.js';

const require = createRequire(import.meta.url);

// ── sql.js lazy init (shared pattern with src/db.ts) ─────────────────────────

let sqlPromise: Promise<SqlJsStatic> | undefined;

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const initSqlJs = require('sql.js-fts5') as (opts: any) => Promise<SqlJsStatic>;
    const wasmPath = require.resolve('sql.js-fts5/dist/sql-wasm.wasm');
    const wasmBinary = readFileSync(wasmPath);
    sqlPromise = initSqlJs({ wasmBinary });
  }
  return sqlPromise!;
}

// ── Profile detection ────────────────────────────────────────────────────────

function firefoxBaseDir(): string {
  const dir = browserUserDataDir(getBrowser('firefox'));
  if (dir) return dir;
  throw new Error(
    `Firefox cookie extraction is not supported on this platform (detected: ${platform()}).\n` +
    'Pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
  );
}

export function detectFirefoxProfileDir(): string {
  const base = firefoxBaseDir();
  const iniPath = join(base, 'profiles.ini');

  if (!existsSync(iniPath)) {
    throw new Error(
      'Firefox profiles.ini not found.\n' +
      `Is Firefox installed? Expected: ${iniPath}`
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

  const resolve = (p: { path: string; isRelative: boolean }) =>
    p.isRelative ? join(base, p.path) : p.path;

  // Prefer default-release, then any profile with cookies.sqlite
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

// ── Cookie query ─────────────────────────────────────────────────────────────

/**
 * Read ct0/auth_token from a Firefox cookies.sqlite using the bundled sql.js
 * WebAssembly build. No external `sqlite3` binary is required, which matters
 * on Windows where sqlite3 isn't in PATH by default.
 *
 * Firefox may hold a WAL lock on the live DB, so we always copy the file
 * (plus any -wal and -shm siblings) to a tmpdir before opening it.
 */
async function queryFirefoxCookies(
  dbPath: string,
  host: string,
  names: string[],
): Promise<{ name: string; value: string }[]> {
  if (!existsSync(dbPath)) {
    throw new Error(
      `Firefox cookies.sqlite not found at: ${dbPath}\n` +
      'Open Firefox and browse to any site first so the cookie DB is created.'
    );
  }

  const tmpDb = join(tmpdir(), `ft-ff-cookies-${randomUUID()}.db`);
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';

  try {
    copyFileSync(dbPath, tmpDb);
    if (existsSync(walPath)) copyFileSync(walPath, tmpDb + '-wal');
    if (existsSync(shmPath)) copyFileSync(shmPath, tmpDb + '-shm');
  } catch (e: any) {
    throw new Error(
      `Could not read Firefox cookies database.\n` +
      `Path: ${dbPath}\n` +
      `Error: ${e.message}\n` +
      'If Firefox is open, try closing it and retrying.'
    );
  }

  try {
    const SQL = await getSql();
    const bytes = readFileSync(tmpDb);
    const db = new SQL.Database(bytes);
    try {
      // Parameterized query — no string interpolation of host/names into SQL.
      const placeholders = names.map(() => '?').join(',');
      const stmt = db.prepare(
        `SELECT name, value FROM moz_cookies ` +
        `WHERE host LIKE ? AND name IN (${placeholders})`
      );
      stmt.bind([`%${host}`, ...names]);
      const rows: { name: string; value: string }[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as { name: string; value: string };
        rows.push({ name: row.name, value: row.value });
      }
      stmt.free();
      return rows;
    } finally {
      db.close();
    }
  } finally {
    try { unlinkSync(tmpDb); } catch {}
    try { unlinkSync(tmpDb + '-wal'); } catch {}
    try { unlinkSync(tmpDb + '-shm'); } catch {}
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function extractFirefoxXCookies(profileDir?: string): Promise<ChromeCookieResult> {
  const dir = profileDir ?? detectFirefoxProfileDir();
  const dbPath = join(dir, 'cookies.sqlite');

  let cookies = await queryFirefoxCookies(dbPath, '.x.com', ['ct0', 'auth_token']);
  if (cookies.length === 0) {
    cookies = await queryFirefoxCookies(dbPath, '.twitter.com', ['ct0', 'auth_token']);
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
      '  3. Re-run this command'
    );
  }

  // Validate cookie values are printable ASCII (same check as Chrome path)
  const validateCookie = (name: string, value: string): string => {
    const cleaned = value.trim();
    if (!cleaned || !/^[\x21-\x7E]+$/.test(cleaned)) {
      throw new Error(
        `Firefox ${name} cookie appears invalid.\n` +
        'Try clearing Firefox cookies for x.com and logging in again.'
      );
    }
    return cleaned;
  };

  const cleanCt0 = validateCookie('ct0', ct0);
  const cookieParts = [`ct0=${cleanCt0}`];
  if (authToken) cookieParts.push(`auth_token=${validateCookie('auth_token', authToken)}`);

  return { csrfToken: cleanCt0, cookieHeader: cookieParts.join('; ') };
}
