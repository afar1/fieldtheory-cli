import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export function dataDir(): string {
  const override = process.env.FT_DATA_DIR;
  if (override) return override;
  return path.join(os.homedir(), '.ft-bookmarks');
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

export function classificationLockPath(): string {
  return path.join(dataDir(), 'classification-lock.json');
}

export function preferencesPath(): string {
  return path.join(dataDir(), '.preferences');
}

export function isFirstRun(): boolean {
  return !fs.existsSync(twitterBookmarksCachePath());
}

// ── Markdown wiki paths ──────────────────────────────────────────────────

export function mdDir(): string {
  return path.join(dataDir(), 'md');
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
  return path.join(dataDir(), 'schema.md');
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
