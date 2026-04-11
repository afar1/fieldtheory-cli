# Field Theory CLI

Sync and store locally all of your X/Twitter bookmarks. Search, classify, and make them available to Claude Code, Codex, or any agent with shell access.

Free and open source. Designed for Mac.

## Running locally

**Important:** If you have this installed globally (`npm install -g fieldtheory`), make sure to run the local version for development:

```bash
pnpm start <command>
# or
npm run start -- <command>
```

The global `ft` command may be a different version than the local codebase.

## Install

```bash
npm install -g fieldtheory
```

Requires Node.js 20+. Chrome recommended for session sync; OAuth available for all platforms.

## Quick start

```bash
# 1. Sync your bookmarks (needs Chrome logged into X)
ft sync

# 2. Search them
ft search "distributed systems"

# 3. Explore
ft viz
ft categories
ft stats
```

On first run, `ft sync` extracts your X session from Chrome and downloads your bookmarks into `~/.ft-bookmarks/`.

## Commands

### sync
Download and sync bookmarks from X into your local database.

| Flag | Description |
|------|-------------|
| (default) | Incremental sync from your last bookmark |
| `--rebuild` | Full re-crawl of all bookmarks |
| `--gaps` | Backfill missing data (quoted tweets, truncated articles) |
| `--classify` | Classify new bookmarks with LLM after syncing |
| `--api` | Use OAuth v2 API instead of Chrome session |
| `--yes` | Skip confirmation prompts |
| `--max-pages <n>` | Max pages to fetch (default: 500) |
| `--target-adds <n>` | Stop after N new bookmarks |
| `--delay-ms <n>` | Delay between requests in ms (default: 600) |
| `--max-minutes <n>` | Max runtime in minutes (default: 30) |
| `--browser <name>` | Browser to read session from (chrome, chromium, brave, firefox) |
| `--cookies <values...>` | Pass ct0 and auth_token directly (skips browser extraction) |
| `--chrome-user-data-dir <path>` | Chrome-family user-data directory |
| `--chrome-profile-directory <name>` | Chrome-family profile name |
| `--firefox-profile-dir <path>` | Firefox profile directory |

### search
Full-text search across bookmarks with BM25 ranking.

| Flag | Description |
|------|-------------|
| `<query>` | Search query (supports FTS5 syntax: AND, OR, NOT, "exact phrase") |
| `--author <handle>` | Filter by author handle |
| `--after <date>` | Bookmarks posted after this date (YYYY-MM-DD) |
| `--before <date>` | Bookmarks posted before this date (YYYY-MM-DD) |
| `--limit <n>` | Max results (default: 20) |

### list
List bookmarks with filters.

| Flag | Description |
|------|-------------|
| `--query <query>` | Text query (FTS5 syntax) |
| `--author <handle>` | Filter by author handle |
| `--after <date>` | Posted after (YYYY-MM-DD) |
| `--before <date>` | Posted before (YYYY-MM-DD) |
| `--category <cat>` | Filter by category |
| `--domain <dom>` | Filter by domain |
| `--limit <n>` | Max results (default: 30) |
| `--offset <n>` | Offset into results (default: 0) |
| `--json` | JSON output |

### show
Show one bookmark in detail.

| Flag | Description |
|------|-------------|
| `<id>` | Bookmark ID |
| `--json` | JSON output |

### sample
Random sample from a category or domain.

| Flag | Description |
|------|-------------|
| `<category>` | Category or domain to sample from |
| `--limit <n>` | Max results (default: 10) |

### classify
Classify bookmarks by category and domain using LLM.

| Flag | Description |
|------|-------------|
| (default) | Classify categories and domains with LLM |
| `--regex` | Use simple regex classification instead of LLM |
| `--fail-fast` | Stop immediately on first classification failure |

### classify-domains
Classify bookmarks by subject domain only (LLM).

| Flag | Description |
|------|-------------|
| (default) | Classify only missing domains |
| `--all` | Re-classify all bookmarks, not just missing |
| `--fail-fast` | Stop immediately on first classification failure |

### md
Export bookmarks as individual markdown files.

| Flag | Description |
|------|-------------|
| `--force` | Re-export all bookmarks (overwrite existing files) |
| `--format <type>` | Filename format: `rev-iso` (default, e.g. 2024-01-15-id.md) or `legacy` (e.g. id-tweettext.md) |

### wiki
Compile a Karpathy-style interlinked knowledge base.

| Flag | Description |
|------|-------------|
| (default) | Incremental: only pages whose source bookmark count changed |
| `--full` | Recompile all pages (ignore incremental cache) |

### ask
Ask questions against the knowledge base.

