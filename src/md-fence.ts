/**
 * Strip LLM-generated code fence wrappers from wiki page content.
 *
 * LLM engines (Claude CLI, etc.) sometimes wrap an entire markdown response in
 * a ```markdown ... ``` code block. When that lands on disk it renders the
 * whole file as a code block instead of markdown. This module both prevents
 * the corruption at write-time (called from compileMd) and cleans up pages
 * that were already written before the prevention landed.
 */

import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { mdDir, mdCategoriesDir, mdDomainsDir, mdEntitiesDir } from './paths.js';

/**
 * Remove an outer markdown code fence wrapper from LLM output, if present.
 *
 * Handles three observed shapes in the wild:
 *   A. Full wrap:       ```markdown\n---\n...\n```
 *   B. Partial strip:   markdown\n---\n...\n```   (leading backticks eaten, language token left)
 *   C. Trailing only:   ---\n...\n```              (somehow just the closing fence survived)
 *
 * Idempotent: running it twice on the same input yields the same output.
 */
export function stripLlmMarkdownFence(raw: string): string {
  let s = raw.trim();

  // Case A — full fenced block wrapping the entire response.
  const full = s.match(/^```[a-zA-Z0-9-]*\s*\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (full) return full[1].trim();

  // Case B — orphan leading language tag, but only if the next line is
  // frontmatter. Category/domain/entity pages always start with `---`, so
  // this guard prevents stripping legitimate content that happens to begin
  // with the literal word "markdown".
  s = s.replace(/^markdown\r?\n(?=---)/, '');

  // Case C — orphan trailing fence on its own line.
  s = s.replace(/\r?\n```\s*$/, '');

  return s.trim();
}

export interface FenceScanResult {
  scanned: number;
  fixed: number;
  fixedFiles: string[];
  backupDir: string | null;
}

/**
 * Walk the wiki subdirectories and rewrite any files whose content changes
 * under `stripLlmMarkdownFence`. Skips silently if a compile is in progress
 * (presence of `.lock`) so we don't race the writer.
 */
export async function cleanWikiFences(
  options: { backup?: boolean } = {},
): Promise<FenceScanResult> {
  const result: FenceScanResult = { scanned: 0, fixed: 0, fixedFiles: [], backupDir: null };

  if (!existsSync(mdDir())) return result;

  // Avoid racing an in-progress `ft wiki` that holds the lock.
  if (existsSync(path.join(mdDir(), '.lock'))) return result;

  let backupDir: string | null = null;
  if (options.backup) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    backupDir = path.join(mdDir(), `.fence-backup-${ts}`);
  }

  const subdirs = [mdCategoriesDir(), mdDomainsDir(), mdEntitiesDir()];
  for (const dir of subdirs) {
    if (!existsSync(dir)) continue;
    let files: string[];
    try { files = readdirSync(dir); } catch { continue; }

    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const filePath = path.join(dir, f);
      result.scanned++;

      let original: string;
      try { original = await readFile(filePath, 'utf8'); } catch { continue; }

      const cleaned = stripLlmMarkdownFence(original);
      if (cleaned === original) continue;

      if (backupDir) {
        const subdirName = path.basename(dir);
        const backupPath = path.join(backupDir, subdirName, f);
        try {
          await mkdir(path.dirname(backupPath), { recursive: true });
          await writeFile(backupPath, original, 'utf8');
          if (!result.backupDir) result.backupDir = backupDir;
        } catch { /* best effort */ }
      }

      try {
        await writeFile(filePath, cleaned, 'utf8');
        result.fixed++;
        result.fixedFiles.push(path.relative(mdDir(), filePath));
      } catch { /* skip */ }
    }
  }

  return result;
}
