# Field Theory CLI

Sync and store locally all of your X/Twitter bookmarks. Search, classify, and make them available to Claude Code, Codex, or any agent with shell access.

Free and open source. Designed for Mac.

## Install

```bash
npm install -g fieldtheory
```

Requires Node.js 20+. A Chrome-family browser or Firefox is recommended for session sync; OAuth is available for all platforms.

## Quick start

```bash
# 1. Sync your bookmarks (needs a supported browser logged into X)
ft sync

# 2. Browse them interactively (needs fzf)
ft browse

# 3. Search them
ft search "distributed systems"

# 4. Explore trends
ft viz
ft categories
ft stats
```

On first run, `ft sync` extracts your X session from your browser and downloads your bookmarks into `~/.fieldtheory/bookmarks/`.

## Commands

### Sync

| Command | Description |
|---------|-------------|
| `ft sync` | Download and sync bookmarks, then fetch any missing media (photos, video posters, capped videos). No API required. |
| `ft sync --no-media` | Sync bookmarks only; skip the media download pass |
| `ft sync --skip-profile-images` | Sync bookmarks and post media but skip author profile images |
| `ft sync --rebuild` | Full re-crawl of all bookmarks |
| `ft sync --continue` | Resume a paused or interrupted sync from the saved cursor |
| `ft sync --gaps` | Backfill quoted tweets, expand truncated/X Article text, enrich linked articles, and fill any media gaps |
| `ft sync --folders` | Also sync X bookmark folder tags (read-only mirror of X state) |
| `ft sync --folder <name>` | Sync a single folder by name (exact or unambiguous prefix) |
| `ft sync --classify` | Sync then classify new bookmarks with LLM |
| `ft sync --api` | Sync via OAuth API (cross-platform) |
| `ft auth` | Set up OAuth for API-based sync (optional) |

### Search and browse

| Command | Description |
|---------|-------------|
| `ft search <query>` | Full-text search with BM25 ranking |
| `ft browse` | Interactive browser with live preview (needs `fzf`) |
| `ft list` | Filter by author, date, category, domain, or folder |
| `ft list --folder <name>` | Show bookmarks in an X bookmark folder |
| `ft show <id>` | Show one bookmark in detail |
| `ft show <id> --open` | Show details and open in your default browser |
| `ft sample <category>` | Random sample from a category |
| `ft stats` | Top authors, languages, date range |
| `ft viz` | Terminal dashboard with sparklines, categories, and domains |
| `ft categories` | Show category distribution |
| `ft domains` | Subject domain distribution |
| `ft folders` | Show X bookmark folder distribution (requires `ft sync --folders` first) |

### Classification

| Command | Description |
|---------|-------------|
| `ft classify` | Classify by category and domain using LLM |
| `ft classify --regex` | Classify by category using simple regex |
| `ft classify-domains` | Classify by subject domain only (LLM) |
| `ft classify --engine <name>` | Override the LLM engine for one run (also works on `ft sync --classify` and `ft classify-domains`) |
| `ft model` | View or change the default LLM engine |

### Knowledge base

| Command | Description |
|---------|-------------|
| `ft md` | Export bookmarks as individual markdown files, including enriched article text |
| `ft md --changed` | Re-export only markdown files whose source bookmark data changed |
| `ft wiki` | Compile a Karpathy-style interlinked knowledge base |
| `ft ask <question>` | Ask questions against the knowledge base |
| `ft ask <question> --save` | Ask and save the answer as a concept page |
| `ft lint` | Health-check the wiki for broken links and missing pages |
| `ft lint --fix` | Auto-fix fixable wiki issues |

### Field Theory app companion

| Command | Description |
|---------|-------------|
| `ft paths --json` | Show canonical bookmarks, Library, Commands, and compatibility paths |
| `ft status --json` | Show bookmark/classification status plus Field Theory paths |
| `ft library search <query>` | Search local Field Theory Library markdown |
| `ft library show <path>` | Print a Library page and its version metadata with `--json` |
| `ft library create <path> --stdin` | Create a new Library page under `~/.fieldtheory/library` |
| `ft library update <path> --stdin --expected-sha256 <hash>` | Replace a Library page with conflict protection |
| `ft library delete <path>` | Move a Library page to Trash; the Mac app owns remote sync tombstones |
| `ft library open <path>` | Open a Library page in the Field Theory Mac app |
| `ft commands list` | List portable commands under `~/.fieldtheory/commands` |
| `ft commands new <name>` | Create a reusable portable command |
| `ft commands validate [name]` | Check command shape and guardrails |
| `ft install app` | Download and install the latest Field Theory Mac app from `afar1/field-releases` |

