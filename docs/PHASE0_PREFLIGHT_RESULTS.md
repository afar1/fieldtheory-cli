# Field Theory Phase 0 Preflight Results

Status: live evidence log. This file records read-only preflight observations and does not grant approval for any packet.

Source artifacts:

- Execution ledger: `docs/ECOSYSTEM_EXECUTION_STATUS.md`
- Preservation runbook: `docs/PRESERVATION_GATES.md`
- Read-only checklist: `docs/PHASE0_PREFLIGHT_CHECKLIST.md`

Current operating note: A1 entries before `2026-07-02T04:15:34Z` mention the older unpinned approval phrase as historical evidence only. A1 public-origin evidence before the `2026-07-02T10:23Z` hardening is historical for exact public target-ref coverage. The current A1 phrase is SHA-pinned and appears in the latest A1 result below.

Current operating note: Phase 1+ remains blocked until A1 and A4 pass. If any Phase 0 exit gap remains after A1 and A4 pass, Andrew must say the exact phrase `accept Phase 1 start with remaining Phase 0 gaps: <named gap IDs>` before Phase 1 starts. Historical entries with looser acceptance wording are superseded by the latest A1 recheck below.

Current operating note: A5 Oscar remote evidence before `2026-07-02T05:29:04Z` is historical for Oscar remote truth. The current A2a packet evidence is the `2026-07-02T12:48Z` direct read-only refresh. A3a, A5a, and A6a were rechecked at `2026-07-02T12:48Z` with no material drift from their active packet assumptions. A5a remains manifest-only, and A6a remains optional quarantine-only; neither approves archives, bundles, waivers, deletion, prune, moving `oscar`, quarantine movement, or broader cleanup without the exact matching phrase.

Current operating note: A4 entries before `2026-07-02T11:10Z` are historical for A4 pause state. A4 is user-paused; disk connection or mount presence alone is not permission to run A4 preflight or ask for A4 approval. Wait for Andrew to explicitly resume A4 after connecting the disk.

## 2026-07-02T13:22Z: A1 Approval-Request Recheck

Scope: direct read-only A1 preflight refresh with one independent evidence subagent and one adversarial reviewer. No approval packet was executed. No push, dry-run push, fetch, clone, build, project generation, upstream change, delete, move, stash, commit, tag, bundle, snapshot, manifest, quarantine directory, backup operation, restore operation, scheduler change, migration, install, release publication, or plugin-cache mutation was performed. A4 remained user-paused; no A4 checks were run.

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs remain `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` remains `56fab3bf8192826fa9558392927b27cada070af1`, matching the pinned approval phrase.
- Local `codex/archive-ios-native-20260614` remains `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`, matching the pinned approval phrase.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` remain absent in the coordinator shell with `GIT_TERMINAL_PROMPT=0`.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` has neither exact A1 target ref: `refs/heads/codex/archive-ios-native-20260614` nor `refs/heads/ios-native-app`.
- Current public `origin/main` remains `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Subagent results:

- Dalton the 2nd independently verified local, public, and GitHub API facts and returned ASKABLE, but private `labs` Git transport hit the known `credential-osxkeychain` failure in the subagent shell. The coordinator shell's private Git transport checks succeeded, so this is recorded as a subagent-environment caution rather than coordinator-shell drift.
- Carson the 2nd adversarially reviewed the A1 docs/request boundary and returned GO for A1 as the next request-only approval ask, and NO-GO to execute A1, touch A4, or start Phase 1.

Patches applied after review:

- `docs/A1_APPROVAL_REQUEST.md`, `docs/PRESERVATION_GATES.md`, `docs/ECOSYSTEM_EXECUTION_STATUS.md`, and `docs/PHASE0_COMPLETION_AUDIT.md` now record the 13:22Z A1 coordinator-shell evidence and the Dalton/Carson subagent outcomes.
- `docs/ECOSYSTEM_EXECUTION_STATUS.md` now says A1 is "Askable for SHA-pinned approval" rather than "Ready for SHA-pinned approval".
- `docs/PHASE0_COMPLETION_AUDIT.md` now says A6 review debris is absent rather than using "complete" wording for that row.
- This file's operating notes now mark older A1 public-origin evidence as historical before the 10:23Z exact public target-ref hardening.

Result:

- A1 remains eligible to ask Andrew for the exact limited approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- A4 remains user-paused until Andrew explicitly resumes A4 after connecting a backup disk.
- Phase 1+ remains blocked by A1 and A4, plus the exact remaining-gap acceptance rule above.
- Do not treat this as approval to push, dry-run push, fetch, clone, build, generate projects, set upstreams, delete, move, stash, commit, create bundles, create snapshots, create manifests, extract iOS, sign, install, back up, restore, schedule, migrate, tag, publish, mutate plugin cache, run A4 checks, or call A1, A4, or Phase 0 complete.

## 2026-07-02T13:05Z: A1 Approval-Request Recheck

Scope: direct read-only A1 preflight refresh with one independent evidence subagent and one adversarial reviewer. No approval packet was executed. No push, dry-run push, fetch, clone, build, project generation, upstream change, delete, move, stash, commit, tag, bundle, snapshot, manifest, quarantine directory, backup operation, restore operation, scheduler change, migration, install, release publication, or plugin-cache mutation was performed. A4 remained user-paused; no A4 checks were run.

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs remain `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` remains `56fab3bf8192826fa9558392927b27cada070af1`, matching the pinned approval phrase.
- Local `codex/archive-ios-native-20260614` remains `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`, matching the pinned approval phrase.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` remain absent in the coordinator shell with `GIT_TERMINAL_PROMPT=0`.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` has neither exact A1 target ref: `refs/heads/codex/archive-ios-native-20260614` nor `refs/heads/ios-native-app`.
- Current public `origin/main` remains `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Subagent results:

- Descartes the 2nd independently verified local, public, and GitHub API facts but returned BLOCKED from the subagent shell because private `labs` Git transport hit the known `credential-osxkeychain` failure. The coordinator shell's private Git transport checks succeeded, so this is recorded as a subagent-environment caution rather than coordinator-shell drift.
- Huygens the 2nd adversarially reviewed the A1 docs/request boundary and returned GO. Huygens found no A1 execution authorization, no A4 pause leak, and no A1/Phase 0/Phase 1 completion overclaim.

Patches applied after review:

- `docs/A1_APPROVAL_REQUEST.md`, `docs/PRESERVATION_GATES.md`, `docs/ECOSYSTEM_EXECUTION_STATUS.md`, and `docs/PHASE0_COMPLETION_AUDIT.md` now record the 13:05Z A1 coordinator-shell evidence and the Descartes/Huygens subagent outcomes.

Result:

- A1 remains eligible to ask Andrew for the exact limited approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- A4 remains user-paused until Andrew explicitly resumes A4 after connecting a backup disk.
- Phase 1+ remains blocked by A1 and A4, plus the exact remaining-gap acceptance rule above.
- Do not treat this as approval to push, dry-run push, fetch, clone, build, generate projects, set upstreams, delete, move, stash, commit, create bundles, create snapshots, create manifests, extract iOS, sign, install, back up, restore, schedule, migrate, tag, publish, mutate plugin cache, run A4 checks, or call A1, A4, or Phase 0 complete.

## 2026-07-02T12:48Z: Askable Queue Recheck With A4 Paused

Scope: direct read-only refresh of A1/A2a/A3a/A5a/A6a with one independent evidence subagent and one adversarial reviewer. A4 remained user-paused. No A4 preflight was run. No approval packet was executed. No push, dry-run push, fetch, clone, build, project generation, upstream change, delete, move, stash, commit, tag, bundle, snapshot, manifest, quarantine directory, backup operation, restore operation, scheduler change, migration, install, release publication, or plugin-cache mutation was performed.

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs remain `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` remains `56fab3bf8192826fa9558392927b27cada070af1`, matching the pinned approval phrase.
- Local `codex/archive-ios-native-20260614` remains `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`, matching the pinned approval phrase.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs remain absent; the older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` has neither exact A1 target ref.
- Current public `origin/main` remains `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Observed direct A2a evidence:

- `/Users/afar/dev/fieldtheory-oss` remains on `codex/release-0.3.14-startup-library...origin/codex/release-0.3.14-startup-library [ahead 31]`.
- Local HEAD remains `0c560c32e7ed2a702cbaa1d2127768ce2fd2c7da`; upstream remains `7ba1cd4b77bfddc6282a48d056fb7f1c5427325f`.
- Local and live `origin/main` remain `4df630b96d2c2ec30d03e353dc1364994587457f`.
- The branch remains 30 commits ahead of `origin/main` and 31 commits ahead of its upstream release branch.
- Dirty status is now 39 paths: 28 modified tracked paths and 11 Git-visible untracked paths, with SHA-256 `0c9a09a13ed2583ea26f44dffeef44ae42990bdda929265f4f7501696cc4112d`.
- The added Git-visible untracked paths relative to the prior packet are `docs/plans/2026-07-02-001-feat-ios-live-dictation-plan.md` and `docs/plans/2026-07-02-002-feat-team-share-links-plan.md`.
- `mac-app/package.json` still says `0.3.20`; `CHANGELOG.md` still starts at `0.1.33`; `RELEASE_CHECKLIST.md` still says `v0.1.25+maxwell`.
- Local source tags and live source repo tags remain absent.
- `afar1/fieldtheory` and `afar1/field-releases` both report `PUBLIC`.
- Latest release in `afar1/field-releases` remains `v0.3.14`, and `latest-mac.yml` still says `version: 0.3.14`.

Observed direct A3a/A5a/A6a evidence:

- A3a still matches the installed/cache preservation assumptions: installed source and Codex cache are byte-identical; the dev bundle still differs from installed source in `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`; the dev repo status hash remains `39c3d661ab278fa7c597f092f3f850738334315e78ce8d7f507435838158dc76`; and `/private/tmp/a3_dev_files.txt` plus `/private/tmp/a3_installed_files.txt` still exist.
- A5a still matches the active manifest assumptions: the exact packet pattern finds 59 Field Theory-family dirs; per-repo worktree records remain `fieldtheory-oss=12`, `fieldtheory=17`, `fieldtheory-cli=30`, `fieldtheory-plugin=1`; `fieldtheory-cli` still has 17 prunable records; the same 5 `/private/tmp/fieldtheory-cli-*` dirs exist; the protected iOS archive remains present; Oscar still needs target-specific preservation with live GitHub `origin/main` at `f81481ff9824ddb4fa252ed93933d9bc815dc930` and the mirror compare still `{status: ahead, ahead_by: 12, behind_by: 0, total_commits: 12}`.
- A6a still matches the optional quarantine assumptions: `bookmarks.db?immutable=1` remains absent, and `twitter-bookmarks.db` remains a zero-byte regular file with exact tuple `70248019 0 1776019722 Regular File`.

Subagent results:

- Lovelace the 2nd independently verified A1/A2a/A3a/A5a/A6a read-only. Lovelace returned A1 ASKABLE, A2a DRIFTED until the dirty-set tuple was regenerated, A3a ASKABLE, A5a ASKABLE, and A6a ASKABLE.
- Ohm the 2nd adversarially reviewed the queue and returned NO-GO until the generic approval-rule and audit-rule preflight sentences explicitly exempted user-paused A4. Those patches are now applied.

Execution-boundary note:

- Lovelace accidentally created `/tmp/a5_field_dirs_readonly.txt` while counting A5 candidates. It was not deleted because cleanup is a separate mutation and Andrew has not approved scratch-file cleanup.

Patches applied after review:

- `docs/A2A_APPROVAL_REQUEST.md`, `docs/PRESERVATION_GATES.md`, `docs/PHASE0_APPROVAL_PACKETS.md`, `docs/ECOSYSTEM_EXECUTION_STATUS.md`, `docs/PHASE0_COMPLETION_AUDIT.md`, and `docs/ECOSYSTEM_ACT_GOALS.md` now pin A2a to the 12:48Z dirty-set hash `0c9a09a13ed2583ea26f44dffeef44ae42990bdda929265f4f7501696cc4112d`.
- `docs/PHASE0_APPROVAL_PACKETS.md` and `docs/PHASE0_COMPLETION_AUDIT.md` now say that the generic preflight-before-approval rule does not apply to user-paused A4 until Andrew explicitly resumes A4 after connecting the backup disk.

Result:

- A1 remains the recommended first ask and remains not approved, not executed, and not complete.
- A2a remains eligible to ask Andrew for the exact limited approval phrase `approve A2a create mac-app preservation bundle and dirty-tree snapshot`, but only against the regenerated 12:48Z dirty-set tuple.
- A3a remains eligible to ask Andrew for the exact limited approval phrase `approve A3a plugin installed-state snapshot`, as installed/cache preservation only.
- A5a remains eligible to ask Andrew for the exact limited approval phrase `approve A5a cleanup manifest only`, as manifest work only.
- A6a remains eligible to ask Andrew for the exact limited approval phrase `approve A6a review-debris quarantine`.
- A4 remains user-paused until Andrew explicitly resumes A4 after connecting a backup disk.
- Do not treat this as approval to create bundles, snapshots, manifests, quarantine directories, archives, waivers, stashes, commits, tags, releases, pushes, installs, plugin-cache writes, backups, scheduler changes, deletes, prunes, moves, migrations, symlink changes, or to call A1, A2a, A3a, A5a, A6a, A2, A3, A5, A6, A4, Phase 0, or Phase 1 complete.

## 2026-07-02T12:29Z: A1 Recheck And Acceptance Hardening

Scope: direct read-only A1 preflight refresh with one independent evidence subagent and one adversarial reviewer. No approval packet was executed. No push, dry-run push, fetch, clone, build, project generation, upstream change, delete, move, stash, commit, tag, backup, restore, schedule, migration, install, bundle, snapshot, manifest, quarantine, release publication, or plugin-cache mutation was performed. A4 remained user-paused; no A4 checks were run.

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs remain `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` remains `56fab3bf8192826fa9558392927b27cada070af1`, matching the pinned approval phrase.
- Local `codex/archive-ios-native-20260614` remains `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`, matching the pinned approval phrase.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` remain absent.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` has neither exact A1 target ref: `refs/heads/codex/archive-ios-native-20260614` nor `refs/heads/ios-native-app`.
- Current public `origin/main` remains `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Subagent results:

- Sagan the 2nd independently verified the live read-only A1 facts and returned ASKABLE with no drift. Private Git auth did not fail in that shell.
- Harvey the 2nd adversarially reviewed the A1 ask and returned NO-GO until two boundaries were tightened: Phase 1 remaining-gap acceptance needed an exact phrase, and private A1 verification commands needed `GIT_TERMINAL_PROMPT=0`.

Patches applied after review:

- `docs/ECOSYSTEM_EXECUTION_STATUS.md`, `docs/ECOSYSTEM_ACT_GOALS.md`, `docs/PHASE0_COMPLETION_AUDIT.md`, and this file now say that if any Phase 0 exit gap remains after A1 and A4 pass, Andrew must say the exact phrase `accept Phase 1 start with remaining Phase 0 gaps: <named gap IDs>` before Phase 1 starts.
- `docs/PRESERVATION_GATES.md`, `docs/PHASE0_APPROVAL_PACKETS.md`, and `docs/A1_APPROVAL_REQUEST.md` now require private A1 verification commands to run with `GIT_TERMINAL_PROMPT=0`, including private `ls-remote`, `fetch`, and `git clone`; any private Git verification failure stops the packet and records A1 as partial or blocked.
- `docs/PRESERVATION_GATES.md` now pins the current A2a dirty-set hash and A5a worktree tuple so the runbook matches the 12:14Z packet evidence.

Result:

- A1 remains eligible to ask Andrew for the exact limited approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- A4 remains user-paused until Andrew explicitly resumes A4 after connecting a backup disk.
- Phase 1+ remains blocked by A1 and A4, plus the exact remaining-gap acceptance rule above.
- Do not treat this as approval to push, dry-run push, fetch, clone, build, generate projects, set upstreams, delete, move, stash, commit, create bundles, create snapshots, create manifests, extract iOS, sign, install, back up, restore, schedule, migrate, tag, publish, mutate plugin cache, run A4 checks, or call A1, A4, or Phase 0 complete.

## 2026-07-02T12:14Z: A2a/A3a/A5a/A6a Queue Recheck

Scope: direct read-only refresh of the non-A1 askable queue while A1 remains the recommended first approval ask and A4 remains user-paused. No approval packet was executed. No bundle, snapshot, copy, `rsync`, install, stash, commit, branch switch, tag, push, manifest, quarantine directory, archive, waiver, clone, build, project generation, backup operation, restore operation, scheduler change, migration, delete, prune, move, release publication, or plugin-cache mutation was performed. No A4 checks were run.

Observed direct A2a evidence:

- `/Users/afar/dev/fieldtheory-oss` remains on `codex/release-0.3.14-startup-library...origin/codex/release-0.3.14-startup-library [ahead 31]`.
- Local HEAD remains `0c560c32e7ed2a702cbaa1d2127768ce2fd2c7da`.
- Upstream `origin/codex/release-0.3.14-startup-library` remains `7ba1cd4b77bfddc6282a48d056fb7f1c5427325f`.
- Local and live `origin/main` remain `4df630b96d2c2ec30d03e353dc1364994587457f`.
- The branch remains 30 commits ahead of `origin/main` and 31 commits ahead of its upstream release branch.
- Dirty status is now 37 paths: 28 modified tracked paths and 9 Git-visible untracked paths, with SHA-256 `1f7a98cd04fdde97c48493fc7060843ba6dce13acc0779b3c3805020fa0c135d`.
- The added Git-visible untracked path relative to the prior packet is `mac-app/docs/PLAN_LIVE_TYPING.md`.
- `mac-app/package.json` still says `0.3.20`; `CHANGELOG.md` still starts at `0.1.33`; `RELEASE_CHECKLIST.md` still says `v0.1.25+maxwell`.
- Local source tags and live source repo tags remain absent.
- `afar1/fieldtheory` and `afar1/field-releases` both report `PUBLIC`.
- Latest release in `afar1/field-releases` remains `v0.3.14`, and `latest-mac.yml` still says `version: 0.3.14`.

Observed direct A3a evidence:

- `/Users/afar/dev/fieldtheory-plugin` remains on `main...origin/main`.
- Dev repo HEAD remains `4d7b20ae50659743802a28528a09c1fd1501a799`.
- Dev repo status hash remains `39c3d661ab278fa7c597f092f3f850738334315e78ce8d7f507435838158dc76`.
- Installed source and Codex cache remain byte-identical.
- Dev bundle still differs from installed source in `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`.
- `/Users/afar/dev/fieldtheory-plugin/plugin` remains absent.
- `/private/tmp/a3_dev_files.txt` and `/private/tmp/a3_installed_files.txt` still exist; deletion remains unapproved.

Observed direct A5a evidence:

- `/Users/afar/dev` has 59 Field Theory-family directories by the current review pattern.
- Target-sensitive directories remain `/Users/afar/dev/littleai`, `/Users/afar/dev/old-field`, `/Users/afar/dev/oscar`, and `/Users/afar/dev/oscar-pr-101-preserved`.
- Worktree records across target repos now total 60: `fieldtheory-oss=12`, `fieldtheory=17`, `fieldtheory-cli=30`, and `fieldtheory-plugin=1`.
- Existing `/private/tmp/fieldtheory-cli-*` directories remain 5: `/private/tmp/fieldtheory-cli-ci-config`, `/private/tmp/fieldtheory-cli-ci-data`, `/private/tmp/fieldtheory-cli-ci-home`, `/private/tmp/fieldtheory-cli-current-context-pr`, and `/private/tmp/fieldtheory-cli-origin-main-publish-check`.
- `fieldtheory-cli` prunable `/private/tmp/fieldtheory-cli-*` worktree records remain 17.
- `/Users/afar/dev/oscar` remains on `main...origin/main [behind 4]` with untracked plan/log/model files.
- Oscar local HEAD remains `615d081171a4d2d6df5ed1d790c4f13a58a11618`; stale local `origin/main` remains `2448e3d2f9460b867a5e3aa8c08f2df978840e3d`; live GitHub `origin/main` remains `f81481ff9824ddb4fa252ed93933d9bc815dc930`.
- `/Users/afar/dev/fieldtheory-labs.oscar-mirror.git` remains `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`, and GitHub compare reports `{status: ahead, ahead_by: 12, behind_by: 0, total_commits: 12}`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` remains present and protected until A1 is verified.

Observed direct A6a evidence:

- `bookmarks.db?immutable=1` remains absent.
- `twitter-bookmarks.db` remains a zero-byte regular file, not a symlink.
- Its exact tuple remains `70248019 0 1776019722 Regular File`, with modified time `Apr 12 14:48:42 2026`.

Subagent results:

- Linnaeus the 2nd independently verified A2a/A3a read-only. Linnaeus returned A2a DRIFTED until the dirty-set tuple was regenerated, and A3a ASK-ONLY with no approval-doc patch needed.
- Curie the 2nd independently verified A5a/A6a read-only. Curie returned A5a DRIFTED until the worktree-count tuple was regenerated, and A6a ASK-ONLY with no approval-doc patch needed.
- Poincare the 2nd adversarially reviewed the non-A1 queue. Poincare found the queue stayed ask-only, limited to preservation/manifest/quarantine, kept A1 first, and kept A4 paused, but returned NO-GO until loose waiver language in A2/A1/Phase 1 wording was tightened. After the patch, Poincare rereviewed read-only and returned GO.

Patches applied after review:

- `docs/A2A_APPROVAL_REQUEST.md` and `docs/PHASE0_APPROVAL_PACKETS.md` now pin the 12:14Z A2a dirty-set hash `1f7a98cd04fdde97c48493fc7060843ba6dce13acc0779b3c3805020fa0c135d` and the 37-path dirty set, including `mac-app/docs/PLAN_LIVE_TYPING.md`.
- `docs/A5A_APPROVAL_REQUEST.md`, `docs/PHASE0_APPROVAL_PACKETS.md`, and `docs/PHASE0_PREFLIGHT_CHECKLIST.md` now pin the 12:14Z A5a worktree tuple `fieldtheory-oss=12`, `fieldtheory=17`, `fieldtheory-cli=30`, `fieldtheory-plugin=1`, total `60`.
- `docs/PHASE0_APPROVAL_PACKETS.md` now says A2 release artifacts/updater evidence may be waived only by a later named exact waiver phrase, and the A2c packet defines no such waiver.
- `docs/ECOSYSTEM_EXECUTION_STATUS.md` now uses exact waiver language for the older A1 build-verification note and Phase 1 gate wording.

Result:

- A2a remains eligible to ask Andrew for the exact limited approval phrase `approve A2a create mac-app preservation bundle and dirty-tree snapshot`, but only against the regenerated 12:14Z dirty-set tuple.
- A3a remains eligible to ask Andrew for the exact limited approval phrase `approve A3a plugin installed-state snapshot`, but only as installed/cache preservation with the dev-repo drift explicitly named.
- A5a remains eligible to ask Andrew for the exact limited approval phrase `approve A5a cleanup manifest only`, but only against the regenerated 12:14Z worktree-count tuple.
- A6a remains eligible to ask Andrew for the exact limited approval phrase `approve A6a review-debris quarantine`.
- A1 remains the recommended first ask. A4 remains user-paused until Andrew explicitly resumes A4 after connecting a backup disk.
- Do not treat this as approval to create bundles, snapshots, manifests, quarantine directories, archives, waivers, stashes, commits, tags, releases, pushes, installs, plugin-cache writes, backups, scheduler changes, deletes, prunes, moves, migrations, symlink changes, or to call A2a, A3a, A5a, A6a, A2, A3, A5, A6, or Phase 0 complete.

## 2026-07-02T11:59Z: A1 And Orchestration Boundary Recheck

