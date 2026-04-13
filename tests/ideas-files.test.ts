import test from 'node:test';
import assert from 'node:assert/strict';

async function getIdeasFiles() {
  return import('../src/ideas-files.js');
}

test('renderIdeasNodeMd includes prompt and source context', async () => {
  const { renderIdeasNodeMd } = await getIdeasFiles();
  const markdown = renderIdeasNodeMd({
    run: {
      id: 'run-1',
      inputIds: ['seed-artifact-1'],
      outputIds: ['dot-1'],
      frame: {
        id: 'impact-effort',
        name: 'Impact × Effort',
        group: 'building',
        generationPromptAddition: '',
        axisA: { label: 'Impact', rubricSentence: '0 low, 100 high' },
        axisB: { label: 'Effort', rubricSentence: '0 hard, 100 easy' },
        quadrantLabels: { highHigh: 'Sweep', highLow: 'Slog', lowHigh: 'Polish', lowLow: 'Detour' },
      },
      repo: '/tmp/repo',
      depth: 'standard',
      createdAt: '2026-04-12T12:00:00.000Z',
      userInteractions: [],
      completedStages: ['read', 'survey', 'generate', 'critique', 'score'],
    },
    artifactId: 'dot-1',
    dot: {
      title: 'Tighten repo prompt loop',
      summary: 'Create a clearer prompt export flow for ideas.',
      rationale: 'This makes generated ideas easier to act on in coding agents.',
      repoSurface: 'src/ideas.ts',
      effortEstimate: 'days',
      axisAScore: 84,
      axisAJustification: 'high leverage',
      axisBScore: 72,
      axisBJustification: 'tractable',
      exportablePrompt: 'Read src/ideas.ts and implement a prompt panel.',
    },
  });

  assert.ok(markdown.includes('# Tighten repo prompt loop'));
  assert.ok(markdown.includes('## Prompt'));
  assert.ok(markdown.includes('Read src/ideas.ts and implement a prompt panel.'));
  assert.ok(markdown.includes('Run: run-1'));
});
