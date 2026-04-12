import test from 'node:test';
import assert from 'node:assert/strict';

async function getSeedsOrganize() {
  return import('../src/seeds-organize.js');
}

test('formatSeedOrganization renders empty state cleanly', async () => {
  const { formatSeedOrganization } = await getSeedsOrganize();
  const output = formatSeedOrganization({ mode: 'category', groups: [] });
  assert.equal(output, 'No bookmark groups found for mode: category.');
});

test('formatSeedOrganization renders a readable ranked list', async () => {
  const { formatSeedOrganization } = await getSeedsOrganize();
  const output = formatSeedOrganization({
    mode: 'domain',
    groups: [
      {
        key: 'ai',
        label: 'ai',
        itemIds: ['1', '2'],
        count: 2,
        rationale: 'Bookmarks grouped by domain: ai.',
      },
      {
        key: 'security',
        label: 'security',
        itemIds: ['3'],
        count: 1,
        rationale: 'Bookmarks grouped by domain: security.',
      },
    ],
  });

  assert.ok(output.includes('1. ai  (2)'));
  assert.ok(output.includes('2. security  (1)'));
  assert.ok(output.includes('Bookmarks grouped by domain: ai.'));
});
