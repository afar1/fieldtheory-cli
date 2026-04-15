/**
 * Knowledge base Q&A engine.
 *
 * ft ask <question> [--save]
 *
 * Answers a question against the markdown knowledge base using layered context:
 *   L1: md/index.md (always included)
 *   L2: relevant category/domain/entity pages (keyword + FTS5 matched)
 *   L3: raw FTS5 bookmark results (for grounding)
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathExists, appendLine, listFiles, readMd } from './fs.js';
import {
  mdIndexPath, mdLogPath, mdConceptsDir, mdCategoriesDir,
  mdDomainsDir, mdEntitiesDir, mdEntriesDir, mdDir,
} from './paths.js';
import { searchBookmarks } from './bookmarks-db.js';
import { resolveEngine, invokeEngineAsync } from './engine.js';
import { buildAskPrompt, type MdBookmark } from './md-prompts.js';
import { slug, logEntry } from './md.js';
import { writeEntry } from './md-entries.js';

const MAX_WIKI_PAGES    = 5;
const MAX_RAW_BOOKMARKS = 20;

export interface AskOptions {
  save?: boolean;
  onProgress?: (status: string) => void;
}

export interface AskResult {
  answer: string;
  pagesRead: string[];
  savedAs?: string;
  wikiUpdates: string[];
  engine: string;
}

function scorePageName(pageName: string, questionWords: Set<string>): number {
  const nameWords = pageName.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/);
  return nameWords.filter((w) => questionWords.has(w)).length;
}

async function selectRelevantPages(question: string): Promise<string[]> {
  const questionWords = new Set(
    question.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length >= 3)
  );

  const allPages: { relPath: string; absPath: string; score: number }[] = [];

  async function scanDir(dir: string, prefix: string): Promise<void> {
    const files = await listFiles(dir);
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const name  = f.replace(/\.md$/, '');
      const score = scorePageName(name, questionWords);
      allPages.push({ relPath: `${prefix}/${name}`, absPath: path.join(dir, f), score });
    }
  }

  await Promise.all([
    scanDir(mdCategoriesDir(), 'categories'),
    scanDir(mdDomainsDir(), 'domains'),
    scanDir(mdEntitiesDir(), 'entities'),
    scanDir(mdConceptsDir(), 'concepts'),
    scanDir(mdEntriesDir(), 'entries'),
  ]);

  try {
    const ftsResults = await searchBookmarks({ query: question, limit: 50 });
    const ftsBoosts = new Set<string>();
    for (const r of ftsResults) {
      if (r.authorHandle) ftsBoosts.add(`entities/${slug(r.authorHandle)}`);
    }
    for (const page of allPages) {
      if (ftsBoosts.has(page.relPath)) page.score += 2;
    }
  } catch { /* FTS failed — keyword matching only */ }

  allPages.sort((a, b) => b.score - a.score);
  const selected = allPages.filter((p) => p.score > 0).slice(0, MAX_WIKI_PAGES).map((p) => p.absPath);

  if (selected.length === 0 && allPages.length > 0) {
    return allPages.slice(0, Math.min(3, allPages.length)).map((p) => p.absPath);
  }

  return selected;
}

function extractWikiUpdates(answer: string): string[] {
  const match = answer.match(/## Wiki Updates\s*([\s\S]*?)(?:$|##)/);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-') && l.includes('[['))
    .map((l) => l.slice(1).trim());
}

function stripWikiUpdatesSection(answer: string): string {
  return answer.replace(/\n## Wiki Updates[\s\S]*$/, '').trim();
}

export async function askMd(question: string, options: AskOptions = {}): Promise<AskResult> {
  const progress = options.onProgress ?? ((s: string) => fs.writeSync(2, s + '\n'));

  const engine = await resolveEngine();

  // ── L1: index ───────────────────────────────────────────────────────────
  progress('Reading index...');
  let indexContent = '';
  const indexPath = mdIndexPath();
  if (await pathExists(indexPath)) {
    indexContent = await readMd(indexPath);
  } else {
    progress('  Warning: index not found. Run ft md first.');
  }

  // ── L2: relevant pages ─────────────────────────────────────────────────
  progress('Selecting relevant pages...');
  const pagesRead: string[] = [];
  let mdContext = indexContent ? `### Index\n${indexContent}\n\n` : '';

  if (await pathExists(mdDir())) {
    const relevantPaths = await selectRelevantPages(question);
    for (const absPath of relevantPaths) {
      try {
        const content  = await readMd(absPath);
        const relPath  = path.relative(mdDir(), absPath);
        mdContext   += `### ${relPath}\n${content}\n\n`;
        pagesRead.push(relPath);
        progress(`  [read] ${relPath}`);
      } catch { /* skip unreadable pages */ }
    }
  }

  // ── L3: raw FTS5 bookmark results ───────────────────────────────────────
  progress('Searching bookmarks...');
  const rawResults = await searchBookmarks({ query: question, limit: MAX_RAW_BOOKMARKS });
  const rawBookmarks: MdBookmark[] = rawResults.map((r) => ({
    id: r.id,
    url: r.url,
    text: r.text,
    authorHandle: r.authorHandle,
  }));

  // ── LLM call ────────────────────────────────────────────────────────────
  progress('Invoking LLM...');
  const prompt     = buildAskPrompt(question, mdContext, rawBookmarks);
  const rawAnswer  = await invokeEngineAsync(engine, prompt, { timeout: 180_000, maxBuffer: 1024 * 1024 * 4 });
  const wikiUpdates = extractWikiUpdates(rawAnswer);
  const answer      = stripWikiUpdatesSection(rawAnswer);

  // ── Optional save ────────────────────────────────────────────────────────
  // Saved answers are authored entries, pre-filled with the LLM's response.
  // `writeEntry` handles filename, frontmatter, and the log append.
  let savedAs: string | undefined;
  if (options.save) {
    const result = await writeEntry({
      title: question,
      body: answer,
      entryTag: 'ft/concept',
      sourceType: 'ask',
      question,
    });
    savedAs = result.filePath;
    progress(`  Saved entry: ${result.filePath}`);
  }

  // ── Log entry ─────────────────────────────────────────────────────────
  const savedNote = savedAs ? ` saved=${path.basename(savedAs)}` : '';
  await appendLine(
    mdLogPath(),
    logEntry('ask', `engine=${engine.name} pages_read=${pagesRead.length} raw=${rawBookmarks.length}${savedNote}`),
  );

  if (wikiUpdates.length > 0) {
    for (const update of wikiUpdates) {
      await appendLine(mdLogPath(), `  - ${update}`);
    }
  }

  return { answer, pagesRead, savedAs, wikiUpdates, engine: engine.name };
}

// ── Test exports ─────────────────────────────────────────────────────────
export const extractWikiUpdatesForTest = extractWikiUpdates;
export const stripWikiUpdatesSectionForTest = stripWikiUpdatesSection;
export const scorePageNameForTest = scorePageName;
export const selectRelevantPagesForTest = selectRelevantPages;
