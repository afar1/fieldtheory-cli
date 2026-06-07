# Security Policy

## Reporting Vulnerabilities

Do not open a public issue for suspected vulnerabilities, exposed credentials, auth bypasses, token-handling bugs, or private data exposure.

Use private maintainer contact until a public security advisory process is configured.

## Sensitive Areas

Field Theory CLI can read browser session cookies for X bookmark sync, store OAuth tokens for API sync, and write local Field Theory data under `~/.fieldtheory`.

Do not share:

- browser cookies;
- X auth tokens;
- OAuth token files;
- local bookmark databases;
- private Library or Commands content;
- logs that include request headers or token values.

OAuth token files should be owner-readable only. Treat `~/.fieldtheory/bookmarks/oauth-token.json` like a password.
