import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export function fieldTheoryDir(): string {
  return path.join(os.homedir(), '.fieldtheory');
}

export function defaultDataDir(): string {
  return path.join(fieldTheoryDir(), 'bookmarks');
}

export function legacyDataDir(): string {
  return path.join(os.homedir(), '.ft-bookmarks');
}

export function dataDir(): string {
  const override = process.env.FT_DATA_DIR;
  if (override) return override;

  const next = defaultDataDir();
  if (fs.existsSync(next)) return next;

  const legacy = legacyDataDir();
  if (fs.existsSync(legacy)) return legacy;

  return next;
}

function ensureDirSync(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export type DataDirMigrationStatus = 'override' | 'no-legacy' | 'already-linked' | 'target-exists' | 'linked';

export function migrateDefaultDataDir(): DataDirMigrationStatus {
  if (process.env.FT_DATA_DIR) return 'override';

  const legacy = legacyDataDir();
  const next = defaultDataDir();
  if (!fs.existsSync(legacy)) return 'no-legacy';

  if (fs.existsSync(next)) {
    try {
      const realNext = fs.realpathSync(next);
      const realLegacy = fs.realpathSync(legacy);
      return realNext === realLegacy ? 'already-linked' : 'target-exists';
    } catch {
      return 'target-exists';
    }
  }

  ensureDirSync(fieldTheoryDir());
  fs.symlinkSync(legacy, next, process.platform === 'win32' ? 'junction' : 'dir');
  return 'linked';
}

export function ensureDataDir(): string {
  migrateDefaultDataDir();
  const dir = dataDir();
  ensureDirSync(dir);
  return dir;
}

export function sessionPath(): string {
  return path.join(fieldTheoryDir(), 'session.json');
}

export function contactsPath(): string {
  return path.join(fieldTheoryDir(), 'contacts.json');
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
