import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, unlinkSync, copyFileSync, readFileSync } from 'node:fs';
import { join, win32 as winPath } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { pbkdf2Sync, createDecipheriv, randomUUID } from 'node:crypto';
import type { BrowserDef } from './browsers.js';
import { getKeychainEntries } from './browsers.js';

export interface ChromeCookieResult {
  csrfToken: string;
  cookieHeader: string;
}

// ── macOS Keychain ───────────────────────────────────────────────────────────

function getMacOSKey(browser: BrowserDef): Buffer {
  const candidates = getKeychainEntries(browser);

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
      // Try the next candidate.
    }
  }

  throw new Error(
    `Could not read ${browser.displayName} Safe Storage password from macOS Keychain.\n` +
    'Fix: open the browser profile logged into X, then retry.\n' +
    'Or pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
  );
}

// ── Linux Secret Service ─────────────────────────────────────────────────────

interface LinuxKeys {
  v10: Buffer;
  v11: Buffer | null;
}

function getLinuxKeys(browser: BrowserDef): LinuxKeys {
  const v10 = pbkdf2Sync('peanuts', 'saltysalt', 1, 16, 'sha1');

  // Map browser ids to the Secret Service application names Chrome uses.
  const appNames: Record<string, string[]> = {
    chrome: ['chrome'],
    chromium: ['chromium'],
    brave: ['brave'],
    helium: ['chrome'], // Helium typically uses Chrome's keyring entry
    comet: ['chrome'],
  };
  const apps = appNames[browser.id] ?? ['chrome'];

  for (const app of apps) {
    try {
      const pw = execFileSync(
        'secret-tool',
        ['lookup', 'application', app],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }
      ).trim();
      if (pw) {
        return { v10, v11: pbkdf2Sync(pw, 'saltysalt', 1, 16, 'sha1') };
      }
    } catch {
      // secret-tool not available or no entry — try next
    }
  }

  return { v10, v11: null };
}

// ── Windows DPAPI ────────────────────────────────────────────────────────────

type WindowsDpapiOutputMode = 'base64' | 'utf8';

const WINDOWS_DPAPI_RUNTIME_HINT =
  'DPAPI types are unavailable in this PowerShell runtime. Prefer Windows PowerShell (powershell.exe).';

