import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';

import { mkdir, writeFile } from 'node:fs/promises';
import {
  writeEntry, reconcileEntries, yamlEscapeDoubleQuotedForTest,
  targetDirForTest, scanEntriesForTest, groupByTargetForTest,
  type ReconcileOptions,
} from '../src/md-entries.js';
import {
  mdEntriesDir, mdLogPath, mdCategoriesDir, mdDomainsDir, mdEntitiesDir,
} from '../src/paths.js';
import { buildReconcilePrompt } from '../src/md-prompts.js';
import type { ResolvedEngine, InvokeOptions } from '../src/engine.js';
import type { MdState } from '../src/md.js';

// All tests run against a temp FT_DATA_DIR. writeEntry + writeMd handle
// recursive mkdir internally, so the entries/ dir doesn't need to pre-exist.

async function withTmpDataDir<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), `ft-entries-${name}-`));
  process.env.FT_DATA_DIR = tmpDir;
  try {
    return await fn();
  } finally {
    delete process.env.FT_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  }
}

test('writeEntry: creates file under md/entries with dated slug filename', async () => {
  await withTmpDataDir('basic', async () => {
    const result = await writeEntry({
      title: 'Hello World',
      body: 'some content',
      entryTag: 'ft/concept',
      sourceType: 'authored',
    });

    const today = new Date().toISOString().slice(0, 10);
    assert.equal(path.basename(result.filePath), `${today}-hello-world.md`);
    assert.equal(path.dirname(result.filePath), mdEntriesDir());
    assert.equal(result.slug, 'hello-world');
    assert.equal(result.relPath, `entries/${today}-hello-world`);
  });
});

test('writeEntry: frontmatter has ft/entry + type tag in canonical order', async () => {
  await withTmpDataDir('tags', async () => {
    const result = await writeEntry({
      title: 'Testing tags',
      body: 'body',
      entryTag: 'ft/lesson',
      sourceType: 'authored',
    });

    const content = await readFile(result.filePath, 'utf8');
    assert.match(content, /^---\ntags: \[ft\/entry, ft\/lesson\]\n/);
  });
});

test('writeEntry: topicalTags appended after ft/entry and type tag', async () => {
  await withTmpDataDir('topical', async () => {
    const result = await writeEntry({
      title: 'With topical',
      body: 'body',
      entryTag: 'ft/concept',
      sourceType: 'authored',
      topicalTags: ['ai', 'tool'],
    });

    const content = await readFile(result.filePath, 'utf8');
    assert.match(content, /tags: \[ft\/entry, ft\/concept, ai, tool\]/);
  });
});

test('writeEntry: authored sourceType writes source_type: authored and no question field', async () => {
  await withTmpDataDir('authored', async () => {
    const result = await writeEntry({
      title: 'Authored entry',
      body: 'body',
      entryTag: 'ft/concept',
      sourceType: 'authored',
      question: 'should be ignored',
    });

    const content = await readFile(result.filePath, 'utf8');
    assert.match(content, /source_type: authored/);
    assert.ok(!content.includes('question:'), 'authored entries should not persist question field');
  });
});

test('writeEntry: ask sourceType preserves question in frontmatter', async () => {
  await withTmpDataDir('ask', async () => {
    const result = await writeEntry({
      title: 'What is whisper?',
      body: 'Whisper is an ASR model.',
      entryTag: 'ft/concept',
      sourceType: 'ask',
      question: 'What is whisper?',
    });

    const content = await readFile(result.filePath, 'utf8');
    assert.match(content, /source_type: ask/);
    assert.match(content, /question: "What is whisper\?"/);
  });
});

test('writeEntry: escapes quotes, backslashes, and newlines in question field', async () => {
  await withTmpDataDir('escape', async () => {
    const result = await writeEntry({
      title: 'Quoted',
      body: 'body',
      entryTag: 'ft/concept',
      sourceType: 'ask',
      question: 'She said "hi"\nand used \\ backslash',
    });

    const content = await readFile(result.filePath, 'utf8');
    assert.match(content, /question: "She said \\"hi\\" and used \\\\ backslash"/);
  });
});

