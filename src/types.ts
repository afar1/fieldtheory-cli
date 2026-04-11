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
  language?: string;
  sourceApp?: string;
  possiblySensitive?: boolean;
  engagement?: BookmarkEngagementSnapshot;
  media?: string[];
  mediaObjects?: BookmarkMediaObject[];
  links?: string[];
  tags?: string[];
  ingestedVia?: 'api' | 'browser' | 'graphql';
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
