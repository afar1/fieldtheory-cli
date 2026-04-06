# Plan: Bookmark Folder Support for fieldtheory-cli

## Context

fieldtheory-cli currently syncs X/Twitter bookmarks via the GraphQL `Bookmarks` endpoint into a flat list. X Premium users can organize bookmarks into named folders, but the tool has no awareness of folders. This plan adds full folder support: listing folders, syncing per-folder, and querying by folder.

## Discovery Summary

We intercepted live X web app network requests and confirmed three endpoints:

| Endpoint | Query ID | Key Variable | Response Path |
|----------|----------|--------------|---------------|
| `BookmarkFoldersSlice` | `i78YDd0Tza-dV4SYs58kRg` | `{}` | `data.viewer.user_results.result.bookmark_collections_slice.items` |
| `BookmarkFolderTimeline` | `LML09uXDwh87F1zd7pbf2w` | `bookmark_collection_id` | `data.bookmark_collection_timeline.timeline.instructions` |
| `Bookmarks` (all) | `YCrjINs3IPbkSl5FQf_tpA` | `count` | `data.bookmark_timeline_v2.timeline.instructions` |

## Changes

### 1. Update GraphQL constants (`src/graphql-bookmarks.ts`)

- `BOOKMARKS_QUERY_ID`: `Z9GWmP0kP2dajyckAaDUBw` → `YCrjINs3IPbkSl5FQf_tpA`
- `GRAPHQL_FEATURES`: Replace with current features set (see appendix). **Keep `graphql_timeline_v2_bookmark_timeline: true`** as a safety measure — it's absent from the live app but may still be required by the old Bookmarks endpoint.
- Add new constants:
  - `BOOKMARK_FOLDERS_QUERY_ID = 'i78YDd0Tza-dV4SYs58kRg'`
  - `BOOKMARK_FOLDERS_OPERATION = 'BookmarkFoldersSlice'`
  - `BOOKMARK_FOLDER_TIMELINE_QUERY_ID = 'LML09uXDwh87F1zd7pbf2w'`
  - `BOOKMARK_FOLDER_TIMELINE_OPERATION = 'BookmarkFolderTimeline'`

### 2. Add folder types (`src/types.ts`)

```typescript
export interface BookmarkFolder {
  id: string;
  name: string;
  mediaUrl?: string;
}
```

Add to `BookmarkRecord`:
```typescript
folderIds?: string[];
folderNames?: string[];
```

### 3. Add folder API functions (`src/graphql-bookmarks.ts`)

#### `fetchBookmarkFolders(csrfToken, cookieHeader?): Promise<BookmarkFolder[]>`
- Calls `BookmarkFoldersSlice`, returns `{ id, name, mediaUrl }[]`
- Single request, no pagination needed

#### Refactor: extract `parseTimelineInstructions(instructions, now): PageResult`
- Shared parser for both `parseBookmarksResponse` and `parseBookmarkFolderResponse`
- `parseBookmarksResponse` reads from `data.bookmark_timeline_v2.timeline.instructions`
- `parseBookmarkFolderResponse` reads from `data.bookmark_collection_timeline.timeline.instructions`
- Both delegate to `parseTimelineInstructions` for the actual entry/cursor parsing
- Eliminates duplication

#### Update `buildUrl` → split into `buildBookmarksUrl(cursor?)` and `buildFolderTimelineUrl(folderId, cursor?)`
- Different query IDs and operation names require separate URL builders
- `buildFolderTimelineUrl` uses `bookmark_collection_id` variable and `includePromotedContent: true`

#### Update `fetchPageWithRetry(csrfToken, cursor?, cookieHeader?, folderId?)`
- When `folderId` is set, uses `buildFolderTimelineUrl` + `parseBookmarkFolderResponse`
- Otherwise uses existing `buildBookmarksUrl` + `parseBookmarksResponse`

### 4. Folder-aware sync logic (`src/graphql-bookmarks.ts`)

#### `SyncOptions` additions:
```typescript
folderId?: string;
folderName?: string;  // resolved name, attached to records
```

#### Stop-condition fix for folder mode:
- Track `touched` count (records where folder metadata was added/updated) in addition to `added` (genuinely new records)
- Stale-page detection in folder mode uses `added === 0 && touched === 0` instead of just `added === 0`
- Folder syncs default to `incremental: false` since `newestKnownId` is global and would cause premature stops

#### Folder metadata attachment:
- Each record synced from a folder gets `folderIds: [folderId]` and `folderNames: [folderName]`

### 5. Folder-aware merge logic (`src/graphql-bookmarks.ts`)

