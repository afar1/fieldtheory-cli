---
name: fieldtheory
description: Explain and drive the Field Theory CLI — bookmark-sourced seeds, repo-aware ideas runs that score ideas onto a 2x2 grid, and the interconnected .md files they leave behind. Trigger when the user asks about `ft`, bookmarks, seeds, ideas, grids, dots/nodes, or how to turn saved tweets into code suggestions against a repo.
---

# Field Theory CLI

The Field Theory CLI (`ft`) is a self-custody bookmark tool that does two related things:

1. **Local X/Twitter bookmark archive** — sync, full-text search, classify, visualize.
2. **Ideas runs** — take a group of bookmarks, apply them to a set of repos, and score candidate directions onto a 2x2 grid. Each scored idea is a "node" (also called a "dot") with a paragraph summary, a copiable prompt, and per-axis justifications. Seeds, runs, nodes, and batches are all saved as interconnected markdown files.

Everything runs locally. Bookmark storage lives at `~/.ft-bookmarks/`; ideas data lives at `~/.fieldtheory/ideas/`. Nothing leaves the machine.

## Mental model — the ideas flow

A **seed** is not raw text. A seed is:

- **A bookmark, or a group of bookmarks** (the external context/ideas)
- **+ a repo** or a **set of repos** (the codebases to apply them to)
- **+ a frame** (the 2x2 axes that shape the debate — e.g. Leverage × Specificity)

Those three things together shape a **run**. A run invokes an LLM pipeline that reads the seed, scans each repo, generates candidate directions, critiques them, and scores the survivors onto the 2x2. Each scored candidate becomes a **node/dot** on the grid with:

- title + paragraph summary
- rationale ("why adjacent")
- axis A score + justification, axis B score + justification
- effort estimate (hours / days / weeks)
- a **copiable prompt** that can be pasted into any AI coding agent to actually build the thing

When a run spans multiple repos, the seed brief is computed **once** and reused across every repo (via the seed-brief cache), then each repo gets its own `survey → generate → critique → score` pass and its own consideration. A top-level `batch_summary` artifact + markdown file links them all together.

Seeds, runs, nodes, and batches are all written as `.md` files under:

```
~/.fieldtheory/ideas/
├── seeds/<YYYY-MM-DD>/*.md
├── runs/<YYYY-MM-DD>/*.md
├── nodes/<YYYY-MM-DD>/*.md
├── batches/<YYYY-MM-DD>/*.md
├── seeds.json        # seed store
├── repos.json        # saved default repo set
├── frames.json       # user-defined frames (built-ins are in-code)
├── index.json        # app-facing manifest
└── adjacent/         # internal artifact + cache storage
```

Every `.md` file has YAML frontmatter cross-links (`related_run_ids`, `related_node_ids`, `related_seed_ids`, `consideration_ids`, `repos`). The index manifest lets UIs (e.g. the Field Theory Mac app) browse runs and nodes.

**Upgraded from an earlier version?** The CLI migrates data from `~/.ft-bookmarks/automation/{ideas,adjacent}/` to `~/.fieldtheory/ideas/` on first run. The legacy copy is left in place for user verification.

## Authoritative seed sources

Seeds should always be grounded in the user's actual bookmarks, not made up. Three bookmark-driven seed strategies:

| Command | Strategy |
|---|---|
| `ft seeds search "<query>" [filters] --create` | FTS-driven pool from matching bookmarks |
| `ft seeds recent [--days N filters] --create` | Most-recently-bookmarked pool |
| `ft seeds random --pick "<phrase>" --mode model --create` | Mini-game: pick a random word-pair, the model clusters bookmarks into seed groups |

Filters: `--category`, `--domain`, `--folder`, `--author`, `--days`, `--limit`. Omit `--create` to preview the bookmark pool without saving.

**Pin a frame at seed-create time** with `--frame <id>`: the seed remembers its preferred axes, and `ft ideas run` can use it without requiring `--frame` again. Explicit `--frame` on `ideas run` still wins over the seed-pinned frame.

**Do not** use `ft seeds text "..."` for demos or walkthroughs — it creates a text-only seed with no bookmark grounding, which defeats the purpose of the tool.

## Driving a run end-to-end

### Single repo

```bash
# 1. Preview a bookmark pool (no side effects)
ft seeds search "agents" --days 90 --limit 8

# 2. Save it as a seed, pinning the frame you want
ft seeds search "agents" --days 90 --limit 8 --frame leverage-specificity --create

# 3. Run ideas: apply the bookmark group to this repo
ft ideas run --seed <seed-id> --repo . --depth quick

# 4. View the grid and the full scored node list
ft ideas grid latest
ft ideas dots latest

# 5. Export a specific node as a prompt to paste into an AI agent
ft ideas prompt <dot-id>
```

### Multiple repos (batched run)

```bash
# Option A: pass them inline
ft ideas run --seed <seed-id> --repos ~/dev/repo-a ~/dev/repo-b ~/dev/repo-c

# Option B: save a default repo set once, then omit --repos on subsequent runs
ft repos add ~/dev/repo-a
ft repos add ~/dev/repo-b
ft repos add ~/dev/repo-c
ft ideas run --seed <seed-id>          # uses the saved set

# Inspect the batch after it completes
ft ideas list                          # shows each per-repo run
ft ideas grid <run-id>                 # one grid per repo
```

