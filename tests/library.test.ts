import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createLibraryDocument,
  deleteLibraryDocument,
  listLibraryDocuments,
  renameLibraryDocument,
  searchLibraryDocuments,
  showLibraryDocument,
  updateLibraryDocument,
} from '../src/library.js';

async function withLibraryRoot(fn: (root: string, home: string) => Promise<void>): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-library-'));
  const root = path.join(tmp, 'library');
  const home = path.join(tmp, 'home');
  const previous = {
    FT_LIBRARY_DIR: process.env.FT_LIBRARY_DIR,
    HOME: process.env.HOME,
  };
  process.env.FT_LIBRARY_DIR = root;
  process.env.HOME = home;
  try {
    await fn(root, home);
  } finally {
    if (previous.FT_LIBRARY_DIR === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previous.FT_LIBRARY_DIR;
    if (previous.HOME === undefined) delete process.env.HOME;
    else process.env.HOME = previous.HOME;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test('library CRUD stays under canonical library root and uses conflict guards', async () => {
  await withLibraryRoot(async (root, home) => {
    const created = await createLibraryDocument('entries/test-note', { content: '# Test Note\n\nhello world\n' });
    assert.equal(created.relPath, 'entries/test-note.md');
    assert.equal(created.content.includes('hello world'), true);

    const listed = listLibraryDocuments();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].relPath, 'entries/test-note.md');

    const searched = searchLibraryDocuments('hello');
    assert.equal(searched.length, 1);
    assert.match(searched[0].snippet, /hello world/);

    await assert.rejects(
      updateLibraryDocument('entries/test-note', { content: '# Changed\n' }),
      /Refusing to overwrite/,
    );

    const shown = await showLibraryDocument('entries/test-note');
    const updated = await updateLibraryDocument('entries/test-note', {
      content: '# Changed\n',
      expectedSha256: shown.version.sha256,
    });
    assert.equal(updated.content, '# Changed\n');

    const renamed = await renameLibraryDocument('entries/test-note', 'scratchpad/renamed-note');
    assert.equal(renamed.relPath, 'scratchpad/renamed-note.md');
    assert.equal(fs.existsSync(path.join(root, 'entries', 'test-note.md')), false);

    const trashed = deleteLibraryDocument('scratchpad/renamed-note');
    assert.equal(fs.existsSync(path.join(root, 'scratchpad', 'renamed-note.md')), false);
    assert.equal(path.dirname(trashed.trashPath), path.join(home, '.Trash'));
    assert.equal(fs.existsSync(trashed.trashPath), true);
  });
});

test('library rejects traversal paths', async () => {
  await withLibraryRoot(async () => {
    await assert.rejects(
      createLibraryDocument('../escape', { content: 'bad' }),
      /Invalid Library path/,
    );
  });
});
