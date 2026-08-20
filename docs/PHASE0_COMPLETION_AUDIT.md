# Field Theory Phase 0 Completion Audit

Status: checkpoint from July 2, 2026 after the 13:22Z A1 read-only refresh, 12:48Z A2a/A3a/A5a/A6a read-only refresh, 09:48Z A4 read-only refresh, and 09:03Z orchestration-state reconciliation. This audit is an evidence map, not approval to execute any packet.

Source artifacts:

- Source plan: `/Users/afar/.fieldtheory/library/Plans/Field Theory Ecosystem Improvement Technical Plan.md`
- Execution ledger: `docs/ECOSYSTEM_EXECUTION_STATUS.md`
- Approval packets: `docs/PHASE0_APPROVAL_PACKETS.md`
- A1 request text: `docs/A1_APPROVAL_REQUEST.md`
- A2a request text: `docs/A2A_APPROVAL_REQUEST.md`
- A3a request text: `docs/A3A_APPROVAL_REQUEST.md`
- A5a request text: `docs/A5A_APPROVAL_REQUEST.md`
- A6a request text: `docs/A6A_APPROVAL_REQUEST.md`
- Read-only preflight checklist: `docs/PHASE0_PREFLIGHT_CHECKLIST.md`
- Live preflight log: `docs/PHASE0_PREFLIGHT_RESULTS.md`

The A1/A2a/A3a/A5a/A6a files are candidate request text only. Listing them here does not approve, execute, or complete any packet.

## Audit Rules

- Completion means current evidence proves the source-plan requirement and its verification gate.
- A packet being askable does not mean it is approved, executed, or complete.
- Subagent findings are leads. Current files and direct command output remain the proof surface.
- No Phase 1 work is unblocked until A1 and A4 pass. If any Phase 0 exit gap remains after A1 and A4 pass, Andrew must say the exact phrase `accept Phase 1 start with remaining Phase 0 gaps: <named gap IDs>`. A1 build and A4 scheduling have their own exact waiver phrases.
- No push, clone, build, install, backup, schedule, delete, prune, stash, tag, release, migration, plugin-cache mutation, manifest, bundle, or snapshot work is approved by this audit.

## Phase 0 Exit Gate

| Requirement | Current state | Evidence | Verdict |
| --- | --- | --- | --- |
| iOS on private remote with fresh-clone/build proof | A1 is askable but not executed. The two exact target private branch names are still absent in the coordinator shell; local SHAs still match the pinned approval phrase; public `origin` from `/Users/afar/dev/fieldtheory` has neither exact A1 target ref; public `origin/main` still has zero `ios-native` paths. Hooke's upstream-tracking guardrail finding was patched so post-push verification runs fail-fast and fetches and verifies private remote-tracking refs before setting upstreams. Nietzsche's exact-waiver finding was patched so A1 build waiver requires `waive A1 fresh-clone build gate after recorded blocker`. Harvey's private-verification finding was patched so private `ls-remote`, `fetch`, and `git clone` run with `GIT_TERMINAL_PROMPT=0`. | `PHASE0_PREFLIGHT_RESULTS.md` 13:22Z A1 recheck; `A1_APPROVAL_REQUEST.md`; `ECOSYSTEM_EXECUTION_STATUS.md` Phase 0 table. | Not complete |
| Mac app main pushed and tagged | A2a preservation is askable only as bundle/snapshot work after the 12:48Z dirty-set regeneration. The public release train is still dirty/stale and no final public release review or push packet is askable. The 12:48Z dirty-set tuple is 39 dirty paths, 28 modified tracked paths, 11 Git-visible untracked paths, SHA-256 `0c9a09a13ed2583ea26f44dffeef44ae42990bdda929265f4f7501696cc4112d`, including `docs/plans/2026-07-02-001-feat-ios-live-dictation-plan.md` and `docs/plans/2026-07-02-002-feat-team-share-links-plan.md`; a dirty path count alone is not enough proof. | `PHASE0_PREFLIGHT_RESULTS.md` 12:48Z A2a refresh; `A2A_APPROVAL_REQUEST.md`; `ECOSYSTEM_EXECUTION_STATUS.md` A2 row; `PHASE0_APPROVAL_PACKETS.md` A2a/A2b/A2c. | Not complete |
| Waist backup restore drill passed and scheduled backup observed | A4a approval is not askable. `/Volumes/Extreme SSD` is absent, not mounted, not writable, and not known to `diskutil info`; `restic` is missing, no scheduler evidence exists, and no restore-drill artifact exists. The required backup scope includes both `~/.fieldtheory` and the real bookmark store at `~/.ft-bookmarks`. | `PHASE0_PREFLIGHT_RESULTS.md` 09:48Z A4 recheck; `PRESERVATION_GATES.md` A4. | Not complete |
| `~/dev` family reduced after safe preservation | A5a is askable only as manifest work after the 12:14Z worktree-count regeneration. Current evidence still shows 59 Field Theory-family dirs, 60 target-repo worktree records, 17 prunable `fieldtheory-cli` worktree records, 5 `/private/tmp` candidates, and stale Oscar mirror preservation evidence. | `ECOSYSTEM_EXECUTION_STATUS.md` A5 row; `A5A_APPROVAL_REQUEST.md`; `PHASE0_APPROVAL_PACKETS.md` A5a. | Not complete |

