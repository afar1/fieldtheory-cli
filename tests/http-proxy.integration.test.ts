import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { connect, type Socket } from 'node:net';
import { Agent, fetch as undiciFetch, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { configureHttpProxyFromEnv } from '../src/http-proxy.js';

async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return address.port;
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('environment proxy dispatcher works with Node fetch and NO_PROXY', async (t) => {
  const keys = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy'];
  const savedEnv = keys.map((key) => [key, process.env[key]] as const);
  const savedDispatcher = getGlobalDispatcher();
  const directDispatcher = new Agent();
  const sockets = new Set<Socket>();
  const targets: string[] = [];
  const origin = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ path: request.url }));
  });
  const proxy = createServer();
  proxy.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  setGlobalDispatcher(directDispatcher);
  t.after(async () => {
    setGlobalDispatcher(savedDispatcher);
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await directDispatcher.destroy();
    for (const socket of sockets) socket.destroy();
    await Promise.all([close(origin), close(proxy)]);
  });

  const originPort = await listen(origin);
  // This proxy can only connect to the local synthetic origin.
  proxy.on('connect', (request, client, head) => {
    targets.push(request.url ?? '');
    const upstream = connect(originPort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    sockets.add(upstream);
    upstream.once('close', () => sockets.delete(upstream));
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  const proxyUrl = `http://127.0.0.1:${await listen(proxy)}`;
  const cases = [
    { name: 'no proxy', env: {}, configured: false, proxied: false },
    { name: 'HTTP_PROXY', env: { HTTP_PROXY: proxyUrl }, configured: true, proxied: true },
    { name: 'http_proxy', env: { http_proxy: proxyUrl }, configured: true, proxied: true },
    { name: 'NO_PROXY bypass', env: { HTTP_PROXY: proxyUrl, NO_PROXY: '127.0.0.1' }, configured: true, proxied: false },
    { name: 'no_proxy bypass', env: { http_proxy: proxyUrl, no_proxy: '127.0.0.1' }, configured: true, proxied: false },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      for (const key of keys) delete process.env[key];
      Object.assign(process.env, scenario.env);
      targets.length = 0;
      try {
        assert.equal(configureHttpProxyFromEnv(), scenario.configured);
        const response = await fetch(`http://127.0.0.1:${originPort}/fixture?synthetic=1`, {
          signal: AbortSignal.timeout(5000),
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { path: '/fixture?synthetic=1' });
        assert.deepEqual(targets, scenario.proxied ? [`127.0.0.1:${originPort}`] : []);
      } finally {
        const dispatcher = getGlobalDispatcher();
        setGlobalDispatcher(directDispatcher);
        if (dispatcher !== directDispatcher) await dispatcher.destroy();
      }
    });
  }
});

test('npm Undici rejects excessive content encodings without an unhandled stream error', async (t) => {
  const dispatcher = new Agent();
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      'content-encoding': Array(6).fill('gzip').join(', '),
      'content-length': '1',
    });
    response.flushHeaders();
    response.socket?.end();
  });
  t.after(async () => {
    await dispatcher.destroy();
    server.closeAllConnections();
    await close(server);
  });
  const port = await listen(server);
  // GHSA-xjj6-f33q-929c: a truncated response used to error an orphaned stream
  // after fetch had already rejected, terminating the process.
  await assert.rejects(undiciFetch(`http://127.0.0.1:${port}`, {
    dispatcher,
    signal: AbortSignal.timeout(5000),
  }), (error: unknown) => {
    assert.ok(error instanceof TypeError);
    assert.match(String(error.cause), /too many content-encodings/);
    return true;
  });
});
