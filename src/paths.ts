import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export function dataDir(): string {
  const override = process.env.FT_DATA_DIR;
  if (override) return override;
  const canonical = path.join(os.homedir(), '.fieldtheory', 'bookmarks');
  const legacy = path.join(os.homedir(), '.ft-bookmarks');
  if (fs.existsSync(canonical) || !fs.existsSync(legacy)) return canonical;
  return legacy;
}

export function fieldTheoryDir(): string {
  return path.join(os.homedir(), '.fieldtheory');
}

export function legacyDataDir(): string {
  return path.join(os.homedir(), '.ft-bookmarks');
}

export function canonicalDataDir(): string {
  return process.env.FT_DATA_DIR ?? path.join(fieldTheoryDir(), 'bookmarks');
}

export function canonicalLibraryDir(): string {
  return process.env.FT_LIBRARY_DIR ?? path.join(fieldTheoryDir(), 'library');
}

export function canonicalCommandsDir(): string {
  return process.env.FT_COMMANDS_DIR ?? path.join(fieldTheoryDir(), 'commands');
}

export function libraryDir(): string {
  const override = process.env.FT_LIBRARY_DIR;
  if (override) return override;
  if (process.env.FT_DATA_DIR) return path.join(process.env.FT_DATA_DIR, 'md');
  const canonical = path.join(os.homedir(), '.fieldtheory', 'library');
  const legacy = path.join(os.homedir(), '.ft-bookmarks', 'md');
  if (fs.existsSync(canonical) || !fs.existsSync(legacy)) return canonical;
  return legacy;
}

export function commandsDir(): string {
  return canonicalCommandsDir();
}

function ensureDirSync(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export function ensureDataDir(): string {
  const dir = dataDir();
  ensureDirSync(dir);
  return dir;
}

export function twitterBookmarksCachePath(): string {
  return path.join(dataDir(), 'bookmarks.jsonl');
}

export function twitterBookmarksMetaPath(): string {
  return path.join(dataDir(), 'bookmarks-meta.json');
}

export function twitterOauthTokenPath(): string {
  return path.join(dataDir(), 'oauth-token.json');
}

export function twitterBackfillStatePath(): string {
  return path.join(dataDir(), 'bookmarks-backfill-state.json');
}

export function bookmarkMediaDir(): string {
  return path.join(dataDir(), 'media');
}

export function bookmarkMediaManifestPath(): string {
  return path.join(dataDir(), 'media-manifest.json');
}

export function twitterBookmarksIndexPath(): string {
  return path.join(dataDir(), 'bookmarks.db');
}

export function preferencesPath(): string {
  return path.join(dataDir(), '.preferences');
}

export function isFirstRun(): boolean {
  return !fs.existsSync(twitterBookmarksCachePath());
}

// ── Markdown wiki paths ──────────────────────────────────────────────────

export function mdDir(): string {
  return libraryDir();
}

export function mdIndexPath(): string {
  return path.join(mdDir(), 'index.md');
}

export function mdLogPath(): string {
  return path.join(mdDir(), 'log.md');
}

export function mdStatePath(): string {
  return path.join(mdDir(), 'md-state.json');
}

export function mdSchemaPath(): string {
  return path.join(mdDir(), 'schema.md');
}

export function mdCategoriesDir(): string {
  return path.join(mdDir(), 'categories');
}

export function mdDomainsDir(): string {
  return path.join(mdDir(), 'domains');
}

export function mdEntitiesDir(): string {
  return path.join(mdDir(), 'entities');
}

export function mdConceptsDir(): string {
  return path.join(mdDir(), 'concepts');
}
