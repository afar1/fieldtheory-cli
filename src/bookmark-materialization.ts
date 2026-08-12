import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { MediaFetchEntry, MediaFetchManifest } from './bookmark-media.js';
import type { BookmarkMediaObject, BookmarkRecord, QuotedTweetSnapshot, ThreadTweetSnapshot } from './types.js';
import type { ExactXRefreshObservation } from './x-materialize.js';
import { bindArticleLocator, isXArticleLocator, sameSourceLocator } from './source-bindings.js';

export type MaterializationDisposition =
  | 'used'
  | 'duplicate'
  | 'contradicted'
  | 'unavailable'
  | 'excluded'
  | 'unresolved';

export interface SourceComponent {
  component_id: string;
  relation: string;
  traversal_hop: number;
  mandatory_direct: boolean;
  materiality: 'answer_required' | 'material';
  achieved_depth: string;
  source_locator: string;
  content: string | null;
  disposition: MaterializationDisposition;
  disposition_reason: string;
  source_asset?: {
    sha256: string;
    bytes: number;
    content_type: string | null;
  } | null;
}

export interface BookmarkMaterialization {
  root_id: string;
  source_family: 'field_theory_x';
  source_id: string;
  locator: string;
  author_handle: string | null;
  posted_at: string | null;
  source_cutoff: string | null;
  achieved_depth: string;
  topology: {
    enumeration_complete: boolean;
    component_count: number;
    thread_context_count: number;
    thread_continuation_count: number;
  };
  components: SourceComponent[];
}

interface SourceTweet {
  id: string;
  text: string;
  url: string;
  authorHandle?: string;
  authorName?: string;
  postedAt?: string | null;
  links?: string[];
  media?: string[];
  mediaObjects?: BookmarkMediaObject[];
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function componentId(rootId: string, label: string): string {
  return `${rootId}-${label}-${sha256(label).slice(0, 8)}`.slice(0, 96);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function component(
  rootId: string,
  label: string,
  relation: string,
  locator: string,
  content: string | null,
  disposition: MaterializationDisposition,
  dispositionReason: string,
  options: {
    hop?: number;
    mandatory?: boolean;
    materiality?: 'answer_required' | 'material';
    achievedDepth?: string;
    sourceAsset?: SourceComponent['source_asset'];
  } = {},
): SourceComponent {
  const hop = options.hop ?? 1;
  return {
    component_id: componentId(rootId, label),
    relation,
    traversal_hop: hop,
    mandatory_direct: options.mandatory ?? hop === 1,
    materiality: options.materiality ?? 'answer_required',
    achieved_depth: options.achievedDepth ?? (disposition === 'used'
      ? 'exact source-owned representation at materialization time'
      : 'identity only; source content was not recovered'),
    source_locator: locator,
    content,
    disposition,
    disposition_reason: dispositionReason,
    ...(options.sourceAsset !== undefined ? { source_asset: options.sourceAsset } : {}),
  };
}

function uniquePublicLinks(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => {
    if (!value) return false;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }))].sort();
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function sourceTweetLinks(source: SourceTweet): string[] {
  return uniquePublicLinks(source.links ?? []);
}

function mediaUrls(mediaObject: BookmarkMediaObject): string[] {
  const variantUrls = (mediaObject.videoVariants ?? mediaObject.variants ?? [])
    .map((variant) => variant.url);
  return uniquePublicLinks([
    mediaObject.previewUrl,
    mediaObject.url,
    mediaObject.mediaUrl,
    ...variantUrls,
  ]);
}

function mediaEntriesFor(
  source: SourceTweet,
  manifest: MediaFetchManifest | null,
): MediaFetchEntry[] {
  const allowed = new Set([
    ...(source.media ?? []),
    ...(source.mediaObjects ?? []).flatMap(mediaUrls),
  ]);
  return (manifest?.entries ?? []).filter((entry) => (
    entry.tweetId === source.id && allowed.has(entry.sourceUrl)
  ));
}

