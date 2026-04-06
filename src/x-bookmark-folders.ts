import type { Database } from 'sql.js';
import { openBookmarksIndexDb } from './bookmarks-db.js';
import { saveDb } from './db.js';
import { parseBookmarksResponse } from './graphql-bookmarks.js';
import { pathExists, readJson } from './fs.js';
import { twitterBookmarksIndexPath, xBookmarkFolderOpsPath } from './paths.js';
import { buildXHeaders, createXSessionContext, type XSessionContext, type XSessionOptions } from './x-session.js';

const BOOKMARK_FOLDER_TIMELINE_FEATURES = {
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: false,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  tweet_with_visibility_results_prefer_gql_media_interstitial_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

const DEFAULT_FOLDER_OPS = {
  createFolder: { queryId: '6Xxqpq8TM_CREYiuof_h5w', operationName: 'createBookmarkFolder', method: 'POST' as const },
  addToFolder: { queryId: '4KHZvvNbHNf07bsgnL9gWA', operationName: 'bookmarkTweetToFolder', method: 'POST' as const },
  listFolders: { queryId: 'i78YDd0Tza-dV4SYs58kRg', operationName: 'BookmarkFoldersSlice', method: 'GET' as const },
  folderTimeline: { queryId: '8HoabOvl7jl9IC1Aixj-vg', operationName: 'BookmarkFolderTimeline', method: 'GET' as const },
};

const MANUAL_RECOVERY_MESSAGE =
  `X's internal bookmark-folder query ids may have rotated.\n\n` +
  `Recovery:\n` +
  `  1. Open x.com in your browser and open DevTools\n` +
  `  2. Filter Network requests by /i/api/graphql and bookmark\n` +
  `  3. Create a probe folder and add one bookmark to it\n` +
  `  4. Save the observed query ids into ${xBookmarkFolderOpsPath()}\n`;

export type FolderBy = 'domain' | 'category';

export interface FolderLabelPlan {
  label: string;
  folderName: string;
  count: number;
}

export interface BookmarkFolderSyncOptions extends XSessionOptions {
  folderBy?: FolderBy;
  minFolderSize?: number;
  includeLabels?: string[];
  excludeLabels?: string[];
  dryRun?: boolean;
  maxActions?: number;
  maxMinutes?: number;
  untilDone?: boolean;
  onProgress?: (status: BookmarkFolderSyncProgress) => void;
  fetchImpl?: typeof fetch;
  randomInt?: (min: number, max: number) => number;
  sleep?: (ms: number) => Promise<void>;
  session?: XSessionContext;
}

export interface BookmarkFolderSyncProgress {
  phase: 'planning' | 'folders' | 'reconcile' | 'assigning';
  completed: number;
  total: number;
  detail?: string;
}

export interface BookmarkFolderSyncResult {
  folderBy: FolderBy;
  dryRun: boolean;
  eligibleLabels: FolderLabelPlan[];
  foldersCreated: number;
  foldersMatched: number;
  assignmentsPlanned: number;
  assignmentsCompleted: number;
  assignmentsAlreadyPresent: number;
  assignmentsPending: number;
  stopReason: string;
  overridePath: string;
}

export interface XBookmarkFolder {
  id: string;
  name: string;
  media?: unknown;
}

interface BookmarkFolderOps {
  createFolder: GraphqlOperationDescriptor;
  addToFolder: GraphqlOperationDescriptor;
  listFolders: GraphqlOperationDescriptor;
  folderTimeline: GraphqlOperationDescriptor;
}

interface GraphqlOperationDescriptor {
  queryId: string;
  operationName: string;
  method: 'GET' | 'POST';
}

interface FolderSyncCandidate {
  tweetId: string;
  label: string;
}

interface GraphqlResponse<T = any> {
  status: number;
  ok: boolean;
  json: T | null;
  text: string;
}

class GraphqlRequestError extends Error {
  constructor(
    message: string,
    readonly kind: 'stale-operation' | 'session' | 'premium' | 'rate-limit' | 'generic',
    readonly status: number,
  ) {
    super(message);
  }
}

interface PendingAssignment {
  tweetId: string;
  label: string;
  folderId: string;
  status: string;
  attemptCount: number;
}

export function formatFolderName(label: string): string {
  const map: Record<string, string> = {
    ai: 'AI',
    'web-dev': 'Web Dev',
    devops: 'DevOps',
    crypto: 'Crypto',
  };
  if (map[label]) return map[label];
  return label
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function selectFolderLabels(
  counts: Record<string, number>,
  options: { minFolderSize?: number; includeLabels?: string[]; excludeLabels?: string[] } = {},
): FolderLabelPlan[] {
  const minFolderSize = options.minFolderSize ?? 100;
  const includes = new Set((options.includeLabels ?? []).map((label) => label.trim()).filter(Boolean));
  const excludes = new Set((options.excludeLabels ?? []).map((label) => label.trim()).filter(Boolean));

  return Object.entries(counts)
    .filter(([label, count]) => count > 0 && (count >= minFolderSize || includes.has(label)) && !excludes.has(label))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count, folderName: formatFolderName(label) }));
}

