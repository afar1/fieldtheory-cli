import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countBookmarks, getBookmarkById, listBookmarks, type BookmarkTimelineFilters } from './bookmarks-db.js';
import { countLikes, getLikeById, listLikes, type LikeTimelineFilters } from './likes-db.js';
import {
  dataDir,
  twitterBookmarksCachePath,
  twitterBookmarksIndexPath,
  twitterLikesCachePath,
  twitterLikesIndexPath,
} from './paths.js';
import type { ApiListResponse, ApiStatusResponse } from './web-types.js';

export interface WebServerOptions {
  host?: string;
  port?: number;
  staticDir?: string;
}

export interface RunningWebServer {
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}

function parseInteger(value: string | undefined, fallback: number, min = 0): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

function isMissingTableError(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message);
}

function repoRootFromModule(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, '..');
}

export function resolveWebBuildDir(override?: string): string {
  if (override) return override;
  if (process.env.FT_WEB_DIST_DIR) return process.env.FT_WEB_DIST_DIR;

  const repoRoot = repoRootFromModule();
  const candidates = [
    path.join(repoRoot, 'dist', 'web'),
    path.join(repoRoot, 'web', 'dist'),
  ];

  const found = candidates.find((candidate) => fs.existsSync(path.join(candidate, 'index.html')));
  return found ?? candidates[0];
}

async function loadIndexHtml(staticDir: string): Promise<string> {
  const indexPath = path.join(staticDir, 'index.html');
  try {
    return await readFile(indexPath, 'utf8');
  } catch {
    throw new Error(`Web assets not found at ${staticDir}. Run npm run build first.`);
  }
}

export async function createWebApp(options: WebServerOptions = {}): Promise<Hono> {
  const staticDir = resolveWebBuildDir(options.staticDir);
  const indexHtml = await loadIndexHtml(staticDir);
  const app = new Hono();

  app.onError((error) => {
    const message = error instanceof Error ? error.message : 'Unexpected server error';
    const status = /Invalid search query/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  });

  app.get('/api/status', async (c) => {
    const response: ApiStatusResponse = {
      dataDir: dataDir(),
      bookmarks: {
        total: fs.existsSync(twitterBookmarksIndexPath()) ? await countBookmarks() : 0,
        hasCache: fs.existsSync(twitterBookmarksCachePath()),
        hasIndex: fs.existsSync(twitterBookmarksIndexPath()),
      },
      likes: {
        total: fs.existsSync(twitterLikesIndexPath()) ? await countLikes() : 0,
        hasCache: fs.existsSync(twitterLikesCachePath()),
        hasIndex: fs.existsSync(twitterLikesIndexPath()),
      },
    };
    return c.json(response);
  });

  app.get('/api/bookmarks', async (c) => {
    const limit = parseInteger(c.req.query('limit'), 30, 1);
    const offset = parseInteger(c.req.query('offset'), 0, 0);
    const sort: 'asc' | 'desc' = c.req.query('sort') === 'asc' ? 'asc' : 'desc';
    if (!fs.existsSync(twitterBookmarksIndexPath())) {
      const response: ApiListResponse<never> = {
        source: 'bookmarks',
        total: 0,
        limit,
        offset,
        items: [],
      };
      return c.json(response);
    }
    const filters: BookmarkTimelineFilters = {
      query: c.req.query('query'),
      author: c.req.query('author'),
      after: c.req.query('after'),
      before: c.req.query('before'),
      category: c.req.query('category'),
      domain: c.req.query('domain'),
      sort,
      limit,
      offset,
    };
    let items: Awaited<ReturnType<typeof listBookmarks>> = [];
    let total = 0;
    try {
      [items, total] = await Promise.all([
        listBookmarks(filters),
        countBookmarks(filters),
      ]);
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }

    const response: ApiListResponse<(typeof items)[number]> = {
      source: 'bookmarks',
      total,
      limit,
      offset,
      items,
    };
    return c.json(response);
  });

  app.get('/api/bookmarks/:id', async (c) => {
    if (!fs.existsSync(twitterBookmarksIndexPath())) {
      return c.json({ error: 'Bookmark not found' }, 404);
    }
    let item = null;
    try {
      item = await getBookmarkById(c.req.param('id'));
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
    if (!item) return c.json({ error: 'Bookmark not found' }, 404);
    return c.json(item);
  });

  app.get('/api/likes', async (c) => {
    const limit = parseInteger(c.req.query('limit'), 30, 1);
    const offset = parseInteger(c.req.query('offset'), 0, 0);
    const sort: 'asc' | 'desc' = c.req.query('sort') === 'asc' ? 'asc' : 'desc';
    if (!fs.existsSync(twitterLikesIndexPath())) {
      const response: ApiListResponse<never> = {
        source: 'likes',
        total: 0,
        limit,
        offset,
        items: [],
      };
      return c.json(response);
    }
    const filters: LikeTimelineFilters = {
      query: c.req.query('query'),
      author: c.req.query('author'),
      after: c.req.query('after'),
      before: c.req.query('before'),
      sort,
      limit,
      offset,
    };
    let items: Awaited<ReturnType<typeof listLikes>> = [];
    let total = 0;
    try {
      [items, total] = await Promise.all([
        listLikes(filters),
        countLikes(filters),
      ]);
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }

    const response: ApiListResponse<(typeof items)[number]> = {
      source: 'likes',
      total,
      limit,
      offset,
      items,
    };
    return c.json(response);
  });

  app.get('/api/likes/:id', async (c) => {
    if (!fs.existsSync(twitterLikesIndexPath())) {
      return c.json({ error: 'Like not found' }, 404);
    }
    let item = null;
    try {
      item = await getLikeById(c.req.param('id'));
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
    if (!item) return c.json({ error: 'Like not found' }, 404);
    return c.json(item);
  });

  app.get('/assets/*', serveStatic({ root: staticDir }));
  app.get('/favicon.ico', (c) => c.body(null, 204));
  app.get('*', (c) => c.html(indexHtml));

  return app;
}

export async function startWebServer(options: WebServerOptions = {}): Promise<RunningWebServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4310;
  const app = await createWebApp(options);

  const server = serve({
    fetch: app.fetch,
    hostname: host,
    port,
  });

  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };
      const onError = (error: Error) => {
        server.off('listening', onListening);
        reject(error);
      };
      server.once('listening', onListening);
      server.once('error', onError);
    });
  }

  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    host,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
