import path from 'node:path';
import process from 'node:process';
import { IgApiClient } from 'instagram-private-api';
import { loadEnv, loadChromeSessionConfig } from './config.js';
import { ensureDir, pathExists, readJson, writeJson } from './fs.js';
import { dataDir } from './paths.js';
import { extractChromeNamedCookies } from './chrome-cookies.js';
import { getBrowser } from './browsers.js';

export interface InstagramSavedProbeArgs {
  browser?: string;
  limit: number;
  profile: string;
  sessionPath: string;
}

type SavedMedia = Record<string, any>;

const DEFAULT_SESSION_PATH = path.join(dataDir(), 'instagram-spike', 'session-state.json');

function defaultArgs(): InstagramSavedProbeArgs {
  return {
    browser: undefined,
    limit: 10,
    profile: process.env.FT_CHROME_PROFILE_DIRECTORY ?? 'Default',
    sessionPath: process.env.IG_SESSION_STATE ?? DEFAULT_SESSION_PATH,
  };
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer. Received: ${value}`);
  }
  return parsed;
}

function requireFlagValue(argv: string[], index: number, flag: string): string {
  const raw = argv[index];
  if (!raw || raw.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return raw;
}

export function parseInstagramSavedProbeArgs(argv: string[]): InstagramSavedProbeArgs {
  const args = defaultArgs();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--browser') {
      args.browser = requireFlagValue(argv, ++i, '--browser');
      continue;
    }
    if (token === '--profile') {
      args.profile = requireFlagValue(argv, ++i, '--profile');
      continue;
    }
    if (token === '--limit') {
      const raw = requireFlagValue(argv, ++i, '--limit');
      args.limit = parsePositiveInt(raw, '--limit');
      continue;
    }
    if (token === '--session') {
      const raw = requireFlagValue(argv, ++i, '--session');
      args.sessionPath = path.resolve(raw);
      continue;
    }
    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function printHelp(): void {
  process.stdout.write(
    [
      'Instagram saved-feed probe',
      '',
      'Usage:',
      '  npm run ig:saved-probe -- [--browser comet] [--profile Default] [--limit 10] [--session /path/to/state.json]',
      '',
      'Auth order:',
      '  1. Existing serialized session state file',
      '  2. Chromium browser session cookies, if --browser is provided and the profile is logged into Instagram',
      '  3. IG_USERNAME + IG_PASSWORD from env/.env.local',
      '',
      `Default session path: ${DEFAULT_SESSION_PATH}`,
      '',
    ].join('\n'),
  );
}

async function loadSavedState(ig: IgApiClient, sessionPath: string): Promise<boolean> {
  if (!(await pathExists(sessionPath))) return false;
  const state = await readJson<Record<string, unknown>>(sessionPath);
  await ig.state.deserialize(state);
  return true;
}

async function persistState(ig: IgApiClient, sessionPath: string): Promise<void> {
  await ensureDir(path.dirname(sessionPath));
  await writeJson(sessionPath, await ig.state.serialize());
}

function seedCookie(ig: IgApiClient, cookie: string): void {
  const jar = ig.state.cookieJar as unknown as {
    _jar: {
      setCookieSync(cookie: string, url: string): void;
    };
  };
  jar._jar.setCookieSync(cookie, 'https://i.instagram.com/');
  jar._jar.setCookieSync(cookie, 'https://www.instagram.com/');
}

async function seedFromBrowserSession(ig: IgApiClient, browserId: string, profile: string): Promise<void> {
  const browser = getBrowser(browserId);
  if (browser.cookieBackend !== 'chromium') {
    throw new Error(`Browser session probing only supports Chromium-family browsers in this spike. Received: ${browserId}`);
  }

  const config = loadChromeSessionConfig({ browserId });
  const cookies = extractChromeNamedCookies(
    config.chromeUserDataDir,
    profile,
    '.instagram.com',
    ['sessionid', 'csrftoken', 'ds_user_id', 'mid'],
    browser,
  );

  if (!cookies.sessionid || !cookies.ds_user_id) {
    const present = Object.keys(cookies).sort();
    throw new Error(
      `No logged-in Instagram session found in ${browser.displayName} profile "${profile}".\n` +
      `Needed cookies: sessionid, ds_user_id.\n` +
      `Found: ${present.length ? present.join(', ') : 'none'}`
    );
  }

  ig.state.generateDevice(String(cookies.ds_user_id));
  seedCookie(ig, `sessionid=${cookies.sessionid}; Domain=.instagram.com; Path=/; Secure; HttpOnly`);
  seedCookie(ig, `ds_user_id=${cookies.ds_user_id}; Domain=.instagram.com; Path=/; Secure`);
  if (cookies.csrftoken) seedCookie(ig, `csrftoken=${cookies.csrftoken}; Domain=.instagram.com; Path=/; Secure`);
  if (cookies.mid) seedCookie(ig, `mid=${cookies.mid}; Domain=.instagram.com; Path=/; Secure`);
}

async function loginWithPassword(ig: IgApiClient): Promise<void> {
  const username = process.env.IG_USERNAME;
  const password = process.env.IG_PASSWORD;
  if (!username || !password) {
    throw new Error('Missing IG_USERNAME / IG_PASSWORD for Instagram login.');
  }

  ig.state.generateDevice(username);
  await ig.simulate.preLoginFlow();
  await ig.account.login(username, password);
}

async function fetchSavedItems(ig: IgApiClient, limit: number): Promise<SavedMedia[]> {
  const feed = ig.feed.saved();
  const items: SavedMedia[] = [];

  do {
    const page = await feed.items();
    items.push(...page);
  } while (feed.isMoreAvailable() && items.length < limit);

  return items.slice(0, limit);
}

function summarizeMedia(item: SavedMedia): Record<string, unknown> {
  const captionText = item.caption?.text ?? null;
  const user = item.user?.username ?? item.user?.pk ?? null;
  return {
    id: item.id ?? null,
    code: item.code ?? null,
    user,
    mediaType: item.media_type ?? null,
    takenAt: item.taken_at ?? null,
    caption: typeof captionText === 'string' ? captionText.slice(0, 140) : null,
    hasViewerSaved: item.has_viewer_saved ?? null,
    collectionIds: item.saved_collection_ids ?? null,
  };
}

async function authenticate(ig: IgApiClient, args: InstagramSavedProbeArgs): Promise<'session-state' | 'browser-session' | 'username-password'> {
  if (await loadSavedState(ig, args.sessionPath)) {
    return 'session-state';
  }

  if (args.browser) {
    await seedFromBrowserSession(ig, args.browser, args.profile);
    return 'browser-session';
  }

  await loginWithPassword(ig);
  return 'username-password';
}

async function runProbe(args: InstagramSavedProbeArgs): Promise<void> {
  const ig = new IgApiClient();
  let authMode: 'session-state' | 'browser-session' | 'username-password' | null = null;

  try {
    authMode = await authenticate(ig, args);
    const items = await fetchSavedItems(ig, args.limit);

    if (authMode !== 'browser-session') {
      await persistState(ig, args.sessionPath);
    }

    process.stdout.write(
      `${JSON.stringify({ authMode, count: items.length, items: items.map(summarizeMedia) }, null, 2)}\n`,
    );
  } catch (error) {
    if (authMode === 'session-state' && process.env.IG_USERNAME && process.env.IG_PASSWORD) {
      const fresh = new IgApiClient();
      await loginWithPassword(fresh);
      const items = await fetchSavedItems(fresh, args.limit);
      await persistState(fresh, args.sessionPath);
      process.stdout.write(
        `${JSON.stringify({ authMode: 'username-password', recoveredFrom: 'session-state', count: items.length, items: items.map(summarizeMedia) }, null, 2)}\n`,
      );
      return;
    }
    throw error;
  }
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseInstagramSavedProbeArgs(process.argv.slice(2));
  await runProbe(args);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
