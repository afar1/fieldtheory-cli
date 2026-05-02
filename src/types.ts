export interface BookmarkMediaVariant {
  url?: string;
  contentType?: string;
  bitrate?: number;
}

export interface BookmarkMediaObject {
  url?: string;
  mediaUrl?: string;
  expandedUrl?: string;
  previewUrl?: string;
  type?: string;
  altText?: string;
  extAltText?: string;
  width?: number;
  height?: number;
  videoVariants?: BookmarkMediaVariant[];
  variants?: BookmarkMediaVariant[];
}

export interface BookmarkAuthorSnapshot {
  handle?: string;
  name?: string;
  profileImageUrl?: string;
  description?: string;
  location?: string;
  url?: string;
  verified?: boolean;
  followersCount?: number;
  followingCount?: number;
  statusesCount?: number;
}

export interface BookmarkEngagementSnapshot {
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
  quoteCount?: number;
  bookmarkCount?: number;
  viewCount?: number;
}

export interface QuotedTweetSnapshot {
  id: string;
  text: string;
  authorHandle?: string;
  authorName?: string;
  authorProfileImageUrl?: string;
  postedAt?: string | null;
  media?: string[];
  mediaObjects?: BookmarkMediaObject[];
  url: string;
}

export interface BookmarkRecord {
  id: string;
  tweetId: string;
  authorHandle?: string;
  authorName?: string;
  authorProfileImageUrl?: string;
  author?: BookmarkAuthorSnapshot;
  url: string;
  text: string;
  postedAt?: string | null;
  bookmarkedAt?: string | null;
  /** X's opaque bookmark ordering key. Useful for chronology, not timestamps. */
  sortIndex?: string | null;
  syncedAt: string;
  conversationId?: string;
  inReplyToStatusId?: string;
  inReplyToUserId?: string;
  quotedStatusId?: string;
  quotedTweet?: QuotedTweetSnapshot;
  articleTitle?: string | null;
  articleText?: string | null;
  articleSite?: string | null;
  enrichedAt?: string | null;
  language?: string;
  sourceApp?: string;
  possiblySensitive?: boolean;
  engagement?: BookmarkEngagementSnapshot;
  media?: string[];
  mediaObjects?: BookmarkMediaObject[];
  links?: string[];
  tags?: string[];
  ingestedVia?: 'api' | 'browser' | 'graphql';
  /** Parallel arrays of folder IDs and display names this bookmark is in on X. */
  folderIds?: string[];
  folderNames?: string[];
  /**
   * Set once `ft sync --gaps` has attempted to expand long-form text for this
   * record. Present regardless of whether expansion actually lengthened the
   * stored text — its purpose is to keep the gap-fill selector idempotent so
   * subsequent runs don't re-fetch the same records forever.
   */
  textExpandedAt?: string;
  /**
   * Set when gap-fill tried to backfill the quoted tweet for this record and
   * failed permanently (deleted, forbidden, empty body). Prevents retrying the
   * same dead tweet on every run.
   */
  quotedTweetFailedAt?: string;
}

export interface ClassificationRecord {
  id: string;
  categories: string[];
  primaryCategory: string;
  domains?: string[];
  primaryDomain?: string;
  classifiedAt: string;
}

export interface BookmarkFolder {
  id: string;
  name: string;
}

export interface BookmarkCacheMeta {
  provider: 'twitter';
  schemaVersion: number;
  lastFullSyncAt?: string;
  lastIncrementalSyncAt?: string;
  totalBookmarks: number;
}

export interface XOAuthTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  obtained_at: string;
}

export interface BookmarkBackfillState {
  provider: 'twitter';
  lastRunAt?: string;
  totalRuns: number;
  totalAdded: number;
  lastAdded: number;
  lastSeenIds: string[];
  stopReason?: string;
  /** Saved pagination cursor for resuming an interrupted sync. */
  lastCursor?: string;
}
