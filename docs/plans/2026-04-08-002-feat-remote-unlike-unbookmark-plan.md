---
title: feat: Add remote unlike and unbookmark commands
type: feat
status: completed
date: 2026-04-08
---

# feat: Add remote unlike and unbookmark commands

## Overview

Add destructive CLI commands that reuse the existing browser-session X integration to remove a like or bookmark on X, then reconcile the local archive so CLI and web views reflect the remote change.

## Problem Frame

The repo already reads the user's X session from Chrome or Firefox and uses X's internal web GraphQL API for bookmark and likes sync. The user now wants the write-side equivalent while preserving the current implementation style instead of introducing OAuth, browser automation, or a separate sync service.

## Requirements Trace

- R1. The CLI can unlike a post on X using the same browser-session auth model already used for sync.
- R2. The CLI can remove a bookmark on X using the same browser-session auth model already used for sync.
- R3. Successful destructive actions reconcile local cache and search indexes so removed items no longer appear in normal local browse/search flows.
- R4. Failures surface actionable CLI errors without leaving local state in a silently inconsistent state.
- R5. Tests, docs, and command help cover the new write actions.

## Scope Boundaries

- No bulk delete flow in this iteration.
- No web UI write controls in this iteration.
- No OAuth write path; this feature stays browser-session based.
- No archive tombstone/history model unless implementation proves hard deletion is unsafe.

## Context & Research

### Relevant Code and Patterns

- `src/graphql-bookmarks.ts` and `src/graphql-likes.ts` already own X web session extraction, GraphQL headers, retry policy, and archive persistence patterns.
- `src/chrome-cookies.ts`, `src/firefox-cookies.ts`, and `src/config.ts` centralize browser session reuse and should remain the only cookie extraction path.
- `src/cli.ts` is the single command registration point and already contains bookmark and likes command groups.
- `src/bookmarks-db.ts` and `src/likes-db.ts` expose indexing flows that can be reused after cache mutation.
- `tests/cli-likes.test.ts` shows the current CLI integration test style with temp data dirs and real command execution.

### Institutional Learnings

- None found in repo-local `docs/solutions/`; current repo practice is to extend existing modules directly and keep the public CLI surface small.

### External References

- No stable public documentation exists for X's internal web GraphQL mutations. Exact mutation identifiers and payload shapes are implementation-time discovery work against the live web client.

## Key Technical Decisions

- Add dedicated mutation modules instead of overloading sync modules: keeps read-side sync logic separate from destructive remote writes.
- Reuse the existing browser-session header construction and retry conventions: minimizes auth drift between sync and write actions.
- Reconcile local archive only after a confirmed remote success: avoids deleting local records when the remote mutation fails.
- Remove records from local JSONL cache and rebuild or update the corresponding SQLite index as part of the command flow: keeps search/list/web output aligned with remote state.
- Default CLI behavior should remain explicit and narrow, with a single tweet id per invocation and clear user-facing confirmation of what changed.

## Open Questions

### Resolved During Planning

- Should this be implemented via browser automation? No. The repo already uses direct authenticated HTTP calls and should stay on that path.
- Should local data be marked stale instead of updated immediately? No. The user asked to see the result, so the command should reconcile local state immediately after remote success.
- Should the first version support batch operations? No. Single-item commands keep risk and error handling simpler.

### Deferred to Implementation

- Exact X GraphQL mutation names, query ids, and request bodies for unlike and unbookmark must be captured from the live X web client during implementation.
- Whether the local index layer should support targeted delete or simply rebuild after removal can be finalized once the affected DB helpers are inspected during implementation.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
ft likes unlike <tweetId>
  -> resolve browser session cookies
  -> POST X internal GraphQL unlike mutation
  -> on success: remove record from likes.jsonl
  -> rebuild/update likes.db
  -> print removed state

ft bookmarks remove <tweetId>
  -> resolve browser session cookies
  -> POST X internal GraphQL unbookmark mutation
  -> on success: remove record from bookmarks.jsonl
  -> rebuild/update bookmarks.db
  -> print removed state
