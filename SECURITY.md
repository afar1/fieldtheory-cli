# Security Policy

## Reporting Vulnerabilities

Do not open a public issue for suspected vulnerabilities, exposed credentials, auth bypasses, token-handling bugs, or private data exposure.

Email `support@fieldtheory.dev` with `[security]` in the subject.

Include the affected command, version, platform, and enough reproduction detail for a maintainer to confirm the issue without receiving your cookies, OAuth tokens, bookmark database, or private Library content.

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
