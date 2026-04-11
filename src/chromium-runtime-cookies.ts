import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserDef } from './browsers.js';

export interface ChromiumRuntimeCookieResult {
  csrfToken: string;
  cookieHeader: string;
}

function executableCandidates(browser: BrowserDef): string[] {
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  const localAppData = process.env.LOCALAPPDATA;

  const candidatesByBrowser: Record<string, Array<string | undefined>> = {
    chrome: [
      programFiles && join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      programFilesX86 && join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      localAppData && join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ],
    edge: [
      programFilesX86 && join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      programFiles && join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      localAppData && join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ],
    brave: [
      programFiles && join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      programFilesX86 && join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      localAppData && join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    ],
    chromium: [
      programFiles && join(programFiles, 'Chromium', 'Application', 'chrome.exe'),
      programFilesX86 && join(programFilesX86, 'Chromium', 'Application', 'chrome.exe'),
      localAppData && join(localAppData, 'Chromium', 'Application', 'chrome.exe'),
    ],
  };

  return (candidatesByBrowser[browser.id] ?? []).filter((path): path is string => Boolean(path));
}

function resolveExecutablePath(browser: BrowserDef): string {
  for (const candidate of executableCandidates(browser)) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    `Could not find a ${browser.displayName} executable for runtime cookie extraction on Windows.\n` +
      'Fix: Make sure the browser is installed in the default location.\n' +
      'Or pass cookies manually:  fieldtheory sync --cookies <ct0> <auth_token>'
  );
}

function findCookieValue(
  cookies: Array<{ name: string; value: string; domain: string }>,
  name: 'ct0' | 'auth_token',
): string | undefined {
  const forX = cookies.find((cookie) => cookie.name === name && cookie.domain.endsWith('x.com'));
  if (forX?.value) return forX.value;

  const forTwitter = cookies.find((cookie) => cookie.name === name && cookie.domain.endsWith('twitter.com'));
  return forTwitter?.value;
}

export async function extractChromiumXCookiesViaRuntime(
  chromeUserDataDir: string,
  profileDirectory: string,
  browser: BrowserDef,
): Promise<ChromiumRuntimeCookieResult> {
  const executablePath = resolveExecutablePath(browser);
  const { chromium } = await import('playwright-core');

  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;

  try {
    context = await chromium.launchPersistentContext(chromeUserDataDir, {
      executablePath,
      headless: true,
      args: [
        `--profile-directory=${profileDirectory}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
  } catch (error) {
    throw new Error(
      `Could not launch ${browser.displayName} for runtime cookie extraction.\n` +
        `Fix: Close ${browser.displayName} completely and retry.\n` +
        `If your X login is in a different profile, pass --chrome-profile-directory <name>.\n` +
        `Details: ${(error as Error).message}`
    );
  }

  try {
    const cookies = await context.cookies(['https://x.com', 'https://twitter.com']);
    const csrfToken = findCookieValue(cookies, 'ct0');
    const authToken = findCookieValue(cookies, 'auth_token');

    if (!csrfToken) {
      throw new Error(
        `No ct0 CSRF cookie found for x.com in ${browser.displayName}.\n` +
          'This usually means you are using the wrong browser profile.\n' +
          `Fix: Re-run with --chrome-profile-directory <name> (for example "Default" or "Profile 1").`
      );
    }

    const cookieHeader = authToken
      ? `ct0=${csrfToken}; auth_token=${authToken}`
      : `ct0=${csrfToken}`;

    return { csrfToken, cookieHeader };
  } finally {
    await context.close();
  }
}
