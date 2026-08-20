# Field Theory Phase 0 Preflight Checklist

Status: checkpoint from July 2, 2026. This checklist is read-only. It does not grant approval for any packet.

Source artifacts:

- Execution ledger: `docs/ECOSYSTEM_EXECUTION_STATUS.md`
- Preservation runbook: `docs/PRESERVATION_GATES.md`
- Approval packets: `docs/PHASE0_APPROVAL_PACKETS.md`

## Goals

Orchestrator goal: keep the Phase 0 preservation gates authoritative, refresh current evidence before action, and stop instead of guessing when evidence changes.

Subagent goal: review each proposed packet adversarially for unsafe scope expansion, stale evidence, missing proof, and language that could make a partial preflight look like act completion.

Acceptance goal: a packet may run only after its named approval phrase is present and the read-only preflight still matches the packet assumptions.

## Hard Stop Rules

Stop and patch the runbook before asking for or using approval if any preflight result contradicts the packet assumptions.

Stop if a command would mutate state. This checklist must not push, clone, build, generate projects, install, back up, restore, schedule a backup job, create bundles, create snapshots, create manifests, delete, prune, move, stash, tag, publish a release, run a migration, or rewrite plugin cache.

Stop if a sub-packet looks like full act completion. A2a, A3a, and A5a are preservation or manifest steps only.

Stop if a command needs a guessed path, branch, tag, remote, backup destination, release version, scheduler path, or restore snapshot ID.

Do not run `git push` from this checklist, even with `--dry-run`. Dry-run push checks belong in the approval-only packet execution path, not in read-only preflight.

## Packet A1 Preflight: Private iOS Preservation

Run before asking for or using `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1`.

Read-only checks:

```bash
ARCHIVE_SHA="60e7e9ddbc2f98a0233d8769539b1fb4b189214a"
IOS_SHA="56fab3bf8192826fa9558392927b27cada070af1"

git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch
git -C /Users/afar/dev/fieldtheory remote get-url --push labs
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs
git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614
test "$(git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app)" = "$IOS_SHA"
test "$(git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614)" = "$ARCHIVE_SHA"
gh repo view afar1/fieldtheory --json nameWithOwner,visibility,url
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/archive/fieldtheory-pre-oss-20260614/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/codex/archive-ios-native-20260614
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app
PUBLIC_MAIN_SHA="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main | awk '{print $1}')"
test -n "$PUBLIC_MAIN_SHA"
gh api "repos/afar1/fieldtheory/git/trees/$PUBLIC_MAIN_SHA?recursive=1" --jq '[.truncated, ([.tree[].path | select(. == "ios-native" or startswith("ios-native/"))] | length)] | @tsv'
```

Acceptance checks:

- Both local repos are on the expected branches and are clean.
- Both `labs` push URLs are `https://github.com/afar1/fieldtheory-labs.git`.
- `afar1/fieldtheory-labs` reports `PRIVATE`.
- The local branch SHAs equal the approved object IDs, and the remote branch state is freshly recorded.
- The existing archived private branch is distinguished from the two required branch names.
- Public `origin` has no exact A1 target refs: neither `refs/heads/codex/archive-ios-native-20260614` nor `refs/heads/ios-native-app`.
- The public `origin/main` tree check reports `truncated=false` and zero `ios-native` paths using the current remote `main` SHA from `ls-remote` plus GitHub's tree API. Do not rely on a stale local `origin/main` ref for the public `ios-native` path check.
- If either required private remote branch exists before approval, even at the expected SHA, stop and regenerate the request as verification-only instead of asking for a push packet.
- If either required private remote branch unexpectedly exists and differs from the local branch SHA, stop and patch the runbook before asking for approval.
- If either exact A1 target ref exists on public `origin`, stop and patch the runbook before asking for approval.
- If the public tree API returns `truncated=true`, fails, or cannot prove the current remote `origin/main` tree, stop and patch the runbook before asking for approval.
- If private remote checks fail from auth or credential-helper errors, stop and repair auth before asking for approval. Do not substitute broad ref patterns, dry-run pushes, or public remotes.

## Packet A4a Preflight: Manual Waist Backup

Do not run this preflight while A4 is user-paused. Run it only after Andrew explicitly resumes A4 after connecting a backup disk and before asking for or using `approve A4a manual backup and restore drill`.

Read-only checks:

