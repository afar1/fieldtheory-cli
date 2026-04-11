import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promptText } from './prompt.js';

// ── Skill content ────────────────────────────────────────────────────────────

const FRONTMATTER = `---
name: fieldtheory
description: Search the user's local X/Twitter bookmarks for content relevant to their current work. Trigger when the user mentions bookmarks, saved tweets, wants to find something they saved, or asks questions their bookmark history could answer.
---`;

const BODY = `
# Field Theory — Contextual Bookmark Search

Search the user's local X/Twitter bookmark archive for content relevant to the current task.

## When to trigger

- User mentions bookmarks, saved tweets, or X/Twitter content they saved
- User asks to find something they bookmarked ("find that tweet about...")
- User asks a question their bookmarks could answer ("what AI tools have I been looking at?")
- User wants bookmark stats, patterns, or insights
- Starting a task where the user's reading history adds context

## Workflow

1. Look at what the user is working on (conversation, open files, branch name)
2. Generate 2-3 targeted search queries
3. Run \`ft search <query>\` for each
4. Narrow with filters if needed
5. Summarize what you found — highlight relevant bookmarks, note patterns

## Commands

\`\`\`bash
ft search <query>              # Full-text BM25 search ("exact phrase", AND, OR, NOT)
ft list --category <cat>       # tool, technique, research, opinion, launch, security, commerce
ft list --domain <dom>         # ai, web-dev, startups, finance, design, devops, marketing, etc.
ft list --author @handle       # By author
ft list --after/--before DATE  # Date range (YYYY-MM-DD)
ft stats                       # Collection overview
ft viz                         # Terminal dashboard
ft show <id>                   # Full detail for one bookmark
\`\`\`

Combine filters: \`ft list --category tool --domain ai --limit 10\`

## Guidelines

- Start broad, narrow with filters
- Don't dump raw output — summarize and connect findings to the user's current work
- Cross-reference multiple queries to build a complete picture
- Look for recurring authors, topic clusters, and connections between bookmarks
`;

/** Full skill file with YAML frontmatter (for Claude Code commands). */
export function skillWithFrontmatter(): string {
  return `${FRONTMATTER}\n${BODY}`.trim() + '\n';
}

/** Skill body without frontmatter (for AGENTS.md / Codex). */
export function skillBody(): string {
  return BODY.trim() + '\n';
}

// ── Detection ────────────────────────────────────────────────────────────────

interface Agent {
  name: string;
  detected: boolean;
  installPath: string;
}

function detectAgents(): Agent[] {
  const home = os.homedir();
  return [
    {
      name: 'Claude Code',
      detected: fs.existsSync(path.join(home, '.claude')),
      installPath: path.join(home, '.claude', 'commands', 'fieldtheory.md'),
    },
    {
      name: 'Codex',
      detected: fs.existsSync(path.join(home, '.codex')),
      installPath: path.join(home, '.codex', 'instructions', 'fieldtheory.md'),
    },
  ];
}

// ── Install / uninstall ──────────────────────────────────────────────────────

export interface SkillResult {
  agent: string;
  path: string;
  action: 'installed' | 'updated' | 'up-to-date' | 'removed';
}

export async function installSkill(): Promise<SkillResult[]> {
  const detected = detectAgents();
  const targets = detected.filter((a) => a.detected);

  if (targets.length === 0) {
    // Nothing auto-detected — fall back to Claude Code as default
    const home = os.homedir();
    targets.push({
      name: 'Claude Code',
      detected: false,
      installPath: path.join(home, '.claude', 'commands', 'fieldtheory.md'),
    });
  }

  const results: SkillResult[] = [];
  for (const agent of targets) {
    const dir = path.dirname(agent.installPath);
    fs.mkdirSync(dir, { recursive: true });

    const content = agent.name === 'Codex' ? skillBody() : skillWithFrontmatter();
    const exists = fs.existsSync(agent.installPath);

    if (exists) {
      const existing = fs.readFileSync(agent.installPath, 'utf-8');
      if (existing === content) {
        results.push({ agent: agent.name, path: agent.installPath, action: 'up-to-date' });
        continue;
      }

      const answer = await promptText(`  ${agent.name} skill already exists. Overwrite? (y/n/compare) `);
      if (answer.kind !== 'answer') continue;
      const val = answer.value.toLowerCase();

      if (val === 'compare' || val === 'c') {
        console.log(`\n  ── Installed (${agent.installPath}) ──`);
        console.log(existing);
        console.log(`  ── New ──`);
        console.log(content);
        const confirm = await promptText(`  Overwrite with new version? (y/n) `);
        if (confirm.kind !== 'answer' || confirm.value.toLowerCase() !== 'y') continue;
      } else if (val !== 'y') {
        continue;
      }
    }

    fs.writeFileSync(agent.installPath, content, 'utf-8');
    results.push({ agent: agent.name, path: agent.installPath, action: exists ? 'updated' : 'installed' });
  }
  return results;
}

export function uninstallSkill(): SkillResult[] {
  const detected = detectAgents();
  const results: SkillResult[] = [];
  for (const agent of detected) {
    if (fs.existsSync(agent.installPath)) {
      fs.unlinkSync(agent.installPath);
      results.push({ agent: agent.name, path: agent.installPath, action: 'removed' });
    }
  }
  return results;
}