```

## Implementation Units

- [ ] **Unit 1: Add remote write primitives for unlike and unbookmark**

**Goal:** Introduce focused modules that can authenticate with the existing browser session and execute the two X web mutations.

**Requirements:** R1, R2, R4

**Dependencies:** None

**Files:**
- Create: `src/graphql-actions.ts`
- Modify: `src/graphql-bookmarks.ts`
- Modify: `src/graphql-likes.ts`
- Test: `tests/graphql-actions.test.ts`

**Approach:**
- Extract or share the existing session/header setup so write commands can authenticate exactly like sync.
- Add one function for unlike and one for unbookmark with consistent result types and actionable failures.
- Keep mutation ids and payload builders isolated so future X web changes are localized.

**Execution note:** Start with failing behavior tests for remote success, auth failure, and upstream error mapping.

**Patterns to follow:**
- `src/graphql-bookmarks.ts`
- `src/graphql-likes.ts`
- `tests/graphql-bookmarks.test.ts`
- `tests/graphql-likes.test.ts`

**Test scenarios:**
- Happy path: unlike mutation sends the expected authenticated request and returns success metadata for the removed tweet id.
- Happy path: unbookmark mutation sends the expected authenticated request and returns success metadata for the removed tweet id.
- Error path: `401` or `403` returns the same re-login guidance style used by sync commands.
- Error path: non-auth upstream failures include status code and truncated response body without crashing.
- Integration: shared header/session resolution works for both action functions without duplicating cookie extraction logic.

**Verification:**
- Action helpers can be invoked from tests with mocked X responses and produce deterministic success/error results.

- [ ] **Unit 2: Reconcile local archives after confirmed remote removal**

**Goal:** Ensure a successful destructive action updates the matching local JSONL cache and index so follow-up reads are consistent.

**Requirements:** R3, R4

**Dependencies:** Unit 1

**Files:**
- Modify: `src/bookmarks-db.ts`
- Modify: `src/likes-db.ts`
- Modify: `src/paths.ts`
- Modify: `src/types.ts`
- Create: `src/archive-actions.ts`
- Test: `tests/archive-actions.test.ts`

**Approach:**
- Add a small archive reconciliation layer that removes a record by tweet id from the correct JSONL file and refreshes the corresponding SQLite index.
- Keep bookmark and likes handling symmetric where possible, but do not force a merged abstraction if the schemas differ materially.
- Return enough metadata for the CLI to print what changed locally.

**Patterns to follow:**
- `src/fs.ts`
- `src/bookmarks-db.ts`
- `src/likes-db.ts`

**Test scenarios:**
- Happy path: removing an existing like deletes it from `likes.jsonl` and it no longer appears in `likes list` / search-backed reads after reindex.
- Happy path: removing an existing bookmark deletes it from `bookmarks.jsonl` and it no longer appears in bookmark list/detail reads after reindex.
- Edge case: attempting to reconcile an id absent from local cache returns a clear result without corrupting files.
- Error path: index rebuild failure surfaces as a command error after remote success and does not silently report completion.
- Integration: reconciliation operates against real temp JSONL and SQLite files rather than mocked storage.

**Verification:**
- Temp-data integration tests prove removed records disappear from the public DB query layer after reconciliation.

- [ ] **Unit 3: Expose destructive CLI commands and document them**

**Goal:** Add end-user commands for unlike and unbookmark, wire them to remote mutation plus local reconciliation, and document usage.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `src/cli.ts`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `tasks/todo.md`
- Test: `tests/cli-actions.test.ts`

**Approach:**
- Add one command under `likes` for `unlike <id>` and one bookmark-side command for removing a bookmark.
- Keep output terse and specific: remote success, local removal status, and any follow-up guidance.
- Reuse existing browser options (`--browser`, `--cookies`, Chrome profile overrides) so destructive actions behave like sync commands.

**Patterns to follow:**
- `src/cli.ts`
- `tests/cli-likes.test.ts`
- `README.md`

**Test scenarios:**
- Happy path: `ft likes unlike <id>` invokes the remote action, reconciles local likes, and prints a success summary.
- Happy path: `ft bookmarks remove <id>` invokes the remote action, reconciles local bookmarks, and prints a success summary.
- Edge case: missing local archive record after remote success still reports remote success and explains the local state outcome.
- Error path: remote mutation failure prevents local deletion and exits with actionable guidance.
- Error path: invalid or missing tweet id is rejected by CLI argument validation.
- Integration: real CLI execution against temp local data updates subsequent `likes list` or `list/show` results.

**Verification:**
- Targeted CLI tests pass and a live local command run removes a real item from X and the local archive.

## System-Wide Impact

- **Interaction graph:** new CLI commands will bridge browser cookie extraction, X GraphQL mutation calls, local cache mutation, and search index rebuilds.
- **Error propagation:** remote failures must stop before local mutation; local reconciliation failures must be surfaced explicitly after remote success.
- **State lifecycle risks:** the dangerous window is remote success followed by local reconcile failure; command output must say so clearly and leave the user able to resync.
- **API surface parity:** bookmark and likes destructive flows should expose similar browser options and output style.
- **Integration coverage:** CLI tests need to prove public command behavior and post-action query behavior, not just helper internals.
- **Unchanged invariants:** sync, search, web viewing, classification, and OAuth bookmark sync remain unchanged outside post-action local data refresh.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| X changes internal mutation ids or payload shape | Isolate mutation metadata and keep failures explicit so future updates are localized |
| Remote success but local reindex fails | Print a partial-success warning and keep `ft likes sync` / `ft sync` as the recovery path |
| Destructive commands are too easy to misuse | Keep scope to single-id commands with explicit success output and no batch mode |

## Documentation / Operational Notes

- Update the command table and security notes in `README.md` to mention write actions still use browser-authenticated X web session.
- Update `docs/README.md` so the new plan is discoverable.
- No deploy or production monitoring work is required; this is a local CLI feature.

## Sources & References

- Related code: `src/cli.ts`
- Related code: `src/graphql-bookmarks.ts`
- Related code: `src/graphql-likes.ts`
- Related code: `src/chrome-cookies.ts`
- Related code: `src/firefox-cookies.ts`