test('writeEntry: body renders under # <title> heading with blank line separator', async () => {
  await withTmpDataDir('body', async () => {
    const result = await writeEntry({
      title: 'Heading Test',
      body: 'First paragraph.\n\nSecond paragraph.',
      entryTag: 'ft/concept',
      sourceType: 'authored',
    });

    const content = await readFile(result.filePath, 'utf8');
    assert.ok(content.includes('\n# Heading Test\n\nFirst paragraph.\n\nSecond paragraph.'));
  });
});

test('writeEntry: writes last_updated as today (YYYY-MM-DD)', async () => {
  await withTmpDataDir('date', async () => {
    const result = await writeEntry({
      title: 'Dated',
      body: 'body',
      entryTag: 'ft/concept',
      sourceType: 'authored',
    });

    const today = new Date().toISOString().slice(0, 10);
    const content = await readFile(result.filePath, 'utf8');
    assert.match(content, new RegExp(`last_updated: ${today}`));
  });
});

test('writeEntry: appends grep-parseable log line to log.md', async () => {
  await withTmpDataDir('log', async () => {
    const result = await writeEntry({
      title: 'Logged',
      body: 'body',
      entryTag: 'ft/concept',
      sourceType: 'authored',
    });

    const logContent = await readFile(mdLogPath(), 'utf8');
    const today = new Date().toISOString().slice(0, 10);
    assert.match(logContent, new RegExp(`^## \\[${today}\\] entry \\| created ${result.relPath}`, 'm'));
  });
});

test('writeEntry: returned slug and relPath are wikilink-ready', async () => {
  await withTmpDataDir('wikilink', async () => {
    const result = await writeEntry({
      title: 'AI & Machine Learning (part 1)',
      body: 'body',
      entryTag: 'ft/concept',
      sourceType: 'authored',
    });

    assert.equal(result.slug, 'ai-machine-learning-part-1');
    assert.ok(result.relPath.startsWith('entries/'));
    assert.ok(result.relPath.endsWith(result.slug));
  });
});

test('writeEntry: throws when title produces an empty slug', async () => {
  await withTmpDataDir('empty-slug', async () => {
    await assert.rejects(
      () =>
        writeEntry({
          title: '!!!',
          body: 'body',
          entryTag: 'ft/concept',
          sourceType: 'authored',
        }),
      /empty slug/,
    );
  });
});

