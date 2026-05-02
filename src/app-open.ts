import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { canonicalCommandsDir, canonicalLibraryDir } from './paths.js';
import { isPathInside, resolveMarkdownPath } from './document-ops.js';

export type FieldTheoryOpenKind = 'library' | 'command';

export interface FieldTheoryOpenTarget {
  kind: FieldTheoryOpenKind;
  path: string;
  url: string | null;
  supported: boolean;
  note?: string;
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

export function openFieldTheoryTarget(target: FieldTheoryOpenTarget): void {
  if (!target.supported || !target.url) return;
  if (process.platform !== 'darwin') return;
  spawnSync('open', [target.url], { stdio: 'ignore' });
}
