# fieldtheory-cli likes trim command

## Plan

- [x] Unit 1: stop the old ad hoc bulk unlike process and snapshot current likes state
- [x] Unit 2: add throttled bulk likes trim primitives and efficient per-batch local reconciliation
- [x] Unit 3: expose `ft likes trim`, update docs, and keep help text aligned
- [x] Verification: run targeted tests and build, then validate the real archive count before execution
- [x] Execution: run the formal trim command until only the latest 200 likes remain
- [x] Review: record implementation and live execution results

## Notes

- Target branch: `feat/likes-archive`
- Origin plan: `docs/plans/2026-04-09-003-feat-likes-trim-command-plan.md`
- Scope boundary: likes-only bulk trim, with batch throttling and resumable execution from current local state

## Review
- Added `src/likes-trim.ts` to formalize bulk likes trimming, including trim planning by recency, per-batch remote unlike execution, and one local archive/index reconciliation per batch.
- Added `removeLikesFromArchive()` in `src/archive-actions.ts` so bulk removals rewrite `likes.jsonl`, update `likes-meta.json`, and rebuild `likes.db` once per batch instead of once per item.
- Added `ft likes trim` in `src/cli.ts` with `--keep`, `--batch-size`, `--pause-seconds`, `--rate-limit-backoff-seconds`, and `--max-rate-limit-retries`.
- Added 429-aware retry handling by introducing `RemoteTweetActionError` in `src/graphql-actions.ts` and automatic backoff/retry inside `src/likes-trim.ts`.
- Updated `README.md` and `docs/README.md` for the new formal bulk-trim command and plan entry.
- Verification passed:
  - `npm test -- tests/archive-actions.test.ts`
  - `npm test -- tests/cli-actions.test.ts`
  - `npm run build`
- Live execution results:
  - Current likes before formal run: `530`
  - Real command executed: `node dist/cli.js likes trim --keep 200 --batch-size 20 --pause-seconds 30 --rate-limit-backoff-seconds 300 --max-rate-limit-retries 5`
  - Initial first attempt hit `429` immediately; command was enhanced with automatic rate-limit backoff and retry.
  - Final live run removed `330` older likes successfully.
  - Final local verification:
    - `likes.jsonl` count: `200`
    - `node dist/cli.js likes status` reports `likes: 200`
    - oldest kept like id: `2020906224792027164`
