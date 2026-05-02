import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createCommandDocument,
  deleteCommandDocument,
  listCommandDocuments,
  renameCommandDocument,
  showCommandDocument,
  updateCommandDocument,
  validateCommandContent,
  validateCommandDocument,
} from '../src/commands-files.js';

async function withCommandsRoot(fn: (root: string, home: string) => Promise<void>): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-commands-'));
  const root = path.join(tmp, 'commands');
  const home = path.join(tmp, 'home');
  const previous = {
    FT_COMMANDS_DIR: process.env.FT_COMMANDS_DIR,
    HOME: process.env.HOME,
  };
  process.env.FT_COMMANDS_DIR = root;
  process.env.HOME = home;
  try {
    await fn(root, home);
  } finally {
    if (previous.FT_COMMANDS_DIR === undefined) delete process.env.FT_COMMANDS_DIR;
    else process.env.FT_COMMANDS_DIR = previous.FT_COMMANDS_DIR;
    if (previous.HOME === undefined) delete process.env.HOME;
    else process.env.HOME = previous.HOME;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const goodCommand = [
  '# review',
  '',
  'Review the current work.',
  '',
  'Use this when checking a change.',
  '',
  '## Steps',
  '',
  '1. Inspect the diff.',
  '2. Run focused tests.',
  '',
  '## Guardrails',
  '',
  '- Do not include secrets.',
  '',
  '## Verification',
  '',
  '- Confirm the tests pass.',
  '',
].join('\n');

test('commands CRUD stays under canonical commands root and validates shape', async () => {
  await withCommandsRoot(async (root, home) => {
    const created = await createCommandDocument('review', { content: goodCommand });
    assert.equal(created.name, 'review');
    assert.equal(created.relPath, 'review.md');

    const listed = listCommandDocuments();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'review');

    const validation = validateCommandDocument('review');
    assert.equal(validation.length, 1);
    assert.equal(validation[0].ok, true);

    await assert.rejects(
      updateCommandDocument('review', { content: '# Changed\n' }),
      /Refusing to overwrite/,
    );

    const shown = await showCommandDocument('review');
    const updated = await updateCommandDocument('review', {
      content: goodCommand.replace('Review the current work.', 'Review recent work.'),
      expectedSha256: shown.version.sha256,
    });
    assert.match(updated.content, /Review recent work/);

    const renamed = await renameCommandDocument('review', 'second-review');
    assert.equal(renamed.name, 'second-review');
    assert.equal(fs.existsSync(path.join(root, 'review.md')), false);

    const trashed = deleteCommandDocument('second-review');
    assert.equal(path.dirname(trashed.trashPath), path.join(home, '.Trash'));
    assert.equal(fs.existsSync(trashed.trashPath), true);
  });
});

test('commands reject unsafe names and flag weak command content', async () => {
  await withCommandsRoot(async () => {
    await assert.rejects(createCommandDocument('../escape', { content: 'bad' }), /Invalid command name/);
    await assert.rejects(createCommandDocument('.hidden', { content: 'bad' }), /Invalid command name/);
    await assert.rejects(createCommandDocument('_hidden', { content: 'bad' }), /Invalid command name/);
    assert.deepEqual(validateCommandContent('# weak\n'), [
      'Missing "Use this when" guidance.',
      'Missing ## Steps section.',
      'Missing ## Guardrails or ## Safety section.',
      'Missing concrete verification guidance.',
    ]);
  });
});
