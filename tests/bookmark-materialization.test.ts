import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { materializeBookmark } from '../src/bookmark-materialization.js';
import type { MediaFetchManifest } from '../src/bookmark-media.js';
import type { BookmarkRecord } from '../src/types.js';

function record(overrides: Partial<BookmarkRecord> = {}): BookmarkRecord {
  return {
    id: '2080296884187652381',
    tweetId: '2080296884187652381',
    url: 'https://x.com/operator/status/2080296884187652381',
    text: 'Root post with a linked paper and an attached image.',
    authorHandle: 'operator',
    authorName: 'Operator',
    postedAt: '2026-08-01T12:00:00.000Z',
    syncedAt: '2026-08-10T12:00:00.000Z',
    links: ['https://example.com/paper.pdf'],
    quotedStatusId: '2080000000000000000',
    quotedTweet: {
      id: '2080000000000000000',
      text: 'Quoted source with evidence.',
      authorHandle: 'quoted',
      url: 'https://x.com/quoted/status/2080000000000000000',
      links: ['https://example.com/source'],
    },
    threadContext: [{
      id: '2080296884187652380',
      text: 'Parent context.',
      authorHandle: 'operator',
      url: 'https://x.com/operator/status/2080296884187652380',
    }],
    threadBelow: [{
      id: '2080296884187652382',
      text: 'Same-author continuation with the actual repository.',
      authorHandle: 'operator',
      url: 'https://x.com/operator/status/2080296884187652382',
      links: ['https://github.com/example/project'],
    }],
    threadExpandedAt: '2026-08-10T12:01:00.000Z',
    articleTitle: 'A long-form argument',
    articleText: 'Complete X Article body.',
    articleSite: 'X Articles',
    enrichedAt: '2026-08-10T12:00:30.000Z',
    ...overrides,
  };
}

