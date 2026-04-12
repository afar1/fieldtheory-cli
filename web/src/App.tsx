import { startTransition, useEffect, useState } from 'react';
import { fetchArchiveItem, fetchArchiveList, fetchStatus } from './api';
import { ArchiveLayout } from './components/archive-layout';
import type { ArchiveSource, BookmarkItem, LikeItem, StatusResponse } from './types';

export function App() {
  const [source, setSource] = useState<ArchiveSource>('bookmarks');
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [items, setItems] = useState<Array<BookmarkItem | LikeItem>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<BookmarkItem | LikeItem | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setDetailError(null);

    fetchArchiveList(source, { query: submittedQuery, limit: 40, offset: 0 })
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setSelectedId(response.items[0]?.id ?? null);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setItems([]);
        setSelectedId(null);
        setDetailError(error.message);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [source, submittedQuery]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedItem(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    fetchArchiveItem(source, selectedId)
      .then((item) => {
        if (!cancelled) setSelectedItem(item);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setSelectedItem(null);
          setDetailError(error.message);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [source, selectedId]);

  return (
    <ArchiveLayout
      source={source}
      status={status}
      items={items}
      selectedId={selectedId}
      selectedItem={selectedItem}
      listLoading={listLoading}
      detailLoading={detailLoading}
      detailError={detailError}
      query={queryInput}
      onQueryChange={setQueryInput}
      onSearch={() => {
        startTransition(() => {
          setSubmittedQuery(queryInput.trim());
        });
      }}
      onSelectSource={(nextSource) => {
        setSource(nextSource);
        setSelectedItem(null);
      }}
      onSelectItem={setSelectedId}
    />
  );
}
