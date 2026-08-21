import fs from 'node:fs';
import path from 'node:path';
import { buildFieldTheoryOpenTarget, buildFieldTheoryPanelOpenTarget, inferOpenKind, openFieldTheoryTarget } from './app-open.js';
import { buildBrowserPanelUrl } from './browser-helper-state.js';
import {
  createCommandDocument,
  listCommandDocuments,
  renameCommandDocument,
  showCommandDocument,
  type CommandDocumentSummary,
} from './commands-files.js';
import { formatAgentContext, getAgentContext } from './agent-context.js';
import { readCurrentDocumentSummary } from './current.js';
import {
  canonicalCommandsDir,
  canonicalLibraryDir,
} from './paths.js';
import {
  createLibraryDocument,
  listLibraryDocuments,
  renameLibraryDocument,
  searchLibraryDocuments,
  showLibraryDocument,
  type LibraryDocumentSummary,
} from './library.js';
import { isPathInside, readContentInput, readDocumentVersion, resolveMarkdownPath } from './document-ops.js';

export type NavigationPlace = 'library' | 'commands' | 'briefs' | 'scratchpad' | 'wikis' | 'debates' | 'recent' | 'current';

export interface NavigationEntry {
  place: NavigationPlace | 'command';
  path: string;
  relPath: string;
  title: string;
  updatedAt: string;
  size: number;
}

export interface NavigationSearchResult extends NavigationEntry {
  snippet?: string;
}

export interface NavigationLink {
  target: string;
  count: number;
}

export interface NavigationWikiLink {
  target: string;
  link: string;
  label: string;
  entry: NavigationEntry;
}

export interface NavigationTag {
  tag: string;
  count: number;
}

export interface NavigationWriteInput {
  stdin?: boolean;
  file?: string;
  content?: string;
}

export interface NavigationOpenOptions {
  launch?: boolean;
  query?: string;
  action?: 'open' | 'tab' | 'reveal';
}

export interface NavigationOpenResult {
  path: string;
  url: string | null;
  launched: boolean;
}

export interface NavigationState {
  current: string;
  backStack: string[];
}

export type NavigationPlaceSummary = { name: NavigationPlace; description: string };

function navigationPlaces(): NavigationPlaceSummary[] {
  return [
    { name: 'library', description: canonicalLibraryDir() },
    { name: 'commands', description: canonicalCommandsDir() },
    { name: 'briefs', description: 'Library/briefs' },
    { name: 'scratchpad', description: 'Library/Scratchpad' },
    { name: 'wikis', description: 'Library wiki documents' },
    { name: 'debates', description: 'Library debate documents' },
    { name: 'recent', description: 'recent repo files for agent context' },
    { name: 'current', description: 'active Field Theory document context' },
  ];
}

const PLACE_PREFIXES: Partial<Record<NavigationPlace, string[]>> = {
  briefs: ['briefs/', 'Briefs/'],
  scratchpad: ['scratchpad/', 'Scratchpad/'],
  wikis: ['wikis/', 'Wikis/', 'wiki/', 'Wiki/'],
  debates: ['debates/', 'Debates/'],
};

function titleFromLibrary(doc: LibraryDocumentSummary): string {
  return doc.title || path.basename(doc.relPath, path.extname(doc.relPath));
}

function libraryEntry(doc: LibraryDocumentSummary, place: NavigationPlace = 'library'): NavigationEntry {
  return {
    place,
    path: doc.path,
    relPath: doc.relPath,
    title: titleFromLibrary(doc),
    updatedAt: doc.updatedAt,
    size: doc.size,
  };
}

function commandEntry(doc: CommandDocumentSummary): NavigationEntry {
  return {
    place: 'commands',
    path: doc.path,
    relPath: doc.relPath,
    title: doc.name,
    updatedAt: doc.updatedAt,
    size: doc.size,
  };
}

