import test from 'node:test';
import assert from 'node:assert/strict';

async function getStrategies() {
  return import('../src/seeds-strategies.js');
}

test('normalizeSeedFilters trims strings and drops empties', async () => {
  const { normalizeSeedFilters } = await getStrategies();
  const normalized = normalizeSeedFilters({
    query: '  agents  ',
    category: ' ',
    domain: ' ai ',
    limit: 5,
  });

  assert.deepEqual(normalized, {
    query: 'agents',
    domain: 'ai',
    limit: 5,
  });
});

test('inferSeedStrategy prefers search when query is present', async () => {
  const { inferSeedStrategy } = await getStrategies();
  assert.equal(inferSeedStrategy({ query: 'memory' }), 'search');
});

test('inferSeedStrategy falls back to recent for time filters', async () => {
  const { inferSeedStrategy } = await getStrategies();
  assert.equal(inferSeedStrategy({ days: 30 }), 'recent');
  assert.equal(inferSeedStrategy({ after: '2026-01-01' }), 'recent');
});

test('inferSeedStrategy falls back to filtered when no special filters exist', async () => {
  const { inferSeedStrategy } = await getStrategies();
  assert.equal(inferSeedStrategy({ category: 'tool' }), 'filtered');
  assert.equal(inferSeedStrategy({}), 'filtered');
});

test('buildSeedStrategySpec normalizes filters and chooses inferred strategy', async () => {
  const { buildSeedStrategySpec } = await getStrategies();
  const spec = buildSeedStrategySpec({ filters: { query: ' evals ', limit: 8 } });

  assert.equal(spec.strategy, 'search');
  assert.deepEqual(spec.filters, { query: 'evals', limit: 8 });
});

test('summarizeSeedIntent produces readable compact summaries', async () => {
  const { summarizeSeedIntent } = await getStrategies();
  const summary = summarizeSeedIntent('Recent seed', {
    category: 'tool',
    domain: 'ai',
    days: 30,
    limit: 5,
  });

  assert.equal(summary, 'Recent seed — category:tool · domain:ai · last 30d · limit:5');
});

test('generateRandomSeedPrompts returns unique playful phrases', async () => {
  const { generateRandomSeedPrompts } = await getStrategies();
  const prompts = generateRandomSeedPrompts(6);

  assert.equal(prompts.length, 6);
  assert.equal(new Set(prompts).size, 6);
  assert.ok(prompts.every((prompt) => prompt.includes(' ')), 'each prompt should be a word pair');
});

test('getSeedStrategy exposes strategy definitions', async () => {
  const { getSeedStrategy } = await getStrategies();
  const strategy = getSeedStrategy('builder-mix');

  assert.ok(strategy);
  assert.equal(strategy?.id, 'builder-mix');
  assert.equal(strategy?.playful, true);
});
