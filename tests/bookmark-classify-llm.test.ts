import test from 'node:test';
import assert from 'node:assert/strict';
import { attachStderrToError, buildEngineArgs } from '../src/bookmark-classify-llm.js';

test('buildEngineArgs adds skip-git-repo-check for codex', () => {
  assert.deepEqual(
    buildEngineArgs('codex', 'Return ONLY []'),
    ['exec', '--skip-git-repo-check', 'Return ONLY []'],
  );
});

test('buildEngineArgs preserves claude invocation shape', () => {
  assert.deepEqual(
    buildEngineArgs('claude', 'Return ONLY []'),
    ['-p', '--output-format', 'text', 'Return ONLY []'],
  );
});

test('attachStderrToError appends child stderr text', () => {
  const error = Object.assign(new Error('Command failed: codex exec prompt'), {
    stderr: 'Not inside a trusted directory and --skip-git-repo-check was not specified.\n',
  });

  const result = attachStderrToError(error);

  assert.equal(
    result.message,
    'Command failed: codex exec prompt\nNot inside a trusted directory and --skip-git-repo-check was not specified.',
  );
});

test('attachStderrToError leaves errors without stderr unchanged', () => {
  const error = new Error('Command failed');
  const result = attachStderrToError(error);

  assert.equal(result.message, 'Command failed');
});
