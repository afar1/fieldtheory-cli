import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { resolveWebBuildDir, startWebServer as startServer, type RunningWebServer, type WebServerOptions } from './web-server.js';

export interface WebCommandOptions extends WebServerOptions {
  open?: boolean;
}

export function assertWebAssetsBuilt(): void {
  const buildDir = resolveWebBuildDir();
  const indexPath = `${buildDir}/index.html`;
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Web assets not found at ${buildDir}. Run npm run build first.`);
  }
}

function tryOpenBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === 'darwin'
    ? ['open', url]
    : platform === 'win32'
      ? ['cmd', '/c', 'start', '', url]
      : ['xdg-open', url];

  try {
    const child = spawn(command[0], command.slice(1), {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => {
      // Browser launch is a convenience only.
    });
    child.unref();
  } catch {
    // Browser launch is a convenience only.
  }
}

export async function startWebServer(options: WebCommandOptions = {}): Promise<RunningWebServer> {
  const server = await startServer(options);
  if (options.open) tryOpenBrowser(server.url);
  return server;
}
