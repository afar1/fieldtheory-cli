---
title: feat: Add local web archive viewer
type: feat
status: completed
date: 2026-04-08
---

# feat: Add local web archive viewer

## Overview

Add a local-only web UI for browsing and searching bookmarks and likes. The implementation should reuse the existing local archive and SQLite query layer, add a minimal Hono API, and ship a Vite + React frontend that the CLI can serve directly.

## Problem Frame

The repo already supports local sync and CLI exploration for bookmarks and likes, but there is no browser-based interface for scanning, filtering, and opening archived items. The user wants a simple page to visualize both archives without turning this into a hosted product or redesigning storage.

## Requirements Trace

- R1. Users can start a local web app from the CLI and open it in a browser.
- R2. The web app can browse bookmarks and likes from the existing local archive.
- R3. The UI supports search plus the main list/detail flow for both archive types.
- R4. The implementation reuses current local storage and query modules instead of inventing a new backend model.
- R5. Build, tests, and docs cover the new web surface.

## Scope Boundaries

- Local-only read UI; no auth, accounts, or remote deployment work.
- No new sync engine, no background jobs, and no write actions.
- No bookmark/like merge model in v1; bookmarks and likes stay separate tabs.
- No attempt to replace `ft viz`, markdown export, or classification workflows.

## Context & Research

### Relevant Code and Patterns

- `src/cli.ts` is the single CLI composition point and should remain the place where the new `web` command is registered.
- `src/bookmarks-db.ts` already exposes list, search, count, stats, and detail reads for bookmarks.
- `src/likes-db.ts` already exposes list, search, and detail reads for likes.
- `src/bookmarks-service.ts` and `src/likes-service.ts` already provide status summaries suitable for a lightweight API status endpoint.
- `src/paths.ts` centralizes archive paths; the web layer should continue reading the same data directory.

### Institutional Learnings

- None found in repo-local `docs/solutions/`; the repo relies on direct module reuse and small surfaces.

### External References

- Not required. The repo already has enough local patterns, and this work stays on standard framework paths.

## Key Technical Decisions

- Use `Hono` plus `@hono/node-server` for the local API and static file host: minimal Node footprint and good fit for local-only serving.
- Use `Vite + React + TypeScript` for the frontend: fast local iteration and a clean build step that can emit static assets for the CLI to serve.
- Keep API responses thin and close to existing DB return types: avoids duplicate view models and limits drift.
- Serve the built frontend from the same local process started by `ft web`: one command, one port, no extra orchestration.
- Add a small `open` helper for `--open` instead of bundling heavier browser-launch dependencies.

## Open Questions

### Resolved During Planning

- Should this be a separate service process? No. A single local process is simpler and fits the product shape.
- Should bookmarks and likes be merged into one combined feed? No. Separate tabs preserve the existing storage model and reduce scope.
- Should the first version support edit or sync controls in the UI? No. Read-only browsing keeps the surface small and safe.

### Deferred to Implementation

- Exact response normalization for empty or missing DB files: finalize once the API helpers are written and tested against temp data dirs.
- Final UI copy and small visual details: resolve during implementation while keeping the structure stable.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```text
ft web
  -> start local Hono server
  -> /api/status        -> bookmarks-service + likes-service
  -> /api/bookmarks     -> bookmarks-db list/count
  -> /api/bookmarks/:id -> bookmarks-db detail
  -> /api/likes         -> likes-db list
  -> /api/likes/:id     -> likes-db detail
  -> /assets/* + /      -> built Vite React app

React app
  -> fetch status once
  -> tab switch: bookmarks | likes
  -> query form updates list endpoint
  -> click item loads detail endpoint
```

## Implementation Units

- [ ] **Unit 1: Add local web backend surface**

**Goal:** Create a small Hono app that exposes read-only archive endpoints and can serve the built frontend.

**Requirements:** R1, R2, R4

**Dependencies:** None

**Files:**
- Create: `src/web-api.ts`
- Create: `src/web.ts`
- Modify: `src/cli.ts`
- Test: `tests/web-api.test.ts`

**Approach:**
- Build a `createWebApp()` factory around Hono for testability.
- Add status, list, and detail endpoints for bookmarks and likes.
- Parse query parameters into the existing DB filter shapes without changing storage modules.
- Add a CLI command `ft web` that starts the local server, prints the URL, and optionally opens the browser.

