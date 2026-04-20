import test from 'node:test';
import assert from 'node:assert/strict';
import { configureHttpProxyFromEnv, hasProxyEnv } from '../src/http-proxy.js';

test('hasProxyEnv: detects uppercase and lowercase proxy environment variables', () => {
  assert.equal(hasProxyEnv({ HTTPS_PROXY: 'http://proxy.local:8080' } as NodeJS.ProcessEnv), true);
  assert.equal(hasProxyEnv({ all_proxy: 'socks5://proxy.local:1080' } as NodeJS.ProcessEnv), true);
});

test('hasProxyEnv: ignores empty proxy environment variables', () => {
  assert.equal(hasProxyEnv({ HTTPS_PROXY: '   ' } as NodeJS.ProcessEnv), false);
  assert.equal(hasProxyEnv({ NO_PROXY: 'x.com' } as NodeJS.ProcessEnv), false);
});

test('configureHttpProxyFromEnv: does nothing when no proxy env is set', () => {
  let created = 0;
  let dispatched = 0;

  const configured = configureHttpProxyFromEnv({
    env: {},
    createAgent: () => {
      created += 1;
      return {};
    },
    setDispatcher: () => {
      dispatched += 1;
    },
  });

  assert.equal(configured, false);
  assert.equal(created, 0);
  assert.equal(dispatched, 0);
});

test('configureHttpProxyFromEnv: installs dispatcher when proxy env is set', () => {
  const agent = { kind: 'proxy-agent' };
  let received: unknown;

  const configured = configureHttpProxyFromEnv({
    env: { HTTP_PROXY: 'http://proxy.local:8080', NO_PROXY: 'localhost,127.0.0.1' } as NodeJS.ProcessEnv,
    createAgent: () => agent,
    setDispatcher: (dispatcher) => {
      received = dispatcher;
    },
  });

  assert.equal(configured, true);
  assert.equal(received, agent);
});
