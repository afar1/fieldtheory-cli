import type { Database, SqlJsStatic } from 'sql.js';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

let sqlPromise: Promise<SqlJsStatic> | undefined;

function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const initSqlJs = require('sql.js-fts5') as (opts: any) => Promise<SqlJsStatic>;
    const wasmPath = require.resolve('sql.js-fts5/dist/sql-wasm.wasm');
    const wasmBinary = fs.readFileSync(wasmPath);
    sqlPromise = initSqlJs({ wasmBinary });
  }
  return sqlPromise!;
}

export async function openDb(filePath: string): Promise<Database> {
  const SQL = await getSql();
  if (fs.existsSync(filePath)) {
    const buf = fs.readFileSync(filePath);
    return new SQL.Database(buf);
  }
  return new SQL.Database();
}

export async function createDb(): Promise<Database> {
  const SQL = await getSql();
  return new SQL.Database();
}

export function saveDb(db: Database, filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = db.export();
  const tmp = filePath + '.tmp';

  // Crash-durable write: openSync → writeSync → fsyncSync → close → rename → fsync parent dir.
  // On power loss, the target file either has the old content or the full new content —
  // never a zero-byte or partially-written bookmarks.db.
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeSync(fd, Buffer.from(data));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);

  try {
    const dirFd = fs.openSync(dir, 'r');
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {
    // Windows can't open a dir for fsync — the file fsync above is the critical guarantee.
  }
}
