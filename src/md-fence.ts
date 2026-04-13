/**
 * Strip LLM-generated code fence wrappers from wiki page content.
 *
 * Some LLM engines wrap their whole response in a ```markdown ... ``` block,
 * which otherwise renders the page as a code block instead of markdown.
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
 *   B. Partial strip:   markdown\n---\n...\n```   (backticks eaten, language token + trailing fence remain)
 *   C. Trailing only:   ---\n...\n```              (orphan trailing fence on its own)
 *
 * Cases B and C compose: for shape B we first drop the orphan leading token,
 * then drop the trailing fence in a second pass.
 *
 * Idempotent: running it twice on the same input yields the same output.
 */
export function stripLlmMarkdownFence(raw: string): string {
  let s = raw.trim();

  // Case A — full fenced block wrapping the entire response.
  const full = s.match(/^```[a-zA-Z0-9-]*\s*\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (full) return full[1].trim();

  // Case B — orphan leading language tag, guarded by frontmatter lookahead
  // so we don't strip legitimate content starting with the word "markdown".
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
