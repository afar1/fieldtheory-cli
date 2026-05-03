import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promptText } from './prompt.js';

// ── Skill content ────────────────────────────────────────────────────────────

const FRONTMATTER = `---
name: fieldtheory
description: Search the user's local X/Twitter bookmarks and turn bookmark groups into repo-aware roadmap grids. Trigger when the user mentions bookmarks, saved tweets, seeds, ft possible, 2x2 grids, roadmap ideas, or asks what to do next across projects.
---`;

const BODY = `
# Field Theory - Bookmark Search And Possible Roadmaps

Use the Field Theory CLI (\`ft\`) to search the user's local X/Twitter bookmark archive and, when asked, turn a bookmark group into a repo-aware roadmap plotted on a 2x2 grid.

## When to trigger

- User mentions bookmarks, saved tweets, or X/Twitter content they saved
- User asks to find something they bookmarked ("find that tweet about...")
- User asks a question their bookmarks could answer ("what AI tools have I been looking at?")
- User wants bookmark stats, patterns, or insights
- Starting a task where the user's reading history adds context
- User asks for a roadmap, grid, seed, node, dot, debate, or "what should I do next" across projects
- User says something like: "your goal is to look at XYZ type of bookmarks and debate / come up with a roadmap plotted in the grid of what I should do next across these projects"

## Search Workflow

1. Look at what the user is working on (conversation, open files, branch name)
2. Generate 2-3 targeted search queries
3. Run \`ft search <query>\` for each
4. Narrow with filters if needed
5. Summarize what you found — highlight relevant bookmarks, note patterns

## Possible Roadmap Workflow

When the user asks to turn a bookmark theme into a roadmap across projects:

1. Treat "XYZ type of bookmarks" as the seed query or filter.
2. Resolve "these projects" into repo paths. If the user named no projects, use the saved repo registry.
3. Pick a 2x2 frame. Use \`leverage-specificity\` by default, \`impact-effort\` for execution roadmaps, or \`novelty-feasibility\` for exploration.
4. Create a bookmark-grounded seed. Do not use \`ft seeds text\` for real work.
5. Run \`ft possible\` across the repos with a node count, model, and effort.
6. Report the grid first, then the top nodes, then the goal prompts the user can copy into an agent.

Use this shape:

\`\`\`bash
ft seeds search "<bookmark topic>" --days 180 --limit 8 --frame impact-effort --create
ft possible run --seed <seed-id> --repos <repo-a> <repo-b> <repo-c> --frame impact-effort --nodes 7 --model opus --effort medium
ft possible grid latest
ft possible dots latest
ft possible prompt <node-id>
\`\`\`

For long runs, use the background job path:

\`\`\`bash
ft possible run --seed <seed-id> --repos <repo-a> <repo-b> --nodes 7 --model opus --effort medium --background
ft possible jobs
ft possible job <job-id> --log
\`\`\`

For nightly roadmap generation on macOS:

\`\`\`bash
ft repos add <repo-a>
ft repos add <repo-b>
ft possible nightly install --time 02:00 --defaults --model opus --effort medium --nodes 5
ft possible nightly show
\`\`\`

If the user says "debate", use the existing \`ft possible\` pipeline as generate -> critique -> score. If they specifically require two models debating each other, say that the current CLI does not yet run a two-model back-and-forth loop.

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
ft seeds search <query> --create
ft repos add <path>
ft possible run --seed <id> --repos <paths...>
ft possible grid latest
ft possible dots latest
ft possible prompt <node-id>
ft possible nightly install --time 02:00 --defaults
\`\`\`

Combine filters: \`ft list --category tool --domain ai --limit 10\`

## Guidelines

- Start broad, narrow with filters
- Don't dump raw output — summarize and connect findings to the user's current work
- Cross-reference multiple queries to build a complete picture
- Look for recurring authors, topic clusters, and connections between bookmarks
- Ground roadmap work in actual bookmark-backed seeds
- Lead roadmap reports with the plotted grid and concrete next actions, not just prose
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
