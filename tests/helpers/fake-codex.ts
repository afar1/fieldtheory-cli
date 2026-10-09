import fs from 'node:fs';
import path from 'node:path';

/** Fake Codex CLI exercises classification through a real child process. */
export function fakeCodex(dir: string, execute: string): string {
  const bin = path.join(dir, 'codex');
  fs.writeFileSync(bin, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(path.join(dir, 'calls.jsonl'))}, JSON.stringify(args) + '\\n');
${execute}
`, { mode: 0o700 });
  return bin;
}