```bash
test -d "$HOME/.fieldtheory"
test -L "$HOME/.fieldtheory/bookmarks"
readlink "$HOME/.fieldtheory/bookmarks"
test -d "$HOME/.ft-bookmarks"
BOOKMARKS_REAL="$(readlink "$HOME/.fieldtheory/bookmarks" 2>/dev/null || printf '%s\n' "$HOME/.fieldtheory/bookmarks")"
test -d "/Volumes/Extreme SSD"
test -w "/Volumes/Extreme SSD"
mount | rg ' on /Volumes/Extreme SSD '
diskutil info "/Volumes/Extreme SSD"
tmutil destinationinfo
command -v restic || true
launchctl list | rg -i 'fieldtheory|restic|backup' || true
crontab -l 2>/dev/null | rg -i 'fieldtheory|restic|backup' || true
find "$HOME/.fieldtheory" "$BOOKMARKS_REAL" -maxdepth 3 -iname '*restore*drill*' -print
find "$HOME/.fieldtheory" "$BOOKMARKS_REAL" -maxdepth 3 -iname '*restore*drill*' -type f -print -exec sed -n '1,20p' {} \;
du -sh "$HOME/.fieldtheory" "$HOME/.ft-bookmarks"
df -h "/Volumes/Extreme SSD"
```

Acceptance checks:

- The Field Theory home exists.
- `~/.fieldtheory/bookmarks` still points to the real bookmark store expected by the packet.
- The approved backup volume is mounted, writable, and verified from mount/disk metadata, not just by a writable directory at `/Volumes/Extreme SSD`.
- No existing scheduler is silently treated as proof of A4 completion.
- Any existing restore-drill artifact in either root is inspected before a new one is trusted.
- Root sizes and destination free space are refreshed before backup work starts.

## Packet A4b Preflight: Scheduled Waist Backup

Do not run this preflight while A4 is user-paused. Run it only after Andrew explicitly resumes A4, A4a has passed, and before asking for or using `approve A4b scheduled backup and restore drill`.

Read-only checks:

```bash
test -f "$HOME/.fieldtheory/backup-drill/restore-drill-artifact.txt"
sed -n '1,20p' "$HOME/.fieldtheory/backup-drill/restore-drill-artifact.txt"
test -d "/Volumes/Extreme SSD"
test -w "/Volumes/Extreme SSD"
mount | rg ' on /Volumes/Extreme SSD '
diskutil info "/Volumes/Extreme SSD"
command -v restic
```

Acceptance checks:

- A4a has passed and the restore-drill artifact names the exact manual snapshot.
- The approved backup volume mount identity still matches the reviewed A4a destination.
- The exact script, scheduler config, log path, restic repository, retention policy, and scheduled-run restore-drill artifact format have been reviewed.
- A4 remains incomplete until one scheduled run is observed and a restore drill from that scheduled-run snapshot recovers one file from each root with matching hashes, unless Andrew says the exact phrase `waive A4 scheduled-backup gate after manual backup and restore drill`. Without that exact waiver phrase, do not call A4 complete and do not use A4 to unblock B3/B4/F1 or Phase 1+.

## Packet A2a Preflight: Mac App Preservation Bundle And Dirty-Tree Snapshot

Run before asking for or using `approve A2a create mac-app preservation bundle and dirty-tree snapshot`.

Read-only checks:

```bash
git -C /Users/afar/dev/fieldtheory-oss status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-oss status --porcelain --untracked-files=all | shasum -a 256
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
```

Acceptance checks:

- The branch, ahead count, source tag state, app version, changelog, checklist, public repo state, and release feed are freshly known. The dirty-set tuple must match the regenerated 2026-07-02T12:48Z packet: 39 dirty paths, 28 modified tracked paths, 11 Git-visible untracked paths, SHA-256 `0c9a09a13ed2583ea26f44dffeef44ae42990bdda929265f4f7501696cc4112d`, and Git-visible untracked paths including `docs/plans/2026-07-02-001-feat-ios-live-dictation-plan.md` and `docs/plans/2026-07-02-002-feat-team-share-links-plan.md`.
- The preservation packet creates a bundle and dirty-tree snapshot, but still does not stash, commit, switch branches, tag, push, or publish.
- Post-packet label constraint: A2a may be called complete only when the approved bundle exists, bundle verification output exists, and the working-tree snapshot includes status, tracked diff, staged diff, Git-visible untracked list, `untracked.tgz`, and a readable archive listing from `tar -tzf "$SNAPSHOT/untracked.tgz"`. This still does not complete A2.

## Packet A3a Preflight: Plugin Installed-State Snapshot

