import crypto from 'node:crypto';
import http from 'node:http';
import { URL } from 'node:url';
import { pathExists, readJson, writeJson } from './fs.js';
import { ensureDataDir, twitterOauthTokenPath } from './paths.js';
import { loadXApiConfig } from './config.js';
import type { XOAuthTokenSet } from './types.js';

function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createPkce() {
  const verifier = base64Url(crypto.randomBytes(32));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64Url(crypto.randomBytes(16));
  return { verifier, challenge, state };
}

export function buildTwitterOAuthUrl(): { url: string; state: string; verifier: string } {
  const cfg = loadXApiConfig();
  if (!cfg.callbackUrl) {
    throw new Error('Missing X_CALLBACK_URL in .env.local');
  }

  const { verifier, challenge, state } = createPkce();
  const url = new URL('https://twitter.com/i/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.callbackUrl);
  url.searchParams.set('scope', 'tweet.read users.read bookmark.read offline.access');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return { url: url.toString(), state, verifier };
}

async function exchangeCodeForToken(code: string, verifier: string): Promise<XOAuthTokenSet> {
  const cfg = loadXApiConfig();
  if (!cfg.callbackUrl) {
    throw new Error('Missing X_CALLBACK_URL in .env.local');
  }

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.callbackUrl,
    code_verifier: verifier,
    client_id: cfg.clientId,
  });

  const response = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const text = await response.text();
  const parsed = JSON.parse(text);
  if (!response.ok) {
    throw new Error(`Token exchange failed (HTTP ${response.status}). Check your X API credentials.`);
  }

  return {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token,
    expires_in: parsed.expires_in,
    scope: parsed.scope,
    token_type: parsed.token_type,
    obtained_at: new Date().toISOString(),
  };
}

export async function saveTwitterOAuthToken(token: XOAuthTokenSet): Promise<string> {
  ensureDataDir();
  const tokenPath = twitterOauthTokenPath();
  await writeJson(tokenPath, token, { mode: 0o600 });
  // Restrict permissions — OAuth tokens should only be readable by the owner
  const { chmod } = await import('node:fs/promises');
  await chmod(tokenPath, 0o600);
  return tokenPath;
}

export async function loadTwitterOAuthToken(): Promise<XOAuthTokenSet | null> {
  const tokenPath = twitterOauthTokenPath();
  if (!(await pathExists(tokenPath))) return null;
  return readJson<XOAuthTokenSet>(tokenPath);
}

export async function runTwitterOAuthFlow(): Promise<{ tokenPath: string; scope?: string }> {
  const cfg = loadXApiConfig();
  if (!cfg.callbackUrl) {
    throw new Error('Missing X_CALLBACK_URL in .env.local');
  }

  const { url, state, verifier } = buildTwitterOAuthUrl();
  const callback = new URL(cfg.callbackUrl);
  const port = Number(callback.port || 80);
  const pathname = callback.pathname;

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
        if (reqUrl.pathname !== pathname) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        const returnedState = reqUrl.searchParams.get('state');
        const returnedCode = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');

        if (error) {
          res.statusCode = 400;
          res.end(`OAuth error: ${error}`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!returnedCode || returnedState !== state) {
          res.statusCode = 400;
          res.end('Invalid OAuth callback');
          server.close();
          reject(new Error('Invalid OAuth callback state/code'));
          return;
        }

        res.statusCode = 200;
        res.end('ft auth complete. You can close this tab.');
        server.close();
        resolve(returnedCode);
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      console.log('Open this URL in your browser to authorize X bookmarks access:');
      console.log(url);
    });
  });

  const token = await exchangeCodeForToken(code, verifier);
  const tokenPath = await saveTwitterOAuthToken(token);
  return { tokenPath, scope: token.scope };
}
