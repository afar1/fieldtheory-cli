# Field Theory Preservation Gates

Status: checkpoint from July 2, 2026. This document records the current A1-A6 gate evidence and the exact approval-only operations. It is not proof that any gate is complete.

## A1: Private iOS Preservation

Current evidence:

- `/Users/afar/dev/fieldtheory` exists, is clean, and is on `ios-native-app` at `56fab3bf8192826fa9558392927b27cada070af1`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` exists, is clean, and is on `codex/archive-ios-native-20260614` at `60e7e9ddbc2f98a0233d8769539b1fb4b189214a`.
- `afar1/fieldtheory` is public.
- `afar1/fieldtheory-labs` is private.
- The archive branch adds `ios-native/`, 49 files, and 6,579 insertions relative to `main`.
- The private remote currently has `archive/fieldtheory-pre-oss-20260614/ios-native-app`, but not the two plain branch names required by the plan.
- Historical dry-run pushes showed both required private branches would be created without force-pushing.
- July 2 13:22Z read-only preflight confirmed in the coordinator shell that the exact required private refs are still absent. The older private archive ref remains present and distinct. Public `origin` on `/Users/afar/dev/fieldtheory` still has neither exact A1 target ref: `refs/heads/codex/archive-ios-native-20260614` nor `refs/heads/ios-native-app`. GitHub's tree API for the current public `origin/main` SHA `4df630b96d2c2ec30d03e353dc1364994587457f` reports `truncated=false` and zero `ios-native` paths. Use full `refs/heads/...` names for remote checks; loose `--heads labs ios-native-app` patterns can match the existing archived branch. Use the current remote SHA from `ls-remote` plus GitHub's tree API for public tree proof; do not rely on stale local `origin/main`. Dalton the 2nd independently verified the same local/public facts but reproduced the known subagent-environment private Git credential-helper failure; the coordinator-shell exact private `git ls-remote` checks succeeded. Carson the 2nd found no A1 boundary blocker and returned GO for A1 as request-only. Hooke the 2nd found that post-push upstream setup could fail if local `refs/remotes/labs/...` refs do not exist and that the separate verification block must fail fast; the verification template now runs under `set -euo pipefail` and fetches and verifies those refs before `branch --set-upstream-to`. Harvey the 2nd found that private verification commands must be non-interactive; private `ls-remote`, `fetch`, and `clone` commands now run with `GIT_TERMINAL_PROMPT=0`. Private Git auth failure in the execution shell remains a stop condition.
- The local tracking strings are not final A1 evidence yet: `/Users/afar/dev/fieldtheory` reports `ios-native-app...origin/ios-native-app [gone]`, and `/Users/afar/dev/fieldtheory-labs-ios-native-archive` reports `codex/archive-ios-native-20260614...main [ahead 1]`. Private upstream tracking is approval-only verification work after the push.

Approval-only commands:

Do not run this block unless Andrew has just said `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1` and a fresh A1 read-only preflight has been rerun in the same execution shell immediately before use and still matches.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
set -euo pipefail

ARCHIVE_SHA="60e7e9ddbc2f98a0233d8769539b1fb4b189214a"
IOS_SHA="56fab3bf8192826fa9558392927b27cada070af1"

test "$(git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive remote get-url --push labs)" = "https://github.com/afar1/fieldtheory-labs.git"
test "$(git -C /Users/afar/dev/fieldtheory remote get-url --push labs)" = "https://github.com/afar1/fieldtheory-labs.git"
test "$(git -C /Users/afar/dev/fieldtheory remote get-url --push origin)" = "https://github.com/afar1/fieldtheory.git"
test "$(gh repo view afar1/fieldtheory-labs --json visibility --jq .visibility)" = "PRIVATE"
test "$(gh repo view afar1/fieldtheory --json visibility --jq .visibility)" = "PUBLIC"
test "$(git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/heads/codex/archive-ios-native-20260614)" = "$ARCHIVE_SHA"
test "$(git -C /Users/afar/dev/fieldtheory rev-parse refs/heads/ios-native-app)" = "$IOS_SHA"

EXISTING_ARCHIVE="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614 | awk '{print $1}')"
EXISTING_IOS="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app | awk '{print $1}')"
PUBLIC_ARCHIVE="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/codex/archive-ios-native-20260614 | awk '{print $1}')"
PUBLIC_IOS="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/ios-native-app | awk '{print $1}')"
PUBLIC_MAIN="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote origin refs/heads/main | awk '{print $1}')"
test -z "$EXISTING_ARCHIVE" || { echo "Target archive ref already exists; regenerate A1 as verification-only."; exit 1; }
test -z "$EXISTING_IOS" || { echo "Target iOS ref already exists; regenerate A1 as verification-only."; exit 1; }
test -z "$PUBLIC_ARCHIVE" || { echo "Public origin has archive A1 target ref; stop and regenerate A1."; exit 1; }
test -z "$PUBLIC_IOS" || { echo "Public origin has iOS A1 target ref; stop and regenerate A1."; exit 1; }
test -n "$PUBLIC_MAIN"
test "$(gh api "repos/afar1/fieldtheory/git/trees/$PUBLIC_MAIN?recursive=1" --jq '.truncated')" = "false"
test "$(gh api "repos/afar1/fieldtheory/git/trees/$PUBLIC_MAIN?recursive=1" --jq '[.tree[]? | select(.path | startswith("ios-native"))] | length')" = "0"

git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive push labs "$ARCHIVE_SHA":refs/heads/codex/archive-ios-native-20260614
git -C /Users/afar/dev/fieldtheory push labs "$IOS_SHA":refs/heads/ios-native-app
```

Verification after approval:

Do not run this verification block unless Andrew has just said `approve A1 private push and verification 60e7e9ddbc2f98a0233d8769539b1fb4b189214a 56fab3bf8192826fa9558392927b27cada070af1` and the approved push block has completed in the same packet.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
set -euo pipefail

ARCHIVE_SHA="60e7e9ddbc2f98a0233d8769539b1fb4b189214a"
IOS_SHA="56fab3bf8192826fa9558392927b27cada070af1"