export function windowsPowerShellCandidates(
  env: NodeJS.ProcessEnv = process.env,
  pathExists: (path: string) => boolean = existsSync,
): string[] {
  const systemRoot = env.SystemRoot || env.WINDIR;
  if (!systemRoot || !winPath.isAbsolute(systemRoot)) {
    return [];
  }

  const candidates = [
    winPath.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    winPath.join(systemRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ];

  return [...new Set(candidates.filter(candidate => pathExists(candidate)))];
}

export function buildWindowsDpapiScript(outputMode: WindowsDpapiOutputMode): string {
  const outputLine = outputMode === 'base64'
    ? '    [System.Console]::WriteLine([System.Convert]::ToBase64String($dec))'
    : '    [System.Console]::WriteLine([System.Text.Encoding]::UTF8.GetString($dec))';

  return [
    "$ErrorActionPreference = 'Stop'",
    "$assemblies = @('System.Security.Cryptography.ProtectedData', 'System.Security')",
    '$dpapiReady = $false',
    'foreach ($assembly in $assemblies) {',
    '  try { Add-Type -AssemblyName $assembly -ErrorAction Stop | Out-Null } catch {}',
    '  try {',
    '    [void][System.Security.Cryptography.ProtectedData]',
    '    [void][System.Security.Cryptography.DataProtectionScope]',
    '    $dpapiReady = $true',
    '    break',
    '  } catch {}',
    '}',
    'if (-not $dpapiReady) {',
    `  throw '${WINDOWS_DPAPI_RUNTIME_HINT}'`,
    '}',
    '$input | ForEach-Object {',
    '  $line = "$_".Trim()',
    '  if ($line) {',
    '    $bytes = [System.Convert]::FromBase64String($line)',
    '    $dec = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
    outputLine,
    '  }',
    '}',
  ].join('\n');
}

interface WindowsDpapiOptions {
  env?: NodeJS.ProcessEnv;
  failureLabel: string;
  pathExists?: (path: string) => boolean;
  spawn?: typeof spawnSync;
  timeoutMs: number;
}

export function runWindowsDpapi(
  encryptedValue: Buffer,
  outputMode: WindowsDpapiOutputMode,
  options: WindowsDpapiOptions,
): string {
  const spawn = options.spawn ?? spawnSync;
  const script = buildWindowsDpapiScript(outputMode);
  const commands = windowsPowerShellCandidates(options.env, options.pathExists);
  let sawRuntime = false;
  let lastProblem = '';

  for (const command of commands) {
    const result = spawn(
      command,
      ['-NonInteractive', '-NoProfile', '-Command', script],
      {
        input: encryptedValue.toString('base64'),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: options.timeoutMs,
        windowsHide: true,
      }
    );

    const out = typeof result.stdout === 'string' ? result.stdout.trim() : '';
    const err = typeof result.stderr === 'string' ? result.stderr.trim() : '';

    if (result.error) {
      const error = result.error as NodeJS.ErrnoException;
      if (error.code === 'ENOENT') continue;
      sawRuntime = true;
      lastProblem = `${command}: ${error.message}`;
      continue;
    }

    sawRuntime = true;
    if (result.status === 0 && out) return out;

    const detail = err || `Process exited with status ${result.status ?? 'unknown'}.`;
    if (!lastProblem || detail.includes(WINDOWS_DPAPI_RUNTIME_HINT)) {
      lastProblem = `${command}: ${detail}`;
    }
  }

  if (!sawRuntime) {
    throw new Error(
      `${options.failureLabel}\n` +
      'Could not find a trusted Windows PowerShell binary for DPAPI decryption.\n' +
      'Expected Windows PowerShell under %SystemRoot%\\System32 or %SystemRoot%\\Sysnative.\n' +
      'Or pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
    );
  }

  throw new Error(
    `${options.failureLabel}\n` +
    (lastProblem ? `${lastProblem}\n` : '') +
    'Try running as the same Windows user that owns the browser profile.\n' +
    'Or pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
  );
}

function getWindowsKey(chromeUserDataDir: string, browser: BrowserDef): Buffer {
  const localStatePath = join(chromeUserDataDir, 'Local State');
  if (!existsSync(localStatePath)) {
    throw new Error(
      `${browser.displayName} "Local State" not found at: ${localStatePath}\n` +
      'Make sure the browser is installed and has been opened at least once.\n' +
      'Or pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
    );
  }

  let localState: any;
  try {
    localState = JSON.parse(readFileSync(localStatePath, 'utf8'));
  } catch {
    throw new Error(`Could not read Local State at: ${localStatePath}`);
  }

  const encryptedKeyB64: string | undefined = localState?.os_crypt?.encrypted_key;
  if (!encryptedKeyB64) {
    throw new Error(
      'Could not find os_crypt.encrypted_key in Local State.\n' +
      'Pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
    );
  }

  const encryptedKeyWithPrefix = Buffer.from(encryptedKeyB64, 'base64');
  if (encryptedKeyWithPrefix.subarray(0, 5).toString('ascii') !== 'DPAPI') {
    throw new Error('Encryption key does not have expected DPAPI prefix.');
  }
  const encryptedKey = encryptedKeyWithPrefix.subarray(5);

  const out = runWindowsDpapi(encryptedKey, 'base64', {
    failureLabel: 'Could not decrypt encryption key via DPAPI.',
    timeoutMs: 10000,
  });

  return Buffer.from(out, 'base64');
}

function decryptWindowsCookie(encryptedValue: Buffer, key: Buffer): string {
  // Chrome 80+ on Windows: "v10" prefix + 12-byte nonce + ciphertext + 16-byte GCM tag
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

  // Older DPAPI-only cookies — pipe via stdin to PowerShell
  try {
    const out = runWindowsDpapi(encryptedValue, 'utf8', {
      failureLabel: 'Could not decrypt Windows cookie via DPAPI.',
      timeoutMs: 5000,
    });
    if (out) return out;
  } catch {
    // Fall back to raw UTF-8 to preserve older best-effort behavior.
  }

  return encryptedValue.toString('utf8');
}

// ── Cookie decryption (macOS / Linux) ────────────────────────────────────────

function sanitizeCookieValue(name: string, value: string, browser: BrowserDef): string {
  const cleaned = value.replace(/\0+$/g, '').trim();
  if (!cleaned) {
    throw new Error(
      `Cookie ${name} was empty after decryption.\n\n` +
      'This usually happens when the browser is open. Try:\n' +
      `  1. Close ${browser.displayName} completely and run ft sync again\n` +
      '  2. Try a different profile:\n' +
      '     ft sync --chrome-profile-directory "Profile 1"\n' +
      '  3. Or pass cookies manually:\n' +
      '     ft sync --cookies <ct0> <auth_token>'
    );
  }
  if (!/^[\x21-\x7E]+$/.test(cleaned)) {
    throw new Error(
      `Could not decrypt the ${name} cookie.\n\n` +
      'This usually happens when the browser is open or the wrong profile is selected.\n\n' +
      'Try:\n' +
      `  1. Close ${browser.displayName} completely and run ft sync again\n` +
      '  2. Try a different profile:\n' +
      '     ft sync --chrome-profile-directory "Profile 1"\n' +
      '  3. Or pass cookies manually:\n' +
      '     ft sync --cookies <ct0> <auth_token>'
    );
  }
  return cleaned;
}

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
      throw new Error(
        'This cookie uses a GNOME keyring key (v11), but the keyring\n' +
        'password could not be retrieved.\n\n' +
        'Fix:\n' +
        '  1. Install libsecret-tools:  sudo apt-get install libsecret-tools\n' +
        '  2. Check the entry exists:   secret-tool lookup application chrome\n' +
        '  3. Or pass cookies manually: ft sync --cookies <ct0> <auth_token>'
      );
    }

    const decryptKey = isV11 && v11Key ? v11Key : key;
    const iv = Buffer.alloc(16, 0x20); // 16 spaces
    const ciphertext = encryptedValue.subarray(3);
    const decipher = createDecipheriv('aes-128-cbc', decryptKey, iv);
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

