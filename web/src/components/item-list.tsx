import type { ArchiveSource, BookmarkItem, LikeItem } from '../types';

interface ItemListProps {
  items: Array<BookmarkItem | LikeItem>;
  source: ArchiveSource;
  selectedId?: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}

function getItemDate(source: ArchiveSource, item: BookmarkItem | LikeItem): string {
  return source === 'bookmarks'
    ? (item as BookmarkItem).bookmarkedAt ?? item.postedAt ?? ''
    : (item as LikeItem).likedAt ?? item.postedAt ?? '';
}

export function ItemList({ items, source, selectedId, loading, onSelect }: ItemListProps) {
  if (loading) {
    return <div className="empty-state">Loading archive…</div>;
  }

  if (items.length === 0) {
    return <div className="empty-state">No items found for this view.</div>;
  }

  return (
    <div className="item-list" role="list">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`item-row${item.id === selectedId ? ' is-selected' : ''}`}
          onClick={() => onSelect(item.id)}
        >
          <div className="item-row-top">
            <span className="item-handle">{item.authorHandle ? `@${item.authorHandle}` : '@unknown'}</span>
            <span className="item-date">{getItemDate(source, item).slice(0, 10) || 'unknown date'}</span>
          </div>
          <p className="item-text">{item.text}</p>
          <div className="item-meta">
            <span>{item.linkCount} links</span>
            <span>{item.mediaCount} media</span>
          </div>
        </button>
      ))}
    </div>
  );
}