function normalizeNeedle(value: string): string {
  return value.trim().toLowerCase();
}

function matchesTitleOrPath(entry: NavigationEntry, query: string): boolean {
  const needle = normalizeNeedle(query);
  return entry.title.toLowerCase().includes(needle) || entry.relPath.toLowerCase().includes(needle);
}

function allNavigationEntries(): NavigationEntry[] {
  return [
    ...listLibraryNavigationDocuments().map((doc) => libraryEntry(doc)),
    ...listCommandDocuments().map(commandEntry),
  ];
}

function navigationLibraryExcludeDirs(): string[] {
  const libraryRoot = path.resolve(canonicalLibraryDir());
  const commandsRoot = path.resolve(canonicalCommandsDir());
  if (commandsRoot !== libraryRoot && isPathInside(libraryRoot, commandsRoot)) {
    return [commandsRoot];
  }
  return [];
}

function listLibraryNavigationDocuments(options: {
  limit?: number;
  includeRelPathPrefixes?: string[];
} = {}): LibraryDocumentSummary[] {
  return listLibraryDocuments({
    ...options,
    excludeDirs: navigationLibraryExcludeDirs(),
  });
}

function slugTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function navStatePath(): string {
  return path.join(canonicalLibraryDir(), '.ft-navigation-state.json');
}

function readNavState(): NavigationState {
  try {
    const parsed = JSON.parse(fs.readFileSync(navStatePath(), 'utf-8')) as Partial<NavigationState>;
    return {
      current: typeof parsed.current === 'string' ? parsed.current : 'library',
      backStack: Array.isArray(parsed.backStack) ? parsed.backStack.filter((item): item is string => typeof item === 'string') : [],
    };
  } catch {
    return { current: 'library', backStack: [] };
  }
}

function writeNavState(state: NavigationState): void {
  fs.mkdirSync(path.dirname(navStatePath()), { recursive: true });
  fs.writeFileSync(navStatePath(), JSON.stringify(state, null, 2));
}

