---
name: field-theory
description: Use the Field Theory CLI (ft) to search, explore, classify, and manage the user's X/Twitter bookmarks stored locally. Trigger this skill whenever the user mentions bookmarks, saved tweets, X/Twitter content they've saved, wants to find something they bookmarked, asks about their reading/saving patterns, wants bookmark stats or insights, mentions "ft" commands, asks to sync or classify bookmarks, or wants to explore what they've been saving on X. Also trigger when the user asks questions that their bookmarks might help answer — like "what tools have I been looking at" or "what did I save about real estate" or "find that tweet about..." — even if they don't explicitly say "bookmarks". This is effectively the user's personal knowledge base from X.
---

# Field Theory CLI

Field Theory (`ft`) is a local-first CLI for syncing, searching, classifying, and exploring X/Twitter bookmarks. All data lives at `~/.ft-bookmarks/` as SQLite + JSONL. No telemetry, fully private.

## When to use this skill

- User asks about their bookmarks or saved tweets
- User wants to find something they saved on X
- User asks "what have I bookmarked about X" or "find that tweet about Y"
- User wants bookmark statistics, patterns, or insights
- User asks to sync, classify, or manage bookmarks
- User references `ft` commands directly
- User asks a question their bookmark history might help answer (e.g., "what AI tools have I been looking at?")

## Commands Reference

### Syncing

```bash
ft sync                  # Incremental sync via Chrome session (macOS)
ft sync --full           # Full history crawl
ft sync --classify       # Sync then auto-classify new bookmarks with LLM
ft sync --api            # Sync via OAuth (cross-platform, requires ft auth first)
ft auth                  # Set up OAuth for API-based sync
```

Sync uses Chrome's active X session by default (macOS only). For other platforms, set up OAuth with `ft auth` then use `ft sync --api`.

### Searching

```bash
ft search <query>                    # Full-text BM25-ranked search
ft search "distributed systems"      # Exact phrase
ft search "AI AND agent"             # Boolean AND
ft search "startup OR founder"       # Boolean OR
ft search "python NOT beginner"      # Boolean NOT
ft search <query> --limit 30         # Control result count
```

Search is powered by SQLite FTS5 with BM25 ranking. Use it for finding specific content, topics, or authors the user has bookmarked.

### Listing and Filtering

```bash
ft list                              # List all bookmarks
ft list --category tool              # Filter by category
ft list --domain ai                  # Filter by subject domain
ft list --author @username           # Filter by author
ft list --after 2025-01-01           # Date filtering
ft list --before 2025-06-01          # Date filtering
ft list --limit 20                   # Control result count
```

Filters can be combined: `ft list --category technique --domain ai --limit 10`

### Classification

```bash
ft classify              # LLM-powered category + domain classification
ft classify --regex      # Fast regex-based classification (no LLM needed)
ft classify-domains      # Classify by subject domain only
```

Classification requires the `claude` or `codex` CLI to be available. Use `--regex` for a quick pass without LLM costs.

### Analytics and Visualization

```bash
ft stats                 # Top authors, languages, date range, counts
ft viz                   # Rich terminal dashboard with sparklines
ft categories            # Category distribution breakdown
ft domains               # Subject domain distribution
ft sample <category>     # Random sample from a category
```

`ft viz` is the richest view — shows hidden gems, time capsules, top voices, categories, domains, link destinations, composition, and a fingerprint summary.

### Other Commands

```bash
ft show <id>             # Show one bookmark in full detail
ft index                 # Rebuild SQLite index from JSONL cache
ft status                # Sync status and data location
ft path                  # Print data directory path
ft fetch-media           # Download static images for bookmarks
```

## Categories

These are the classification categories assigned by the LLM classifier:

| Category | What it captures |
|---|---|
| `tool` | GitHub repos, CLI tools, npm packages, open-source projects |
| `security` | CVEs, vulnerabilities, exploits, supply chain |
| `technique` | Tutorials, demos, code patterns, implementation guides |
| `launch` | Product launches, announcements, "just shipped" updates |
| `research` | ArXiv papers, studies, academic findings |
| `opinion` | Takes, analysis, commentary, threads |
| `commerce` | Products, shopping, physical goods |

## Subject Domains

Domains are a separate classification axis from categories — they capture the subject area:

`ai`, `startups`, `web-dev`, `finance`, `design`, `devops`, `marketing`, `education`, `media`, `career`, `health`, `politics`, `hardware`, `real-estate`, `personal-development`

## How to use this skill effectively

**For finding specific content:** Use `ft search` with targeted queries. Boolean operators help narrow results. Start broad, then filter.

**For exploring patterns:** Use `ft viz` for the full dashboard, `ft stats` for quick numbers, or `ft categories`/`ft domains` for distribution breakdowns.

**For answering "what have I saved about X":** Combine `ft search` with `ft list --category` or `ft list --domain` filters. Cross-reference multiple queries to build a complete picture.

**For deep analysis:** Pull data from multiple commands, synthesize patterns, and surface insights the user wouldn't see from individual bookmarks. Look for recurring authors, topic clusters, evolving interests over time, and connections between bookmarks.

**When presenting results:** Don't just dump raw output. Summarize what you found, highlight the most relevant bookmarks, and add context about patterns you notice. The user saved these bookmarks for a reason — help them rediscover that value.