A batched run prints a batch id, lists the top ideas across all repos (tagged by repo), and writes a `batch_summary` markdown file at `~/.fieldtheory/ideas/batches/<YYYY-MM-DD>/<batch-id>.md` that links every per-repo consideration and includes a re-run command.

### `ft repos` — manage the default repo set

```bash
ft repos                    # show what's saved (header + count)
ft repos list               # one per line, machine-parseable
ft repos add <path>         # normalizes ~, resolves relative, dedupes
ft repos remove <path>
ft repos clear
```

Precedence when `ft ideas run` resolves which repos to target: `--repos` > `--repo` > saved registry. Passing both `--repo` and `--repos` is an error.

Depth controls the LLM budget (candidate target, survey file limit, timeout): `quick | standard | deep`.

## Frames (2x2 axes)

Six built-in frames:

- `leverage-specificity` (default) — Foundational fix vs speculative platform
- `novelty-feasibility` — Quick wins vs moonshots
- `impact-effort` — Sweep vs slog
- `conviction-reversibility` — Just do it vs cheap experiment
- `exposure-hardening` (risk) — Why haven't we vs don't bother
- `blast-radius-detection` (risk) — Career-ender vs debugging rabbit hole

### Custom frames

Users can add their own frames via `ft frames add <file.json>` where the JSON file contains a single frame object with: `id` (lowercase kebab-case), `name`, `group` (`"building"` or `"risk"`), `generationPromptAddition`, `axisA` / `axisB` (each with `label` + `rubricSentence`), and `quadrantLabels` (`highHigh`, `highLow`, `lowHigh`, `lowLow`). Custom frames are stored in `~/.fieldtheory/ideas/frames.json`; built-in ids cannot be shadowed.

```bash
ft frames                    # list built-in + user frames with origin tag
ft frames list               # machine-parseable, one per line
ft frames show <id>          # full detail: group, axes, quadrants, generation addition
ft frames add <file.json>    # add or update a user frame (validated on disk before saving)
ft frames remove <id>        # remove a user frame; built-ins cannot be removed
```

Precedence when `ft ideas run` resolves which frame to use: explicit `--frame <id>` > seed-pinned `seed.frameId` > default (`leverage-specificity`).

## Bookmark-search commands (pre-ideas)

When the user wants to find bookmarks for their own purposes (not to feed an ideas run):

```bash
ft search "<query>"          # Full-text BM25 search ("exact phrase", AND, OR, NOT)
ft list --category <cat>     # tool, technique, research, opinion, launch, security, commerce
ft list --domain <dom>       # ai, web-dev, startups, finance, design, devops, marketing, etc.
ft list --folder <name>      # X bookmark folder (read-only mirror)
ft list --author @handle     # By author
ft list --after/--before DATE
ft stats                     # Collection overview
ft viz                       # Terminal dashboard
ft show <id>                 # Full detail for one bookmark
ft folders                   # Folder distribution
```

Sync commands:

```bash
ft sync                      # Incremental GraphQL sync from Chrome session cookies
ft sync --gaps               # Backfill missing quoted tweets, expand truncated text, fetch full article HTML
ft sync --folders            # Sync X bookmark folder tags
ft sync --rebuild            # Full re-crawl (keeps existing data, merges)
```

## Known gaps vs the full vision

A reader planning work on `ft` should know what does *not* yet exist:

- **Two-model debate** — the pipeline uses one resolved engine (claude OR codex, picked once). The `critique` stage is single-model self-critique, not a back-and-forth between two models.
- **N-turn back-and-forth loop** — the pipeline is a linear 5-stage single pass (`read → survey → generate → critique → score`). `--depth` changes budgets, not turn count.
- **Background / overnight scheduling** — no scheduler, no cron/launchd, no `ft schedule`. Runs are foreground. Shell-backgrounding works but there's no built-in overnight orchestration.
- **Nightly email per grid** — no email code in the CLI. The Mac app has `nodemailer` + `agentmail` in its dependencies but isn't wired to ideas-run summaries yet.
- **Mac app 2x2 grid view** — `LibrarianView` and `ConceptGraphView` render a markdown reader and a force-directed concept graph for a *different* "librarian" system (reading artifacts). There is no mac-app view that reads `~/.fieldtheory/ideas/` and renders the 2x2 grid.

Do not describe these as working. If a user asks for any of them, explain that it is planned but unbuilt, or point them at the closest existing primitive.

## When to trigger this skill

- User mentions bookmarks, saved tweets, or X/Twitter archives
- User says "seed", "seeds", "ideas run", "2x2 grid", "dots", "nodes", "frame", "batch"
- User wants to apply their reading history to a specific repo or set of repos
- User asks how `ft` works, what it can do, or how to test a new feature on the CLI
- User asks for a plan, prompt, or task breakdown that their bookmarks could ground

## Guidelines

- Ground every seed in actual bookmarks — never `seeds text` for real work
- When previewing a pool, show the user the candidates before `--create`ing
- When a seed has a pinned frame, honor it — don't add a redundant `--frame` unless you want to override
- When running across multiple repos, use `--repos` or the saved registry, not N separate `ft ideas run` invocations
- When reporting results, lead with the grid (`ft ideas grid <run-id>`) and let the user drill into `ft ideas dots <run-id>` or `ft ideas prompt <dot-id>` for detail
- For batched runs, point at the batch summary file alongside the per-repo grids so the user can see top ideas across all repos in one place
- If a user asks for something in "Known gaps" above, say so explicitly rather than faking it