async function exactAsset(entry: MediaFetchEntry | undefined): Promise<SourceComponent['source_asset']> {
  if (!entry || entry.status !== 'downloaded' || !entry.localPath) return null;
  try {
    const bytes = await readFile(entry.localPath);
    if (entry.bytes !== undefined && entry.bytes !== bytes.byteLength) return null;
    return {
      sha256: sha256(bytes),
      bytes: bytes.byteLength,
      content_type: entry.contentType ?? null,
    };
  } catch {
    return null;
  }
}

async function appendMediaComponents(
  target: SourceComponent[],
  rootId: string,
  source: SourceTweet,
  relationPrefix: string,
  hop: number,
  manifest: MediaFetchManifest | null,
): Promise<void> {
  const entries = mediaEntriesFor(source, manifest);
  const objects = source.mediaObjects ?? [];
  const fallbackUrls = objects.length === 0 ? uniquePublicLinks(source.media ?? []) : [];
  for (const [objectIndex, item] of objects.entries()) {
    const candidates: Array<{
      url?: string;
      role: 'preview' | 'media' | 'video_variant';
      contentType?: string;
      bitrate?: number;
    }> = [
      { url: item.previewUrl, role: 'preview' },
      { url: item.url, role: 'media' },
      { url: item.mediaUrl, role: 'media' },
      ...(item.videoVariants ?? item.variants ?? []).map((variant) => ({
        url: variant.url,
        role: 'video_variant' as const,
        contentType: variant.contentType,
        bitrate: variant.bitrate,
      })),
    ];
    const seen = new Set<string>();
    const assets = candidates.filter((candidate) => {
      if (!candidate.url || !isPublicHttpUrl(candidate.url) || seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    });

    for (const [assetIndex, candidate] of assets.entries()) {
      const locator = candidate.url!;
      const matchingEntry = entries.find((entry) => entry.sourceUrl === locator);
      const asset = await exactAsset(matchingEntry);
      target.push(component(
        rootId,
        `${relationPrefix}-media-${objectIndex + 1}-asset-${assetIndex + 1}`,
        `${relationPrefix}_attached_media`,
        locator,
        canonicalJson({
          type: item.type ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
          alt_text: item.altText ?? null,
          asset_role: candidate.role,
          declared_content_type: candidate.contentType ?? null,
          bitrate: candidate.bitrate ?? null,
          source_url: locator,
        }),
        'used',
        asset ? 'media metadata and exact source-local asset recovered' : 'media metadata recovered; exact source-local asset unavailable',
        {
          hop,
          achievedDepth: asset
            ? 'exact media metadata plus source-local asset hash and byte count'
            : 'exact media metadata only; source bytes are not recovered',
          sourceAsset: asset,
        },
      ));
    }
    const locator = assets[0]?.url ?? source.url;
    target.push(component(
      rootId,
      `${relationPrefix}-media-${objectIndex + 1}-interpretation`,
      `${relationPrefix}_media_interpretation`,
      locator,
      null,
      'unresolved',
      'OCR, transcript, captions, or material visual interpretation are not produced by Field Theory',
      { hop, achievedDepth: 'media identity and metadata only' },
    ));
  }

  for (const [index, locator] of fallbackUrls.entries()) {
    const matchingEntry = entries.find((entry) => entry.sourceUrl === locator);
    const asset = await exactAsset(matchingEntry);
    target.push(component(
      rootId,
      `${relationPrefix}-fallback-media-${index + 1}`,
      `${relationPrefix}_attached_media`,
      locator,
      canonicalJson({ type: null, asset_role: 'media', source_url: locator }),
      'used',
      asset ? 'media identity and exact source-local asset recovered' : 'media identity recovered; exact source-local asset unavailable',
      {
        hop,
        achievedDepth: asset
          ? 'exact media identity plus source-local asset hash and byte count'
          : 'exact media identity only; source bytes are not recovered',
        sourceAsset: asset,
      },
    ));
    target.push(component(
      rootId,
      `${relationPrefix}-fallback-media-${index + 1}-interpretation`,
      `${relationPrefix}_media_interpretation`,
      locator,
      null,
      'unresolved',
      'OCR, transcript, captions, or material visual interpretation are not produced by Field Theory',
      { hop, achievedDepth: 'media identity only' },
    ));
  }
}

function appendOutboundComponents(
  target: SourceComponent[],
  rootId: string,
  source: SourceTweet,
  relationPrefix: string,
  hop: number,
): void {
  for (const [index, link] of sourceTweetLinks(source).entries()) {
    const isPdf = /\.pdf(?:$|[?#])/i.test(link);
    target.push(component(
      rootId,
      `${relationPrefix}-link-${index + 1}`,
      isPdf ? `${relationPrefix}_outbound_pdf` : `${relationPrefix}_outbound_link`,
      link,
      link,
      'unresolved',
      isPdf
        ? 'PDF identity recovered; PDF text, figures, and tables require the destination source owner'
        : 'outbound identity recovered; destination content requires the destination source owner',
      { hop, materiality: 'material', achievedDepth: 'exact outbound identity only' },
    ));
  }
}

async function appendTweetComponents(
  target: SourceComponent[],
  rootId: string,
  source: SourceTweet,
  label: string,
  relation: string,
  hop: number,
  manifest: MediaFetchManifest | null,
): Promise<void> {
  target.push(component(
    rootId,
    label,
    relation,
    source.url,
    source.text,
    source.text.trim() ? 'used' : 'unavailable',
    source.text.trim() ? 'source post text recovered' : 'source post text unavailable',
    { hop },
  ));
  appendOutboundComponents(target, rootId, source, label, hop + 1);
  await appendMediaComponents(target, rootId, source, label, hop, manifest);
}

function quotedSource(value: QuotedTweetSnapshot): SourceTweet {
  return {
    id: value.id,
    text: value.text,
    url: value.url,
    authorHandle: value.authorHandle,
    authorName: value.authorName,
    postedAt: value.postedAt,
    links: value.links,
    media: value.media,
    mediaObjects: value.mediaObjects,
  };
}

function threadSource(value: ThreadTweetSnapshot): SourceTweet {
  return {
    id: value.id,
    text: value.text,
    url: value.url,
    authorHandle: value.authorHandle,
    authorName: value.authorName,
    postedAt: value.postedAt,
    links: value.links,
    media: value.media,
    mediaObjects: value.mediaObjects,
  };
}

export async function materializeBookmark(
  item: BookmarkRecord,
  manifest: MediaFetchManifest | null = null,
  refresh: ExactXRefreshObservation | null = null,
): Promise<BookmarkMaterialization> {
  const rootId = `x-${sha256(item.tweetId).slice(0, 20)}`;
  const components: SourceComponent[] = [];
  const rootLinks = uniquePublicLinks(item.links ?? []);
  const recoveredArticleLink = item.articleText
    && item.articleSourceTweetId === item.tweetId
      ? bindArticleLocator(rootLinks, item.articleLocator)
      : undefined;
  const boundManifest = manifest
    ? { ...manifest, entries: manifest.entries.filter((entry) => entry.bookmarkId === item.id) }
    : null;
  const rootSource: SourceTweet = {
    id: item.tweetId,
    text: item.text,
    url: item.url,
    authorHandle: item.authorHandle,
    authorName: item.authorName,
    postedAt: item.postedAt,
    links: recoveredArticleLink
      ? rootLinks.filter((link) => !sameSourceLocator(link, recoveredArticleLink))
      : rootLinks,
    media: item.media,
    mediaObjects: item.mediaObjects,
  };

  components.push(component(
    rootId,
    'author-time-identity',
    'root_author_time_identity',
    item.url,
    canonicalJson({
      author_handle: item.authorHandle ?? null,
      author_name: item.authorName ?? null,
      posted_at: item.postedAt ?? null,
      source_id: item.tweetId,
    }),
    'used',
    'exact stored root identity recovered',
  ));
  await appendTweetComponents(components, rootId, rootSource, 'post', 'root_post', 1, boundManifest);

  for (const [index, row] of (item.threadContext ?? []).entries()) {
    await appendTweetComponents(
      components,
      rootId,
      threadSource(row),
      `thread-context-${index + 1}`,
      'thread_parent_context',
      1,
      boundManifest,
    );
  }
  for (const [index, row] of (item.threadBelow ?? []).entries()) {
    await appendTweetComponents(
      components,
      rootId,
      threadSource(row),
      `thread-continuation-${index + 1}`,
      'thread_same_author_continuation',
      1,
      boundManifest,
    );
  }
  if (!item.threadExpandedAt) {
    components.push(component(
      rootId,
      'thread-completeness',
      'thread_completeness',
      item.url,
      null,
      item.threadExpansionFailedAt ? 'unavailable' : 'unresolved',
      item.threadExpansionFailedAt
        ? 'exact thread expansion ended in a permanent source-local failure'
        : 'exact thread expansion has not completed for this root',
      { achievedDepth: 'root identity only; thread topology is not complete' },
    ));
  }

  if (refresh) {
    components.push(component(
      rootId,
      'source-currentness',
      'source_currentness',
      item.url,
      canonicalJson(refresh),
      refresh.status === 'complete' ? 'used' : refresh.status === 'unavailable' ? 'unavailable' : 'unresolved',
      refresh.status === 'complete'
        ? 'exact root and bounded thread traversal completed on the current source route'
        : 'exact source refresh left one or more currentness or topology gaps',
      { achievedDepth: `exact source refresh status: ${refresh.status}` },
    ));
  }

  if (item.quotedStatusId) {
    if (item.quotedTweet?.id === item.quotedStatusId) {
      await appendTweetComponents(
        components,
        rootId,
        quotedSource(item.quotedTweet),
        'quoted-post',
        'quoted_post',
        1,
        boundManifest,
      );
    } else {
      components.push(component(
        rootId,
        'quoted-post',
        'quoted_post',
        `https://x.com/i/status/${item.quotedStatusId}`,
        null,
        'unavailable',
        'quoted post identity exists but source content is absent',
      ));
    }
  }

  if (item.articleText && recoveredArticleLink) {
    components.push(component(
      rootId,
      'x-article',
      'embedded_x_article',
      recoveredArticleLink,
      item.articleText,
      'used',
      'X long-form article content recovered',
    ));
  } else if (
    item.articleText
    || item.articleTitle
    || item.articleSite
    || (item.links ?? []).some(isXArticleLocator)
  ) {
    components.push(component(
      rootId,
      'x-article',
      'embedded_x_article',
      bindArticleLocator(rootLinks, item.articleLocator)
        ?? rootLinks.find(isXArticleLocator)
        ?? item.url,
      null,
      'unresolved',
      item.articleText
        ? 'X long-form article content is present but source-tweet or locator identity is unbound'
        : 'X long-form article identity exists but article content is absent',
    ));
  }

  const incomplete = components.some((row) => row.disposition === 'unavailable' || row.disposition === 'unresolved');
  return {
    root_id: rootId,
    source_family: 'field_theory_x',
    source_id: item.tweetId,
    locator: item.url,
    author_handle: item.authorHandle ?? null,
    posted_at: item.postedAt ?? null,
    source_cutoff: item.threadExpandedAt ?? item.enrichedAt ?? item.syncedAt ?? null,
    achieved_depth: incomplete
      ? 'source-owned root and enumerated components with explicit unresolved depth'
      : 'source-owned root and enumerated components recovered',
    topology: {
      enumeration_complete: Boolean(item.threadExpandedAt),
      component_count: components.length,
      thread_context_count: item.threadContext?.length ?? 0,
      thread_continuation_count: item.threadBelow?.length ?? 0,
    },
    components,
  };
}
