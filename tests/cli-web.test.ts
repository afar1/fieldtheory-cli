import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

test('ft web starts the local server and prints a URL', async () => {
  const staticDir = await mkdtemp(path.join(os.tmpdir(), 'ft-web-dist-'));
  await writeFile(
    path.join(staticDir, 'index.html'),
    '<!doctype html><html><body><div id="root">ok</div></body></html>',
    'utf8',
  );

  const tsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const child = spawn(tsx, ['src/cli.ts', 'web', '--port', '0'], {
    cwd: process.cwd(),
    env: { ...process.env, FT_WEB_DIST_DIR: staticDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';

  try {
    const url = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for web server output')), 5000);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        const match = stdout.match(/URL:\s+(http:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]);
        }
      });

      child.once('error', reject);
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`web command exited early with code ${code}\n${stdout}`));
      });
    });

    const response = await fetch(url);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<div id="root">ok<\/div>/);
  } finally {
    child.kill('SIGINT');
    await new Promise((resolve) => child.once('exit', resolve));
    await rm(staticDir, { recursive: true, force: true });
  }
});
