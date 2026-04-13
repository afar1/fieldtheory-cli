import test from 'node:test';
import assert from 'node:assert/strict';

async function getSeedsModel() {
  return import('../src/seeds-model.js');
}

test('buildSeedOrganizeExplainPrompt includes candidate count and preview', async () => {
  const { buildSeedOrganizeExplainPrompt } = await getSeedsModel();
  const prompt = buildSeedOrganizeExplainPrompt({
    filters: { domain: 'ai', days: 30 },
    candidateCount: 8,
    candidatePreview: [
      { id: '1', text: 'agent reliability', url: 'u', authorHandle: 'afar0x' },
    ],
    suggestCount: 3,
  });

  assert.ok(prompt.includes('Candidate pool size: 8'));
  assert.ok(prompt.includes('agent reliability'));
  assert.ok(prompt.includes('Filters:'));
});

test('parseSeedOrganizeExplanation extracts explanation text', async () => {
  const { parseSeedOrganizeExplanation } = await getSeedsModel();
  const explanation = parseSeedOrganizeExplanation('{"explanation":"I will group by tension and utility."}');
  assert.equal(explanation, 'I will group by tension and utility.');
});

test('parseSeedOrganizationSuggestions extracts valid suggestion groups', async () => {
  const { parseSeedOrganizationSuggestions } = await getSeedsModel();
  const suggestions = parseSeedOrganizationSuggestions(`[
    {
      "title": "Quiet leverage",
      "rationale": "A compact cluster around useful infra signal.",
      "itemIds": ["a", "b"]
    },
    {
      "title": "",
      "rationale": "bad",
      "itemIds": []
    }
  ]`);

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.title, 'Quiet leverage');
  assert.deepEqual(suggestions[0]?.itemIds, ['a', 'b']);
});
