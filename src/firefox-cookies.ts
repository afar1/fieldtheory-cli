import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, copyFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir, platform, homedir } from 'node:os';
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

interface FirefoxProfileEntry {
  name: string | null;
  path: string;
  isRelative: boolean;
  isDefault: boolean;
  installDefault: boolean;
}

interface FirefoxProfileCandidate {
  dir: string;
  name: string | null;
  isDefault: boolean;
  installDefault: boolean;
  modifiedMs: number;
}

const FIREFOX_EXTRA_ROOTS: Record<string, string[]> = {
  darwin: [],
  linux: [
    '.config/mozilla/firefox',
    'snap/firefox/common/.mozilla/firefox',
    '.var/app/org.mozilla.firefox/.mozilla/firefox',
  ],
  win32: [],
};

function firefoxBaseDirs(): string[] {
  const os = platform();
  const home = homedir();
  const browserDir = browserUserDataDir(getBrowser('firefox'));
  const extraRoots = (FIREFOX_EXTRA_ROOTS[os] ?? []).map((relative) => join(home, relative));
  const candidates = [browserDir, ...extraRoots].filter((value): value is string => Boolean(value));
  if (candidates.length > 0) return [...new Set(candidates)];

  throw new Error(
    `Firefox cookie extraction is not supported on this platform (detected: ${os}).\n` +
    'Pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
  );
}

function parseFirefoxProfilesIni(ini: string): FirefoxProfileEntry[] {
  const sections = ini
    .split(/\r?\n(?=\[)/)
    .map((section) => section.trim())
    .filter(Boolean);

  const installDefaults = new Set<string>();
  const profiles: FirefoxProfileEntry[] = [];

  for (const section of sections) {
    const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const header = lines[0]?.match(/^\[([^\]]+)\]$/)?.[1] ?? null;
    if (!header) continue;

    const values: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      if (line.startsWith(';')) continue;
      const equals = line.indexOf('=');
      if (equals <= 0) continue;
      values[line.slice(0, equals).trim()] = line.slice(equals + 1).trim();
    }

    if (header.startsWith('Install') && values.Default) {
      installDefaults.add(values.Default);
      continue;
    }

    if (!header.startsWith('Profile') || !values.Path) continue;
    profiles.push({
      name: values.Name ?? null,
      path: values.Path,
      isRelative: values.IsRelative !== '0',
      isDefault: values.Default === '1',
      installDefault: false,
    });
  }

  return profiles.map((profile) => ({
    ...profile,
    installDefault: installDefaults.has(profile.path),
  }));
}

function firefoxProfileScore(candidate: FirefoxProfileCandidate): number {
  let score = 0;
  if (candidate.installDefault) score += 1000;
  if (candidate.isDefault) score += 500;

  const name = (candidate.name ?? '').toLowerCase();
  const base = basename(candidate.dir).toLowerCase();
  if (name === 'default-release') score += 200;
  else if (name === 'default') score += 150;
  else if (name.includes('default')) score += 100;

  if (base.includes('default-release')) score += 80;
  else if (base.includes('default')) score += 40;
  return score;
}

function firefoxProfileModifiedMs(profileDir: string): number {
  try {
    return statSync(join(profileDir, 'cookies.sqlite')).mtimeMs;
  } catch {
    return 0;
  }
}

function collectFirefoxProfileCandidates(root: string): FirefoxProfileCandidate[] {
  const candidates: FirefoxProfileCandidate[] = [];
  const seen = new Set<string>();
  const addCandidate = (
    dir: string,
    details: { name?: string | null; isDefault?: boolean; installDefault?: boolean } = {},
  ): void => {
    const cookiesPath = join(dir, 'cookies.sqlite');
    if (!existsSync(cookiesPath) || seen.has(dir)) return;
    seen.add(dir);
    candidates.push({
      dir,
      name: details.name ?? null,
      isDefault: details.isDefault ?? false,
      installDefault: details.installDefault ?? false,
      modifiedMs: firefoxProfileModifiedMs(dir),
    });
  };

  const iniPath = join(root, 'profiles.ini');
  if (existsSync(iniPath)) {
    const ini = readFileSync(iniPath, 'utf8');
    for (const profile of parseFirefoxProfilesIni(ini)) {
      const dir = profile.isRelative ? join(root, profile.path) : profile.path;
      addCandidate(dir, profile);
    }
  }

  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      addCandidate(join(root, entry.name));
    }
  } catch {
    // Ignore unreadable roots and rely on other candidates.
  }

  return candidates;
}

