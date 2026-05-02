import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildFieldTheoryOpenTarget } from '../src/app-open.js';

test('app-open builds Field Theory wiki URL for library paths', () => {
  const previous = process.env.FT_LIBRARY_DIR;
  process.env.FT_LIBRARY_DIR = '/tmp/ft-library';
  try {
    const target = buildFieldTheoryOpenTarget('entries/hello', 'library');
    assert.equal(target.kind, 'library');
    assert.equal(target.supported, true);
    assert.equal(target.path, path.join('/tmp/ft-library', 'entries', 'hello.md'));
    assert.ok(target.url?.startsWith('fieldtheory://wiki/open?'));
    assert.ok(target.url?.includes('immersive=true'));
  } finally {
    if (previous === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previous;
  }
});

test('app-open reports command paths as unsupported deep links', () => {
  const previous = process.env.FT_COMMANDS_DIR;
  process.env.FT_COMMANDS_DIR = '/tmp/ft-commands';
  try {
    const target = buildFieldTheoryOpenTarget('review', 'command');
    assert.equal(target.kind, 'command');
    assert.equal(target.supported, false);
    assert.equal(target.url, null);
    assert.equal(target.path, path.join('/tmp/ft-commands', 'review.md'));
  } finally {
    if (previous === undefined) delete process.env.FT_COMMANDS_DIR;
    else process.env.FT_COMMANDS_DIR = previous;
  }
});