Scope: direct read-only A1 preflight refresh plus source-plan/current-ledger review with one independent evidence subagent and one adversarial reviewer. No approval packet was executed. No push, dry-run push, fetch, clone, build, project generation, upstream change, delete, move, stash, commit, tag, backup, restore, schedule, migration, install, bundle, snapshot, manifest, or plugin-cache mutation was performed. A4 remained user-paused; no A4 checks were run.

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs remain `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` remains `56fab3bf8192826fa9558392927b27cada070af1`, matching the pinned approval phrase.
- Local `codex/archive-ios-native-20260614` remains `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`, matching the pinned approval phrase.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` remain absent.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` has neither exact A1 target ref: `refs/heads/codex/archive-ios-native-20260614` nor `refs/heads/ios-native-app`.
- Current public `origin/main` remains `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Subagent results:

- Peirce the 2nd independently reviewed the source plan, current docs, and live read-only A1 facts. Peirce returned NO-GO only for two older historical A4 mounted-volume readiness cues; those two lines now say A4 remains user-paused until Andrew explicitly resumes it after connecting a backup disk.
- Nietzsche the 2nd adversarially reviewed the goal map, approval queue, and A1/A4 gates. Nietzsche returned NO-GO until loose A1 build-waiver and A4 scheduling-waiver wording was converted to exact phrases, and until stale named subagent assignments were made reusable. After the patch, Nietzsche rereviewed read-only and returned GO.

Patches applied after review:

- `docs/A1_APPROVAL_REQUEST.md`, `docs/PHASE0_APPROVAL_PACKETS.md`, `docs/PRESERVATION_GATES.md`, `docs/ECOSYSTEM_ACT_GOALS.md`, and `docs/ECOSYSTEM_EXECUTION_STATUS.md` now say A1 build may be waived only by the exact phrase `waive A1 fresh-clone build gate after recorded blocker`; without it, A1 remains partial or blocked and does not unblock E1/E2 or Phase 1+.
- `docs/PHASE0_APPROVAL_PACKETS.md`, `docs/PRESERVATION_GATES.md`, `docs/PHASE0_PREFLIGHT_CHECKLIST.md`, and `docs/ECOSYSTEM_EXECUTION_STATUS.md` now say A4 scheduling may be waived only by the exact phrase `waive A4 scheduled-backup gate after manual backup and restore drill`; without it, A4 remains incomplete and does not unblock B3/B4/F1 or Phase 1+.
- `docs/ECOSYSTEM_ACT_GOALS.md` now uses reusable evidence/adversarial subagent goal slots instead of stale named current-session assignments.
- This file now has a top operating note that older mounted-volume wording is superseded by the A4 user pause.

Result:

- A1 remains eligible to ask Andrew for the exact limited approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- A4 remains user-paused until Andrew explicitly resumes A4 after connecting a backup disk.
- Phase 1+ remains blocked unless A1 and A4 pass and remaining Phase 0 gaps are explicitly accepted by Andrew or waived with named exact waiver language.
- Do not treat this as approval to push, dry-run push, fetch, clone, build, generate projects, set upstreams, delete, move, stash, commit, create bundles, create snapshots, create manifests, extract iOS, sign, install, back up, restore, schedule, migrate, tag, publish, mutate plugin cache, run A4 checks, or call A1, A4, or Phase 0 complete.

## 2026-07-02T11:36Z: A1 Approval-Request Recheck

Scope: read-only A1 preflight refresh with one independent evidence subagent and one adversarial reviewer. No approval packet was executed. No push, dry-run push, clone, build, project generation, upstream change, fetch, delete, move, stash, commit, tag, backup, restore, schedule, migration, install, bundle, snapshot, manifest, or plugin-cache mutation was performed. A4 remained user-paused; no A4 checks were run.

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs remain `https://github.com/afar1/fieldtheory-labs.git`; public `origin` push URL remains `https://github.com/afar1/fieldtheory.git`.
- Local `ios-native-app` remains `56fab3bf8192826fa9558392927b27cada070af1`, matching the pinned approval phrase.
- Local `codex/archive-ios-native-20260614` remains `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`, matching the pinned approval phrase.
- `afar1/fieldtheory` reports `PUBLIC`; `afar1/fieldtheory-labs` reports `PRIVATE`.
- Private `labs` exact target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` returned no rows with exit `0` in the coordinator shell.
- Historical private ref `refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app` remains present at `56fab3bf8192826fa9558392927b27cada070af1` in the coordinator shell.
- Public `origin` exact target refs from `/Users/afar/dev/fieldtheory` returned no rows with exit `0` for both `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app`.
- Current public `origin/main` remains `4df630b96d2c2ec30d03e353dc1364994587457f`.
- GitHub's tree API for current public `origin/main` reports `truncated=false` and zero `ios-native` paths.

Subagent cross-checks:

- Hypatia the 2nd independently verified the local/public A1 facts but hit the known subagent-environment private Git credential-helper failure: `git: 'credential-osxkeychain' is not a git command` and `fatal: could not read Username for 'https://github.com': terminal prompts disabled`. Hypatia classified A1 as blocked from the subagent environment.
- The coordinator shell reran the exact required private `git ls-remote` checks with `GIT_TERMINAL_PROMPT=0`; both exact private target checks exited `0` with no refs, and the historical private ref resolved to `56fab3bf8192826fa9558392927b27cada070af1`.
- Hooke the 2nd adversarially reviewed A1 and returned NO-GO until the post-push upstream-tracking verification was hardened. Hooke found the template could create private branches and then fail while setting upstreams because local `refs/remotes/labs/...` refs might not exist yet. On rereview, Hooke found the separate verification block also needed `set -euo pipefail` so failed checks cannot scroll by before clone/build commands. After the second patch, Hooke returned GO.

Documentation hardening:

- `docs/PHASE0_APPROVAL_PACKETS.md` now includes fetching the two private branch refs into local `refs/remotes/labs/...` refs and verifying those refs before setting upstream tracking.
- `docs/PRESERVATION_GATES.md` now runs the verification template under `set -euo pipefail` and performs those explicit fetch-and-verify steps before `branch --set-upstream-to`.
- `docs/A1_APPROVAL_REQUEST.md` now records Hooke's finding, the upstream-tracking hardening, and the final adversarial GO.

Result:

- A1 remains eligible to ask Andrew for the exact limited approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- Private Git auth failure in the execution shell remains a stop condition. Do not substitute subagent-only Git transport failure for coordinator-shell drift, and do not substitute GitHub API evidence for the required private Git transport check during execution.
- Do not treat this as approval to push, dry-run push, fetch, clone, build, generate projects, set upstreams, delete, move, stash, commit, create bundles, create snapshots, create manifests, extract iOS, sign, install, back up, restore, schedule, migrate, tag, publish, mutate plugin cache, or call A1 or Phase 0 complete.

## 2026-07-02T11:22Z: A2a/A3a/A5a/A6a Queue Recheck

Scope: read-only refresh of the non-A1 askable queue while A1 remains the recommended first approval ask and A4 remains user-paused. No approval packet was executed. No bundle, snapshot, copy, `rsync`, install, stash, commit, branch switch, tag, push, manifest, quarantine directory, archive, waiver, clone, build, project generation, backup operation, restore operation, scheduler change, migration, delete, prune, move, release publication, or plugin-cache mutation was performed. No A4 checks were run.

Observed direct A2a evidence:

- `/Users/afar/dev/fieldtheory-oss` remains on `codex/release-0.3.14-startup-library...origin/codex/release-0.3.14-startup-library [ahead 31]`.
- HEAD remains `0c560c32e7ed2a702cbaa1d2127768ce2fd2c7da`; upstream remains `7ba1cd4b77bfddc6282a48d056fb7f1c5427325f`.
- Local and live `origin/main` both remain `4df630b96d2c2ec30d03e353dc1364994587457f`.
- Ahead counts remain `HEAD...origin/main = 30 0` and `HEAD...origin/codex/release-0.3.14-startup-library = 31 0`.
- Dirty status remains 28 tracked modified paths and 8 Git-visible untracked paths, with SHA-256 `945b0d110de6ed044b64ce21ef56e07c1c6da1976c6f99690b581bd321aec484`.
- `origin` push URL remains `https://github.com/afar1/fieldtheory.git`; `afar1/fieldtheory` and `afar1/field-releases` both report `PUBLIC`.
- Package metadata remains `0.3.20`; changelog still starts at `0.1.33`; release checklist still says `v0.1.25+maxwell`; source tags remain absent.
- Latest release/feed remains `v0.3.14` and `latest-mac.yml` says `version: 0.3.14`.

Observed direct A3a evidence:

- `/Users/afar/dev/fieldtheory-plugin` remains on `main...origin/main` at `4d7b20ae50659743802a28528a09c1fd1501a799`, with upstream `origin/main` at the same SHA.
- Dirty status remains 7 tracked modified paths and 12 Git-visible untracked paths, with SHA-256 `39c3d661ab278fa7c597f092f3f850738334315e78ce8d7f507435838158dc76`.
- `/Users/afar/plugins/field-theory` and `/Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607` both exist and compare cleanly with `diff -qr`.
- Dev bundle still differs from installed source in exactly `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`.
- `/Users/afar/dev/fieldtheory-plugin/plugin` remains absent.
- `/private/tmp/a3_dev_files.txt` and `/private/tmp/a3_installed_files.txt` still exist, both size `566`, modified `Jul 2 00:32:45 2026`.
- Installed source and Codex cache both still include sibling `skills/*/agents/openai.yaml` files for `bookmarks`, `browser-library`, `current-document`, `fieldtheory`, `library`, and `workflow`.

Observed direct A5a evidence:

- `/Users/afar/dev` still has 59 Field Theory-family directories by the current review pattern.
- The exact target-sensitive directories remain `/Users/afar/dev/littleai`, `/Users/afar/dev/old-field`, `/Users/afar/dev/oscar`, and `/Users/afar/dev/oscar-pr-101-preserved`.
- Worktree counts remain `fieldtheory-oss=11`, `fieldtheory=17`, `fieldtheory-cli=30`, and `fieldtheory-plugin=1`, total `59`.
- `fieldtheory-cli` still has 17 prunable `/private/tmp/fieldtheory-cli-*` worktree records.
- `/private/tmp` still has 5 existing `fieldtheory-cli-*` directories: `/private/tmp/fieldtheory-cli-ci-config`, `/private/tmp/fieldtheory-cli-ci-data`, `/private/tmp/fieldtheory-cli-ci-home`, `/private/tmp/fieldtheory-cli-current-context-pr`, and `/private/tmp/fieldtheory-cli-origin-main-publish-check`.
- `/Users/afar/dev/oscar` remains on `main...origin/main [behind 4]` at `615d081171a4d2d6df5ed1d790c4f13a58a11618`, with untracked plan/log/model files.
- Stale local `oscar` `origin/main` remains `2448e3d2f9460b867a5e3aa8c08f2df978840e3d`; live GitHub `origin/main` remains `f81481ff9824ddb4fa252ed93933d9bc815dc930`.
- `/Users/afar/dev/fieldtheory-labs.oscar-mirror.git` remains at `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`, and GitHub compare reports `{status: ahead, ahead_by: 12, behind_by: 0, total_commits: 12}`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` remains present and protected until A1 is verified.

Observed direct A6a evidence:

- `/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1` remains absent.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` exists, is a regular file, and is not a symlink.
- `stat -f '%i %z %m %HT'` reports exact tuple `70248019 0 1776019722 Regular File`.
- `ls -lO` reports `-rw-r--r--@ 1 afar staff - 0 Apr 12 14:48 /Users/afar/.ft-bookmarks/twitter-bookmarks.db`.

Subagent cross-checks:

- Halley the 2nd independently verified A2a/A3a read-only and returned ASK-ONLY for both packets with no evidence drift.
- Euclid the 2nd independently verified A5a/A6a read-only and returned ASK-ONLY for both packets with no evidence drift.
- Singer the 2nd adversarially reviewed the non-A1 queue and returned GO to report A2a/A3a/A5a/A6a as limited askable packets only, behind A1 and with A4 still paused.

Result:

- A2a, A3a, A5a, and A6a remain eligible to ask Andrew for their exact limited approval phrases, but none is approved, executed, or complete.
- A1 remains the recommended first ask. A4 remains user-paused until Andrew explicitly resumes A4 after connecting a backup disk.
- Do not treat this as approval to create bundles, snapshots, manifests, quarantine directories, archives, waivers, stashes, commits, tags, releases, pushes, installs, plugin-cache writes, backups, scheduler changes, deletes, prunes, moves, migrations, symlink changes, or to call A2a, A3a, A5a, A6a, A2, A3, A5, A6, or Phase 0 complete.

## 2026-07-02T11:15Z: A1 Approval-Request Recheck

Scope: read-only A1 preflight refresh with one independent evidence subagent and one adversarial reviewer. No approval packet was executed. No push, dry-run push, clone, build, project generation, upstream change, delete, move, stash, commit, tag, backup, restore, schedule, migration, install, bundle, snapshot, or plugin-cache mutation was performed. A4 remained user-paused; no A4 checks were run.

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs remain `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` remains `56fab3bf8192826fa9558392927b27cada070af1`, matching the pinned approval phrase.
- Local `codex/archive-ios-native-20260614` remains `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`, matching the pinned approval phrase.
- `afar1/fieldtheory` reports `PUBLIC`; `afar1/fieldtheory-labs` reports `PRIVATE`.
- Private `labs` exact target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` returned no rows with exit `0` in the coordinator shell.
- Historical private ref `refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app` remains present at `56fab3bf8192826fa9558392927b27cada070af1` in the coordinator shell.
- Public `origin` exact target refs from `/Users/afar/dev/fieldtheory` returned no rows with exit `0` for both `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app`.
- Current public `origin/main` remains `4df630b96d2c2ec30d03e353dc1364994587457f`.
- GitHub's tree API for current public `origin/main` reports `truncated=false` and zero `ios-native` paths.

Subagent cross-checks:

- Wegener the 2nd independently verified the local/public A1 facts but hit the known subagent-environment private Git credential-helper failure: `git: 'credential-osxkeychain' is not a git command` and `fatal: could not read Username for 'https://github.com': terminal prompts disabled`. Wegener classified A1 as blocked from the subagent environment.
- The coordinator shell reran the exact required private `git ls-remote` checks with `GIT_TERMINAL_PROMPT=0`; both exact private target checks exited `0` with no refs, and the historical private ref resolved to `56fab3bf8192826fa9558392927b27cada070af1`.
- Arendt the 2nd adversarially reviewed the current A1 queue, exact phrase, public/private remote boundaries, A4 pause language, and askable-packet ordering. Arendt returned GO to report A1 as the current recommended approval ask only, with no documentation blocker.

Result:

- A1 remains eligible to ask Andrew for the exact limited approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- Private Git auth failure in the execution shell remains a stop condition. Do not substitute subagent-only Git transport failure for coordinator-shell drift, and do not substitute GitHub API evidence for the required private Git transport check during execution.
- Do not treat this as approval to push, dry-run push, clone, build, generate projects, set upstreams, delete, move, stash, commit, create bundles, create snapshots, extract iOS, sign, install, back up, restore, schedule, migrate, tag, publish, mutate plugin cache, or call A1 or Phase 0 complete.

## 2026-07-02T10:53Z: A5a/A6a Manifest And Quarantine Recheck

Scope: read-only A5a/A6a preflight refresh. No approval packet was executed. No manifest, quarantine directory, archive, bundle, snapshot, waiver, stash, commit, clone, build, project generation, install, backup operation, restore operation, scheduler change, migration, delete, prune, move, tag, push, release publication, or plugin-cache mutation was performed.

Observed direct A5a evidence:

- `/Users/afar/dev` still has 59 Field Theory-family directories by the current review pattern.
- The exact target-sensitive directories remain `/Users/afar/dev/littleai`, `/Users/afar/dev/old-field`, `/Users/afar/dev/oscar`, and `/Users/afar/dev/oscar-pr-101-preserved`.
- Worktree counts remain `fieldtheory-oss=11`, `fieldtheory=17`, `fieldtheory-cli=30`, and `fieldtheory-plugin=1`, total `59`.
- `fieldtheory-cli` still has 17 prunable `/private/tmp/fieldtheory-cli-*` worktree records.
- `/private/tmp` still has 5 existing `fieldtheory-cli-*` directories: `/private/tmp/fieldtheory-cli-ci-config`, `/private/tmp/fieldtheory-cli-ci-data`, `/private/tmp/fieldtheory-cli-ci-home`, `/private/tmp/fieldtheory-cli-current-context-pr`, and `/private/tmp/fieldtheory-cli-origin-main-publish-check`.
- `/Users/afar/dev/oscar` remains on `main...origin/main [behind 4]` with untracked plan/log/model files.
- Stale local `oscar` `origin/main` remains `2448e3d2f9460b867a5e3aa8c08f2df978840e3d`.
- Live GitHub `oscar` `origin/main` remains `f81481ff9824ddb4fa252ed93933d9bc815dc930`.
- `/Users/afar/dev/fieldtheory-labs.oscar-mirror.git` remains at `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`.
- GitHub compare for mirror to live reports `{status: ahead, ahead_by: 12, behind_by: 0, total_commits: 12}`, meaning live remains 12 commits ahead of the mirror.
- `/Users/afar/dev/old-field` remains dirty/untracked.
- `/Users/afar/dev/oscar-pr-101-preserved` remains dirty.
- `/Users/afar/dev/littleai` exists.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` exists and remains protected until A1 is verified.

Observed direct A6a evidence:

- `/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1` remains absent.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` exists.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` is a regular file and not a symlink.
- `stat -f '%N inode=%i size=%z modified=%Sm'` reports inode `70248019`, size `0`, and modified time `Apr 12 14:48:42 2026`.
- `stat -f '%i %z %m %HT'` reports exact tuple `70248019 0 1776019722 Regular File`.
- `ls -lO` reports `-rw-r--r--@ 1 afar staff - 0 Apr 12 14:48 /Users/afar/.ft-bookmarks/twitter-bookmarks.db`.

Subagent cross-checks:

- Gauss the 2nd independently verified A5a/A6a read-only and returned ASK-ONLY for both packets with no evidence drift.
- Hilbert the 2nd adversarially reviewed the A5a/A6a boundaries and returned NO-GO to ask for A5a until exact stop gates were tightened. Hilbert found A6a GO after fresh same-shell preflight.

Documentation hardening:

- `docs/PHASE0_PREFLIGHT_CHECKLIST.md` now requires the exact A5a stop tuple before asking for or using approval: count, target-sensitive list, per-repo worktree counts, prunable worktree record count, `/private/tmp` candidate count, protected archive presence, and Oscar evidence.
- `docs/A5A_APPROVAL_REQUEST.md` now stops if per-repo worktree counts, exact `/private/tmp` path list, protected archive presence, or Oscar live/mirror compare evidence differs from the recorded evidence.
- `docs/PRESERVATION_GATES.md` now includes stronger read-only A5 verification checks and records the 10:53Z A5/A6 evidence.
- `docs/PHASE0_PREFLIGHT_CHECKLIST.md` now names the A6 section as `Packet A6a Preflight`.

Result:

- A5a remains eligible to ask Andrew for the exact limited approval phrase `approve A5a cleanup manifest only`.
- A5a is not approved, not executed, and not complete.
- A6a remains eligible to ask Andrew for the exact limited approval phrase `approve A6a review-debris quarantine`.
- A6a is not approved, not executed, and not complete.
- Do not treat this as approval to create manifests, quarantine directories, archives, bundles, snapshots, waivers, stashes, commits, tags, releases, pushes, installs, plugin-cache writes, backups, scheduler changes, deletes, prunes, moves, migrations, symlink changes, or to call A5a, A6a, A5, or Phase 0 complete.

## 2026-07-02T10:43Z: A1 Public-Boundary Recheck

Scope: read-only A1 preflight refresh. No approval packet was executed. No push, dry-run push, clone, build, project generation, upstream change, delete, move, stash, commit, tag, backup, restore, schedule, migration, install, bundle, snapshot, or plugin-cache mutation was performed.

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs remain `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` remains `56fab3bf8192826fa9558392927b27cada070af1`, matching the pinned approval phrase.
- Local `codex/archive-ios-native-20260614` remains `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`, matching the pinned approval phrase.
- `afar1/fieldtheory` reports `PUBLIC`; `afar1/fieldtheory-labs` reports `PRIVATE`.
- Private `labs` exact target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` returned no rows with exit `0`.
- Historical private ref `refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app` remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` exact target refs from `/Users/afar/dev/fieldtheory` returned no rows with exit `0` for both `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app`.
- Current public `origin/main` remains `4df630b96d2c2ec30d03e353dc1364994587457f`.
- GitHub's tree API for current public `origin/main` reports `truncated=false` and zero `ios-native` paths.

Subagent cross-checks:

- Aquinas the 2nd independently verified A1 read-only and returned GO-TO-ASK with no evidence drift.
- Helmholtz the 2nd adversarially reviewed the A1 boundary and returned NO-GO until one guardrail bug was patched: the checklist checked public archive-branch absence through the archive checkout's `origin`, which points to Oscar, and the runbook template checked only public `ios-native-app`.

Documentation hardening:

- `docs/PHASE0_PREFLIGHT_CHECKLIST.md` now checks both exact public A1 target refs from `/Users/afar/dev/fieldtheory`.
- `docs/PRESERVATION_GATES.md` now records the July 2 10:43Z public-boundary proof and the A1 approval-only template now stops if public `origin` has either exact A1 target ref.
- `docs/PHASE0_APPROVAL_PACKETS.md` now describes the same-shell A1 preflight as including public-origin exact-ref and `origin/main` tree guards, not only private-remote checks.

Result:

- A1 remains eligible to ask Andrew for the exact limited approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- Do not treat this as approval to push, dry-run push, clone, build, generate projects, set upstreams, delete, move, stash, commit, create bundles, create snapshots, extract iOS, sign, install, back up, restore, schedule, migrate, tag, publish, mutate plugin cache, or call A1 or Phase 0 complete.

## 2026-07-02T10:39Z: A2a/A3a Preservation Recheck

Scope: read-only A2a/A3a preflight refresh. No approval packet was executed. No bundle, snapshot, copy, `rsync`, install, stash, commit, branch switch, tag, push, delete, cleanup, backup, or restore command was performed.

Observed A2a evidence:

- `/Users/afar/dev/fieldtheory-oss` remains on `codex/release-0.3.14-startup-library...origin/codex/release-0.3.14-startup-library [ahead 31]`.
- HEAD remains `0c560c32e7ed2a702cbaa1d2127768ce2fd2c7da`; upstream remains `7ba1cd4b77bfddc6282a48d056fb7f1c5427325f`.
- Local and live `origin/main` remain `4df630b96d2c2ec30d03e353dc1364994587457f`.
- The branch remains 30 commits ahead of `origin/main` and 31 commits ahead of upstream.
- Dirty status remains 28 tracked modified paths and 8 Git-visible untracked paths, with SHA-256 `945b0d110de6ed044b64ce21ef56e07c1c6da1976c6f99690b581bd321aec484`.
- `origin` push URL remains `https://github.com/afar1/fieldtheory.git`; `afar1/fieldtheory` and `afar1/field-releases` both report `PUBLIC`.
- Package metadata remains `0.3.20`; changelog still starts at `0.1.33`; release checklist still says `v0.1.25+maxwell`; source tags remain absent.
- Latest release/feed remains `v0.3.14` and `latest-mac.yml` says `version: 0.3.14`.

Observed A3a evidence:

- `/Users/afar/dev/fieldtheory-plugin` remains on `main...origin/main` at `4d7b20ae50659743802a28528a09c1fd1501a799`, with upstream `origin/main` at the same SHA.
- Dirty status remains 7 tracked modified paths and 12 Git-visible untracked paths, with SHA-256 `39c3d661ab278fa7c597f092f3f850738334315e78ce8d7f507435838158dc76`.
- Installed source and Codex cache still compare cleanly with `diff -qr`.
- Dev bundle still differs from installed source in exactly `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`.
- `/Users/afar/dev/fieldtheory-plugin/plugin` remains absent.
- `/private/tmp/a3_dev_files.txt` and `/private/tmp/a3_installed_files.txt` still exist.
- Installed source and Codex cache both still include sibling `skills/*/agents/openai.yaml` files.

Result:

- A2a remains ASK-ONLY as a bundle/dirty-tree preservation packet. A2 is not complete.
- A3a remains ASK-ONLY as an installed/cache preservation packet. A3 is not complete, and the broader dev-vs-installed drift remains exactly as documented.
- Tesla the 2nd independently verified no new A2a/A3a drift.
- Boole the 2nd adversarially found no blocker to asking for A2a/A3a preservation approvals; follow-on guardrail hardening was applied to the docs.

## 2026-07-02T02:26:52Z: A1 Private iOS Preservation