Run before asking for or using `approve A3a plugin installed-state snapshot`.

Read-only checks:

```bash
git -C /Users/afar/dev/fieldtheory-plugin status --short --branch --untracked-files=all
git -C /Users/afar/dev/fieldtheory-plugin status --porcelain --untracked-files=all | shasum -a 256
git -C /Users/afar/dev/fieldtheory-plugin rev-parse HEAD
diff -qr /Users/afar/plugins/field-theory /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607
diff -qr /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418 /Users/afar/plugins/field-theory
test ! -d /Users/afar/dev/fieldtheory-plugin/plugin
ls -l /private/tmp/a3_dev_files.txt /private/tmp/a3_installed_files.txt 2>/dev/null || true
```

Acceptance checks:

- Installed plugin and Codex cache state are compared before they are copied.
- Dev repo drift is known before any commit strategy is chosen.
- Dev repo branch, upstream, HEAD, dirty status, untracked file set, and status hash are known before any installed/cache snapshot approval is used.
- Scratch-file evidence uses `/private/tmp` directly because `/tmp` is a symlink on macOS.
- Post-packet label constraint: A3a may be called complete only when the installed/cache snapshot exists and checksums were written for `installed/` and `cache/` entries only. This still does not complete A3.

## Packet A5a Preflight: Cleanup Manifest

Run before asking for or using `approve A5a cleanup manifest only`.

Read-only checks:

```bash
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
```

Acceptance checks:

- The current evidence must exactly match the A5a request before asking for or using approval:
  - Field Theory-family directory count is `59`;
  - target-sensitive directories are `/Users/afar/dev/littleai`, `/Users/afar/dev/old-field`, `/Users/afar/dev/oscar`, and `/Users/afar/dev/oscar-pr-101-preserved`;
  - worktree counts are `fieldtheory-oss=12`, `fieldtheory=17`, `fieldtheory-cli=30`, `fieldtheory-plugin=1`, total `60`;
  - `fieldtheory-cli` prunable `/private/tmp/fieldtheory-cli-*` worktree records total `17`;
  - existing `/private/tmp/fieldtheory-cli-*` directories total `5`, and the current listed paths are recorded;
  - `/Users/afar/dev/fieldtheory-labs-ios-native-archive` exists until A1 is verified;
  - Oscar local HEAD, stale local `origin/main`, live GitHub `origin/main`, mirror HEAD, and GitHub compare tuple match the recorded evidence.
- Stop and regenerate the A5a request if any exact count, target list, protected path, or Oscar evidence tuple differs.
- `oscar` and any dirty repo are treated as preservation targets, not debris.
- Oscar preservation evidence uses live GitHub `origin/main`, not only stale local remote-tracking refs.
- The manifest lists current evidence status and a future target-specific preservation decision path for every candidate enumerated by the fresh A5a preflight, including protected and non-deletion candidates.
- Post-packet label constraint: A5a may be called complete only when the manifest exists, every candidate enumerated by the fresh A5a preflight has current evidence status plus a future preservation decision path, and no denied operation occurred. No deletion, prune, or move is allowed. This still does not complete A5.

## Packet A6a Preflight: Review Debris

Run before asking for or using the exact A6a quarantine approval phrase.

Read-only checks:

```bash
test ! -e '/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1'
test -f /Users/afar/.ft-bookmarks/twitter-bookmarks.db
test ! -L /Users/afar/.ft-bookmarks/twitter-bookmarks.db
stat -f '%N inode=%i size=%z modified=%Sm' /Users/afar/.ft-bookmarks/twitter-bookmarks.db
stat -f '%i %z %m %HT' /Users/afar/.ft-bookmarks/twitter-bookmarks.db
test "$(stat -f '%z' /Users/afar/.ft-bookmarks/twitter-bookmarks.db)" = "0"
```

Acceptance checks:

- The `bookmarks.db?immutable=1` debris remains absent.
- `twitter-bookmarks.db` is still the same zero-byte regular file before any quarantine move is considered, with exact `stat -f '%i %z %m %HT'` tuple `70248019 0 1776019722 Regular File`.
- The operation shape is quarantine, not raw deletion, and the quarantine packet must prove the destination file exists, remains zero-byte regular, is not a symlink, and the original path is absent after the move.

## Review Rule

After refreshing preflight evidence, use a subagent for adversarial review before executing any approved packet. Do not weaken this for A2a, A3a, or A5a just because those packets are preservation-only.