Phase 0 exit is not met.

## Workstream A Units

| Unit | Source-plan done condition | Current evidence | Verdict | Next safe move |
| --- | --- | --- | --- | --- |
| A1 private iOS preservation | Both iOS branches exist on a private GitHub remote; fetched private remote-tracking refs match expected SHAs; local status shows live private upstream; fresh private clone contains `ios-native/` and builds. | `afar1/fieldtheory-labs` is private, but both exact private target refs remain absent in the coordinator shell. Public `origin` from `/Users/afar/dev/fieldtheory` has neither exact A1 target ref. Local branches remain at the pinned approval SHAs as of 13:22Z. A subagent-environment private Git credential-helper failure does not override the successful coordinator-shell private Git transport check, but private Git auth failure in the execution shell remains a stop condition. Post-push verification now runs fail-fast and fetches and verifies private remote-tracking refs before setting upstreams, and private `ls-remote`, `fetch`, and `git clone` run with `GIT_TERMINAL_PROMPT=0`. Build waiver now requires the exact phrase `waive A1 fresh-clone build gate after recorded blocker`. | Not complete | Ask only from `docs/A1_APPROVAL_REQUEST.md`. If Andrew says the exact phrase, re-confirm preflight in the same execution shell immediately before execution. |
| A2 mac app release train | `origin/main` equals local main; clean tree; tags match `package.json`; release checklist exists and updater feed resolves. | A2a preservation is not done; 12:48Z evidence still shows the release branch dirty/stale, and the dirty-set proof pins the exact dirty file set by hash. Source tag and updater-feed evidence are still not aligned. | Not complete | Ask only from `docs/A2A_APPROVAL_REQUEST.md`. A2a preserves committed refs plus tracked/staged/Git-visible untracked work; it does not preserve ignored files or complete A2. |
| A3 plugin deployed state | Deployed plugin state committed; version authority single-sourced; release tag exists; tree clean after install. | Installed source and Codex cache are byte-identical, but no approved installed/cache snapshot exists; 12:14Z direct read-only preflight still shows dev repo drift in three files plus follow-on dirt, with dev-repo status hash `39c3d661ab278fa7c597f092f3f850738334315e78ce8d7f507435838158dc76`. | Not complete | Ask only from `docs/A3A_APPROVAL_REQUEST.md` for A3a installed/cache snapshot. Even after A3a, commit/install/cache mutation remains blocked until a later named approval packet. |
| A4 waist backup | Backup covers `~/.fieldtheory` plus real bookmark store; restore drill recovers deleted test files; backup runs on a schedule. | 09:48Z direct evidence plus Pascal the 2nd and Goodall the 2nd confirm the backup target is absent/not mounted/not writable, `restic` is missing, no scheduler evidence or restore-drill artifact exists, and Time Machine destination memory is not A4 proof. Andrew has paused backup work until he connects a backup disk and explicitly resumes A4. | Not complete | Wait for Andrew to explicitly resume A4 after connecting the disk. During the pause, do not ask for A4 approval, run A4 preflights, install, initialize, back up, restore, or schedule. |
| A5 constellation cleanup | Safe preservation decisions complete; worktrees/prunable dirs/debris removed; `~/dev` family count is about 8 or less; policy note exists. | Cleanup is not ready. 12:14Z evidence still shows A5a is manifest-only and unapproved; deletion/prune/move work remains blocked. | Not complete | Ask only from `docs/A5A_APPROVAL_REQUEST.md` for A5a cleanup manifest after the current read-only preflight is rerun in the same execution shell immediately before use and still matches. |
| A6 review debris | Review-created `bookmarks.db?immutable=1` debris is absent; neighboring `twitter-bookmarks.db` cleanup is discretionary. | `bookmarks.db?immutable=1` remains absent. 12:14Z evidence still shows `twitter-bookmarks.db` as the same zero-byte regular file with tuple `70248019 0 1776019722 Regular File`, and optional quarantine is unapproved. | Review-created debris absent; optional quarantine incomplete | Ask only from `docs/A6A_APPROVAL_REQUEST.md` for discretionary quarantine. Do not use it as approval for deletion, bookmark migration, A5 completion, or Phase 0 completion. |

