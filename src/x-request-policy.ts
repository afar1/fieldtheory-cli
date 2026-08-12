export type XRequestStatus =
  | 'ok'
  | 'graphql_error'
  | 'not_found'
  | 'forbidden'
  | 'rate_limited'
  | 'server_error'
  | 'error';

export interface XJsonResponse {
  status: XRequestStatus;
  json?: unknown;
  graphqlErrors?: unknown;
  httpStatus?: number;
  attempts: number;
}

export interface XRequestExecutorOptions {
  delayMs?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  retryBackoffMs?: (status: 'network' | 'rate_limited' | 'server_error', attempt: number, response?: Response) => number;
}

function retryAfterMs(response?: Response): number | undefined {
  const value = response?.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const resumeAt = Date.parse(value);
  if (Number.isNaN(resumeAt)) return undefined;
  return Math.max(0, resumeAt - Date.now());
}

function defaultRetryBackoffMs(
  status: 'network' | 'rate_limited' | 'server_error',
  attempt: number,
  response?: Response,
): number {
  if (status === 'rate_limited') {
    return retryAfterMs(response) ?? Math.min(15 * Math.pow(2, attempt - 1), 120) * 1000;
  }
  if (status === 'server_error') return 5000 * attempt;
  return 2000 * attempt;
}

export class XRequestExecutor {
  private readonly delayMs: number;
  private readonly maxAttempts: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly retryBackoffMs: NonNullable<XRequestExecutorOptions['retryBackoffMs']>;
  private actualAttempts = 0;

  constructor(options: XRequestExecutorOptions = {}) {
    this.delayMs = Math.max(0, options.delayMs ?? 0);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 4);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.retryBackoffMs = options.retryBackoffMs ?? defaultRetryBackoffMs;
  }

  get attemptCount(): number {
    return this.actualAttempts;
  }

  private async beforeAttempt(retryBackoffMs: number): Promise<void> {
    if (this.actualAttempts > 0) {
      await this.sleep(Math.max(this.delayMs, retryBackoffMs));
    }
    this.actualAttempts += 1;
  }

  async requestJson(input: string | URL | Request, init?: RequestInit): Promise<XJsonResponse> {
    let retryBackoff = 0;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      await this.beforeAttempt(retryBackoff);
      let response: Response;
      try {
        response = await this.fetchImpl(input, init);
      } catch {
        if (attempt === this.maxAttempts) return { status: 'error', attempts: attempt };
        retryBackoff = this.retryBackoffMs('network', attempt);
        continue;
      }

      if (response.ok) {
        try {
          return {
            status: 'ok',
            json: await response.json(),
            httpStatus: response.status,
            attempts: attempt,
          };
        } catch {
          return { status: 'error', httpStatus: response.status, attempts: attempt };
        }
      }

      if (response.status === 429) {
        if (attempt === this.maxAttempts) {
          return { status: 'rate_limited', httpStatus: response.status, attempts: attempt };
        }
        retryBackoff = this.retryBackoffMs('rate_limited', attempt, response);
        continue;
      }
      if (response.status >= 500) {
        if (attempt === this.maxAttempts) {
          return { status: 'server_error', httpStatus: response.status, attempts: attempt };
        }
        retryBackoff = this.retryBackoffMs('server_error', attempt, response);
        continue;
      }
      if (response.status === 404) {
        return { status: 'not_found', httpStatus: response.status, attempts: attempt };
      }
      if (response.status === 401 || response.status === 403) {
        return { status: 'forbidden', httpStatus: response.status, attempts: attempt };
      }
      return { status: 'error', httpStatus: response.status, attempts: attempt };
    }
    return { status: 'error', attempts: this.maxAttempts };
  }

  async requestGraphqlJson(input: string | URL | Request, init?: RequestInit): Promise<XJsonResponse> {
    const response = await this.requestJson(input, init);
    if (response.status !== 'ok') return response;
    if (!response.json || typeof response.json !== 'object' || !Object.hasOwn(response.json, 'errors')) {
      return response;
    }
    const errors = (response.json as { errors?: unknown }).errors;
    if (Array.isArray(errors) && errors.length === 0) return response;
    return {
      ...response,
      status: 'graphql_error',
      graphqlErrors: errors,
    };
  }
}
