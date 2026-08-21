import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promptText } from './prompt.js';

// ── Skill content ────────────────────────────────────────────────────────────

const FRONTMATTER = `---
name: fieldtheory
description: Use the user's local Field Theory data, Library markdown, portable commands, and X/Twitter bookmarks; turn bookmark groups into repo-aware roadmap grids when asked. Trigger when the user mentions Field Theory, bookmarks, saved tweets, Library notes, wiki pages, commands, seeds, ft possible, 2x2 grids, roadmap ideas, or what to do next across projects.
---`;

const BODY = `
# Field Theory - Local Context And Possible Roadmaps

Use the Field Theory CLI to inspect and work with the user's local context.

Field Theory has four main local surfaces:

- bookmarks: raw synced X/Twitter bookmark data
- library: readable markdown knowledge and authored notes
- commands: portable markdown actions in \`~/.fieldtheory/library/Commands\`
- current document: the active Field Theory document attached to the app terminal

## When to trigger

- User mentions Field Theory, the Library, wiki pages, portable commands, or reusable workflows
- User mentions bookmarks, saved tweets, or X/Twitter content they saved
- User asks to find something they bookmarked ("find that tweet about...")
- User asks a question their bookmarks could answer ("what AI tools have I been looking at?")
- User wants prior notes, local decisions, command files, bookmark stats, patterns, or insights
- Starting non-trivial work where local history or reading history may add context
- User asks for a roadmap, grid, seed, node, dot, debate, or "what should I do next" across projects
- User says something like: "your goal is to look at XYZ type of bookmarks and debate / come up with a roadmap plotted in the grid of what I should do next across these projects"

## Search Workflow

1. Check paths and status when setup matters: \`ft paths --json\`, \`ft status --json\`
2. When the user asks what Field Theory document they are looking at, run \`ft current --json\`; the JSON includes the document body, source path, editability, hash, content mode, and line-number mapping when available
3. Check repo workflow state when branch/worktree/PR shape matters: \`ft state --json\`
4. When the user says "that file" or "the recent file", inspect current repo recency with \`ft recent --json\`
5. Search durable notes first when prior project knowledge matters: \`ft library search <query> --json\`
6. Search bookmarks when reading history or saved X/Twitter posts matter: \`ft search <query> --json\`
7. Inspect exact files or bookmarks with \`ft library show <path> --json\`, \`ft show <id> --json\`, or \`ft commands show <name> --json\`
8. Create or update durable Library notes and portable commands only when the user asks for a saved artifact
9. Open useful Library pages in the Mac app with \`ft library open <path>\`

## Current Document Editing Workflow

When the user asks you to edit the current Field Theory document, there is one supported path: read it through \`ft current\`, edit the Markdown normally, and write the complete edited Markdown back through \`ft current update\`.

1. Read the document, content, and hash: \`ft current --json\`
2. Edit the returned \`content\` as normal Markdown.
3. Send the complete edited Markdown back on stdin: \`ft current update --stdin --expected-sha256 <version.sha256>\`

After a successful update, use the newly printed \`sha256\` as the expected hash for the next edit to the same document. If the update says the file changed on disk, run \`ft current --json\` again, merge the user's requested change into the returned \`content\`, then retry once with the new \`version.sha256\`.

Never run \`ft current update --stdin\` by itself. It must receive the full edited document content on stdin. For multiline edits, pipe the content on stdin; do not pass Markdown as command arguments.

Do not use ad hoc \`sed -i\`, \`awk > file\`, \`cat\` against \`sourcePath\`, the Codex \`apply_patch\` tool, direct filesystem writes, context-cache files, temp-file rewrites, or invented commands such as \`ft edit\` for Field Theory document edits.

When the user asks about a line number in the current document, read \`lineNumbers\` from \`ft current --json\` before answering. If \`lineNumbers.activeLineKind\` is \`renderedVisual\`, the user is referring to visible rendered rows; answer from \`lineNumbers.lines[].visibleLine\` and use \`sourceLine\` only as the Markdown source mapping. Do not answer visible-line questions by splitting \`content\` on newlines unless \`lineNumbers.activeLineKind\` is \`source\` or no line map is available.

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
ft possible grid latest          # latest run or batch
ft possible grid latest-batch    # latest multi-repo batch
ft possible dots latest
ft possible prompt <node-id>
\`\`\`

For long runs, use the background job path:

\`\`\`bash
ft possible run --seed <seed-id> --repos <repo-a> <repo-b> --nodes 7 --model opus --effort medium --background
ft possible jobs
ft possible job <job-id> --log
\`\`\`

LLM-backed commands default to the user's logged-in Claude Code/Codex CLI account. Only use API/provider billing env vars when the user explicitly sets \`FT_ENGINE_AUTH_MODE=api\`.

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
ft paths --json                # Canonical bookmarks, library, commands paths
ft status --json               # Bookmark/classification status plus paths
ft current --json              # Read current Markdown plus sourcePath, contentMode, lineNumbers, editable, and version.sha256
ft current --summary --json    # Active Field Theory document metadata without the full body
ft current update --stdin --expected-sha256 <sha>   # Replace the actual current source file with stdin
ft state --json                # Repo workflow state: root, workers, PRs, cleanup, next step
ft recent --json               # Current repo last-modified file and recent files for agent references

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
ft possible grid latest          # latest run or batch
ft possible grid latest-batch    # latest multi-repo batch
ft possible dots latest
ft possible prompt <node-id>
ft possible nightly install --time 02:00 --defaults

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
- Look for recurring authors, topic clusters, and connections between bookmarks
- Ground roadmap work in actual bookmark-backed seeds
- Lead roadmap reports with the plotted grid and concrete next actions, not just prose
- For updates, use \`--expected-sha256\` from a prior \`show --json\` result or pass \`--force\` only when explicitly appropriate
- For current-document edits, use \`ft current --json\` followed by \`ft current update --stdin --expected-sha256 <sha>\`; treat \`sourcePath\` as identity/debugging context, not an invitation to bypass the update command
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

export interface InstallSkillOptions {
  force?: boolean;
}

export async function installSkill(options: InstallSkillOptions = {}): Promise<SkillResult[]> {
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

      if (!options.force) {
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
