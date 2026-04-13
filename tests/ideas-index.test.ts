import test from 'node:test';
import assert from 'node:assert/strict';

async function getIdeasIndex() {
  return import('../src/ideas-index.js');
}

test('buildIdeasIndex shape includes seeds, runs, and nodes arrays', async () => {
  const { buildIdeasIndex } = await getIdeasIndex();
  const index = buildIdeasIndex();

  assert.ok(Array.isArray(index.seeds));
  assert.ok(Array.isArray(index.runs));
  assert.ok(Array.isArray(index.nodes));
  assert.match(index.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
