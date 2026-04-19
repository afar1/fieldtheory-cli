import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './paths.js';

export function resolveNamespaceDataDir(primaryEnv: string, legacyEnv: string, subdir: string): string {
  const primaryOverride = process.env[primaryEnv];
  if (primaryOverride) return primaryOverride;

  const legacyOverride = process.env[legacyEnv];
  if (legacyOverride) return legacyOverride;

  return path.join(dataDir(), subdir);
}

export function ensureNamespaceDataDir(dir: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}