Scope: read-only A1 preflight refresh. No approval packet was executed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
```

Observed evidence:

- `/Users/afar/dev/fieldtheory` is on `ios-native-app`, clean, with upstream `origin/ios-native-app` gone.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` is on `codex/archive-ios-native-20260614`, clean, and ahead of `main` by one commit.
- Both `labs` push URLs are `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` SHA is `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` SHA is `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private ref `refs/heads/codex/archive-ios-native-20260614` is absent.
- Exact private ref `refs/heads/ios-native-app` is absent.
- Existing private archive ref `refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app` exists at `56fab3bf8192826fa9558392927b27cada070af1`.

Result:

- A1 remains ready for approval, not executed.
- A1 is not complete.
- The required private branch names are still absent.
- The preflight command shape was corrected to use exact full refs, because loose `git ls-remote --heads labs ios-native-app` can match the existing archived branch and create false confidence.
- Historical note: this unpinned phrase is superseded; current A1 requires `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.

## 2026-07-02T03:00:35Z: A1 Private iOS Preservation Recheck

Scope: read-only A1 preflight refresh. No approval packet was executed. No push, upstream change, clone, build, delete, stash, commit, or dry-run push was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
```

Observed evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]` with no dirty files.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]` with no dirty files.
- Both `labs` push URLs are `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- The exact private remote refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` returned no rows, so they remain absent.
- The existing archived private ref remains present at `56fab3bf8192826fa9558392927b27cada070af1` as `refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app`.
- A read-only subagent independently confirmed the same branch/ref shape. Its shell reported a missing `credential-osxkeychain` helper for plain private `git ls-remote`; local preflight should keep `GIT_TERMINAL_PROMPT=0` and stop on any auth failure instead of changing packet scope.

Result:

- Historical note: this unpinned phrase is superseded; current A1 requires `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved and not complete.
- Do not treat this as approval to push, set upstreams, clone, build, delete archive dirs, or call A1 complete.

## 2026-07-02T03:35:56Z: A1 Private iOS Preservation Recheck

Scope: read-only A1 preflight refresh. No approval packet was executed. No push, dry-run push, upstream change, clone, build, delete, stash, commit, or public ref change was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory ls-tree -r --name-only origin/main -- ios-native | wc -l
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote https://github.com/afar1/fieldtheory-labs.git refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
gh api repos/afar1/fieldtheory-labs/git/ref/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
gh api repos/afar1/fieldtheory-labs/git/ref/heads/codex/archive-ios-native-20260614
```

Observed evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]` with no dirty files.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]` with no dirty files.
- Both `labs` push URLs are `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` remains `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` remains `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- The exact private remote refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` returned no rows, so they remain absent.
- The existing archived private ref remains present at `56fab3bf8192826fa9558392927b27cada070af1` as `refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app`.
- Public `origin` returned no `refs/heads/ios-native-app`, and `origin/main` contains zero `ios-native` paths.
- A direct URL Git transport check against `https://github.com/afar1/fieldtheory-labs.git` for the existing archived private ref exited `0`, matching the configured `labs` remote check.
- A read-only evidence subagent challenged the missing target refs as a blocker and reported a possible direct Git auth issue. The orchestrator rechecked both claims directly: the missing exact target refs are expected before the approved push, and the direct Git transport auth issue did not reproduce.
- A read-only adversarial document reviewer reported no A1 packet wording blockers.

Result:

- Historical note: this unpinned phrase is superseded; current A1 requires `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved and not complete.
- Do not treat this as approval to push, set upstreams, clone, build, delete archive dirs, extract a new repo, run signing/TestFlight work, or call A1 complete.

## 2026-07-02T04:15:34Z: A1 Goal-Contract Recheck

Scope: read-only A1 goal-contract recheck after assigning explicit orchestrator and subagent goals. No approval packet was executed. No push, dry-run push, upstream change, clone, build, delete, stash, commit, or public ref change was performed.

Commands run locally:

```bash
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory ls-tree -r --name-only origin/main -- ios-native | wc -l
```

Observed evidence:

- Direct private Git transport from the orchestrator shell works: the existing private archived ref returned `56fab3bf8192826fa9558392927b27cada070af1` with exit `0`.
- The two exact target refs still returned no rows with exit `0`, so they remain absent before the approved push.
- Public `origin` still returned no `refs/heads/ios-native-app`, and `origin/main` still contains zero `ios-native` paths.
- Copernicus independently reported the same branch/ref shape, but its shell hit a `credential-osxkeychain` private Git auth failure. The orchestrator recheck did not reproduce that auth failure.
- Franklin found a valid approval-scope blocker: A1 was ref-name exact but not commit exact, so a moved local branch could have made the same approval phrase push different content.

Result:

- The old A1 approval phrase is superseded.
- A1 may only be asked with the SHA-pinned phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- The approval-only command shape now verifies local branch heads equal those SHAs before pushing and pushes SHA-to-ref.
- A1 is not approved and not complete.

## 2026-07-02T04:27:18Z: A1 SHA-Pinned Preflight Recheck

Scope: read-only A1 preflight refresh after the SHA-pinned approval packet patch. No approval packet was executed. No push, dry-run push, upstream change, clone, build, delete, stash, commit, public ref change, archive, bundle, or install was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
test "$(git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app)" = "56fab3bf8192826fa9558392927b27cada070af1"
test "$(git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614)" = "60e7e9ddbc2f98a0233d8769539b1fb4b189214a"
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory ls-tree -r --name-only origin/main -- ios-native | wc -l
```

Observed evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]` with no dirty files.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]` with no dirty files.
- Both `labs` push URLs are `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is exactly `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is exactly `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- The exact private remote refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` returned no rows with exit `0`, so they remain absent.
- The existing archived private ref remains present at `56fab3bf8192826fa9558392927b27cada070af1` as `refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app`.
- Public `origin` returned no `refs/heads/ios-native-app`, and `origin/main` contains zero `ios-native` paths.

Result:

- A1 is ready to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved and not complete.
- Do not treat this as approval to push, set upstreams, clone, build, delete archive dirs, extract a new repo, run signing/TestFlight work, or call A1 complete.

## 2026-07-02T04:52:13Z: A1 SHA-Pinned Preflight Recheck

Scope: read-only A1 preflight refresh. No approval packet was executed. No push, dry-run push, upstream change, clone, build, repo file deletion, stash, commit, public ref change, archive, bundle, extraction, signing, or install was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
test "$(git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app)" = "56fab3bf8192826fa9558392927b27cada070af1"
test "$(git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614)" = "60e7e9ddbc2f98a0233d8769539b1fb4b189214a"
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
gh api repos/afar1/fieldtheory-labs/git/ref/heads/codex/archive-ios-native-20260614
gh api repos/afar1/fieldtheory-labs/git/ref/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
gh api repos/afar1/fieldtheory-labs/git/ref/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main
git -C /Users/afar/dev/fieldtheory rev-parse origin/main
gh api 'repos/afar1/fieldtheory/git/trees/4df630b96d2c2ec30d03e353dc1364994587457f?recursive=1'
```

Observed evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]` with no dirty files.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]` with no dirty files.
- Both `labs` push URLs are `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is exactly `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is exactly `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- The exact private remote refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` returned no rows with exit `0` via Git, and GitHub API exact-ref checks returned `404 Not Found`, so they remain absent.
- The existing archived private ref remains present at `56fab3bf8192826fa9558392927b27cada070af1` as `refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app`.
- Public `origin` returned no `refs/heads/ios-native-app`.
- Public `origin/main` has advanced to `4df630b96d2c2ec30d03e353dc1364994587457f`; local `origin/main` is stale at `c3d42cd2c63abeec2c16166d1667d30e8f93a64a`.
- GitHub's tree API for the current public `origin/main` SHA returned zero `ios-native` paths and `truncated=false`.

Result:

- A1 is still ready to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved and not complete.
- Future public-leak checks should use the current public remote `main` SHA from `ls-remote` plus GitHub's tree API, not stale local `origin/main`.
- Do not treat this as approval to push, set upstreams, clone, build, delete archive dirs, extract a new repo, run signing/TestFlight work, stash, commit, or call A1 complete.

## 2026-07-02T05:15:13Z: A1 SHA-Pinned Preflight Recheck

Scope: read-only A1 preflight refresh. No approval packet was executed. No push, dry-run push, upstream change, clone, build, repo file deletion, stash, commit, public ref change, archive, bundle, extraction, signing, or install was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main
PUBLIC_MAIN_SHA="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main | awk '{print $1}')"
gh api "repos/afar1/fieldtheory/git/trees/$PUBLIC_MAIN_SHA?recursive=1" --jq '[.truncated, ([.tree[].path | select(. == "ios-native" or startswith("ios-native/"))] | length)] | @tsv'
```

Observed evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is exactly `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is exactly `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- The exact private remote refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` returned no rows, so they remain absent.
- The existing archived private ref remains present at `56fab3bf8192826fa9558392927b27cada070af1` as `refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app`.
- Public `origin` returned no `refs/heads/ios-native-app`.
- Current public `origin/main` is `4df630b96d2c2ec30d03e353dc1364994587457f`.
- GitHub's tree API for the current public `origin/main` SHA returned zero `ios-native` paths and `truncated=false`.

Result:

- A1 is still ready to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved and not complete.
- Do not treat this as approval to push, set upstreams, clone, build, delete archive dirs, extract a new repo, run signing/TestFlight work, stash, commit, or call A1 complete.

## 2026-07-02T02:30:59Z: A4a Manual Waist Backup

Scope: read-only A4a preflight refresh. No approval packet was executed.

Commands run locally:

```bash
test -d "$HOME/.fieldtheory"
test -L "$HOME/.fieldtheory/bookmarks"
readlink "$HOME/.fieldtheory/bookmarks"
test -d "$HOME/.ft-bookmarks"
test -d "/Volumes/Extreme SSD"
test -w "/Volumes/Extreme SSD"
command -v restic || true
launchctl list | rg -i 'fieldtheory|restic|backup' || true
crontab -l 2>/dev/null | rg -i 'fieldtheory|restic|backup' || true
find "$HOME/.fieldtheory" "$HOME/.ft-bookmarks" -maxdepth 3 -iname '*restore*drill*' -print
du -sh "$HOME/.fieldtheory" "$HOME/.ft-bookmarks"
df -h "/Volumes/Extreme SSD"
```

Observed evidence:

- `~/.fieldtheory` exists.
- `~/.fieldtheory/bookmarks` is a symlink to `/Users/afar/.ft-bookmarks`.
- `~/.ft-bookmarks` exists.
- `/Volumes/Extreme SSD` is missing and not writable.
- `df -h "/Volumes/Extreme SSD"` reports `No such file or directory`.
- `restic` is missing from `PATH`.
- `launchctl` has matches for `com.apple.SecureBackupDaemon` and `com.fieldtheory.app.ShipIt`, but these are not evidence of the planned Field Theory waist backup job.
- `crontab` has no Field Theory, restic, or backup match.
- No restore-drill artifacts were found under `~/.fieldtheory` or `~/.ft-bookmarks`.
- `~/.fieldtheory` is about 617 MB.
- `~/.ft-bookmarks` is about 54 GB.

Result:

- A4a preflight fails.
- A4a should not be requested or executed until the approved backup volume is mounted, writable, and verified from mount/disk metadata.
- `restic` is missing. The A4a packet allows installing it after approval, but that should be called out before asking for approval.
- A4 remains not complete.

## 2026-07-02T03:10:51Z: A4a Manual Waist Backup Recheck

Scope: read-only A4a/A4b preflight refresh. No approval packet was executed. No install, backup, restore, scheduler change, file write, deletion, or migration was performed.

Commands run locally:

```bash
test -d "$HOME/.fieldtheory"
test -L "$HOME/.fieldtheory/bookmarks"
readlink "$HOME/.fieldtheory/bookmarks"
test -d "$HOME/.ft-bookmarks"
test -d "/Volumes/Extreme SSD"
test -w "/Volumes/Extreme SSD"
df -h "/Volumes/Extreme SSD"
command -v restic
launchctl list | rg -i 'fieldtheory|restic|backup' || true
crontab -l 2>/dev/null | rg -i 'fieldtheory|restic|backup' || true
BOOKMARKS_REAL="$(readlink "$HOME/.fieldtheory/bookmarks" 2>/dev/null || printf '%s\n' "$HOME/.fieldtheory/bookmarks")"
find "$HOME/.fieldtheory" "$BOOKMARKS_REAL" -maxdepth 3 -iname '*restore*drill*' -print
find "$HOME/.fieldtheory" "$BOOKMARKS_REAL" -maxdepth 3 -iname '*restore*drill*' -type f -print -exec sed -n '1,20p' {} \;
du -sh "$HOME/.fieldtheory" "$HOME/.ft-bookmarks"
```

Observed evidence:

- `~/.fieldtheory` exists and is about 617 MB.
- `~/.fieldtheory/bookmarks` is still a symlink to `/Users/afar/.ft-bookmarks`.
- `~/.ft-bookmarks` exists and is about 54 GB.
- `/Volumes/Extreme SSD` does not exist, is not writable, and `df -h "/Volumes/Extreme SSD"` reports `No such file or directory`.
- `restic` is still missing from `PATH`.
- No restore-drill artifacts were found under `~/.fieldtheory` or `/Users/afar/.ft-bookmarks`.
- The broad `launchctl` regex matched `com.apple.SecureBackupDaemon` and `com.fieldtheory.app.ShipIt`, but there is no evidence of a Field Theory `restic` or backup scheduler.
- `crontab` had no `fieldtheory`, `restic`, or `backup` matches.
- A read-only subagent independently confirmed no material drift from the documented blocker.

Result:

- A4a is not askable yet because the approved backup volume is not mounted or writable.
- A4b is blocked because A4a has not passed and no restore-drill artifact exists.
- A4 remains not complete.
- Do not treat this as approval to install `restic`, initialize a repository, run a backup, run a restore drill, load a scheduler, write backup config, or run migrations.

## 2026-07-02T03:44:19Z: A4a Manual Waist Backup Recheck

Scope: read-only A4a/A4b preflight refresh. No approval packet was executed. No install, backup, restore, scheduler change, file write, deletion, migration, config write, or drill file creation was performed.

Commands run locally:

```bash
test -d "$HOME/.fieldtheory"
test -L "$HOME/.fieldtheory/bookmarks"
readlink "$HOME/.fieldtheory/bookmarks"
test -d "$HOME/.ft-bookmarks"
BOOKMARKS_REAL="$(readlink "$HOME/.fieldtheory/bookmarks" 2>/dev/null || printf '%s\n' "$HOME/.fieldtheory/bookmarks")"
test -d "/Volumes/Extreme SSD"
test -w "/Volumes/Extreme SSD"
df -h "/Volumes/Extreme SSD"
command -v restic
command -v rsync
launchctl list | rg -i 'fieldtheory|restic|backup' || true
crontab -l 2>/dev/null | rg -i 'fieldtheory|restic|backup' || true
find "$HOME/.fieldtheory" "$BOOKMARKS_REAL" -maxdepth 3 -iname '*restore*drill*' -print
find "$HOME/.fieldtheory" "$BOOKMARKS_REAL" -maxdepth 3 -iname '*restore*drill*' -type f -print -exec sed -n '1,20p' {} \;
du -sh "$HOME/.fieldtheory" "$HOME/.ft-bookmarks"
tmutil destinationinfo
find "$HOME/Library/LaunchAgents" /Library/LaunchAgents /Library/LaunchDaemons -maxdepth 1 -type f \( -iname '*field*' -o -iname '*restic*' -o -iname '*backup*' \) -print
find "$HOME/.fieldtheory" "$HOME/.ft-bookmarks" -maxdepth 4 \( -iname '*backup*' -o -iname '*restore*' -o -iname '*restic*' \) -print
```

Observed evidence:

- `~/.fieldtheory` exists and is about 617 MB.
- `~/.fieldtheory/bookmarks` is still a symlink to `/Users/afar/.ft-bookmarks`.
- `~/.ft-bookmarks` exists and is about 54 GB.
- `/Users/afar/.ft-bookmarks/md` points back to `/Users/afar/.fieldtheory/library`.
- `/Volumes/Extreme SSD` does not exist, is not writable, and `df -h "/Volumes/Extreme SSD"` reports `No such file or directory`.
- Time Machine still knows a local `Extreme SSD` destination with ID `B41B6D8B-AFBC-4B54-A0FA-1EC83CAC71B6`, but that is not a mounted writable backup target for A4.
- `restic` is still missing from `PATH`.
- `rsync` exists at `/usr/bin/rsync`.
- The broad `launchctl` regex matched `com.apple.SecureBackupDaemon` and `com.fieldtheory.app.ShipIt`, but no Field Theory `restic` or backup LaunchAgent/Daemon plist was found.
- `crontab` had no `fieldtheory`, `restic`, or `backup` matches.
- No restore-drill artifacts were found under `~/.fieldtheory` or `/Users/afar/.ft-bookmarks`.
- The expected drill evidence paths are absent: `~/.fieldtheory/backup-drill`, `~/.ft-bookmarks/backup-drill`, `~/.fieldtheory/backup-drill/restore-drill-artifact.txt`, and `~/.fieldtheory/backup-drill/latest-snapshot.json`.
- Backup-looking local folders exist at `~/.fieldtheory/library/.fence-backup-2026-04-13T21-21-39` and `~/.ft-bookmarks/md.backup-20260424T230242Z`, but they do not prove A4 restore safety.
- A read-only evidence subagent independently confirmed the same blocker state.

Result:

- A4a is not askable yet because the approved backup volume is not mounted or writable.
- A4b is blocked because A4a has not passed, no restore-drill artifact exists, and no scheduled backup evidence exists.
- A4 remains not complete.
- Do not treat this as approval to install `restic`, initialize a repository, run a backup, run a restore drill, load a scheduler, write backup config, create drill files, delete files, change symlinks, or run migrations.

## 2026-07-02T04:58:55Z: A4a Manual Waist Backup Recheck

Scope: read-only A4a/A4b preflight refresh. No approval packet was executed. No install, backup, restore, scheduler change, file write, deletion, migration, config write, volume mount, or drill file creation was performed.

Commands run locally:

```bash
test -d "$HOME/.fieldtheory"
test -L "$HOME/.fieldtheory/bookmarks"
readlink "$HOME/.fieldtheory/bookmarks"
test -d "$HOME/.ft-bookmarks"
BOOKMARKS_REAL="$(readlink "$HOME/.fieldtheory/bookmarks" 2>/dev/null || printf '%s\n' "$HOME/.fieldtheory/bookmarks")"
test -d "$BOOKMARKS_REAL"
test -L "$HOME/.ft-bookmarks/md"
readlink "$HOME/.ft-bookmarks/md"
test -d "/Volumes/Extreme SSD"
test -w "/Volumes/Extreme SSD"
df -h "/Volumes/Extreme SSD"
command -v restic
command -v rsync
launchctl list | rg -i 'fieldtheory|restic|backup' || true
crontab -l 2>/dev/null | rg -i 'fieldtheory|restic|backup' || true
find "$HOME/Library/LaunchAgents" /Library/LaunchAgents /Library/LaunchDaemons -maxdepth 1 -type f \( -iname '*field*' -o -iname '*restic*' -o -iname '*backup*' \) -print
find "$HOME/.fieldtheory" "$BOOKMARKS_REAL" -maxdepth 3 -iname '*restore*drill*' -print
find "$HOME/.fieldtheory" "$HOME/.ft-bookmarks" -maxdepth 4 \( -iname '*backup*' -o -iname '*restore*' -o -iname '*restic*' \) -print
du -sh "$HOME/.fieldtheory" "$HOME/.ft-bookmarks"
tmutil destinationinfo
```

Observed evidence:

- `~/.fieldtheory` exists and is about 617 MB.
- `~/.fieldtheory/bookmarks` is still a symlink to `/Users/afar/.ft-bookmarks`.
- `~/.ft-bookmarks` exists and is about 54 GB.
- `~/.ft-bookmarks/md` is still a symlink to `/Users/afar/.fieldtheory/library`.
- `/Volumes/Extreme SSD` does not exist, is not writable, and `df -h "/Volumes/Extreme SSD"` reports `No such file or directory`.
- `restic` is still missing from `PATH`.
- `rsync` is still available at `/usr/bin/rsync`, but A4 is documented as an encrypted restic backup gate.
- The broad `launchctl` regex matched `com.apple.SecureBackupDaemon` and `com.fieldtheory.app.ShipIt`, but there is still no evidence of a Field Theory `restic` or backup scheduler.
- `crontab` had no `fieldtheory`, `restic`, or `backup` matches.
- No matching Field Theory/restic/backup LaunchAgent or LaunchDaemon files were found in the checked LaunchAgent/LaunchDaemon directories.
- No restore-drill artifacts were found under `~/.fieldtheory` or `/Users/afar/.ft-bookmarks`.
- Backup-looking local folders still exist at `~/.fieldtheory/library/.fence-backup-2026-04-13T21-21-39`, `~/.ft-bookmarks/md.backup-20260424T230242Z`, and `~/.ft-bookmarks/md.backup-20260424T230242Z/.fence-backup-2026-04-13T21-21-39`, but these do not prove A4 restore safety.
- Time Machine still knows a local `Extreme SSD` destination with ID `B41B6D8B-AFBC-4B54-A0FA-1EC83CAC71B6`, but that is not a mounted writable backup target for A4.

Result:

- A4a is still not askable because the approved backup volume is not mounted or writable.
- A4b is still blocked because A4a has not passed, no restore-drill artifact exists, and no scheduled backup evidence exists.
- A4 remains not complete.
- Do not treat this as approval to install `restic`, initialize a repository, run a backup, run a restore drill, load a scheduler, write backup config, create or delete drill files, mount volumes, or run migrations.

## 2026-07-02T05:15:38Z: A4a Manual Waist Backup Recheck

Scope: read-only A4a/A4b preflight refresh. No approval packet was executed. No install, backup, restore, scheduler change, file write, deletion, migration, config write, volume mount, or drill file creation was performed.

Commands run locally:

```bash
test -d "$HOME/.fieldtheory"
test -L "$HOME/.fieldtheory/bookmarks"
readlink "$HOME/.fieldtheory/bookmarks"
test -d "$HOME/.ft-bookmarks"
BOOKMARKS_REAL="$(readlink "$HOME/.fieldtheory/bookmarks" 2>/dev/null || printf '%s\n' "$HOME/.fieldtheory/bookmarks")"
test -d "$BOOKMARKS_REAL"
test -d "/Volumes/Extreme SSD"
test -w "/Volumes/Extreme SSD"
command -v restic || true
launchctl list | rg -i 'fieldtheory|restic|backup' || true
crontab -l 2>/dev/null | rg -i 'fieldtheory|restic|backup' || true
find "$HOME/.fieldtheory" "$BOOKMARKS_REAL" -maxdepth 3 -iname '*restore*drill*' -print
find "$HOME/.fieldtheory" "$BOOKMARKS_REAL" -maxdepth 3 -iname '*restore*drill*' -type f -print -exec sed -n '1,20p' {} \;
du -sh "$HOME/.fieldtheory" "$HOME/.ft-bookmarks"
df -h "/Volumes/Extreme SSD"
tmutil destinationinfo
```

Observed evidence:

- `~/.fieldtheory` exists and is about 617 MB.
- `~/.fieldtheory/bookmarks` is still a symlink to `/Users/afar/.ft-bookmarks`.
- `~/.ft-bookmarks` exists and is about 54 GB.
- `/Volumes/Extreme SSD` does not exist, is not writable, and `df -h "/Volumes/Extreme SSD"` reports `No such file or directory`.
- `restic` is still missing from `PATH`.
- The broad `launchctl` regex matched `com.apple.SecureBackupDaemon` and `com.fieldtheory.app.ShipIt`, but there is still no evidence of a Field Theory `restic` or backup scheduler.
- `crontab` had no `fieldtheory`, `restic`, or `backup` matches.
- No restore-drill artifacts were found under `~/.fieldtheory` or `/Users/afar/.ft-bookmarks`.
- Time Machine still knows a local `Extreme SSD` destination with ID `B41B6D8B-AFBC-4B54-A0FA-1EC83CAC71B6`, but that is not a mounted writable backup target for A4.
- A read-only adversarial subagent found no wording blocker, but recommended that future mounted-volume preflight verify mount identity rather than only path existence and writability.

Result:

- A4a is still not askable because the approved backup volume is not mounted or writable.
- A4b is still blocked because A4a has not passed, no restore-drill artifact exists, and no scheduled backup evidence exists.
- A4 remains not complete.
- Do not treat this as approval to install `restic`, initialize a repository, run a backup, run a restore drill, load a scheduler, write backup config, create or delete drill files, mount volumes, change symlinks, or run migrations.

## 2026-07-02T02:39:59Z: A2a Mac App Release Preservation

Scope: read-only A2a preflight refresh. No approval packet was executed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory-oss status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-oss rev-list --left-right --count HEAD...origin/main
node -p "require('/Users/afar/dev/fieldtheory-oss/mac-app/package.json').version"
sed -n '1,24p' /Users/afar/dev/fieldtheory-oss/mac-app/CHANGELOG.md
sed -n '1,20p' /Users/afar/dev/fieldtheory-oss/mac-app/docs/RELEASE_CHECKLIST.md
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/field-releases --json nameWithOwner,visibility,url
gh release list --repo afar1/field-releases --limit 3
curl -fsSL https://github.com/afar1/field-releases/releases/latest/download/latest-mac.yml
```

