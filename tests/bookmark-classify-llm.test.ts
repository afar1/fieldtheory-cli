import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonArray } from '../src/bookmark-classify-llm.js';

test('extractJsonArray: stops at the end of the first balanced JSON array', () => {
  const raw = `Here you go:
[{"id":"1","domains":["ai","finance"],"primary":"ai"}]

Some of [these bookmarks] look ambiguous.`;

  assert.equal(
    extractJsonArray(raw),
    '[{"id":"1","domains":["ai","finance"],"primary":"ai"}]',
  );
});

test('extractJsonArray: skips bracketed prose before the real JSON array', () => {
  const raw = `Status [draft only]
[{"id":"1","domains":["ai"],"primary":"ai"}]`;

  assert.equal(
    extractJsonArray(raw),
    '[{"id":"1","domains":["ai"],"primary":"ai"}]',
  );
});

test('extractJsonArray: ignores brackets inside JSON strings', () => {
  const raw = '[{"id":"1","domains":["ai"],"primary":"ai","note":"keep [this] literal"}] trailing ]';

  assert.equal(
    extractJsonArray(raw),
    '[{"id":"1","domains":["ai"],"primary":"ai","note":"keep [this] literal"}]',
  );
});
