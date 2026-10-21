# Implementation Notes — October 2026 Node and Undici security update

**Spec:** October 21, 2026 Field Theory CLI security remediation task brief
**Started:** 2026-10-21
**Status:** tested; prepared for draft review with existing suite failures documented

## How to read this file

Running log of decisions, deviations, and tradeoffs made while implementing the
task brief. Entries are chronological within each section.

## Decisions not covered by the spec

### Keep the public Node engine floor — 2026-10-21

**Spec section:** Repository-specific contract
Freshly fetched upstream `main` is `542c1167c127a788940731a2ef60493f0f522533`.
It declares Node `>=20` and direct Undici `^6.25.0`, locked to `6.25.0`.
Select exact Node `24.22.1` for development without raising the public engine
floor. Keep the existing npm `11.20.0` runner when changing the test runtime.

## Deviations from the spec

None identified.

## Tradeoffs accepted

### No CI or deployment configuration to update — 2026-10-21

**Spec section:** Common implementation and authority
Upstream tracks no GitHub Actions workflow, deployment configuration, or Node
version selection file. Add a development runtime selection and test locally;
do not introduce a deployment pipeline for this dependency update.

## Surprises and gotchas

### Baseline suite has two CLI JSON failures — 2026-10-21

**Spec section:** Establish baseline behavior
On the untouched dependency graph with Node `26.12.0`, `npm ci`, the build,
and help/version smoke checks pass. The full suite runs 568 tests: 566 pass;
two current-document CLI tests fail because JSON output contains trailing
text. Investigate and reproduce under Node `24.22.1` before attributing any
failure to the dependency update. Keep test-owned Library and Commands path
overrides unset; those fixtures manage their own paths.

### Audit feed does not yet include the October Undici advisory — 2026-10-21

**Spec section:** Audit classification
Baseline full audit reports one high-severity production Undici package and
one low-severity development esbuild package. Production-only audit reports
the Undici package alone. Neither response lists `GHSA-xjj6-f33q-929c`;
verify the patched version against the official advisory separately.

### Node's bundled Undici is a separate dependency — 2026-10-21

**Spec section:** Source facts
The isolated official Node `24.22.1` binary reports bundled Undici `7.30.1` and
OpenSSL `3.5.9`. That does not update the npm Undici `6.25.0` used by
`src/http-proxy.ts`; both runtime selection and the direct dependency need
verification. The Node archive's SHA256 matches the official release checksum.

## Open questions for review

### Original graph on Node 24 and security regression — 2026-10-21

**Spec section:** Node-only validation and regression checks
With the original lockfile on Node `24.22.1`, install/build/help/version pass;
the full suite again reports 566/568 passing. Diagnostics identify serialized
Node test-runner report bytes inside the two tests' stdout capture; a separate
compiled CLI invocation returns valid current-document JSON using synthetic
content. The new loopback proxy cases all pass on Undici `6.25.0`, while the
excessive-encoding regression fails with an orphaned stream error, demonstrating
the separately installed vulnerable package even on patched Node.

The Node 24 test runner also needs a short temporary directory on macOS: the
initial isolated path exceeded the Unix-domain socket path limit used by tsx.
Retesting uses a dedicated short temporary path without changing any tests.

Brandon must review the draft before it goes ready for upstream review. Merge,
npm publication, installed CLI replacement, and production runtime changes are
separate release decisions.

## Final verification — 2026-10-21

### Dependency graph and runtime selection

The only changed installed package is direct Undici `6.25.0` -> `6.29.1`.
The manifest now requires `^6.29.1`; no parent update, override, or major-version
change is needed. Its Node engine remains `>=18.17`, and this package keeps
`engines.node >=20`. `undici-types 7.18.2` is unchanged type-only development
metadata, not another installed HTTP client.

Official Node archives were checked against their published SHA256 checksums.
All runs used npm `11.20.0`, preserved in a temporary runner directory.
No host default runtime or global CLI was changed.

