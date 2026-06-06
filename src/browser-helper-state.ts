import { readJson } from './fs.js';
import { browserHelperStatePath } from './paths.js';

export type BrowserPanelTarget = Record<string, unknown> & {
  kind?: unknown;
  path?: unknown;
};

type BrowserHelperState = {
  host: string;
  port: number;
  token: string;
  browserUrl?: string;
  panelUrl?: string;
};

function normalizeState(value: unknown): BrowserHelperState | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.host !== 'string' || record.host.trim() === '') return null;
  if (typeof record.port !== 'number' || !Number.isInteger(record.port) || record.port <= 0) return null;
  if (typeof record.token !== 'string' || record.token.trim() === '') return null;
  return {
    host: record.host,
    port: record.port,
    token: record.token,
    browserUrl: typeof record.browserUrl === 'string' && record.browserUrl.trim() ? record.browserUrl : undefined,
    panelUrl: typeof record.panelUrl === 'string' && record.panelUrl.trim() ? record.panelUrl : undefined,
  };
}

async function assertHelperAvailable(state: BrowserHelperState): Promise<void> {
  const healthUrl = `http://${state.host}:${state.port}/health?token=${encodeURIComponent(state.token)}`;
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
  if (!response.ok) throw new Error(`Field Theory browser helper returned HTTP ${response.status}.`);
}

export async function buildBrowserPanelUrl(target: BrowserPanelTarget): Promise<string> {
  let state: BrowserHelperState | null = null;
  try {
    state = normalizeState(await readJson<unknown>(browserHelperStatePath()));
  } catch {
    state = null;
  }
  if (!state) {
    throw new Error('Field Theory browser helper is not available. Start Field Theory with FIELD_THEORY_BROWSER_HELPER=1, then run ft panel again.');
  }

  try {
    await assertHelperAvailable(state);
  } catch (error) {
    throw new Error('Field Theory browser helper is not responding. Restart Field Theory with FIELD_THEORY_BROWSER_HELPER=1, then run ft panel again.', { cause: error });
  }

  const baseUrl = state.panelUrl || state.browserUrl || `http://${state.host}:${state.port}/browser-library.html`;
  const url = new URL(baseUrl);
  if (!state.panelUrl) {
    url.pathname = '/browser-library.html';
    url.searchParams.set('api', `http://${state.host}:${state.port}`);
    url.searchParams.set('token', state.token);
  }
  url.searchParams.set('target', JSON.stringify(target));
  return url.toString();
}