| Flag | Description |
|------|-------------|
| `<question>` | Question to ask |
| `--save` | Save the answer as a concept page |
| `--json` | Output JSON instead of text |

### lint
Health-check the wiki for broken links and missing pages.

| Flag | Description |
|------|-------------|
| (default) | Check and report issues |
| `--fix` | Auto-fix fixable issues with targeted recompile |
| `--json` | Output JSON instead of text |

### index
Rebuild search index from JSONL cache.

| Flag | Description |
|------|-------------|
| (default) | Preserve existing classifications |
| `--force` | Drop and rebuild from scratch (loses classifications) |

### fetch-media
Download media assets (static images only).

| Flag | Description |
|------|-------------|
| `--limit <n>` | Max bookmarks to process (default: 100) |
| `--max-bytes <n>` | Per-asset byte limit (default: 50MB) |

### model
View or change the default LLM engine.

| Flag | Description |
|------|-------------|
| (default) | Show current model and available options |
| `<engine>` | Set engine to `claude` or `codex` |

### auth
Set up OAuth for API-based sync (optional).

### status
Show sync status and data location.

### path
Print data directory path.

### categories
Show category distribution.

### domains
Show subject domain distribution.

### stats
Top authors, languages, date range.

### viz
Terminal dashboard with sparklines, categories, and domains.

### skill install
Install `/fieldtheory` skill for Claude Code and Codex.

### skill show
Print skill content to stdout.

### skill uninstall
Remove installed skill files.

## Agent integration

Install the `/fieldtheory` skill so your agent automatically searches your bookmarks when relevant:

```bash
ft skill install     # Auto-detects Claude Code and Codex
```

Then ask your agent:

> "What have I bookmarked about cancer research in the last three years and how has it progressed?"

> "I bookmarked a number of new open source AI memory tools. Pick the best one and figure out how to incorporate it in this repo."

> "Every day please sync any new X bookmarks using the Field Theory CLI."

Works with Claude Code, Codex, or any agent with shell access.

## Scheduling

```bash
# Sync every morning at 7am
0 7 * * * ft sync

# Sync and classify every morning
0 7 * * * ft sync --classify
```

## Data

All data is stored locally at `~/.ft-bookmarks/`:

```
~/.ft-bookmarks/
  bookmarks.jsonl         # raw bookmark cache (one per line)
  bookmarks.db            # SQLite FTS5 search index
  bookmarks-meta.json     # sync metadata
  oauth-token.json        # OAuth token (if using API mode, chmod 600)
  md/                     # markdown knowledge base (ft wiki / ft md)
```

Override the location with `FT_DATA_DIR`:

```bash
export FT_DATA_DIR=/path/to/custom/dir
```

To remove all data: `rm -rf ~/.ft-bookmarks`

## Categories

| Category | What it catches |
|----------|----------------|
| **tool** | GitHub repos, CLI tools, npm packages, open-source projects |
| **security** | CVEs, vulnerabilities, exploits, supply chain |
| **technique** | Tutorials, demos, code patterns, "how I built X" |
| **launch** | Product launches, announcements, "just shipped" |
| **research** | ArXiv papers, studies, academic findings |
| **opinion** | Takes, analysis, commentary, threads |
| **commerce** | Products, shopping, physical goods |

Use `ft classify` for LLM-powered classification that catches what regex misses.

## Platform support

| Feature | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Session sync (`ft sync`) | Chrome, Brave, Arc, Firefox | Firefox | Firefox |
| OAuth API sync (`ft sync --api`) | Yes | Yes | Yes |
| Search, list, classify, viz, wiki | Yes | Yes | Yes |

Session sync extracts cookies from your browser's local database. Use `ft sync --browser <name>` to pick a browser. On platforms where session sync isn't available, use `ft auth` + `ft sync --api`.

## Security

**Your data stays local.** No telemetry, no analytics, nothing phoned home. The CLI only makes network requests to X's API during sync.

**Chrome session sync** reads cookies from Chrome's local database, uses them for the sync request, and discards them. Cookies are never stored separately.

**OAuth tokens** are stored with `chmod 600` (owner-only). Treat `~/.ft-bookmarks/oauth-token.json` like a password.

**The default sync uses X's internal GraphQL API**, the same API that x.com uses in your browser. For the official v2 API, use `ft auth` + `ft sync --api`.

## License

MIT — [fieldtheory.dev/cli](https://fieldtheory.dev/cli)

## Star History

<a href="https://www.star-history.com/?repos=afar1%2Ffieldtheory-cli&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=afar1/fieldtheory-cli&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=afar1/fieldtheory-cli&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=afar1/fieldtheory-cli&type=date&legend=top-left" />
 </picture>
</a>