Observed evidence:

- `/Users/afar/dev/fieldtheory-oss` is on `codex/release-0.3.14-startup-library` at `0c560c32e7ed2a702cbaa1d2127768ce2fd2c7da`.
- Branch status reports `ahead 31` of upstream.
- The branch is 30 ahead and 0 behind `origin/main`.
- The worktree has 36 dirty paths: 28 modified tracked paths and 8 untracked paths.
- `mac-app/package.json` says `0.3.20`.
- `mac-app/CHANGELOG.md` still starts at `0.1.33`.
- `mac-app/docs/RELEASE_CHECKLIST.md` still says `v0.1.25+maxwell`.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/field-releases` reports `PUBLIC`.
- Latest release remains `v0.3.14`.
- `latest-mac.yml` is reachable and says `version: 0.3.14`.

Result:

- A2a preservation work is eligible to ask Andrew for approval with tight scope; the active phrase is now `approve A2a create mac-app preservation bundle and dirty-tree snapshot`. It is not approved yet.
- A2a is not complete because no bundle or working-tree snapshot was created.
- A2 is not complete.
- Do not treat this as approval to publish, tag, push, clean up, or call A2 complete.

## 2026-07-02T03:16:55Z: A2a Mac App Release Preservation Recheck

Scope: read-only A2a preflight refresh. No approval packet was executed. No bundle, archive, snapshot folder, stash, commit, branch switch, tag, push, release publish, or cleanup was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory-oss status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-oss rev-list --left-right --count HEAD...origin/main
git -C /Users/afar/dev/fieldtheory-oss branch --show-current
git -C /Users/afar/dev/fieldtheory-oss rev-parse --short HEAD
git -C /Users/afar/dev/fieldtheory-oss remote get-url origin
git -C /Users/afar/dev/fieldtheory-oss status --porcelain --untracked-files=all | wc -l
git -C /Users/afar/dev/fieldtheory-oss status --porcelain --untracked-files=all | awk 'substr($0,1,2)=="??"{u++} substr($0,1,2)!="??"{t++} END{printf "tracked_or_staged=%d untracked=%d\n", t+0, u+0}'
git -C /Users/afar/dev/fieldtheory-oss tag --list
git -C /Users/afar/dev/fieldtheory-oss ls-remote --tags origin 'refs/tags/*'
node -p "require('/Users/afar/dev/fieldtheory-oss/mac-app/package.json').version"
sed -n '1,24p' /Users/afar/dev/fieldtheory-oss/mac-app/CHANGELOG.md
sed -n '1,20p' /Users/afar/dev/fieldtheory-oss/mac-app/docs/RELEASE_CHECKLIST.md
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/field-releases --json nameWithOwner,visibility,url
gh release list --repo afar1/field-releases --limit 3
curl -fsSL https://github.com/afar1/field-releases/releases/latest/download/latest-mac.yml
```

Observed evidence:

- `/Users/afar/dev/fieldtheory-oss` is on `codex/release-0.3.14-startup-library` at `0c560c3`.
- `origin` is `https://github.com/afar1/fieldtheory.git`, and `afar1/fieldtheory` reports `PUBLIC`.
- Branch status is ahead 31 of its upstream; `HEAD...origin/main` is `30 0`.
- The worktree has 36 dirty paths: 28 tracked-or-staged entries and 8 untracked entries.
- No local tags are present, and `origin` returned no tags.
- `mac-app/package.json` says `0.3.20`.
- `mac-app/CHANGELOG.md` still starts at `0.1.33` dated January 10, 2026.
- `mac-app/docs/RELEASE_CHECKLIST.md` still starts with `Release Checklist - v0.1.25+maxwell`.
- `afar1/field-releases` reports `PUBLIC`.
- The latest three `field-releases` releases are `v0.3.14`, `v0.3.8`, and `v0.3.7`.
- `latest-mac.yml` still reports `version: 0.3.14` and `path: Field.Theory-0.3.14-arm64-mac.zip`.
- A read-only subagent independently confirmed no material drift from the documented A2 blocker.

Result:

- A2a remains eligible to ask Andrew for the exact approval phrase `approve A2a create mac-app preservation bundle and dirty-tree snapshot`, but only as preservation.
- A2a is not approved and not complete because no bundle or working-tree snapshot was created.
- A2 remains not complete.
- Do not treat this as approval to bundle, archive, snapshot, stash, commit, switch branches, tag, push, publish release artifacts, clean up, or call A2 complete.

## 2026-07-02T04:31:39Z: A2a Mac App Release Preservation Recheck

Scope: read-only A2a preflight refresh. No approval packet was executed. No bundle, archive, snapshot folder, stash, commit, branch switch, tag, push, release publish, or cleanup was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory-oss status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-oss branch --show-current
git -C /Users/afar/dev/fieldtheory-oss rev-parse --short HEAD
git -C /Users/afar/dev/fieldtheory-oss rev-list --left-right --count HEAD...origin/main
git -C /Users/afar/dev/fieldtheory-oss status --porcelain --untracked-files=all | wc -l
git -C /Users/afar/dev/fieldtheory-oss status --porcelain --untracked-files=all | awk 'substr($0,1,2)=="??"{u++} substr($0,1,2)!="??"{t++} END{printf "tracked_or_staged=%d untracked=%d\n", t+0, u+0}'
git -C /Users/afar/dev/fieldtheory-oss tag --list
git -C /Users/afar/dev/fieldtheory-oss ls-remote --tags origin 'refs/tags/*'
node -p "require('/Users/afar/dev/fieldtheory-oss/mac-app/package.json').version"
sed -n '1,24p' /Users/afar/dev/fieldtheory-oss/mac-app/CHANGELOG.md
sed -n '1,20p' /Users/afar/dev/fieldtheory-oss/mac-app/docs/RELEASE_CHECKLIST.md
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/field-releases --json nameWithOwner,visibility,url
gh release list --repo afar1/field-releases --limit 3
curl -fsSL https://github.com/afar1/field-releases/releases/latest/download/latest-mac.yml
```

Observed evidence:

- `/Users/afar/dev/fieldtheory-oss` is on `codex/release-0.3.14-startup-library` at `0c560c3`.
- `afar1/fieldtheory` reports `PUBLIC`.
- Branch status is ahead 31 of its upstream release branch; `HEAD...origin/main` is `30 0`.
- The worktree has 36 dirty paths: 28 tracked-or-staged entries and 8 untracked entries.
- No local tags are present, and `origin` returned no tags.
- `mac-app/package.json` says `0.3.20`.
- `mac-app/CHANGELOG.md` still starts at `0.1.33` dated January 10, 2026.
- `mac-app/docs/RELEASE_CHECKLIST.md` still starts with `Release Checklist - v0.1.25+maxwell`.
- `afar1/field-releases` reports `PUBLIC`.
- The latest three `field-releases` releases are `v0.3.14`, `v0.3.8`, and `v0.3.7`.
- `latest-mac.yml` still reports `version: 0.3.14` and `path: Field.Theory-0.3.14-arm64-mac.zip`.
- Sagan independently confirmed no material drift from the documented A2 blocker and noted the local branch is also 31 commits ahead of its upstream release branch.

Result:

- A2a remains eligible to ask Andrew for the exact approval phrase `approve A2a create mac-app preservation bundle and dirty-tree snapshot`, but only as preservation.
- A2b and A2c remain blocked.
- A2a is not approved and not complete because no bundle or working-tree snapshot was created.
- A2 remains not complete.
- Do not treat this as approval to bundle, archive, snapshot, stash, commit, switch branches, tag, push, publish release artifacts, clean up, or call A2 complete.

## 2026-07-02T02:39:59Z: A3a Plugin Installed-State Snapshot

Scope: read-only A3a preflight refresh. No approval packet was executed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory-plugin status --short --branch --untracked-files=all
diff -qr /Users/afar/plugins/field-theory /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607
diff -qr /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418 /Users/afar/plugins/field-theory
test ! -d /Users/afar/dev/fieldtheory-plugin/plugin
```

Observed evidence:

- `/Users/afar/dev/fieldtheory-plugin` is on `main` tracking `origin/main`.
- The plugin repo is dirty with modified plugin manifest, server, smoke test, fieldtheory skill, docs, and installer.
- The plugin repo has untracked CI and follow-on sibling skill files.
- Installed plugin source and Codex plugin cache are byte-identical.
- The dev bundle differs from installed source in:
  - `mcp-server/server.js`;
  - `scripts/smoke-test.js`;
  - `skills/current-document/SKILL.md`.
- `/Users/afar/dev/fieldtheory-plugin/plugin` is absent.

Result:

- A3a installed/cache snapshot preflight is eligible to ask Andrew for approval only if the dirty dev repo, untracked CI/sibling skill files, and dev-vs-installed drift are named clearly; it is not approved yet.
- A3a is not complete because no installed/cache snapshot or checksums were created.
- A3 is not complete.
- Do not treat this as approval to install, mutate plugin cache, commit dev changes, or call A3 complete.

## 2026-07-02T03:25:32Z: A3a Plugin Installed-State Snapshot Recheck

Scope: read-only A3a preflight refresh. No approval packet was executed. No `rsync`, copy, snapshot folder, install, cache mutation, commit, directory rename, deletion, or `install.sh` run was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory-plugin status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-plugin branch --show-current
git -C /Users/afar/dev/fieldtheory-plugin rev-parse --short HEAD
git -C /Users/afar/dev/fieldtheory-plugin rev-parse HEAD
test -d /Users/afar/plugins/field-theory
test -d /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607
test -d /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418
test ! -d /Users/afar/dev/fieldtheory-plugin/plugin
diff -qr /Users/afar/plugins/field-theory /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607
diff -qr /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418 /Users/afar/plugins/field-theory
sed -n '1,220p' /Users/afar/plugins/field-theory/.codex-plugin/plugin.json
sed -n '1,220p' /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607/.codex-plugin/plugin.json
sed -n '1,220p' /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418/.codex-plugin/plugin.json
find /Users/afar/plugins/field-theory/skills -maxdepth 2 -type f \( -name 'SKILL.md' -o -name 'openai.yaml' \) -print | sort
find /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607/skills -maxdepth 2 -type f \( -name 'SKILL.md' -o -name 'openai.yaml' \) -print | sort
find /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418/skills -maxdepth 3 -type f \( -name 'SKILL.md' -o -name 'openai.yaml' \) -print | sort
```

Observed evidence:

- `/Users/afar/dev/fieldtheory-plugin` is on `main` at `4d7b20a` with dirty tracked files and untracked CI/sibling skill files.
- Dirty tracked files include the plugin manifest, `mcp-server/server.js`, `scripts/smoke-test.js`, `skills/fieldtheory/SKILL.md`, `CONTRIBUTING.md`, `README.md`, and `install.sh`.
- Untracked files include `.github/workflows/plugin-ci.yml`, sibling skill `SKILL.md` files, and sibling skill `agents/openai.yaml` files.
- `/Users/afar/plugins/field-theory` exists.
- `/Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607` exists.
- `/Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418` exists.
- `/Users/afar/dev/fieldtheory-plugin/plugin` remains absent.
- Installed source and Codex cache source are byte-identical.
- The dev bundle differs from installed source in `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`.
- Installed, cache, and dev bundle plugin manifests all report `name: field-theory` and `version: 0.1.0+codex.20260620185607`.
- Installed/cache skills contain six sibling `SKILL.md` files. The dev bundle also contains sibling `agents/openai.yaml` files.
- A read-only subagent independently confirmed no material drift from the documented A3 blocker.

Result:

- A3a remains eligible to ask Andrew for the exact approval phrase `approve A3a plugin installed-state snapshot`, but only as installed/cache preservation.
- A3a is not approved and not complete because no installed/cache snapshot or checksums were created.
- A3 remains not complete.
- Do not treat this as approval to `rsync`, copy, snapshot, install, mutate cache, commit dev changes, rename directories, run `install.sh`, or call A3 complete.

## 2026-07-02T04:31:39Z: A3a Plugin Installed-State Snapshot Recheck

Scope: A3a preflight refresh. No approval packet was executed. The orchestrator ran only read-only commands. Nietzsche, the independent evidence subagent, accidentally created two `/tmp/a3_*_files.txt` comparison scratch files while checking file lists; they were not removed because deletion remains approval-gated. No repo file, installed plugin file, Codex cache file, snapshot folder, install, cache mutation, commit, directory rename, or `install.sh` run was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory-plugin status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-plugin rev-parse --short HEAD
diff -qr /Users/afar/plugins/field-theory /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607
diff -qr /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418 /Users/afar/plugins/field-theory
test ! -d /Users/afar/dev/fieldtheory-plugin/plugin
rg -n 'version|0\.1\.0|202606|202605' /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418/.codex-plugin/plugin.json /Users/afar/dev/fieldtheory-plugin/README.md /Users/afar/dev/fieldtheory-plugin/install.sh /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418/mcp-server/server.js
```

Observed evidence:

- `/Users/afar/dev/fieldtheory-plugin` is on `main` at `4d7b20a` with dirty tracked files and untracked CI/sibling skill files.
- Dirty tracked files include the plugin manifest, `mcp-server/server.js`, `scripts/smoke-test.js`, `skills/fieldtheory/SKILL.md`, `CONTRIBUTING.md`, `README.md`, and `install.sh`.
- Untracked files include `.github/workflows/plugin-ci.yml`, sibling skill `SKILL.md` files, and sibling skill `agents/openai.yaml` files.
- `/Users/afar/dev/fieldtheory-plugin/plugin` remains absent.
- Installed source and Codex cache source are byte-identical.
- The dev bundle differs from installed source in `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`.
- Installed, cache, and dev bundle plugin manifests all report `version: 0.1.0+codex.20260620185607`.
- Sibling `agents/openai.yaml` files are present in installed/cache state; do not describe those files as absent from installed/cache. The untracked dev sibling files remain follow-on dev work outside A3a.
- Nietzsche independently confirmed the same A3a blocker shape.

Result:

- A3a remains eligible to ask Andrew for the exact approval phrase `approve A3a plugin installed-state snapshot`, but only as installed/cache preservation.
- A3a is not approved and not complete because no installed/cache snapshot or checksums were created.
- A3 remains not complete.
- Do not treat this as approval to `rsync`, copy, snapshot, install, mutate cache, commit dev changes, rename directories, run `install.sh`, delete `/tmp/a3_*_files.txt`, or call A3 complete.

## 2026-07-02T05:05:43Z: A2a Mac App Release Preservation Recheck

Scope: read-only A2a preflight refresh. No approval packet was executed. No bundle, archive, snapshot folder, stash, commit, branch switch, tag, push, release publish, cleanup, or file write was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory-oss status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-oss branch --show-current
git -C /Users/afar/dev/fieldtheory-oss rev-parse --short HEAD
git -C /Users/afar/dev/fieldtheory-oss rev-parse HEAD
git -C /Users/afar/dev/fieldtheory-oss remote get-url origin
git -C /Users/afar/dev/fieldtheory-oss rev-list --left-right --count HEAD...origin/main
git -C /Users/afar/dev/fieldtheory-oss rev-parse origin/main
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-oss ls-remote origin refs/heads/main
git -C /Users/afar/dev/fieldtheory-oss status --porcelain --untracked-files=all | wc -l
git -C /Users/afar/dev/fieldtheory-oss status --porcelain --untracked-files=all | awk 'substr($0,1,2)=="??"{u++} substr($0,1,2)!="??"{t++} END{printf "tracked_or_staged=%d untracked=%d\n", t+0, u+0}'
git -C /Users/afar/dev/fieldtheory-oss tag --list
git -C /Users/afar/dev/fieldtheory-oss ls-remote --tags origin 'refs/tags/*'
node -p "require('/Users/afar/dev/fieldtheory-oss/mac-app/package.json').version"
sed -n '1,24p' /Users/afar/dev/fieldtheory-oss/mac-app/CHANGELOG.md
sed -n '1,20p' /Users/afar/dev/fieldtheory-oss/mac-app/docs/RELEASE_CHECKLIST.md
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/field-releases --json nameWithOwner,visibility,url
gh release list --repo afar1/field-releases --limit 3
curl -fsSL https://github.com/afar1/field-releases/releases/latest/download/latest-mac.yml
```

Observed evidence:

- `/Users/afar/dev/fieldtheory-oss` is on `codex/release-0.3.14-startup-library` at `0c560c32e7ed2a702cbaa1d2127768ce2fd2c7da`.
- `origin` is `https://github.com/afar1/fieldtheory.git`, and `afar1/fieldtheory` reports `PUBLIC`.
- Branch status is ahead 31 of its upstream release branch; `HEAD...origin/main` is `30 0`.
- Local `origin/main` and current remote `origin/main` both resolve to `4df630b96d2c2ec30d03e353dc1364994587457f`.
- The worktree has 36 dirty paths: 28 tracked-or-staged entries and 8 untracked entries.
- No local tags are present, and `origin` returned no tags.
- `mac-app/package.json` says `0.3.20`.
- `mac-app/CHANGELOG.md` still starts at `0.1.33` dated January 10, 2026.
- `mac-app/docs/RELEASE_CHECKLIST.md` still starts with `Release Checklist - v0.1.25+maxwell`.
- `afar1/field-releases` reports `PUBLIC`.
- The latest three `field-releases` releases are `v0.3.14`, `v0.3.8`, and `v0.3.7`.
- `latest-mac.yml` still reports `version: 0.3.14` and `path: Field.Theory-0.3.14-arm64-mac.zip`.

Result:

- A2a remains eligible to ask Andrew for the exact approval phrase `approve A2a create mac-app preservation bundle and dirty-tree snapshot`, but only as preservation.
- A2b and A2c remain blocked.
- A2a is not approved and not complete because no bundle or working-tree snapshot was created.
- A2 remains not complete.
- Do not treat this as approval to bundle, archive, snapshot, stash, commit, switch branches, tag, push, publish release artifacts, clean up, or call A2 complete.

## 2026-07-02T05:06:43Z: A3a Plugin Installed-State Snapshot Recheck

Scope: read-only A3a preflight refresh. No approval packet was executed. No `rsync`, copy, snapshot folder, install, cache mutation, commit, directory rename, deletion, `install.sh` run, or scratch-file cleanup was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory-plugin status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-plugin branch --show-current
git -C /Users/afar/dev/fieldtheory-plugin rev-parse --short HEAD
git -C /Users/afar/dev/fieldtheory-plugin rev-parse HEAD
test -d /Users/afar/plugins/field-theory
test -d /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607
test -d /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418
test ! -d /Users/afar/dev/fieldtheory-plugin/plugin
diff -qr /Users/afar/plugins/field-theory /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607
diff -qr /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418 /Users/afar/plugins/field-theory
rg -n 'version|0\.1\.0|202606|202605' /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418/.codex-plugin/plugin.json /Users/afar/dev/fieldtheory-plugin/README.md /Users/afar/dev/fieldtheory-plugin/install.sh /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418/mcp-server/server.js
find /Users/afar/plugins/field-theory/skills -maxdepth 3 -type f \( -name 'SKILL.md' -o -name 'openai.yaml' \) -print | sort
find /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607/skills -maxdepth 3 -type f \( -name 'SKILL.md' -o -name 'openai.yaml' \) -print | sort
find /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418/skills -maxdepth 3 -type f \( -name 'SKILL.md' -o -name 'openai.yaml' \) -print | sort
ls -l /tmp/a3_dev_files.txt /tmp/a3_installed_files.txt
```

Observed evidence:

- `/Users/afar/dev/fieldtheory-plugin` is on `main` at `4d7b20ae50659743802a28528a09c1fd1501a799` with dirty tracked files and untracked CI/sibling skill files.
- Dirty tracked files include the plugin manifest, `mcp-server/server.js`, `scripts/smoke-test.js`, `skills/fieldtheory/SKILL.md`, `CONTRIBUTING.md`, `README.md`, and `install.sh`.
- Untracked files include `.github/workflows/plugin-ci.yml`, sibling skill `SKILL.md` files, and sibling skill `agents/openai.yaml` files.
- `/Users/afar/plugins/field-theory` exists.
- `/Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607` exists.
- `/Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418` exists.
- `/Users/afar/dev/fieldtheory-plugin/plugin` remains absent.
- Installed source and Codex cache source are byte-identical.
- The dev bundle differs from installed source in `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`.
- The dev bundle plugin manifest reports `version: 0.1.0+codex.20260620185607`, while the dev bundle directory name still includes `20260528062418`.
- Installed, cache, and dev bundle skill trees all include sibling `agents/openai.yaml` files.
- The accidental scratch files `/tmp/a3_dev_files.txt` and `/tmp/a3_installed_files.txt` still exist and were not deleted.

Result:

- A3a remains eligible to ask Andrew for the exact approval phrase `approve A3a plugin installed-state snapshot`, but only as installed/cache preservation.
- A3a is not approved and not complete because no installed/cache snapshot or checksums were created.
- A3 remains not complete.
- Do not treat this as approval to `rsync`, copy, snapshot, install, mutate cache, commit dev changes, rename directories, run `install.sh`, delete `/tmp/a3_*` scratch files, or call A3 complete.

## 2026-07-02T02:49:42Z: A5a Cleanup Manifest

Scope: read-only A5a preflight refresh. No cleanup manifest was created. No deletion, quarantine, prune, archive, bundle, stash, commit, or move was performed.

Commands run locally:

```bash
find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | sort
find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | wc -l
find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | sort
find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | wc -l
git -C /Users/afar/dev/fieldtheory-oss worktree list --porcelain
git -C /Users/afar/dev/fieldtheory worktree list --porcelain
git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain
git -C /Users/afar/dev/fieldtheory-plugin worktree list --porcelain
find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print | sort
git -C /Users/afar/dev/oscar status --short --branch --untracked-files=all
git --git-dir=/Users/afar/dev/fieldtheory-labs.oscar-mirror.git rev-parse --short HEAD
```

Observed evidence:

- `/Users/afar/dev` has 59 Field Theory-family directories by the checklist pattern.
- Named non-field candidates are present: `/Users/afar/dev/littleai`, `/Users/afar/dev/old-field`, `/Users/afar/dev/oscar`, and `/Users/afar/dev/oscar-pr-101-preserved`.
- Worktree records total 59 across the four target repos: `fieldtheory-oss` 11, `fieldtheory` 17, `fieldtheory-cli` 30, and `fieldtheory-plugin` 1.
- `fieldtheory-cli` has 17 `/private/tmp` worktree records marked prunable by Git; this is evidence only, and no prune is approved.
- `/private/tmp` has 5 actual `fieldtheory-cli-*` directories.
- `/Users/afar/dev/oscar` is about 74 GB, on `main`, behind `origin/main` by 4, and has untracked plan/log/model files.
- `/Users/afar/dev/old-field` is about 1.8 GB and is dirty/untracked.
- `/Users/afar/dev/oscar-pr-101-preserved` is about 769 MB and has modified tracked files.
- `/Users/afar/dev/littleai` is about 4 KB and is not a Git repo.
- `/Users/afar/dev/fieldtheory-labs.oscar-mirror.git` is at `1454e11c`.

Result:

- A5a manifest-only preflight evidence is refreshed.
- A5a is eligible to ask Andrew for approval only as manifest/evidence work; it is not approved yet.
- A5a is not complete because no manifest was created.
- A5 is not complete.
- Do not treat this as approval to delete, prune, move `oscar`, archive, bundle, create waivers, or call A5 complete.

## 2026-07-02T02:49:42Z: A6 Optional Review Debris Quarantine

Scope: read-only A6 preflight refresh. No quarantine or deletion was performed.

Commands run locally:

```bash
test ! -e '/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1'
test -f /Users/afar/.ft-bookmarks/twitter-bookmarks.db
test ! -L /Users/afar/.ft-bookmarks/twitter-bookmarks.db
stat -f '%N inode=%i size=%z modified=%Sm' /Users/afar/.ft-bookmarks/twitter-bookmarks.db
```

Observed evidence:

- `/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1` is absent.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` is present.
- `twitter-bookmarks.db` is a regular file, not a symlink.
- `twitter-bookmarks.db` is 0 bytes.
- `twitter-bookmarks.db` was modified on April 12, 2026 at 14:48:42.

