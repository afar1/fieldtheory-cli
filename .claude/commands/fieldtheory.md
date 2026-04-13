---
name: fieldtheory
description: Explain and drive the Field Theory CLI — bookmark-sourced seeds, repo-aware ideas runs that score ideas onto a 2x2 grid, and the interconnected .md files they leave behind. Trigger when the user asks about `ft`, bookmarks, seeds, ideas, grids, dots/nodes, or how to turn saved tweets into code suggestions against a repo.
---

# Field Theory CLI

The Field Theory CLI (`ft`) is a self-custody bookmark tool that does two related things:

1. **Local X/Twitter bookmark archive** — sync, full-text search, classify, visualize.
2. **Ideas runs** — take a group of bookmarks, apply them to a repo, and score candidate directions onto a 2x2 grid. Each scored idea is a "node" (also called a "dot") with a paragraph summary, a copiable prompt, and per-axis justifications. Runs, seeds, and nodes are all saved as interconnected markdown files.

Everything runs locally. Data lives under `~/.ft-bookmarks/`. Nothing leaves the machine.

## Mental model — the ideas flow

A **seed** is not raw text. A seed is:

- **A bookmark, or a group of bookmarks** (the external context/ideas)
- **+ a repo** (the codebase to apply them to)
- **+ a frame** (the 2x2 axes that shape the debate — e.g. Leverage × Specificity)

Those three things together shape a **run**. A run invokes an LLM pipeline that reads the seed, scans the repo, generates candidate directions, critiques them, and scores the survivors onto the 2x2. Each scored candidate becomes a **node/dot** on the grid with:

- title + paragraph summary
- rationale ("why adjacent")
- axis A score + justification, axis B score + justification
- effort estimate (hours / days / weeks)
- a **copiable prompt** that can be pasted into any AI coding agent to actually build the thing

Seeds, runs, and nodes are all written as `.md` files under `~/.ft-bookmarks/automation/ideas/{seeds,runs,nodes}/<YYYY-MM-DD>/` with YAML frontmatter cross-links (`related_run_ids`, `related_node_ids`, `related_seed_ids`). An app-facing index manifest is written so UIs (e.g. the Field Theory Mac app) can browse runs and nodes.

## Authoritative seed sources

Seeds should always be grounded in the user's actual bookmarks, not made up. Three bookmark-driven seed strategies:

| Command | Strategy |
|---|---|
| `ft seeds search "<query>" [filters] --create` | FTS-driven pool from matching bookmarks |
| `ft seeds recent [--days N filters] --create` | Most-recently-bookmarked pool |
| `ft seeds random --pick "<phrase>" --mode model --create` | Mini-game: pick a random word-pair, the model clusters bookmarks into seed groups |

Filters: `--category`, `--domain`, `--folder`, `--author`, `--days`, `--limit`. Omit `--create` to preview the bookmark pool without saving.

**Do not** use `ft seeds text "..."` for demos or walkthroughs — it creates a text-only seed with no bookmark grounding, which defeats the purpose of the tool.

## Driving a run end-to-end

```bash
# 1. Preview a bookmark pool (no side effects)
ft seeds search "agents" --days 90 --limit 8

# 2. Save it as a seed if the preview looks right
ft seeds search "agents" --days 90 --limit 8 --create

# 3. Run ideas: apply the bookmark group to this repo
ft ideas run --seed <seed-id> --repo . --depth quick

# 4. View the grid and the full scored node list
ft ideas grid latest
ft ideas dots latest

# 5. Export a specific node as a prompt to paste into an AI agent
ft ideas prompt <dot-id>
```

Depth controls the budget (candidate target, survey file limit, timeout): `quick | standard | deep`.

## Frames (2x2 axes)

Six built-in frames. Pick with `--frame <id>`:

- `leverage-specificity` (default) — Foundational fix vs speculative platform
- `novelty-feasibility` — Quick wins vs moonshots
- `impact-effort` — Sweep vs slog
- `conviction-reversibility` — Just do it vs cheap experiment
- `exposure-hardening` (risk) — Why haven't we vs don't bother
- `blast-radius-detection` (risk) — Career-ender vs debugging rabbit hole

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

- **Multi-repo runs** — `--repo` takes a single path; no `--repos`. A "set of repos" means multiple separate runs today.
- **Frame saved with seed** — frames are chosen at `ideas run` time, not stored on the seed. Custom/user-defined frames don't exist; only the 6 presets.
- **Two-model debate** — the pipeline uses one resolved engine (claude OR codex, picked once). The `critique` stage is single-model self-critique, not a back-and-forth between two models.
- **N-turn back-and-forth loop** — the pipeline is a linear 5-stage single pass (`read → survey → generate → critique → score`). `--depth` changes budgets, not turn count.
- **Background / overnight scheduling** — no scheduler, no cron/launchd, no `ft schedule`. Runs are foreground. Shell-backgrounding works but there's no built-in overnight orchestration.
- **Nightly email per grid** — no email code in the CLI. The Mac app has `nodemailer` + `agentmail` in its dependencies but isn't wired to ideas-run summaries yet.
- **Mac app 2x2 grid view** — `LibrarianView` and `ConceptGraphView` exist but they render a markdown reader and a force-directed concept graph for a *different* "librarian" system (reading artifacts). There is no mac-app view that reads `~/.ft-bookmarks/automation/ideas/` or `~/.ft-bookmarks/ideas/index.json` and renders the 2x2 grid.

Do not describe these as working. If a user asks for any of them, explain that it is planned but unbuilt, or point them at the closest existing primitive.

## When to trigger this skill

- User mentions bookmarks, saved tweets, or X/Twitter archives
- User says "seed", "seeds", "ideas run", "2x2 grid", "dots", "nodes", "frame"
- User wants to apply their reading history to a specific repo
- User asks how `ft` works, what it can do, or how to test a new feature on the CLI
- User asks for a plan, prompt, or task breakdown that their bookmarks could ground

## Guidelines

- Ground every seed in actual bookmarks — never `seeds text` for real work
- When previewing a pool, show the user the candidates before `--create`ing
- Treat the repo argument as required; don't assume CWD silently
- When reporting results, lead with the grid (`ft ideas grid latest`) and let the user drill into `ft ideas dots latest` or `ft ideas prompt <dot-id>` for detail
- If a user asks for something in "Known gaps" above, say so explicitly rather than faking it
