import test from 'node:test';
import assert from 'node:assert/strict';

async function getIdeasLatest() {
  return import('../src/ideas-latest.js');
}

test('buildIdeasLatestPointers exposes latest ids and status counts', async () => {
  const { buildIdeasLatestPointers } = await getIdeasLatest();
  const latest = buildIdeasLatestPointers();

  assert.match(latest.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(typeof latest.status.seedCount, 'number');
  assert.equal(typeof latest.status.runCount, 'number');
  assert.equal(typeof latest.status.theoryCount, 'number');
});
