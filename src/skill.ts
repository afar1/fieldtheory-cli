import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promptText } from './prompt.js';

// ── Skill content ────────────────────────────────────────────────────────────

const FRONTMATTER = `---
name: fieldtheory
description: Use the user's local Field Theory data, Library markdown, and portable commands. Trigger when the user mentions Field Theory, bookmarks, saved tweets, Library notes, wiki pages, reusable commands, or wants prior local context.
---`;

const BODY = `
# Field Theory — Local Context

Use the Field Theory CLI to inspect and work with the user's local context.

Field Theory has three main local surfaces:

- bookmarks: raw synced X/Twitter bookmark data
- library: readable markdown knowledge and authored notes
- commands: portable markdown actions in \`~/.fieldtheory/commands\`

## When to trigger

- User mentions Field Theory, the Library, wiki pages, portable commands, or reusable workflows
- User mentions bookmarks, saved tweets, or X/Twitter content they saved
- User asks to find something they bookmarked ("find that tweet about...")
- User asks a question their bookmarks could answer ("what AI tools have I been looking at?")
- User wants prior notes, local decisions, command files, stats, patterns, or insights
- Starting non-trivial work where local history may add context

## Workflow

1. Check paths and status when setup matters: \`ft paths --json\`, \`ft status --json\`
2. Search durable notes first when prior project knowledge matters: \`ft library search <query> --json\`
3. Search bookmarks when reading history or saved X/Twitter posts matter: \`ft search <query> --json\`
4. Inspect exact files or bookmarks with \`ft library show <path> --json\`, \`ft show <id> --json\`, or \`ft commands show <name> --json\`
5. Create or update durable Library notes and portable commands only when the user asks for a saved artifact
6. Open useful Library pages in the Mac app with \`ft library open <path>\`

## Commands

\`\`\`bash
ft paths --json                # Canonical bookmarks, library, commands paths
ft status --json               # Bookmark/classification status plus paths

ft search <query>              # Full-text BM25 search ("exact phrase", AND, OR, NOT)
ft list --category <cat>       # tool, technique, research, opinion, launch, security, commerce
ft list --domain <dom>         # ai, web-dev, startups, finance, design, devops, marketing, etc.
ft list --author @handle       # By author
ft list --after/--before DATE  # Date range (YYYY-MM-DD)
ft stats                       # Collection overview
ft viz                         # Terminal dashboard
ft show <id>                   # Full detail for one bookmark

ft library search <query>      # Search Field Theory Library markdown
ft library show <path>         # Read one Library page
ft library create <path>       # Create a Library page
ft library update <path>       # Replace a Library page with --stdin/--file plus guard
ft library open <path>         # Open a Library page in the Mac app

ft commands list               # List portable command markdown files
ft commands show <name>        # Read one command
ft commands new <name>         # Create a new command
ft commands validate [name]    # Check command shape
\`\`\`

Combine filters: \`ft list --category tool --domain ai --limit 10\`

## Guidelines

- Prefer JSON output when you need to inspect or cite exact fields
- Start with Library pages for durable project knowledge, then search bookmarks for source material
- Don't dump raw output; summarize and connect findings to the user's current work
- Cross-reference multiple queries to build a complete picture
- For updates, use \`--expected-sha256\` from a prior \`show --json\` result or pass \`--force\` only when explicitly appropriate
- In local app development, set \`FT_APP_DEV_DIR\` before \`ft library open\` so the CLI targets the Field Theory dev checkout instead of a generic Electron URL handler
- Deletes move local files to Trash; the Mac app owns Library sync and remote tombstones
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
