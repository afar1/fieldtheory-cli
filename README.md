# Field Theory CLI

Sync and store locally your X/Twitter bookmarks and likes. Search them, classify bookmarks, and make them available to Claude Code, Codex, or any agent with shell access.

Free and open source. Designed for Mac.

## Install

```bash
# Install this fork directly from GitHub
npm install -g github:Decolo/fieldtheory-cli
```

If you later publish this fork to npm, use:

```bash
npm install -g fieldtheory-cli
```

Requires Node.js 20+. Chrome recommended for session sync; OAuth available for bookmark sync on all platforms.

## Quick start

```bash
# 1. Sync your bookmarks (needs Chrome logged into X)
ft sync

# 2. Sync your likes into a separate local archive
ft likes sync

# 3. Search them
ft search "distributed systems"
ft likes search "distributed systems"

# 4. Trim old likes in throttled batches
ft likes trim --keep 200 --batch-size 25 --pause-seconds 45

# 5. Explore bookmarks
ft viz
ft web
ft categories
ft stats
```

On first run, `ft sync` and `ft likes sync` reuse your browser session from Chrome/Firefox and download data into `~/.ft-bookmarks/`.

## Commands

### Sync

| Command | Description |
|---------|-------------|
| `ft sync` | Download and sync bookmarks (no API required) |
| `ft sync --rebuild` | Full history re-crawl of bookmarks |
| `ft sync --gaps` | Backfill missing quoted tweets and expand truncated articles |
| `ft sync --classify` | Sync then classify new bookmarks with LLM |
| `ft sync --api` | Sync via OAuth API (cross-platform) |
| `ft auth` | Set up OAuth for API-based sync (optional) |
| `ft likes sync` | Download and sync liked posts into a separate local archive |

### Search and browse

| Command | Description |
|---------|-------------|
| `ft search <query>` | Full-text search with BM25 ranking |
| `ft list` | Filter by author, date, category, domain |
| `ft show <id>` | Show one bookmark in detail |
| `ft unbookmark <id>` | Remove a bookmark on X and update the local bookmark archive |
| `ft likes search <query>` | Full-text search across liked posts |
| `ft likes list` | Filter liked posts by query, author, and like date |
| `ft likes show <id>` | Show one liked post in detail |
| `ft likes unlike <id>` | Unlike a post on X and update the local likes archive |
| `ft likes trim` | Keep only the latest likes and unlike older posts on X in throttled batches |
| `ft likes status` | Show likes archive status |
| `ft web` | Launch a local web UI for bookmarks and likes |
| `ft sample <category>` | Random sample from a category |
| `ft stats` | Top authors, languages, date range |
| `ft viz` | Terminal dashboard with sparklines, categories, and domains |
| `ft categories` | Show category distribution |
| `ft domains` | Subject domain distribution |

### Classification

| Command | Description |
|---------|-------------|
| `ft classify` | Classify by category and domain using LLM |
| `ft classify --regex` | Classify by category using simple regex |
| `ft classify-domains` | Classify by subject domain only (LLM) |
| `ft model` | View or change the default LLM engine |

### Knowledge base

| Command | Description |
|---------|-------------|
| `ft md` | Export bookmarks as individual markdown files |
| `ft wiki` | Compile a Karpathy-style interlinked knowledge base |
| `ft ask <question>` | Ask questions against the knowledge base |
| `ft ask <question> --save` | Ask and save the answer as a concept page |
| `ft lint` | Health-check the wiki for broken links and missing pages |
| `ft lint --fix` | Auto-fix fixable wiki issues |

### Agent integration

| Command | Description |
|---------|-------------|
| `ft skill install` | Install `/fieldtheory` skill for Claude Code and Codex |
| `ft skill show` | Print skill content to stdout |
| `ft skill uninstall` | Remove installed skill files |

### Utilities

| Command | Description |
|---------|-------------|
| `ft index` | Rebuild search index from JSONL cache (preserves classifications) |
| `ft likes index` | Rebuild the likes search index from the likes cache |
| `ft fetch-media` | Download media assets (static images only) |
| `ft status` | Show sync status and data location |
| `ft path` | Print data directory path |

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
  bookmarks-backfill-state.json
  likes.jsonl             # raw likes archive cache (one per line)
  likes.db                # SQLite FTS5 search index for likes
  likes-meta.json         # likes sync metadata
  likes-backfill-state.json
  oauth-token.json        # OAuth token (if using API mode, chmod 600)
  md/                     # markdown knowledge base (ft wiki / ft md)
```

Override the location with `FT_DATA_DIR`:

```bash
export FT_DATA_DIR=/path/to/custom/dir
```

To remove all data: `rm -rf ~/.ft-bookmarks`

Likes are intentionally a separate archive in v1. They support sync, search, list, show, status, and reindex. Classification, viz, stats, and media download remain bookmark-only features for now.

Single-item remote cleanup is also supported:

```bash
ft unbookmark <tweet-id>
ft likes unlike <tweet-id>
```

Both commands reuse your browser-authenticated X web session, then reconcile the matching local archive entry and index.

For bulk likes cleanup, use the formal trim command:

```bash
ft likes trim --keep 200 --batch-size 25 --pause-seconds 45
```

The command recomputes the trim set from your current local archive on each run, so it is safe to resume after an interruption. It unlikes older posts on X in batches, rewrites `likes.jsonl`, updates `likes-meta.json`, and rebuilds `likes.db` once per batch.

## Web UI

Build and launch the local web UI:

```bash
npm run build
node dist/cli.js web
```

Or during development:

```bash
npm run build
tsx src/cli.ts web
```

The web UI is local-only by default and binds to `127.0.0.1`. It serves the built frontend assets, so run `npm run build` at least once before starting `ft web`.

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
| Session sync (`ft sync`, `ft likes sync`) | Chrome, Brave, Arc, Firefox | Firefox | Firefox |
| OAuth API sync (`ft sync --api`) | Yes | Yes | Yes |
| Search, list, likes archive | Yes | Yes | Yes |
| Bookmark classify, viz, wiki | Yes | Yes | Yes |

Session sync extracts cookies from your browser's local database. Use `ft sync --browser <name>` to pick a browser. On platforms where session sync isn't available, use `ft auth` + `ft sync --api`.

## Security

**Your data stays local.** No telemetry, no analytics, nothing phoned home. The CLI only makes network requests to X's API during sync.

**Chrome session sync** reads cookies from Chrome's local database, uses them for the sync request, and discards them. Cookies are never stored separately.

**OAuth tokens** are stored with `chmod 600` (owner-only). Treat `~/.ft-bookmarks/oauth-token.json` like a password.

**The default bookmark sync uses X's internal GraphQL API**, the same API that x.com uses in your browser. For the official v2 API, use `ft auth` + `ft sync --api`.

**The likes archive sync also uses your browser-authenticated X web session.** In v1 it is browser-session based only; there is no OAuth likes sync path yet.

**Remote unlike, unbookmark, and likes trim use the same browser-authenticated X web session path.** On success, the CLI also reconciles the matching local cached records and rebuilds the relevant search index.

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