- Node `24.22.1`: bundled Undici `7.30.1`, OpenSSL `3.5.9`.
- Node `22.23.4`: bundled Undici `6.29.1`, OpenSSL `3.5.9`.
- Node `20.20.2`: bundled Undici `6.24.1`, OpenSSL `3.0.19`;
  compatibility check only, not a recommended security baseline.

### Commands and observed results

`npm ci` and `npm run build` pass on all three runtimes. Both `bin/ft.mjs`
and `dist/cli.js` pass `--help` and `--version` and report `1.3.22` with a
temporary home/data directory. A separate `current --json` read with synthetic
content produces valid JSON on Node 24.

The new integration tests cover direct requests, uppercase/lowercase HTTP
proxy variables, uppercase/lowercase no-proxy bypasses, and rejection of a
truncated response with six content encodings. Existing proxy unit tests plus
these tests pass 11/11 on Node 20; all new cases also pass in the Node 22/24
full-suite runs. The security regression fails on the original npm Undici
`6.25.0` and passes on `6.29.1` with the same patched Node 24 runtime.

Focused command:

```bash
npm exec -- tsx --test tests/http-proxy.test.ts tests/http-proxy.integration.test.ts
```

Native full-suite results remain non-green:

- Node 24: `npm test` reports 573/575 passing; the same two stdout-capture
  failures occur before the dependency update (566/568 on the original graph).
- Node 22: `npm test` reports 574/575 passing, with `tests/cli.test.ts` exiting 1.
- Node 20: native `npm test` cannot expand `tests/**/*.test.ts`. Passing the
  complete explicit file list runs all tests and reports 574/575 passing, with
  `tests/cli.test.ts` exiting 1. The shell-expanded equivalent is
  `npm exec -- tsx --test tests/*.test.ts` for the current test layout.

No tests were weakened or skipped. The stdout-capture/test-runner issues remain
outside this dependency patch; Node 24 diagnostics captured serialized test
report bytes after the expected JSON.

A separate loopback HTTPS fixture verifies successful direct requests,
`HTTPS_PROXY`/`https_proxy`, HTTP proxy fallback for HTTPS, and
`NO_PROXY`/`no_proxy` bypasses with certificate verification enabled. It uses a
temporary local certificate and makes no external API calls. One pre-existing
gap remains: `ALL_PROXY` alone triggers dispatcher setup, but Undici's
`EnvHttpProxyAgent` does not use that variable to tunnel requests. Use
`HTTP_PROXY` or `HTTPS_PROXY` for the verified proxy paths.

### Audit results and provider gap

- `npm audit --omit=dev --json`: exit 0, zero vulnerabilities.
- `npm audit --json`: exit 1, one existing low-severity development finding in
  `tsx -> esbuild 0.27.7`, `GHSA-g7r4-m6w7-qqqr` (Windows development-server file
  read). No production finding remains in the audit response.
- The baseline audit feed omitted `GHSA-xjj6-f33q-929c` / `CVE-2026-109869`.
  The [official Undici advisory](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c)
  identifies `6.29.1` as patched; the local regression independently verifies
  the installed package's behavior. A successful npm audit alone is insufficient.

### Release and rollback

There is no tracked CI/deployment workflow or hosted preview for this CLI.
No production/shared build setting was changed. No release was published, and
no user app, skill, or global CLI was installed. All test writes and mock API
paths used synthetic temporary fixtures.

The source rollback reference is pre-change upstream commit
`542c1167c127a788940731a2ef60493f0f522533` (`fieldtheory` source version `1.3.22`).
The actual installed or published production artifact was not inspected, so a
production rollback version cannot be verified. Restoring the original lockfile
would restore vulnerable Undici `6.25.0`; retain the security fix when choosing
any release rollback. Brandon's review is required before ready-for-review,
merge, publication, or installed-runtime replacement.

## Resumed 2026-10-21

Brandon explicitly authorized an unsigned commit after the configured signing
agent failed. Apply that exception to this commit only; shared Git signing
configuration remains unchanged. The draft-review and release gates still apply.
