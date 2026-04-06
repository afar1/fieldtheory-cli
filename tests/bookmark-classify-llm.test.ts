import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLlmEngine } from '../src/bookmark-classify-llm.js';

describe('resolveLlmEngine', () => {
  test('prefers Claude when auto mode finds both engines', () => {
    const engine = resolveLlmEngine('auto', () => true);
    assert.equal(engine, 'claude');
  });

  test('falls back to Codex when Claude is unavailable in auto mode', () => {
    const engine = resolveLlmEngine('auto', (bin) => bin === 'codex');
    assert.equal(engine, 'codex');
  });

  test('throws when no supported engine is available in auto mode', () => {
    assert.throws(
      () => resolveLlmEngine('auto', () => false),
      /No supported LLM CLI found/,
    );
  });

  test('fails fast when Claude is explicitly requested but unavailable', () => {
    assert.throws(
      () => resolveLlmEngine('claude', (bin) => bin === 'codex'),
      /Requested LLM engine "claude" is not available/,
    );
  });

  test('returns an explicitly requested engine when available', () => {
    const engine = resolveLlmEngine('codex', (bin) => bin === 'codex');
    assert.equal(engine, 'codex');
  });
});
