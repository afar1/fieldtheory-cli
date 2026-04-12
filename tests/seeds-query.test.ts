import test from 'node:test';
import assert from 'node:assert/strict';

async function getSeedsQuery() {
  return import('../src/seeds-query.js');
}

test('buildDateWindow returns an ISO after timestamp when days are provided', async () => {
  const { buildDateWindow } = await getSeedsQuery();
  const result = buildDateWindow(7);

  assert.ok(result.after);
  assert.match(result.after!, /^\d{4}-\d{2}-\d{2}T/);
});

test('buildDateWindow returns empty object for invalid days', async () => {
  const { buildDateWindow } = await getSeedsQuery();
  assert.deepEqual(buildDateWindow(undefined), {});
  assert.deepEqual(buildDateWindow(0), {});
  assert.deepEqual(buildDateWindow(-3), {});
});

test('formatSeedCandidates renders a compact readable list', async () => {
  const { formatSeedCandidates } = await getSeedsQuery();
  const output = formatSeedCandidates([
    {
      id: '123',
      text: 'A bookmark about agent reliability and memory systems',
      url: 'https://x.com/example/status/123',
      authorHandle: 'afar0x',
      postedAt: '2026-04-01T00:00:00.000Z',
      category: 'tool',
      domain: 'ai',
    },
  ]);

  assert.ok(output.includes('123'));
  assert.ok(output.includes('@afar0x'));
  assert.ok(output.includes('tool'));
  assert.ok(output.includes('agent reliability'));
});

test('formatSeedCandidates handles empty results cleanly', async () => {
  const { formatSeedCandidates } = await getSeedsQuery();
  assert.equal(formatSeedCandidates([]), 'No candidate bookmarks found.');
});
