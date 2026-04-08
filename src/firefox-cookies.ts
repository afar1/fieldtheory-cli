import { existsSync, readFileSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir, platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { ChromeCookieResult } from './chrome-cookies.js';
import { openDb } from './db.js';

function firefoxBaseDir(): string {
  const os = platform();
  const home = homedir();
  if (os === 'darwin') return join(home, 'Library', 'Application Support', 'Firefox');
  if (os === 'linux') return join(home, '.mozilla', 'firefox');
  if (os === 'win32') return join(home, 'AppData', 'Roaming', 'Mozilla', 'Firefox');
  throw new Error(`Firefox cookie extraction is not supported on ${os}.`);
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

  const safeHost = host.replace(/'/g, "''");
  const nameList = names.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
  const sql = `SELECT name, value FROM moz_cookies WHERE host LIKE '%${safeHost}' AND name IN (${nameList});`;

  const tryQuery = async (path: string): Promise<{ name: string; value: string }[]> => {
    const db = await openDb(path);
    try {
      const result = db.exec(sql);
      if (result.length === 0) return [];
      const [table] = result;
      return table.values.map(([name, value]) => ({
        name: String(name ?? ''),
        value: String(value ?? ''),
      }));
    } finally {
      db.close();
    }
  };

  try {
    return await tryQuery(dbPath);
  } catch {
    const tmpDb = join(tmpdir(), `ft-ff-cookies-${randomUUID()}.db`);
    try {
      copyFileSync(dbPath, tmpDb);
      return await tryQuery(tmpDb);
    } catch (e2: any) {
      throw new Error(
        `Could not read Firefox cookies database.\n` +
        `Path: ${dbPath}\n` +
        `Error: ${e2.message}\n` +
        'If Firefox is open, try closing it and retrying.'
      );
    } finally {
      try { unlinkSync(tmpDb); } catch {}
    }
  }
}

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