test "$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive ls-remote labs refs/heads/codex/archive-ios-native-20260614 | awk '{print $1}')" = "$ARCHIVE_SHA"
test "$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory ls-remote labs refs/heads/ios-native-app | awk '{print $1}')" = "$IOS_SHA"
gh repo view afar1/fieldtheory-labs --json nameWithOwner,visibility,url
test "$(gh repo view afar1/fieldtheory-labs --json visibility --jq .visibility)" = "PRIVATE"
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory fetch labs refs/heads/ios-native-app:refs/remotes/labs/ios-native-app
GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive fetch labs refs/heads/codex/archive-ios-native-20260614:refs/remotes/labs/codex/archive-ios-native-20260614
test "$(git -C /Users/afar/dev/fieldtheory rev-parse refs/remotes/labs/ios-native-app)" = "$IOS_SHA"
test "$(git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive rev-parse refs/remotes/labs/codex/archive-ios-native-20260614)" = "$ARCHIVE_SHA"
git -C /Users/afar/dev/fieldtheory branch --set-upstream-to=labs/ios-native-app ios-native-app
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive branch --set-upstream-to=labs/codex/archive-ios-native-20260614 codex/archive-ios-native-20260614
git -C /Users/afar/dev/fieldtheory status --short --branch
git -C /Users/afar/dev/fieldtheory-labs-ios-native-archive status --short --branch

VERIFY_CLONE="$(mktemp -d /tmp/fieldtheory-labs-ios-verify.XXXXXX)"
GIT_TERMINAL_PROMPT=0 git clone --branch codex/archive-ios-native-20260614 --single-branch https://github.com/afar1/fieldtheory-labs.git "$VERIFY_CLONE"
test -d "$VERIFY_CLONE/ios-native"

# Build verification must run from the fresh private clone. The iOS project is generated by XcodeGen.
(
  cd "$VERIFY_CLONE"
  ./ios-native/scripts/build-whisper-ios.sh
  cd ios-native
  xcodegen generate
  xcodebuild -project FieldTheory.xcodeproj -scheme FieldTheory \
    -configuration Debug -destination 'generic/platform=iOS Simulator' \
    CODE_SIGNING_ALLOWED=NO build
)
```

A1 is not complete until both branches exist on the private remote at the approved SHAs, both fetched private remote-tracking refs resolve to those SHAs, both local branches track the private upstream, a fresh private clone contains `ios-native/`, and the README-backed iOS build succeeds using the non-signing simulator/no-code-sign check above. The fresh clone will not have `build-apple/whisper.xcframework`; `./ios-native/scripts/build-whisper-ios.sh` generates it and deletes/recreates `build-apple`, `build-ios-sim`, and `build-ios-device` inside the fresh clone. `xcodegen generate` writes `ios-native/FieldTheory.xcodeproj`. Any signing, provisioning, device, TestFlight, or distribution work requires a separate explicit approval packet. If the fresh private clone does not build, A1 remains partial or blocked unless Andrew says the exact phrase `waive A1 fresh-clone build gate after recorded blocker`; without that exact waiver phrase, do not call A1 complete and do not use A1 to unblock E1/E2 or Phase 1+.

Do not use plain `git push` from either checkout. The archive worktree tracks `main`, and the original `fieldtheory` checkout has a public `origin`.

## A2: Mac App Release Train

Current evidence:

- `/Users/afar/dev/fieldtheory-oss` is on `codex/release-0.3.14-startup-library` at `0c560c3`.
- `origin` is the public repo `https://github.com/afar1/fieldtheory.git`.
- The branch is 31 commits ahead of its upstream and 30 commits ahead of `origin/main`.
- The worktree has 39 dirty paths: 28 modified tracked paths and 11 Git-visible untracked paths.
- `mac-app/package.json` says `0.3.20`.
- `mac-app/CHANGELOG.md` still starts at `0.1.33`.
- `mac-app/docs/RELEASE_CHECKLIST.md` still says `v0.1.25+maxwell`.
- The source repo has no observed tags.
- `afar1/field-releases` is public, and its latest release/feed is still `v0.3.14`.
- The current release branch name says `0.3.14`, while package metadata says `0.3.20`.
- July 2 12:48Z direct read-only preflight confirmed the same release-train blockers, except the dirty set drifted to 39 paths after `docs/plans/2026-07-02-001-feat-ios-live-dictation-plan.md` and `docs/plans/2026-07-02-002-feat-team-share-links-plan.md` became Git-visible untracked. Package metadata still says `0.3.20`, changelog still starts at `0.1.33`, the release checklist still says `v0.1.25+maxwell`, source-repo tags remain absent, latest feed still says `0.3.14`, the branch is still 30 commits ahead of `origin/main`, and the local branch is still 31 commits ahead of its upstream release branch. The dirty-set proof records SHA-256 `0c9a09a13ed2583ea26f44dffeef44ae42990bdda929265f4f7501696cc4112d` for `git status --porcelain --untracked-files=all`; a dirty path count alone is not enough proof that A2a still matches.

A2 is not complete. The sole-copy app commits and dirty files must be preserved and triaged before anything public is pushed.