## Gates For Later Work

| Later work | Gate | Current verdict |
| --- | --- | --- |
| E1/E2 iOS extraction and distribution | A1 private preservation with fresh-clone/build proof | Blocked |
| B3/B4/F1 waist/bookmark migrations | A4 backup and restore drill | Blocked |
| Phase 1 B/C/D force multipliers | A1 and A4 pass; if Phase 0 exit gaps remain, Andrew says `accept Phase 1 start with remaining Phase 0 gaps: <named gap IDs>`; A1 build and A4 scheduling have their own exact waiver phrases | Blocked |
| C2/C3 agent-layer server move | C1 JSON contract is useful but not sufficient; Phase 1 still gated | Blocked |
| G3 pocket capture suite | E3 capture surfaces | Blocked |
| G5 command marketplace | F4 commands/ideas sync | Blocked |
| G6 self-hostable cloud | D6 shipped Supabase schema and RLS evidence | Blocked |
| A5 deletion/prune operations | Target-specific preservation decisions and exact approval phrases | Blocked |

## Candidate Approval Requests, Not Granted

The phrases below are request text only. Their presence in this audit is not Andrew approval and does not authorize execution. Rerun the matching read-only preflight in the same execution shell immediately before asking for or using any approval, except for user-paused A4: do not run A4 preflights or ask for A4 approval until Andrew explicitly resumes A4 after connecting the backup disk.

Recommended first:

- `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`

Other askable limited packets:

- `approve A2a create mac-app preservation bundle and dirty-tree snapshot`
- `approve A3a plugin installed-state snapshot`
- `approve A5a cleanup manifest only`
- `approve A6a review-debris quarantine`

These are listed for audit completeness only. They do not change the recommendation to ask A1 first.

Blocked packets:

- `approve A4a manual backup and restore drill`
- `approve A4b scheduled backup and restore drill`
- `approve A2b public release review only`
- `approve A2c final public release push <reviewed-sha> v0.3.20`

A4 remains user-paused and blocked from current evidence. Disk presence alone is not permission to restart A4; wait for Andrew to explicitly resume A4 before any preflight, approval ask, install, initialize, backup, restore, or schedule work.

## Current Repo State

`ft state --json` reports the CLI root is not clean: 25 changed files, 12 active workers, and 17 prunable worktree records. That is evidence for caution, not approval for clean-slate work. A5 cleanup remains approval-gated.