Update `mergeBookmarkRecord`:
- `folderIds`: union of both arrays (deduplicated)
- `folderNames`: union of both arrays (deduplicated)
- Must be implemented **before** any folder sync runs

### 6. Database changes (`src/bookmarks-db.ts`)

#### Schema migration:
- Bump `SCHEMA_VERSION` from 3 to 4
- Add migration branch `version < 4` in `ensureMigrations`:
  ```sql
  ALTER TABLE bookmarks ADD COLUMN folder_ids TEXT;
  ALTER TABLE bookmarks ADD COLUMN folder_names TEXT;
  ```
- FTS5: `folder_names` does NOT need to be added to the FTS table — folder filtering uses exact match on the main table, not full-text search. This avoids FTS rebuild complexity.

#### Update `insertRecord`:
- Add `folder_ids` and `folder_names` to the INSERT (32 placeholders, was 30)
- Values: `record.folderIds?.join(',') ?? null` and `record.folderNames?.join(',') ?? null`

#### Add `updateFolderMetadata(db, id, folderIds, folderNames)`:
- Targeted UPDATE that only touches folder columns:
  ```sql
  UPDATE bookmarks SET folder_ids = ?, folder_names = ? WHERE id = ?
  ```
- Used by `buildIndex` for records that already exist in the DB but have new folder data in JSONL

#### Update `buildIndex`:
- After inserting new records, scan skipped (existing) records for folder data
- For each skipped record that has `folderIds`/`folderNames` in JSONL, call `updateFolderMetadata`
- This preserves classifications while adding folder info

#### Update `BookmarkTimelineItem`:
- Add `folderIds: string[]` and `folderNames: string[]` fields

#### Update `mapTimelineRow`:
- Parse `folder_ids` and `folder_names` columns (comma-split, same as categories/domains)

#### Update `listBookmarks` and `searchBookmarks`:
- Add `folder?: string` filter option
- Filter: `WHERE folder_names LIKE ?` with `%name%` pattern
- Since folder names from X are short unique labels (not arbitrary text), substring collision risk is low in practice

#### Add `getFolderCounts(): Promise<Record<string, number>>`:
- Split `folder_names` column and count per-name (same approach as `getCategoryCounts` but multi-valued)
- Use SQL: split by comma in JS after fetching all non-null `folder_names` rows

#### Update `exportBookmarksForSyncSeed`:
- Add `folder_ids` and `folder_names` to the SELECT and map them back to arrays on the exported `BookmarkRecord`

### 7. CLI commands (`src/cli.ts`)

#### `ft folders`
- If DB exists: show local folder counts from `getFolderCounts()` (works offline)
- If `--refresh` flag or no DB: call `fetchBookmarkFolders` for live folder list from API
- Default behavior: show local counts if available, otherwise fetch live

#### `ft sync` additions:
- `--folder <name>`: sync a specific folder
  - Resolves name to ID via `fetchBookmarkFolders` (case-insensitive exact match first, then prefix match)
  - If multiple matches: error with "Did you mean: X, Y?"
  - If no match: error listing available folder names
  - Errors if combined with `--api` (folder sync is GraphQL-only)
- `--all-folders`: sync all folders + main timeline
  - Fetches folder list
  - Syncs main (unfiled) timeline first
  - Then syncs each folder sequentially
  - 2-second pause between folders to reduce rate limit risk
  - Reports per-folder results at the end
  - Errors if combined with `--folder` (mutually exclusive)
  - Errors if combined with `--api`

#### `ft list --folder <name>` / `ft search <query> --folder <name>`
- Passes folder filter to DB query

#### CLI validation:
- `--api` + `--folder` → error: "Folder sync requires Chrome session (GraphQL). Remove --api."
- `--api` + `--all-folders` → same error
- `--folder` + `--all-folders` → error: "Cannot use --folder and --all-folders together."

### 8. Viz update (`src/bookmarks-viz.ts`)

Add a "FOLDERS" section to the dashboard:
- Bar chart showing bookmark count per folder (same style as "WHO YOU LISTEN TO")
- Only shown if any bookmarks have folder metadata
- Positioned after "WHO YOU LISTEN TO" section

### 9. Tests

Add tests for:
- `parseTimelineInstructions` — shared parser with mock entries
- `parseBookmarkFolderResponse` — folder timeline response parsing
- `mergeBookmarkRecord` — folder array union semantics
- DB migration — verify `SCHEMA_VERSION` 3 → 4 adds columns correctly
- `updateFolderMetadata` — verify folder-only update preserves classifications
- `buildIndex` — verify existing records get folder metadata backfilled
- CLI validation — `--api` + `--folder` errors, `--folder` + `--all-folders` errors