Read-only verification:

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
```

Approval-only preservation bundle and dirty-tree snapshot:

Do not run this preservation block unless Andrew has just said `approve A2a create mac-app preservation bundle and dirty-tree snapshot` and a fresh A2a read-only preflight has been rerun in the same execution shell immediately before use and still matches.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
set -euo pipefail

SNAPSHOT="$HOME/Desktop/fieldtheory-oss-a2-working-tree-$(date -u +%Y%m%dT%H%M%SZ)"
BUNDLE="$SNAPSHOT/fieldtheory-oss-a2-preflight.bundle"
EXPECTED_DIRTY_HASH="0c9a09a13ed2583ea26f44dffeef44ae42990bdda929265f4f7501696cc4112d"
CURRENT_DIRTY_HASH="$(git -C /Users/afar/dev/fieldtheory-oss status --porcelain --untracked-files=all | shasum -a 256 | awk '{print $1}')"
test "$CURRENT_DIRTY_HASH" = "$EXPECTED_DIRTY_HASH" || { echo "A2a dirty set changed; regenerate request."; exit 1; }
test ! -e "$SNAPSHOT"
mkdir "$SNAPSHOT"
test ! -e "$BUNDLE"

git -C /Users/afar/dev/fieldtheory-oss bundle create "$BUNDLE" HEAD origin/main
git -C /Users/afar/dev/fieldtheory-oss bundle verify "$BUNDLE" > "$SNAPSHOT/bundle.verify.txt"
git -C /Users/afar/dev/fieldtheory-oss status --short --branch --untracked-files=all > "$SNAPSHOT/status.txt"
git -C /Users/afar/dev/fieldtheory-oss diff --binary > "$SNAPSHOT/tracked.diff"
git -C /Users/afar/dev/fieldtheory-oss diff --cached --binary > "$SNAPSHOT/staged.diff"
git -C /Users/afar/dev/fieldtheory-oss ls-files --others --exclude-standard -z > "$SNAPSHOT/untracked.list.z"
tar -C /Users/afar/dev/fieldtheory-oss --null -T "$SNAPSHOT/untracked.list.z" -czf "$SNAPSHOT/untracked.tgz"
tar -tzf "$SNAPSHOT/untracked.tgz" > "$SNAPSHOT/untracked.archive.list"
```

Approval-only public release gate:

Do not run this public-release review block unless A2a preservation has completed and Andrew has just said `approve A2b public release review only`.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
set -euo pipefail

REVIEW="$HOME/Desktop/fieldtheory-oss-a2-public-review-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$REVIEW"

test "$(gh repo view afar1/fieldtheory --json visibility --jq .visibility)" = "PUBLIC"
test -z "$(git -C /Users/afar/dev/fieldtheory-oss status --porcelain --untracked-files=all)"
test "$(node -p "require('/Users/afar/dev/fieldtheory-oss/mac-app/package.json').version")" = "0.3.20"
rg -q "^## \\[0\\.3\\.20\\]" /Users/afar/dev/fieldtheory-oss/mac-app/CHANGELOG.md
rg -q "0\\.3\\.20" /Users/afar/dev/fieldtheory-oss/mac-app/docs/RELEASE_CHECKLIST.md

git -C /Users/afar/dev/fieldtheory-oss rev-parse HEAD > "$REVIEW/reviewed-head.sha"
git -C /Users/afar/dev/fieldtheory-oss log --oneline origin/main..HEAD > "$REVIEW/commits.txt"
git -C /Users/afar/dev/fieldtheory-oss diff --name-status origin/main...HEAD > "$REVIEW/files.txt"
rg -n -uuu --glob '!**/.git/**' --glob '!**/node_modules/**' --glob '!**/release/**' \
  "SECRET|TOKEN|PRIVATE KEY|fieldtheory-labs|subscription|quota" \
  /Users/afar/dev/fieldtheory-oss > "$REVIEW/exposure-scan.txt" || true
```

Approval-only final public push, after reviewing the public-review artifact, a green release verification run, and the exact `main` and `v0.3.20` refs:

Do not run this final public push block unless A2a and A2b have completed, release verification has passed, and Andrew has just said `approve A2c final public release push <reviewed-sha> v0.3.20` with the exact reviewed SHA that this block verifies.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
set -euo pipefail

REVIEW="/path/to/reviewed/fieldtheory-oss-a2-public-review"
REVIEWED_SHA="$(cat "$REVIEW/reviewed-head.sha")"
test -f "$REVIEW/exposure-scan-disposition.md"
test -f "$REVIEW/verify-release-passed.txt"
test "$(git -C /Users/afar/dev/fieldtheory-oss symbolic-ref --short HEAD)" = "main"
test "$(git -C /Users/afar/dev/fieldtheory-oss rev-parse HEAD)" = "$REVIEWED_SHA"
test "$(git -C /Users/afar/dev/fieldtheory-oss rev-parse refs/heads/main)" = "$REVIEWED_SHA"
test "$(git -C /Users/afar/dev/fieldtheory-oss rev-list -n1 refs/tags/v0.3.20)" = "$REVIEWED_SHA"

git -C /Users/afar/dev/fieldtheory-oss push origin "$REVIEWED_SHA:refs/heads/main"
git -C /Users/afar/dev/fieldtheory-oss push origin refs/tags/v0.3.20:refs/tags/v0.3.20
```

Do not start with a blind stash. The dirty files include real source, tests, docs, CI, window hardening, and audio-label work. A blind push would publish mixed local work to a public repository. The bundle preserves committed refs only; the working-tree snapshot is required to preserve tracked, staged, and Git-visible untracked work. Ignored files are intentionally not included in the untracked archive. Commit preparation, branch switching, tag creation, public-review artifacts, final public push, release publication, and updater-feed changes remain unapproved until their own named approval packets exist and pass. The final public push requires A2a preservation, A2b public-release review, a reviewed exposure-scan disposition, and a green release-verification artifact.

## A3: Plugin Deployed State

Current evidence:

- `/Users/afar/dev/fieldtheory-plugin` is on `main` at `4d7b20a`.
- The plugin repo is dirty with modified manifest, server, smoke test, docs, installer, and untracked skill files.
- `/Users/afar/plugins/field-theory` and `/Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607` are byte-identical.
- `/Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418` is not byte-identical to the installed plugin. It differs in `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`.
- The dev bundle path still uses the old version-stamped directory name `0.1.0+codex.20260528062418`.
- No `/Users/afar/dev/fieldtheory-plugin/plugin` directory exists yet.
- July 2 12:14Z direct read-only preflight confirmed installed plugin source and Codex cache are still byte-identical. It also confirmed the dev bundle still differs from installed source in `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`, sibling `agents/openai.yaml` files are present in installed/cache state, the dev repo has untracked follow-on sibling skill files with status SHA-256 `39c3d661ab278fa7c597f092f3f850738334315e78ce8d7f507435838158dc76`, the `plugin/` directory is still absent, and the accidental `/private/tmp/a3_dev_files.txt` and `/private/tmp/a3_installed_files.txt` scratch files still exist.

