# Field Theory A1 Candidate Approval Request

Status: request text only, with current coordinator-shell evidence revalidated at 2026-07-02T13:22Z. This file is not approval and does not authorize execution.

## Coordinator Goal

Preserve the iOS native app branches on the private `afar1/fieldtheory-labs` remote before any later iOS extraction or distribution work.

Verification condition: A1 may be called complete only after both private refs exist at the pinned SHAs, both fetched private remote-tracking refs resolve to those SHAs, both local branches track the private upstream, a fresh private clone contains `ios-native/`, and the fresh clone builds. If the fresh private clone does not build, A1 remains partial or blocked unless Andrew says the exact phrase `waive A1 fresh-clone build gate after recorded blocker`; without that exact waiver phrase, do not call A1 complete and do not use A1 to unblock E1/E2 or Phase 1+.

## Subagent Goals

- Evidence subagent: independently verify the A1 facts read-only, including local SHAs, private target, absent target refs, public leak checks, and drift from the prior preflight.
- Adversarial subagent: attack this request and the Phase 0 docs for accidental authorization, stale evidence, destructive command shape, or overclaiming.

Subagent results are leads, not proof. Direct command output and current files remain the authority.

## Exact Approval Phrase

Andrew must say this exact phrase before the A1 packet can run:

```text
approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1
```

Do not treat nearby wording, summaries, or this file as approval.

## Current Read-Only Evidence

Current evidence as of the 2026-07-02T13:22Z coordinator-shell refresh:

- `/Users/afar/dev/fieldtheory` reports `## ios-native-app...origin/ios-native-app [gone]`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `## codex/archive-ios-native-20260614...main [ahead 1]`.
- Both `labs` push URLs are `https://github.com/afar1/fieldtheory-labs.git`.
- Local `ios-native-app` is `56fab3bf8192826fa9558392927b27cada070af1`.
- Local `codex/archive-ios-native-20260614` is `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` reports `PUBLIC`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- Exact private target refs `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app` are absent.
- The older private historical archive ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Public `origin` has no exact A1 target refs: neither `refs/heads/codex/archive-ios-native-20260614` nor `refs/heads/ios-native-app`.
- Current public `origin/main` is `4df630b96d2c2ec30d03e353dc1364994587457f`; GitHub's tree API reports `truncated=false` and zero `ios-native` paths.

Subagent note:

- Laplace confirmed the same branch, repo visibility, API, and public leak facts, but its private `git ls-remote labs ...` check hit a credential-helper error in the subagent environment.
- The coordinator shell reran the exact private `git ls-remote` checks with `GIT_TERMINAL_PROMPT=0`; both exact private target checks exited 0 with no refs, and the historical private ref resolved to `56fab3bf8192826fa9558392927b27cada070af1`.
- Treat future private Git auth failure in the execution shell as a stop condition. Do not substitute GitHub API evidence for the private Git transport check when executing A1.
- Euler adversarially reviewed the current approval queue and returned GO to ask for A1 first: A1 removes the highest-severity iOS existence risk, A4 is not askable, and A2a/A3a/A5a/A6a first would be less aligned even if lower risk.
- Banach independently verified the 2026-07-02T07:21-07:24Z refresh and returned GO-to-ask only. Its report does not approve A1, execute A1, or make A1 complete.
- Fermat independently verified the 2026-07-02T07:57-08:00Z refresh and found the exact private target refs still absent, the older private archive ref still present, the pinned local SHAs still matching, and the current public `origin/main` tree still containing zero `ios-native` paths. Fermat's report does not approve A1, execute A1, or make A1 complete.
- Kant adversarially reviewed the refreshed A1/A4 sequencing and returned GO to patch the ledger and keep A1 as the only recommended next gate, with A4 and Phase 1 still blocked.
- Averroes adversarially reviewed the current A1/A4 sequencing boundary and returned GO to keep A1 as the next approval ask, with A4 and Phase 1 still blocked.
- Bohr the 2nd independently verified the 2026-07-02T08:20Z refresh and found A1 remains GO-to-ask only: exact private target refs are absent, pinned local SHAs match, private Git transport works, public `origin/main` remains non-truncated with zero `ios-native` paths, and no stop condition is hit. Bohr's report does not approve A1, execute A1, or make A1 complete.
- Lagrange the 2nd adversarially reviewed the post-safety-patch A1 request and returned GO-to-ask only with no blockers. Lagrange reported an accidental default `git push` from `fieldtheory-cli`; it returned `Everything up-to-date`, and the coordinator verified `fieldtheory-cli` HEAD, upstream, and remote branch all equal `c9a14820d537c1927a149d13d7211ea3727e3dbd`. No A1 repo push, clone, build, or file edit occurred.
- Carver the 2nd independently verified the 2026-07-02T09:15Z refresh and returned GO-to-ask only. Carver found no mismatch against the SHA-pinned approval phrase, confirmed the two exact private target refs remain absent, and noted the archive checkout's `origin` push URL is `https://github.com/afar1/oscar.git`, so A1 must keep using the explicit `labs` push shape.
- Epicurus the 2nd adversarially reviewed the current packet set and returned OK to continue asking for A1 approval. Epicurus found guardrail gaps in A1/A2a/A5a/A6a completion templates; those gaps were patched so the A1 template now mechanically checks public leak state, A2a requires `untracked.tgz` proof, A5a completion evidence names all denied operation classes, and A6a pins target identity.
- Faraday the 2nd independently verified the 2026-07-02T09:42Z refresh and returned GO-to-ask-only. Faraday found both A1 worktrees clean, both local SHAs still match the pinned phrase, the two private target refs remain absent, the historical private ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`, and current public `origin/main` has `truncated=false` with zero `ios-native` paths.
- Kepler the 2nd adversarially reviewed the A1 boundary after the 09:42Z direct preflight and returned OK to report A1 as askable only, not approved, not executed, and not complete.
- Confucius the 2nd independently verified the 2026-07-02T10:23Z refresh and returned GO-TO-ASK only. Confucius found both A1 worktrees clean, both local SHAs still match the pinned phrase, the two private target refs remain absent, private Git transport works, the historical private ref remains present, public `origin/main` has `truncated=false` with zero `ios-native` paths, and no A1 packet was approved or executed.
- Anscombe the 2nd adversarially reviewed the A1 boundary and returned NO-GO until the public-origin guard checked both exact A1 target names, not only `refs/heads/ios-native-app`. The checklist and request now require public `origin` to lack both `refs/heads/codex/archive-ios-native-20260614` and `refs/heads/ios-native-app`. After the patch, Anscombe returned GO/OK.
- Aquinas the 2nd independently verified the 2026-07-02T10:43Z refresh and returned GO-TO-ASK. Aquinas found no evidence drift: pinned SHAs match, private target refs remain absent, the historical private ref remains present, public `origin` has neither exact A1 target ref, and public `origin/main` reports `truncated=false` with zero `ios-native` paths.
- Helmholtz the 2nd adversarially reviewed the 2026-07-02T10:43Z A1 boundary and returned NO-GO until one public-origin guard bug was patched: the checklist checked the archive target ref through the archive checkout's `origin`, which points to Oscar. The checklist and runbook now check both exact public target refs from `/Users/afar/dev/fieldtheory`.
- Wegener the 2nd independently verified the 2026-07-02T11:15Z local/public facts, but hit the known subagent-environment private Git credential-helper failure. The coordinator shell reran the exact private `git ls-remote` checks successfully with `GIT_TERMINAL_PROMPT=0`; both private target refs remain absent and the historical private ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`. Private Git auth failure in the execution shell remains a stop condition.
- Arendt the 2nd adversarially reviewed the 2026-07-02T11:15Z A1 queue and returned GO to keep A1 as the current recommended approval ask only, with no documentation blocker.
- Hypatia the 2nd independently verified the 2026-07-02T11:36Z local/public facts, but hit the known subagent-environment private Git credential-helper failure. The coordinator shell reran the exact private `git ls-remote` checks successfully with `GIT_TERMINAL_PROMPT=0`; both private target refs remain absent and the historical private ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`. Private Git auth failure in the execution shell remains a stop condition.
- Hooke the 2nd adversarially reviewed the 2026-07-02T11:36Z A1 packet and returned NO-GO until the post-push upstream-tracking verification was hardened. The A1 packet now runs the verification block under `set -euo pipefail`, fetches the two private refs into local `refs/remotes/labs/...` refs, and verifies their SHAs before `branch --set-upstream-to`. Hooke's final rereview returned GO.
- Peirce the 2nd independently reviewed the 2026-07-02T11:59Z source-plan/current-ledger state and live read-only A1 facts. Peirce found A1 sequencing aligned and A1 consistently ask-only, but flagged older historical A4 wording leaks; those lines now preserve the A4 user pause.
- Nietzsche the 2nd adversarially reviewed the 2026-07-02T11:59Z A1/A4 gate wording and returned NO-GO until A1 build waiver and A4 scheduling waiver were converted to exact phrases. A1 build may be waived only by the exact phrase `waive A1 fresh-clone build gate after recorded blocker`; without it, A1 remains partial or blocked and does not unblock E1/E2 or Phase 1+.
- Sagan the 2nd independently verified the 2026-07-02T12:30Z live read-only A1 facts and returned ASKABLE with no drift. Private Git auth did not fail in that shell.
- Harvey the 2nd adversarially reviewed the 2026-07-02T12:30Z A1 ask and returned NO-GO until the Phase 1 acceptance path was made exact and private Git verification commands were forced non-interactive. The docs now require the exact Phase 1 acceptance phrase for remaining Phase 0 gaps and require private `ls-remote`, `fetch`, and `clone` verification commands to run with `GIT_TERMINAL_PROMPT=0`.
- Descartes the 2nd independently verified the 2026-07-02T13:07Z local, public, and GitHub API facts but hit the known subagent-environment private Git credential-helper failure on private `labs` Git transport. The coordinator shell reran the exact private `git ls-remote` checks successfully with `GIT_TERMINAL_PROMPT=0`; both exact private target refs remain absent and the historical private ref remains present at `56fab3bf8192826fa9558392927b27cada070af1`.
- Huygens the 2nd adversarially reviewed the 2026-07-02T13:05Z A1 boundary and returned GO for the A1 docs/request boundary only; this is not authorization to execute A1 or touch A4.
- Dalton the 2nd independently verified the 2026-07-02T13:22Z local, public, and GitHub API facts and returned ASKABLE. Dalton again hit the known subagent-environment private Git credential-helper failure on private Git transport, while the coordinator shell's private `git ls-remote` checks succeeded with `GIT_TERMINAL_PROMPT=0`.
- Carson the 2nd adversarially reviewed the 2026-07-02T13:22Z A1 boundary and returned GO to treat A1 as the next request-only approval ask, and NO-GO to execute A1, touch A4, or start Phase 1.

## What Approval Would Allow

Only the A1 packet in `docs/PHASE0_APPROVAL_PACKETS.md`:

- re-run the A1 read-only preflight in the same execution shell immediately before use;
- push the archive SHA `60e7e9ddbc2f98a0233d8769539b1fb4b189214a` to private `refs/heads/codex/archive-ios-native-20260614`;
- push the iOS SHA `56fab3bf8192826fa9558392927b27cada070af1` to private `refs/heads/ios-native-app`;
- fetch the two private branch refs into local `refs/remotes/labs/...` refs and verify they resolve to the pinned SHAs before setting upstream tracking;
- run private Git verification commands non-interactively with `GIT_TERMINAL_PROMPT=0`, including `ls-remote`, `fetch`, and `git clone`; if any private Git verification command fails, stop and record A1 as partial or blocked;
- verify private refs, upstream tracking, fresh private clone presence of `ios-native/`, and the README-backed iOS build path:
  - from the fresh clone root, `./ios-native/scripts/build-whisper-ios.sh`;
  - from `ios-native`, `xcodegen generate`;
  - from `ios-native`, `xcodebuild -project FieldTheory.xcodeproj -scheme FieldTheory -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`.

Build verification caveat: the fresh clone does not contain the ignored `build-apple/whisper.xcframework`; the whisper script creates it and deletes/recreates build directories inside the fresh clone. `xcodegen generate` writes `ios-native/FieldTheory.xcodeproj`. This A1 check must stay non-signing and simulator/no-code-sign only. Any signing, provisioning, device, TestFlight, or distribution work requires a separate explicit approval packet.

## What Approval Would Not Allow

- public push;
- deleting or moving `/Users/afar/dev/fieldtheory-labs-ios-native-archive`;
- app extraction, signing, TestFlight, release publication, tag creation, or distribution;
- backup setup, restore drill, scheduler setup, cleanup, prune, stash, install, plugin-cache mutation, migration, bundle, or snapshot work.

## Stop Conditions

Stop and regenerate the request if any of these change:

- either local SHA differs from the pinned approval phrase;
- either A1 worktree reports dirt or a branch/status line other than the expected `ios-native-app...origin/ios-native-app [gone]` and `codex/archive-ios-native-20260614...main [ahead 1]`;
- either exact private target ref exists before approval, even at the expected SHA; regenerate as verification-only instead of asking for a push packet;
- `afar1/fieldtheory-labs` is not private;
- either `labs` push URL no longer targets `https://github.com/afar1/fieldtheory-labs.git`;
- public `origin` gains either exact A1 target ref: `refs/heads/codex/archive-ios-native-20260614` or `refs/heads/ios-native-app`;
- current public `origin/main` contains `ios-native` paths;
- the public tree API returns `truncated=true`, fails, or cannot prove the current remote `origin/main` tree;
- private GitHub auth fails during read-only confirmation.
