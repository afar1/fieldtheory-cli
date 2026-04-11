import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBookmarkPage } from '../src/bookmarks.js';

test('normalizeBookmarkPage: does not treat tweet creation time as bookmark time', () => {
  const records = normalizeBookmarkPage({
    data: [{
      id: '123',
      text: 'Hello world',
      author_id: '42',
      created_at: '2026-04-01T12:00:00.000Z',
      entities: {
        urls: [{ expanded_url: 'https://example.com', url: 'https://t.co/abc' }],
      },
    }],
    includes: {
      users: [{ id: '42', username: 'testuser', name: 'Test User' }],
    },
  }, '2026-04-08T00:00:00.000Z');

  assert.equal(records.length, 1);
  assert.equal(records[0].postedAt, undefined);
  assert.equal(records[0].bookmarkedAt, null);
  assert.equal(records[0].syncedAt, '2026-04-08T00:00:00.000Z');
  assert.deepEqual(records[0].links, ['https://example.com']);
});