function buildFirefoxProfileDiscoveryError(roots: string[], sawProfilesIni: boolean): Error {
  const checked = roots.map((root) => `  ${root}`).join('\n');
  return new Error(
    (sawProfilesIni
      ? 'No Firefox profile with cookies.sqlite found in the standard profile roots.\n'
      : 'Firefox profiles.ini was not found in the standard profile roots.\n') +
    `Checked:\n${checked}\n` +
    'If auto-detect missed your profile, pass it explicitly with --firefox-profile-dir <path>.'
  );
}

export function listFirefoxProfileDirs(): string[] {
  const roots = firefoxBaseDirs();
  const candidates: FirefoxProfileCandidate[] = [];

  for (const root of roots) {
    if (!existsSync(root)) continue;
    candidates.push(...collectFirefoxProfileCandidates(root));
  }

  candidates.sort((a, b) =>
    firefoxProfileScore(b) - firefoxProfileScore(a)
    || b.modifiedMs - a.modifiedMs
    || a.dir.localeCompare(b.dir)
  );

  return candidates.map((candidate) => candidate.dir);
}

export function detectFirefoxProfileDir(): string {
  const roots = firefoxBaseDirs();
  const dirs = listFirefoxProfileDirs();
  if (dirs.length > 0) return dirs[0];

  const sawProfilesIni = roots.some((root) => existsSync(join(root, 'profiles.ini')));
  throw buildFirefoxProfileDiscoveryError(roots, sawProfilesIni);
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

function buildFirefoxReadError(dbPath: string, error: unknown, recoveryHint: string): Error {
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
    recoveryHint
  );
}

function queryFirefoxSqlWithNodeSqlite<T>(
  snapshotPath: string,
  sql: string,
  mapRow: (row: SqliteRow) => T,
): T[] | null {
  const sqlite = loadNodeSqlite();
  if (!sqlite) return null;

  const db = new sqlite.DatabaseSync(snapshotPath, { readOnly: true });
  try {
    return db.prepare(sql).all().map(mapRow);
  } finally {
    db.close();
  }
}

function queryFirefoxSqlWithSqlite3<T>(
  snapshotPath: string,
  sql: string,
  mapRow: (row: SqliteRow) => T,
): T[] {
  const output = execFileSync('sqlite3', ['-json', snapshotPath, sql], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 10000,
  }).trim();

  if (!output || output === '[]') return [];
  try {
    return (JSON.parse(output) as SqliteRow[]).map(mapRow);
  } catch {
    return [];
  }
}

export function queryFirefoxSqlRows<T>(
  dbPath: string,
  sql: string,
  mapRow: (row: SqliteRow) => T,
  recoveryHint: string = 'If Firefox is open, try closing it and retrying.',
): T[] {
  if (!existsSync(dbPath)) {
    throw new Error(
      `Firefox cookies.sqlite not found at: ${dbPath}\n` +
      'Open Firefox and browse to any site first so the cookie DB is created.'
    );
  }

  const { snapshotPath, cleanup } = createFirefoxSnapshot(dbPath);
  try {
    const nativeRows = queryFirefoxSqlWithNodeSqlite(snapshotPath, sql, mapRow);
    if (nativeRows) return nativeRows;
    return queryFirefoxSqlWithSqlite3(snapshotPath, sql, mapRow);
  } catch (error) {
    throw buildFirefoxReadError(dbPath, error, recoveryHint);
  } finally {
    cleanup();
  }
}

function queryFirefoxCookies(
  dbPath: string,
  host: string,
  names: string[],
): { name: string; value: string }[] {
  const safeHost = host.replace(/'/g, "''");
  const nameList = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
  const sql = `SELECT name, value FROM moz_cookies WHERE host LIKE '%${safeHost}' AND name IN (${nameList});`;
  return queryFirefoxSqlRows(
    dbPath,
    sql,
    (row) => ({
      name: String(row.name ?? ''),
      value: String(row.value ?? ''),
    }),
  );
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
      '  2. Log into x.com\n' +
      '  3. Retry: ft sync --browser firefox\n\n' +
      `Checked profile: ${dir}`
    );
  }

  if (!authToken) {
    throw new Error(
      'No auth_token cookie found for x.com in Firefox.\n' +
      'This means Firefox has a partial/expired X session.\n\n' +
      'Fix:\n' +
      '  1. Open Firefox\n' +
      '  2. Log out of x.com and log back in\n' +
      '  3. Retry: ft sync --browser firefox\n\n' +
      `Checked profile: ${dir}`
    );
  }

  return {
    cookieHeader: `ct0=${ct0}; auth_token=${authToken}`,
    csrfToken: ct0,
  };
}