**Execution note:** Start with failing API behavior tests for list/detail/status responses.

**Patterns to follow:**
- `src/cli.ts`
- `src/bookmarks-db.ts`
- `src/likes-db.ts`
- `src/bookmarks-service.ts`
- `src/likes-service.ts`

**Test scenarios:**
- Happy path: `GET /api/status` returns bookmark and like counts plus cache metadata from a temp data dir.
- Happy path: `GET /api/bookmarks?limit=2` returns list items in existing bookmark timeline shape.
- Happy path: `GET /api/bookmarks/:id` returns one bookmark record by id.
- Happy path: `GET /api/likes?query=...` returns filtered likes using the likes index.
- Edge case: missing bookmark or like id returns `404` JSON error.
- Edge case: empty archive files still return `200` with empty lists and zero counts where appropriate.
- Error path: invalid numeric query params fall back safely instead of crashing the server.
- Integration: Hono handlers exercise the real DB/query modules against temp archive/index files without mocking internal collaborators.

**Verification:**
- A local request to the app returns valid JSON for bookmarks, likes, and status using real temp fixture data.

- [ ] **Unit 2: Build the frontend archive viewer**

**Goal:** Add a simple React UI with tabs, search/filter controls, result lists, and a detail panel for bookmarks and likes.

**Requirements:** R1, R2, R3

**Dependencies:** Unit 1

**Files:**
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.web.json`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/styles.css`

**Approach:**
- Keep the UI as a single small app with two archive modes and shared fetch state.
- Show counts/status at the top, filters in a compact control bar, list on the left, and detail view on the right.
- Preserve bookmarks-only fields such as category/domain when present, and keep likes UI simpler.

**Patterns to follow:**
- Existing repo tone in `README.md` and CLI output: practical, local-first, no SaaS framing.

**Test scenarios:**
- Test expectation: none -- frontend behavior will be validated through build output and browser-level manual verification in this iteration.

**Verification:**
- The built frontend loads from the local server, switches tabs, searches, renders lists, and shows detail for both archive types.

- [ ] **Unit 3: Wire build, docs, and command ergonomics**

**Goal:** Make the web app shippable through normal repo commands and document how to use it.

**Requirements:** R1, R5

**Dependencies:** Unit 1, Unit 2

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `tasks/todo.md`

**Approach:**
- Add frontend build dependencies and scripts.
- Make the default build produce both CLI/server output and static frontend assets.
- Document the `ft web` command, what it serves, and how it relates to bookmarks and likes.

**Patterns to follow:**
- Existing command documentation style in `README.md`

**Test scenarios:**
- Happy path: the repo build completes with both TypeScript backend output and Vite frontend output.
- Integration: `ft web` can serve the built frontend assets after a normal build.

**Verification:**
- `npm run build` succeeds and the CLI can start the web app without missing asset errors.

## System-Wide Impact

- **Interaction graph:** new CLI command calls a local server layer, which reads existing status and DB modules and serves a static frontend bundle.
- **Error propagation:** API handlers should turn missing records into `404` JSON and unexpected server faults into `500` JSON without crashing the process.
- **State lifecycle risks:** no new persistent state is introduced; the web app only reads existing local files.
- **API surface parity:** the UI should expose both bookmarks and likes rather than creating a bookmarks-only web surface.
- **Integration coverage:** API tests must use real archive files and indexes in temp directories.
- **Unchanged invariants:** sync, index, search, classify, and likes archive storage remain unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Frontend build setup complicates the existing TypeScript-only repo | Keep frontend isolated in Vite config and leave backend `tsc` compilation intact |
| API shape drifts from existing local query modules | Reuse DB return types closely and test through the public HTTP interface |
| Missing built assets break `ft web` | Validate asset existence and document build expectations clearly |

## Documentation / Operational Notes

- Update `README.md` with the new command and local web viewer capability.
- Keep `docs/README.md` as the entry point for plan artifacts.
- No deploy or runtime monitoring beyond local manual verification is required.

## Sources & References

- Related code: `src/cli.ts`
- Related code: `src/bookmarks-db.ts`
- Related code: `src/likes-db.ts`
- Related code: `src/bookmarks-service.ts`
- Related code: `src/likes-service.ts`