A3 is not complete. The installed source and cache are currently observable and byte-identical, but A3a is not complete until the approved installed/cache snapshot exists and its checksums are written. Any later preservation commit requires its own named approval packet and does not substitute for A3a. The dev repo already contains follow-on fixes. Preserve these as separate logical slices instead of committing everything at once, and do not delete the `/private/tmp/a3_dev_files.txt` or `/private/tmp/a3_installed_files.txt` scratch files without explicit cleanup approval.

Read-only verification:

```bash
git -C /Users/afar/dev/fieldtheory-plugin status --short --branch --untracked-files=all
diff -qr /Users/afar/plugins/field-theory /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607
diff -qr /Users/afar/dev/fieldtheory-plugin/0.1.0+codex.20260528062418 /Users/afar/plugins/field-theory
```

Approval-only installed-state snapshot:

Do not run this preservation block unless Andrew has just said `approve A3a plugin installed-state snapshot` and a fresh A3a read-only preflight has been rerun in the same execution shell immediately before use and still matches.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
set -euo pipefail

PLUGIN_SNAPSHOT="$HOME/Desktop/fieldtheory-plugin-installed-$(date -u +%Y%m%dT%H%M%SZ)"
test ! -e "$PLUGIN_SNAPSHOT"
mkdir "$PLUGIN_SNAPSHOT"
mkdir "$PLUGIN_SNAPSHOT/installed" "$PLUGIN_SNAPSHOT/cache"
rsync -a /Users/afar/plugins/field-theory/ "$PLUGIN_SNAPSHOT/installed/"
rsync -a /Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607/ "$PLUGIN_SNAPSHOT/cache/"
diff -qr "$PLUGIN_SNAPSHOT/installed" "$PLUGIN_SNAPSHOT/cache"
(
  cd "$PLUGIN_SNAPSHOT"
  find installed cache -type f -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS
)
```

Approval-only operation shape:

Do not run commit, rename, install, or cache-mutation work from this outline. Later A3 work needs its own named approval packet with an exact approval phrase.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
# First materialize the exact installed/cache state as either a committed preservation slice or the immutable snapshot above.
# Then commit the version-source/readiness fixes separately.
# Then rename the version-stamped bundle directory to plugin/.
# Then install only after approving cache mutation.

# Rollback shape if an approved install regresses. This is not part of A3a and also needs a later named approval packet with an exact approval phrase.
# That later packet must name the exact snapshot/cache source and destination before any destructive sync runs.
```

Do not run `install.sh` without approval. It removes and rewrites the Codex plugin cache destination.

## A4: Waist Backup Before Migration

Current evidence:

- `~/.fieldtheory` is about 617 MB by itself.
- `~/.fieldtheory/bookmarks` is a symlink to `~/.ft-bookmarks`.
- `~/.ft-bookmarks` is about 54 GB, mostly `media/`.
- `~/.ft-bookmarks/md` points back to `~/.fieldtheory/library`.
- `rsync` exists at `/usr/bin/rsync`.
- `restic` was not found on `PATH`.
- No Field Theory `restic` or `rsync` backup LaunchAgent/cron job was found.
- No restore-drill artifact was found.
- Time Machine knows an `Extreme SSD` destination, but `/Volumes/Extreme SSD` was not mounted during this checkpoint.
- July 2 09:48Z read-only preflight confirmed `/Volumes/Extreme SSD` is still absent, not mounted, not writable, and not known to `diskutil info`; `restic` is still missing; no Field Theory restic/backup scheduler evidence exists; and no restore-drill artifacts exist under `~/.fieldtheory` or `~/.ft-bookmarks`. Time Machine still knows an `Extreme SSD` destination, but that is not a mounted writable backup target for A4. The broad `launchctl` match for `com.fieldtheory.app.ShipIt` is updater evidence, not backup scheduler evidence. Backup-looking local folders still exist, but they do not prove A4 restore safety. Future A4 preflight must verify mount identity from mount/disk metadata, not only a writable path.

A4 is user-paused until Andrew explicitly resumes it after connecting a backup disk. During the pause, do not ask for A4 approval, run A4 preflights, install backup tools, initialize repositories, back up, restore, or schedule backup work. The last pre-pause A4a preflight failed because the approved backup volume was not mounted or writable. A4b is also blocked because A4a has not passed and no restore-drill artifact exists. A4 is not complete until a scheduled encrypted backup exists, one scheduled run is observed, and a restore drill from that exact scheduled-run snapshot recovers one file from each root with matching hashes.

Preferred backup shape:

- Treat the source-plan shorthand "all of `~/.fieldtheory`" as an intent statement, not a literal single-root backup command. Because `~/.fieldtheory/bookmarks` is a symlink to `~/.ft-bookmarks`, A4 must explicitly cover both roots below.
- Use explicit roots: `~/.fieldtheory` and the real bookmark store `~/.ft-bookmarks`.
- Do not blindly follow symlinks because `~/.fieldtheory/bookmarks` and `~/.ft-bookmarks/md` form a cross-link between the two roots.
- Exclude rebuildable indexes and caches such as `bookmarks.db`, `twitter-bookmarks.db`, and `snapshot-cache.json`.
- Store the backup in an encrypted destination, because the waist contains private Library content, session state, and local agent context.
- Verify the approved backup volume by mount/disk metadata before backup work, not just by testing that `/Volumes/Extreme SSD` is a writable path.

Approval-only restic setup outline:

Do not run this setup block unless Andrew has explicitly resumed A4 after connecting a backup disk, Andrew has just said `approve A4a manual backup and restore drill`, and a fresh A4a preflight now PASSES: the approved volume is mounted, writable, and verified by mount/disk metadata. If A4 is still paused or the preflight still matches the current failing state, stop.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
export RESTIC_REPOSITORY="/Volumes/Extreme SSD/FieldTheory/restic"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/fieldtheory-waist.pass"
test -d "/Volumes/Extreme SSD" || { echo "Mount the backup volume first."; exit 1; }
test -w "/Volumes/Extreme SSD" || { echo "Backup volume is not writable."; exit 1; }
mount | rg ' on /Volumes/Extreme SSD ' >/dev/null || { echo "Backup volume mount identity was not verified."; exit 1; }
diskutil info "/Volumes/Extreme SSD" >/dev/null || { echo "Backup volume disk metadata was not verified."; exit 1; }
command -v restic >/dev/null || { echo "restic is missing; stop unless one-time approval explicitly names installing restic."; exit 1; }
umask 077
mkdir -p ~/.config/restic ~/.local/bin ~/Library/Logs
chmod 700 ~/.config/restic
read -rsp "Restic password: " RESTIC_PASSWORD
printf '\n'
printf '%s\n' "$RESTIC_PASSWORD" > ~/.config/restic/fieldtheory-waist.pass
unset RESTIC_PASSWORD
chmod 600 ~/.config/restic/fieldtheory-waist.pass
mkdir -p "/Volumes/Extreme SSD/FieldTheory/restic"
restic init
```

Approval-only backup command shape:

Do not run this backup block unless Andrew has explicitly resumed A4 after connecting a backup disk, Andrew has just said `approve A4a manual backup and restore drill`, and a fresh A4a preflight now PASSES: the approved volume is mounted, writable, and verified by mount/disk metadata. If A4 is still paused or the preflight still matches the current failing state, stop.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
set -euo pipefail
export RESTIC_REPOSITORY="/Volumes/Extreme SSD/FieldTheory/restic"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/fieldtheory-waist.pass"
test -d "/Volumes/Extreme SSD" || { echo "Mount the backup volume first."; exit 1; }
test -w "/Volumes/Extreme SSD" || { echo "Backup volume is not writable."; exit 1; }
mount | rg ' on /Volumes/Extreme SSD ' >/dev/null || { echo "Backup volume mount identity was not verified."; exit 1; }
diskutil info "/Volumes/Extreme SSD" >/dev/null || { echo "Backup volume disk metadata was not verified."; exit 1; }
test -f "$RESTIC_PASSWORD_FILE" || { echo "Missing restic password file."; exit 1; }

BOOKMARKS_REAL="$(readlink "$HOME/.fieldtheory/bookmarks" 2>/dev/null || printf '%s\n' "$HOME/.fieldtheory/bookmarks")"

BACKUP_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
FIELD_DRILL="$HOME/.fieldtheory/backup-drill/restore-drill-$BACKUP_RUN_ID.txt"
BOOKMARKS_DRILL="$BOOKMARKS_REAL/backup-drill/restore-drill-$BACKUP_RUN_ID.txt"
BACKUP_DRILL_MANIFEST="$HOME/.fieldtheory/backup-drill/latest-restore-drill.txt"
BACKUP_LOG="$HOME/.fieldtheory/backup-drill/backup-$BACKUP_RUN_ID.jsonl"
mkdir -p "$(dirname "$FIELD_DRILL")" "$(dirname "$BOOKMARKS_DRILL")"
printf 'Field Theory home restore drill %s\n' "$(date -u +%FT%TZ)" > "$FIELD_DRILL"
printf 'Field Theory bookmarks restore drill %s\n' "$(date -u +%FT%TZ)" > "$BOOKMARKS_DRILL"
FIELD_SHA="$(shasum -a 256 "$FIELD_DRILL" | awk '{print $1}')"
BOOKMARKS_SHA="$(shasum -a 256 "$BOOKMARKS_DRILL" | awk '{print $1}')"

restic backup "$HOME/.fieldtheory" "$BOOKMARKS_REAL" \
  --tag fieldtheory-waist \
  --exclude "$BOOKMARKS_REAL/bookmarks.db" \
  --exclude "$BOOKMARKS_REAL/snapshot-cache.json" \
  --exclude "$BOOKMARKS_REAL/twitter-bookmarks.db" \
  --exclude "$HOME/.fieldtheory/ideas/adjacent/cache" \
  --exclude "**/.DS_Store" \
  --exclude "**/__pycache__" \
  --json | tee "$BACKUP_LOG"

SNAPSHOT_ID="$(node -e "const fs=require('fs'); const rows=fs.readFileSync(process.argv[1], 'utf8').trim().split(/\n+/).filter(Boolean).map(JSON.parse); const summary=rows.find((row) => row.message_type === 'summary' && row.snapshot_id); if (!summary) process.exit(1); console.log(summary.snapshot_id);" "$BACKUP_LOG")"
test -n "$SNAPSHOT_ID"
printf '%s\n' "$SNAPSHOT_ID" > "$HOME/.fieldtheory/backup-drill/latest-snapshot-id.txt"
{
  printf 'SNAPSHOT_ID=%s\n' "$SNAPSHOT_ID"
  printf 'FIELD_DRILL=%s\n' "$FIELD_DRILL"
  printf 'BOOKMARKS_DRILL=%s\n' "$BOOKMARKS_DRILL"
  printf 'FIELD_SHA256=%s\n' "$FIELD_SHA"
  printf 'BOOKMARKS_SHA256=%s\n' "$BOOKMARKS_SHA"
  printf 'BOOKMARKS_REAL=%s\n' "$BOOKMARKS_REAL"
} > "$BACKUP_DRILL_MANIFEST"
```

Restore drill shape:

Do not run this restore-drill block unless Andrew has explicitly resumed A4 after connecting a backup disk, Andrew has just said `approve A4a manual backup and restore drill`, and a fresh A4a preflight now PASSES: the approved volume is mounted, writable, and verified by mount/disk metadata. If A4 is still paused or the preflight still matches the current failing state, stop.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
set -euo pipefail
export RESTIC_REPOSITORY="/Volumes/Extreme SSD/FieldTheory/restic"
export RESTIC_PASSWORD_FILE="$HOME/.config/restic/fieldtheory-waist.pass"
test -d "/Volumes/Extreme SSD" || { echo "Mount the backup volume first."; exit 1; }
test -w "/Volumes/Extreme SSD" || { echo "Backup volume is not writable."; exit 1; }
mount | rg ' on /Volumes/Extreme SSD ' >/dev/null || { echo "Backup volume mount identity was not verified."; exit 1; }
diskutil info "/Volumes/Extreme SSD" >/dev/null || { echo "Backup volume disk metadata was not verified."; exit 1; }
test -f "$RESTIC_PASSWORD_FILE" || { echo "Missing restic password file."; exit 1; }