// ── SQLite cookie query ──────────────────────────────────────────────────────

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

function resolveCookieDbPath(chromeUserDataDir: string, profileDirectory: string): string {
  // Chrome 96+ / Chrome 130+ moved cookies to <profile>/Network/Cookies
  const networkPath = join(chromeUserDataDir, profileDirectory, 'Network', 'Cookies');
  if (existsSync(networkPath)) return networkPath;
  return join(chromeUserDataDir, profileDirectory, 'Cookies');
}

function queryCookies(dbPath: string, domain: string, names: string[], browser: BrowserDef): { cookies: RawCookie[]; dbVersion: number } {
  if (!existsSync(dbPath)) {
    throw new Error(
      `${browser.displayName} Cookies database not found at: ${dbPath}\n` +
      'Fix: Make sure the browser is installed and has been opened at least once.\n' +
      'If you use a non-default profile, pass --chrome-profile-directory <name>.\n' +
      'Or pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
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
        `Could not read ${browser.displayName} Cookies database.\n` +
        `Path: ${dbPath}\n` +
        `Error: ${e2.message}\n` +
        `Fix: If ${browser.displayName} is open, close it and retry.\n` +
        'Or pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
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

// ── Main export ──────────────────────────────────────────────────────────────

export function extractChromeXCookies(
  chromeUserDataDir: string,
  profileDirectory = 'Default',
  browser: BrowserDef | undefined = undefined
): ChromeCookieResult {
  const os = platform();

  // Default browser for error messages if none provided
  const br = browser ?? { id: 'chrome', displayName: 'Google Chrome', cookieBackend: 'chromium' as const, keychainEntries: [] };

  const dbPath = resolveCookieDbPath(chromeUserDataDir, profileDirectory);

  let key: Buffer;
  let v11Key: Buffer | null | undefined;
  let isWindows = false;

  if (os === 'darwin') {
    key = getMacOSKey(br);
  } else if (os === 'linux') {
    const linuxKeys = getLinuxKeys(br);
    key = linuxKeys.v10;
    v11Key = linuxKeys.v11;
  } else if (os === 'win32') {
    key = getWindowsKey(chromeUserDataDir, br);
    isWindows = true;
  } else {
    throw new Error(
      `Automatic cookie extraction is not supported on ${os}.\n` +
      'Pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
    );
  }

  let result = queryCookies(dbPath, '.x.com', ['ct0', 'auth_token'], br);
  if (result.cookies.length === 0) {
    result = queryCookies(dbPath, '.twitter.com', ['ct0', 'auth_token'], br);
  }

  const decrypted = new Map<string, string>();
  for (const cookie of result.cookies) {
    const hexVal = cookie.encrypted_value_hex;
    if (hexVal && hexVal.length > 0) {
      const buf = Buffer.from(hexVal, 'hex');
      if (isWindows) {
        decrypted.set(cookie.name, decryptWindowsCookie(buf, key));
      } else {
        decrypted.set(cookie.name, decryptCookieValue(buf, key, result.dbVersion, v11Key));
      }
    } else if (cookie.value) {
      decrypted.set(cookie.name, cookie.value);
    }
  }

  const ct0 = decrypted.get('ct0');
  const authToken = decrypted.get('auth_token');

  if (!ct0) {
    throw new Error(
      `No ct0 CSRF cookie found for x.com in ${br.displayName}.\n` +
      'This means you are not logged into X in this browser.\n\n' +
      'Fix:\n' +
      `  1. Open ${br.displayName}\n` +
      '  2. Go to https://x.com and log in\n' +
      '  3. Re-run this command\n\n' +
      (profileDirectory !== 'Default'
        ? `Using profile: "${profileDirectory}"\n`
        : 'Using the Default profile. If your X login is in a different profile,\n' +
          'pass --chrome-profile-directory <name> (e.g., "Profile 1").\n') +
      '\nOr pass cookies manually:  ft sync --cookies <ct0> <auth_token>'
    );
  }

  const cleanCt0 = sanitizeCookieValue('ct0', ct0, br);
  const cookieParts = [`ct0=${cleanCt0}`];
  if (authToken) cookieParts.push(`auth_token=${sanitizeCookieValue('auth_token', authToken, br)}`);
  const cookieHeader = cookieParts.join('; ');

  return { csrfToken: cleanCt0, cookieHeader };
}
