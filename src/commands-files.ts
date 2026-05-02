import fs from 'node:fs';
import path from 'node:path';
import { canonicalCommandsDir } from './paths.js';
import {
  createMarkdownFile,
  DocumentVersion,
  moveToTrash,
  normalizeMarkdownFileName,
  readContentInput,
  readMarkdownDocument,
  relativeMarkdownPath,
  renameMarkdownFile,
  resolveMarkdownPath,
  TrashedDocument,
  updateMarkdownFile,
} from './document-ops.js';

export interface CommandDocumentSummary {
  path: string;
  relPath: string;
  name: string;
  updatedAt: string;
  size: number;
}

export interface CommandDocument extends CommandDocumentSummary {
  content: string;
  version: DocumentVersion;
}

export interface CommandValidationResult {
  path: string;
  relPath: string;
  ok: boolean;
  issues: string[];
}

export interface CommandWriteInput {
  stdin?: boolean;
  file?: string;
  content?: string;
}

export interface CommandUpdateInput extends CommandWriteInput {
  expectedSha256?: string;
  force?: boolean;
}

function commandsRoot(): string {
  return canonicalCommandsDir();
}

function resolveCommandPath(target: string): string {
  const fileName = normalizeMarkdownFileName(target, { rejectLeadingUnderscore: true });
  const resolved = fileName
    ? path.join(commandsRoot(), fileName)
    : resolveMarkdownPath(commandsRoot(), target);
  if (!resolved) throw new Error(`Invalid command path: ${target}`);
  return resolved;
}

function commandNameFromPath(filePath: string): string {
  return path.basename(filePath).replace(/\.(md|markdown)$/i, '');
}

function summaryForFile(filePath: string): CommandDocumentSummary {
  const stats = fs.statSync(filePath);
  return {
    path: filePath,
    relPath: relativeMarkdownPath(commandsRoot(), filePath),
    name: commandNameFromPath(filePath),
    updatedAt: new Date(stats.mtimeMs).toISOString(),
    size: stats.size,
  };
}

function walkCommandFiles(): string[] {
  if (!fs.existsSync(commandsRoot())) return [];
  return fs.readdirSync(commandsRoot(), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(md|markdown)$/i.test(entry.name) && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
    .map((entry) => path.join(commandsRoot(), entry.name))
    .sort();
}

function defaultCommandContent(name: string): string {
  return [
    `# ${name}`,
    '',
    'Describe what this command does in one clear sentence.',
    '',
    'Use this when ...',
    '',
    '## Steps',
    '',
    '1. Do the first concrete thing.',
    '2. Do the second concrete thing.',
    '3. Verify the result.',
    '',
    '## Guardrails',
    '',
    '- Do not include secrets.',
    '- Ask before destructive actions.',
    '',
    '## Verification',
    '',
    '- Confirm the intended result is visible or testable.',
    '',
  ].join('\n');
}

export function listCommandDocuments(): CommandDocumentSummary[] {
  return walkCommandFiles().map((filePath) => summaryForFile(filePath));
}

export async function showCommandDocument(target: string): Promise<CommandDocument> {
  const filePath = resolveCommandPath(target);
  const { content, version } = await readMarkdownDocument(filePath);
  return { ...summaryForFile(filePath), content, version };
}

export async function createCommandDocument(name: string, input: CommandWriteInput): Promise<CommandDocument> {
  const fileName = normalizeMarkdownFileName(name, { rejectLeadingUnderscore: true });
  if (!fileName) throw new Error(`Invalid command name: ${name}`);
  const filePath = path.join(commandsRoot(), fileName);
  const stem = commandNameFromPath(filePath);
  const content = await readContentInput({
    stdin: input.stdin,
    file: input.file,
    fallback: input.content ?? defaultCommandContent(stem),
  });
  await createMarkdownFile(filePath, content);
  return showCommandDocument(filePath);
}

export async function updateCommandDocument(target: string, input: CommandUpdateInput): Promise<CommandDocument> {
  const filePath = resolveCommandPath(target);
  const content = await readContentInput({ stdin: input.stdin, file: input.file, fallback: input.content });
  await updateMarkdownFile(filePath, content, {
    expectedSha256: input.expectedSha256,
    force: input.force,
  });
  return showCommandDocument(filePath);
}

export async function renameCommandDocument(target: string, nextName: string): Promise<CommandDocument> {
  const oldPath = resolveCommandPath(target);
  const fileName = normalizeMarkdownFileName(nextName, { rejectLeadingUnderscore: true });
  if (!fileName) throw new Error(`Invalid command name: ${nextName}`);
  const newPath = path.join(commandsRoot(), fileName);
  await renameMarkdownFile(oldPath, newPath);
  return showCommandDocument(newPath);
}

export function deleteCommandDocument(target: string): TrashedDocument {
  return moveToTrash(resolveCommandPath(target));
}

export function validateCommandContent(content: string): string[] {
  const issues: string[] = [];
  if (!/^#\s+\S/m.test(content)) issues.push('Missing top-level heading.');
  if (!/\bUse this when\b/i.test(content)) issues.push('Missing "Use this when" guidance.');
  if (!/^##\s+Steps\b/im.test(content)) issues.push('Missing ## Steps section.');
  if (!/^##\s+(Guardrails|Safety)\b/im.test(content)) issues.push('Missing ## Guardrails or ## Safety section.');
  if (!/(verify|verification|confirm|test)/i.test(content)) issues.push('Missing concrete verification guidance.');
  if (/(api[_-]?key|secret|token)\s*[:=]\s*\S+/i.test(content)) issues.push('Possible secret-like value present.');
  return issues;
}

export function validateCommandDocument(target?: string): CommandValidationResult[] {
  const paths = target ? [resolveCommandPath(target)] : walkCommandFiles();
  return paths.map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    const issues = validateCommandContent(content);
    return {
      path: filePath,
      relPath: relativeMarkdownPath(commandsRoot(), filePath),
      ok: issues.length === 0,
      issues,
    };
  });
}
