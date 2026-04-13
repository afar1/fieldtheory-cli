import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function withIdeasStore(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-ideas-theory-test-'));
  const saved = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (saved !== undefined) process.env.FT_DATA_DIR = saved;
    else delete process.env.FT_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
}

async function getIdeasTheories() {
  return import('../src/ideas-theories.js');
}

test('createIdeasTheory persists json and markdown', async () => {
  await withIdeasStore(async (dir) => {
    const theories = await getIdeasTheories();
    const theory = await theories.createIdeasTheory({
      title: 'Prompt panel theory',
      summary: 'A clearer prompt panel will improve actionability.',
      recommendation: 'Promote node prompts into a first-class pane.',
      runId: 'run-1',
      nodeIds: ['dot-1', 'dot-2'],
      prompt: 'Implement a prompt panel in the Ideas tab.',
      createdBy: 'model',
    });

    assert.equal(theory.runId, 'run-1');
    assert.deepEqual(theory.nodeIds, ['dot-1', 'dot-2']);

    const mdPath = path.join(dir, 'ideas', 'theories', theory.createdAt.slice(0, 10), `${theory.id}.md`);
    const raw = await readFile(mdPath, 'utf8');
    assert.ok(raw.includes('# Prompt panel theory'));
    assert.ok(raw.includes('## Prompt'));
    assert.ok(raw.includes('Implement a prompt panel in the Ideas tab.'));
  });
});
