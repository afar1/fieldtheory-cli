import { execFile as execFileCb } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const DEFAULT_RELEASE_API_URL = 'https://api.github.com/repos/afar1/field-releases/releases/latest';
const USER_AGENT = 'fieldtheory-cli';
const DEFAULT_INSTALL_DIR = '/Applications';

const execFile = promisify(execFileCb);

type Fetcher = typeof fetch;
type ExecFileRunner = (file: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }>;

export interface FieldTheoryReleaseAsset {
  name: string;
  browser_download_url?: string;
}

export interface FieldTheoryRelease {
  tag_name?: string;
  name?: string;
  assets?: FieldTheoryReleaseAsset[];
}

export interface FieldTheoryAppInstallOptions {
  fetch?: Fetcher;
  execFile?: ExecFileRunner;
  installDir?: string;
  open?: boolean;
  platform?: NodeJS.Platform;
  releaseApiUrl?: string;
  env?: NodeJS.ProcessEnv;
  onProgress?: (message: string) => void;
}

export interface FieldTheoryAppInstallResult {
  appPath: string;
  assetName: string;
  release: string;
  downloadUrl: string;
}

function assertOkResponse(response: Response, context: string): void {
  if (!response.ok) {
    throw new Error(`${context} failed: HTTP ${response.status} ${response.statusText}`);
  }
}

function authHeaders(env: NodeJS.ProcessEnv): Record<string, string> {
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function selectFieldTheoryDmgAsset(release: FieldTheoryRelease): FieldTheoryReleaseAsset {
  const assets = release.assets ?? [];
  const dmgAssets = assets.filter((asset) =>
    asset.browser_download_url && asset.name.toLowerCase().endsWith('.dmg')
  );
  const preferred = dmgAssets.find((asset) => /\barm64\b/i.test(asset.name)) ?? dmgAssets[0];
  if (!preferred) {
    const names = assets.map((asset) => asset.name).join(', ') || 'none';
    throw new Error(`Latest Field Theory release has no downloadable DMG asset. Assets: ${names}`);
  }
  return preferred;
}

async function fetchLatestRelease(fetcher: Fetcher, releaseApiUrl: string, env: NodeJS.ProcessEnv): Promise<FieldTheoryRelease> {
  const response = await fetcher(releaseApiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
      ...authHeaders(env),
    },
  });
  assertOkResponse(response, 'Fetching latest Field Theory release');
  return await response.json() as FieldTheoryRelease;
}

async function downloadFile(fetcher: Fetcher, url: string, destination: string): Promise<void> {
  const response = await fetcher(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  assertOkResponse(response, 'Downloading Field Theory DMG');
  if (!response.body) throw new Error('Downloading Field Theory DMG failed: empty response body');
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(destination));
}

async function findAppBundle(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  const direct = entries.find((entry) => entry.isDirectory() && entry.name.endsWith('.app'));
  if (direct) return path.join(dir, direct.name);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nestedDir = path.join(dir, entry.name);
    const nestedEntries = await readdir(nestedDir, { withFileTypes: true }).catch(() => []);
    const nested = nestedEntries.find((nestedEntry) => nestedEntry.isDirectory() && nestedEntry.name.endsWith('.app'));
    if (nested) return path.join(nestedDir, nested.name);
  }

  throw new Error('Mounted Field Theory DMG did not contain an .app bundle.');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function replaceAppBundle(sourceApp: string, installDir: string, run: ExecFileRunner): Promise<string> {
  await mkdir(installDir, { recursive: true });

  const appName = path.basename(sourceApp);
  const targetApp = path.join(installDir, appName);
  const tempApp = path.join(installDir, `.${appName}.installing-${process.pid}-${Date.now()}`);
  const backupApp = path.join(installDir, `.${appName}.previous-${process.pid}-${Date.now()}`);

  await rm(tempApp, { recursive: true, force: true });
  await run('ditto', [sourceApp, tempApp]);

  const hadExisting = await pathExists(targetApp);
  if (hadExisting) await rename(targetApp, backupApp);

  try {
    await rename(tempApp, targetApp);
  } catch (error) {
    if (hadExisting && await pathExists(backupApp) && !await pathExists(targetApp)) {
      await rename(backupApp, targetApp);
    }
    throw error;
  }

  if (hadExisting) await rm(backupApp, { recursive: true, force: true });
  return targetApp;
}

export async function installFieldTheoryApp(options: FieldTheoryAppInstallOptions = {}): Promise<FieldTheoryAppInstallResult> {
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') {
    throw new Error('Field Theory app install is only supported on macOS.');
  }

  const fetcher = options.fetch ?? fetch;
  const run = options.execFile ?? execFile;
  const installDir = path.resolve(options.installDir ?? DEFAULT_INSTALL_DIR);
  const releaseApiUrl = options.releaseApiUrl ?? DEFAULT_RELEASE_API_URL;
  const env = options.env ?? process.env;
  const progress = options.onProgress ?? (() => undefined);

  progress('Checking latest Field Theory release...');
  const release = await fetchLatestRelease(fetcher, releaseApiUrl, env);
  const asset = selectFieldTheoryDmgAsset(release);
  const downloadUrl = asset.browser_download_url!;
  const releaseName = release.tag_name ?? release.name ?? 'latest';

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fieldtheory-app-install-'));
  const mountPoint = path.join(tempDir, 'mount');
  const dmgPath = path.join(tempDir, asset.name);
  let mounted = false;

  try {
    progress(`Downloading ${asset.name}...`);
    await downloadFile(fetcher, downloadUrl, dmgPath);

    await mkdir(mountPoint, { recursive: true });
    progress('Mounting installer image...');
    await run('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mountPoint, dmgPath]);
    mounted = true;

    const sourceApp = await findAppBundle(mountPoint);
    progress(`Installing ${path.basename(sourceApp)} to ${installDir}...`);
    const appPath = await replaceAppBundle(sourceApp, installDir, run);

    if (options.open) {
      progress('Opening Field Theory...');
      await run('open', [appPath]);
    }

    return {
      appPath,
      assetName: asset.name,
      release: releaseName,
      downloadUrl,
    };
  } finally {
    if (mounted) {
      try {
        await run('hdiutil', ['detach', mountPoint]);
      } catch {
        progress(`Could not detach ${mountPoint}; macOS may detach it after restart.`);
      }
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}
