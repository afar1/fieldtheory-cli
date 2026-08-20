# A6a Approval Request: Optional Review-Debris Quarantine

Status: request-only. No approval packet has been executed.

## Exact Approval Phrase

Andrew must say this exact phrase before the A6a packet can run:

```text
approve A6a review-debris quarantine
```

Do not treat nearby wording, summaries, or this file as approval.

## Goal

Optionally quarantine the pre-existing zero-byte `twitter-bookmarks.db` review-debris candidate without deleting it and without touching any other bookmark, media, backup, migration, or cleanup surface.

## Current Evidence

Current evidence as of July 2 12:14Z:

- `/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1` is absent.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` exists.
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` is a regular file, not a symlink.
- Its inode is `70248019`.
- Its size is `0`.
- Its modified time is `Apr 12 14:48:42 2026`.
- Its machine-readable identity tuple from `stat -f '%i %z %m %HT'` is `70248019 0 1776019722 Regular File`.
- `ls -lO` reports `-rw-r--r--@ 1 afar staff - 0 Apr 12 14:48 /Users/afar/.ft-bookmarks/twitter-bookmarks.db`.
- Sartre the 2nd independently verified the same evidence and returned A6a `ASK-ONLY`.
- Heisenberg the 2nd adversarially reviewed the packet boundary and found the checklist needed to pin this exact stat tuple; the checklist now does.
- Gauss the 2nd independently verified the 10:53Z evidence and returned A6a `ASK-ONLY` with no drift.
- Hilbert the 2nd adversarially reviewed the 10:53Z boundary and returned A6a GO after the required fresh same-shell preflight.
- Euclid the 2nd independently verified the 11:22Z evidence and returned A6a `ASK-ONLY` with no drift.
- Singer the 2nd adversarially reviewed the 11:22Z non-A1 queue and returned GO to report A6a as a limited askable packet only, behind A1 and with no execution approval.
- Curie the 2nd independently verified the 12:14Z evidence and returned A6a `ASK-ONLY` with no drift. Curie found `bookmarks.db?immutable=1` still absent and `twitter-bookmarks.db` still matching the exact tuple `70248019 0 1776019722 Regular File`.

## If Approved

A6a allows only:

- rerun the A6a read-only preflight in the same execution shell immediately before use;
- create a fresh timestamped Desktop quarantine directory that must not already exist;
- prove the destination file path does not already exist;
- prove the target file's `stat -f '%i %z %m %HT'` tuple is still `70248019 0 1776019722 Regular File` immediately before moving it;
- move only `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` into that fresh quarantine directory;
- prove the quarantined file exists, has the same inode, size, and modified time observed immediately before the move, remains a regular file, is not a symlink, and the original path is absent.

## Not Approved

A6a does not allow:

- deleting the file;
- touching any other bookmark database or media file;
- changing symlinks;
- running bookmark migrations;
- cloning, building, generating projects, installing tools, backing up, restoring, creating manifests, creating bundles, creating archives, creating snapshots, mutating plugin cache, tagging, publishing releases, scheduling jobs, running migrations, pruning worktrees, stashing, committing, pushing, or moving any path except the exact target file into the fresh quarantine directory;
- calling A5 or Phase 0 complete.

## Completion Evidence

A6a may be called complete only when:

- fresh preflight proves `twitter-bookmarks.db` still has the approved `stat -f '%i %z %m %HT'` tuple `70248019 0 1776019722 Regular File` and is not a symlink;
- the fresh quarantine directory exists and was not reused;
- `twitter-bookmarks.db` exists inside that quarantine directory;
- the quarantined file has the same inode, size, and modified time observed immediately before the move, is still a regular file, and is not a symlink;
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` is absent after the move.

This completes only the optional A6a quarantine. It does not complete A5, Phase 0, backup work, restore work, bookmark migration, or any broader cleanup.

## Stop Conditions

Stop and regenerate the request if any of these change:

- `/Users/afar/.ft-bookmarks/bookmarks.db?immutable=1` appears;
- `/Users/afar/.ft-bookmarks/twitter-bookmarks.db` is missing;
- `twitter-bookmarks.db` is a symlink, not a regular file, or has any `stat -f '%i %z %m %HT'` tuple other than `70248019 0 1776019722 Regular File`;
- the fresh quarantine directory or destination file path already exists during execution;
- any command would need to delete, touch any other bookmark/media file, change symlinks, run bookmark migrations, create manifests, bundles, archives, or snapshots, mutate plugin cache, tag, publish, schedule jobs, prune worktrees, stash, commit, push, back up, restore, or call A5 or Phase 0 complete.
