import type { ArchiveSource, BookmarkItem, LikeItem, StatusResponse } from '../types';
import { DetailPane } from './detail-pane';
import { ItemList } from './item-list';
import { SearchBar } from './search-bar';

interface ArchiveLayoutProps {
  source: ArchiveSource;
  status: StatusResponse | null;
  items: Array<BookmarkItem | LikeItem>;
  selectedId: string | null;
  selectedItem: BookmarkItem | LikeItem | null;
  listLoading: boolean;
  detailLoading: boolean;
  detailError: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSelectSource: (source: ArchiveSource) => void;
  onSelectItem: (id: string) => void;
}

function formatCount(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : '0';
}

export function ArchiveLayout(props: ArchiveLayoutProps) {
  const activeCount = props.source === 'bookmarks' ? props.status?.bookmarks.total : props.status?.likes.total;

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <div className="eyebrow">Local archive browser</div>
          <h1>Bookmarks and likes, on your machine.</h1>
          <p>
            Search the archive, open details fast, and jump back to the original post when you need the full thread.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <span>Bookmarks</span>
            <strong>{formatCount(props.status?.bookmarks.total)}</strong>
          </div>
          <div>
            <span>Likes</span>
            <strong>{formatCount(props.status?.likes.total)}</strong>
          </div>
          <div>
            <span>Active view</span>
            <strong>{formatCount(activeCount)}</strong>
          </div>
        </div>
      </section>

      <section className="toolbar">
        <div className="tabs" role="tablist" aria-label="Archive type">
          {(['bookmarks', 'likes'] as const).map((source) => (
            <button
              key={source}
              type="button"
              role="tab"
              aria-selected={props.source === source}
              className={`tab${props.source === source ? ' is-active' : ''}`}
              onClick={() => props.onSelectSource(source)}
            >
              {source}
            </button>
          ))}
        </div>
        <SearchBar query={props.query} onQueryChange={props.onQueryChange} onSubmit={props.onSearch} />
      </section>

      <section className="workspace">
        <aside className="list-panel">
          <ItemList
            items={props.items}
            source={props.source}
            selectedId={props.selectedId}
            loading={props.listLoading}
            onSelect={props.onSelectItem}
          />
        </aside>
        <DetailPane
          source={props.source}
          item={props.selectedItem}
          loading={props.detailLoading}
          error={props.detailError}
        />
      </section>
    </main>
  );
}