export function buildGraphqlGetUrl(
  operation: GraphqlOperationDescriptor,
  variables: Record<string, unknown> = {},
  features?: Record<string, unknown>,
): string {
  const params = new URLSearchParams();
  params.set('variables', JSON.stringify(variables));
  if (features && Object.keys(features).length > 0) {
    params.set('features', JSON.stringify(features));
  }
  return `https://x.com/i/api/graphql/${operation.queryId}/${operation.operationName}?${params.toString()}`;
}

export function buildGraphqlPostBody(
  operation: GraphqlOperationDescriptor,
  variables: Record<string, unknown>,
  features?: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    queryId: operation.queryId,
    variables,
  };
  if (features && Object.keys(features).length > 0) body.features = features;
  return body;
}

export async function loadBookmarkFolderOperations(): Promise<BookmarkFolderOps> {
  const overridePath = xBookmarkFolderOpsPath();
  if (!(await pathExists(overridePath))) return DEFAULT_FOLDER_OPS;
  const override = await readJson<Partial<BookmarkFolderOps>>(overridePath);
  return {
    createFolder: { ...DEFAULT_FOLDER_OPS.createFolder, ...override.createFolder },
    addToFolder: { ...DEFAULT_FOLDER_OPS.addToFolder, ...override.addToFolder },
    listFolders: { ...DEFAULT_FOLDER_OPS.listFolders, ...override.listFolders },
    folderTimeline: { ...DEFAULT_FOLDER_OPS.folderTimeline, ...override.folderTimeline },
  };
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractErrorMessage(response: GraphqlResponse): string {
  const jsonError = response.json?.errors?.[0]?.message;
  if (typeof jsonError === 'string' && jsonError.trim()) return jsonError;
  return response.text.slice(0, 300) || `HTTP ${response.status}`;
}

function isRateLimit(status: number, text: string): boolean {
  return status === 429 || /rate limit/i.test(text);
}

function isOperationNotFound(response: GraphqlResponse): boolean {
  const text = `${response.text} ${extractErrorMessage(response)}`;
  return /PersistedQueryNotFound|Query.+not found|No operation named/i.test(text);
}

function isSessionExpired(response: GraphqlResponse): boolean {
  return response.status === 401 || response.status === 403;
}

function isPremiumIssue(response: GraphqlResponse): boolean {
  return /premium|bookmark folders/i.test(`${response.text} ${extractErrorMessage(response)}`);
}

function isAlreadyAssigned(response: GraphqlResponse): boolean {
  return /already.+bookmark|already.+folder|duplicate/i.test(`${response.text} ${extractErrorMessage(response)}`);
}

function isFolderAlreadyExists(response: GraphqlResponse): boolean {
  return /collection with that name already exists|folder with that name already exists|already exists/i.test(
    `${response.text} ${extractErrorMessage(response)}`,
  );
}

function throwResponseError(action: string, response: GraphqlResponse): never {
  if (isOperationNotFound(response)) {
    throw new GraphqlRequestError(
      `${action} failed because X rejected the current bookmark-folder query id.\n\n${MANUAL_RECOVERY_MESSAGE}`,
      'stale-operation',
      response.status,
    );
  }
  if (isSessionExpired(response)) {
    throw new GraphqlRequestError(
      `${action} failed because your X browser session appears to be expired. Open Chrome, visit https://x.com, make sure you're logged in, then retry.`,
      'session',
      response.status,
    );
  }
  if (isPremiumIssue(response)) {
    throw new GraphqlRequestError(
      `${action} failed because bookmark folders appear unavailable on this account. X bookmark folders are a Premium feature.`,
      'premium',
      response.status,
    );
  }
  if (isRateLimit(response.status, response.text)) {
    throw new GraphqlRequestError(
      `${action} hit an X rate limit (${response.status}): ${extractErrorMessage(response)}`,
      'rate-limit',
      response.status,
    );
  }
  throw new GraphqlRequestError(
    `${action} failed (${response.status}): ${extractErrorMessage(response)}`,
    'generic',
    response.status,
  );
}

function walk(node: any, visitor: (value: any) => void): void {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  if (Array.isArray(node)) {
    for (const value of node) walk(value, visitor);
    return;
  }
  for (const value of Object.values(node)) walk(value, visitor);
}

export function parseBookmarkFoldersSliceResponse(json: any): { folders: XBookmarkFolder[]; nextCursor?: string } {
  const byId = new Map<string, XBookmarkFolder>();
  let nextCursor: string | undefined;

  walk(json, (value) => {
    if (
      value &&
      typeof value === 'object' &&
      typeof (value.bookmark_collection_id ?? value.id) === 'string' &&
      typeof value.name === 'string'
    ) {
      const id = String(value.bookmark_collection_id ?? value.id);
      byId.set(id, {
        id,
        name: value.name,
        media: value.media,
      });
    }

    if (
      value &&
      typeof value === 'object' &&
      typeof value.cursor === 'string' &&
      /bottom|next/i.test(String(value.cursor_type ?? value.type ?? ''))
    ) {
      nextCursor = value.cursor;
    }
  });

  return { folders: Array.from(byId.values()), nextCursor };
}

export function parseCreateBookmarkFolderResponse(json: any): XBookmarkFolder | null {
  const parsed = parseBookmarkFoldersSliceResponse(json).folders[0];
  return parsed ?? null;
}

export function parseBookmarkFolderTimelineResponse(json: any): { tweetIds: string[]; nextCursor?: string } {
  const page = parseBookmarksResponse(json);
  return {
    tweetIds: page.records.map((record) => record.tweetId),
    nextCursor: page.nextCursor,
  };
}

class XBookmarkFoldersClient {
  constructor(
    private readonly session: XSessionContext,
    private readonly operations: BookmarkFolderOps,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async requestJson(
    method: 'GET' | 'POST',
    url: string,
    body?: Record<string, unknown>,
  ): Promise<GraphqlResponse> {
    const headers = buildXHeaders(
      { csrfToken: this.session.csrfToken, cookieHeader: this.session.cookieHeader },
      { userAgent: this.session.userAgent, contentType: body ? 'application/json' : undefined },
    );
    try {
      headers['x-client-transaction-id'] = await this.session.transactionIdGenerator.generate(method, new URL(url).pathname);
    } catch {
      // Best effort header. If this drifts, the user can still repair query ids through the override file.
    }
    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      text,
      json: safeJsonParse(text),
    };
  }

  async listFolders(cursor?: string): Promise<{ folders: XBookmarkFolder[]; nextCursor?: string }> {
    const url = buildGraphqlGetUrl(this.operations.listFolders, cursor ? { cursor } : {});
    const response = await this.requestJson('GET', url);
    if (!response.ok) throwResponseError('Listing bookmark folders', response);
    return parseBookmarkFoldersSliceResponse(response.json);
  }

  async createFolder(name: string): Promise<XBookmarkFolder> {
    const url = `https://x.com/i/api/graphql/${this.operations.createFolder.queryId}/${this.operations.createFolder.operationName}`;
    const response = await this.requestJson('POST', url, buildGraphqlPostBody(this.operations.createFolder, { name }));
    if (!response.ok) {
      if (isFolderAlreadyExists(response)) {
        const folders = await listAllFolders(this);
        const existing = folders.find((folder) => normalizeName(folder.name) === normalizeName(name));
        if (existing) return existing;
      }
      throwResponseError(`Creating bookmark folder "${name}"`, response);
    }
    const folder = parseCreateBookmarkFolderResponse(response.json);
    if (folder) return folder;

    const folders = await listAllFolders(this);
    const existing = folders.find((entry) => normalizeName(entry.name) === normalizeName(name));
    if (existing) return existing;

    throw new Error(`Creating bookmark folder "${name}" succeeded but the response did not include a folder id.`);
  }

  async folderTimeline(folderId: string, cursor?: string): Promise<{ tweetIds: string[]; nextCursor?: string }> {
    const url = buildGraphqlGetUrl(
      this.operations.folderTimeline,
      { count: 100, includePromotedContent: true, bookmark_collection_id: folderId, ...(cursor ? { cursor } : {}) },
      BOOKMARK_FOLDER_TIMELINE_FEATURES,
    );
    const response = await this.requestJson('GET', url);
    if (!response.ok) throwResponseError(`Reading bookmark folder timeline for ${folderId}`, response);
    return parseBookmarkFolderTimelineResponse(response.json);
  }

  async addTweetToFolder(tweetId: string, folderId: string): Promise<void> {
    const url = `https://x.com/i/api/graphql/${this.operations.addToFolder.queryId}/${this.operations.addToFolder.operationName}`;
    const response = await this.requestJson(
      'POST',
      url,
      buildGraphqlPostBody(this.operations.addToFolder, { tweet_id: tweetId, bookmark_collection_id: folderId }),
    );
    if (response.ok || isAlreadyAssigned(response)) return;
    throwResponseError(`Adding tweet ${tweetId} to bookmark folder ${folderId}`, response);
  }
}

async function getLabelCounts(db: Database, folderBy: FolderBy): Promise<Record<string, number>> {
  const column = folderBy === 'domain' ? 'primary_domain' : 'primary_category';
  const rows = db.exec(
    `SELECT ${column} AS label, COUNT(*) AS count
     FROM bookmarks
     WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''
     GROUP BY ${column}`,
  );
  return Object.fromEntries((rows[0]?.values ?? []).map((row) => [String(row[0]), Number(row[1])]));
}

async function listFolderSyncCandidates(db: Database, folderBy: FolderBy, labels: string[]): Promise<FolderSyncCandidate[]> {
  if (labels.length === 0) return [];
  const column = folderBy === 'domain' ? 'primary_domain' : 'primary_category';
  const placeholders = labels.map(() => '?').join(', ');
  const rows = db.exec(
    `SELECT tweet_id, ${column} AS label
     FROM bookmarks
     WHERE ${column} IN (${placeholders})
     ORDER BY
       CASE
         WHEN bookmarked_at GLOB '____-__-__*' THEN bookmarked_at
         WHEN posted_at GLOB '____-__-__*' THEN posted_at
         ELSE ''
       END DESC,
       CAST(tweet_id AS INTEGER) DESC`,
    labels,
  );
  return (rows[0]?.values ?? []).map((row) => ({
    tweetId: String(row[0]),
    label: String(row[1]),
  }));
}

function upsertManagedFolder(db: Database, label: string, folderName: string, folderId: string, nowIso: string): void {
  db.run(
    `INSERT INTO x_bookmark_folders (label, folder_name, folder_id, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(label) DO UPDATE SET
       folder_name = excluded.folder_name,
       folder_id = excluded.folder_id,
       updated_at = excluded.updated_at`,
    [label, folderName, folderId, nowIso],
  );
}

function upsertCandidates(db: Database, rows: FolderSyncCandidate[], folderIdsByLabel: Map<string, string>): void {
  db.run('BEGIN TRANSACTION');
  try {
    for (const row of rows) {
      const folderId = folderIdsByLabel.get(row.label);
      if (!folderId) continue;
      db.run(
        `INSERT INTO x_bookmark_folder_sync
          (tweet_id, label, folder_id, status, attempt_count, last_error, last_attempted_at, completed_at)
         VALUES (?, ?, ?, 'pending', 0, NULL, NULL, NULL)
         ON CONFLICT(tweet_id) DO UPDATE SET
           label = excluded.label,
           folder_id = excluded.folder_id,
           status = CASE
             WHEN x_bookmark_folder_sync.status = 'done'
               AND x_bookmark_folder_sync.label = excluded.label
               AND x_bookmark_folder_sync.folder_id = excluded.folder_id
             THEN 'done'
             ELSE 'pending'
           END,
           last_error = NULL,
           completed_at = CASE
             WHEN x_bookmark_folder_sync.status = 'done'
               AND x_bookmark_folder_sync.label = excluded.label
               AND x_bookmark_folder_sync.folder_id = excluded.folder_id
             THEN x_bookmark_folder_sync.completed_at
             ELSE NULL
           END`,
        [row.tweetId, row.label, folderId],
      );
    }
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

function markAssignmentsDone(db: Database, folderId: string, tweetIds: string[], nowIso: string): number {
  if (tweetIds.length === 0) return 0;
  let updated = 0;
  db.run('BEGIN TRANSACTION');
  try {
    for (const tweetId of tweetIds) {
      db.run(
        `UPDATE x_bookmark_folder_sync
         SET status = 'done',
             last_error = NULL,
             completed_at = ?,
             folder_id = ?
         WHERE tweet_id = ? AND folder_id = ?`,
        [nowIso, folderId, tweetId, folderId],
      );
      updated += 1;
    }
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
  return updated;
}

function listPendingAssignments(db: Database, limit: number): PendingAssignment[] {
  const rows = db.exec(
    `SELECT s.tweet_id, s.label, s.folder_id, s.status, s.attempt_count
     FROM x_bookmark_folder_sync s
     JOIN bookmarks b ON b.tweet_id = s.tweet_id
     WHERE s.status <> 'done'
     ORDER BY
       CASE
         WHEN b.bookmarked_at GLOB '____-__-__*' THEN b.bookmarked_at
         WHEN b.posted_at GLOB '____-__-__*' THEN b.posted_at
         ELSE ''
       END DESC,
       CAST(b.tweet_id AS INTEGER) DESC
     LIMIT ?`,
    [limit],
  );
  return (rows[0]?.values ?? []).map((row) => ({
    tweetId: String(row[0]),
    label: String(row[1]),
    folderId: String(row[2]),
    status: String(row[3]),
    attemptCount: Number(row[4] ?? 0),
  }));
}

function countPendingAssignments(db: Database): number {
  const rows = db.exec(`SELECT COUNT(*) FROM x_bookmark_folder_sync WHERE status <> 'done'`);
  return Number(rows[0]?.values?.[0]?.[0] ?? 0);
}

function setAssignmentState(
  db: Database,
  tweetId: string,
  patch: { status: string; lastError?: string | null; lastAttemptedAt?: string | null; completedAt?: string | null; incrementAttempt?: boolean },
): void {
  db.run(
    `UPDATE x_bookmark_folder_sync
     SET status = ?,
         attempt_count = attempt_count + ?,
         last_error = ?,
         last_attempted_at = ?,
         completed_at = ?
     WHERE tweet_id = ?`,
    [
      patch.status,
      patch.incrementAttempt ? 1 : 0,
      patch.lastError ?? null,
      patch.lastAttemptedAt ?? null,
      patch.completedAt ?? null,
      tweetId,
    ],
  );
}

async function listAllFolders(client: XBookmarkFoldersClient): Promise<XBookmarkFolder[]> {
  const folders: XBookmarkFolder[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await client.listFolders(cursor);
    for (const folder of result.folders) {
      if (!seen.has(folder.id)) {
        seen.add(folder.id);
        folders.push(folder);
      }
    }
    if (!result.nextCursor || result.nextCursor === cursor) break;
    cursor = result.nextCursor;
  }
  return folders;
}

async function reconcileExistingFolder(
  db: Database,
  client: XBookmarkFoldersClient,
  label: FolderLabelPlan,
  folderId: string,
  targetTweetIds: Set<string>,
  onProgress?: (status: BookmarkFolderSyncProgress) => void,
): Promise<number> {
  let cursor: string | undefined;
  let marked = 0;

  for (let page = 0; page < 1000; page++) {
    const result = await client.folderTimeline(folderId, cursor);
    const alreadyPresent = result.tweetIds.filter((tweetId) => targetTweetIds.has(tweetId));
    if (alreadyPresent.length > 0) {
      marked += markAssignmentsDone(db, folderId, alreadyPresent, new Date().toISOString());
    }
    onProgress?.({
      phase: 'reconcile',
      completed: marked,
      total: targetTweetIds.size,
      detail: `${label.folderName} page ${page + 1}`,
    });
    if (!result.nextCursor || result.nextCursor === cursor || result.tweetIds.length === 0) break;
    cursor = result.nextCursor;
  }

  return marked;
}

function createSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopReasonForOptions(options: BookmarkFolderSyncOptions): { maxActions: number; maxMinutes: number } {
  return {
    maxActions: typeof options.maxActions === 'number'
      ? options.maxActions
      : options.untilDone ? Number.POSITIVE_INFINITY : 500,
    maxMinutes: typeof options.maxMinutes === 'number'
      ? options.maxMinutes
      : options.untilDone ? 240 : 15,
  };
}

function finalizeStopReason(
  current: string,
  assignmentsPending: number,
  maxActions: number,
  assignmentsCompleted: number,
): string {
  if (current !== 'done' || assignmentsPending <= 0) return current;
  if (Number.isFinite(maxActions) && assignmentsCompleted >= maxActions) {
    return 'batch complete (more pending)';
  }
  return 'paused with pending assignments';
}

export async function syncBookmarkFolders(options: BookmarkFolderSyncOptions = {}): Promise<BookmarkFolderSyncResult> {
  const folderBy = options.folderBy ?? 'domain';
  const dryRun = Boolean(options.dryRun);
  const { maxActions, maxMinutes } = stopReasonForOptions(options);
  const sleep = options.sleep ?? createSleep;
  const jitter = options.randomInt ?? ((min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min);
  const startedAt = Date.now();
  const db = await openBookmarksIndexDb();

  try {
    const counts = await getLabelCounts(db, folderBy);
    const eligibleLabels = selectFolderLabels(counts, {
      minFolderSize: options.minFolderSize ?? 100,
      includeLabels: options.includeLabels,
      excludeLabels: options.excludeLabels,
    });

    if (eligibleLabels.length === 0) {
      return {
        folderBy,
        dryRun,
        eligibleLabels: [],
        foldersCreated: 0,
        foldersMatched: 0,
        assignmentsPlanned: 0,
        assignmentsCompleted: 0,
        assignmentsAlreadyPresent: 0,
        assignmentsPending: 0,
        stopReason: 'no eligible labels',
        overridePath: xBookmarkFolderOpsPath(),
      };
    }

    const candidates = await listFolderSyncCandidates(db, folderBy, eligibleLabels.map((item) => item.label));
    options.onProgress?.({ phase: 'planning', completed: candidates.length, total: candidates.length, detail: 'Candidates loaded' });

    const operations = await loadBookmarkFolderOperations();
    const session = options.session ?? createXSessionContext(options);
    const client = new XBookmarkFoldersClient(session, operations, options.fetchImpl);
    const existingFolders = await listAllFolders(client);
    const existingByName = new Map(existingFolders.map((folder) => [normalizeName(folder.name), folder]));
    const matchedFolderLabels = new Set<string>();
    const folderIdsByLabel = new Map<string, string>();
    let foldersCreated = 0;
    let foldersMatched = 0;

    for (let index = 0; index < eligibleLabels.length; index++) {
      const label = eligibleLabels[index];
      const match = existingByName.get(normalizeName(label.folderName));
      if (match) {
        folderIdsByLabel.set(label.label, match.id);
        matchedFolderLabels.add(label.label);
        foldersMatched += 1;
      } else if (!dryRun) {
        const created = await client.createFolder(label.folderName);
        folderIdsByLabel.set(label.label, created.id);
        existingByName.set(normalizeName(created.name), created);
        foldersCreated += 1;
      }
      options.onProgress?.({
        phase: 'folders',
        completed: index + 1,
        total: eligibleLabels.length,
        detail: label.folderName,
      });
    }

    if (dryRun) {
      const pending = candidates.length;
      return {
        folderBy,
        dryRun,
        eligibleLabels,
        foldersCreated: eligibleLabels.length - foldersMatched,
        foldersMatched,
        assignmentsPlanned: candidates.length,
        assignmentsCompleted: 0,
        assignmentsAlreadyPresent: 0,
        assignmentsPending: pending,
        stopReason: 'dry run',
        overridePath: xBookmarkFolderOpsPath(),
      };
    }

    const nowIso = new Date().toISOString();
    for (const label of eligibleLabels) {
      const folderId = folderIdsByLabel.get(label.label);
      if (!folderId) continue;
      upsertManagedFolder(db, label.label, label.folderName, folderId, nowIso);
    }
    upsertCandidates(db, candidates, folderIdsByLabel);

    const tweetIdsByLabel = new Map<string, Set<string>>();
    for (const row of candidates) {
      const set = tweetIdsByLabel.get(row.label) ?? new Set<string>();
      set.add(row.tweetId);
      tweetIdsByLabel.set(row.label, set);
    }

    let assignmentsAlreadyPresent = 0;
    for (const label of eligibleLabels) {
      const folderId = folderIdsByLabel.get(label.label);
      const targetTweetIds = tweetIdsByLabel.get(label.label);
      if (!folderId || !targetTweetIds || targetTweetIds.size === 0) continue;
      if (Date.now() - startedAt > maxMinutes * 60_000) break;
      if (matchedFolderLabels.has(label.label)) {
        assignmentsAlreadyPresent += await reconcileExistingFolder(
          db,
          client,
          label,
          folderId,
          targetTweetIds,
          options.onProgress,
        );
      }
    }

    const pendingRows = listPendingAssignments(db, Number.isFinite(maxActions) ? maxActions : Number.MAX_SAFE_INTEGER);
    let assignmentsCompleted = 0;
    let stopReason = 'done';

    for (let index = 0; index < pendingRows.length; index++) {
      const row = pendingRows[index];
      if (Date.now() - startedAt > maxMinutes * 60_000) {
        stopReason = 'max runtime reached';
        break;
      }
      if (assignmentsCompleted >= maxActions) {
        stopReason = 'max actions reached';
        break;
      }

      options.onProgress?.({
        phase: 'assigning',
        completed: index,
        total: pendingRows.length,
        detail: `${formatFolderName(row.label)} \u2190 ${row.tweetId}`,
      });

      let attempt = 0;
      while (attempt < 3) {
        const attemptIso = new Date().toISOString();
        setAssignmentState(db, row.tweetId, {
          status: 'running',
          lastAttemptedAt: attemptIso,
          lastError: null,
          incrementAttempt: attempt === 0,
        });

        try {
          await client.addTweetToFolder(row.tweetId, row.folderId);
          setAssignmentState(db, row.tweetId, {
            status: 'done',
            completedAt: new Date().toISOString(),
            lastAttemptedAt: attemptIso,
            lastError: null,
          });
          assignmentsCompleted += 1;
          options.onProgress?.({
            phase: 'assigning',
            completed: assignmentsCompleted,
            total: pendingRows.length,
            detail: `${formatFolderName(row.label)} \u2190 ${row.tweetId}`,
          });
          await sleep(2000 + jitter(250, 750));
          break;
        } catch (error) {
          const message = (error as Error).message;
          if (error instanceof GraphqlRequestError && error.kind === 'stale-operation') {
            setAssignmentState(db, row.tweetId, {
              status: 'pending',
              lastError: message,
              lastAttemptedAt: attemptIso,
            });
            throw error;
          }
          if (error instanceof GraphqlRequestError && error.kind === 'session') {
            setAssignmentState(db, row.tweetId, {
              status: 'pending',
              lastError: message,
              lastAttemptedAt: attemptIso,
            });
            throw error;
          }
          if (error instanceof GraphqlRequestError && error.kind === 'premium') {
            setAssignmentState(db, row.tweetId, {
              status: 'pending',
              lastError: message,
              lastAttemptedAt: attemptIso,
            });
            throw error;
          }

          attempt += 1;
          setAssignmentState(db, row.tweetId, {
            status: 'pending',
            lastError: message,
            lastAttemptedAt: attemptIso,
          });
          if (
            (error instanceof GraphqlRequestError && error.kind === 'rate-limit') ||
            /server error/i.test(message)
          ) {
            await sleep(Math.min(15_000 * Math.pow(2, attempt - 1), 120_000));
            continue;
          }
          break;
        }
      }
    }

    const assignmentsPending = countPendingAssignments(db);
    stopReason = finalizeStopReason(stopReason, assignmentsPending, maxActions, assignmentsCompleted);
    return {
      folderBy,
      dryRun: false,
      eligibleLabels,
      foldersCreated,
      foldersMatched,
      assignmentsPlanned: candidates.length,
      assignmentsCompleted,
      assignmentsAlreadyPresent,
      assignmentsPending,
      stopReason,
      overridePath: xBookmarkFolderOpsPath(),
    };
  } finally {
    try {
      saveDb(db, twitterBookmarksIndexPath());
    } finally {
      db.close();
    }
  }
}

export function formatBookmarkFolderSyncResult(result: BookmarkFolderSyncResult): string {
  const stopReason = ({
    'dry run': 'dry run',
    'no eligible labels': 'no eligible labels',
    'batch complete (more pending)': 'batch complete; run again to continue',
    'max runtime reached': 'paused after max runtime; run again to continue',
    'max actions reached': 'reached requested action limit',
    'paused with pending assignments': 'paused with assignments still pending',
    done: 'done',
  } as Record<string, string>)[result.stopReason] ?? result.stopReason;
  const labels = result.eligibleLabels.map((label) => `${label.folderName} (${label.count})`).join(' · ');
  return [
    `Folder sync: ${result.dryRun ? 'dry run' : 'applied'}`,
    `  folder basis: ${result.folderBy}`,
    `  labels: ${result.eligibleLabels.length}${labels ? `  (${labels})` : ''}`,
    `  folders matched: ${result.foldersMatched}`,
    `  folders created: ${result.foldersCreated}`,
    `  planned assignments: ${result.assignmentsPlanned}`,
    `  already present: ${result.assignmentsAlreadyPresent}`,
    `  assignments completed: ${result.assignmentsCompleted}`,
    `  assignments pending: ${result.assignmentsPending}`,
    `  stop reason: ${stopReason}`,
  ].join('\n');
}
