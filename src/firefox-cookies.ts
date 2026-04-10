import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { createRequire } from 'node:module';
import type { ChromeCookieResult } from './chrome-cookies.js';
import { getBrowser, browserUserDataDir } from './browsers.js';

const require = createRequire(import.meta.url);

interface SqliteRow {
  [key: string]: unknown;
}

interface NodeSqliteModule {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => {
    prepare(sql: string): { all(...params: unknown[]): SqliteRow[] };
    close(): void;
  };
}

let nodeSqliteModule: NodeSqliteModule | null | undefined;
let sqlite3BinaryAvailable: boolean | undefined;

const FIREFOX_WINDOWS_BACKEND_REQUIREMENT =
  'Firefox on Windows requires Node.js 22.5+ or sqlite3 on PATH.';

function hasSqlite3Binary(): boolean {
  if (sqlite3BinaryAvailable !== undefined) return sqlite3BinaryAvailable;
  try {
    execFileSync('sqlite3', ['-version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });
    sqlite3BinaryAvailable = true;
  } catch {
    sqlite3BinaryAvailable = false;
  }
  return sqlite3BinaryAvailable;
}

export function ensureFirefoxCookieBackendAvailable(
  os: string = platform(),
  hasNodeSqlite?: boolean,
  hasSqlite3?: boolean,
): void {
  if (os !== 'win32') return;

  const nodeSqliteAvailable = hasNodeSqlite ?? loadNodeSqlite() !== null;
  if (nodeSqliteAvailable) return;

  const sqlite3Available = hasSqlite3 ?? hasSqlite3Binary();
  if (sqlite3Available) return;

  throw new Error(
    `${FIREFOX_WINDOWS_BACKEND_REQUIREMENT}\n` +
    'Fix:\n' +
    '  1. Upgrade to Node.js 22.5+ (recommended), or\n' +
    '  2. Install sqlite3 and make sure it is on PATH, or\n' +
    '  3. Pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
  );
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

function loadNodeSqlite(): NodeSqliteModule | null {
  if (nodeSqliteModule !== undefined) return nodeSqliteModule;
  try {
    nodeSqliteModule = require('node:sqlite') as NodeSqliteModule;
  } catch {
    nodeSqliteModule = null;
  }
  return nodeSqliteModule;
}

function createFirefoxSnapshot(dbPath: string): { snapshotPath: string; cleanup: () => void } {
  const snapshotDir = mkdtempSync(join(tmpdir(), 'ft-ff-cookies-'));
  const snapshotPath = join(snapshotDir, basename(dbPath));
  try {
    copyFileSync(dbPath, snapshotPath);
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (existsSync(walPath)) copyFileSync(walPath, snapshotPath + '-wal');
    if (existsSync(shmPath)) copyFileSync(shmPath, snapshotPath + '-shm');
    return {
      snapshotPath,
      cleanup: () => rmSync(snapshotDir, { recursive: true, force: true }),
    };
  } catch (e) {
    rmSync(snapshotDir, { recursive: true, force: true });
    throw e;
  }
}

function queryWithNodeSqlite(
  snapshotPath: string,
  host: string,
  names: string[],
): { name: string; value: string }[] | null {
  const sqlite = loadNodeSqlite();
  if (!sqlite) return null;

  const db = new sqlite.DatabaseSync(snapshotPath, { readOnly: true });
  try {
    const placeholders = names.map(() => '?').join(', ');
    const stmt = db.prepare(
      `SELECT name, value FROM moz_cookies WHERE host LIKE ? AND name IN (${placeholders});`
    );
    return stmt.all(`%${host}`, ...names).map((row) => ({
      name: String(row.name ?? ''),
      value: String(row.value ?? ''),
    }));
  } finally {
    db.close();
  }
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

  const safeHost = host.replace(/'/g, "''");
  const nameList = names.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
  const sql = `SELECT name, value FROM moz_cookies WHERE host LIKE '%${safeHost}' AND name IN (${nameList});`;
  const tryQueryWithBinary = (path: string): string =>
    execFileSync('sqlite3', ['-json', path, sql], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();

  const buildReadError = (error: unknown): Error => {
    const message = error instanceof Error ? error.message : String(error);
    const needsNativeSqliteHint =
      platform() === 'win32' &&
      !loadNodeSqlite() &&
      /sqlite3|ENOENT/i.test(message);
    return new Error(
      `Could not read Firefox cookies database.\n` +
      `Path: ${dbPath}\n` +
      `Error: ${message}\n` +
      (needsNativeSqliteHint
        ? 'Fix: Use Node.js 22.5+ on Windows, or install sqlite3 on PATH.\n'
        : '') +
      'If Firefox is open, try closing it and retrying.'
    );
  };

  try {
    const { snapshotPath, cleanup } = createFirefoxSnapshot(dbPath);
    try {
      const nativeRows = queryWithNodeSqlite(snapshotPath, host, names);
      if (nativeRows) return nativeRows;

      const output = tryQueryWithBinary(snapshotPath);
      if (!output || output === '[]') return [];
      try {
        return JSON.parse(output);
      } catch {
        return [];
      }
    } finally {
      cleanup();
    }
  } catch (error) {
    throw buildReadError(error);
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export function extractFirefoxXCookies(profileDir?: string): ChromeCookieResult {
  const dir = profileDir ?? detectFirefoxProfileDir();
  const dbPath = join(dir, 'cookies.sqlite');
  ensureFirefoxCookieBackendAvailable();

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
