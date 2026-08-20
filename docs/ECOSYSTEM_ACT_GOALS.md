# Field Theory Ecosystem Act Goals

Status: coordination map from July 2, 2026. This file sets orchestrator and subagent goals for the Field Theory Ecosystem Improvement Technical Plan. It is not approval to execute any packet, and it is not proof that any act is complete.

Source plan: `/Users/afar/.fieldtheory/library/Plans/Field Theory Ecosystem Improvement Technical Plan.md`.

Related execution docs:

- `docs/ECOSYSTEM_EXECUTION_STATUS.md`
- `docs/PHASE0_APPROVAL_PACKETS.md`
- `docs/PHASE0_PREFLIGHT_CHECKLIST.md`
- `docs/PHASE0_COMPLETION_AUDIT.md`
- `docs/PRESERVATION_GATES.md`

## Global Orchestrator Goal

Preserve code and data before structural work. Keep each act tied to current evidence, exact approval phrases, and the source plan's dependency order.

Do not push, clone, build, install, back up, restore, schedule, delete, prune, move, stash, tag, publish, release, migrate, create bundles/snapshots/manifests, or mutate plugin cache unless the matching approval packet is named, Andrew says the exact phrase, and the fresh read-only preflight still matches in the same execution shell immediately before use.

Subagents provide leads, not authority. The coordinator must verify command output and current files directly before claiming an act is askable, executed, or complete.

## Reusable Goal Assignments

Coordinator goal: maintain the active orchestration goal, keep the approval queue ordered by preservation risk, and make only coordination/documentation edits unless Andrew gives an exact approval phrase for a named packet.

Coordinator verification condition: before any risky packet runs, the matching read-only preflight must be rerun in the same execution shell immediately before use and still match the packet assumptions. Before completion, the coordinator must reconcile subagent findings against direct evidence and record any confirmed drift.

Evidence subagent goal: audit the goal map and approval queue read-only against the source plan and current docs, then classify the setup as GO or NO-GO for continuing orchestration.

Evidence subagent verification condition: cite the files checked, confirm whether A1 remains ask-only, A4 approval remains not askable, Phase 1+ remains blocked, and subagent summaries remain leads rather than proof.

Adversarial subagent goal: attack the current goal map and approval queue for accidental authorization, stale evidence, missing blockers, weak stop conditions, or overclaims.

Adversarial subagent verification condition: return blockers or GO with any minimal wording changes needed before proceeding.

## Subagent Pattern

For each act or packet:

- Evidence subagent goal: inspect current state read-only, name exact commands or sources checked, and classify the act as askable, blocked, drifted, or complete candidate.
- Adversarial subagent goal: challenge the packet scope, completion evidence, stale assumptions, dependency order, and unsafe wording.
- Coordinator goal: reconcile subagent leads with direct evidence, patch docs only for confirmed drift, and keep risky operations gated.

## Workstream A: Preservation And Hygiene

Coordinator goal: finish Phase 0 preservation without broadening any packet into full act completion.

Evidence subagent goal: verify the current state for A1-A6 from live repos, remotes, disk, and docs before any approval ask.

Adversarial subagent goal: look for accidental permission to publish, delete, clean, migrate, install, push public history, or call a partial packet complete.

Current state:

- A1 is the recommended next ask, not approved and not executed. It may be called complete only after private refs resolve to the pinned SHAs, fetched private remote-tracking refs resolve to the same SHAs, local branches track private upstreams, a fresh private clone contains `ios-native/`, and the README-backed build succeeds. If the fresh private clone does not build, A1 remains partial or blocked unless Andrew says the exact waiver phrase `waive A1 fresh-clone build gate after recorded blocker`.
- A2a is askable only as mac app bundle/snapshot preservation against the regenerated 2026-07-02T12:48Z dirty-set tuple: 39 dirty paths, 28 modified tracked paths, 11 Git-visible untracked paths, SHA-256 `0c9a09a13ed2583ea26f44dffeef44ae42990bdda929265f4f7501696cc4112d`, including `docs/plans/2026-07-02-001-feat-ios-live-dictation-plan.md` and `docs/plans/2026-07-02-002-feat-team-share-links-plan.md`. It does not approve commit prep, branch switching, tags, pushes, release publication, or A2 completion.
- A3a is askable only as installed/plugin-cache snapshot preservation. It does not approve dev commits, install, cache mutation, rename, scratch cleanup, or A3 completion.
- A4 is user-paused until Andrew explicitly resumes it after connecting a backup disk. During the pause, do not ask for A4 approval, run A4 preflights, install backup tools, initialize repositories, back up, restore, or schedule backup work. The last pre-pause evidence had A4a not askable and A4b blocked.
- A5a is askable only as cleanup manifest work against the regenerated 2026-07-02T12:14Z worktree-count tuple. It does not approve archives, bundles, moves, waivers, deletion, or `git worktree prune`.
- A6a is optional quarantine only for the exact zero-byte `twitter-bookmarks.db`; it does not approve deletion or bookmark migration.

