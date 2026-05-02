import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { canonicalCommandsDir, canonicalLibraryDir } from './paths.js';
import { isPathInside, resolveMarkdownPath } from './document-ops.js';

const DEFAULT_FIELD_THEORY_BUNDLE_ID = 'com.fieldtheory.app';

export type FieldTheoryOpenKind = 'library' | 'command';

type SpawnResult = Pick<ReturnType<typeof spawnSync>, 'status' | 'error'>;
type SpawnRunner = (command: string, args: string[], options: { cwd?: string; stdio: 'ignore' }) => SpawnResult;

export interface FieldTheoryOpenTarget {
  kind: FieldTheoryOpenKind;
  path: string;
  url: string | null;
  supported: boolean;
  note?: string;
}

export interface FieldTheoryLaunchResult {
  launched: boolean;
  method: 'bundle' | 'dev-dir' | 'command' | 'unsupported';
}

export interface FieldTheoryLaunchOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  spawn?: SpawnRunner;
}

export function inferOpenKind(filePath: string): FieldTheoryOpenKind | null {
  const resolved = path.resolve(filePath);
  if (isPathInside(path.resolve(canonicalLibraryDir()), resolved)) return 'library';
  if (isPathInside(path.resolve(canonicalCommandsDir()), resolved)) return 'command';
  return null;
}

export function buildFieldTheoryOpenTarget(inputPath: string, kind?: FieldTheoryOpenKind): FieldTheoryOpenTarget {
  const resolvedKind = kind ?? inferOpenKind(inputPath);
  if (!resolvedKind) {
    throw new Error('Could not infer target kind. Pass --kind library or --kind command.');
  }
  if (resolvedKind !== 'library' && resolvedKind !== 'command') {
    throw new Error(`Unknown target kind: ${String(resolvedKind)}`);
  }

  const root = resolvedKind === 'library' ? canonicalLibraryDir() : canonicalCommandsDir();
  const resolvedPath = resolveMarkdownPath(root, inputPath);
  if (!resolvedPath) throw new Error(`Path is outside the ${resolvedKind} root or is not markdown.`);

  if (resolvedKind === 'library') {
    const params = new URLSearchParams({ file: resolvedPath, immersive: 'true' });
    return {
      kind: resolvedKind,
      path: resolvedPath,
      url: `fieldtheory://wiki/open?${params.toString()}`,
      supported: true,
    };
  }

  return {
    kind: resolvedKind,
    path: resolvedPath,
    url: null,
    supported: false,
    note: 'Field Theory does not expose a command-file deep link yet; open this path in the Commands view.',
  };
}

function runLauncher(spawn: SpawnRunner, command: string, args: string[], method: FieldTheoryLaunchResult['method'], cwd?: string): FieldTheoryLaunchResult {
  const result = spawn(command, args, { cwd, stdio: 'ignore' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not open Field Theory with ${method} launcher.`);
  }
  return { launched: true, method };
}

export function openFieldTheoryTarget(target: FieldTheoryOpenTarget, options: FieldTheoryLaunchOptions = {}): FieldTheoryLaunchResult {
  if (!target.supported || !target.url) return { launched: false, method: 'unsupported' };

  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const spawn = options.spawn ?? spawnSync;

  if (env.FT_APP_OPEN_COMMAND) {
    return runLauncher(spawn, env.FT_APP_OPEN_COMMAND, [target.url], 'command');
  }

  if (env.FT_APP_DEV_DIR) {
    const devDir = path.resolve(env.FT_APP_DEV_DIR);
    const electronBin = env.FT_APP_DEV_ELECTRON ?? path.join(devDir, 'node_modules', '.bin', 'electron');
    return runLauncher(spawn, electronBin, [devDir, target.url], 'dev-dir', devDir);
  }

  if (platform !== 'darwin') return { launched: false, method: 'unsupported' };

  const bundleId = env.FT_APP_BUNDLE_ID ?? DEFAULT_FIELD_THEORY_BUNDLE_ID;
  try {
    return runLauncher(spawn, 'open', ['-b', bundleId, target.url], 'bundle');
  } catch (error) {
    throw new Error(
      `Could not open Field Theory using bundle id ${bundleId}. ` +
      'Use --no-launch to print the URL, set FT_APP_BUNDLE_ID for packaged variants, ' +
      'or set FT_APP_DEV_DIR for a local development checkout.',
      { cause: error },
    );
  }
}
