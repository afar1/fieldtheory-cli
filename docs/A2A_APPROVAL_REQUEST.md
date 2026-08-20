# Field Theory A2a Candidate Approval Request

Status: request text only, with current evidence regenerated at 2026-07-02T12:48Z after dirty-set drift. This file is not approval and does not authorize execution.

## Coordinator Goal

Preserve the dirty mac app release train before any split, stash, merge, tag, public push, or release publication work.

Verification condition: A2a is complete only after the approved bundle and timestamped working-tree snapshot exist, the bundle verifies, and the snapshot includes status, tracked diff, staged diff, Git-visible untracked list, Git-visible untracked archive, and untracked archive listing. A2a does not complete A2.

## Subagent Goals

- Evidence subagent: independently verify the A2a facts read-only, including branch, HEAD, upstream/ahead state, dirty tracked/untracked counts, source/release repo visibility, package version, changelog/checklist versions, tag state, latest release, and latest feed.
- Adversarial subagent: attack this request and the Phase 0 docs for accidental stash, commit, branch switch, tag, push, release publication, cleanup, full A2 completion, or overwrite risk.

Subagent results are leads, not proof. Direct command output and current files remain the authority.

## Exact Approval Phrase

Andrew must say this exact phrase before the A2a packet can run:

```text
approve A2a create mac-app preservation bundle and dirty-tree snapshot
```

Do not treat nearby wording, summaries, or this file as approval.

## Current Read-Only Evidence

Observed at 2026-07-02T09:56Z, revalidated at 2026-07-02T10:39Z and 2026-07-02T11:22Z, then regenerated at 2026-07-02T12:14Z and 2026-07-02T12:48Z after the dirty-set hash changed:

- `/Users/afar/dev/fieldtheory-oss` is on `codex/release-0.3.14-startup-library...origin/codex/release-0.3.14-startup-library [ahead 31]`.
- Local HEAD is `0c560c32e7ed2a702cbaa1d2127768ce2fd2c7da`.
- Upstream `origin/codex/release-0.3.14-startup-library` resolves locally to `7ba1cd4b77bfddc6282a48d056fb7f1c5427325f`.
- Local and live `origin/main` both resolve to `4df630b96d2c2ec30d03e353dc1364994587457f`.
- The branch is 30 commits ahead of `origin/main` and 31 commits ahead of its upstream release branch.
- The worktree has 39 dirty paths: 28 modified tracked paths and 11 Git-visible untracked paths.
- The 2026-07-02T12:48Z `git status --porcelain --untracked-files=all` output has SHA-256 `0c9a09a13ed2583ea26f44dffeef44ae42990bdda929265f4f7501696cc4112d` and the exact file set below:

```text
 M mac-app/electron/main/codexTerminalManager.test.ts
 M mac-app/electron/main/codexTerminalManager.ts
 M mac-app/electron/main/commandLauncherWindow.ts
 M mac-app/electron/main/documentWindow.ts
 M mac-app/electron/main/index.ts
 M mac-app/electron/main/onboardingWindow.ts
 M mac-app/electron/main/trayManager.ts
 M mac-app/electron/preload.ts
 M mac-app/electron/shared/browserLibraryRendererStorage.ts
 M mac-app/src/components/AudioSettingsPanel.tsx
 M mac-app/src/components/BookmarksPane.tsx
 M mac-app/src/components/ClipboardHistory.tsx
 M mac-app/src/components/ContentToolbar.tsx
 M mac-app/src/components/LibrarianView.tsx
 M mac-app/src/components/RiverReader.tsx
 M mac-app/src/components/SettingsPanel.tsx
 M mac-app/src/components/TranscriptionSettings.tsx
 M mac-app/src/components/__tests__/AudioSettingsPanel.test.tsx
 M mac-app/src/components/__tests__/BookmarksPane.test.tsx
 M mac-app/src/components/__tests__/ContentToolbar.test.tsx
 M mac-app/src/components/__tests__/RiverReader.test.tsx
 M mac-app/src/components/__tests__/TranscriptionSettings.test.tsx
 M mac-app/src/contexts/ThemeContext.render.test.tsx
 M mac-app/src/contexts/ThemeContext.test.ts
 M mac-app/src/contexts/ThemeContext.tsx
 M mac-app/src/design/tokens.ts
 M mac-app/src/services/bookmarksCache.ts
 M mac-app/src/styles.css
?? .github/workflows/mac-app-ci.yml
?? docs/plans/2026-07-02-001-feat-ios-live-dictation-plan.md
?? docs/plans/2026-07-02-002-feat-team-share-links-plan.md
?? mac-app/docs/DATA_OWNERSHIP.md
?? mac-app/docs/PLAN_LIVE_TYPING.md
?? mac-app/electron/main/globalImproveSelection.test.ts
?? mac-app/electron/main/globalImproveSelection.ts
?? mac-app/electron/main/windowHardening.test.ts
?? mac-app/electron/main/windowHardening.ts
?? mac-app/electron/shared/audioDeviceLabels.test.ts
?? mac-app/electron/shared/audioDeviceLabels.ts
```
- `origin` push URL is `https://github.com/afar1/fieldtheory.git`.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/field-releases` reports `PUBLIC`.
- `mac-app/package.json` says `0.3.20`.
- `mac-app/CHANGELOG.md` still starts at `0.1.33`.
- `mac-app/docs/RELEASE_CHECKLIST.md` still says `v0.1.25+maxwell`.
- Local source tags and live source repo tags are absent.
- Latest release in `afar1/field-releases` is `v0.3.14`.
- `latest-mac.yml` is reachable and says `version: 0.3.14`.

Subagent note:

- Schrodinger the 2nd independently verified the 2026-07-02T08:27Z refresh and returned ASK-ONLY with no material drift and no stop conditions.
- Herschel the 2nd adversarially reviewed the A2a scope, returned GO-to-ask only on the initial ask, then found one narrow overwrite blocker in rereview. The final template now refuses to reuse an existing snapshot folder or bundle. Herschel also recommended clarifying that ignored files are intentionally excluded; that patch is reflected in `docs/PRESERVATION_GATES.md` and `docs/PHASE0_APPROVAL_PACKETS.md`.
- Raman the 2nd independently verified the 2026-07-02T09:56Z refresh and returned ASK-ONLY. Raman found the dirty-set SHA-256 still matches the expected docs hash and found no meaningful drift from A2a preservation evidence.
- Turing the 2nd adversarially reviewed the A2a boundary and found it OK against stash, commit, branch switch, tag, push, release publication, cleanup, full A2 completion, and overwrite risks.
- Tesla the 2nd independently verified the 2026-07-02T10:39Z refresh and returned ASK-ONLY. Tesla found the dirty-set SHA-256, release metadata, repo visibility, tag state, and latest feed still match this request.
- Boole the 2nd adversarially reviewed the 2026-07-02T10:39Z A2a boundary and returned GO to ask for preservation approval. Boole's guardrail hardening was applied to the A2a checklist and packet denial list.
- Halley the 2nd independently verified the 2026-07-02T11:22Z refresh and returned ASK-ONLY. Halley found the dirty-set SHA-256, release metadata, repo visibility, tag state, latest feed, and ahead counts still match this request.
- Singer the 2nd adversarially reviewed the 2026-07-02T11:22Z non-A1 queue and returned GO to report A2a as a limited askable packet only, behind A1 and with no execution approval.
- Linnaeus the 2nd independently verified the 2026-07-02T12:14Z refresh and returned A2a DRIFTED until this request was regenerated. Linnaeus found the current branch, HEAD/upstream/main, package, changelog, checklist, tag, repo visibility, and release/feed facts still match, but the dirty set now has 37 paths and SHA-256 `1f7a98cd04fdde97c48493fc7060843ba6dce13acc0779b3c3805020fa0c135d` because `mac-app/docs/PLAN_LIVE_TYPING.md` is now Git-visible untracked.
- Lovelace the 2nd independently verified the 2026-07-02T12:48Z refresh and returned A2a DRIFTED until this request was regenerated again. Lovelace found the current branch, HEAD/upstream/main, package, changelog, checklist, tag, repo visibility, and release/feed facts still match, but the dirty set now has 39 paths and SHA-256 `0c9a09a13ed2583ea26f44dffeef44ae42990bdda929265f4f7501696cc4112d` because `docs/plans/2026-07-02-001-feat-ios-live-dictation-plan.md` and `docs/plans/2026-07-02-002-feat-team-share-links-plan.md` are now Git-visible untracked.

## What Approval Would Allow

Only the A2a packet in `docs/PHASE0_APPROVAL_PACKETS.md`:

- re-run the A2a read-only preflight in the same execution shell immediately before use;
- create one timestamped Desktop snapshot folder;
- create and verify an A2 git bundle inside that timestamped snapshot folder without overwriting an existing snapshot folder or bundle;
- write status, tracked diff, staged diff, Git-visible untracked list, Git-visible untracked archive, and untracked archive listing.

## What Approval Would Not Allow

- stash;
- commit;
- branch switch;
- tag creation or tag movement;
- push to public or private remotes;
- release publication;
- updater-feed change;
- public-release review artifact;
- final public release push;
- deleting, moving, pruning, or cleaning files;
- backup setup, restore drill, scheduler setup, plugin-cache mutation, migration, or A2 completion.

Ignored files are not included in the Git-visible untracked archive. This request does not claim to preserve ignored build products, caches, dependencies, or local machine artifacts.

## Stop Conditions

Stop and regenerate the request if any of these change:

- the branch is no longer `codex/release-0.3.14-startup-library`;
- HEAD differs from `0c560c32e7ed2a702cbaa1d2127768ce2fd2c7da`;
- upstream or live `origin/main` differs from the evidence above;
- dirty path count, dirty file set, or dirty-set hash changes from the evidence above;
- `origin` push URL no longer targets `https://github.com/afar1/fieldtheory.git`;
- repo visibility changes for `afar1/fieldtheory` or `afar1/field-releases`;
- package version, changelog top entry, release checklist version, source tag state, latest release, or latest feed version changes;
- the timestamped snapshot folder or bundle path already exists during execution;
- any command would need to stash, commit, switch branches, tag, push, publish, delete, prune, move, build, install, back up, restore, schedule, create release artifacts, or mutate plugin cache.
