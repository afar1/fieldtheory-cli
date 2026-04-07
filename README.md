# Field Theory CLI

Sync and store locally all of your X/Twitter bookmarks. Search, classify, and make them available to Claude Code, Codex, or any agent with shell access.

Free and open source.

## Install

```bash
npm install -g fieldtheory
```

Requires Node.js 20+ and a supported browser.

PowerShell note: `ft` conflicts with PowerShell's built-in `Format-Table` alias.
On Windows PowerShell, use `fieldtheory` instead.

## Quick start

```bash
# 1. Sync your bookmarks (needs a supported browser logged into X)
ft sync

# 2. Search them
ft search "distributed systems"

# 3. Explore
ft viz
ft categories
ft stats
```

On first run, `ft sync` extracts your X session from a supported browser and downloads your bookmarks into `~/.ft-bookmarks/`.

## Commands

| Command | Description |
|---------|-------------|
| `ft sync` | Download and sync all bookmarks (no API required) |
| `ft sync --classify` | Sync then classify new bookmarks with LLM |
| `ft sync --full` | Full history crawl (not just incremental) |
| `ft search <query>` | Full-text search with BM25 ranking |
| `ft viz` | Terminal dashboard with sparklines, categories, and domains |
| `ft classify` | Classify by category and domain using LLM |
| `ft classify --regex` | Classify by category using simple regex |
| `ft categories` | Show category distribution |
| `ft domains` | Subject domain distribution |
| `ft stats` | Top authors, languages, date range |
| `ft list` | Filter by author, date, category, domain |
| `ft show <id>` | Show one bookmark in detail |
| `ft index` | Merge new bookmarks into search index (preserves classifications) |
| `ft auth` | Set up OAuth for API-based sync (optional) |
| `ft sync --api` | Sync via OAuth API (cross-platform) |
| `ft fetch-media` | Download media assets (static images only) |
| `ft status` | Show sync status and data location |
| `ft path` | Print data directory path |

## Agent integration

Now you can ask your agent:

> "What have I bookmarked about cancer research in the last three years and how has it progressed?"

> "I bookmarked a number of new open source AI memory tools. Pick the best one and figure out how to incorporate it in this repo."

> "Every day please sync any new X bookmarks using the Field Theory CLI."

Works with Claude Code, Codex, or any agent with shell access. Just tell your agent to use the `ft` CLI.

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

## Windows Notes

On Windows PowerShell, prefer:

```powershell
fieldtheory sync
fieldtheory search "ai"
```

On Windows PowerShell, use `fieldtheory` instead of `ft`.
If you are syncing from Edge, close Edge completely first.

If auto-detection still fails, manual cookie sync works:

```powershell
fieldtheory sync --cookies "<ct0>" "<auth_token>"
```

To use Microsoft Edge explicitly:

```powershell
fieldtheory sync --browser edge
fieldtheory sync --browser edge --chrome-profile-directory "Default"
fieldtheory sync --browser edge --chrome-profile-directory "Profile 1"
```

You can also point the CLI at a Chromium-family browser data directory directly:

```powershell
fieldtheory sync --chrome-user-data-dir "$env:LOCALAPPDATA\Microsoft\Edge\User Data" --chrome-profile-directory "Profile 1"
```

## Platform support

| Feature | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Browser-session sync (`ft sync`) | Yes | Yes* | Yes* |
| OAuth API sync (`ft sync --api`) | Yes | Yes | Yes |
| Search, list, classify, viz | Yes | Yes | Yes |

\*Browser-session sync support varies by browser/profile setup. If session extraction fails, use `ft sync --cookies <ct0> <auth_token>` or `ft auth` + `ft sync --api`.

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
