import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { dataDir } from './paths.js';

export interface ChromeSessionConfig {
  chromeUserDataDir: string;
  chromeProfileDirectory?: string;
}

export function loadEnv(): void {
  const dir = dataDir();
  const candidatePaths = [
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env'),
    path.join(dir, '.env.local'),
    path.join(dir, '.env'),
  ];

  for (const envPath of candidatePaths) {
    loadDotenv({ path: envPath, quiet: true });
  }
}

// Known browser ids accepted by --browser / FT_BROWSER. Kept intentionally
// small: each entry here must be live-tested against a real install of the
// browser. Chrome is the implicit default if no id is given.
const SUPPORTED_BROWSER_IDS = ['chrome', 'helium'] as const;
type SupportedBrowserId = typeof SUPPORTED_BROWSER_IDS[number];

function normalizeBrowserId(raw: string): SupportedBrowserId {
  const normalized = raw.trim().toLowerCase();
  if ((SUPPORTED_BROWSER_IDS as readonly string[]).includes(normalized)) {
    return normalized as SupportedBrowserId;
  }
  throw new Error(
    `Unknown browser: "${raw}".\n` +
    `Supported browsers: ${SUPPORTED_BROWSER_IDS.join(', ')}.\n` +
    `Set via --browser <name> or the FT_BROWSER env var.`
  );
}

function chromeUserDataDir(): string | undefined {
  const platform = os.platform();
  const home = os.homedir();
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
  if (platform === 'linux')  return path.join(home, '.config', 'google-chrome');
  if (platform === 'win32')  return path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  return undefined;
}

function heliumUserDataDir(): string | undefined {
  if (os.platform() !== 'darwin') return undefined;
  return path.join(os.homedir(), 'Library', 'Application Support', 'net.imput.helium');
}

function detectChromeUserDataDir(browserId?: string): string | undefined {
  // Explicit browser override: always honor the request, even if the chosen
  // browser isn't installed. Returning a "fallback" browser's path would
  // silently contradict the user's intent and, worse, pair a profile path
  // with the wrong keychain entry on dual-install machines.
  if (browserId) {
    const id = normalizeBrowserId(browserId);
    if (id === 'chrome')  return chromeUserDataDir();
    if (id === 'helium')  return heliumUserDataDir();
  }

  // No explicit browser: pick the first installed browser we know about on
  // macOS, else fall back to Chrome's canonical path (so the error messages
  // downstream stay stable).
  if (os.platform() === 'darwin') {
    const chrome = chromeUserDataDir();
    if (chrome && existsSync(chrome)) return chrome;
    const helium = heliumUserDataDir();
    if (helium && existsSync(helium)) return helium;
    return chrome;
  }
  return chromeUserDataDir();
}

export function loadChromeSessionConfig(overrides: { browserId?: string } = {}): ChromeSessionConfig {
  loadEnv();

  // Precedence: an explicit CLI --browser wins over everything else (including
  // FT_CHROME_USER_DATA_DIR in a stale .env). Otherwise we consult
  // FT_CHROME_USER_DATA_DIR, then FT_BROWSER, then autodetect.
  let dir: string | undefined;
  if (overrides.browserId) {
    dir = detectChromeUserDataDir(overrides.browserId);
  } else if (process.env.FT_CHROME_USER_DATA_DIR) {
    dir = process.env.FT_CHROME_USER_DATA_DIR;
  } else {
    dir = detectChromeUserDataDir(process.env.FT_BROWSER);
  }

  if (!dir) {
    throw new Error(
      'Could not detect a browser user-data directory.\n' +
      'Set FT_CHROME_USER_DATA_DIR in .env or pass --chrome-user-data-dir (or --browser helium).'
    );
  }
  return {
    chromeUserDataDir: dir,
    chromeProfileDirectory: process.env.FT_CHROME_PROFILE_DIRECTORY ?? 'Default',
  };
}

export function loadXApiConfig() {
  loadEnv();

  const apiKey = process.env.X_API_KEY ?? process.env.X_CONSUMER_KEY;
  const apiSecret = process.env.X_API_SECRET ?? process.env.X_SECRET_KEY;
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const bearerToken = process.env.X_BEARER_TOKEN;
  const callbackUrl = process.env.X_CALLBACK_URL ?? 'http://127.0.0.1:3000/callback';

  if (!apiKey || !apiSecret || !clientId || !clientSecret) {
    throw new Error(
      'Missing X API credentials for API sync.\n' +
      'Set X_API_KEY, X_API_SECRET, X_CLIENT_ID, and X_CLIENT_SECRET in .env.\n' +
      'These are only needed for --api mode. Default sync uses your Chrome session.'
    );
  }

  return { apiKey, apiSecret, clientId, clientSecret, bearerToken, callbackUrl };
}
