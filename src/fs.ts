import { access, appendFile, mkdir, readFile, readdir, writeFile, rename, open } from 'node:fs/promises';
import path from 'node:path';

interface WriteOptions {
  mode?: number;
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

/**
 * Crash-durable atomic write: write to tmp → fsync file → rename → fsync parent dir.
 * On power loss, the target file either has the old content or the full new content —
 * never zero-byte or partially-written.
 */
async function writeFileDurable(filePath: string, content: string, mode: number): Promise<void> {
  const tmp = filePath + '.tmp';
  const handle = await open(tmp, 'w', mode);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, filePath);
  // fsync the parent directory so the rename itself is durable.
  const parent = path.dirname(filePath);
  try {
    const dirHandle = await open(parent, 'r');
    try {
      await dirHandle.sync();
    } finally {
      await dirHandle.close();
    }
  } catch {
    // Some platforms (Windows) can't open a dir for fsync. The file fsync
    // above is still the critical durability guarantee.
  }
}

export async function writeJson(filePath: string, value: unknown, options: WriteOptions = {}): Promise<void> {
  await writeFileDurable(filePath, JSON.stringify(value, null, 2), options.mode ?? 0o600);
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function writeJsonLines(filePath: string, rows: unknown[], options: WriteOptions = {}): Promise<void> {
  const content = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  await writeFileDurable(filePath, content, options.mode ?? 0o600);
}

export async function readJsonLines<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  } catch {
    return [];
  }
}

// ── Markdown helpers ─────────────────────────────────────────────────────

export async function writeMd(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFileDurable(filePath, content, 0o644);
}

export async function readMd(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8');
}

export async function appendLine(filePath: string, line: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const nl = line.endsWith('\n') ? line : line + '\n';
  await appendFile(filePath, nl, 'utf8');
}
