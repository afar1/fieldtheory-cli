# A3a Approval Request: Plugin Installed-State Snapshot

Status: request text only, with current evidence revalidated at 2026-07-02T12:14Z and no new drift. No approval packet has been executed.

## Exact Approval Phrase

Andrew must say this exact phrase before the A3a packet can run:

```text
approve A3a plugin installed-state snapshot
```

Do not treat nearby wording, summaries, or this file as approval.

## Goal

Durably snapshot the currently installed Field Theory plugin source and the Codex plugin cache before any dev-repo commit strategy, install, cache mutation, directory rename, or cleanup work.

## Current Evidence

July 2 09:56Z read-only refresh, revalidated at July 2 10:39Z, July 2 11:22Z, and July 2 12:14Z:

- `/Users/afar/dev/fieldtheory-plugin` is on `main...origin/main` at `4d7b20ae50659743802a28528a09c1fd1501a799`.
- The plugin repo is dirty with 7 tracked modified files and 12 Git-visible untracked files.
- The plugin repo `git status --porcelain --untracked-files=all` output has SHA-256 `39c3d661ab278fa7c597f092f3f850738334315e78ce8d7f507435838158dc76`.
- The recorded `git status --porcelain --untracked-files=all` output is the dirty-set authority; if the status hash changes, stop and regenerate instead of relying on dirty counts or broad descriptions.
- The plugin repo has untracked CI and follow-on sibling skill files under `0.1.0+codex.20260528062418/skills/`.
- `/Users/afar/plugins/field-theory` exists.
- `/Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607` exists.
- `diff -qr` between installed source and Codex cache returned no differences.
- The dev bundle still differs from installed source in exactly `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`.
- `/Users/afar/dev/fieldtheory-plugin/plugin` is absent.
- Installed source and Codex cache include sibling `skills/*/agents/openai.yaml` files.
- `/private/tmp/a3_dev_files.txt` and `/private/tmp/a3_installed_files.txt` still exist; deletion is not approved.
- Raman the 2nd independently verified the 09:56Z refresh and classified A3a as DRIFTED because the source-plan deployed/dev byte-identity premise is no longer true; the installed/cache snapshot packet itself remains meaningful because installed source and Codex cache are still byte-identical.
- Turing the 2nd adversarially reviewed the A3a boundary and found one guardrail gap: A3a must stop if plugin dev-repo branch, upstream, HEAD, dirty status, or untracked follow-on file set changes from this evidence. After the patch, Turing returned OK to report progress.
- Tesla the 2nd independently verified the 10:39Z refresh and returned ASK-ONLY for the installed/cache snapshot packet. Tesla found no new drift from the A3a packet and confirmed the broader dev-vs-installed three-file drift remains exactly as documented.
- Boole the 2nd adversarially reviewed the 10:39Z A3a boundary and returned GO to ask for preservation approval. Boole's guardrail hardening was applied to the A3a dirty-set authority, denial list, and snapshot copy template.
- Halley the 2nd independently verified the 11:22Z refresh and returned ASK-ONLY for the installed/cache snapshot packet. Halley found no new drift from the A3a packet and confirmed installed source and Codex cache still compare cleanly.
- Singer the 2nd adversarially reviewed the 11:22Z non-A1 queue and returned GO to report A3a as a limited askable packet only, behind A1 and with no execution approval.
- Linnaeus the 2nd independently verified the 12:14Z refresh and returned A3a ASK-ONLY. Linnaeus found the plugin dev repo status hash, HEAD/upstream, installed/cache identity, dev-vs-installed three-file drift, missing `plugin/` directory, and `/private/tmp/a3_*` scratch-file presence still match this request.

## If Approved

A3a allows only:

- rerun the A3a read-only preflight in the same execution shell immediately before use;
- create a new timestamped Desktop snapshot directory that must not already exist;
- copy `/Users/afar/plugins/field-theory/` into `installed/` inside that snapshot;
- copy `/Users/afar/.codex/plugins/cache/personal/field-theory/0.1.0+codex.20260620185607/` into `cache/` inside that snapshot;
- verify the two snapshot copies are byte-identical;
- write `SHA256SUMS` for `installed/` and `cache/` entries only.

## Not Approved

A3a does not allow:

- running `install.sh`;
- deleting or rewriting the Codex plugin cache;
- committing plugin repo changes;
- renaming the version-stamped bundle directory;
- deleting `/private/tmp/a3_dev_files.txt` or `/private/tmp/a3_installed_files.txt`;
- public or private pushes;
- migrations;
- backup or restore work;
- any later A3 commit, install, cache-mutation, cleanup, or release work;
- calling A3 complete.

## Completion Evidence

A3a may be called complete only when:

- the timestamped Desktop snapshot exists;
- `installed/` and `cache/` directories exist inside it;
- `diff -qr` between those snapshot copies is clean;
- `SHA256SUMS` exists and contains only `installed/` and `cache/` entries, with no self-entry for the checksum file.

This completes only the installed/cache snapshot. A3 remains incomplete until the deployed state is committed, version authority is single-sourced, release tagging is resolved, install behavior is separately approved, and the plugin repo is clean after install.

## Stop Conditions

Stop and regenerate the request if any of these change:

- plugin repo branch, upstream, HEAD, dirty status, or Git-visible untracked file set changes from the recorded 12:14Z evidence;
- plugin repo status hash changes from `39c3d661ab278fa7c597f092f3f850738334315e78ce8d7f507435838158dc76`;
- installed source or Codex cache path is missing;
- `diff -qr` between installed source and Codex cache is no longer clean;
- the Codex cache version path changes from `0.1.0+codex.20260620185607`;
- the dev bundle no longer differs from installed source only in `mcp-server/server.js`, `scripts/smoke-test.js`, and `skills/current-document/SKILL.md`;
- sibling `skills/*/agents/openai.yaml` files are missing from installed/cache state;
- `/Users/afar/dev/fieldtheory-plugin/plugin` appears before approval;
- `/private/tmp/a3_dev_files.txt` or `/private/tmp/a3_installed_files.txt` disappears before cleanup approval;
- the timestamped snapshot directory already exists during execution;
- any command would need to install, mutate cache, commit, rename directories, delete scratch files, push, migrate, back up, restore, or call A3 complete.
