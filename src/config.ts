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

function detectChromeUserDataDir(browserId?: string): string | undefined {
  const platform = os.platform();
  const home = os.homedir();

  // Explicit browser override: --browser / FT_BROWSER.
  if (browserId) {
    const id = normalizeBrowserId(browserId);
    if (id === 'helium') {
      if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'net.imput.helium');
      return undefined;
    }
    // id === 'chrome' falls through to the default detection below.
  }

  if (platform === 'darwin') {
    const chrome = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
    if (existsSync(chrome)) return chrome;
    // Fall back to Helium if Chrome isn't installed.
    const helium = path.join(home, 'Library', 'Application Support', 'net.imput.helium');
    if (existsSync(helium)) return helium;
    return chrome;
  }
  if (platform === 'linux') return path.join(home, '.config', 'google-chrome');
  if (platform === 'win32') return path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  return undefined;
}

export function loadChromeSessionConfig(overrides: { browserId?: string } = {}): ChromeSessionConfig {
  loadEnv();
  const browserId = overrides.browserId ?? process.env.FT_BROWSER;
  const dir = process.env.FT_CHROME_USER_DATA_DIR ?? detectChromeUserDataDir(browserId);
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
