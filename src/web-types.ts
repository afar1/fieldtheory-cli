export type ArchiveSource = 'bookmarks' | 'likes';

export interface ApiStatusBucket {
  total: number;
  hasCache: boolean;
  hasIndex: boolean;
}

export interface ApiStatusResponse {
  dataDir: string;
  bookmarks: ApiStatusBucket;
  likes: ApiStatusBucket;
}

export interface ApiListResponse<T> {
  source: ArchiveSource;
  total: number;
  limit: number;
  offset: number;
  items: T[];
}
