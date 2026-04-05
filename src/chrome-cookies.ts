import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { pbkdf2Sync, createDecipheriv, randomUUID } from 'node:crypto';

export interface ChromeCookieResult {
  csrfToken: string;
  cookieHeader: string;
}

// ── macOS ────────────────────────────────────────────────────────────────────

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

// ── Linux ────────────────────────────────────────────────────────────────────

function getLinuxChromeKey(): Buffer {
  // Chrome on Linux uses a hardcoded password when no Secret Service is available.
  // If gnome-keyring / KWallet is running, the password stored there is used instead.
  // We try the Secret Service first (via `secret-tool`), then fall back to the
  // well-known default password "peanuts".
  const secretToolCandidates = [
    ['xdg-open', '--version'], // sanity-check that we're on Linux
  ];
  void secretToolCandidates;

  const secretAttributes = [
    ['xdg-schema', 'chrome_libsecret_os_crypt_password_v2', 'application', 'chrome'],
    ['xdg-schema', 'chrome_libsecret_os_crypt_password_v2', 'application', 'chromium'],
  ];

  for (const [schema, app] of secretAttributes.map(a => [a[1], a[3]])) {
    try {
      const result = spawnSync(
        'secret-tool',
        ['lookup', 'xdg-schema', schema, 'application', app],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 3000 }
      );
      const password = typeof result.stdout === 'string' ? result.stdout.trim() : '';
      if (password) {
        return pbkdf2Sync(password, 'saltysalt', 1, 16, 'sha1');
      }
    } catch {
      // secret-tool not available — use default
    }
  }

  // Default Chrome Linux password
  return pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');
}

// ── Windows ──────────────────────────────────────────────────────────────────

/**
 * On Windows, Chrome encrypts cookies with DPAPI (CryptUnprotectData).
 * Since Chrome 80+ the key is stored in Local State as a base64-encoded
 * DPAPI blob, prefixed with "DPAPI". We decrypt it once, then use it to
 * decrypt individual cookies (AES-256-GCM, "v10" prefix).
 *
 * We call a small PowerShell snippet to invoke DPAPI from Node — no native
 * add-on required.
 */
function getWindowsChromeKey(chromeUserDataDir: string): Buffer {
  const localStatePath = join(chromeUserDataDir, 'Local State');
  if (!existsSync(localStatePath)) {
    throw new Error(
      `Chrome "Local State" not found at: ${localStatePath}\n` +
      'Make sure Google Chrome is installed and has been opened at least once.\n' +
      'Or pass --csrf-token and --cookie-header to skip Chrome extraction.'
    );
  }

  let localState: any;
  try {
    localState = JSON.parse(readFileSync(localStatePath, 'utf8'));
  } catch {
    throw new Error(`Could not read Chrome Local State at: ${localStatePath}`);
  }

  const encryptedKeyB64: string | undefined = localState?.os_crypt?.encrypted_key;
  if (!encryptedKeyB64) {
    throw new Error(
      'Could not find os_crypt.encrypted_key in Chrome Local State.\n' +
      'This is unexpected. Pass --csrf-token and --cookie-header instead.'
    );
  }

  // The key is base64-encoded, with a "DPAPI" prefix that must be stripped.
  const encryptedKeyWithPrefix = Buffer.from(encryptedKeyB64, 'base64');
  if (encryptedKeyWithPrefix.subarray(0, 5).toString('ascii') !== 'DPAPI') {
    throw new Error('Chrome encryption key does not have expected DPAPI prefix.');
  }
  const encryptedKey = encryptedKeyWithPrefix.subarray(5);

  // Call PowerShell to run DPAPI decryption (no native module needed).
  const script = `
    $bytes = [System.Convert]::FromBase64String('${encryptedKey.toString('base64')}')
    $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [System.Console]::WriteLine([System.Convert]::ToBase64String($decrypted))
  `;

  let result: ReturnType<typeof spawnSync>;
  try {
    result = spawnSync(
      'powershell',
      ['-NonInteractive', '-NoProfile', '-Command', script],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }
    );
  } catch (e: any) {
    throw new Error(`PowerShell DPAPI call failed: ${e.message}`);
  }

  const dpapiOut = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  const dpapiErr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
  if (result.status !== 0 || !dpapiOut) {
    throw new Error(
      'Could not decrypt Chrome encryption key via DPAPI.\n' +
      (dpapiErr ? dpapiErr + '\n' : '') +
      'Try running as the same Windows user that owns the Chrome profile.\n' +
      'Or pass --csrf-token and --cookie-header to skip Chrome extraction.'
    );
  }

  return Buffer.from(dpapiOut, 'base64');
}

