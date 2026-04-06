import { execFileSync } from 'node:child_process';
import { existsSync, unlinkSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { pbkdf2Sync, createDecipheriv, randomUUID } from 'node:crypto';

export interface ChromeCookieResult {
  csrfToken: string;
  cookieHeader: string;
}

function getMacOSChromeKey(): Buffer {
  const candidates = [
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

/**
 * The two AES keys Chrome may use on Linux, selected per-cookie by prefix:
 *
 *  - `v10` cookies were encrypted with the hard-coded password "peanuts"
 *    (used before keyring integration, or when no keyring is available).
 *  - `v11` cookies were encrypted with a password stored in the GNOME
 *    Secret Service (via `secret-tool lookup application chrome`).
 *
 * Both use PBKDF2-HMAC-SHA1 with salt "saltysalt" and **1 iteration**
 * (vs. 1003 on macOS).  The prefix in each cookie's encrypted_value
 * determines which key to use — they are not interchangeable.
 */
interface LinuxChromeKeys {
  v10Key: Buffer;        // "peanuts" key — for cookies with v10 prefix
  v11Key: Buffer | null; // keyring key  — for cookies with v11 prefix;
                         // null when the keyring password could not be read
}

function getLinuxChromeKeys(): LinuxChromeKeys {
  // v10 always uses the hard-coded "peanuts" password.
  const v10Key = pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');

  // v11 uses the password stored in the GNOME Secret Service.
  // Chrome writes v11 cookies only when the keyring is available, but it
  // accesses the keyring via libsecret directly — not the secret-tool CLI.
  // If secret-tool is absent or returns nothing we set v11Key to null so
  // that any attempt to decrypt a v11 cookie produces a clear error rather
  // than a silent wrong-key AES crash (ERR_OSSL_EVP_BAD_DECRYPT).
  let v11Key: Buffer | null = null;
  try {
    const pw = execFileSync(
      'secret-tool',
      ['lookup', 'application', 'chrome'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }
    ).trim();
    if (pw) v11Key = pbkdf2Sync(pw, 'saltysalt', 1, 16, 'sha1');
  } catch {
    // secret-tool not installed or no keyring entry — v11Key stays null.
  }

  return { v10Key, v11Key };
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

/**
 * Decrypt a single Chrome cookie value.
 *
 * @param encryptedValue  Raw bytes from the `encrypted_value` column.
 * @param key             AES key for `v10`-prefixed cookies.  On macOS this
 *                        is the only key needed.  On Linux pass `v10Key` here.
 * @param dbVersion       Chrome cookie DB schema version (from the `meta`
 *                        table); >= 24 means a 32-byte SHA256(host_key) prefix
 *                        is prepended to the plaintext (Chrome ~130+).
 * @param v11Key          Key for `v11`-prefixed cookies (Linux keyring key).
 *                        Pass `null` when the keyring password could not be
 *                        read — a clear error is thrown rather than attempting
 *                        decryption with the wrong key.  Omit on macOS (only
 *                        `v10` cookies exist there).
 */
export function decryptCookieValue(
  encryptedValue: Buffer,
  key: Buffer,
  dbVersion = 0,
  v11Key?: Buffer | null,
): string {
  if (encryptedValue.length === 0) return '';

  const isV10 = encryptedValue[0] === 0x76 && encryptedValue[1] === 0x31 && encryptedValue[2] === 0x30;
  const isV11 = encryptedValue[0] === 0x76 && encryptedValue[1] === 0x31 && encryptedValue[2] === 0x31;

  if (isV10 || isV11) {
    if (isV11 && v11Key === null) {
      // The cookie was encrypted with the GNOME keyring key, but we couldn't
      // read the keyring password (secret-tool missing or no entry).
      // Throwing here avoids a cryptic ERR_OSSL_EVP_BAD_DECRYPT crash.
      throw new Error(
        'Chrome stored this cookie with a GNOME keyring key (v11), but the\n' +
        'keyring password could not be retrieved.\n\n' +
        'Fix:\n' +
        '  1. Install libsecret-tools:  sudo apt-get install libsecret-tools\n' +
        '  2. Confirm the entry exists: secret-tool lookup application chrome\n' +
        '  3. Or use the API method:    ft auth && ft sync --api'
      );
    }

    // On Linux v10 and v11 use different keys; on macOS only v10 exists and
    // v11Key is undefined, so key is used for both (unchanged behaviour).
    const decryptKey = isV11 && v11Key ? v11Key : key;
    const iv = Buffer.alloc(16, 0x20); // 16 spaces
    const ciphertext = encryptedValue.subarray(3);
    const decipher = createDecipheriv('aes-128-cbc', decryptKey, iv);
    let decrypted: Buffer;
    try {
      decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (err: any) {
      throw new Error(
        `AES decryption failed for a ${isV11 ? 'v11' : 'v10'} cookie.\n` +
        'This usually means the wrong key was used.\n\n' +
        'Fix:\n' +
        '  1. Close Chrome completely and run ft sync again\n' +
        '  2. Confirm the keyring entry: secret-tool lookup application chrome\n' +
        '  3. Or use the API method:     ft auth && ft sync --api\n\n' +
        `OpenSSL detail: ${err.message}`
      );
    }

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
  if (os !== 'darwin' && os !== 'linux') {
    throw new Error(
      `Direct cookie extraction is supported on macOS and Linux only.\n` +
      `Detected platform: ${os}\n` +
      'Fix: Pass --csrf-token and --cookie-header directly, or contribute Windows support.'
    );
  }

  const dbPath = join(chromeUserDataDir, profileDirectory, 'Cookies');

  // On Linux, v10 and v11 cookies use different keys; derive both up front.
  // On macOS only v10 exists, so v11Key is left undefined (decryptCookieValue
  // treats undefined as "same as key", which is correct for macOS).
  let key: Buffer;
  let v11Key: Buffer | null | undefined;
  if (os === 'linux') {
    const linuxKeys = getLinuxChromeKeys();
    key = linuxKeys.v10Key;
    v11Key = linuxKeys.v11Key; // Buffer when keyring found, null when not
  } else {
    key = getMacOSChromeKey();
  }

  let result = queryCookies(dbPath, '.x.com', ['ct0', 'auth_token']);
  if (result.cookies.length === 0) {
    result = queryCookies(dbPath, '.twitter.com', ['ct0', 'auth_token']);
  }

  const decrypted = new Map<string, string>();
  for (const cookie of result.cookies) {
    const hexVal = cookie.encrypted_value_hex;
    if (hexVal && hexVal.length > 0) {
      const buf = Buffer.from(hexVal, 'hex');
      decrypted.set(cookie.name, decryptCookieValue(buf, key, result.dbVersion, v11Key));
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