test('writeEntry: dedupes ft/entry when passed as entryTag', async () => {
  await withTmpDataDir('dedupe-entry', async () => {
    const result = await writeEntry({
      title: 'Duped entry tag',
      body: 'body',
      entryTag: 'ft/entry',
      sourceType: 'authored',
    });

    const content = await readFile(result.filePath, 'utf8');
    assert.match(content, /tags: \[ft\/entry\]\n/);
    assert.ok(!/tags: \[ft\/entry, ft\/entry/.test(content), 'ft/entry must not appear twice');
  });
});

test('writeEntry: dedupes repeated topicalTags', async () => {
  await withTmpDataDir('dedupe-topical', async () => {
    const result = await writeEntry({
      title: 'Duped topical',
      body: 'body',
      entryTag: 'ft/concept',
      sourceType: 'authored',
      topicalTags: ['ai', 'ft/entry', 'ai', 'ft/concept', 'tool'],
    });

    const content = await readFile(result.filePath, 'utf8');
    assert.match(content, /tags: \[ft\/entry, ft\/concept, ai, tool\]/);
  });
});

// ── yamlEscapeDoubleQuoted direct unit tests ──────────────────────────────

test('yamlEscapeDoubleQuoted: passes through plain text', () => {
  assert.equal(yamlEscapeDoubleQuotedForTest('plain text'), 'plain text');
});

test('yamlEscapeDoubleQuoted: escapes double quotes', () => {
  assert.equal(yamlEscapeDoubleQuotedForTest('say "hi"'), 'say \\"hi\\"');
});

test('yamlEscapeDoubleQuoted: escapes backslashes before quotes', () => {
  // Backslashes must be doubled first so the resulting `\"` isn't turned into `\\"`.
  assert.equal(yamlEscapeDoubleQuotedForTest('a\\b'), 'a\\\\b');
});

test('yamlEscapeDoubleQuoted: collapses newlines to spaces', () => {
  assert.equal(yamlEscapeDoubleQuotedForTest('line1\nline2'), 'line1 line2');
});

// ── buildReconcilePrompt — Phase 3 ────────────────────────────────────────

test('buildReconcilePrompt: includes target path and entry count', () => {
  const p = buildReconcilePrompt('domains/ai', '# AI\n\nexisting content', [
    { relPath: 'entries/2026-04-15-a', content: '# A\nbody' },
    { relPath: 'entries/2026-04-15-b', content: '# B\nbody' },
  ]);
  assert.ok(p.includes('domains/ai'));
  assert.ok(p.includes('2 authored entries'));
});

test('buildReconcilePrompt: includes the full existing page content', () => {
  const existing = '---\ntags: [ft/domain]\n---\n# Existing\n\nOriginal text with [(source)](https://x.com/foo).';
  const p = buildReconcilePrompt('domains/ai', existing, []);
  assert.ok(p.includes(existing));
});

test('buildReconcilePrompt: includes each entry verbatim with relPath header', () => {
  const p = buildReconcilePrompt('categories/tool', '# tool', [
    { relPath: 'entries/2026-04-15-foo', content: 'entry foo body' },
    { relPath: 'entries/2026-04-15-bar', content: 'entry bar body' },
  ]);
  assert.ok(p.includes('entries/2026-04-15-foo'));
  assert.ok(p.includes('entry foo body'));
  assert.ok(p.includes('entries/2026-04-15-bar'));
  assert.ok(p.includes('entry bar body'));
});

test('buildReconcilePrompt: instructs to preserve bookmark citations', () => {
  const p = buildReconcilePrompt('domains/ai', '# AI', []);
  assert.ok(/preserve.*citation/i.test(p) || /citations?/.test(p));
});

test('buildReconcilePrompt: instructs to output only markdown (no preamble)', () => {
  const p = buildReconcilePrompt('domains/ai', '# AI', []);
  assert.ok(p.includes('ONLY the markdown'));
});

test('buildReconcilePrompt: includes SECURITY note (reuses untrusted-input rule)', () => {
  const p = buildReconcilePrompt('domains/ai', '# AI', []);
  assert.ok(p.includes('SECURITY'));
});

// ── targetDirFor — Phase 3 ────────────────────────────────────────────────

test('targetDirFor: maps categories/ to mdCategoriesDir', () => {
  assert.equal(targetDirForTest('categories/tool'), mdCategoriesDir());
});

test('targetDirFor: maps domains/ to mdDomainsDir', () => {
  assert.equal(targetDirForTest('domains/ai'), mdDomainsDir());
});

test('targetDirFor: maps entities/ to mdEntitiesDir', () => {
  assert.equal(targetDirForTest('entities/karpathy'), mdEntitiesDir());
});

test('targetDirFor: returns null for entries/, concepts/, and unknown targets', () => {
  assert.equal(targetDirForTest('entries/2026-04-15-foo'), null);
  assert.equal(targetDirForTest('concepts/2026-04-15-foo'), null);
  assert.equal(targetDirForTest('index'), null);
  assert.equal(targetDirForTest('random/thing'), null);
});

test('targetDirFor: rejects malformed wikilinks with more than 2 segments', () => {
  // Guards against [[categories/foo/bar]] silently matching categories/foo.md
  // via a startsWith + split[1] path.
  assert.equal(targetDirForTest('categories/foo/bar'), null);
  assert.equal(targetDirForTest('domains/ai/subtype'), null);
  assert.equal(targetDirForTest('entities/karpathy/profile'), null);
});

test('targetDirFor: rejects empty slug', () => {
  assert.equal(targetDirForTest('categories/'), null);
  assert.equal(targetDirForTest('domains/'), null);
});

// ── groupByTarget — Phase 3 ───────────────────────────────────────────────

test('groupByTarget: groups entries by their wikilinks', () => {
  const scanned = [
    { relPath: 'entries/a', content: 'a', hash: 'ha', wikilinks: ['domains/ai'] },
    { relPath: 'entries/b', content: 'b', hash: 'hb', wikilinks: ['domains/ai', 'categories/tool'] },
    { relPath: 'entries/c', content: 'c', hash: 'hc', wikilinks: ['categories/tool'] },
  ];
  const groups = groupByTargetForTest(scanned);
  assert.equal(groups.size, 2);
  assert.equal(groups.get('domains/ai')!.length, 2);
  assert.equal(groups.get('categories/tool')!.length, 2);
});

test('groupByTarget: entries with no wikilinks do not appear in any group', () => {
  const scanned = [
    { relPath: 'entries/orphan', content: 'no links here', hash: 'h', wikilinks: [] },
    { relPath: 'entries/linked', content: 'body', hash: 'h', wikilinks: ['domains/ai'] },
  ];
  const groups = groupByTargetForTest(scanned);
  assert.equal(groups.size, 1);
  assert.ok(groups.has('domains/ai'));
});

// ── scanEntries — Phase 3 ─────────────────────────────────────────────────

test('scanEntries: returns empty array when entries dir does not exist', async () => {
  await withTmpDataDir('scan-missing', async () => {
    const scanned = await scanEntriesForTest();
    assert.deepEqual(scanned, []);
  });
});

test('scanEntries: reads entry files and extracts compiled-page wikilinks only', async () => {
  await withTmpDataDir('scan', async () => {
    await mkdir(mdEntriesDir(), { recursive: true });
    const body = `---
tags: [ft/entry, ft/lesson]
source_type: authored
---

# Test

Points at [[domains/ai]] and [[entities/karpathy]] and also [[entries/self-ref]] and [[random/thing]].`;
    await writeFile(path.join(mdEntriesDir(), '2026-04-15-test.md'), body);

    const scanned = await scanEntriesForTest();
    assert.equal(scanned.length, 1);
    assert.equal(scanned[0].relPath, 'entries/2026-04-15-test');
    // Only compiled-page targets survive the filter; entries/ and random/ are dropped.
    assert.deepEqual(scanned[0].wikilinks.sort(), ['domains/ai', 'entities/karpathy']);
    assert.ok(scanned[0].hash.length > 0);
  });
});

test('scanEntries: ignores non-markdown files in entries dir', async () => {
  await withTmpDataDir('scan-non-md', async () => {
    await mkdir(mdEntriesDir(), { recursive: true });
    await writeFile(path.join(mdEntriesDir(), 'notes.txt'), 'not markdown');
    await writeFile(path.join(mdEntriesDir(), '2026-04-15-real.md'), '# real\n[[domains/ai]]');

    const scanned = await scanEntriesForTest();
    assert.equal(scanned.length, 1);
    assert.equal(scanned[0].relPath, 'entries/2026-04-15-real');
  });
});

test('scanEntries: dedupes repeated wikilinks within a single entry', async () => {
  await withTmpDataDir('scan-dedup', async () => {
    await mkdir(mdEntriesDir(), { recursive: true });
    // Same target mentioned twice in prose AND once in Related — should
    // appear only once in the wikilinks array so groupByTarget doesn't
    // produce duplicate entries in the reconcile group.
    const body = `# Multi-mention

We heavily depend on [[domains/ai]] for the training pipeline. The
[[domains/ai]] story is particularly relevant here.

## Related

- [[domains/ai]]
- [[categories/tool]]`;
    await writeFile(path.join(mdEntriesDir(), '2026-04-15-multi.md'), body);

    const scanned = await scanEntriesForTest();
    assert.equal(scanned.length, 1);
    assert.deepEqual(scanned[0].wikilinks.sort(), ['categories/tool', 'domains/ai']);
  });
});

// ── reconcileEntries — Phase 3 ────────────────────────────────────────────

function freshMdState(): MdState {
  return {
    lastCompileAt: new Date(0).toISOString(),
    totalCompiles: 0,
    groupCounts: {},
    pageHashes: {},
  };
}

const FAKE_ENGINE: ResolvedEngine = {
  name: 'fake',
  config: { bin: 'fake', args: () => [] },
};

interface FakeEngineLog {
  prompts: string[];
  outputs: string[];
}

function makeFakeInvoker(log: FakeEngineLog, response: string | ((prompt: string) => string | Error)) {
  return async (_engine: ResolvedEngine, prompt: string, _opts: InvokeOptions): Promise<string> => {
    log.prompts.push(prompt);
    const r = typeof response === 'function' ? response(prompt) : response;
    if (r instanceof Error) throw r;
    log.outputs.push(r);
    return r;
  };
}

test('reconcileEntries: no entries → returns zero counts', async () => {
  await withTmpDataDir('reconcile-empty', async () => {
    const state = freshMdState();
    const log: FakeEngineLog = { prompts: [], outputs: [] };
    const result = await reconcileEntries({
      state,
      engine: FAKE_ENGINE,
      engineInvoker: makeFakeInvoker(log, 'should not be called'),
    });
    assert.equal(result.pagesReconciled, 0);
    assert.equal(result.pagesSkipped, 0);
    assert.equal(log.prompts.length, 0);
  });
});

test('reconcileEntries: entries with no compiled-page wikilinks → zero counts', async () => {
  await withTmpDataDir('reconcile-no-links', async () => {
    await mkdir(mdEntriesDir(), { recursive: true });
    await writeFile(path.join(mdEntriesDir(), '2026-04-15-x.md'), '# x\n\nno wikilinks here');
    const state = freshMdState();
    const log: FakeEngineLog = { prompts: [], outputs: [] };
    const result = await reconcileEntries({
      state,
      engine: FAKE_ENGINE,
      engineInvoker: makeFakeInvoker(log, 'should not be called'),
    });
    assert.equal(result.pagesReconciled, 0);
    assert.equal(log.prompts.length, 0);
  });
});

test('reconcileEntries: skips target page that does not exist yet', async () => {
  await withTmpDataDir('reconcile-missing-target', async () => {
    await mkdir(mdEntriesDir(), { recursive: true });
    await writeFile(path.join(mdEntriesDir(), '2026-04-15-x.md'), '# x\n\nSee [[entities/shannon]].');
    const state = freshMdState();
    const log: FakeEngineLog = { prompts: [], outputs: [] };
    const result = await reconcileEntries({
      state,
      engine: FAKE_ENGINE,
      engineInvoker: makeFakeInvoker(log, 'should not be called'),
    });
    assert.equal(result.pagesReconciled, 0);
    assert.equal(result.pagesSkipped, 1);
    assert.equal(log.prompts.length, 0, 'no LLM call when target is missing');
  });
});

test('reconcileEntries: reconciles existing target page when entry hash is new', async () => {
  await withTmpDataDir('reconcile-basic', async () => {
    await mkdir(mdEntriesDir(), { recursive: true });
    await mkdir(mdDomainsDir(), { recursive: true });
    const domainPath = path.join(mdDomainsDir(), 'ai.md');
    const originalDomainContent = '---\ntags: [ft/domain]\n---\n# AI\n\nOriginal body.';
    await writeFile(domainPath, originalDomainContent);
    await writeFile(
      path.join(mdEntriesDir(), '2026-04-15-whisper.md'),
      '# whisper\n\nSee [[domains/ai]] — Whisper is an ASR model.',
    );

    const state = freshMdState();
    const log: FakeEngineLog = { prompts: [], outputs: [] };
    const updatedDomainContent = '---\ntags: [ft/domain]\n---\n# AI\n\nUpdated body with whisper reference.';

    const result = await reconcileEntries({
      state,
      engine: FAKE_ENGINE,
      engineInvoker: makeFakeInvoker(log, updatedDomainContent),
    });

    assert.equal(result.pagesReconciled, 1);
    assert.equal(result.pagesFailed, 0);
    assert.equal(log.prompts.length, 1);
    assert.ok(log.prompts[0].includes('domains/ai'), 'prompt mentions target');
    assert.ok(log.prompts[0].includes('Whisper is an ASR model'), 'prompt includes entry body');

    const onDisk = await readFile(domainPath, 'utf8');
    assert.equal(onDisk, updatedDomainContent);

    // Entry hash should now be tracked so next reconcile is a no-op.
    assert.ok(state.entryHashes, 'entryHashes must be populated after reconcile');
    assert.ok(state.entryHashes!['entries/2026-04-15-whisper']);
  });
});

test('reconcileEntries: unchanged entry hash skips reconcile (no LLM call)', async () => {
  await withTmpDataDir('reconcile-unchanged', async () => {
    await mkdir(mdEntriesDir(), { recursive: true });
    await mkdir(mdDomainsDir(), { recursive: true });
    await writeFile(path.join(mdDomainsDir(), 'ai.md'), '# AI\n');
    const entryBody = '# entry\n\nPoints at [[domains/ai]].';
    await writeFile(path.join(mdEntriesDir(), '2026-04-15-e.md'), entryBody);

    // Pre-populate entryHashes with the exact hash of the entry content so
    // reconcile sees nothing changed.
    const state = freshMdState();
    const entryRel = 'entries/2026-04-15-e';
    // Compute the hash the same way md-entries does — via importing the test
    // path. Simpler: run reconcile once to seed, then run it again and assert
    // the second run is a no-op.
    const log1: FakeEngineLog = { prompts: [], outputs: [] };
    await reconcileEntries({
      state,
      engine: FAKE_ENGINE,
      engineInvoker: makeFakeInvoker(log1, 'updated'),
    });
    assert.equal(log1.prompts.length, 1, 'first reconcile runs the LLM');
    assert.ok(state.entryHashes![entryRel]);

    // Second run: same entry content, hashes match, should skip.
    const log2: FakeEngineLog = { prompts: [], outputs: [] };
    const result = await reconcileEntries({
      state,
      engine: FAKE_ENGINE,
      engineInvoker: makeFakeInvoker(log2, 'should not be called'),
    });
    assert.equal(log2.prompts.length, 0, 'second reconcile must not call LLM');
    assert.equal(result.pagesUnchanged, 1);
  });
});

test('reconcileEntries: dirtyPages forces reconcile even when entries unchanged', async () => {
  await withTmpDataDir('reconcile-dirty', async () => {
    await mkdir(mdEntriesDir(), { recursive: true });
    await mkdir(mdDomainsDir(), { recursive: true });
    await writeFile(path.join(mdDomainsDir(), 'ai.md'), '# AI\n');
    await writeFile(path.join(mdEntriesDir(), '2026-04-15-e.md'), '# entry\n\n[[domains/ai]]');
    const state = freshMdState();

    // Seed entry hashes.
    const log1: FakeEngineLog = { prompts: [], outputs: [] };
    await reconcileEntries({ state, engine: FAKE_ENGINE, engineInvoker: makeFakeInvoker(log1, 'v1') });
    assert.equal(log1.prompts.length, 1);

    // Second run — mark domains/ai dirty. Should re-reconcile even though entry is unchanged.
    const log2: FakeEngineLog = { prompts: [], outputs: [] };
    const result = await reconcileEntries({
      state,
      engine: FAKE_ENGINE,
      engineInvoker: makeFakeInvoker(log2, 'v2'),
      dirtyPages: new Set(['domains/ai']),
    });
    assert.equal(log2.prompts.length, 1, 'dirtyPages forces reconcile');
    assert.equal(result.pagesReconciled, 1);
  });
});

test('reconcileEntries: touchedPages filter restricts which targets run', async () => {
  await withTmpDataDir('reconcile-touched', async () => {
    await mkdir(mdEntriesDir(), { recursive: true });
    await mkdir(mdDomainsDir(), { recursive: true });
    await mkdir(mdCategoriesDir(), { recursive: true });
    await writeFile(path.join(mdDomainsDir(), 'ai.md'), '# AI\n');
    await writeFile(path.join(mdCategoriesDir(), 'tool.md'), '# tool\n');
    await writeFile(
      path.join(mdEntriesDir(), '2026-04-15-e.md'),
      '# entry\n\n[[domains/ai]] [[categories/tool]]',
    );
    const state = freshMdState();
    const log: FakeEngineLog = { prompts: [], outputs: [] };

    const result = await reconcileEntries({
      state,
      engine: FAKE_ENGINE,
      engineInvoker: makeFakeInvoker(log, 'updated'),
      touchedPages: new Set(['domains/ai']),
    });

    assert.equal(log.prompts.length, 1, 'only domains/ai should reconcile');
    assert.ok(log.prompts[0].includes('domains/ai'));
    assert.equal(result.pagesReconciled, 1);
    assert.equal(result.pagesSkipped, 1, 'categories/tool skipped by filter');
  });
});

test('reconcileEntries: engine failure counts as pagesFailed and does not update hashes', async () => {
  await withTmpDataDir('reconcile-fail', async () => {
    await mkdir(mdEntriesDir(), { recursive: true });
    await mkdir(mdDomainsDir(), { recursive: true });
    await writeFile(path.join(mdDomainsDir(), 'ai.md'), '# AI\n');
    await writeFile(path.join(mdEntriesDir(), '2026-04-15-e.md'), '# entry\n\n[[domains/ai]]');
    const state = freshMdState();
    const log: FakeEngineLog = { prompts: [], outputs: [] };

    const result = await reconcileEntries({
      state,
      engine: FAKE_ENGINE,
      engineInvoker: makeFakeInvoker(log, new Error('engine exploded')),
    });

    assert.equal(result.pagesReconciled, 0);
    assert.equal(result.pagesFailed, 1);
    assert.ok(
      !state.entryHashes?.['entries/2026-04-15-e'],
      'entry hash must not be recorded on failure — next run should retry',
    );
  });
});

test('reconcileEntries: aborts after 3 consecutive engine failures', async () => {
  await withTmpDataDir('reconcile-abort', async () => {
    await mkdir(mdEntriesDir(), { recursive: true });
    await mkdir(mdDomainsDir(), { recursive: true });
    await mkdir(mdCategoriesDir(), { recursive: true });
    await mkdir(mdEntitiesDir(), { recursive: true });
    // Four different targets to exceed the abort threshold.
    await writeFile(path.join(mdDomainsDir(), 'ai.md'), '# ai\n');
    await writeFile(path.join(mdCategoriesDir(), 'tool.md'), '# tool\n');
    await writeFile(path.join(mdEntitiesDir(), 'karpathy.md'), '# karpathy\n');
    await writeFile(path.join(mdCategoriesDir(), 'technique.md'), '# technique\n');
    await writeFile(
      path.join(mdEntriesDir(), '2026-04-15-e.md'),
      '# entry\n\n[[domains/ai]] [[categories/tool]] [[entities/karpathy]] [[categories/technique]]',
    );
    const state = freshMdState();
    const log: FakeEngineLog = { prompts: [], outputs: [] };

    const result = await reconcileEntries({
      state,
      engine: FAKE_ENGINE,
      engineInvoker: makeFakeInvoker(log, new Error('auth broken')),
    });

    assert.equal(result.aborted, true);
    assert.equal(result.pagesFailed, 3, 'stops after cap hits');
    assert.ok(log.prompts.length === 3, 'exactly 3 LLM calls before abort');
  });
});
