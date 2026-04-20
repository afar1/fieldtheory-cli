import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';

const PROXY_ENV_KEYS = [
  'HTTPS_PROXY',
  'https_proxy',
  'HTTP_PROXY',
  'http_proxy',
  'ALL_PROXY',
  'all_proxy',
] as const;

export function hasProxyEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return PROXY_ENV_KEYS.some((key) => {
    const value = env[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

interface ConfigureHttpProxyOptions {
  env?: NodeJS.ProcessEnv;
  createAgent?: () => unknown;
  setDispatcher?: (dispatcher: unknown) => void;
}

export function configureHttpProxyFromEnv(
  {
    env = process.env,
    createAgent = () => new EnvHttpProxyAgent(),
    setDispatcher = (dispatcher: unknown) => setGlobalDispatcher(dispatcher as Parameters<typeof setGlobalDispatcher>[0]),
  }: ConfigureHttpProxyOptions = {},
): boolean {
  if (!hasProxyEnv(env)) return false;

  setDispatcher(createAgent());
  return true;
}
