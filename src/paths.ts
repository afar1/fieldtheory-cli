import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

export function dataDir(): string {
  const override = process.env.FT_DATA_DIR;
  if (override) return override;
  return path.join(os.homedir(), '.ft-bookmarks');
}

/**
 * Root for all Field Theory ideas / librarian-adjacent data. Lives alongside
 * the Mac app's existing `~/.fieldtheory/librarian/` root so both apps share
 * a single `~/.fieldtheory/` home. In tests, FT_DATA_DIR overrides both the
 * bookmarks root and this root to the same temp dir — bookmark data lands at
 * <tmp>/bookmarks.db and ideas data lands at <tmp>/ideas/.
 */
export function fieldTheoryRoot(): string {
  const override = process.env.FT_DATA_DIR;
  if (override) return override;
  return path.join(os.homedir(), '.fieldtheory');
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

// ── Ideas / adjacent paths ──────────────────────────────────────────────

/**
 * User-facing root for everything ideas-related: seeds, runs, nodes,
 * batches, the repos and frames registries, the app-facing index manifest,
 * and the internal adjacent-pipeline storage. Lives under
 * ~/.fieldtheory/ideas/ in production.
 */
export function ideasRoot(): string {
  return path.join(fieldTheoryRoot(), 'ideas');
}

export function adjacentDir(): string {
  return path.join(ideasRoot(), 'adjacent');
}

export function adjacentArtifactsDir(): string {
  return path.join(adjacentDir(), 'artifacts');
}

export function adjacentConsiderationsDir(): string {
  return path.join(adjacentDir(), 'considerations');
}

export function adjacentFramesDir(): string {
  return path.join(adjacentDir(), 'frames');
}

export function adjacentCacheDir(): string {
  return path.join(adjacentDir(), 'cache');
}

export function ensureAdjacentDirs(): string {
  const root = adjacentDir();
  ensureDirSync(root);
  ensureDirSync(adjacentArtifactsDir());
  ensureDirSync(adjacentConsiderationsDir());
  ensureDirSync(adjacentFramesDir());
  ensureDirSync(adjacentCacheDir());
  ensureDirSync(path.join(adjacentCacheDir(), 'seed-briefs'));
  ensureDirSync(path.join(adjacentCacheDir(), 'results'));
  ensureDirSync(path.join(adjacentDir(), 'repo-indices'));
  return root;
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

// ── Ideas markdown artifact paths ───────────────────────────────────────

export function ideasMdDir(): string {
  return ideasRoot();
}

export function ideasSeedsDir(date?: string): string {
  const base = path.join(ideasMdDir(), 'seeds');
  return date ? path.join(base, date) : base;
}

export function ideasRunsDir(date?: string): string {
  const base = path.join(ideasMdDir(), 'runs');
  return date ? path.join(base, date) : base;
}

export function ideasNodesDir(date?: string): string {
  const base = path.join(ideasMdDir(), 'nodes');
  return date ? path.join(base, date) : base;
}

export function ideasBatchesDir(date?: string): string {
  const base = path.join(ideasMdDir(), 'batches');
  return date ? path.join(base, date) : base;
}

export function ideasReposRegistryPath(): string {
  return path.join(ideasMdDir(), 'repos.json');
}

export function userFramesPath(): string {
  return path.join(ideasMdDir(), 'frames.json');
}

// ── Legacy paths + one-time migration ──────────────────────────────────
//
// Ideas data used to live at ~/.ft-bookmarks/automation/{ideas,adjacent}/,
// co-located with bookmark storage. Phase 1.5 moves it to ~/.fieldtheory/
// so it sits next to the Mac app's existing ~/.fieldtheory/librarian/ root.
// On first run after upgrade we detect legacy content and copy it over.

function legacyIdeasRoot(): string {
  return path.join(dataDir(), 'automation', 'ideas');
}

function legacyAdjacentRoot(): string {
  return path.join(dataDir(), 'automation', 'adjacent');
}

const MIGRATION_MARKER = '.migrated-from-ft-bookmarks';

export interface IdeasMigrationResult {
  migrated: boolean;
  legacyIdeasRoot: string;
  legacyAdjacentRoot: string;
  newRoot: string;
  reason?: 'already-migrated' | 'nothing-to-migrate' | 'legacy-equals-new';
}

/**
 * One-time migration from the legacy ~/.ft-bookmarks/automation/{ideas,adjacent}/
 * layout to the new ~/.fieldtheory/ideas/ root. Safe to call repeatedly — if
 * the new root already contains a migration marker (or just exists with
 * content), the call is a no-op.
 *
 * Behavior:
 *   1. If the new root exists AND has real content (any non-dotfile entry),
 *      consider it already migrated and return without touching anything.
 *   2. If neither legacy root exists, return without creating the new root.
 *   3. Otherwise, create the new root, copy legacy content into it, drop a
 *      marker file, and leave the legacy directories intact so the user can
 *      verify the migration and delete them manually.
 *
 * In tests, FT_DATA_DIR forces dataDir() and fieldTheoryRoot() to the same
 * temp directory. When that happens, the legacy ideas path equals the new
 * root's sibling and we short-circuit.
 */
export function migrateLegacyIdeasData(): IdeasMigrationResult {
  const newRoot = ideasRoot();
  const legacyIdeas = legacyIdeasRoot();
  const legacyAdjacent = legacyAdjacentRoot();

  const result: IdeasMigrationResult = {
    migrated: false,
    legacyIdeasRoot: legacyIdeas,
    legacyAdjacentRoot: legacyAdjacent,
    newRoot,
  };

  // Edge case: in tests where FT_DATA_DIR points both roots at the same tmp
  // dir, the legacy ideas path ends up *inside* the new field-theory root
  // (`<tmp>/automation/ideas` vs `<tmp>/ideas`). These are different paths
  // but live on the same filesystem, so migration is a plain rename of the
  // legacy tree. Still safe — we check `newRoot` content separately below.

  if (fs.existsSync(newRoot)) {
    const contents = safeReadDir(newRoot).filter((name) => !name.startsWith('.'));
    if (contents.length > 0 || fs.existsSync(path.join(newRoot, MIGRATION_MARKER))) {
      result.reason = 'already-migrated';
      return result;
    }
  }

  const legacyIdeasExists = fs.existsSync(legacyIdeas);
  const legacyAdjacentExists = fs.existsSync(legacyAdjacent);
  if (!legacyIdeasExists && !legacyAdjacentExists) {
    result.reason = 'nothing-to-migrate';
    return result;
  }

  // Safety: never try to copy a directory into itself.
  if (path.resolve(legacyIdeas) === path.resolve(newRoot)) {
    result.reason = 'legacy-equals-new';
    return result;
  }

  ensureDirSync(newRoot);

  if (legacyIdeasExists) {
    for (const entry of safeReadDir(legacyIdeas)) {
      const src = path.join(legacyIdeas, entry);
      const dst = path.join(newRoot, entry);
      fs.cpSync(src, dst, { recursive: true });
    }
  }

  if (legacyAdjacentExists) {
    const dstAdjacent = path.join(newRoot, 'adjacent');
    ensureDirSync(dstAdjacent);
    for (const entry of safeReadDir(legacyAdjacent)) {
      const src = path.join(legacyAdjacent, entry);
      const dst = path.join(dstAdjacent, entry);
      fs.cpSync(src, dst, { recursive: true });
    }
  }

  fs.writeFileSync(
    path.join(newRoot, MIGRATION_MARKER),
    JSON.stringify({ migratedAt: new Date().toISOString(), legacyIdeas, legacyAdjacent }, null, 2),
    { mode: 0o600 },
  );

  result.migrated = true;
  return result;
}

function safeReadDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