BOOKMARKS_REAL="$(readlink "$HOME/.fieldtheory/bookmarks" 2>/dev/null || printf '%s\n' "$HOME/.fieldtheory/bookmarks")"

# The approved backup command must create these drill files before backup, then capture the snapshot id that contains them.
BACKUP_DRILL_MANIFEST="$HOME/.fieldtheory/backup-drill/latest-restore-drill.txt"
test -f "$BACKUP_DRILL_MANIFEST"
SNAPSHOT_ID="$(sed -n 's/^SNAPSHOT_ID=//p' "$BACKUP_DRILL_MANIFEST")"
FIELD_DRILL="$(sed -n 's/^FIELD_DRILL=//p' "$BACKUP_DRILL_MANIFEST")"
BOOKMARKS_DRILL="$(sed -n 's/^BOOKMARKS_DRILL=//p' "$BACKUP_DRILL_MANIFEST")"
FIELD_SHA="$(sed -n 's/^FIELD_SHA256=//p' "$BACKUP_DRILL_MANIFEST")"
BOOKMARKS_SHA="$(sed -n 's/^BOOKMARKS_SHA256=//p' "$BACKUP_DRILL_MANIFEST")"
test -n "$SNAPSHOT_ID"
test -n "$FIELD_DRILL"
test -n "$BOOKMARKS_DRILL"
test -n "$FIELD_SHA"
test -n "$BOOKMARKS_SHA"
test -f "$FIELD_DRILL"
test -f "$BOOKMARKS_DRILL"
rm "$FIELD_DRILL" "$BOOKMARKS_DRILL"
RESTORE_DRILL_DIR="$(mktemp -d /tmp/fieldtheory-restore-drill.XXXXXX)"
restic restore "$SNAPSHOT_ID" --target "$RESTORE_DRILL_DIR" --include "$FIELD_DRILL" --include "$BOOKMARKS_DRILL"

FIELD_RESTORED="$RESTORE_DRILL_DIR$FIELD_DRILL"
BOOKMARKS_RESTORED="$RESTORE_DRILL_DIR$BOOKMARKS_DRILL"
test "$FIELD_SHA" = "$(shasum -a 256 "$FIELD_RESTORED" | awk '{print $1}')"
test "$BOOKMARKS_SHA" = "$(shasum -a 256 "$BOOKMARKS_RESTORED" | awk '{print $1}')"
cp "$FIELD_RESTORED" "$FIELD_DRILL"
cp "$BOOKMARKS_RESTORED" "$BOOKMARKS_DRILL"
printf 'restore drill passed %s repo=%s snapshot=%s roots=%s,%s field_sha256=%s bookmarks_sha256=%s\n' \
  "$(date -u +%FT%TZ)" "$RESTIC_REPOSITORY" "$SNAPSHOT_ID" "$HOME/.fieldtheory" "$BOOKMARKS_REAL" "$FIELD_SHA" "$BOOKMARKS_SHA" \
  > "$HOME/.fieldtheory/backup-drill/restore-drill-artifact.txt"
