import test from 'node:test';
import assert from 'node:assert/strict';

import { stripLlmMarkdownFence } from '../src/md-fence.js';

// ── Case A: full fence wrap ────────────────────────────────────────────

test('stripLlmMarkdownFence: strips full ```markdown ... ``` wrap', () => {
  const input = '```markdown\n---\ntags: [ft/category]\n---\n\n# Title\n\nBody.\n```';
  const out = stripLlmMarkdownFence(input);
  assert.equal(out, '---\ntags: [ft/category]\n---\n\n# Title\n\nBody.');
});

test('stripLlmMarkdownFence: strips full fence with no language tag', () => {
  const input = '```\n---\ntags: [ft/category]\n---\n\nBody.\n```';
  assert.equal(stripLlmMarkdownFence(input), '---\ntags: [ft/category]\n---\n\nBody.');
});

test('stripLlmMarkdownFence: handles CRLF line endings in full wrap', () => {
  const input = '```markdown\r\n---\r\ntags: [ft/category]\r\n---\r\n\r\nBody.\r\n```';
  const out = stripLlmMarkdownFence(input);
  assert.ok(out.startsWith('---'));
  assert.ok(!out.includes('```'));
});

// ── Case B: partial strip (leading language token, trailing fence) ─────

test('stripLlmMarkdownFence: strips orphan leading `markdown` token before frontmatter', () => {
  const input = 'markdown\n---\ntags: [ft/category]\n---\n\nBody.\n```';
  const out = stripLlmMarkdownFence(input);
  assert.equal(out, '---\ntags: [ft/category]\n---\n\nBody.');
});

test('stripLlmMarkdownFence: does NOT strip leading "markdown" if next line is not frontmatter', () => {
  // Protects legitimate content that happens to start with the word "markdown".
  const input = 'markdown is a lightweight markup language.\n\nMore body.';
  assert.equal(stripLlmMarkdownFence(input), 'markdown is a lightweight markup language.\n\nMore body.');
});

// ── Case C: orphan trailing fence only ─────────────────────────────────

test('stripLlmMarkdownFence: strips orphan trailing ``` on its own line', () => {
  const input = '---\ntags: [ft/category]\n---\n\nBody.\n```';
  assert.equal(stripLlmMarkdownFence(input), '---\ntags: [ft/category]\n---\n\nBody.');
});

// ── Clean input passes through unchanged ───────────────────────────────

test('stripLlmMarkdownFence: leaves clean frontmatter page unchanged', () => {
  const input = '---\ntags: [ft/category]\n---\n\n# Title\n\nBody with `inline code`.';
  assert.equal(stripLlmMarkdownFence(input), input);
});

test('stripLlmMarkdownFence: preserves inner fenced code blocks in clean input', () => {
  const input = '---\ntags: [ft/category]\n---\n\n```bash\nnpm run build\n```\n\nMore body.';
  assert.equal(stripLlmMarkdownFence(input), input);
});

test('stripLlmMarkdownFence: preserves inner fenced code block when wrapper is stripped', () => {
  // Outer wrap around content that contains its own inner code block.
  const input = '```markdown\n---\ntags: [x]\n---\n\n```bash\nls\n```\n\nend\n```';
  const out = stripLlmMarkdownFence(input);
  assert.ok(out.includes('```bash'));
  assert.ok(out.includes('```\n\nend') || out.includes('```\nend'));
  assert.ok(out.startsWith('---'));
});

// ── Idempotency ────────────────────────────────────────────────────────

test('stripLlmMarkdownFence: idempotent — running twice yields same result', () => {
  const input = '```markdown\n---\ntags: [ft/category]\n---\n\nBody.\n```';
  const once = stripLlmMarkdownFence(input);
  const twice = stripLlmMarkdownFence(once);
  assert.equal(once, twice);
});

test('stripLlmMarkdownFence: idempotent on clean input', () => {
  const input = '---\ntags: [ft/category]\n---\n\nBody.';
  assert.equal(stripLlmMarkdownFence(input), stripLlmMarkdownFence(stripLlmMarkdownFence(input)));
});

// ── Edge cases ─────────────────────────────────────────────────────────

test('stripLlmMarkdownFence: trims surrounding whitespace', () => {
  assert.equal(stripLlmMarkdownFence('  \n---\nBody.\n  '), '---\nBody.');
});

test('stripLlmMarkdownFence: empty string returns empty string', () => {
  assert.equal(stripLlmMarkdownFence(''), '');
});

test('stripLlmMarkdownFence: whitespace-only returns empty string', () => {
  assert.equal(stripLlmMarkdownFence('   \n\n  '), '');
});