Result:

- A6 preflight passes for optional quarantine only.
- Optional A6 quarantine is eligible to ask Andrew for approval; it is not approved yet.
- Do not treat this as approval to delete anything or touch any other bookmark database, media file, or symlink.

## 2026-07-02T03:56:45Z: A5a Cleanup Manifest Recheck

Scope: read-only A5a preflight refresh. No cleanup manifest was created. No deletion, quarantine, prune, archive, bundle, stash, commit, move, or waiver was performed.

Commands run locally:

```bash
find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | sort
find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | wc -l
find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | sort
find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | wc -l
git -C /Users/afar/dev/fieldtheory-oss worktree list --porcelain
git -C /Users/afar/dev/fieldtheory worktree list --porcelain
git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain
git -C /Users/afar/dev/fieldtheory-plugin worktree list --porcelain
find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print | sort
du -sh /Users/afar/dev/oscar /Users/afar/dev/old-field /Users/afar/dev/oscar-pr-101-preserved /Users/afar/dev/littleai
git -C /Users/afar/dev/oscar status --short --branch --untracked-files=all
git -C /Users/afar/dev/old-field status --short --branch --untracked-files=all
git -C /Users/afar/dev/oscar-pr-101-preserved status --short --branch --untracked-files=all
git --git-dir=/Users/afar/dev/fieldtheory-labs.oscar-mirror.git rev-parse HEAD
find /Users/afar/dev -maxdepth 1 -type d \( -name 'fieldtheory-private-remote-verify' -o -name 'fieldtheory-public-candidate*' -o -name 'fieldtheory-release-artifacts-preserved' -o -name 'fieldtheory-worktrees' -o -name '*-preserved' \) -print | sort
```

Observed evidence:

- `/Users/afar/dev` still has 59 Field Theory-family directories by the checklist pattern.
- Named non-field candidates are still present: `/Users/afar/dev/littleai`, `/Users/afar/dev/old-field`, `/Users/afar/dev/oscar`, and `/Users/afar/dev/oscar-pr-101-preserved`.
- Worktree records still total 59 across the four target repos: `fieldtheory-oss` 11, `fieldtheory` 17, `fieldtheory-cli` 30, and `fieldtheory-plugin` 1.
- `fieldtheory-cli` still has 17 worktree records marked prunable by Git; no prune is approved.
- `/private/tmp` still has 5 actual `fieldtheory-cli-*` directories.
- `/Users/afar/dev/oscar` is about 74 GB, on `main`, behind `origin/main` by 4, and has untracked plan/log/model files.
- `/Users/afar/dev/old-field` is about 1.8 GB and is dirty/untracked on `cursor/implement-expo-plan-6011ab-88a7`.
- `/Users/afar/dev/oscar-pr-101-preserved` is about 769 MB and has modified tracked files on `pr-101`.
- `/Users/afar/dev/littleai` is about 4 KB and is not a Git repo.
- `/Users/afar/dev/fieldtheory-labs.oscar-mirror.git` is at `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`.
- June-7 cleanup candidates still present include `fieldtheory-private-remote-verify`, `fieldtheory-public-candidate*`, `fieldtheory-release-artifacts-preserved`, `fieldtheory-worktrees`, and `oscar-pr-101-preserved`.
- A read-only evidence subagent independently confirmed no mismatch from the documented A5 blocker.

Result:

- A5a remains eligible to ask Andrew for approval only as manifest/evidence work; it is not approved yet.
- A5a is not complete because no cleanup manifest was created.
- A5 deletion, prune, and move execution remain blocked until each target has a reviewed target-specific preservation decision and a later exact approval is given.
- A5 remains not complete.
- Do not treat this as approval to delete, prune, move `oscar`, archive, bundle, stash, commit, write a manifest, create waivers, or call A5 complete.

## 2026-07-02T04:40:14Z: A5a Cleanup Manifest Recheck

Scope: read-only A5a preflight refresh. No cleanup manifest was created. No deletion, quarantine, prune, archive, bundle, stash, commit, move, or waiver was performed.

Commands run locally:

```bash
find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | sort
find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | wc -l
find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | sort
du -sh /Users/afar/dev/oscar /Users/afar/dev/old-field /Users/afar/dev/oscar-pr-101-preserved /Users/afar/dev/littleai
git -C /Users/afar/dev/fieldtheory-oss worktree list --porcelain
git -C /Users/afar/dev/fieldtheory worktree list --porcelain
git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain
git -C /Users/afar/dev/fieldtheory-plugin worktree list --porcelain
find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print | sort
git -C /Users/afar/dev/oscar status --short --branch --untracked-files=all
git -C /Users/afar/dev/old-field status --short --branch --untracked-files=all
git -C /Users/afar/dev/oscar-pr-101-preserved status --short --branch --untracked-files=all
git -C /Users/afar/dev/oscar rev-parse HEAD
git -C /Users/afar/dev/oscar rev-parse origin/main
git --git-dir=/Users/afar/dev/fieldtheory-labs.oscar-mirror.git rev-parse HEAD
git -C /Users/afar/dev/oscar rev-list --count 1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28..HEAD
git -C /Users/afar/dev/oscar rev-list --count 1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28..origin/main
```

Observed evidence:

- `/Users/afar/dev` still has 59 Field Theory-family directories by the checklist pattern.
- Named non-field candidates are still present: `/Users/afar/dev/littleai`, `/Users/afar/dev/old-field`, `/Users/afar/dev/oscar`, and `/Users/afar/dev/oscar-pr-101-preserved`.
- Worktree records still total 59 across the four target repos: `fieldtheory-oss` 11, `fieldtheory` 17, `fieldtheory-cli` 30, and `fieldtheory-plugin` 1.
- `fieldtheory-cli` still has 17 worktree records marked prunable by Git; no prune is approved.
- `/private/tmp` still has 5 actual `fieldtheory-cli-*` directories.
- `/Users/afar/dev/oscar` is about 74 GB, on `main`, behind `origin/main` by 4, and has untracked plan/log/model files.
- `/Users/afar/dev/old-field` is about 1.8 GB and is dirty/untracked on `cursor/implement-expo-plan-6011ab-88a7`.
- `/Users/afar/dev/oscar-pr-101-preserved` is about 769 MB and has modified tracked files on `pr-101`.
- `/Users/afar/dev/littleai` is about 4 KB and is not a Git repo.
- `/Users/afar/dev/fieldtheory-labs.oscar-mirror.git` is at `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`.
- Local `oscar` is at `615d081171a4d2d6df5ed1d790c4f13a58a11618`; `origin/main` is at `2448e3d2f9460b867a5e3aa8c08f2df978840e3d`.
- The stale `oscar` mirror is 6 commits behind local `oscar` and 10 commits behind `origin/main`.
- Cicero independently confirmed no material drift from the documented A5 blocker and confirmed `/Users/afar/dev/fieldtheory-labs-ios-native-archive` remains protected until A1 completes.

Result:

- A5a remains eligible to ask Andrew for the exact approval phrase `approve A5a cleanup manifest only`, but only as manifest work.
- A5a is not approved and not complete because no cleanup manifest was created.
- A5 deletion, prune, archive, bundle, waiver, and move execution remain blocked until each target has a reviewed target-specific preservation decision and a later exact approval is given.
- A5 remains not complete.
- Do not treat this as approval to delete, prune, move `oscar`, archive, bundle, stash, commit, write a manifest, create waivers, or call A5 complete.

## 2026-07-02T05:24:20Z: A5a Cleanup Manifest Recheck

Scope: read-only A5a preflight refresh. No cleanup manifest was created. No deletion, quarantine, prune, archive, bundle, stash, commit, move, or waiver was performed.

Commands run locally:

```bash
find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | wc -l
find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | sort
du -sh /Users/afar/dev/oscar /Users/afar/dev/old-field /Users/afar/dev/oscar-pr-101-preserved /Users/afar/dev/littleai
git -C /Users/afar/dev/fieldtheory-oss worktree list --porcelain
git -C /Users/afar/dev/fieldtheory worktree list --porcelain
git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain
git -C /Users/afar/dev/fieldtheory-plugin worktree list --porcelain
find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print | sort
git -C /Users/afar/dev/oscar status --short --branch --untracked-files=all
git -C /Users/afar/dev/old-field status --short --branch --untracked-files=all
git -C /Users/afar/dev/oscar-pr-101-preserved status --short --branch --untracked-files=all
git -C /Users/afar/dev/oscar rev-parse HEAD
git -C /Users/afar/dev/oscar rev-parse origin/main
MIRROR_HEAD="$(git --git-dir=/Users/afar/dev/fieldtheory-labs.oscar-mirror.git rev-parse HEAD)"
git --git-dir=/Users/afar/dev/fieldtheory-labs.oscar-mirror.git rev-parse HEAD
git -C /Users/afar/dev/oscar rev-list --count "$MIRROR_HEAD"..HEAD
git -C /Users/afar/dev/oscar rev-list --count "$MIRROR_HEAD"..origin/main
find /Users/afar/dev -maxdepth 1 -type d \( -name 'fieldtheory-private-remote-verify' -o -name 'fieldtheory-public-candidate*' -o -name 'fieldtheory-release-artifacts-preserved' -o -name 'fieldtheory-worktrees' -o -name '*-preserved' \) -print | sort
```

Observed evidence:

- `/Users/afar/dev` still has 59 Field Theory-family directories by the checklist pattern.
- Named non-field candidates are still present: `/Users/afar/dev/littleai`, `/Users/afar/dev/old-field`, `/Users/afar/dev/oscar`, and `/Users/afar/dev/oscar-pr-101-preserved`.
- Worktree records still total 59 across the four target repos: `fieldtheory-oss` 11, `fieldtheory` 17, `fieldtheory-cli` 30, and `fieldtheory-plugin` 1.
- `fieldtheory-cli` still has 17 worktree records marked prunable by Git; no prune is approved.
- `/private/tmp` still has 5 actual `fieldtheory-cli-*` directories.
- `/Users/afar/dev/oscar` is about 74 GB, on `main`, behind `origin/main` by 4, and has untracked plan/log/model files.
- `/Users/afar/dev/old-field` is about 1.8 GB and is dirty/untracked on `cursor/implement-expo-plan-6011ab-88a7`.
- `/Users/afar/dev/oscar-pr-101-preserved` is about 769 MB and has modified tracked files on `pr-101`.
- `/Users/afar/dev/littleai` is about 4 KB and is not a Git repo.
- `/Users/afar/dev/fieldtheory-labs.oscar-mirror.git` is at `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`.
- Local `oscar` is at `615d081171a4d2d6df5ed1d790c4f13a58a11618`; local `origin/main` is at `2448e3d2f9460b867a5e3aa8c08f2df978840e3d`.
- The stale `oscar` mirror is still 6 commits behind local `oscar` and 10 commits behind local `origin/main`.
- June-7 cleanup candidates still present include `fieldtheory-private-remote-verify`, `fieldtheory-public-candidate*`, `fieldtheory-release-artifacts-preserved`, `fieldtheory-worktrees`, and `oscar-pr-101-preserved`.

Result:

- A5a remains eligible to ask Andrew for the exact approval phrase `approve A5a cleanup manifest only`, but only as manifest work.
- A5a is not approved and not complete because no cleanup manifest was created.
- A5 deletion, prune, archive, bundle, waiver, and move execution remain blocked until each target has a reviewed target-specific preservation decision and a later exact approval is given.
- A5 remains not complete.
- Do not treat this as approval to delete, prune, move `oscar`, archive, bundle, stash, commit, write a manifest, create waivers, or call A5 complete.

## 2026-07-02T05:29:04Z: A5 Oscar Remote Evidence Recheck

Scope: read-only A5 Oscar remote evidence correction after adversarial review found local `origin/main` stale. No cleanup manifest was created. No fetch, deletion, quarantine, prune, archive, bundle, stash, commit, move, or waiver was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/oscar remote get-url origin
git -C /Users/afar/dev/oscar rev-parse HEAD
git -C /Users/afar/dev/oscar rev-parse origin/main
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/oscar ls-remote origin refs/heads/main
MIRROR_HEAD="$(git --git-dir=/Users/afar/dev/fieldtheory-labs.oscar-mirror.git rev-parse HEAD)"
git --git-dir=/Users/afar/dev/fieldtheory-labs.oscar-mirror.git rev-parse HEAD
git -C /Users/afar/dev/oscar rev-list --count "$MIRROR_HEAD"..HEAD
git -C /Users/afar/dev/oscar rev-list --count "$MIRROR_HEAD"..origin/main
gh api repos/afar1/oscar/compare/1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28...f81481ff9824ddb4fa252ed93933d9bc815dc930 --jq '{status: .status, ahead_by: .ahead_by, behind_by: .behind_by, total_commits: .total_commits, base_commit: .base_commit.sha, merge_base_commit: .merge_base_commit.sha}'
```

Observed evidence:

- Oscar `origin` is `https://github.com/afar1/oscar.git`.
- Local `oscar` remains at `615d081171a4d2d6df5ed1d790c4f13a58a11618`.
- Local `origin/main` is stale at `2448e3d2f9460b867a5e3aa8c08f2df978840e3d`.
- Live GitHub `origin/main` is `f81481ff9824ddb4fa252ed93933d9bc815dc930`.
- The live remote commit is not present in the local object database without fetching.
- `/Users/afar/dev/fieldtheory-labs.oscar-mirror.git` remains at `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`.
- The mirror is 6 commits behind local `oscar`, 10 commits behind stale local `origin/main`, and 12 commits behind live GitHub `origin/main` by GitHub compare API.

Result:

- A5a remains eligible to ask Andrew for the exact approval phrase `approve A5a cleanup manifest only`, but only as manifest work.
- The current A5 evidence must use live GitHub `origin/main` for Oscar remote truth, not the stale local `origin/main` ref.
- A5a is not approved and not complete because no cleanup manifest was created.
- A5 deletion, prune, archive, bundle, waiver, and move execution remain blocked until each target has a reviewed target-specific preservation decision and a later exact approval is given.
- Do not treat this as approval to delete, prune, move `oscar`, fetch, archive, bundle, stash, commit, write a manifest, create waivers, or call A5 complete.

## 2026-07-02T03:56:45Z: A6 Optional Review Debris Quarantine Recheck

Scope: read-only A6 preflight refresh. No quarantine, deletion, symlink change, migration, file write, or move was performed.

Commands run locally:

```bash
test ! -e '/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1'
test -f /Users/afar/.ft-bookmarks/twitter-bookmarks.db
test ! -L /Users/afar/.ft-bookmarks/twitter-bookmarks.db
stat -f '%N inode=%i size=%z modified=%Sm' /Users/afar/.ft-bookmarks/twitter-bookmarks.db
```

Observed evidence:

- `/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1` remains absent.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` is still present.
- `twitter-bookmarks.db` is still a regular file, not a symlink.
- `twitter-bookmarks.db` is still 0 bytes.
- `twitter-bookmarks.db` was modified on April 12, 2026 at 14:48:42.
- A read-only evidence subagent independently confirmed no mismatch from the documented A6 optional-quarantine state.

Result:

- Optional A6 quarantine remains eligible to ask Andrew for approval; it is not approved yet.
- Core A6 review-created debris is complete because `bookmarks.db?immutable=1` is absent. Optional `twitter-bookmarks.db` quarantine remains unapproved and incomplete.
- Do not treat this as approval to delete anything, quarantine anything, or touch any other bookmark database, media file, or symlink.

## 2026-07-02T04:40:14Z: A6 Optional Review Debris Quarantine Recheck

Scope: read-only A6 preflight refresh. No quarantine, deletion, symlink change, migration, file write, or move was performed.

Commands run locally:

```bash
test ! -e '/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1'
ls -la /Users/afar/.ft-bookmarks | sed -n '1,80p'
stat -f '%N type=%HT size=%z modified=%Sm' /Users/afar/.ft-bookmarks/twitter-bookmarks.db
test -f /Users/afar/.ft-bookmarks/twitter-bookmarks.db
test ! -L /Users/afar/.ft-bookmarks/twitter-bookmarks.db
wc -c /Users/afar/.ft-bookmarks/twitter-bookmarks.db
```

Observed evidence:

- `/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1` remains absent.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` is still present.
- `twitter-bookmarks.db` is still a regular file, not a symlink.
- `twitter-bookmarks.db` is still 0 bytes.
- `twitter-bookmarks.db` was modified on April 12, 2026 at 14:48:42.
- Tesla independently confirmed no material drift from the documented A6 optional-quarantine state.

Result:

- Optional A6 quarantine remains eligible to ask Andrew for the exact approval phrase `approve A6a review-debris quarantine`; it is not approved yet.
- Core A6 review-created debris is complete because `bookmarks.db?immutable=1` is absent. Optional `twitter-bookmarks.db` quarantine remains unapproved and incomplete.
- Do not treat this as approval to delete anything, quarantine anything, or touch any other bookmark database, media file, or symlink.

## 2026-07-02T05:24:39Z: A6 Optional Review Debris Quarantine Recheck

Scope: read-only A6 preflight refresh. No quarantine, deletion, symlink change, migration, file write, or move was performed.

Commands run locally:

```bash
test ! -e '/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1'
test -f /Users/afar/.ft-bookmarks/twitter-bookmarks.db
test ! -L /Users/afar/.ft-bookmarks/twitter-bookmarks.db
stat -f '%N inode=%i size=%z modified=%Sm' /Users/afar/.ft-bookmarks/twitter-bookmarks.db
```

Observed evidence:

- `/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1` remains absent.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` is still present.
- `twitter-bookmarks.db` is still a regular file, not a symlink.
- `twitter-bookmarks.db` is still 0 bytes.
- `twitter-bookmarks.db` was modified on April 12, 2026 at 14:48:42.

Result:

- Optional A6 quarantine remains eligible to ask Andrew for the exact approval phrase `approve A6a review-debris quarantine`; it is not approved yet.
- Core A6 review-created debris is complete because `bookmarks.db?immutable=1` is absent. Optional `twitter-bookmarks.db` quarantine remains unapproved and incomplete.
- Do not treat this as approval to delete anything, quarantine anything, or touch any other bookmark database, media file, or symlink.

## 2026-07-02T05:46:38Z: A1/A4 Gate Recheck

Scope: read-only gate refresh for the two Phase 1 blockers. No push, upstream change, clone, build, install, backup, scheduler change, deletion, move, stash, tag, release publication, migration, or cache mutation was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
PUBLIC_MAIN_SHA="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main | awk '{print $1}')"
gh api "repos/afar1/fieldtheory/git/trees/$PUBLIC_MAIN_SHA?recursive=1" --jq '[.truncated, ([.tree[].path | select(. == "ios-native" or startswith("ios-native/"))] | length)] | @tsv'
test -d "$HOME/.fieldtheory"
test -L "$HOME/.fieldtheory/bookmarks"
readlink "$HOME/.fieldtheory/bookmarks"
test -d "$HOME/.ft-bookmarks"
BOOKMARKS_REAL="$(readlink "$HOME/.fieldtheory/bookmarks" 2>/dev/null || printf '%s\n' "$HOME/.fieldtheory/bookmarks")"
test -d "/Volumes/Extreme SSD"
test -w "/Volumes/Extreme SSD"
mount | rg ' on /Volumes/Extreme SSD ' || true
diskutil info "/Volumes/Extreme SSD" || true
tmutil destinationinfo
command -v restic || true
launchctl list | rg -i 'fieldtheory|restic|backup' || true
crontab -l 2>/dev/null | rg -i 'fieldtheory|restic|backup' || true
find "$HOME/.fieldtheory" "$BOOKMARKS_REAL" -maxdepth 3 -iname '*restore*drill*' -print
du -sh "$HOME/.fieldtheory" "$HOME/.ft-bookmarks"
df -h "/Volumes/Extreme SSD" || true
```

Observed evidence:

- `/Users/afar/dev/fieldtheory` remains on `ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` remains on `codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are still `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is still `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is still `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`; `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` are still absent.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` still has no exact `refs/heads/ios-native-app`.
- Current public `origin/main` is `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.
- `~/.fieldtheory` exists, and `~/.fieldtheory/bookmarks` still points to `/Users/afar/.ft-bookmarks`.
- `/Volumes/Extreme SSD` is still absent and not writable; `diskutil info "/Volumes/Extreme SSD"` cannot find the disk.
- Time Machine still knows an `Extreme SSD` local destination, but it is not mounted for A4.
- `restic` is still missing from `PATH`.
- No Field Theory restic/backup scheduler evidence was found in `launchctl` or `crontab`.
- No restore-drill candidates were found under the checked roots.
- Current root sizes are about 617 MB for `~/.fieldtheory` and 54 GB for `~/.ft-bookmarks`.

Result:

- A1 remains eligible to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved and not complete.
- A4a remains not askable until the approved backup volume is mounted, writable, and verified by mount/disk metadata; `restic` being absent must also be named before asking.
- A4b remains blocked because A4a has not passed and no restore-drill artifact exists.
- Do not treat this as approval to push, set upstreams, clone, build, install backup tooling, run a backup, schedule anything, delete, prune, move, or call A1 or A4 complete.

## 2026-07-02T05:49:56Z: A2/A3/A5/A6 Evidence And Sequencing Recheck

Scope: read-only subagent refresh for non-gate Phase 0 packets plus adversarial sequencing review. No fetch, push, install, delete, prune, move, stash, tag, publish, bundle, snapshot, manifest, scheduler change, migration, or plugin-cache mutation was performed.

Subagent leads, not proof:

- Galileo found no A2 drift: branch, dirty count, version, tags, public repo state, and release feed still match the documented A2a state.
- Galileo found no A3 drift: installed source and Codex cache are still byte-identical; dev still differs in the same three files; `plugin/` remains absent; `/tmp/a3_*` scratch files still exist.
- Galileo found no A5 drift: 59 Field Theory-family dirs, 59 worktree records, 17 prunable `fieldtheory-cli` worktree records, and 5 `/private/tmp` candidates still match; Oscar mirror remains 12 commits behind live GitHub `origin/main`.
- Galileo found no A6 drift: `bookmarks.db?immutable=1` remains absent, and `twitter-bookmarks.db` remains a zero-byte regular non-symlink file.
- Harvey found no blocker to A1-first sequencing. A1 remains the recommended next packet, A4 remains blocked, A2a/A3a/A5a/A6a remain askable but not executable without exact phrases, and C1 remains WIP for sequencing.
- Harvey raised runbook hardening nits for A1 verification approval wording, A3 rollback copy-paste safety, and A4 exact snapshot capture; those nits were patched in `docs/PRESERVATION_GATES.md`.
- Before asking for A2a, A3a, A5a, or A6a approval, the orchestrator must rerun direct read-only preflight commands and append command output.

Result:

- A2a, A3a, A5a, and A6a remain askable only as their named limited packets; none are approved or executed.
- The current approval queue still recommends A1 first.
- Phase 1 remains blocked by A1 and A4 unless Andrew explicitly accepts the remaining gate gaps or uses named exact waiver language.

## 2026-07-02T06:10:44Z: A1 Approval-Request Refresh

Scope: read-only A1 preflight refresh after assigning explicit coordinator and subagent goals. No approval packet was executed. No push, dry-run push, upstream change, clone, build, delete, prune, stash, tag, release, migration, backup operation, bundle, snapshot, manifest, install, or plugin-cache mutation was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
PUBLIC_MAIN_SHA="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main | awk '{print $1}')"
test -n "$PUBLIC_MAIN_SHA"
gh api "repos/afar1/fieldtheory/git/trees/$PUBLIC_MAIN_SHA?recursive=1" --jq '[.truncated, ([.tree[].path | select(. == "ios-native" or startswith("ios-native/"))] | length)] | @tsv'
```

Observed evidence:

- `/Users/afar/dev/fieldtheory` remains on `ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` remains on `codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are still `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is still `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is still `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`; `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` are still absent.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` still has no exact `refs/heads/ios-native-app`.
- Current public `origin/main` tree reports `truncated=false` and zero `ios-native` paths.