function decryptWindowsCookieValue(encryptedValue: Buffer, key: Buffer): string {
  // Chrome 80+ on Windows: "v10" prefix + 12-byte nonce + ciphertext + 16-byte tag
  if (encryptedValue.length > 3 && encryptedValue.subarray(0, 3).toString('ascii') === 'v10') {
    const nonce = encryptedValue.subarray(3, 15);
    const ciphertextAndTag = encryptedValue.subarray(15);
    const tag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);
    const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);

    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  }

  // Older DPAPI-wrapped values (no v10 prefix) — fall back to PowerShell DPAPI
  const script = `
    $bytes = [System.Convert]::FromBase64String('${encryptedValue.toString('base64')}')
    $decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    [System.Console]::WriteLine([System.Text.Encoding]::UTF8.GetString($decrypted))
  `;
  try {
    const result = spawnSync(
      'powershell',
      ['-NonInteractive', '-NoProfile', '-Command', script],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }
    );
    const out = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    if (result.status === 0 && out) {
      return out;
    }
  } catch {
    // fall through
  }

  return encryptedValue.toString('utf8');
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function sanitizeCookieValue(name: string, value: string): string {
  const cleaned = value.replace(/\0+$/g, '').trim();
  if (!cleaned) {
    throw new Error(
      `Cookie ${name} was empty after decryption.\n\n` +
      'This usually happens when Chrome is open. Try:\n' +
      '  1. Close Chrome completely and run ft sync again\n' +
      '  2. If that doesn\'t work, try a different profile:\n' +
      '     ft sync --chrome-profile-directory "Profile 1"\n' +
      '  3. Or pass cookies manually:\n' +
      '     ft sync --csrf-token <ct0> --cookie-header "ct0=...; auth_token=..."\n' +
      '  4. Or use the API method instead:\n' +
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
      '  3. Pass cookies manually (from Chrome DevTools → Application → Cookies):\n' +
      '     ft sync --csrf-token <ct0> --cookie-header "ct0=...; auth_token=..."\n' +
      '  4. Or use the API method instead:\n' +
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
      'If you use a non-default Chrome profile, pass --chrome-profile-directory <name>.\n' +
      'Or pass cookies manually: ft sync --csrf-token <ct0> --cookie-header "ct0=...; auth_token=..."'
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
        'Fix: If Chrome is open, close it and retry. The database may be locked.\n' +
        'Or pass cookies manually: ft sync --csrf-token <ct0> --cookie-header "ct0=...; auth_token=..."'
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

// ── Windows: use Network subkey path ─────────────────────────────────────────

function getWindowsCookieDbPath(chromeUserDataDir: string, profileDirectory: string): string {
  // Chrome 130+ on Windows stores cookies at:
  //   <profile>/Network/Cookies
  // Earlier versions:
  //   <profile>/Cookies
  const networkPath = join(chromeUserDataDir, profileDirectory, 'Network', 'Cookies');
  if (existsSync(networkPath)) return networkPath;
  return join(chromeUserDataDir, profileDirectory, 'Cookies');
}

// ── Main export ──────────────────────────────────────────────────────────────

export function extractChromeXCookies(
  chromeUserDataDir: string,
  profileDirectory = 'Default'
): ChromeCookieResult {
  const os = platform();

  const dbPath = os === 'win32'
    ? getWindowsCookieDbPath(chromeUserDataDir, profileDirectory)
    : join(chromeUserDataDir, profileDirectory, 'Cookies');

  // Get the decryption key for this platform
  let platformKey: Buffer | null = null;
  let isWindows = false;

  if (os === 'darwin') {
    platformKey = getMacOSChromeKey();
  } else if (os === 'linux') {
    platformKey = getLinuxChromeKey();
  } else if (os === 'win32') {
    platformKey = getWindowsChromeKey(chromeUserDataDir);
    isWindows = true;
  } else {
    throw new Error(
      `Automatic cookie extraction is not supported on platform: ${os}\n` +
      'Pass --csrf-token and --cookie-header directly:\n' +
      '  ft sync --csrf-token <ct0> --cookie-header "ct0=...; auth_token=..."\n\n' +
      'To get these values: open Chrome DevTools on x.com,\n' +
      'go to Application → Cookies → https://x.com\n' +
      'and copy the ct0 and auth_token cookie values.'
    );
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
      if (isWindows) {
        decrypted.set(cookie.name, decryptWindowsCookieValue(buf, platformKey!));
      } else {
        decrypted.set(cookie.name, decryptCookieValue(buf, platformKey!, result.dbVersion));
      }
    } else if (cookie.value) {
      decrypted.set(cookie.name, cookie.value);
    }
  }

  const ct0 = decrypted.get('ct0');
  const authToken = decrypted.get('auth_token');

  if (!ct0) {
    const manualInstructions =
      '\nAlternatively, pass cookies manually:\n' +
      '  1. Open Chrome DevTools on x.com (F12 or right-click → Inspect)\n' +
      '  2. Go to Application → Cookies → https://x.com\n' +
      '  3. Copy the values of ct0 and auth_token\n' +
      '  4. Run: ft sync --csrf-token <ct0> --cookie-header "ct0=<ct0>; auth_token=<auth_token>"';

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
          'pass --chrome-profile-directory <name> (e.g., "Profile 1").\n') +
      manualInstructions
    );
  }

  const cookieParts = [`ct0=${sanitizeCookieValue('ct0', ct0)}`];
  if (authToken) cookieParts.push(`auth_token=${sanitizeCookieValue('auth_token', authToken)}`);
  const cookieHeader = cookieParts.join('; ');

  return { csrfToken: sanitizeCookieValue('ct0', ct0), cookieHeader };
}