## Files Changed

| File | Change |
|------|--------|
| `src/types.ts` | Add `BookmarkFolder`, add `folderIds`/`folderNames` to `BookmarkRecord` |
| `src/graphql-bookmarks.ts` | Update query IDs + features, add folder fetch/parse, folder-aware sync + merge, extract shared parser |
| `src/bookmarks-db.ts` | Schema v4 migration, folder columns, `updateFolderMetadata`, folder filter, `getFolderCounts`, update `insertRecord`/`mapTimelineRow`/`exportBookmarksForSyncSeed` |
| `src/cli.ts` | `ft folders`, `--folder`/`--all-folders` on sync, `--folder` on list/search, CLI validation |
| `src/bookmarks-viz.ts` | Folder distribution bar chart |
| `tests/*.test.ts` | New tests for folder parsing, merge, migration, CLI validation |

## What We Are NOT Changing

- **No new dependencies.**
- **No breaking changes to existing data.** New columns are additive. Migration handles existing DBs. Old JSONL records without folder fields work fine.
- **No folder creation/deletion/management.** Read-only sync.
- **No changes to OAuth/API sync path.** Folder support is GraphQL-only.
- **No changes to classification logic.** Categories and domains are orthogonal.
- **No folder rename tracking.** `folderNames` are refreshed from the live folder list on each sync. Stale names in historical data are acceptable.

## Implementation Order

1. Types (`src/types.ts`)
2. GraphQL constants + `fetchBookmarkFolders` + shared parser extraction + `parseBookmarkFolderResponse` (`src/graphql-bookmarks.ts`)
3. Folder-aware merge logic — `mergeBookmarkRecord` union semantics (`src/graphql-bookmarks.ts`)
4. Folder-aware sync — `syncBookmarksGraphQL` with folder stop-conditions (`src/graphql-bookmarks.ts`)
5. Database — schema v4 migration, `insertRecord` update, `updateFolderMetadata`, `buildIndex` backfill, `mapTimelineRow`/`BookmarkTimelineItem`, `exportBookmarksForSyncSeed`, folder filter, `getFolderCounts` (`src/bookmarks-db.ts`)
6. CLI — `ft folders`, `--folder`/`--all-folders`, validation (`src/cli.ts`)
7. Viz — folder distribution section (`src/bookmarks-viz.ts`)
8. Tests
9. Live validation

## Appendix: Current Features Object

```json
{
  "graphql_timeline_v2_bookmark_timeline": true,
  "rweb_video_screen_enabled": false,
  "profile_label_improvements_pcf_label_in_post_enabled": true,
  "responsive_web_profile_redirect_enabled": false,
  "rweb_tipjar_consumption_enabled": false,
  "verified_phone_label_enabled": false,
  "creator_subscriptions_tweet_preview_api_enabled": true,
  "responsive_web_graphql_timeline_navigation_enabled": true,
  "responsive_web_graphql_skip_user_profile_image_extensions_enabled": false,
  "premium_content_api_read_enabled": false,
  "communities_web_enable_tweet_community_results_fetch": true,
  "c9s_tweet_anatomy_moderator_badge_enabled": true,
  "responsive_web_grok_analyze_button_fetch_trends_enabled": false,
  "responsive_web_grok_analyze_post_followups_enabled": true,
  "responsive_web_jetfuel_frame": true,
  "responsive_web_grok_share_attachment_enabled": true,
  "responsive_web_grok_annotations_enabled": true,
  "articles_preview_enabled": true,
  "responsive_web_edit_tweet_api_enabled": true,
  "graphql_is_translatable_rweb_tweet_is_translatable_enabled": true,
  "view_counts_everywhere_api_enabled": true,
  "longform_notetweets_consumption_enabled": true,
  "responsive_web_twitter_article_tweet_consumption_enabled": true,
  "content_disclosure_indicator_enabled": true,
  "content_disclosure_ai_generated_indicator_enabled": true,
  "responsive_web_grok_show_grok_translated_post": true,
  "responsive_web_grok_analysis_button_from_backend": true,
  "post_ctas_fetch_enabled": true,
  "freedom_of_speech_not_reach_fetch_enabled": true,
  "standardized_nudges_misinfo": true,
  "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": true,
  "longform_notetweets_rich_text_read_enabled": true,
  "longform_notetweets_inline_media_enabled": false,
  "responsive_web_grok_image_annotation_enabled": true,
  "responsive_web_grok_imagine_annotation_enabled": true,
  "responsive_web_grok_community_note_auto_translation_is_enabled": false,
  "responsive_web_enhance_cards_enabled": false
}
```
