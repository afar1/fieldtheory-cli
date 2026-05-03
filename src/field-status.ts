import fs from 'node:fs';
import path from 'node:path';
import {
  bookmarkMediaDir,
  bookmarkMediaManifestPath,
  canonicalCommandsDir,
  canonicalDataDir,
  canonicalLibraryDir,
  commandsDir,
  dataDir,
  fieldTheoryDir,
  legacyDataDir,
  libraryDir,
  twitterBookmarksCachePath,
  twitterBookmarksIndexPath,
} from './paths.js';

export interface FieldTheoryPathReport {
  fieldTheoryDir: string;
  active: {
    bookmarksDir: string;
    libraryDir: string;
    commandsDir: string;
    mediaDir: string;
    mediaManifestPath: string;
    bookmarksCachePath: string;
    bookmarksIndexPath: string;
  };
  canonical: {
    bookmarksDir: string;
    libraryDir: string;
    commandsDir: string;
  };
  env: {
    FT_DATA_DIR?: string;
    FT_LIBRARY_DIR?: string;
    FT_COMMANDS_DIR?: string;
  };
  legacy: {
    bookmarksDir: string;
    exists: boolean;
    mdDir: string;
    mdExists: boolean;
  };
}

export function getPathReport(): FieldTheoryPathReport {
  const legacyDir = legacyDataDir();
  const legacyMdDir = path.join(legacyDir, 'md');
  return {
    fieldTheoryDir: fieldTheoryDir(),
    active: {
      bookmarksDir: dataDir(),
      libraryDir: libraryDir(),
      commandsDir: commandsDir(),
      mediaDir: bookmarkMediaDir(),
      mediaManifestPath: bookmarkMediaManifestPath(),
      bookmarksCachePath: twitterBookmarksCachePath(),
      bookmarksIndexPath: twitterBookmarksIndexPath(),
    },
    canonical: {
      bookmarksDir: canonicalDataDir(),
      libraryDir: canonicalLibraryDir(),
      commandsDir: canonicalCommandsDir(),
    },
    env: {
      FT_DATA_DIR: process.env.FT_DATA_DIR,
      FT_LIBRARY_DIR: process.env.FT_LIBRARY_DIR,
      FT_COMMANDS_DIR: process.env.FT_COMMANDS_DIR,
    },
    legacy: {
      bookmarksDir: legacyDir,
      exists: fs.existsSync(legacyDir),
      mdDir: legacyMdDir,
      mdExists: fs.existsSync(legacyMdDir),
    },
  };
}

export function formatPathReport(report: FieldTheoryPathReport): string {
  const lines = [
    'Field Theory paths',
    `  bookmarks: ${report.canonical.bookmarksDir}`,
    `  library:   ${report.canonical.libraryDir}`,
    `  commands:  ${report.canonical.commandsDir}`,
    `  media:     ${report.active.mediaDir}`,
  ];
  if (report.legacy.exists || report.legacy.mdExists) {
    lines.push('');
    lines.push('Legacy data detected (report-only):');
    if (report.legacy.exists) lines.push(`  ${report.legacy.bookmarksDir}`);
    if (report.legacy.mdExists) lines.push(`  ${report.legacy.mdDir}`);
  }
  return lines.join('\n');
}
