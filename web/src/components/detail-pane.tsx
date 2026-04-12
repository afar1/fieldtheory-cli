import type { ArchiveSource, BookmarkItem, LikeItem } from '../types';

interface DetailPaneProps {
  source: ArchiveSource;
  item: BookmarkItem | LikeItem | null;
  loading: boolean;
  error: string | null;
}

function renderDateLabel(source: ArchiveSource, item: BookmarkItem | LikeItem): string {
  if (source === 'bookmarks') {
    const bookmark = item as BookmarkItem;
    return `Bookmarked ${bookmark.bookmarkedAt?.slice(0, 10) ?? '?'} · posted ${bookmark.postedAt?.slice(0, 10) ?? '?'}`;
  }
  const like = item as LikeItem;
  return `Liked ${like.likedAt?.slice(0, 10) ?? '?'} · posted ${like.postedAt?.slice(0, 10) ?? '?'}`;
}

export function DetailPane({ source, item, loading, error }: DetailPaneProps) {
  if (loading) {
    return <section className="detail-pane"><div className="empty-state">Loading detail…</div></section>;
  }

  if (error) {
    return <section className="detail-pane"><div className="empty-state">{error}</div></section>;
  }

  if (!item) {
    return <section className="detail-pane"><div className="empty-state">Select an item to inspect its full archive entry.</div></section>;
  }

  const bookmark = source === 'bookmarks' ? item as BookmarkItem : null;

  return (
    <section className="detail-pane">
      <div className="detail-header">
        <div>
          <div className="eyebrow">{source === 'bookmarks' ? 'Bookmark' : 'Like'}</div>
          <h2>{item.authorName || item.authorHandle || 'Unknown author'}</h2>
          <p className="detail-date">{renderDateLabel(source, item)}</p>
        </div>
        <a href={item.url} target="_blank" rel="noreferrer">Open on X</a>
      </div>

      <article className="detail-body">
        <p>{item.text}</p>
      </article>

      <dl className="detail-stats">
        <div><dt>Likes</dt><dd>{item.likeCount ?? 0}</dd></div>
        <div><dt>Reposts</dt><dd>{item.repostCount ?? 0}</dd></div>
        <div><dt>Replies</dt><dd>{item.replyCount ?? 0}</dd></div>
        <div><dt>Bookmarks</dt><dd>{item.bookmarkCount ?? 0}</dd></div>
      </dl>

      {bookmark && (bookmark.categories.length > 0 || bookmark.domains.length > 0) ? (
        <div className="detail-groups">
          {bookmark.categories.length > 0 ? (
            <div>
              <h3>Categories</h3>
              <div className="pill-row">
                {bookmark.categories.map((value) => <span key={value} className="pill">{value}</span>)}
              </div>
            </div>
          ) : null}
          {bookmark.domains.length > 0 ? (
            <div>
              <h3>Domains</h3>
              <div className="pill-row">
                {bookmark.domains.map((value) => <span key={value} className="pill">{value}</span>)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {item.links.length > 0 ? (
        <div className="detail-groups">
          <h3>Links</h3>
          <div className="link-stack">
            {item.links.map((link) => (
              <a key={link} href={link} target="_blank" rel="noreferrer">{link}</a>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