Result:

- A1 remains eligible to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- `docs/A1_APPROVAL_REQUEST.md` records the candidate request text and explicit coordinator/subagent goals. It is not approval.
- A1 is not approved and not complete.
- Do not treat this as approval to push, set upstreams, clone, build, delete, prune, move, stash, tag, publish, install, mutate plugin cache, run backups, schedule anything, create bundles or snapshots, migrate data, or call A1 complete.

## 2026-07-02T06:21:56Z: A2/A3/A5/A6 Direct Evidence Refresh

Scope: direct read-only preflight refresh for the askable limited non-A1 Phase 0 packets. No approval packet was executed. No fetch, push, clone, dry-run push, bundle, archive, snapshot, manifest, stash, tag, release, install, plugin-cache mutation, backup operation, scheduler change, migration, delete, prune, move, or symlink change was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory-oss status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-oss rev-list --left-right --count HEAD...origin/main
git -C /Users/afar/dev/fieldtheory-oss tag --list
git -C /Users/afar/dev/fieldtheory-oss ls-remote --tags origin 'refs/tags/*'
node -p "require('/Users/afar/dev/fieldtheory-oss/mac-app/package.json').version"
sed -n '1,24p' /Users/afar/dev/fieldtheory-oss/mac-app/CHANGELOG.md
sed -n '1,20p' /Users/afar/dev/fieldtheory-oss/mac-app/docs/RELEASE_CHECKLIST.md
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/field-releases --json nameWithOwner,visibility,url
gh release list --repo afar1/field-releases --limit 3
curl -fsSL https://github.com/afar1/field-releases/releases/latest/download/latest-mac.yml

git -C /Users/afar/dev/fieldtheory-plugin status --short --branch --untracked-files=all
diff -qr /Users/afar/plugins/field-theory /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607
diff -qr /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418 /Users/afar/plugins/field-theory
test ! -d /Users/afar/dev/fieldtheory-plugin/plugin
ls -l /tmp/a3_dev_files.txt /tmp/a3_installed_files.txt 2>/dev/null || true

find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | sort
find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | wc -l
find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | sort
find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | wc -l
git -C /Users/afar/dev/fieldtheory-oss worktree list --porcelain
git -C /Users/afar/dev/fieldtheory-oss worktree list --porcelain | rg '^worktree ' | wc -l
git -C /Users/afar/dev/fieldtheory worktree list --porcelain
git -C /Users/afar/dev/fieldtheory worktree list --porcelain | rg '^worktree ' | wc -l
git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain
git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain | rg '^worktree ' | wc -l
git -C /Users/afar/dev/fieldtheory-plugin worktree list --porcelain
git -C /Users/afar/dev/fieldtheory-plugin worktree list --porcelain | rg '^worktree ' | wc -l
find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print | sort
find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print | wc -l
git -C /Users/afar/dev/oscar status --short --branch --untracked-files=all
MIRROR_HEAD="$(git --git-dir=/Users/afar/dev/fieldtheory-labs.oscar-mirror.git rev-parse HEAD)"
LIVE_OSCAR_MAIN="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/oscar ls-remote origin refs/heads/main | awk '{print $1}')"
printf 'mirror=%s live_origin_main=%s\n' "$MIRROR_HEAD" "$LIVE_OSCAR_MAIN"
gh api "repos/afar1/oscar/compare/$MIRROR_HEAD...$LIVE_OSCAR_MAIN" --jq '{status: .status, ahead_by: .ahead_by, behind_by: .behind_by, total_commits: .total_commits}'

test ! -e '/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1'
test -f /Users/afar/.ft-bookmarks/twitter-bookmarks.db
test ! -L /Users/afar/.ft-bookmarks/twitter-bookmarks.db
stat -f '%N inode=%i size=%z modified=%Sm' /Users/afar/.ft-bookmarks/twitter-bookmarks.db
test "$(stat -f '%z' /Users/afar/.ft-bookmarks/twitter-bookmarks.db)" = "0"
```

Observed direct evidence:

- A2a: `/Users/afar/dev/fieldtheory-oss` remains on `codex/release-0.3.14-startup-library...origin/codex/release-0.3.14-startup-library [ahead 31]` with 36 dirty paths. It is still 30 commits ahead of `origin/main` and 0 behind. Package metadata is still `0.3.20`; `CHANGELOG.md` still starts at `0.1.33`; `RELEASE_CHECKLIST.md` still says `v0.1.25+maxwell`; no source tags were returned; `afar1/fieldtheory` and `afar1/field-releases` are public; the latest release/feed remains `0.3.14`.
- A3a: `/Users/afar/dev/fieldtheory-plugin` remains dirty on `main...origin/main`. Installed plugin source and Codex cache are still byte-identical. The dev bundle still differs from installed source in `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`. The `plugin/` directory is still absent. `/tmp/a3_dev_files.txt` and `/tmp/a3_installed_files.txt` still exist.
- A5a: the Field Theory-family directory count remains 59. The preservation-sensitive target dirs remain `littleai`, `old-field`, `oscar`, and `oscar-pr-101-preserved`. Worktree counts remain `fieldtheory-oss` 11, `fieldtheory` 17, `fieldtheory-cli` 30, and `fieldtheory-plugin` 1. `/private/tmp` still has 5 `fieldtheory-cli-*` candidate dirs. `oscar` is still dirty/preservation-sensitive. The live GitHub compare means live `origin/main` `f81481ff9824ddb4fa252ed93933d9bc815dc930` is 12 commits ahead of mirror `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`, so the mirror is stale and cannot be used as preservation proof.
- A6a: `bookmarks.db?immutable=1` remains absent. `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` remains a regular non-symlink zero-byte file, modified Apr 12 14:48:42 2026.

Subagent cross-check:

- Franklin independently found no material A2a/A3a drift and returned GO to ask only, not execute.
- Locke independently found no material A5a/A6a drift and returned GO to ask only, not execute. Locke also noted the local `oscar` tracking ref is stale, so live GitHub evidence remains the authority for Oscar preservation status.

Result:

- A2a, A3a, A5a, and A6a remain eligible to ask Andrew for their exact limited approval phrases.
- None of A2a, A3a, A5a, or A6a is approved, executed, or complete.
- A2, A3, A5, and A6 are not complete. A6 core review-created debris remains complete because `bookmarks.db?immutable=1` is absent; only optional quarantine remains.
- Do not treat this as approval to create bundles, snapshots, manifests, archives, waivers, tags, releases, commits, installs, plugin-cache writes, backups, scheduler changes, deletes, prunes, moves, migrations, symlink changes, or public/private pushes.

## 2026-07-02T06:37:03Z: A4 Backup Gate Direct Recheck

Scope: direct read-only A4a/A4b preflight refresh with two independent read-only evidence subagents. No approval packet was executed. No install, backup, restore, scheduler change, file write, deletion, migration, config write, volume mount, drill file creation, or symlink change was performed.

Commands run locally:

```bash
test -d "$HOME/.fieldtheory"
test -L "$HOME/.fieldtheory/bookmarks"
readlink "$HOME/.fieldtheory/bookmarks"
test -d "$HOME/.ft-bookmarks"
BOOKMARKS_REAL="$(readlink "$HOME/.fieldtheory/bookmarks" 2>/dev/null || printf '%s\n' "$HOME/.fieldtheory/bookmarks")"
du -sh "$HOME/.fieldtheory" "$HOME/.ft-bookmarks"

test -d "/Volumes/Extreme SSD"
test -w "/Volumes/Extreme SSD"
mount | rg ' on /Volumes/Extreme SSD ' || true
diskutil info "/Volumes/Extreme SSD" || true
df -h "/Volumes/Extreme SSD" || true
tmutil destinationinfo
command -v restic || true

launchctl list | rg -i 'fieldtheory|restic|backup' || true
crontab -l 2>/dev/null | rg -i 'fieldtheory|restic|backup' || true
rg -n -i 'restic|backup|fieldtheory' "$HOME/Library/LaunchAgents" /Library/LaunchAgents /Library/LaunchDaemons 2>/dev/null | sed -n '1,120p'
launchctl print "gui/$(id -u)/com.fieldtheory.app.ShipIt" 2>&1 | sed -n '1,120p'
find "$HOME/Library/LaunchAgents" /Library/LaunchAgents /Library/LaunchDaemons -maxdepth 1 -iname '*fieldtheory*' -o -iname '*restic*' -o -iname '*backup*' 2>/dev/null

find "$HOME/.fieldtheory" "$BOOKMARKS_REAL" -maxdepth 3 -iname '*restore*drill*' -print 2>/dev/null
test -f "$HOME/.fieldtheory/backup-drill/restore-drill-artifact.txt"
sed -n '1,20p' "$HOME/.fieldtheory/backup-drill/restore-drill-artifact.txt" 2>/dev/null || true
```

Observed direct evidence:

- `~/.fieldtheory` exists and is about 617 MB.
- `~/.fieldtheory/bookmarks` is still a symlink to `/Users/afar/.ft-bookmarks`.
- `~/.ft-bookmarks` exists and is about 54 GB.
- `/Volumes/Extreme SSD` does not exist as a mounted directory, is not writable, has no matching `mount` entry, and `diskutil info "/Volumes/Extreme SSD"` reports `Could not find disk: /Volumes/Extreme SSD`.
- `df -h "/Volumes/Extreme SSD"` reports no filesystem data because the path is absent.
- Time Machine still knows an `Extreme SSD` local destination with ID `B41B6D8B-AFBC-4B54-A0FA-1EC83CAC71B6`, but that is not a mounted writable backup target for A4.
- `restic` is still missing from `PATH`.
- The broad `launchctl` regex still matches `com.apple.SecureBackupDaemon` and `com.fieldtheory.app.ShipIt`; `launchctl print` shows `com.fieldtheory.app.ShipIt` is the Field Theory app updater at `/Applications/Field Theory.app/Contents/Frameworks/Squirrel.framework/Resources/ShipIt`, not backup scheduler evidence.
- `crontab` has no Field Theory, restic, or backup match.
- No matching Field Theory/restic/backup LaunchAgent or LaunchDaemon plist was found in the checked directories.
- No restore-drill paths were found under `~/.fieldtheory` or `/Users/afar/.ft-bookmarks`.
- `~/.fieldtheory/backup-drill/restore-drill-artifact.txt` does not exist.

Subagent cross-check:

- Parfit independently found A4a NO-GO / not askable and A4b NO-GO / blocked at 06:36Z. Parfit found no material ledger drift.
- Ptolemy independently found A4a NO-GO and A4b NO-GO at 06:38Z. Ptolemy found no material ledger drift and confirmed `ShipIt` is updater evidence, not backup scheduler evidence.

Adversarial review:

- Aristotle found one unsafe wording issue after the A4 evidence patch: two mutating A4 template guards said the A4a preflight must "still match," which was ambiguous because the current A4a preflight is failing.
- The A4 setup, backup, and restore-drill guards now require a fresh A4a preflight that PASSES with the approved volume mounted, writable, and verified by mount/disk metadata.
- Hume rereviewed the patched A4 guards and returned GO to leave the A4 docs as-is.

Result:

- A4a remains not askable until the approved backup volume is mounted, writable, and verified by mount/disk metadata.
- `restic` is still missing and must be named before asking for A4a approval.
- A4b remains blocked because A4a has not passed, no scheduled backup evidence exists, and no restore-drill artifact exists.
- A4 is not complete.
- Do not treat this as approval to install `restic`, initialize a repository, run a backup, run a restore drill, load a scheduler, write backup config, create or delete drill files, mount volumes, change symlinks, or run migrations.

## 2026-07-02T06:49:25Z: A1 Approval-Request Recheck

Scope: direct read-only A1 preflight refresh with one independent read-only evidence subagent. No approval packet was executed. No push, dry-run push, upstream change, clone, build, delete, prune, stash, tag, release, migration, backup operation, bundle, snapshot, manifest, install, or plugin-cache mutation was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
PUBLIC_MAIN_SHA="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main | awk '{print $1}')"
test -n "$PUBLIC_MAIN_SHA"
gh api "repos/afar1/fieldtheory/git/trees/$PUBLIC_MAIN_SHA?recursive=1" --jq '[.truncated, ([.tree[].path | select(. == "ios-native" or startswith("ios-native/"))] | length)] | @tsv'
```

Observed direct evidence:

- `/Users/afar/dev/fieldtheory` remains on `ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` remains on `codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are still `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is still `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is still `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`; `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` are still absent.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` still has no exact `refs/heads/ios-native-app`.
- Current public `origin/main` is `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Subagent cross-check:

- Laplace confirmed the same local SHAs, push URLs, repo visibility, absent private target refs via GitHub API, distinct historical private ref, and clean public leak checks.
- Laplace's private `git ls-remote labs ...` check failed in the subagent environment with `git: 'credential-osxkeychain' is not a git command` and `fatal: could not read Username for 'https://github.com': terminal prompts disabled`.
- The coordinator reran the exact private `git ls-remote` checks in this shell with `GIT_TERMINAL_PROMPT=0`; both exact private target ref checks exited 0 with no refs, and the historical private ref resolved successfully. The subagent credential failure is a caution, not current coordinator-shell drift.

Adversarial review:

- McClintock reviewed the refreshed A1 docs and found no blockers.
- McClintock confirmed the docs do not accidentally approve or execute A1, do not improperly dismiss Laplace's credential-helper failure, preserve the rule that GitHub API evidence cannot substitute for private Git transport during execution, and do not contradict the current A1/A4 gate state.
- McClintock noted "Ready for SHA-pinned approval" is a phrase to keep an eye on, but not a blocker because it is paired with "not executed" or "not approved."

Result:

- A1 remains eligible to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- `docs/A1_APPROVAL_REQUEST.md` records the candidate request text and explicit coordinator/subagent goals. It is not approval.
- A1 is not approved and not complete.
- Any private Git auth failure in the execution shell remains a stop condition; do not substitute GitHub API evidence for private Git transport during A1 execution.
- Do not treat this as approval to push, set upstreams, clone, build, delete, prune, move, stash, tag, publish, install, mutate plugin cache, run backups, schedule anything, create bundles or snapshots, migrate data, or call A1 complete.

## 2026-07-02T07:00:24Z: A1 Final Pre-Approval Sequencing Check

Scope: direct read-only A1 preflight refresh plus one independent adversarial sequencing review before asking Andrew for the next approval. No approval packet was executed. No push, dry-run push, upstream change, clone, build, delete, prune, stash, tag, release, migration, backup operation, bundle, snapshot, manifest, install, or plugin-cache mutation was performed.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
PUBLIC_MAIN_SHA="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main | awk '{print $1}')"
test -n "$PUBLIC_MAIN_SHA"
gh api "repos/afar1/fieldtheory/git/trees/$PUBLIC_MAIN_SHA?recursive=1" --jq '[.truncated, ([.tree[].path | select(. == "ios-native" or startswith("ios-native/"))] | length)] | @tsv'
```

Observed direct evidence:

- `/Users/afar/dev/fieldtheory` remains on `ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` remains on `codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are still `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is still `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is still `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` are still absent; both exact private `git ls-remote` checks exited 0 with no refs.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- `afar1/fieldtheory` reports `PUBLIC`; `afar1/fieldtheory-labs` reports `PRIVATE`.
- Public `origin` still has no exact `refs/heads/ios-native-app`.
- Current public `origin/main` is `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Adversarial sequencing review:

- Euler returned GO to ask Andrew for A1, conditional on the fresh direct A1 preflight still matching.
- Euler found no hidden blocker in the inspected docs and agreed the private Git credential caution is handled correctly: coordinator-shell transport succeeded, and any future private Git auth failure remains a stop condition.
- Euler found the exact A1 phrase tightly scoped to two private pushes plus upstream/fresh-clone/build verification, with no public push, force push, deletion, extraction, signing/TestFlight, backup, cleanup, plugin-cache mutation, tags, releases, or migrations.
- Euler found A2a/A3a/A5a/A6a first would be lower-risk busywork but less aligned because those packets do not remove the iOS existence risk or unlock E1/E2; A4 remains not askable.

Result:

- A1 remains eligible to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved and not complete.
- If Andrew says the exact phrase, rerun the A1 preflight in the same execution shell before any push.
- Do not treat this as approval to push, set upstreams, clone, build, delete, prune, move, stash, tag, publish, install, mutate plugin cache, run backups, schedule anything, create bundles or snapshots, migrate data, or call A1 complete.

## 2026-07-02T07:04:52Z: A1 Build Verification Discovery

Scope: read-only discovery of the iOS build command that A1 should try after approved private preservation and fresh clone verification. No approval packet was executed. No push, dry-run push, upstream change, clone, build, Xcode project generation, delete, prune, stash, tag, release, migration, backup operation, bundle, snapshot, manifest, install, or plugin-cache mutation was performed.

Commands run locally:

```bash
find /Users/afar/dev/fieldtheory/ios-native -maxdepth 3 \( -name '*.xcodeproj' -o -name '*.xcworkspace' -o -name 'Package.swift' -o -name 'Podfile' -o -name 'Cartfile' -o -name 'project.pbxproj' -o -name '*.xcscheme' \) -print | sort
find /Users/afar/dev/fieldtheory/ios-native -maxdepth 3 -type f
sed -n '1,240p' /Users/afar/dev/fieldtheory/ios-native/project.yml
sed -n '1,240p' /Users/afar/dev/fieldtheory/ios-native/README.md
sed -n '1,270p' /Users/afar/dev/fieldtheory/ios-native/scripts/build-whisper-ios.sh
command -v xcodegen || true
command -v xcodebuild || true
xcodebuild -version 2>/dev/null | sed -n '1,5p' || true
find /Users/afar/dev/fieldtheory -maxdepth 2 \( -name 'whisper.cpp' -o -name 'build-apple' -o -name 'whisper.xcframework' -o -name 'FieldTheory.xcodeproj' \) -print | sort
rg -n "build-whisper|xcodegen|xcodebuild|FieldTheory.xcodeproj|generic/platform=iOS|allowProvisioning|whisper.xcframework" /Users/afar/dev/fieldtheory/ios-native /Users/afar/dev/fieldtheory -g '!**/.git/**'
```

Observed direct evidence:

- `ios-native` has no checked-in `.xcodeproj`, `.xcworkspace`, `Package.swift`, or `.xcscheme`; it has `project.yml`.
- `ios-native/README.md` gives the build sequence: run `./ios-native/scripts/build-whisper-ios.sh` from the repo root, then `xcodegen generate` from `ios-native`, then `xcodebuild -project FieldTheory.xcodeproj -scheme FieldTheory -configuration Debug -destination 'generic/platform=iOS' -allowProvisioningUpdates build`.
- `project.yml` defines project `FieldTheory`, app target `FieldTheory`, tests `FieldTheoryTests` and `FieldTheoryUITests`, deployment target iOS `26.0`, bundle id `com.afar1.fieldtheory`, development team `3244UJ94D8`, automatic signing, Swift `5.0`, and dependencies on Supabase, Markdown, and `../build-apple/whisper.xcframework`.
- `xcodegen` exists at `/opt/homebrew/bin/xcodegen`; `xcodebuild` exists at `/usr/bin/xcodebuild`; `xcodebuild -version` reports Xcode `26.1.1`.
- The current local checkout has `build-apple/whisper.xcframework`, but a fresh private clone should not rely on that local artifact.
- `build-whisper-ios.sh` writes the ignored `build-apple/whisper.xcframework` and deletes/recreates `build-apple`, `build-ios-sim`, and `build-ios-device`.

Subagent cross-check:

- Mendel independently confirmed the build command is discoverable and should replace "if the build command is discoverable without guessing" in the A1 packet.
- Mendel confirmed the same XcodeGen project shape and caveats: generated `FieldTheory.xcodeproj`, ignored `build-apple/whisper.xcframework`, mutating whisper build directories, generic iOS/device destination, and possible Apple team provisioning requirements.

Result:

- A1's post-push build verification path is now explicit in `docs/PHASE0_APPROVAL_PACKETS.md` and `docs/PRESERVATION_GATES.md`.
- A1 remains not approved and not complete.
- Do not treat this discovery as approval to push, clone, build, generate an Xcode project, delete/recreate build directories, set upstreams, tag, release, install, mutate plugin cache, run backups, schedule anything, or call A1 complete.

## 2026-07-02T07:21-07:24Z: A1/A4 Gate Refresh

Scope: direct read-only A1 and A4 gate refresh plus independent evidence subagents and adversarial sequencing review. No approval packet was executed. No push, dry-run push, upstream change, clone, build, Xcode project generation, delete, prune, stash, tag, release, migration, backup operation, restore operation, scheduler change, bundle, snapshot, manifest, install, or plugin-cache mutation was performed.

Commands run locally for A1:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
PUBLIC_MAIN_SHA="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main | awk '{print $1}')"
test -n "$PUBLIC_MAIN_SHA"
gh api "repos/afar1/fieldtheory/git/trees/$PUBLIC_MAIN_SHA?recursive=1" --jq '[.truncated, ([.tree[].path | select(. == "ios-native" or startswith("ios-native/"))] | length)] | @tsv'
```

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` remains on `ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` remains on `codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are still `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is still `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is still `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`; `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` are still absent; both exact private Git transport checks exited `0` with no refs.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` still has no exact `refs/heads/ios-native-app`.
- Current public `origin/main` is `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Commands run locally for A4:

```bash
test -e "/Volumes/Extreme SSD" && ls -ld "/Volumes/Extreme SSD"
test -w "/Volumes/Extreme SSD"
mount | rg ' on /Volumes/Extreme SSD '
diskutil info "/Volumes/Extreme SSD"
command -v restic
ls -ld "$HOME/.fieldtheory/bookmarks" "$HOME/.ft-bookmarks"
find "$HOME/.fieldtheory" "$HOME/.ft-bookmarks" -maxdepth 4 \( -iname '*restore*drill*' -o -iname '*backup*drill*' -o -iname '*restic*' \) -print
ls "$HOME/Library/LaunchAgents" 2>/dev/null | rg -i 'fieldtheory|restic|backup|waist'
launchctl print "gui/$(id -u)" 2>/dev/null | rg -i 'fieldtheory|restic|backup|waist'
crontab -l 2>/dev/null | rg -i 'fieldtheory|restic|backup|waist'
tmutil destinationinfo 2>/dev/null
readlink "$HOME/.fieldtheory/bookmarks"
```

Observed direct A4 evidence:

- `/Volumes/Extreme SSD` does not exist, is not writable, has no mount entry, and `diskutil info "/Volumes/Extreme SSD"` reports `Could not find disk`.
- `restic` is not on `PATH`.
- `~/.fieldtheory/bookmarks` is a symlink to `/Users/afar/.ft-bookmarks`.
- No restore-drill, backup-drill, or restic artifacts were found under `~/.fieldtheory` or `~/.ft-bookmarks` by the checked patterns.
- No Field Theory restic/waist backup LaunchAgent or cron evidence was found. The loaded `com.fieldtheory.app.ShipIt` match is updater evidence, not backup scheduler evidence.
- `tmutil destinationinfo` still knows a local Time Machine destination named `Extreme SSD`, but that is not proof that the approved A4 backup volume is mounted or that Field Theory restic backup/restore safety exists.

Subagent cross-checks:

- Banach independently verified A1 at 2026-07-02T07:23:06Z and returned GO-to-ask only. It found no private Git transport failure and confirmed no edit, push, clone, build, fetch, upstream change, stash, install, tag, release, backup, bundle, or snapshot was performed.
- Boyle independently verified A4 at 2026-07-02T07:24:46Z and returned NO-GO/not askable. It confirmed no material drift toward askability.
- Kant adversarially reviewed the refreshed A1/A4 sequencing and returned GO to patch the ledger and keep the actual user-facing ask limited to the exact A1 approval phrase. Kant recommended hardening stop conditions for untrustworthy public tree API output and for private target refs appearing before approval.

Result:

- A1 remains eligible to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- A4a remains not askable, and A4b remains blocked.
- Phase 1 and later migration/extraction work remain blocked by preservation gates unless Andrew explicitly accepts those gates or uses named exact waiver language.
- If Andrew says the exact A1 phrase, rerun the A1 preflight in the same execution shell before any push.
- Do not treat this as approval to push, set upstreams, clone, build, delete, prune, move, stash, tag, publish, install, mutate plugin cache, run backups, schedule anything, create bundles or snapshots, migrate data, or call A1 complete.

## 2026-07-02T08:15Z: Current Session Goal Assignment And Safety Patch

Scope: coordination/doc-only update after explicit coordinator and subagent goals were assigned. No approval packet was executed. No push, dry-run push, upstream change, clone, build, Xcode project generation, delete, prune, move, stash, tag, release, migration, backup operation, restore operation, scheduler change, bundle, snapshot, manifest, install, or plugin-cache mutation was performed.

Subagent cross-checks:

- Volta the 2nd audited the current goal map and approval queue read-only and returned GO: coordinator/subagent goals are explicit, A1 remains ask-only, A4 approval remains not askable, Phase 1+ remains blocked, and subagent summaries remain leads rather than proof.
- Beauvoir the 2nd adversarially reviewed the current goal map and approval queue and returned NO-GO on three safety blockers.

Patched safety blockers:

- A1 pre-existing target refs now stop and regenerate the A1 request as verification-only instead of allowing the push template to continue.
- A1 build verification now uses simulator/no-code-sign `xcodebuild` and explicitly excludes signing, provisioning, device, TestFlight, and distribution work from A1. Historical notes that quote the README's provisioning-capable command are discovery evidence only; the current approval packet supersedes them.
- A4 restore drill now restores into a unique `mktemp -d /tmp/fieldtheory-restore-drill.XXXXXX` directory instead of deleting a fixed restore path.

Result:

- Goal assignment is explicit in `docs/ECOSYSTEM_ACT_GOALS.md`.
- A1 remains the recommended next approval ask, not approved, not executed, and not complete.
- A4a approval remains not askable until the approved volume is mounted, writable, and verified by mount/disk metadata.
- Phase 1+ remains blocked unless A1 and A4 pass and remaining Phase 0 gaps are explicitly accepted by Andrew or waived with named exact waiver language.

## 2026-07-02T07:42-07:44Z: A2/A3/A5/A6 Goal-Scoped Evidence Refresh

Scope: direct read-only refresh plus explicit subagent goals for the limited non-A1 Phase 0 packets. No approval packet was executed. No fetch, push, clone, dry-run push, bundle, archive, snapshot, manifest, stash, tag, release, install, plugin-cache mutation, backup operation, scheduler change, migration, delete, prune, move, or symlink change was performed.

Coordinator goal: keep the execution lane conservative, verify non-gate evidence directly, compare against adversarial subagent findings, patch only confirmed evidence drift, and preserve the next approval gate.

Subagent goals:

- Dirac the 2nd owned the read-only adversarial refresh for A2a/A3a and returned exact commands, drift assessment, and ASK-ONLY recommendations.
- Cicero the 2nd owned the read-only adversarial refresh for A5a/A6a and returned exact commands, drift assessment, and ASK-ONLY recommendations.

Commands run locally:

```bash
git -C /Users/afar/dev/fieldtheory-oss status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-oss rev-list --left-right --count HEAD...origin/main
git -C /Users/afar/dev/fieldtheory-oss tag --list
git -C /Users/afar/dev/fieldtheory-oss ls-remote --tags origin 'refs/tags/*'
node -p "require('/Users/afar/dev/fieldtheory-oss/mac-app/package.json').version"
sed -n '1,24p' /Users/afar/dev/fieldtheory-oss/mac-app/CHANGELOG.md
sed -n '1,20p' /Users/afar/dev/fieldtheory-oss/mac-app/docs/RELEASE_CHECKLIST.md
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/field-releases --json nameWithOwner,visibility,url
gh release list --repo afar1/field-releases --limit 3
curl -fsSL https://github.com/afar1/field-releases/releases/latest/download/latest-mac.yml