function parseFrontmatterTags(content: string): string[] {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!match) return [];
  const yaml = match[1];
  const tags: string[] = [];
  const inline = /^tags:\s*(.+)$/im.exec(yaml);
  if (inline) {
    const raw = inline[1].trim();
    if (raw.startsWith('[') && raw.endsWith(']')) {
      tags.push(...raw.slice(1, -1).split(',').map((tag) => tag.trim().replace(/^["']|["']$/g, '')));
    } else if (!raw.startsWith('|')) {
      tags.push(...raw.split(/[,\s]+/).map((tag) => tag.trim()));
    }
  }
  const block = /^tags:\s*\n((?:\s*-\s*.+\n?)+)/im.exec(yaml);
  if (block) {
    tags.push(...block[1].split('\n').map((line) => line.replace(/^\s*-\s*/, '').trim()));
  }
  return tags.map((tag) => tag.replace(/^#/, '')).filter(Boolean);
}

function extractInlineTags(content: string): string[] {
  const tags = new Set<string>();
  for (const match of content.matchAll(/(?:^|[\s(])#([A-Za-z][A-Za-z0-9_-]*)\b/gm)) {
    tags.add(match[1]);
  }
  return [...tags];
}

function extractWikiLinks(content: string): string[] {
  const counts = new Map<string, number>();
  for (const match of content.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g)) {
    const target = match[1].trim();
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([target]) => target);
}

function escapeWikiLinkPart(value: string): string {
  return value.replace(/\]\]/g, ']]\\]');
}

function bestWikiLinkLabel(entry: NavigationEntry): string {
  if (entry.place === 'commands') return entry.title;
  if (entry.title) return entry.title;
  return entry.relPath.replace(/\.(md|markdown)$/i, '');
}

function countValues(values: string[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
}

function retitleMarkdownFile(filePath: string, title: string): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const next = /^#\s+.+$/m.test(content)
    ? content.replace(/^#\s+.+$/m, `# ${title}`)
    : `# ${title}\n\n${content}`;
  fs.writeFileSync(filePath, next, 'utf-8');
}

export function resolveNavigationEntry(target: string): NavigationEntry {
  const raw = target.trim();
  const exact = allNavigationEntries().find((entry) => {
    return entry.relPath === raw
      || entry.path === raw
      || entry.title.toLowerCase() === raw.toLowerCase()
      || entry.relPath.toLowerCase() === `${raw.toLowerCase()}.md`;
  });
  if (exact) return exact;

  const matches = findNavigationEntries(raw, 2);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Ambiguous Field Theory document: ${target}`);
  throw new Error(`Field Theory document not found: ${target}`);
}

export function listNavigationPlaces(): NavigationPlaceSummary[] {
  return navigationPlaces();
}

export function listNavigationEntries(place: NavigationPlace, limit?: number): NavigationEntry[] {
  if (place === 'commands') {
    return listCommandDocuments().map(commandEntry).slice(0, limit);
  }

  if (place === 'recent' || place === 'current') return [];

  const prefixes = PLACE_PREFIXES[place];
  return listLibraryNavigationDocuments({
    limit,
    includeRelPathPrefixes: prefixes,
  }).map((doc) => libraryEntry(doc, place));
}

export function findNavigationEntries(query: string, limit = 20): NavigationEntry[] {
  return allNavigationEntries().filter((entry) => matchesTitleOrPath(entry, query)).slice(0, limit);
}

export function grepNavigationContent(query: string, limit = 20): NavigationSearchResult[] {
  const results: NavigationSearchResult[] = [];
  for (const result of searchLibraryDocuments(query, { limit, excludeDirs: navigationLibraryExcludeDirs() })) {
    results.push({ ...libraryEntry(result), snippet: result.snippet });
  }

  if (results.length >= limit) return results.slice(0, limit);

  const needle = normalizeNeedle(query);
  for (const doc of listCommandDocuments()) {
    if (results.length >= limit) break;
    const content = fs.readFileSync(doc.path, 'utf-8');
    const compact = content.replace(/\s+/g, ' ').trim();
    const index = compact.toLowerCase().indexOf(needle);
    if (index < 0) continue;
    const start = Math.max(0, index - 70);
    const end = Math.min(compact.length, index + needle.length + 110);
    results.push({
      ...commandEntry(doc),
      snippet: `${start > 0 ? '...' : ''}${compact.slice(start, end)}${end < compact.length ? '...' : ''}`,
    });
  }

  return results;
}

export async function readNavigationDocument(target: string): Promise<NavigationEntry & { content: string }> {
  const resolved = resolveMarkdownPath(canonicalLibraryDir(), target) ?? resolveMarkdownPath(canonicalCommandsDir(), target);
  const input = resolved && fs.existsSync(resolved) ? resolved : resolveNavigationEntry(target).path;
  const kind = inferOpenKind(input);
  if (kind === 'command') {
    const doc = await showCommandDocument(input);
    return { ...commandEntry(doc), content: doc.content };
  }

  if (kind === 'library' || kind === null) {
    try {
      const doc = await showLibraryDocument(input);
      return { ...libraryEntry(doc), content: doc.content };
    } catch (error) {
      if (kind === 'library') throw error;
      const doc = await showCommandDocument(input);
      return { ...commandEntry(doc), content: doc.content };
    }
  }

  throw new Error(`Unsupported document target: ${target}`);
}

export async function openNavigationDocument(target: string, options: NavigationOpenOptions = {}): Promise<NavigationOpenResult> {
  const entry = options.query ? findNavigationEntries(options.query, 1)[0] : resolveNavigationEntry(target);
  if (!entry) throw new Error(`No Field Theory document found for query: ${options.query}`);
  const kind = inferOpenKind(entry.path) ?? 'library';
  const openTarget = buildFieldTheoryOpenTarget(entry.path, kind);
  if (openTarget.url && options.action && options.action !== 'open') {
    const url = new URL(openTarget.url);
    url.searchParams.set('action', options.action);
    openTarget.url = url.toString();
  }
  const launch = options.launch !== false ? openFieldTheoryTarget(openTarget) : undefined;
  return {
    path: openTarget.path,
    url: openTarget.url,
    launched: Boolean(launch?.launched),
  };
}

export async function panelNavigationDocument(target: string, options: NavigationOpenOptions = {}): Promise<NavigationOpenResult> {
  if (!target && !options.query) {
    const url = await buildBrowserPanelUrl({ kind: 'library' });
    return {
      path: 'library',
      url,
      launched: false,
    };
  }

  const entry = options.query ? findNavigationEntries(options.query, 1)[0] : resolveNavigationEntry(target);
  if (!entry) throw new Error(`No Field Theory document found for query: ${options.query}`);
  const kind = inferOpenKind(entry.path) ?? 'library';
  const openTarget = buildFieldTheoryPanelOpenTarget(entry.path, kind);
  const url = kind === 'command'
    ? await buildBrowserPanelUrl({ kind: 'command', path: openTarget.path })
    : await buildBrowserPanelUrl({ kind: 'wiki', path: path.relative(canonicalLibraryDir(), openTarget.path).split(path.sep).join('/') });
  return {
    path: openTarget.path,
    url,
    launched: false,
  };
}

export async function appPanelNavigationDocument(target: string, options: NavigationOpenOptions = {}): Promise<NavigationOpenResult> {
  if (!target && !options.query) {
    return {
      path: 'library',
      url: 'fieldtheory://browser-library/open?kind=library',
      launched: false,
    };
  }

  const entry = options.query ? findNavigationEntries(options.query, 1)[0] : resolveNavigationEntry(target);
  if (!entry) throw new Error(`No Field Theory document found for query: ${options.query}`);
  const kind = inferOpenKind(entry.path) ?? 'library';
  const openTarget = buildFieldTheoryPanelOpenTarget(entry.path, kind);
  return {
    path: openTarget.path,
    url: openTarget.url,
    launched: false,
  };
}

export function formatNavigationEntries(entries: NavigationEntry[]): string {
  if (entries.length === 0) return '(none)\n';
  return `${entries.map((entry) => `${entry.relPath}  ${entry.title}`).join('\n')}\n`;
}

export function formatNavigationSearchResults(entries: NavigationSearchResult[]): string {
  if (entries.length === 0) return '(none)\n';
  return `${entries.map((entry) => {
    const firstLine = `${entry.relPath}  ${entry.title}`;
    return entry.snippet ? `${firstLine}\n  ${entry.snippet}` : firstLine;
  }).join('\n')}\n`;
}

export function formatNavigationPlaces(): string {
  return `${listNavigationPlaces().map((place) => `${place.name}  ${place.description}`).join('\n')}\n`;
}

export function formatNavigationTree(limit = 80): string {
  const entries = listLibraryNavigationDocuments({ limit }).map((doc) => doc.relPath);
  if (entries.length === 0) return '(none)\n';
  return `${entries.join('\n')}\n`;
}

export function formatNavigationHead(content: string, lines = 40): string {
  return `${content.split('\n').slice(0, lines).join('\n')}\n`;
}

export function formatNavigationMeta(entry: NavigationEntry): string {
  const content = fs.readFileSync(entry.path, 'utf-8');
  const tags = [...new Set([...parseFrontmatterTags(content), ...extractInlineTags(content)])].sort();
  const links = extractWikiLinks(content);
  return [
    `title: ${entry.title}`,
    `place: ${entry.place}`,
    `path: ${entry.path}`,
    `relPath: ${entry.relPath}`,
    `updatedAt: ${entry.updatedAt}`,
    `size: ${entry.size}`,
    `tags: ${tags.length ? tags.join(', ') : '(none)'}`,
    `links: ${links.length ? links.join(', ') : '(none)'}`,
    '',
  ].join('\n');
}

export function formatNavigationPwd(): string {
  try {
    const context = readCurrentDocumentSummary();
    const source = context.activeDocument.path ?? context.activeDocument.contentPath;
    return `${context.activeDocument.title ?? '(untitled)'}\n${source}\n`;
  } catch {
    return `Library\n${canonicalLibraryDir()}\n`;
  }
}

export function formatNavigationContext(repoPath = process.cwd(), limit = 8): string {
  const lines = ['# Field Theory Context', ''];
  try {
    const context = readCurrentDocumentSummary();
    lines.push(`current: ${context.activeDocument.title ?? '(untitled)'}`);
    lines.push(`source: ${context.activeDocument.path ?? '(unknown)'}`);
    lines.push(`manifest: ${context.manifestPath}`);
  } catch (error) {
    lines.push(`current: ${(error as Error).message}`);
  }
  lines.push('');
  lines.push(formatAgentContext(getAgentContext(repoPath, limit)).trimEnd());
  lines.push('');
  return lines.join('\n');
}

export async function createNavigationDocument(type: string, title: string, input: NavigationWriteInput = {}): Promise<NavigationEntry> {
  const normalizedType = type.trim().toLowerCase();
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error('Title is required.');
  if (normalizedType === 'command') {
    const doc = await createCommandDocument(slugTitle(cleanTitle), input);
    return commandEntry(doc);
  }
  const folderByType: Record<string, string> = {
    brief: 'briefs',
    scratchpad: 'Scratchpad',
    wiki: 'wikis',
    debate: 'debates',
  };
  const placeByType: Record<string, NavigationPlace> = {
    brief: 'briefs',
    scratchpad: 'scratchpad',
    wiki: 'wikis',
    debate: 'debates',
  };
  const folder = folderByType[normalizedType];
  if (!folder) throw new Error(`Unknown Field Theory document type: ${type}`);
  const target = path.posix.join(folder, slugTitle(cleanTitle));
  const content = input.content ?? `# ${cleanTitle}\n`;
  const doc = await createLibraryDocument(target, { ...input, content, title: cleanTitle });
  return libraryEntry(doc, placeByType[normalizedType]);
}

export async function appendNavigationDocument(target: string, input: NavigationWriteInput): Promise<NavigationEntry & { version: ReturnType<typeof readDocumentVersion> }> {
  const entry = resolveNavigationEntry(target);
  const content = await readContentInput({ stdin: input.stdin, file: input.file, fallback: input.content });
  if (!content) throw new Error('Append content is required. Pass text, --stdin, or --file.');
  fs.appendFileSync(entry.path, content.endsWith('\n') ? content : `${content}\n`, 'utf-8');
  return { ...entry, version: readDocumentVersion(entry.path) };
}

export async function createNavigationNote(text: string, title?: string): Promise<NavigationEntry & { version: ReturnType<typeof readDocumentVersion> }> {
  const target = path.posix.join('Scratchpad', `${todayIsoDate()}.md`);
  const filePath = resolveMarkdownPath(canonicalLibraryDir(), target);
  if (!filePath) throw new Error(`Invalid scratchpad note path: ${target}`);
  const heading = title?.trim() || `Scratchpad ${todayIsoDate()}`;
  if (!fs.existsSync(filePath)) {
    await createLibraryDocument(target, { content: `# ${heading}\n\n` });
  }
  const entry = resolveNavigationEntry(target);
  fs.appendFileSync(filePath, `${text.trim()}\n`, 'utf-8');
  return { ...entry, version: readDocumentVersion(filePath) };
}

export async function renameNavigationDocument(target: string, nextTitle: string): Promise<NavigationEntry> {
  const entry = resolveNavigationEntry(target);
  const cleanTitle = nextTitle.trim();
  if (!cleanTitle) throw new Error('New title is required.');
  if (entry.place === 'commands') {
    const doc = await renameCommandDocument(entry.path, slugTitle(cleanTitle));
    retitleMarkdownFile(doc.path, cleanTitle);
    return commandEntry(doc);
  }
  const folder = path.posix.dirname(entry.relPath);
  const nextPath = path.posix.join(folder === '.' ? '' : folder, slugTitle(cleanTitle));
  const doc = await renameLibraryDocument(entry.path, nextPath);
  retitleMarkdownFile(doc.path, cleanTitle);
  return libraryEntry(doc, entry.place as NavigationPlace);
}

export function listNavigationLinks(target: string): NavigationLink[] {
  const entry = resolveNavigationEntry(target);
  const content = fs.readFileSync(entry.path, 'utf-8');
  return countValues(extractWikiLinks(content)).map(({ value, count }) => ({ target: value, count }));
}

export function buildNavigationWikiLink(target: string, alias?: string): NavigationWikiLink {
  const entry = resolveNavigationEntry(target);
  const label = bestWikiLinkLabel(entry);
  const link = alias?.trim()
    ? `[[${escapeWikiLinkPart(label)}|${escapeWikiLinkPart(alias.trim())}]]`
    : `[[${escapeWikiLinkPart(label)}]]`;
  return { target: label, link, label, entry };
}

export function listNavigationBacklinks(target: string): NavigationSearchResult[] {
  const entry = resolveNavigationEntry(target);
  const needles = new Set([entry.title, entry.relPath, entry.relPath.replace(/\.(md|markdown)$/i, '')]);
  return allNavigationEntries()
    .filter((candidate) => candidate.path !== entry.path)
    .filter((candidate) => {
      const links = extractWikiLinks(fs.readFileSync(candidate.path, 'utf-8'));
      return links.some((link) => needles.has(link));
    });
}

export function listNavigationTags(): NavigationTag[] {
  const tags: string[] = [];
  for (const entry of allNavigationEntries()) {
    const content = fs.readFileSync(entry.path, 'utf-8');
    tags.push(...parseFrontmatterTags(content), ...extractInlineTags(content));
  }
  return countValues(tags).map(({ value, count }) => ({ tag: value, count }));
}

export function listNavigationTagged(tag: string): NavigationEntry[] {
  const needle = tag.trim().replace(/^#/, '').toLowerCase();
  return allNavigationEntries().filter((entry) => {
    const content = fs.readFileSync(entry.path, 'utf-8');
    const tags = [...parseFrontmatterTags(content), ...extractInlineTags(content)];
    return tags.some((candidate) => candidate.toLowerCase() === needle);
  });
}

export function cdNavigation(target: string): NavigationState {
  const state = readNavState();
  const destination = listNavigationPlaces().some((place) => place.name === target)
    ? target
    : resolveNavigationEntry(target).relPath;
  writeNavState({ current: destination, backStack: [state.current, ...state.backStack].slice(0, 25) });
  return readNavState();
}

export function backNavigation(): NavigationState {
  const state = readNavState();
  const [previous, ...rest] = state.backStack;
  if (!previous) return state;
  writeNavState({ current: previous, backStack: rest });
  return readNavState();
}

export function formatNavigationState(state: NavigationState): string {
  return `current: ${state.current}\nback: ${state.backStack[0] ?? '(none)'}\n`;
}

export function formatNavigationLinks(links: NavigationLink[]): string {
  if (links.length === 0) return '(none)\n';
  return `${links.map((link) => `${link.target}  ${link.count}`).join('\n')}\n`;
}

export function formatNavigationTags(tags: NavigationTag[]): string {
  if (tags.length === 0) return '(none)\n';
  return `${tags.map((tag) => `${tag.tag}  ${tag.count}`).join('\n')}\n`;
}