test('materializeBookmark emits exact components without leaking source-local paths', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-materialize-'));
  const assetPath = path.join(dir, 'image.jpg');
  await writeFile(assetPath, Buffer.from([1, 2, 3, 4]));
  try {
    const source = record({
      mediaObjects: [{
        type: 'photo',
        url: 'https://pbs.twimg.com/media/root.jpg',
        width: 1200,
        height: 800,
        altText: 'Architecture diagram',
      }],
    });
    const manifest: MediaFetchManifest = {
      schemaVersion: 1,
      generatedAt: '2026-08-10T12:02:00.000Z',
      limit: 1,
      maxBytes: 1024,
      processed: 1,
      downloaded: 1,
      skippedTooLarge: 0,
      failed: 0,
      entries: [{
        bookmarkId: source.id,
        tweetId: source.tweetId,
        tweetUrl: source.url,
        sourceUrl: 'https://pbs.twimg.com/media/root.jpg',
        localPath: assetPath,
        contentType: 'image/jpeg',
        bytes: 4,
        status: 'downloaded',
        fetchedAt: '2026-08-10T12:02:00.000Z',
      }],
    };

    const result = await materializeBookmark(source, manifest);
    const relations = result.components.map((row) => row.relation);
    assert.equal(result.source_family, 'field_theory_x');
    assert.equal(result.topology.enumeration_complete, true);
    assert.equal(result.topology.thread_context_count, 1);
    assert.equal(result.topology.thread_continuation_count, 1);
    assert.ok(relations.includes('root_post'));
    assert.ok(relations.includes('thread_parent_context'));
    assert.ok(relations.includes('thread_same_author_continuation'));
    assert.ok(relations.includes('quoted_post'));
    assert.ok(relations.includes('embedded_x_article'));
    assert.ok(relations.includes('post_outbound_pdf'));
    assert.ok(relations.includes('post_attached_media'));
    assert.ok(relations.includes('post_media_interpretation'));
    assert.deepEqual(
      result.components.find((row) => row.relation === 'post_attached_media')?.source_asset,
      {
        sha256: '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a',
        bytes: 4,
        content_type: 'image/jpeg',
      },
    );
    assert.equal(
      result.components.find((row) => row.relation === 'post_outbound_pdf')?.disposition,
      'unresolved',
    );
    assert.equal(
      result.components.find((row) => row.relation === 'post_outbound_pdf')?.traversal_hop,
      2,
    );
    assert.equal(
      result.components.find((row) => row.relation === 'post_outbound_pdf')?.mandatory_direct,
      false,
    );
    assert.equal(
      result.components.find((row) => row.relation === 'post_media_interpretation')?.disposition,
      'unresolved',
    );
    assert.ok(!JSON.stringify(result).includes(assetPath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('materializeBookmark exposes missing thread and quote content as explicit gaps', async () => {
  const result = await materializeBookmark(record({
    quotedTweet: undefined,
    threadContext: [],
    threadBelow: [],
    threadExpandedAt: undefined,
    articleText: null,
  }));
  assert.equal(result.topology.enumeration_complete, false);
  assert.equal(
    result.components.find((row) => row.relation === 'thread_completeness')?.disposition,
    'unresolved',
  );
  assert.equal(
    result.components.find((row) => row.relation === 'quoted_post')?.disposition,
    'unavailable',
  );
});

test('materializeBookmark does not duplicate a recovered X Article as an unresolved outbound gap', async () => {
  const articleUrl = 'https://x.com/i/article/2042676487711584257';
  const articleAlias = 'https://twitter.com/i/article/2042676487711584257';
  const result = await materializeBookmark(record({
    links: [articleAlias, articleUrl, 'https://example.com/other'],
  }));
  const article = result.components.find((row) => row.relation === 'embedded_x_article');
  assert.equal(article?.source_locator, articleUrl);
  assert.equal(article?.disposition, 'used');
  assert.equal(
    result.components.some((row) => (
      (row.source_locator === articleUrl || row.source_locator === articleAlias)
      && row.disposition === 'unresolved'
    )),
    false,
  );
  assert.equal(
    result.components.find((row) => row.source_locator === 'https://example.com/other')?.disposition,
    'unresolved',
  );
});

test('materializeBookmark leaves every X Article locator unresolved when body identity is ambiguous', async () => {
  const firstArticle = 'https://x.com/i/article/2042676487711584257';
  const secondArticle = 'https://x.com/i/article/1000000000000000000';
  const result = await materializeBookmark(record({
    links: [firstArticle, secondArticle],
  }));

  const recovered = result.components.find((row) => row.relation === 'embedded_x_article');
  assert.equal(recovered?.source_locator, result.locator);
  assert.equal(recovered?.disposition, 'used');
  for (const locator of [firstArticle, secondArticle]) {
    assert.equal(
      result.components.find((row) => row.source_locator === locator)?.disposition,
      'unresolved',
    );
  }
  assert.equal(result.achieved_depth, 'source-owned root and enumerated components with explicit unresolved depth');
});

test('materializeBookmark binds poster and video variant to separate exact assets', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-materialize-video-'));
  const posterPath = path.join(dir, 'poster.jpg');
  const videoPath = path.join(dir, 'video.mp4');
  await writeFile(posterPath, Buffer.from([1, 2, 3, 4]));
  await writeFile(videoPath, Buffer.from([5, 6, 7, 8]));
  try {
    const posterUrl = 'https://pbs.twimg.com/amplify_video_thumb/root.jpg';
    const videoUrl = 'https://video.twimg.com/ext_tw_video/root.mp4';
    const source = record({
      mediaObjects: [{
        type: 'video',
        url: posterUrl,
        videoVariants: [{ url: videoUrl, contentType: 'video/mp4', bitrate: 832000 }],
      }],
    });
    const manifest: MediaFetchManifest = {
      schemaVersion: 1,
      generatedAt: '2026-08-10T12:02:00.000Z',
      limit: 1,
      maxBytes: 1024,
      processed: 2,
      downloaded: 2,
      skippedTooLarge: 0,
      failed: 0,
      entries: [
        {
          bookmarkId: source.id,
          tweetId: source.tweetId,
          tweetUrl: source.url,
          sourceUrl: posterUrl,
          localPath: posterPath,
          contentType: 'image/jpeg',
          bytes: 4,
          status: 'downloaded',
          fetchedAt: '2026-08-10T12:02:00.000Z',
        },
        {
          bookmarkId: source.id,
          tweetId: source.tweetId,
          tweetUrl: source.url,
          sourceUrl: videoUrl,
          localPath: videoPath,
          contentType: 'video/mp4',
          bytes: 4,
          status: 'downloaded',
          fetchedAt: '2026-08-10T12:02:00.000Z',
        },
      ],
    };

    const result = await materializeBookmark(source, manifest);
    const assets = result.components
      .filter((row) => row.relation === 'post_attached_media')
      .map((row) => ({ locator: row.source_locator, asset: row.source_asset, content: row.content }));

    assert.deepEqual(assets.map(({ locator, asset }) => ({ locator, asset })), [
      {
        locator: posterUrl,
        asset: {
          sha256: '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a',
          bytes: 4,
          content_type: 'image/jpeg',
        },
      },
      {
        locator: videoUrl,
        asset: {
          sha256: '55e5509f8052998294266ee5b50cb592938191fb5d67f73cac2e60b0276b1bdd',
          bytes: 4,
          content_type: 'video/mp4',
        },
      },
    ]);
    assert.match(assets[0].content ?? '', /\"asset_role\":\"media\"/);
    assert.match(assets[1].content ?? '', /\"asset_role\":\"video_variant\"/);
    assert.match(assets[1].content ?? '', /\"bitrate\":832000/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
