import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { isPathInside } from '../src/document-ops.js';

test('isPathInside rejects sibling and parent paths', () => {
  const root = path.join(path.sep, 'tmp', 'fieldtheory-root', 'child');

  assert.equal(isPathInside(root, root), true);
  assert.equal(isPathInside(root, path.join(root, 'note.md')), true);
  assert.equal(isPathInside(root, path.join(root, '..')), false);
  assert.equal(isPathInside(root, path.join(path.sep, 'tmp', 'fieldtheory-root-other')), false);
});
