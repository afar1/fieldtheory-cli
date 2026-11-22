import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';

test('Undici rejects excessive content encodings without an unhandled stream error', async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      'content-encoding': Array(6).fill('gzip').join(', '),
      'content-length': '1',
    });
    response.flushHeaders();
    response.socket?.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  const url = `http://127.0.0.1:${address.port}`;
  const script = `
    const { Agent, fetch } = require('undici');
    const dispatcher = new Agent();
    (async () => {
      try {
        await fetch(${JSON.stringify(url)}, { dispatcher, signal: AbortSignal.timeout(5000) });
        process.exitCode = 2;
      } catch (error) {
        if (!(error instanceof TypeError) || !/too many content-encodings/.test(String(error.cause))) {
          console.error(error);
          process.exitCode = 3;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
      try { await dispatcher.destroy(); } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    })();
  `;
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk; });
  const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ code: null, signal: 'SIGKILL' });
    }, 7000);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
  assert.equal(outcome.code, 0, stderr || `child exited with ${outcome.signal}`);
});
