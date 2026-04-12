import type {
  ArchiveSource,
  BookmarkItem,
  LikeItem,
  ListResponse,
  StatusResponse,
} from './types';

async function requestJson<T>(input: string): Promise<T> {
  const response = await fetch(input);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchStatus(): Promise<StatusResponse> {
  return requestJson<StatusResponse>('/api/status');
}

export async function fetchArchiveList(
  source: ArchiveSource,
  options: { query?: string; limit?: number; offset?: number } = {},
): Promise<ListResponse<BookmarkItem> | ListResponse<LikeItem>> {
  const params = new URLSearchParams();
  if (options.query) params.set('query', options.query);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  const suffix = params.toString();
  return requestJson(`/api/${source}${suffix ? `?${suffix}` : ''}`);
}

export async function fetchArchiveItem(source: ArchiveSource, id: string): Promise<BookmarkItem | LikeItem> {
  return requestJson(`/api/${source}/${id}`);
}