git -C /Users/afar/dev/fieldtheory-plugin status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-plugin rev-parse --short HEAD
git -C /Users/afar/dev/fieldtheory-plugin rev-parse HEAD
diff -qr /Users/afar/plugins/field-theory /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607
diff -qr /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418 /Users/afar/plugins/field-theory
test ! -d /Users/afar/dev/fieldtheory-plugin/plugin
ls -l /tmp/a3_dev_files.txt /tmp/a3_installed_files.txt

find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print
find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | wc -l
find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print
git -C /Users/afar/dev/fieldtheory-oss worktree list --porcelain | rg '^worktree ' | wc -l
git -C /Users/afar/dev/fieldtheory worktree list --porcelain | rg '^worktree ' | wc -l
git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain | rg '^worktree ' | wc -l
git -C /Users/afar/dev/fieldtheory-plugin worktree list --porcelain | rg '^worktree ' | wc -l
git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain | rg '^prunable' | wc -l
find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print
find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print | wc -l
git -C /Users/afar/dev/oscar status --short --branch --untracked-files=all
git -C /Users/afar/dev/old-field status --short --branch --untracked-files=all
git -C /Users/afar/dev/oscar-pr-101-preserved status --short --branch --untracked-files=all
test -d /Users/afar/dev/littleai
test -d /Users/afar/dev/fieldtheory-labs-ios-native-archive
git --git-dir=/Users/afar/dev/fieldtheory-labs.oscar-mirror.git rev-parse HEAD
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/oscar ls-remote origin refs/heads/main
git -C /Users/afar/dev/oscar rev-parse origin/main
git -C /Users/afar/dev/oscar rev-list --left-right --count HEAD...origin/main
gh api repos/afar1/oscar/compare/1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28...f81481ff9824ddb4fa252ed93933d9bc815dc930 --jq '{status: .status, ahead_by: .ahead_by, behind_by: .behind_by, total_commits: .total_commits}'

test ! -e '/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1'
test -f /Users/afar/.ft-bookmarks/twitter-bookmarks.db
test ! -L /Users/afar/.ft-bookmarks/twitter-bookmarks.db
stat -f '%N inode=%i size=%z modified=%Sm' /Users/afar/.ft-bookmarks/twitter-bookmarks.db
stat -f '%z' /Users/afar/.ft-bookmarks/twitter-bookmarks.db
```

Observed direct evidence:

- A2a: `/Users/afar/dev/fieldtheory-oss` remains on `codex/release-0.3.14-startup-library...origin/codex/release-0.3.14-startup-library [ahead 31]` with 36 dirty paths. It is still 30 commits ahead of `origin/main` and 0 behind. Package metadata is still `0.3.20`; `CHANGELOG.md` still starts at `0.1.33`; `RELEASE_CHECKLIST.md` still says `v0.1.25+maxwell`; no source tags were returned; `afar1/fieldtheory` and `afar1/field-releases` are public; the latest release/feed remains `0.3.14`.
- A3a: `/Users/afar/dev/fieldtheory-plugin` remains on `main...origin/main` at `4d7b20ae50659743802a28528a09c1fd1501a799` with dirty tracked files and untracked CI/sibling skill files. Installed plugin source and Codex cache are still byte-identical. The dev bundle still differs from installed source in `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`. The `plugin/` directory is still absent. `/tmp/a3_dev_files.txt` and `/tmp/a3_installed_files.txt` still exist.
- A5a: the Field Theory-family directory count remains 59. The preservation-sensitive target dirs remain `littleai`, `old-field`, `oscar`, and `oscar-pr-101-preserved`. Worktree counts remain `fieldtheory-oss` 11, `fieldtheory` 17, `fieldtheory-cli` 30, and `fieldtheory-plugin` 1. `fieldtheory-cli` still has 17 prunable worktree records. `/private/tmp` still has 5 `fieldtheory-cli-*` candidate dirs. `oscar`, `old-field`, and `oscar-pr-101-preserved` are still dirty or preservation-sensitive. `/Users/afar/dev/fieldtheory-labs-ios-native-archive` is still present and protected. Live GitHub `origin/main` for `oscar` is `f81481ff9824ddb4fa252ed93933d9bc815dc930`, 12 commits ahead of mirror `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`.
- A6a: `bookmarks.db?immutable=1` remains absent. `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` remains a regular non-symlink zero-byte file, modified Apr 12 14:48:42 2026.

Subagent cross-check:

- Dirac the 2nd independently found no material A2a/A3a drift and returned ASK-ONLY for both packets.
- Cicero the 2nd independently found no material A5a/A6a drift and returned ASK-ONLY for both packets.

Result:

- A2a, A3a, A5a, and A6a remain eligible to ask Andrew for their exact limited approval phrases.
- None of A2a, A3a, A5a, or A6a is approved, executed, or complete.
- A2, A3, and A5 are not complete. A6 core review-created debris remains complete because `bookmarks.db?immutable=1` is absent; only optional quarantine remains.
- A1 remains the recommended next approval gate; A4 remains not askable.
- Do not treat this as approval to create bundles, snapshots, manifests, archives, waivers, tags, releases, commits, installs, plugin-cache writes, backups, scheduler changes, deletes, prunes, moves, migrations, symlink changes, or public/private pushes.

## 2026-07-02T07:57-08:00Z: A1/A4 Gate Refresh

Scope: direct read-only A1 and A4 gate refresh plus independent evidence subagents and adversarial sequencing review. No approval packet was executed. No push, dry-run push, upstream change, clone, build, Xcode project generation, delete, prune, move, stash, tag, release, migration, backup operation, restore operation, scheduler change, bundle, snapshot, manifest, install, or plugin-cache mutation was performed.

Commands run locally for A1:

```bash
git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main
gh api 'repos/afar1/fieldtheory/git/trees/4df630b96d2c2ec30d03e353dc1364994587457f?recursive=1' --jq '[.truncated, ([.tree[].path | select(. == "ios-native" or startswith("ios-native/"))] | length)] | @tsv'
```

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` remains on `ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` remains on `codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are still `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is still `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is still `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`; `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` are still absent; both exact private Git transport checks exited `0` with no refs.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` still has no exact `refs/heads/ios-native-app`.
- Current public `origin/main` is `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Commands run locally for A4:

```bash
test -e "/Volumes/Extreme SSD"
test -w "/Volumes/Extreme SSD"
mount | rg ' on /Volumes/Extreme SSD '
diskutil info "/Volumes/Extreme SSD"
command -v restic
ls -ld "$HOME/.fieldtheory/bookmarks" "$HOME/.ft-bookmarks"
find "$HOME/.fieldtheory" "$HOME/.ft-bookmarks" -maxdepth 4 \( -iname '*restore*drill*' -o -iname '*backup*drill*' -o -iname '*restic*' \) -print
ls "$HOME/Library/LaunchAgents" | rg -i 'fieldtheory|restic|backup|waist'
launchctl print "gui/$(id -u)" | rg -i 'fieldtheory|restic|backup|waist'
crontab -l | rg -i 'fieldtheory|restic|backup|waist'
tmutil destinationinfo
readlink "$HOME/.fieldtheory/bookmarks"
```

Observed direct A4 evidence:

- `/Volumes/Extreme SSD` does not exist, is not writable, has no mount entry, and `diskutil info "/Volumes/Extreme SSD"` reports `Could not find disk`.
- `restic` is not on `PATH`.
- `~/.fieldtheory/bookmarks` is a symlink to `/Users/afar/.ft-bookmarks`.
- No restore-drill, backup-drill, or restic artifacts were found under `~/.fieldtheory` or `~/.ft-bookmarks` by the checked patterns.
- No Field Theory restic/waist backup LaunchAgent or cron evidence was found.
- The only Field Theory `launchctl` match is `com.fieldtheory.app.ShipIt`, which is updater evidence, not backup scheduler evidence.
- `tmutil destinationinfo` still knows a local Time Machine destination named `Extreme SSD`, but that is not proof that the approved A4 backup volume is mounted or that Field Theory restic backup/restore safety exists.

Subagent cross-checks:

- Fermat independently verified A1 at 2026-07-02T08:00:37Z and found the exact private target refs still absent, the older private archive ref still present, the pinned local SHAs still matching, and public `origin/main` still containing zero `ios-native` paths. Fermat's private Git transport failed because its environment lacked `credential-osxkeychain`; the coordinator shell's exact private Git transport checks succeeded with no refs.
- Nash independently verified A4 at 2026-07-02T07:59Z and found the approved backup volume absent/unavailable, `restic` missing, no backup scheduler evidence, and no restore-drill artifacts. Nash's then-current backup-disk note is superseded by Andrew's later pause: do not run A4 preflights or ask for A4 approval until Andrew explicitly resumes A4 after connecting the disk.
- Averroes adversarially reviewed the A1/A4 sequencing boundary and returned GO to keep A1 as the next approval ask, with A4 and Phase 1 still blocked.

Result:

- A1 remains eligible to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- A4a approval remains not askable. Superseded by Andrew's later pause: do not run A4 preflights or ask for A4 approval until Andrew explicitly resumes A4 after connecting the disk.
- A4b remains blocked.
- Phase 1 and later migration/extraction work remain blocked by preservation gates unless Andrew explicitly accepts those gates or uses named exact waiver language.
- If Andrew says the exact A1 phrase, rerun the A1 preflight in the same execution shell before any push.
- Do not treat this as approval to push, set upstreams, clone, build, delete, prune, move, stash, tag, publish, install, mutate plugin cache, run backups, schedule anything, create bundles or snapshots, migrate data, or call A1 complete.

## 2026-07-02T08:20Z: A1 Pre-Approval Refresh

Scope: direct read-only A1 pre-approval refresh plus independent evidence subagent and adversarial A1 review. No A1 approval packet was executed. The coordinator did not push, dry-run push, set upstreams, clone, build, generate an Xcode project, delete, prune, move, stash, tag, release, migrate, back up, restore, schedule, create bundles/snapshots/manifests, install, or mutate plugin cache.

Commands run locally for A1:

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
gh repo view afar1/fieldtheory --json visibility --jq .visibility
gh repo view afar1/fieldtheory-labs --json visibility --jq .visibility
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main
gh api 'repos/afar1/fieldtheory/git/trees/4df630b96d2c2ec30d03e353dc1364994587457f?recursive=1' --jq '[.truncated, ([.tree[].path | select(. == "ios-native" or startswith("ios-native/"))] | length)] | @tsv'
```

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` remains on `ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` remains on `codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are still `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is still `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is still `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`; `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` are still absent; both exact private Git transport checks exited `0` with no refs.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` still has no exact `refs/heads/ios-native-app`.
- Current public `origin/main` is `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Subagent cross-checks:

- Bohr the 2nd independently verified A1 and returned GO-to-ask only. Bohr found no material drift: both worktrees are clean, pinned SHAs match, private Git transport succeeds, exact private target refs are absent, the older private archive ref remains present, public `origin` lacks `ios-native-app`, and live public `origin/main` has zero `ios-native` paths. Bohr noted local `origin/main` in `/Users/afar/dev/fieldtheory` is stale at `c3d42cd2c63abeec2c16166d1667d30e8f93a64a`, which is why the live `ls-remote` plus GitHub tree API proof remains required.
- Lagrange the 2nd adversarially reviewed the current A1 request/runbook after the safety patch and returned GO-to-ask only with no blockers. Lagrange confirmed the current packet stays request-only until Andrew says the exact SHA-pinned phrase, uses same-shell preflight before any push, and limits build verification to simulator/no-code-sign.

Safety incident:

- Lagrange reported accidentally running a default `git push` from `fieldtheory-cli` during review because a shell search pattern contained literal backticks. It returned `Everything up-to-date`. The coordinator verified `fieldtheory-cli` is on `codex/ft-state-active-table`, HEAD is `c9a14820d537c1927a149d13d7211ea3727e3dbd`, upstream is `origin/codex/ft-state-active-table`, and the remote branch resolves to the same SHA. No A1 repo push, clone, build, file edit, or approval packet execution occurred.

Result:

- A1 remains eligible to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- If Andrew says the exact A1 phrase, rerun the A1 preflight in the same execution shell before any push.
- A4 and Phase 1+ remain blocked as previously recorded.
- Do not treat this as approval to push, set upstreams, clone, build, delete, prune, move, stash, tag, publish, install, mutate plugin cache, run backups, schedule anything, create bundles or snapshots, migrate data, or call A1 complete.

## 2026-07-02T09:21-09:25Z: A4 Blocker Recheck And Packet Guardrail Review

Scope: direct read-only A4 preflight refresh plus independent A4 evidence subagent and adversarial packet review. No approval packet was executed. No push, dry-run push, upstream change, clone, build, Xcode project generation, delete, prune, move, stash, tag, release, migration, backup operation, restore operation, scheduler change, bundle, snapshot, manifest, install, mount, config write, or plugin-cache mutation was performed.

Coordinator goal: refresh the safe Phase 0 gate state without executing any approval packet, confirm whether A4 moved from blocked to askable, and patch only confirmed documentation guardrail drift.

A4 evidence subagent goal: check whether the approved backup volume, `restic`, scheduler evidence, or restore-drill artifacts changed enough to make A4a askable.

Adversarial subagent goal: challenge the current Phase 0 docs for stale evidence, accidental approval wording, missing stop conditions, and weak completion evidence.

Observed direct A4 evidence:

- `/Volumes/Extreme SSD` does not exist; `ls` reports `No such file or directory`.
- `mount` has no `Extreme SSD`, Field Theory backup, or restic match.
- `diskutil info "/Volumes/Extreme SSD"` reports `Could not find disk: /Volumes/Extreme SSD`.
- `restic` is not on `PATH`.
- `launchctl list` matches only `com.apple.SecureBackupDaemon` and `com.fieldtheory.app.ShipIt`; the latter is Field Theory app updater evidence, not backup scheduler evidence.
- `crontab` has no Field Theory, restic, backup, or waist match.
- No matching Field Theory/restic/backup/waist LaunchAgent or LaunchDaemon file was found in the checked directories.
- No restore-drill, backup-drill, or restic artifact was found under `~/.fieldtheory` or `~/.ft-bookmarks` by the checked patterns.

Subagent cross-checks:

- Socrates the 2nd independently verified A4 at `2026-07-02T09:21:51Z` and returned STILL-BLOCKED. It found the approved volume absent/unmounted/unwritable, `restic` not found, no scheduler evidence, no restore-drill artifacts, and Time Machine's remembered `Extreme SSD` destination still not proof of an A4 restic backup target.
- Galileo the 2nd adversarially reviewed the current Phase 0 packet docs and returned OK to continue A1-first/A4-blocked sequencing. Galileo found guardrail gaps outside A1/A4 sequencing; those were patched: A6a's runbook template now checks the full approved `stat -f '%i %z %m %HT'` tuple, A2a now records the exact dirty-set hash and file list, A5a completion evidence now refers to all denied operations, and the packet/request wording now requires same-shell preflight immediately before use.

A2a dirty-set proof added:

- The 2026-07-02T09:25Z `git status --porcelain --untracked-files=all` output in `/Users/afar/dev/fieldtheory-oss` has SHA-256 `945b0d110de6ed044b64ce21ef56e07c1c6da1976c6f99690b581bd321aec484`.
- The exact file list is recorded in `docs/A2A_APPROVAL_REQUEST.md`; a dirty path count alone is no longer sufficient proof that A2a still matches.

Result:

- A4a remains not askable.
- A4b remains blocked.
- A1 remains the recommended next approval ask.
- A2a/A3a/A5a/A6a remain limited request packets only, not approved, not executed, and not act completion.
- Phase 1+ remains blocked unless A1 and A4 pass and remaining Phase 0 gaps are explicitly accepted by Andrew or waived with named exact waiver language.
- Do not treat this as approval to push, set upstreams, clone, build, delete, prune, move, stash, tag, publish, install, mutate plugin cache, run backups, schedule anything, create bundles or snapshots, migrate data, or call any Phase 0 act complete.

## 2026-07-02T08:27Z: A2a Mac App Preservation Refresh

Scope: direct read-only A2a preflight refresh plus independent evidence subagent and adversarial A2a review. No approval packet was executed. No fetch, push, dry-run push, clone, build, bundle, archive, snapshot, manifest, stash, commit, branch switch, tag, release publication, install, cleanup, migration, backup operation, restore operation, scheduler change, or plugin-cache mutation was performed.

Commands run locally for A2a:

```bash
date -u +%Y-%m-%dT%H:%M:%SZ
git -C /Users/afar/dev/fieldtheory-oss status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-oss rev-parse HEAD
git -C /Users/afar/dev/fieldtheory-oss branch --show-current
git -C /Users/afar/dev/fieldtheory-oss rev-parse --abbrev-ref --symbolic-full-name '@{u}'
git -C /Users/afar/dev/fieldtheory-oss rev-parse '@{u}'
git -C /Users/afar/dev/fieldtheory-oss rev-parse refs/remotes/origin/main
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-oss ls-remote origin refs/heads/main
git -C /Users/afar/dev/fieldtheory-oss rev-list --left-right --count HEAD...origin/main
git -C /Users/afar/dev/fieldtheory-oss rev-list --left-right --count HEAD...'@{u}'
git -C /Users/afar/dev/fieldtheory-oss status --porcelain --untracked-files=all
git -C /Users/afar/dev/fieldtheory-oss remote get-url --push origin
gh repo view afar1/fieldtheory --json visibility --jq .visibility
gh repo view afar1/field-releases --json visibility --jq .visibility
node -p "require('/Users/afar/dev/fieldtheory-oss/mac-app/package.json').version"
sed -n '1,8p' /Users/afar/dev/fieldtheory-oss/mac-app/CHANGELOG.md
sed -n '1,12p' /Users/afar/dev/fieldtheory-oss/mac-app/docs/RELEASE_CHECKLIST.md
git -C /Users/afar/dev/fieldtheory-oss tag --list
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-oss ls-remote --tags origin 'refs/tags/*'
gh release list --repo afar1/field-releases --limit 3
curl -fsSL https://github.com/afar1/field-releases/releases/latest/download/latest-mac.yml
```

Observed direct A2a evidence:

- `/Users/afar/dev/fieldtheory-oss` remains on `codex/release-0.3.14-startup-library...origin/codex/release-0.3.14-startup-library [ahead 31]`.
- Local HEAD is `0c560c32e7ed2a702cbaa1d2127768ce2fd2c7da`.
- Upstream `origin/codex/release-0.3.14-startup-library` is `7ba1cd4b77bfddc6282a48d056fb7f1c5427325f`.
- Local and live `origin/main` are both `4df630b96d2c2ec30d03e353dc1364994587457f`.
- The branch is 30 commits ahead of `origin/main` and 31 commits ahead of its upstream release branch, with 0 behind in both comparisons.
- The worktree has 36 dirty paths: 28 modified tracked paths and 8 Git-visible untracked paths.
- `origin` push URL is `https://github.com/afar1/fieldtheory.git`.
- `afar1/fieldtheory` and `afar1/field-releases` both report `PUBLIC`.
- `mac-app/package.json` says `0.3.20`.
- `mac-app/CHANGELOG.md` still starts at `0.1.33`.
- `mac-app/docs/RELEASE_CHECKLIST.md` still says `v0.1.25+maxwell`.
- Local source tags and live source repo tags are absent.
- Latest release in `afar1/field-releases` is `v0.3.14`.
- `latest-mac.yml` is reachable and says `version: 0.3.14`.

Subagent cross-checks:

- Schrodinger the 2nd independently verified A2a and returned ASK-ONLY with no material drift and no stop conditions. It found 36 dirty status entries, 28 modified tracked paths, 8 Git-visible untracked paths, 0 staged paths, package `0.3.20`, changelog `0.1.33`, release checklist `v0.1.25+maxwell`, no source tags, and latest release/feed `0.3.14`.
- Herschel the 2nd adversarially reviewed the A2a request scope and returned GO-to-ask only with no initial blockers. Herschel found A2a consistently framed as ask-only and not approval. Herschel's concerns were patched: the A2a bundle now lives inside a timestamped snapshot folder that cannot already exist, the bundle path also has a no-overwrite guard, and the packet/request clarify that ignored files are intentionally excluded from the Git-visible untracked archive.

Result:

- A2a remains eligible to ask Andrew for the exact limited approval phrase `approve A2a create mac-app preservation bundle and dirty-tree snapshot`.
- A2a is not approved, not executed, and not complete.
- A2 is not complete.
- A2b public-release review and A2c final public release push remain blocked.
- Do not treat this as approval to create bundles, snapshots, manifests, archives, stashes, commits, tags, releases, public-review artifacts, pushes, installs, plugin-cache writes, backups, scheduler changes, deletes, prunes, moves, migrations, symlink changes, or to call A2a or A2 complete.

## 2026-07-02T09:15Z: A1 Goal-Orchestrated Recheck

