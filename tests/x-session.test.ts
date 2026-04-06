import test from 'node:test';
import assert from 'node:assert/strict';
import { buildXHeaders, createXSessionContext, DEFAULT_X_USER_AGENT } from '../src/x-session.js';

test('buildXHeaders includes cookie auth and csrf headers', () => {
  const headers = buildXHeaders(
    { csrfToken: 'csrf-123', cookieHeader: 'ct0=csrf-123; auth_token=token-456' },
    { userAgent: 'TestAgent/1.0', contentType: 'application/json' },
  );

  assert.equal(headers.authorization.includes('Bearer '), true);
  assert.equal(headers['x-csrf-token'], 'csrf-123');
  assert.equal(headers.cookie, 'ct0=csrf-123; auth_token=token-456');
  assert.equal(headers['user-agent'], 'TestAgent/1.0');
  assert.equal(headers['content-type'], 'application/json');
});

test('createXSessionContext honors direct token overrides and custom transaction generator', () => {
  const generator = { generate: async () => 'txid-123' };
  const context = createXSessionContext({
    csrfToken: 'csrf-abc',
    cookieHeader: 'ct0=csrf-abc; auth_token=token-def',
    transactionIdGenerator: generator,
  });

  assert.equal(context.csrfToken, 'csrf-abc');
  assert.equal(context.cookieHeader, 'ct0=csrf-abc; auth_token=token-def');
  assert.equal(context.transactionIdGenerator, generator);
  assert.equal(context.userAgent, DEFAULT_X_USER_AGENT);
});
