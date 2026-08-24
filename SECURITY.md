# Security Policy

## Reporting Vulnerabilities

Do not open a public issue for suspected vulnerabilities, exposed credentials, auth bypasses, token-handling bugs, or private data exposure.

Email `support@fieldtheory.dev` with `[security]` in the subject.

Include the affected command, version, platform, and enough reproduction detail for a maintainer to confirm the issue without receiving your cookies, OAuth tokens, bookmark database, or private Library content.

## Sensitive Areas

Field Theory CLI can read browser session cookies for X and experimental
Instagram Saved sync, store OAuth tokens for X API sync, and write local Field
Theory data under `~/.fieldtheory`.

Do not share:

- browser cookies;
- X auth tokens;
- OAuth token files;
- local bookmark databases;
- private Library or Commands content;
- logs that include request headers or token values.

## Experimental Instagram Connector

`ft sync instagram` uses a read-only private web endpoint because Instagram has
no supported live API for an account's Saved collection. It never calls a write
endpoint, follows a redirect, retries a challenge, or stores session cookies.
Captions and author fields are untrusted third-party content and are returned as
structured data only.

The connector can still trigger Instagram rate limits or account security
checks. If a challenge appears, stop the sync and resolve it directly in the
browser. Never send maintainers a Saved response, cookie database, account ID,
or fixture copied from a personal account.

OAuth token files should be owner-readable only. Treat `~/.fieldtheory/bookmarks/oauth-token.json` like a password.