Current recommended next packet:

```text
approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1
```

Phase 0 exit evidence:

- iOS private refs, fetched private remote-tracking refs, upstreams, fresh private clone, and build proof.
- Mac app main pushed/tagged after preservation and public release review.
- Scheduled waist backup observed and restore drill passed.
- Safe repo-family cleanup after target-specific preservation decisions.

## Workstream B: Harden The Waist

Coordinator goal: prepare schema, ownership, versioning, and data-migration work only after preservation makes data loss recoverable.

Evidence subagent goal: inspect current schema/type definitions, ownership docs, legacy paths, bookmark store shape, and version surfaces; distinguish read-only characterization from migration.

Adversarial subagent goal: challenge any attempt to run B3, B4, or F1 before A4 backup/restore proof, and any claim that a schema package is adopted without cross-surface tests.

Current permission boundary:

- B1, B2 document-only, and B5 are Phase 1 force multipliers but remain blocked by the source-plan A1/A4 gate. If any Phase 0 exit gap remains after A1 and A4 pass, Andrew must say the exact phrase `accept Phase 1 start with remaining Phase 0 gaps: <named gap IDs>` before Phase 1 starts. A1 build and A4 scheduling have exact waiver phrases in the packet docs.
- `docs/DATA_OWNERSHIP.md` is useful B2 documentation evidence, not B2 enforcement and not a Phase 1 unlock.
- B3, B4, and F1 are data-migration shaped and are blocked by A4.

Exit evidence:

- Schema package consumed by at least two surfaces with unknown-major rejection tests.
- Ownership table checked in and enforced for known write conflicts.
- `ft paths --json` reports no legacy bookmark path after approved migration.
- Bookmark rewrite or migration survives kill/corruption tests.
- `versions.json` warns on incompatible app/CLI/plugin/schema pairings.

## Workstream C: One Agent Layer

Coordinator goal: unify CLI JSON, MCP serving, plugin generation, and mutating-command guardrails without letting local C1 work bypass Phase 1 gates.

Evidence subagent goal: enumerate current CLI JSON coverage, plugin wrapper drift, Claude/Codex skill generation surfaces, and mutating command guards.

Adversarial subagent goal: challenge JSON-contract incompleteness, MCP parity gaps, argument-injection risk, and any claim that local C1 verification unlocks C2/C3.

Current permission boundary:

- Local C1 implementation evidence exists in the checkout and has verified locally, but it is still WIP for sequencing because Phase 1 is gated.
- C2/C3 are blocked until C1 is complete and Phase 1 gates are explicitly open.
- C4/C5 remain planned force multipliers, not approved execution.

Exit evidence:

- All leaf commands emit the versioned JSON envelope and contract tests cover drift.
- `ft mcp serve` powers the plugin surface.
- Claude and Codex integrations have behavior parity.
- Skill/docs generation has a CI drift check.
- Mutating commands reject hostile args or missing concurrency guards.

## Workstream D: Mac App Engineering

Coordinator goal: reduce security, CI, IPC, and app-surface debt after preservation and release-train safety are established.

Evidence subagent goal: inspect Electron version, release branch state, CI/test gates, IPC/channel layout, window hardening, component sizes, Supabase schema coverage, and doc/flag drift.

Adversarial subagent goal: challenge any Electron/CI/release claim not backed by tests, updater evidence, or current public repo state.

Current permission boundary:

- D2/D4 are Phase 1 force multipliers but remain blocked by A1/A4. If any Phase 0 exit gap remains after A1 and A4 pass, Andrew must say the exact phrase `accept Phase 1 start with remaining Phase 0 gaps: <named gap IDs>` before Phase 1 starts. A1 build and A4 scheduling have exact waiver phrases in the packet docs.
- D1, D3, D5, D6, and D7 are later surface-debt work and require their own plans and verification.
- Public release push/publish remains blocked by A2 preservation and later named approvals.

Exit evidence:

- Supported Electron in the production update feed.
- PR CI runs app, CLI, plugin, and later iOS gates.
- `electron/main/index.ts` below 2,000 lines after per-namespace channel migration.
- Window hardening applied to all window factories.
- Large components split without behavior regressions.
- `supabase db reset` reproduces expected schema with RLS tests.
- Flags/docs/changelog/privacy claims match current code.

## Workstream E: iOS Productization

Coordinator goal: productize iOS only after A1 proves the stranded app is safely preserved privately.

Evidence subagent goal: verify private preservation state, buildability from a fresh private clone, generated Xcode project shape, distribution readiness, capture/search/sync gaps, and data-loss paths.

Adversarial subagent goal: challenge any extraction, distribution, signing, TestFlight, or public-repo decision before private preservation and boundary review.

Current permission boundary:

- E1 and E2 are blocked by A1.
- E3-E6 are product feature work and require the extracted/buildable repo plus their own scoped plans.

Exit evidence:

- Fresh `fieldtheory-ios` clone with clean history builds through XcodeGen without the old fork checkout.
- Tagged commit can produce a TestFlight build and crash evidence is observable.
- Share/App Intents capture writes provenance-rich markdown.
- iOS search finds synced content in under one second.
- Sync does not stall the main thread or lose edits/recordings.

## Workstream F: Sync Completes The Product

Coordinator goal: extend cloud sync only after schema and backup gates make migrations reversible.

Evidence subagent goal: inspect current Supabase migrations, sync-state, bookmarks/media storage shape, River read-state, command/idea portability, and tombstone/conflict handling.

Adversarial subagent goal: challenge any cloud data migration without A4 backup proof, B1 schema compatibility, and rollback/restore evidence.

Current permission boundary:

- F1 is blocked by A4 and B1.
- F2-F4 are Phase 3 sync work and require scoped migration plans and tests.

Exit evidence:

- Bookmarks are visible/searchable on iOS from cloud-backed data.
- River read-state and pins merge correctly across devices.
- Concurrent edits merge without last-write loss.
- Commands/ideas sync follows the account.

## Workstream G: Creative Bets

Coordinator goal: choose only a few bets deliberately after the core preservation, schema, agent, surface, and sync foundations are real.

Evidence subagent goal: inspect each candidate bet's prerequisites and current implementation hooks before estimating readiness.

Adversarial subagent goal: challenge novelty work that skips dependency gates or competes with unresolved preservation/data-loss risks.

Current permission boundary:

- G1-G7 are not started by this orchestration checkpoint.
- Recommended first bets in the source plan are G1, G3, and G4, but selection remains an Andrew decision after earlier gates.

Exit evidence:

- Two shipped bets with usage notes in the Library.
- Bet-specific prerequisites are satisfied: for example, G1 builds on B2/C2, G3 on E3, G5 on F4, and G6 on D6.

## Current Safe Sequence

1. Ask for A1 only, using the exact SHA-pinned phrase, after re-running the A1 preflight in the same execution shell immediately before use.
2. If Andrew approves A1, execute only the A1 packet and record private refs, fetched private remote-tracking refs, upstreams, fresh clone, and build evidence or exact blocker.
3. Keep A4 paused until Andrew explicitly resumes it after connecting a backup disk; disk presence alone is not permission to run A4 preflights or ask for A4 approval.
4. Do not treat A2a/A3a/A5a/A6a as act completion; they are preservation or quarantine packets only.
5. Do not start Phase 1+ work unless A1 and A4 pass. If any Phase 0 exit gap remains after A1 and A4 pass, Andrew must say the exact phrase `accept Phase 1 start with remaining Phase 0 gaps: <named gap IDs>`. A1 build and A4 scheduling are not loosely waivable; each has its own exact waiver phrase.
