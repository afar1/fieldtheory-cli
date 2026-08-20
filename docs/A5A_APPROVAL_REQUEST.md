# A5a Approval Request: Cleanup Manifest Only

Status: request-only. No approval packet has been executed.

## Exact Approval Phrase

Andrew must say this exact phrase before the A5a packet can run:

```text
approve A5a cleanup manifest only
```

Do not treat nearby wording, summaries, or this file as approval.

## Goal

Create a cleanup preservation manifest that records current evidence and future preservation decision paths before any Field Theory constellation cleanup.

## Current Evidence

Current evidence as of July 2 12:14Z:

- `/Users/afar/dev` has 59 Field Theory-family directories by the current review pattern.
- The exact target-sensitive directories are `/Users/afar/dev/littleai`, `/Users/afar/dev/old-field`, `/Users/afar/dev/oscar`, and `/Users/afar/dev/oscar-pr-101-preserved`.
- Worktree records across target repos total 60: `fieldtheory-oss` 12, `fieldtheory` 17, `fieldtheory-cli` 30, and `fieldtheory-plugin` 1.
- The additional `fieldtheory-oss` worktree record is `/Users/afar/.codex/worktrees/ba3d/fieldtheory-oss`.
- `fieldtheory-cli` has 17 prunable `/private/tmp/fieldtheory-cli-*` worktree records.
- `/private/tmp` currently has 5 existing `fieldtheory-cli-*` directories: `/private/tmp/fieldtheory-cli-ci-config`, `/private/tmp/fieldtheory-cli-ci-data`, `/private/tmp/fieldtheory-cli-ci-home`, `/private/tmp/fieldtheory-cli-current-context-pr`, and `/private/tmp/fieldtheory-cli-origin-main-publish-check`.
- `/Users/afar/dev/oscar` is on `main` at `615d081171a4d2d6df5ed1d790c4f13a58a11618`, behind stale local `origin/main` by 4 commits, and has untracked plan/log/model files.
- Stale local `oscar` `origin/main` is `2448e3d2f9460b867a5e3aa8c08f2df978840e3d`.
- Live GitHub `oscar` `origin/main` is `f81481ff9824ddb4fa252ed93933d9bc815dc930`.
- `/Users/afar/dev/fieldtheory-labs.oscar-mirror.git` is at `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`, 12 commits behind live GitHub `origin/main`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` remains protected until A1 is verified.
- Sartre the 2nd independently verified the same evidence and returned A5a `ASK-ONLY`.
- Heisenberg the 2nd adversarially reviewed the packet boundary and found no A5a/A6a separation issue after the checklist completion guard was strengthened.
- Gauss the 2nd independently verified the 10:53Z evidence and returned A5a `ASK-ONLY` with no drift.
- Hilbert the 2nd adversarially reviewed the 10:53Z boundary and returned NO-GO until the exact A5a stop tuple was enforced more tightly. The checklist, request, and runbook now pin per-repo worktree counts, exact `/private/tmp` paths, protected archive presence, and Oscar live/mirror compare evidence.
- Euclid the 2nd independently verified the 11:22Z evidence and returned A5a `ASK-ONLY` with no drift.
- Singer the 2nd adversarially reviewed the 11:22Z non-A1 queue and returned GO to report A5a as a limited askable packet only, behind A1 and with no execution approval.
- Curie the 2nd independently verified the 12:14Z evidence and returned A5a DRIFTED until this request was regenerated. Curie found Field Theory-family directory count, target-sensitive directories, `/private/tmp` candidate count and path list, protected archive presence, Oscar mirror/live tuple, and A6a evidence still match, but `fieldtheory-oss` worktree records now total 12 and four-repo worktree records now total 60.

## If Approved

A5a allows only:

- rerun the A5a read-only preflight in the same execution shell immediately before use;
- create one timestamped Desktop cleanup preservation manifest that must not already exist;
- record Field Theory-family directory inventory;
- record that every Field Theory-family directory listed needs a later keep/delete/no-preserve decision before cleanup;
- record exact target-sensitive directory inventory;
- record target repo worktree records and `/private/tmp/fieldtheory-cli-*` candidates;
- record Oscar local status, mirror SHA, live GitHub SHA, and live compare result;
- record current status and future preservation decision path for every candidate enumerated by the fresh A5a preflight.

## Not Approved

A5a does not allow:

- creating git bundles, directory archives, or waiver text;
- deleting files or directories;
- `git worktree prune`;
- moving `oscar`;
- stashing or committing changes;
- deleting `/Users/afar/dev/fieldtheory-labs-ios-native-archive`;
- cloning, building, generating projects, installing tools, backing up, restoring, scheduling jobs, pushing, tagging, publishing releases, running migrations, or mutating plugin cache;
- calling A5 complete.

## Completion Evidence

A5a may be called complete only when:

- the cleanup preservation manifest exists;
- every candidate enumerated by the fresh A5a preflight, including protected and non-deletion candidates, has current evidence status and a future preservation decision path;
- no denied operation listed above occurred.

This completes only the cleanup manifest. A5 remains incomplete until deletion/prune work is separately approved and executed, `~/dev` family count is reduced to the plan target, and the worktree policy note exists.

## Stop Conditions

Stop and regenerate the request if any of these change:

- Field Theory-family directory count differs from `59`;
- target-sensitive directory list changes from `/Users/afar/dev/littleai`, `/Users/afar/dev/old-field`, `/Users/afar/dev/oscar`, and `/Users/afar/dev/oscar-pr-101-preserved`;
- target repo worktree record counts differ from `fieldtheory-oss=12`, `fieldtheory=17`, `fieldtheory-cli=30`, `fieldtheory-plugin=1`, total `60`;
- `fieldtheory-cli` prunable `/private/tmp/fieldtheory-cli-*` worktree record count differs from `17`;
- existing `/private/tmp/fieldtheory-cli-*` directory count differs from `5`;
- the existing `/private/tmp/fieldtheory-cli-*` path list differs from `/private/tmp/fieldtheory-cli-ci-config`, `/private/tmp/fieldtheory-cli-ci-data`, `/private/tmp/fieldtheory-cli-ci-home`, `/private/tmp/fieldtheory-cli-current-context-pr`, and `/private/tmp/fieldtheory-cli-origin-main-publish-check`;
- Oscar local status, local SHA `615d081171a4d2d6df5ed1d790c4f13a58a11618`, stale local `origin/main` `2448e3d2f9460b867a5e3aa8c08f2df978840e3d`, live GitHub `origin/main` `f81481ff9824ddb4fa252ed93933d9bc815dc930`, mirror SHA `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28`, or GitHub compare tuple `{status: ahead, ahead_by: 12, behind_by: 0, total_commits: 12}` differs from the recorded evidence;
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` is missing before A1 completes;
- the timestamped manifest path already exists during execution;
- any command would need to create bundles, archives, waiver text, delete, prune, move, stash, commit, clone, build, install, back up, restore, schedule, push, tag, publish, migrate, mutate plugin cache, or call A5 complete.