Scope: direct read-only A1 preflight refresh plus explicit coordinator, evidence subagent, and adversarial reviewer goals. No A1 approval packet was executed. No push, dry-run push, upstream change, clone, build, Xcode project generation, delete, prune, move, stash, tag, release, migration, backup operation, restore operation, scheduler change, bundle, snapshot, manifest, install, or plugin-cache mutation was performed.

Coordinator goal: preserve code and data first, keep A1 as an ask-only packet unless Andrew says the exact SHA-pinned phrase, and integrate subagent findings only after direct command verification.

Evidence subagent goal: refresh A1 source-of-truth facts read-only and classify the packet as GO-to-ask, drifted, or blocked.

Adversarial subagent goal: challenge current act goals and approval packets for stale evidence, accidental approval wording, unsafe sequencing, and missing verification gates.

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is exactly `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is exactly `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- The exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` returned no rows with exit `0`, so they remain absent.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` still has no exact `refs/heads/ios-native-app`.
- Current public `origin/main` is `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Subagent cross-checks:

- Carver the 2nd independently verified A1 and returned GO-to-ask only, with no mismatch against the SHA-pinned approval phrase.
- Epicurus the 2nd adversarially reviewed the packet set and returned OK to continue asking for A1 approval. Epicurus found guardrail gaps in A1/A2a/A5a/A6a packet templates; those gaps were patched in the coordination docs before this closeout.

Result:

- A1 remains eligible to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- If Andrew says the exact A1 phrase, rerun the A1 preflight in the same execution shell before any push.
- A4 and Phase 1+ remain blocked as previously recorded.
- Do not treat this as approval to push, set upstreams, clone, build, delete, prune, move, stash, tag, publish, install, mutate plugin cache, run backups, schedule anything, create bundles or snapshots, migrate data, or call A1 complete.

## 2026-07-02T09:38Z: Phase 0 Packet Guardrail Normalization

Scope: documentation guardrail normalization after adversarial review. No approval packet was executed. No push, dry-run push, upstream change, clone, build, Xcode project generation, delete, prune, move, stash, tag, release, migration, backup operation, restore operation, scheduler change, bundle, snapshot, manifest, install, or plugin-cache mutation was performed.

Coordinator goal: keep Phase 0 ask-only until Andrew says an exact packet phrase, preserve code and data before any act execution, and make every risky packet depend on a same-shell read-only preflight immediately before use.

Adversarial subagent goal: review the patched packet docs for stale evidence, accidental approval wording, missing same-shell preflights, insufficient stop conditions, and unsafe sequencing.

Changes recorded:

- `docs/PHASE0_APPROVAL_PACKETS.md` now gives A4a, A4b, A2a, A2b, A2c, A3a, A5a, and A6a explicit same-shell preflight requirements before use.
- A4a central packet wording no longer lets the generic A4a approval phrase install `restic`; missing `restic` stops the packet unless one-time approval text explicitly names installing `restic` after mounted-volume preflight passes.
- A2a central docs and runbook now pin the 09:25Z dirty-set SHA-256 `945b0d110de6ed044b64ce21ef56e07c1c6da1976c6f99690b581bd321aec484`; dirty path count alone is not enough proof.
- A3a, A5a, and A6a request docs now state that Andrew must say the exact phrase, that nearby wording or the file itself is not approval, and list packet-specific stop conditions.

Validation:

- `git status --porcelain --untracked-files=all | shasum -a 256` in `/Users/afar/dev/fieldtheory-oss` still returned `945b0d110de6ed044b64ce21ef56e07c1c6da1976c6f99690b581bd321aec484`.
- `rg -n '[[:blank:]]$'` across the touched guardrail docs returned no matches.
- A clean `rg` check found the expected same-shell, exact-phrase, stop-condition, `restic`, and dirty-set-hash text in the touched docs.

Subagent review:

- Newton the 2nd first returned "Not OK until patched" and found four guardrail issues: A4a still looked able to install `restic` from a generic phrase, A2a central docs lacked the 09:25Z dirty-set hash, A3a/A5a/A6a request docs lacked explicit exact-phrase/stop-condition warnings, and several central allowed-operation lists lacked first same-shell preflight bullets.
- After the patches, Newton the 2nd returned OK to report progress and confirmed A4a, A4b, A2b, and A2c central allowed-operation lists now require same-shell preflight immediately before use with stop-on-drift language.

Result:

- No Phase 0 approval packet is approved, executed, or complete from this work.
- A1 remains the recommended next approval ask if Andrew wants to proceed with a mutating packet.
- A4a remains not askable until the approved backup volume is mounted, writable, and verified by mount/disk metadata.
- A2a/A3a/A5a/A6a remain limited request packets only, not approved, not executed, and not act completion.
- Phase 1+ remains blocked unless A1 and A4 pass and remaining Phase 0 gaps are explicitly accepted by Andrew or waived with named exact waiver language.
- Do not treat this as approval to push, set upstreams, clone, build, delete, prune, move, stash, tag, publish, install, mutate plugin cache, run backups, schedule anything, create bundles or snapshots, migrate data, or call any Phase 0 act complete.

## 2026-07-02T09:42Z: A1 SHA-Pinned Preflight Refresh

Scope: direct read-only A1 preflight refresh with one independent evidence subagent and one adversarial reviewer. No A1 approval packet was executed. No push, dry-run push, upstream change, clone, build, Xcode project generation, delete, prune, move, stash, tag, release, migration, backup operation, restore operation, scheduler change, bundle, snapshot, manifest, install, or plugin-cache mutation was performed.

Coordinator goal: keep A1 request-only until Andrew says the exact SHA-pinned phrase, preserve the stranded iOS app on the private labs remote before later iOS extraction, and treat subagent output as leads until direct command output confirms it.

Evidence subagent goal: independently verify current A1 facts read-only and classify A1 as GO-to-ask-only, drifted, or blocked.

Adversarial subagent goal: attack the A1 request and Phase 0 docs for accidental authorization, stale evidence, unsafe command shape, missing stop conditions, or overclaiming.

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is exactly `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is exactly `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- The exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` returned no rows with exit `0`, so they remain absent.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` still has no exact `refs/heads/ios-native-app`.
- Current public `origin/main` is `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Subagent cross-checks:

- Faraday the 2nd independently verified A1 read-only and returned GO-to-ask-only. Faraday found no blocking drift and confirmed the pinned phrase still matches the local source SHAs.
- Kepler the 2nd adversarially reviewed the current A1 boundary and returned OK to report A1 as askable only, not approved, not executed, and not complete.

Result:

- A1 remains eligible to ask Andrew for the exact SHA-pinned approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- If Andrew says the exact A1 phrase, rerun the A1 preflight in the same execution shell before any push.
- A4 and Phase 1+ remain blocked as previously recorded.
- Do not treat this as approval to push, set upstreams, clone, build, delete, prune, move, stash, tag, publish, install, mutate plugin cache, run backups, schedule anything, create bundles or snapshots, migrate data, or call A1 complete.

## 2026-07-02T09:48Z: A4 Backup Gate Refresh

Scope: direct read-only A4a/A4b preflight refresh with one independent evidence subagent and one adversarial reviewer. No approval packet was executed. No install, backup, restore, scheduler change, file write, deletion, migration, config write, volume mount, drill file creation, symlink change, bundle, snapshot, manifest, push, clone, build, or plugin-cache mutation was performed.

Coordinator goal: refresh the backup safety gate before any waist, bookmark, or sync migration work and keep A4 not askable unless the approved volume is mounted, writable, and verified by mount/disk metadata.

Evidence subagent goal: independently verify whether A4a is askable, not askable, or drifted, and whether A4b remains blocked.

Adversarial subagent goal: attack the A4 approval boundary for accidental authorization, stale evidence, unsafe command shape, missing stop conditions, overclaiming, or backup/restore drill hazards.

Observed direct A4 evidence:

- `~/.fieldtheory` exists.
- `~/.fieldtheory/bookmarks` is a symlink to `/Users/afar/.ft-bookmarks`.
- `/Users/afar/.ft-bookmarks` exists.
- `/Volumes/Extreme SSD` does not exist, is not writable, has no matching mount row, and `diskutil info "/Volumes/Extreme SSD"` returned `Could not find disk: /Volumes/Extreme SSD`.
- Time Machine still knows a local `Extreme SSD` destination with ID `B41B6D8B-AFBC-4B54-A0FA-1EC83CAC71B6`, but that is not mounted-volume proof for A4.
- `restic` is not on `PATH`.
- `launchctl list` matches only `com.apple.SecureBackupDaemon` and `com.fieldtheory.app.ShipIt`; the latter is Field Theory app updater evidence, not backup scheduler evidence.
- `crontab` has no Field Theory, restic, or backup match.
- No restore-drill paths or restore-drill file heads were found under `~/.fieldtheory` or `/Users/afar/.ft-bookmarks` by the checked patterns.
- Root sizes are still about `617M` for `~/.fieldtheory` and `54G` for `~/.ft-bookmarks`.
- `df -h "/Volumes/Extreme SSD"` returned no such file.
- `~/.fieldtheory/backup-drill/restore-drill-artifact.txt` does not exist.

Subagent cross-checks:

- Pascal the 2nd independently verified A4 read-only. Pascal returned A4a DRIFTED / not askable as written and A4b blocked, and flagged a scope ambiguity: source-plan shorthand "all of `~/.fieldtheory`" must not let the backup skip the real bookmark store at `/Users/afar/.ft-bookmarks`.
- Goodall the 2nd adversarially reviewed the current A4 boundary and returned OK to report A4a as not askable and A4b as blocked. Goodall found no accidental authorization in the reviewed A4 docs.

Documentation hardening:

- `docs/PRESERVATION_GATES.md`, `docs/PHASE0_APPROVAL_PACKETS.md`, `docs/ECOSYSTEM_EXECUTION_STATUS.md`, and `docs/PHASE0_COMPLETION_AUDIT.md` now make explicit that operational A4 scope means both `~/.fieldtheory` and the real bookmark store at `~/.ft-bookmarks`.

Result:

- A4a remains not askable.
- A4b remains blocked.
- Superseded by Andrew's later pause: disk connection or mount presence alone is not permission to rerun A4a preflight or ask for any A4a approval phrase; wait until Andrew explicitly resumes A4 after connecting the disk.
- Missing `restic` remains a separate stop condition unless one-time approval text explicitly names installing `restic` after mounted-volume preflight passes.
- Phase 1+ remains blocked unless A1 and A4 pass and remaining Phase 0 gaps are explicitly accepted by Andrew or waived with named exact waiver language.
- Do not treat this as approval to install `restic`, initialize a backup repository, write config/password files, create drill files, run a backup, restore files, schedule anything, delete, move, change symlinks, run migrations, create bundles or snapshots, push, clone, build, mutate plugin cache, or call A4 complete.

## 2026-07-02T09:56Z: A2a/A3a Preservation Packet Refresh

Scope: direct read-only A2a/A3a preflight refresh with one independent evidence subagent and one adversarial reviewer. No approval packet was executed. No bundle, archive, snapshot folder, manifest, stash, commit, branch switch, tag, push, release publication, install, plugin-cache mutation, backup operation, restore operation, scheduler change, migration, delete, prune, move, or scratch-file cleanup was performed.

Coordinator goal: refresh the ask-only preservation packets that can be safely checked while A1 waits for the exact approval phrase and A4 remains user-paused until Andrew explicitly resumes it after connecting a backup disk.

A2a evidence subgoal: verify the dirty mac app release train still matches the documented preservation packet, especially branch, HEAD, upstream, dirty-set hash, release metadata, source tag state, and latest release/feed evidence.

A3a evidence subgoal: verify the installed plugin source and Codex cache are still byte-identical, record dev-repo drift precisely, and keep installed/cache preservation separate from commit/install/cache-mutation work.

Adversarial subagent goal: attack A2a/A3a request boundaries for accidental stash, commit, branch switch, tag, push, release publication, install/cache mutation, cleanup, deletion, full act completion, overwrite risk, stale evidence, or weak stop conditions.

Observed direct A2a evidence:

- `/Users/afar/dev/fieldtheory-oss` remains on `codex/release-0.3.14-startup-library...origin/codex/release-0.3.14-startup-library [ahead 31]`.
- Local HEAD is `0c560c32e7ed2a702cbaa1d2127768ce2fd2c7da`.
- Upstream `origin/codex/release-0.3.14-startup-library` resolves locally to `7ba1cd4b77bfddc6282a48d056fb7f1c5427325f`.
- Local and live `origin/main` both resolve to `4df630b96d2c2ec30d03e353dc1364994587457f`.
- The branch is 30 commits ahead of `origin/main` and 31 commits ahead of its upstream release branch, with 0 behind in both comparisons.
- The worktree has 36 dirty paths: 28 modified tracked paths and 8 Git-visible untracked paths.
- The `git status --porcelain --untracked-files=all` output still has SHA-256 `945b0d110de6ed044b64ce21ef56e07c1c6da1976c6f99690b581bd321aec484`.
- `origin` push URL is `https://github.com/afar1/fieldtheory.git`.
- `afar1/fieldtheory` and `afar1/field-releases` both report `PUBLIC`.
- `mac-app/package.json` says `0.3.20`.
- `mac-app/CHANGELOG.md` still starts at `0.1.33`.
- `mac-app/docs/RELEASE_CHECKLIST.md` still says `v0.1.25+maxwell`.
- Local source tags and live source repo tags are absent.
- Latest release in `afar1/field-releases` is `v0.3.14`.
- `latest-mac.yml` is reachable and says `version: 0.3.14`.

Observed direct A3a evidence:

- `/Users/afar/dev/fieldtheory-plugin` remains on `main...origin/main` at `4d7b20ae50659743802a28528a09c1fd1501a799`.
- The plugin repo has 7 tracked modified files and 12 Git-visible untracked files.
- The plugin repo `git status --porcelain --untracked-files=all` output has SHA-256 `39c3d661ab278fa7c597f092f3f850738334315e78ce8d7f507435838158dc76`.
- Installed plugin source exists at `/Users/afar/plugins/field-theory`.
- Codex plugin cache source exists at `/Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607`.
- Installed source and Codex cache are byte-identical by `diff -qr`.
- The dev bundle differs from installed source only in `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`.
- `/Users/afar/dev/fieldtheory-plugin/plugin` remains absent.
- Installed source and Codex cache both include sibling `skills/*/agents/openai.yaml` files for `bookmarks`, `browser-library`, `current-document`, `fieldtheory`, `library`, and `workflow`.
- `/private/tmp/a3_dev_files.txt` and `/private/tmp/a3_installed_files.txt` still exist.

Subagent cross-checks:

- Raman the 2nd independently verified A2a/A3a read-only. Raman returned A2a ASK-ONLY with matching dirty-set hash and no meaningful drift. Raman returned A3a DRIFTED relative to the source-plan deployed/dev byte-identity premise, while confirming installed source and Codex cache remain byte-identical.
- Turing the 2nd adversarially reviewed the A2a/A3a boundaries. Turing found A2a OK, and found that A3a's stop gate did not fully bind plugin dev-repo branch, upstream, HEAD, dirty status, and untracked follow-on file set. After the patch, Turing returned OK to report progress.

Documentation hardening:

- `docs/A3A_APPROVAL_REQUEST.md` and `docs/PHASE0_APPROVAL_PACKETS.md` now require A3a to stop if plugin dev-repo branch, upstream, HEAD, dirty status, untracked file set, or status hash changes from the recorded evidence.
- `docs/PHASE0_PREFLIGHT_CHECKLIST.md` now computes A2a and A3a status hashes directly.

Result:

- A2a remains eligible to ask Andrew for the exact limited approval phrase `approve A2a create mac-app preservation bundle and dirty-tree snapshot`.
- A2a is not approved, not executed, and not complete.
- A3a remains eligible to ask Andrew for the exact limited approval phrase `approve A3a plugin installed-state snapshot`, but only as installed/cache preservation with the dev-repo drift explicitly named.
- A3a is not approved, not executed, and not complete.
- A2 and A3 are not complete.
- Do not treat this as approval to create bundles, snapshots, manifests, archives, stashes, commits, tags, releases, public-review artifacts, pushes, installs, plugin-cache writes, backups, scheduler changes, deletes, prunes, moves, migrations, symlink changes, scratch-file cleanup, or to call A2a, A3a, A2, or A3 complete.

## 2026-07-02T10:13Z: A5a/A6a Manifest And Quarantine Packet Refresh

Scope: direct read-only A5a/A6a preflight refresh with one independent evidence subagent and one adversarial reviewer. No approval packet was executed. No manifest, quarantine directory, archive, bundle, snapshot, waiver, stash, commit, clone, build, project generation, install, backup operation, restore operation, scheduler change, migration, delete, prune, move, tag, push, release publication, or plugin-cache mutation was performed.

Coordinator goal: refresh the ask-only cleanup/debris packets that can be safely checked while A1 waits for the exact approval phrase and A4 remains user-paused until Andrew explicitly resumes it after connecting a backup disk.

A5a evidence subgoal: verify the cleanup-manifest packet still matches current directory, worktree, tmp-dir, Oscar, mirror, and protected-archive evidence without creating a manifest or cleanup artifact.

A6a evidence subgoal: verify the optional quarantine packet still targets the same zero-byte regular file and that the accidental `bookmarks.db?immutable=1` debris remains absent.

Adversarial subagent goal: attack A5a/A6a request boundaries for accidental loose approval, stale evidence, thin completion criteria, deletion, prune, move, archive, bundle, backup, restore, commit, push, migration, plugin-cache mutation, or Phase 0 completion.

Observed direct A5a evidence:

- `/Users/afar/dev` still has 59 Field Theory-family directories by the current review pattern.
- The exact target-sensitive directories remain `/Users/afar/dev/littleai`, `/Users/afar/dev/old-field`, `/Users/afar/dev/oscar`, and `/Users/afar/dev/oscar-pr-101-preserved`.
- Worktree records across target repos still total 59: `fieldtheory-oss` 11, `fieldtheory` 17, `fieldtheory-cli` 30, and `fieldtheory-plugin` 1.
- `fieldtheory-cli` still has 17 prunable `/private/tmp/fieldtheory-cli-*` worktree records.
- `/private/tmp` still has 5 existing `fieldtheory-cli-*` directories.
- `/Users/afar/dev/oscar` remains on `main...origin/main [behind 4]` at `615d081171a4d2d6df5ed1d790c4f13a58a11618` with the same untracked plan/log/model files.
- Stale local `oscar` `origin/main` remains `2448e3d2f9460b867a5e3aa8c08f2df978840e3d`.
- Live GitHub `oscar` `origin/main` remains `f81481ff9824ddb4fa252ed93933d9bc815dc930`.
- `/Users/afar/dev/fieldtheory-labs.oscar-mirror.git` remains at `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`.
- GitHub compare for mirror to live `origin/main` returns `status=ahead`, `ahead_by=12`, `behind_by=0`, and `total_commits=12`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` is still present.

Observed direct A6a evidence:

- `/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1` remains absent.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` exists.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` is a regular file and not a symlink.
- `stat -f '%N inode=%i size=%z modified=%Sm'` reports inode `70248019`, size `0`, and modified time `Apr 12 14:48:42 2026`.
- `stat -f '%i %z %m %HT'` reports exact tuple `70248019 0 1776019722 Regular File`.
- `ls -lO` reports `-rw-r--r--@ 1 afar staff - 0 Apr 12 14:48 /Users/afar/.ft-bookmarks/twitter-bookmarks.db`.

Subagent cross-checks:

- Sartre the 2nd independently verified A5a/A6a read-only. Sartre returned A5a `ASK-ONLY` with matching directory, worktree, tmp, Oscar, mirror, and protected-archive evidence. Sartre returned A6a `ASK-ONLY` with matching absent-debris and target-file identity evidence.
- Heisenberg the 2nd adversarially reviewed the A5a/A6a boundaries and returned NO-GO until three guardrails were patched: global approval language needed exact listed approval phrases, A5a checklist completion was too thin without full candidate evidence and no-denied-operation proof, and A6a checklist preflight needed to pin the exact stat tuple rather than any zero-byte regular file. After the patch, Heisenberg returned GO/OK and found no new accidental authorization.

Documentation hardening:

- `docs/PHASE0_APPROVAL_PACKETS.md` now requires the exact listed approval phrase for each packet and rejects nearby wording or shorthand.
- `docs/PHASE0_PREFLIGHT_CHECKLIST.md` now says A5a may be called complete only when the manifest exists, every fresh-preflight candidate has current evidence plus a future preservation decision path, and no denied operation occurred.
- `docs/PHASE0_PREFLIGHT_CHECKLIST.md` now checks and requires the exact A6a `stat -f '%i %z %m %HT'` tuple `70248019 0 1776019722 Regular File`.

Result:

- A5a remains eligible to ask Andrew for the exact limited approval phrase `approve A5a cleanup manifest only`.
- A5a is not approved, not executed, and not complete.
- A6a remains eligible to ask Andrew for the exact limited approval phrase `approve A6a review-debris quarantine`.
- A6a is not approved, not executed, and not complete.
- A5 and Phase 0 are not complete.
- Do not treat this as approval to create manifests, quarantine directories, archives, bundles, snapshots, waivers, stashes, commits, tags, releases, pushes, installs, plugin-cache writes, backups, scheduler changes, deletes, prunes, moves, migrations, symlink changes, or to call A5a, A6a, A5, or Phase 0 complete.

## 2026-07-02T10:23Z: A1 Public-Boundary Preflight Refresh

Scope: direct read-only A1 preflight refresh with one independent evidence subagent and one adversarial reviewer. No approval packet was executed. No push, dry-run push, clone, build, project generation, upstream change, repo file deletion, stash, commit, archive, bundle, snapshot, extraction, signing, install, backup operation, restore operation, scheduler change, migration, tag, release publication, or plugin-cache mutation was performed.

Coordinator goal: refresh the recommended A1 approval gate from current private/public Git evidence while A1 waits for Andrew's exact approval phrase.

A1 evidence subgoal: verify the local branch SHAs, clean worktree status, private `labs` remote, private target ref absence, historical private ref, public exact target ref absence, and public `origin/main` leak check.

Adversarial subagent goal: attack the A1 request for loose approval, stale public/private boundary assumptions, pre-existing target refs, clone/build/generation before approval, or completion overclaims.

Observed direct A1 evidence:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` remains `56fab3bf8192826fa9558392927b27cada070af1`, matching the pinned approval phrase.
- Local `codex/archive-ios-native-20260614` remains `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`, matching the pinned approval phrase.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- Private `labs` exact target ref `refs/heads/codex/archive-ios-native-20260614` returned no rows with exit `0`.
- Private `labs` exact target ref `refs/heads/ios-native-app` returned no rows with exit `0`.
- Historical private ref `refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app` remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` exact target ref `refs/heads/codex/archive-ios-native-20260614` returned no rows with exit `0`.
- Public `origin` exact target ref `refs/heads/ios-native-app` returned no rows with exit `0`.
- Current public `origin/main` remains `4df630b96d2c2ec30d03e353dc1364994587457f`.
- GitHub's tree API for current public `origin/main` reports `truncated=false` and zero `ios-native` paths.

Subagent cross-checks:

- Confucius the 2nd independently verified A1 read-only and returned GO-TO-ASK. Confucius found no evidence drift against the A1 docs: both worktrees clean, pinned SHAs match, private Git transport works, exact private target refs absent, historical private ref present, public `origin` lacks `ios-native-app`, and public `origin/main` has zero `ios-native` paths.
- Anscombe the 2nd adversarially reviewed the A1 boundary and returned NO-GO until the public-origin preflight checked both exact A1 target names, not only `refs/heads/ios-native-app`. After the patch, Anscombe returned GO/OK and found no new accidental authorization.

Documentation hardening:

- `docs/PHASE0_PREFLIGHT_CHECKLIST.md` now checks public `origin` for both exact A1 target refs: `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app`.
- `docs/A1_APPROVAL_REQUEST.md`, `docs/ECOSYSTEM_EXECUTION_STATUS.md`, and `docs/PHASE0_COMPLETION_AUDIT.md` now summarize A1's public-boundary evidence as both exact public target refs absent.

Result:

- A1 remains eligible to ask Andrew for the exact limited approval phrase `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.
- A1 is not approved, not executed, and not complete.
- Do not treat this as approval to push, dry-run push, clone, build, generate projects, set upstreams, delete, move, stash, commit, create bundles, create snapshots, extract iOS, sign, install, back up, restore, schedule, migrate, tag, publish, mutate plugin cache, or call A1 or Phase 0 complete.