`ft library open` targets the packaged Field Theory app by bundle id (`com.fieldtheory.app`) instead of trusting the system-wide `fieldtheory://` handler. That avoids accidentally opening a generic Electron development app when another checkout registered the same URL scheme.

For local Field Theory app development, point the CLI at the dev checkout:

```bash
export FT_APP_DEV_DIR=/Users/you/dev/fieldtheory/mac-app
ft library open notes/example.md
```

Packaged variants can override the bundle id with `FT_APP_BUNDLE_ID`. Advanced development launchers can set `FT_APP_OPEN_COMMAND` to an executable that receives the deep-link URL as its first argument.

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
| `ft fetch-media` | Backfill/download X media assets for existing bookmarks (default: all pending bookmarks) |
| `ft fetch-media --skip-profile-images` | Download post media without author profile images |
| `ft status` | Show sync/classification status and data location |
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

`ft` respects standard proxy environment variables for network requests: `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`, and `NO_PROXY`.

## Data

Data is stored locally under `~/.fieldtheory/`:

```
~/.fieldtheory/bookmarks/
  bookmarks.jsonl         # raw bookmark cache (one per line)
  bookmarks.db            # SQLite FTS5 search index
  bookmarks-meta.json     # sync metadata
  oauth-token.json        # OAuth token (if using API mode, chmod 600)

~/.fieldtheory/library/
  index.md                # markdown knowledge base (ft wiki / ft md)

~/.fieldtheory/commands/
  *.md                    # portable commands used by Field Theory and agents
```

Override locations with `FT_DATA_DIR`, `FT_LIBRARY_DIR`, and `FT_COMMANDS_DIR`:

```bash
export FT_DATA_DIR=/path/to/custom/dir
export FT_LIBRARY_DIR=/path/to/custom/library
export FT_COMMANDS_DIR=/path/to/custom/commands
```

To remove bookmark and Library data: `rm -rf ~/.fieldtheory/bookmarks ~/.fieldtheory/library`

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

In PowerShell, use `fieldtheory` or `ft.cmd` instead of `ft` because `ft` is already a built-in alias for `Format-Table`.

If browser session sync cannot find the right profile, pass the browser and profile explicitly:

```powershell
fieldtheory sync --browser chrome --chrome-profile-directory "Default"
fieldtheory sync --browser edge --chrome-profile-directory "Default"
```

For Firefox, if profile detection misses the profile, pass the profile directory explicitly with `--firefox-profile-dir`.

If cookie extraction still fails, close the browser completely and retry. As a last resort, pass cookies manually:

```powershell
fieldtheory sync --cookies <ct0> <auth_token>
```

Treat `ct0` and `auth_token` like passwords. Do not paste them into logs, issues, or chat.

## Platform support

| Feature | macOS | Linux | Windows |
|---------|-------|-------|---------|
| Session sync (`ft sync`) | Chrome, Chromium, Brave, Edge, Helium, Comet, Dia, Firefox | Chrome, Chromium, Brave, Edge, Firefox | Chrome, Chromium, Brave, Edge, Firefox |
| OAuth API sync (`ft sync --api`) | Yes | Yes | Yes |
| Search, list, classify, viz, wiki | Yes | Yes | Yes |

Session sync extracts cookies from your browser's local database. Use `ft sync --browser <name>` to pick a browser. On Windows, Firefox requires Node.js 22.5+ or `sqlite3` on PATH. For unsupported browsers or platforms, use `ft auth` + `ft sync --api`.

## Security

**Your data stays local.** No telemetry, no analytics, nothing phoned home. The CLI only makes network requests to X's API during sync.

**Chrome session sync** reads cookies from Chrome's local database, uses them for the sync request, and discards them. Cookies are never stored separately.

**OAuth tokens** are stored with `chmod 600` (owner-only). Treat `~/.fieldtheory/bookmarks/oauth-token.json` like a password.

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
