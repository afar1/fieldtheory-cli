import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { pbkdf2Sync, createDecipheriv, randomUUID } from 'node:crypto';

export interface ChromeCookieResult {
  csrfToken: string;
  cookieHeader: string;
}

function getMacOSChromeKey(userDataDir?: string): Buffer {
  // Helium (net.imput.helium) is a Chromium fork that stores its v10 cookie
  // password under a non-"Safe Storage" keychain entry. Detect it from the
  // user-data dir so we only try its entry when the caller is actually
  // pointing at a Helium profile — otherwise a stray Helium install would
  // shadow the real Chrome key.
  const isHeliumDir = !!userDataDir && /net\.imput\.helium/i.test(userDataDir);

  // When the caller is explicitly pointing at a Helium profile, only try
  // Helium's keychain entry. Falling through to Chrome's "Safe Storage" key
  // would silently return the wrong key on machines where both browsers are
  // installed, producing a "bad decrypt" error.
  const candidates = isHeliumDir
    ? [{ service: 'Helium Storage Key', account: 'Helium' }]
    : [
        { service: 'Chrome Safe Storage', account: 'Chrome' },
        { service: 'Chrome Safe Storage', account: 'Google Chrome' },
        { service: 'Google Chrome Safe Storage', account: 'Chrome' },
        { service: 'Google Chrome Safe Storage', account: 'Google Chrome' },
        { service: 'Chromium Safe Storage', account: 'Chromium' },
        { service: 'Brave Safe Storage', account: 'Brave' },
        { service: 'Brave Browser Safe Storage', account: 'Brave Browser' },
      ];

  for (const candidate of candidates) {
    try {
      const password = execFileSync(
        'security',
        ['find-generic-password', '-w', '-s', candidate.service, '-a', candidate.account],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      if (password) {
        return pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
      }
    } catch {
      // Try the next known browser/keychain naming pair.
    }
  }

  throw new Error(
    'Could not read a browser Safe Storage password from the macOS Keychain.\n' +
    'This is needed to decrypt Chrome-family cookies.\n' +
    'Fix: open the browser profile that is logged into X, then retry.\n' +
    'If you already use the API flow, prefer: ft sync --api'
  );
}

function sanitizeCookieValue(name: string, value: string): string {
  const cleaned = value.replace(/\0+$/g, '').trim();
  if (!cleaned) {
    throw new Error(
      `Cookie ${name} was empty after decryption.\n\n` +
      'This usually happens when Chrome is open. Try:\n' +
      '  1. Close Chrome completely and run ft sync again\n' +
      '  2. If that doesn\'t work, try a different profile:\n' +
      '     ft sync --chrome-profile-directory "Profile 1"\n' +
      '  3. Or use the API method instead:\n' +
      '     ft auth && ft sync --api'
    );
  }
  if (!/^[\x21-\x7E]+$/.test(cleaned)) {
    throw new Error(
      `Could not decrypt the ${name} cookie.\n\n` +
      'This usually happens when Chrome is open or the wrong profile is selected.\n\n' +
      'Try:\n' +
      '  1. Close Chrome completely and run ft sync again\n' +
      '  2. Try a different profile:\n' +
      '     ft sync --chrome-profile-directory "Profile 1"\n' +
      '  3. Or use the API method instead:\n' +
      '     ft auth && ft sync --api'
    );
  }
  return cleaned;
}

export function decryptCookieValue(encryptedValue: Buffer, key: Buffer, dbVersion = 0): string {
  if (encryptedValue.length === 0) return '';

  if (encryptedValue[0] === 0x76 && encryptedValue[1] === 0x31 && encryptedValue[2] === 0x30) {
    const iv = Buffer.alloc(16, 0x20); // 16 spaces
    const ciphertext = encryptedValue.subarray(3);
    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    // Chrome DB version >= 24 (Chrome ~130+) prepends SHA256(host_key) to plaintext
    if (dbVersion >= 24 && decrypted.length > 32) {
      decrypted = decrypted.subarray(32);
    }

    return decrypted.toString('utf8');
  }

  return encryptedValue.toString('utf8');
}

interface RawCookie {
  name: string;
  host_key: string;
  encrypted_value_hex: string;
  value: string;
}

function queryDbVersion(dbPath: string): number {
  const tryQuery = (p: string) =>
    execFileSync('sqlite3', [p, "SELECT value FROM meta WHERE key='version';"], {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000,
    }).trim();

  try {
    return parseInt(tryQuery(dbPath), 10) || 0;
  } catch {
    // DB may be locked by Chrome — try a copy
    const tmpDb = join(tmpdir(), `ft-meta-${randomUUID()}.db`);
    try {
      copyFileSync(dbPath, tmpDb);
      return parseInt(tryQuery(tmpDb), 10) || 0;
    } catch {
      return 0;
    } finally {
      try { unlinkSync(tmpDb); } catch {}
    }
  }
}

function queryCookies(dbPath: string, domain: string, names: string[]): { cookies: RawCookie[]; dbVersion: number } {
  if (!existsSync(dbPath)) {
    throw new Error(
      `Chrome Cookies database not found at: ${dbPath}\n` +
      'Fix: Make sure Google Chrome is installed and has been opened at least once.\n' +
      'If you use a non-default Chrome profile, pass --chrome-profile-directory <name>.'
    );
  }

  const safeDomain = domain.replace(/'/g, "''");
  const nameList = names.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
  const sql = `SELECT name, host_key, hex(encrypted_value) as encrypted_value_hex, value FROM cookies WHERE host_key LIKE '%${safeDomain}' AND name IN (${nameList});`;

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
    const tmpDb = join(tmpdir(), `ft-cookies-${randomUUID()}.db`);
    try {
      copyFileSync(dbPath, tmpDb);
      output = tryQuery(tmpDb);
    } catch (e2: any) {
      throw new Error(
        `Could not read Chrome Cookies database.\n` +
        `Path: ${dbPath}\n` +
        `Error: ${e2.message}\n` +
        'Fix: If Chrome is open, close it and retry. The database may be locked.'
      );
    } finally {
      try { unlinkSync(tmpDb); } catch {}
    }
  }

  const dbVersion = queryDbVersion(dbPath);

  if (!output || output === '[]') return { cookies: [], dbVersion };
  try {
    return { cookies: JSON.parse(output), dbVersion };
  } catch {
    return { cookies: [], dbVersion };
  }
}

export function extractChromeXCookies(
  chromeUserDataDir: string,
  profileDirectory = 'Default'
): ChromeCookieResult {
  const os = platform();
  if (os !== 'darwin') {
    throw new Error(
      `Direct cookie extraction is currently supported on macOS only.\n` +
      `Detected platform: ${os}\n` +
      'Fix: Pass --csrf-token and --cookie-header directly, or contribute Linux/Windows support.'
    );
  }

  const dbPath = join(chromeUserDataDir, profileDirectory, 'Cookies');
  const key = getMacOSChromeKey(chromeUserDataDir);

  let result = queryCookies(dbPath, '.x.com', ['ct0', 'auth_token']);
  if (result.cookies.length === 0) {
    result = queryCookies(dbPath, '.twitter.com', ['ct0', 'auth_token']);
  }

  const decrypted = new Map<string, string>();
  for (const cookie of result.cookies) {
    const hexVal = cookie.encrypted_value_hex;
    if (hexVal && hexVal.length > 0) {
      const buf = Buffer.from(hexVal, 'hex');
      decrypted.set(cookie.name, decryptCookieValue(buf, key, result.dbVersion));
    } else if (cookie.value) {
      decrypted.set(cookie.name, cookie.value);
    }
  }

  const ct0 = decrypted.get('ct0');
  const authToken = decrypted.get('auth_token');

  if (!ct0) {
    throw new Error(
      'No ct0 CSRF cookie found for x.com in Chrome.\n' +
      'This means you are not logged into X in Chrome.\n\n' +
      'Fix:\n' +
      '  1. Open Google Chrome\n' +
      '  2. Go to https://x.com and log in\n' +
      '  3. Re-run this command\n\n' +
      (profileDirectory !== 'Default'
        ? `Using Chrome profile: "${profileDirectory}"\n`
        : 'Using the Default Chrome profile. If your X login is in a different profile,\n' +
          'pass --chrome-profile-directory <name> (e.g., "Profile 1").\n')
    );
  }

  const cookieParts = [`ct0=${sanitizeCookieValue('ct0', ct0)}`];
  if (authToken) cookieParts.push(`auth_token=${sanitizeCookieValue('auth_token', authToken)}`);
  const cookieHeader = cookieParts.join('; ');

  return { csrfToken: sanitizeCookieValue('ct0', ct0), cookieHeader };
}
