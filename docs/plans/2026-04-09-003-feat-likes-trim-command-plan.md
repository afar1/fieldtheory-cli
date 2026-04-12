---
title: feat: Add throttled bulk likes trim command
type: feat
status: completed
date: 2026-04-09
---

# feat: Add throttled bulk likes trim command

## Overview

Add a formal CLI command to trim the local likes archive down to the most recent N likes while unliking the older posts on X in controlled batches with configurable pauses between batches.

## Problem Frame

The repo now supports single-item `ft likes unlike <id>`, and the user has already started a one-off bulk unlike run using an ad hoc Node script. That approach works but is operationally weak: it rebuilds the local index after every item, has no first-class CLI ergonomics, and gives no built-in batch throttling to reduce the chance of X rate limiting. The user wants the bulk behavior promoted into the product as a formal command, then used to finish the current trim so only the latest 200 likes remain.

## Requirements Trace

- R1. Add a first-class CLI command to keep only the latest `N` likes and unlike the older likes on X.
- R2. Support batch processing with a configurable pause between batches to reduce rate-limit risk.
- R3. Keep local archive files and the likes SQLite index aligned with remote state during bulk execution.
- R4. Make the command resumable by recomputing the trim set from the current archive state on each run.
- R5. Provide clear CLI output describing totals, per-batch progress, and final state.
- R6. Update tests and docs for the new command.

## Scope Boundaries

- No bulk bookmark trim in this iteration.
- No web UI write controls in this iteration.
- No background queue or daemonized retry worker.
- No tombstone/history model for removed likes.

## Context & Research

### Relevant Code and Patterns

- `src/cli.ts` already contains the likes command group and the single-item destructive command style.
- `src/graphql-actions.ts` contains the remote `unlikeTweet()` mutation primitive.
- `src/archive-actions.ts` currently removes one cached like and rebuilds the index immediately.
- `src/likes-db.ts` already owns the canonical likes index rebuild path.
- `tests/cli-actions.test.ts` is the right high-level CLI behavior test entry point for destructive actions.

### Current Runtime State

- A previous ad hoc bulk unlike process was still running at planning time and must be stopped before formal execution.
- Current local likes count is `563`, so the trim target remains active and the formal command must be able to resume from partial progress.

## Key Technical Decisions

- Introduce a dedicated bulk trim command under `likes` instead of encoding the workflow in docs or one-off scripts.
- Add a bulk archive reconciliation helper that rewrites `likes.jsonl` once per batch and rebuilds `likes.db` once per batch, not once per item.
- Recompute the trim candidate set from the archive at command start so interrupted runs are naturally resumable.
- Process oldest removable likes in batches while preserving the newest `keep` records by `likedAt` fallback `postedAt`.
- Stop on the first remote failure within a batch and leave already-completed removals persisted; the next run resumes from the new archive state.

## Open Questions

### Resolved During Planning

- Should the command add pauses before every request? No. Pausing between batches is simpler and matches the user's request.
- Should the command be resumable across interruptions? Yes. Recomputing from the current archive state is enough; no extra checkpoint file is required.

### Unresolved Questions

- None.

## High-Level Technical Design

> *Directional guidance only, not implementation code.*

```text
ft likes trim --keep 200 --batch-size 25 --pause-seconds 45
  -> load likes archive
  -> sort by likedAt desc, keep newest 200
  -> split older records into batches of 25
  -> for each batch:
       unlike each tweet on X
       if all remote unlikes succeeded up to current point:
         rewrite likes.jsonl without those ids
         update likes meta count
         rebuild likes.db once
       sleep 45s before next batch
  -> print final remaining count and keep boundary
```

## Implementation Units

- [ ] **Unit 1: Add bulk likes trim primitives**

**Goal:** Add a reusable helper that computes the trim set, executes batched remote unlikes, and reconciles the local archive once per batch.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** Existing single-item unlike primitive

**Files:**
- Modify: `src/archive-actions.ts`
- Create or modify: `src/likes-service.ts`
- Modify: `src/types.ts`
- Test: `tests/archive-actions.test.ts`

**Approach:**
- Add helpers to read and sort the current likes archive by recency.
- Add a bulk removal path that deletes multiple ids from the archive and rebuilds the index once.
- Add a trim executor that accepts `keep`, `batchSize`, `pauseSeconds`, and progress callbacks.

**Patterns to follow:**
- `src/archive-actions.ts`
- `src/graphql-actions.ts`
- `src/likes-db.ts`

**Test scenarios:**
- Happy path: trim planning keeps the newest `N` likes and selects older likes for removal.
- Happy path: batch archive reconciliation removes multiple likes and rebuilds the index once.
- Edge case: if total likes are already `<= keep`, the trim operation becomes a no-op.
- Error path: a remote unlike failure stops further work and preserves unprocessed likes locally.

**Verification:**
- Temp-data tests prove the helper removes only the intended ids and leaves the newest likes untouched.

- [ ] **Unit 2: Expose the CLI command and document it**

**Goal:** Add `ft likes trim` with clear progress output and operator-facing options, then document usage.

**Requirements:** R1, R2, R4, R5, R6

**Dependencies:** Unit 1

**Files:**
- Modify: `src/cli.ts`
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `tasks/todo.md`
- Test: `tests/cli-actions.test.ts`

**Approach:**
- Add `likes trim` under the existing likes command group.
- Surface `--keep`, `--batch-size`, and `--pause-seconds`.
- Print a compact summary before, during, and after execution.

**Patterns to follow:**
- `src/cli.ts`
- `tests/cli-actions.test.ts`
- `README.md`

**Test scenarios:**
- Happy path: CLI trims likes against mocked X responses and the local cache ends at the expected remaining count.
- Edge case: CLI reports that no trim is needed when likes are already under the keep threshold.
- Error path: CLI surfaces remote failures and does not remove unprocessed likes from the archive.

**Verification:**
- Targeted CLI tests pass and the real command completes against the user's archive until 200 likes remain.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| X rate limits bulk unlike traffic | Pause between batches and keep batch size configurable |
| Local index rebuild is expensive | Rebuild once per batch instead of once per item |
| Interrupted runs leave partial progress | Recompute trim candidates from current local state on the next run |
| Concurrent ad hoc process mutates the same archive | Stop the old process before running the formal command |

## Documentation / Operational Notes

- Add the new command to the main command table and write path notes in `README.md`.
- Add the new plan entry to `docs/README.md`.
- Record real execution results in `tasks/todo.md` review notes.