```

Scheduling is still required after the first manual backup and restore drill pass. Andrew approval is required before installing or loading a launchd plist, cron entry, or equivalent scheduled job. Review the exact script, plist, log path, restic repository, retention policy, and restore-drill artifact before scheduling anything. A4 is not complete until a scheduled encrypted backup job is installed or loaded, one scheduled run is observed, that scheduled run's snapshot ID is recorded, and a restore drill from that exact scheduled-run snapshot passes, unless Andrew says the exact phrase `waive A4 scheduled-backup gate after manual backup and restore drill`; without that exact waiver phrase, do not call A4 complete and do not use A4 to unblock B3/B4/F1 or Phase 1+.

## A5: Constellation Cleanup

Current evidence:

- `~/dev` currently has 59 Field Theory-family dirs by the July 2 review pattern.
- Worktree records across the four target repos currently total 60: `fieldtheory-oss` 12, `fieldtheory` 17, `fieldtheory-cli` 30, and `fieldtheory-plugin` 1.
- `/private/tmp` currently has five `fieldtheory-cli-*` directories visible by name.
- `/Users/afar/dev/oscar` is about 74 GB, behind its stale local `origin/main` by 4, and has untracked plan/log/model files.
- `/Users/afar/dev/old-field` is about 1.8 GB and is dirty/untracked.
- `/Users/afar/dev/oscar-pr-101-preserved` is about 769 MB and has modified tracked files.
- `/Users/afar/dev/littleai` is a tiny non-Git directory.
- `/Users/afar/dev/fieldtheory-labs.oscar-mirror.git` is stale for archive purposes; its current `HEAD` is `1454e11c`, 6 commits behind local `oscar`, 10 commits behind stale local `origin/main`, and 12 commits behind live GitHub `origin/main` at `f81481ff9824ddb4fa252ed93933d9bc815dc930`.
- June-7 cleanup candidates still present include `fieldtheory-private-remote-verify`, `fieldtheory-public-candidate*`, `fieldtheory-release-artifacts-preserved`, `fieldtheory-worktrees`, `littleai`, `old-field`, and `oscar-pr-101-preserved`.
- `/Users/afar/dev/fieldtheory-labs-ios-native-archive` is still explicitly protected until A1 is verified.
- July 2 12:14Z direct read-only preflight confirmed the directory count, target-sensitive directory list, 17 prunable `fieldtheory-cli` worktree records, 5 private tmp candidates, dirty/preserved candidates, stale local Oscar remote ref, protected iOS archive presence, and stale `oscar` mirror state against live GitHub `origin/main` still match the cleanup blocker. The per-repo worktree tuple drifted to `fieldtheory-oss=12`, `fieldtheory=17`, `fieldtheory-cli=30`, `fieldtheory-plugin=1`, total `60`. The local `oscar` worktree is on `main` at `615d081171a4d2d6df5ed1d790c4f13a58a11618`, behind stale local `origin/main` by 4 commits; stale local `origin/main` is `2448e3d2f9460b867a5e3aa8c08f2df978840e3d`; live GitHub `origin/main` is `f81481ff9824ddb4fa252ed93933d9bc815dc930`; the mirror at `1454e11c9b0b47b30b4ef0b356f334d2d6b8bb28` is 12 commits behind live GitHub `origin/main`; and GitHub compare reports `{status: ahead, ahead_by: 12, behind_by: 0, total_commits: 12}`.

A5 is not cleanup-ready. `oscar`, `old-field`, `oscar-pr-101-preserved`, and `littleai` need target-specific preservation decisions before deletion.

Read-only verification:

```bash
find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | sort
test "$(find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | wc -l | tr -d ' ')" = "59"
find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | sort
EXPECTED_TARGETS="/Users/afar/dev/littleai
/Users/afar/dev/old-field
/Users/afar/dev/oscar
/Users/afar/dev/oscar-pr-101-preserved"
test "$(find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | sort)" = "$EXPECTED_TARGETS"
test "$(find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | wc -l | tr -d ' ')" = "4"
git -C /Users/afar/dev/fieldtheory-oss worktree list --porcelain
test "$(git -C /Users/afar/dev/fieldtheory-oss worktree list --porcelain | rg '^worktree ' | wc -l | tr -d ' ')" = "12"
git -C /Users/afar/dev/fieldtheory worktree list --porcelain
test "$(git -C /Users/afar/dev/fieldtheory worktree list --porcelain | rg '^worktree ' | wc -l | tr -d ' ')" = "17"
git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain
test "$(git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain | rg '^worktree ' | wc -l | tr -d ' ')" = "30"
git -C /Users/afar/dev/fieldtheory-plugin worktree list --porcelain
test "$(git -C /Users/afar/dev/fieldtheory-plugin worktree list --porcelain | rg '^worktree ' | wc -l | tr -d ' ')" = "1"
test "$(git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain | rg '^worktree /private/tmp/fieldtheory-cli-' | wc -l | tr -d ' ')" = "17"
find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print
EXPECTED_TMP_DIRS="/private/tmp/fieldtheory-cli-ci-config
/private/tmp/fieldtheory-cli-ci-data
/private/tmp/fieldtheory-cli-ci-home
/private/tmp/fieldtheory-cli-current-context-pr
/private/tmp/fieldtheory-cli-origin-main-publish-check"
test "$(find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print | sort)" = "$EXPECTED_TMP_DIRS"
test "$(find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print | wc -l | tr -d ' ')" = "5"
git -C /Users/afar/dev/oscar status --short --branch --untracked-files=all
MIRROR_HEAD="$(git --git-dir=/Users/afar/dev/fieldtheory-labs.oscar-mirror.git rev-parse HEAD)"
LIVE_OSCAR_MAIN="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/oscar ls-remote origin refs/heads/main | awk '{print $1}')"
printf 'mirror=%s live_origin_main=%s\n' "$MIRROR_HEAD" "$LIVE_OSCAR_MAIN"
gh api "repos/afar1/oscar/compare/$MIRROR_HEAD...$LIVE_OSCAR_MAIN" --jq '{status: .status, ahead_by: .ahead_by, behind_by: .behind_by, total_commits: .total_commits}'
test -d /Users/afar/dev/fieldtheory-labs-ios-native-archive
```

Approval-only manifest-only operation shape:

Do not run this manifest block unless Andrew has just said `approve A5a cleanup manifest only` and a fresh A5a read-only preflight has been rerun in the same execution shell immediately before use and still matches.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
set -euo pipefail

CLEANUP_MANIFEST="$HOME/Desktop/fieldtheory-a5-cleanup-preservation-manifest-$(date -u +%Y%m%dT%H%M%SZ).md"
test ! -e "$CLEANUP_MANIFEST"
MIRROR_HEAD="$(git --git-dir=/Users/afar/dev/fieldtheory-labs.oscar-mirror.git rev-parse HEAD)"
LIVE_OSCAR_MAIN="$(GIT_TERMINAL_PROMPT=0 git -C /Users/afar/dev/oscar ls-remote origin refs/heads/main | awk '{print $1}')"
OSCAR_COMPARE="$(gh api "repos/afar1/oscar/compare/$MIRROR_HEAD...$LIVE_OSCAR_MAIN" --jq '{status: .status, ahead_by: .ahead_by, behind_by: .behind_by, total_commits: .total_commits}')"

printf '# Field Theory A5 cleanup preservation manifest\n\n' > "$CLEANUP_MANIFEST"
printf 'Every candidate enumerated by the fresh A5a preflight needs a current evidence status and a future target-specific preservation decision path. This packet creates no bundles, archives, waivers, deletes, prunes, or moves.\n\n' >> "$CLEANUP_MANIFEST"

printf '## Fresh A5a preflight inventory\n\n' >> "$CLEANUP_MANIFEST"
printf '### Field Theory-family directories\n\n' >> "$CLEANUP_MANIFEST"
find /Users/afar/dev -maxdepth 1 -type d -iname '*field*' -print | sort >> "$CLEANUP_MANIFEST"
printf '%s\n' '- Every Field Theory-family directory listed above requires a later keep/delete/no-preserve decision before cleanup; this manifest does not approve deletion.' >> "$CLEANUP_MANIFEST"
printf '\n### Exact target-sensitive directories\n\n' >> "$CLEANUP_MANIFEST"
find /Users/afar/dev -maxdepth 1 -type d \( -name 'littleai' -o -name 'oscar' -o -name 'oscar-pr-101-preserved' -o -name 'old-field' \) -print | sort >> "$CLEANUP_MANIFEST"

printf '\n### Worktree records\n\n' >> "$CLEANUP_MANIFEST"
git -C /Users/afar/dev/fieldtheory-oss worktree list --porcelain >> "$CLEANUP_MANIFEST"
printf '\n' >> "$CLEANUP_MANIFEST"
git -C /Users/afar/dev/fieldtheory worktree list --porcelain >> "$CLEANUP_MANIFEST"
printf '\n' >> "$CLEANUP_MANIFEST"
git -C /Users/afar/dev/fieldtheory-cli worktree list --porcelain >> "$CLEANUP_MANIFEST"
printf '\n' >> "$CLEANUP_MANIFEST"
git -C /Users/afar/dev/fieldtheory-plugin worktree list --porcelain >> "$CLEANUP_MANIFEST"
printf '\n' >> "$CLEANUP_MANIFEST"

printf '\n## Target-specific preservation status\n\n' >> "$CLEANUP_MANIFEST"
printf '### /Users/afar/dev/oscar\n\n' >> "$CLEANUP_MANIFEST"
git -C /Users/afar/dev/oscar status --short --branch --untracked-files=all >> "$CLEANUP_MANIFEST"
printf 'mirror=%s live_origin_main=%s\n' "$MIRROR_HEAD" "$LIVE_OSCAR_MAIN" >> "$CLEANUP_MANIFEST"
printf 'compare=%s\n' "$OSCAR_COMPARE" >> "$CLEANUP_MANIFEST"
printf '%s\n' '- Future packet must approve mirror refresh plus dirty/untracked preservation, or an explicit no-preserve decision, before deletion.' >> "$CLEANUP_MANIFEST"
printf '\n' >> "$CLEANUP_MANIFEST"
printf '### /Users/afar/dev/old-field\n\n' >> "$CLEANUP_MANIFEST"
git -C /Users/afar/dev/old-field status --short --branch --untracked-files=all >> "$CLEANUP_MANIFEST" 2>&1 || true
printf '%s\n' '- Future packet must approve archive/bundle preservation, or an explicit no-preserve decision, before deletion.' >> "$CLEANUP_MANIFEST"
printf '\n' >> "$CLEANUP_MANIFEST"
printf '### /Users/afar/dev/oscar-pr-101-preserved\n\n' >> "$CLEANUP_MANIFEST"
git -C /Users/afar/dev/oscar-pr-101-preserved status --short --branch --untracked-files=all >> "$CLEANUP_MANIFEST" 2>&1 || true
printf '%s\n' '- Future packet must approve archive/bundle preservation, or an explicit no-preserve decision, before deletion.' >> "$CLEANUP_MANIFEST"
printf '\n' >> "$CLEANUP_MANIFEST"
printf '### /Users/afar/dev/littleai\n\n' >> "$CLEANUP_MANIFEST"
printf '%s\n' '- /Users/afar/dev/littleai: non-Git directory; future packet must approve full archive or an explicit no-preserve decision before deletion.' >> "$CLEANUP_MANIFEST"
printf '\n### /Users/afar/dev/fieldtheory-labs-ios-native-archive\n\n' >> "$CLEANUP_MANIFEST"
printf '%s\n' '- Protected until A1 is verified; not a deletion target for A5a.' >> "$CLEANUP_MANIFEST"

printf '\n/private/tmp fieldtheory-cli-* candidates:\n' >> "$CLEANUP_MANIFEST"
find /private/tmp -maxdepth 1 -type d -name 'fieldtheory-cli-*' -print | sort >> "$CLEANUP_MANIFEST"
printf '%s\n' '- /private/tmp fieldtheory-cli-* candidates: listed above; deletion requires later exact target-specific approval.' >> "$CLEANUP_MANIFEST"

# Prune worktree metadata in each repo only after a later exact target-specific approval.
# Delete /private/tmp shells only after a later exact target-specific approval.
# Do not delete oscar until the bare mirror is refreshed and verified and dirty/untracked preservation has been reviewed.
# Do not delete any target until it is listed in the cleanup preservation manifest with a reviewed preservation decision.
```

