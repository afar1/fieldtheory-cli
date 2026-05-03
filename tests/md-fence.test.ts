import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { stripLlmMarkdownFence, cleanWikiFences } from '../src/md-fence.js';

// ── Test fixture helpers ───────────────────────────────────────────────

const BROKEN_FULL = '```markdown\n---\ntags: [ft/category]\nsource_count: 5\n---\n\n# Title\n\nBody.\n```';
const BROKEN_PARTIAL = 'markdown\n---\ntags: [ft/category]\nsource_count: 5\n---\n\nBody.\n```';
const CLEAN = '---\ntags: [ft/category]\nsource_count: 5\n---\n\n# Title\n\nBody.';

function withTempDataDir<T>(fn: (tmpDir: string) => Promise<T>): Promise<T> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-fence-test-'));
  const origEnv = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = tmpDir;
  return (async () => {
    try {
      return await fn(tmpDir);
    } finally {
      process.env.FT_DATA_DIR = origEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  })();
}

function seedWiki(tmpDir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(tmpDir, 'md', rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
  }
}

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

// ── cleanWikiFences: integration tests with tmp data dir ────────────────

test('cleanWikiFences: fixes broken files across all three subdirs', async () => {
  await withTempDataDir(async (tmpDir) => {
    seedWiki(tmpDir, {
      'categories/broken-full.md':    BROKEN_FULL,
      'categories/broken-partial.md': BROKEN_PARTIAL,
      'categories/clean.md':          CLEAN,
      'domains/broken-full.md':       BROKEN_FULL,
      'entities/clean.md':            CLEAN,
    });

    const result = await cleanWikiFences();

    assert.equal(result.scanned, 5);
    assert.equal(result.fixed, 3);
    assert.equal(result.backupDir, null);
    assert.ok(result.fixedFiles.some((f) => f.includes('broken-full')));
    assert.ok(result.fixedFiles.some((f) => f.includes('broken-partial')));

    // Fixed files no longer have fence artifacts.
    const brokenFull = fs.readFileSync(path.join(tmpDir, 'md/categories/broken-full.md'), 'utf8');
    assert.ok(brokenFull.startsWith('---'));
    assert.ok(!brokenFull.includes('```'));

    const brokenPartial = fs.readFileSync(path.join(tmpDir, 'md/categories/broken-partial.md'), 'utf8');
    assert.ok(brokenPartial.startsWith('---'));
    assert.ok(!brokenPartial.includes('```'));

    // Clean file is untouched byte-for-byte.
    assert.equal(fs.readFileSync(path.join(tmpDir, 'md/categories/clean.md'), 'utf8'), CLEAN);
  });
});

test('cleanWikiFences: idempotent — second run is a no-op', async () => {
  await withTempDataDir(async (tmpDir) => {
    seedWiki(tmpDir, { 'categories/broken.md': BROKEN_FULL });

    const first = await cleanWikiFences();
    const second = await cleanWikiFences();

    assert.equal(first.fixed, 1);
    assert.equal(second.fixed, 0);
    assert.equal(second.scanned, 1);
  });
});

test('cleanWikiFences: backup option preserves originals in timestamped dir', async () => {
  await withTempDataDir(async (tmpDir) => {
    seedWiki(tmpDir, { 'categories/broken.md': BROKEN_FULL });

    const result = await cleanWikiFences({ backup: true });

    assert.equal(result.fixed, 1);
    assert.ok(result.backupDir);
    assert.ok(result.backupDir!.includes('.fence-backup-'));

    const backedUp = fs.readFileSync(path.join(result.backupDir!, 'categories/broken.md'), 'utf8');
    assert.equal(backedUp, BROKEN_FULL);
  });
});

test('cleanWikiFences: backup dir is null when nothing needed fixing', async () => {
  await withTempDataDir(async (tmpDir) => {
    seedWiki(tmpDir, { 'categories/clean.md': CLEAN });

    const result = await cleanWikiFences({ backup: true });

    assert.equal(result.scanned, 1);
    assert.equal(result.fixed, 0);
    assert.equal(result.backupDir, null);
  });
});

test('cleanWikiFences: skips entirely when .lock file is present', async () => {
  await withTempDataDir(async (tmpDir) => {
    seedWiki(tmpDir, { 'categories/broken.md': BROKEN_FULL });
    fs.writeFileSync(path.join(tmpDir, 'md/.lock'), String(process.pid));

    const result = await cleanWikiFences();

    assert.equal(result.scanned, 0);
    assert.equal(result.fixed, 0);
    // Broken file remains untouched — compile owns the dir, not us.
    assert.equal(fs.readFileSync(path.join(tmpDir, 'md/categories/broken.md'), 'utf8'), BROKEN_FULL);
  });
});

test('cleanWikiFences: returns empty result when wiki dir does not exist', async () => {
  await withTempDataDir(async () => {
    const result = await cleanWikiFences();
    assert.equal(result.scanned, 0);
    assert.equal(result.fixed, 0);
    assert.equal(result.fixedFiles.length, 0);
  });
});
