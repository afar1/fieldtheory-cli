import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { skillWithFrontmatter, skillBody } from '../src/skill.js';

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
      assert.ok(content.includes('ft search'));
      assert.ok(content.includes('ft list'));
      assert.ok(content.includes('ft stats'));
      assert.ok(content.includes('ft show'));
    }
  });

  it('skill content ends with newline', () => {
    assert.ok(skillWithFrontmatter().endsWith('\n'));
    assert.ok(skillBody().endsWith('\n'));
  });
});
