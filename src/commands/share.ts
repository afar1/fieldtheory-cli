import type { Command } from 'commander';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { findContact } from '../contacts.js';
import { normalizeEmail, requireFieldTheorySession } from '../fieldtheory-session.js';
import { stringifyFrontmatter } from '../frontmatter.js';
import { mdDir } from '../paths.js';

interface ShareOptions {
  to?: string[];
  cc?: string[];
  folder?: string;
  title?: string;
  stdin?: boolean;
  file?: string;
  body?: string;
  json?: boolean;
}

interface ShareResult {
  id: string;
  path: string;
  title: string;
  from: string;
  to: string[];
  cc: string[];
  created_at: string;
  updated_at: string;
}

class ContactResolutionError extends Error {
  unresolved: string[];

  constructor(unresolved: string[]) {
    super(`Could not resolve contact: ${unresolved.join(', ')}`);
    this.name = 'ContactResolutionError';
    this.unresolved = unresolved;
  }
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function slugSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeBase32(bytes: Uint8Array, length: number): string {
  let bits = 0;
  let bitLength = 0;
  let output = '';

  for (const byte of bytes) {
    bits = (bits << 8) | byte;
    bitLength += 8;
    while (bitLength >= 5 && output.length < length) {
      output += CROCKFORD_BASE32[(bits >> (bitLength - 5)) & 31];
      bitLength -= 5;
    }
  }

  if (output.length < length && bitLength > 0) {
    output += CROCKFORD_BASE32[(bits << (5 - bitLength)) & 31];
  }

  return output.padEnd(length, '0').slice(0, length);
}

function generateUlid(nowMs = Date.now()): string {
  const timestamp = Buffer.alloc(6);
  timestamp.writeUIntBE(nowMs, 0, 6);
  return `${encodeBase32(timestamp, 10)}${encodeBase32(crypto.randomBytes(10), 16)}`;
}

function folderParts(folder?: string): string[] {
  const raw = folder?.trim() || 'inbox';
  const parts = raw.split(/[\\/]+/).map(slugSegment).filter(Boolean);
  if (parts.length === 0) throw new Error(`Invalid folder: ${folder}`);
  return parts;
}

function titleFromBody(body: string): string {
  const firstLine = body.split('\n').map((line) => line.trim()).find(Boolean);
  return firstLine?.replace(/^#+\s*/, '').slice(0, 80) || 'Untitled';
}

function hasTopHeading(body: string): boolean {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    return /^#\s+/.test(trimmed);
  }
  return false;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function readShareBody(options: ShareOptions): Promise<string> {
  const sourceCount = [options.stdin, options.file != null, options.body != null].filter(Boolean).length;
  if (sourceCount !== 1) {
    throw new Error('Choose exactly one of --stdin, --file, or --body.');
  }

  if (options.stdin) return readStdin();
  if (options.file != null) return fs.readFile(options.file, 'utf-8');
  return String(options.body);
}

async function resolveRecipients(values: string[] = []): Promise<{ emails: string[]; unresolved: string[] }> {
  const emails: string[] = [];
  const unresolved: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    if (trimmed.includes('@')) {
      emails.push(normalizeEmail(trimmed));
      continue;
    }

    const contact = findContact(trimmed);
    if (contact) emails.push(contact.email);
    else unresolved.push(trimmed);
  }

  return {
    emails: [...new Set(emails)],
    unresolved,
  };
}

async function writeSharedDocument(options: ShareOptions): Promise<ShareResult> {
  const session = requireFieldTheorySession();
  const [toResult, ccResult, body] = await Promise.all([
    resolveRecipients(options.to),
    resolveRecipients(options.cc),
    readShareBody(options),
  ]);
  const unresolved = [...toResult.unresolved, ...ccResult.unresolved];
  if (unresolved.length > 0) throw new ContactResolutionError(unresolved);
  if (toResult.emails.length === 0) throw new Error('At least one --to recipient is required.');

  const cleanBody = body.trim();
  if (!cleanBody) throw new Error('Share body is empty.');

  const id = generateUlid();
  const createdAt = new Date().toISOString();
  const title = options.title?.trim() || titleFromBody(cleanBody);
  const filename = `${createdAt.slice(0, 10)}-${slugSegment(title) || 'untitled'}-${id.slice(0, 8)}.md`;
  const dir = path.join(mdDir(), 'shared', ...folderParts(options.folder));
  const filePath = path.join(dir, filename);
  const markdownBody = hasTopHeading(cleanBody) ? `${cleanBody}\n` : `# ${title}\n\n${cleanBody}\n`;
  const frontmatter = {
    id,
    title,
    from: session.email,
    to: toResult.emails,
    cc: ccResult.emails,
    created_at: createdAt,
    updated_at: createdAt,
  };

  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, stringifyFrontmatter(frontmatter, markdownBody), { encoding: 'utf-8', mode: 0o600 });

  return {
    id,
    path: filePath,
    title,
    from: session.email,
    to: toResult.emails,
    cc: ccResult.emails,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function printError(err: unknown): void {
  if (err instanceof ContactResolutionError) {
    for (const recipient of err.unresolved) {
      console.error(`RESOLVE_CONTACT ${JSON.stringify({ recipient, reason: 'not_found' })}`);
    }
    process.exitCode = 1;
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n  Error: ${message}\n`);
  process.exitCode = 1;
}

export function registerShareCommand(program: Command): void {
  program
    .command('share')
    .description('Create a tagged markdown doc from your Field Theory identity')
    .option('--to <recipient>', 'Recipient email or contact name', collect, [])
    .option('--cc <recipient>', 'CC email or contact name', collect, [])
    .option('--folder <name>', 'Shared docs folder', 'inbox')
    .option('--title <title>', 'Document title')
    .option('--stdin', 'Read body from stdin')
    .option('--file <path>', 'Read body from a file')
    .option('--body <text>', 'Use inline body text')
    .option('--json', 'JSON output')
    .action(async (options: ShareOptions) => {
      try {
        const result = await writeSharedDocument(options);
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(result.path);
      } catch (err) {
        printError(err);
      }
    });
}
