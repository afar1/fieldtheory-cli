import assert from 'node:assert/strict';
import test from 'node:test';
import { hydrateCanonicalBookmark } from '../src/bookmark-snapshot.js';
import type { BookmarkTimelineItem } from '../src/bookmarks-db.js';
import type { BookmarkRecord } from '../src/types.js';

const ROOT = '2042685676949270724';
const QUOTE = '2042685676949270000';
const ARTICLE = 'https://x.com/i/article/2042676487711584257';

function archived(overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  return {
    id: ROOT,
    tweetId: ROOT,
    url: `https://x.com/operator/status/${ROOT}`,
    text: 'New archive-owned root text.',
    postedAt: '2026-08-11T00:00:00.000Z',
    syncedAt: '2026-08-11T01:00:00.000Z',
    quotedStatusId: QUOTE,
    links: [ARTICLE],
    ...overrides,
  };
}

function indexed(overrides: Partial<BookmarkTimelineItem> = {}): BookmarkTimelineItem {
  return {
    id: ROOT,
    tweetId: ROOT,
    url: `https://x.com/operator/status/${ROOT}`,
    text: 'Stale indexed root text.',
    postedAt: '2026-01-01T00:00:00.000Z',
    syncedAt: '2026-01-01T01:00:00.000Z',
    categories: [],
    domains: [],
    githubUrls: [],
    links: ['https://example.com/stale'],
    articleTitle: 'Bound indexed article',
    articleText: 'Legitimate DB-only article enrichment.',
    articleSite: 'X Articles',
    articleSourceTweetId: ROOT,
    articleLocator: 'https://twitter.com/i/article/2042676487711584257',
    quotedStatusId: QUOTE,
    quotedTweet: {
      id: QUOTE,
      text: 'Legitimate DB-only quoted source.',
      url: `https://x.com/quoted/status/${QUOTE}`,
    },
    mediaCount: 0,
    linkCount: 1,
    folderIds: [],
    folderNames: [],
    ...overrides,
  };
}

test('canonical hydration keeps every archive-owned root field while accepting exactly bound DB enrichment', () => {
  const source = archived();
  const result = hydrateCanonicalBookmark(source, indexed());

  assert.equal(result.id, source.id);
  assert.equal(result.tweetId, source.tweetId);
  assert.equal(result.url, source.url);
  assert.equal(result.text, source.text);
  assert.equal(result.postedAt, source.postedAt);
  assert.equal(result.syncedAt, source.syncedAt);
  assert.deepEqual(result.links, source.links);
  assert.equal(result.quotedStatusId, QUOTE);
  assert.equal(result.quotedTweet?.id, QUOTE);
  assert.equal(result.quotedTweet?.text, 'Legitimate DB-only quoted source.');
  assert.equal(result.articleText, 'Legitimate DB-only article enrichment.');
  assert.equal(result.articleSourceTweetId, ROOT);
  assert.equal(result.articleLocator, ARTICLE);
});

test('canonical hydration rejects stale quote identity and wrong-root or wrong-locator article enrichment', () => {
  const wrongQuote = hydrateCanonicalBookmark(archived(), indexed({
    quotedStatusId: '1111111111111111111',
    quotedTweet: {
      id: '1111111111111111111',
      text: 'Wrong quote.',
      url: 'https://x.com/wrong/status/1111111111111111111',
    },
  }));
  assert.equal(wrongQuote.quotedTweet, undefined);

  for (const badIndex of [
    indexed({ articleSourceTweetId: '9999999999999999999' }),
    indexed({ articleLocator: 'https://x.com/i/article/1000000000000000000' }),
    indexed({ tweetId: '9999999999999999999' }),
  ]) {
    const result = hydrateCanonicalBookmark(archived(), badIndex);
    assert.equal(result.articleText, null);
    assert.equal(result.articleLocator, null);
  }
});

test('canonical hydration rejects unbound component content already present in the archive', () => {
  const result = hydrateCanonicalBookmark(archived({
    quotedTweet: {
      id: '1111111111111111111',
      text: 'Wrong archived quote.',
      url: 'https://x.com/wrong/status/1111111111111111111',
    },
    articleText: 'Ambiguous archived body.',
    articleSourceTweetId: ROOT,
    articleLocator: 'https://x.com/i/article/1000000000000000000',
  }), null);

  assert.equal(result.quotedTweet, undefined);
  assert.equal(result.articleText, null);
  assert.equal(result.articleLocator, null);
});

test('canonical hydration requires explicit archived article provenance and locator binding', () => {
  for (const source of [
    archived({
      articleText: 'Body without a source tweet.',
      articleSourceTweetId: null,
      articleLocator: ARTICLE,
    }),
    archived({
      articleText: 'Body without a source locator.',
      articleSourceTweetId: ROOT,
      articleLocator: null,
    }),
    archived({
      links: [ARTICLE, 'https://x.com/i/article/1000000000000000000'],
      articleText: 'Body with ambiguous locator identity.',
      articleSourceTweetId: ROOT,
      articleLocator: null,
    }),
  ]) {
    const result = hydrateCanonicalBookmark(source, null);
    assert.equal(result.articleText, null);
    assert.equal(result.articleSourceTweetId, null);
    assert.equal(result.articleLocator, null);
  }

  const valid = hydrateCanonicalBookmark(archived({
    articleText: 'Explicitly source-bound archived article body.',
    articleSourceTweetId: ROOT,
    articleLocator: ARTICLE,
  }), null);
  assert.equal(valid.articleText, 'Explicitly source-bound archived article body.');
  assert.equal(valid.articleSourceTweetId, ROOT);
  assert.equal(valid.articleLocator, ARTICLE);
});
