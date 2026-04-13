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

/**
 * File written at migration-success. Its presence means the migration fully
 * completed and we must never touch the new root again.
 */
const COMPLETE_MARKER = '.migrated-from-ft-bookmarks';

/**
 * File written *before* copying starts. Its presence after a CLI invocation
 * means a previous migration was interrupted partway through — we can safely
 * wipe the new root and retry. On successful completion this file is removed
 * and replaced by the complete marker.
 */
const BEGIN_MARKER = '.migration-in-progress';

export interface IdeasMigrationResult {
  migrated: boolean;
  legacyIdeasRoot: string;
  legacyAdjacentRoot: string;
  newRoot: string;
  reason?:
    | 'already-migrated'
    | 'nothing-to-migrate'
    | 'legacy-equals-new'
    | 'recovered-partial';
}

/**
 * One-time migration from the legacy ~/.ft-bookmarks/automation/{ideas,adjacent}/
 * layout to the new ~/.fieldtheory/ideas/ root. Safe to call repeatedly.
 *
 * Two markers guard the invariant:
 *
 *   - `.migration-in-progress` is written *before* the first copy. If a
 *     previous run left it behind, we know that run was interrupted and
 *     the new root contains partially-copied legacy data. We wipe and retry.
 *   - `.migrated-from-ft-bookmarks` is written *after* every copy succeeds
 *     (and the begin marker is removed). Its presence is the only reliable
 *     "done" signal.
 *
 * Behavior:
 *   1. If the complete marker exists, return without touching anything.
 *   2. If a begin marker is present without a complete marker, the previous
 *      run was interrupted: wipe the new root and retry the copy from scratch.
 *   3. If the new root has non-dotfile content *without* the begin marker,
 *      treat it as user-populated and leave it alone (conservative).
 *   4. If neither legacy root exists, return without creating the new root.
 *   5. Otherwise: write the begin marker, copy legacy content in, write the
 *      complete marker, and remove the begin marker.
 *
 * On a failed copy the begin marker stays in place, so the next CLI run will
 * detect it and take the recovery path (2) automatically.
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

  // (1) Fully migrated: complete marker wins over everything.
  if (fs.existsSync(path.join(newRoot, COMPLETE_MARKER))) {
    result.reason = 'already-migrated';
    return result;
  }

  // (2) Previous interrupted run: begin marker without complete marker.
  // Wipe the partial state so the copy below starts from a clean slate.
  let recoveringFromPartial = false;
  if (fs.existsSync(path.join(newRoot, BEGIN_MARKER))) {
    fs.rmSync(newRoot, { recursive: true, force: true });
    recoveringFromPartial = true;
  }

  // (3) User-populated new root: leave it alone.
  if (!recoveringFromPartial && fs.existsSync(newRoot)) {
    const contents = safeReadDir(newRoot).filter((name) => !name.startsWith('.'));
    if (contents.length > 0) {
      result.reason = 'already-migrated';
      return result;
    }
  }

  // (4) Nothing to migrate.
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

  // (5) Do the migration under the begin marker.
  ensureDirSync(newRoot);
  fs.writeFileSync(
    path.join(newRoot, BEGIN_MARKER),
    JSON.stringify({ startedAt: new Date().toISOString(), legacyIdeas, legacyAdjacent }, null, 2),
    { mode: 0o600 },
  );

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

  // Success: write the complete marker and remove the begin marker. Order
  // matters — if the process dies between these two lines the next run will
  // still see "complete" and take the fast path.
  fs.writeFileSync(
    path.join(newRoot, COMPLETE_MARKER),
    JSON.stringify({ migratedAt: new Date().toISOString(), legacyIdeas, legacyAdjacent }, null, 2),
    { mode: 0o600 },
  );
  fs.rmSync(path.join(newRoot, BEGIN_MARKER), { force: true });

  result.migrated = true;
  if (recoveringFromPartial) result.reason = 'recovered-partial';
  return result;
}

function safeReadDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
