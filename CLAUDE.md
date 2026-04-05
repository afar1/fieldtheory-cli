# CLAUDE.md

This is the Field Theory CLI — a standalone tool for syncing and querying X/Twitter bookmarks locally.

## Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Run via tsx directly
npm run test         # Run tests
npm run start        # Run compiled dist/cli.js
```

## Architecture

Single CLI application built with Commander.js. All data stored in `~/.ft-bookmarks/`.

### Key files

| File | Purpose |
|------|---------|
| `src/cli.ts` | Command definitions, progress bar, first-run UX |
| `src/paths.ts` | Data directory resolution (`~/.ft-bookmarks/`) |
| `src/graphql-bookmarks.ts` | GraphQL sync engine (Chrome session cookies) |
| `src/bookmarks.ts` | OAuth API sync |
| `src/bookmarks-db.ts` | SQLite FTS5 index, search, list, stats |
| `src/bookmark-classify.ts` | Regex-based category classifier |
| `src/bookmark-classify-llm.ts` | Optional LLM classifier |
| `src/bookmarks-viz.ts` | ANSI terminal dashboard |
| `src/chrome-cookies.ts` | Chrome cookie extraction (macOS Keychain + Linux Secret Service) |
| `src/xauth.ts` | OAuth 2.0 flow |
| `src/db.ts` | WASM SQLite layer (sql.js-fts5) |

### Data flow

```
Chrome cookies → GraphQL API → JSONL cache → SQLite FTS5 index
                                    ↓
                           Regex classification
                                    ↓
                         Search / List / Viz
```

### Linux cookie extraction

Chrome cookies on Linux use AES-128-CBC (same as macOS), with two version prefixes:
- **v10**: hardcoded password `"peanuts"` (no keyring)
- **v11**: password from GNOME Keyring / Secret Service (`chrome_libsecret_os_crypt_password_v2`)

Both derive the AES key via `PBKDF2(SHA1, salt="saltysalt", iterations=1, dkLen=16)`.
macOS uses the same algorithm but with `iterations=1003` and the password from Keychain.

Key retrieval uses `python3` with fallback chain:
1. `gi.repository.Secret` (libsecret GObject bindings)
2. `dbus` module (dbus-python)
3. Hardcoded `"peanuts"` (v10 fallback)

Supports Chrome, Chromium, and Brave on Linux.

### Dependencies

All pure JavaScript/WASM — no native bindings:
- `commander` — CLI framework
- `sql.js` + `sql.js-fts5` — SQLite in WebAssembly
- `zod` — schema validation
- `dotenv` — .env file loading

### Linux runtime requirements

- `python3` with either `gi.repository.Secret` or `dbus` module (pre-installed on most Linux desktops)
- `sqlite3` CLI (for reading Chrome's Cookies database)