## A6: Review Debris

Current evidence:

- `/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1` is already missing.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` still exists, is a zero-byte regular file, is not a symlink, and predates the review.
- July 2 12:14Z direct read-only preflight confirmed the same optional-quarantine state. `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` is inode `70248019`, size `0`, modified `Apr 12 14:48:42 2026`, has machine-readable tuple `70248019 0 1776019722 Regular File`, is a regular file, and is not a symlink.

A6 has only optional quarantine remaining. The remaining candidate is discretionary quarantine of the pre-existing zero-byte `twitter-bookmarks.db`; do not delete it directly.

Approval-only quarantine operation:

Do not run this quarantine block unless Andrew has just said `approve A6a review-debris quarantine` and a fresh A6a read-only preflight has been rerun in the same execution shell immediately before use and still matches.

Template only. Do not paste from this document. After Andrew's exact phrase, create a one-time execution packet and rerun preflight in that same shell immediately before use.

```text
set -euo pipefail
TARGET="/Users/afar/.ft-bookmarks/twitter-bookmarks.db"
QUARANTINE="$HOME/Desktop/fieldtheory-review-debris-$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$QUARANTINE/twitter-bookmarks.db"

test ! -e "$QUARANTINE"
mkdir "$QUARANTINE"
test -d "$QUARANTINE"
test ! -L "$QUARANTINE"
test ! -e "$DEST"

APPROVED_TUPLE="70248019 0 1776019722 Regular File"
FRESH_TUPLE="$(stat -f '%i %z %m %HT' "$TARGET")"
test "$FRESH_TUPLE" = "$APPROVED_TUPLE"
test ! -L "$TARGET"
stat -f '%N inode=%i size=%z modified_epoch=%m type=%HT' "$TARGET"

mv "$TARGET" "$DEST"

DEST_TUPLE="$(stat -f '%i %z %m %HT' "$DEST")"
test "$DEST_TUPLE" = "$FRESH_TUPLE"
test ! -L "$DEST"
test ! -e "$TARGET"
stat -f '%N inode=%i size=%z modified_epoch=%m type=%HT' "$DEST"
```
