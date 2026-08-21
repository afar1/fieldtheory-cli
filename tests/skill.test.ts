import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { skillWithFrontmatter, skillBody, installSkill } from '../src/skill.js';

describe('skill content', () => {
  it('skillWithFrontmatter includes YAML frontmatter', () => {
    const content = skillWithFrontmatter();
    assert.ok(content.startsWith('---\n'));
    assert.ok(content.includes('name: fieldtheory'));
    assert.ok(content.includes('description:'));
    // Frontmatter closes
    assert.ok(content.indexOf('---', 4) > 0);
  });

  it('skillBody has no frontmatter', () => {
    const content = skillBody();
    assert.ok(!content.startsWith('---'));
    assert.ok(content.startsWith('# Field Theory'));
  });

  it('both versions include key commands', () => {
    for (const content of [skillWithFrontmatter(), skillBody()]) {
      assert.ok(content.includes('ft paths --json'));
      assert.ok(content.includes('ft status --json'));
      assert.ok(content.includes('ft current --json'));
      assert.ok(content.includes('ft current --summary --json'));
      assert.ok(content.includes('ft current update --stdin --expected-sha256 <sha>'));
      assert.ok(content.includes('ft search'));
      assert.ok(content.includes('ft list'));
      assert.ok(content.includes('ft stats'));
      assert.ok(content.includes('ft show'));
      assert.ok(content.includes('ft seeds search'));
      assert.ok(content.includes('ft possible run'));
      assert.ok(content.includes('ft possible grid'));
      assert.ok(content.includes('ft possible prompt'));
      assert.ok(content.includes('ft possible nightly install'));
      assert.ok(content.includes('ft library search'));
      assert.ok(content.includes('ft library show'));
      assert.ok(content.includes('ft commands list'));
      assert.ok(content.includes('ft commands validate'));
    }
  });

  it('skill teaches natural-language roadmap requests', () => {
    const content = skillWithFrontmatter();
    assert.ok(content.includes('XYZ type of bookmarks'));
    assert.ok(content.includes('roadmap plotted in the grid'));
    assert.ok(content.includes('these projects'));
    assert.ok(content.includes('generate -> critique -> score'));
  });

  it('skill teaches agents not to bypass the document edit protocol', () => {
    const content = skillWithFrontmatter();
    assert.ok(content.includes('there is one supported path'));
    assert.ok(content.includes('Edit the returned `content` as normal Markdown'));
    assert.ok(content.includes('Send the complete edited Markdown back on stdin'));
    assert.ok(content.includes('After a successful update, use the newly printed `sha256`'));
    assert.ok(content.includes('run `ft current --json` again, merge the user'));
    assert.ok(content.includes('For multiline edits, pipe the content on stdin'));
    assert.ok(content.includes('Never run `ft current update --stdin` by itself'));
    assert.ok(content.includes('Do not use ad hoc `sed -i`'));
    assert.ok(content.includes('the Codex `apply_patch` tool'));
    assert.ok(content.includes('sourcePath` as identity/debugging context'));
    assert.ok(!content.includes('ft current --content-only'));
    assert.ok(!content.includes('ft current update --file <temp-file>'));
    assert.ok(!content.includes('ft current --include-content --json'));
  });

  it('skill content ends with newline', () => {
    assert.ok(skillWithFrontmatter().endsWith('\n'));
    assert.ok(skillBody().endsWith('\n'));
  });

  it('installSkill can force-update existing agent skill files', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-skill-home-'));
    const previousHome = process.env.HOME;
    process.env.HOME = home;

    try {
      fs.mkdirSync(path.join(home, '.claude', 'commands'), { recursive: true });
      fs.mkdirSync(path.join(home, '.codex', 'instructions'), { recursive: true });
      const claudePath = path.join(home, '.claude', 'commands', 'fieldtheory.md');
      const codexPath = path.join(home, '.codex', 'instructions', 'fieldtheory.md');
      fs.writeFileSync(claudePath, 'old claude skill', 'utf-8');
      fs.writeFileSync(codexPath, 'old codex skill', 'utf-8');

      const results = await installSkill({ force: true });

      assert.deepEqual(results.map((r) => r.action), ['updated', 'updated']);
      assert.ok(fs.readFileSync(claudePath, 'utf-8').includes('ft current --json'));
      assert.ok(fs.readFileSync(codexPath, 'utf-8').includes('ft current --json'));
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
