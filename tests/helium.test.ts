import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChromeSessionConfig } from '../src/config.js';

// These tests cover the Helium-support additions only. They poke the public
// config surface rather than the internal keychain lookup (which requires
// real Keychain access).

test('loadChromeSessionConfig: --browser helium resolves to Helium user-data dir on macOS', (t) => {
  if (process.platform !== 'darwin') {
    t.skip('macOS-only');
    return;
  }

  // Make sure env-var overrides don't shadow the --browser flag.
  const saved = {
    FT_BROWSER: process.env.FT_BROWSER,
    FT_CHROME_USER_DATA_DIR: process.env.FT_CHROME_USER_DATA_DIR,
    FT_CHROME_PROFILE_DIRECTORY: process.env.FT_CHROME_PROFILE_DIRECTORY,
  };
  delete process.env.FT_BROWSER;
  delete process.env.FT_CHROME_USER_DATA_DIR;
  delete process.env.FT_CHROME_PROFILE_DIRECTORY;

  try {
    const cfg = loadChromeSessionConfig({ browserId: 'helium' });
    assert.match(cfg.chromeUserDataDir, /net\.imput\.helium$/);
    assert.equal(cfg.chromeProfileDirectory, 'Default');
  } finally {
    if (saved.FT_BROWSER !== undefined) process.env.FT_BROWSER = saved.FT_BROWSER;
    if (saved.FT_CHROME_USER_DATA_DIR !== undefined) process.env.FT_CHROME_USER_DATA_DIR = saved.FT_CHROME_USER_DATA_DIR;
    if (saved.FT_CHROME_PROFILE_DIRECTORY !== undefined) process.env.FT_CHROME_PROFILE_DIRECTORY = saved.FT_CHROME_PROFILE_DIRECTORY;
  }
});

test('loadChromeSessionConfig: FT_BROWSER=helium env var is honored', (t) => {
  if (process.platform !== 'darwin') {
    t.skip('macOS-only');
    return;
  }

  const saved = {
    FT_BROWSER: process.env.FT_BROWSER,
    FT_CHROME_USER_DATA_DIR: process.env.FT_CHROME_USER_DATA_DIR,
  };
  delete process.env.FT_CHROME_USER_DATA_DIR;
  process.env.FT_BROWSER = 'helium';

  try {
    const cfg = loadChromeSessionConfig();
    assert.match(cfg.chromeUserDataDir, /net\.imput\.helium$/);
  } finally {
    if (saved.FT_BROWSER !== undefined) process.env.FT_BROWSER = saved.FT_BROWSER;
    else delete process.env.FT_BROWSER;
    if (saved.FT_CHROME_USER_DATA_DIR !== undefined) process.env.FT_CHROME_USER_DATA_DIR = saved.FT_CHROME_USER_DATA_DIR;
  }
});

test('loadChromeSessionConfig: case-insensitive browser id', (t) => {
  if (process.platform !== 'darwin') {
    t.skip('macOS-only');
    return;
  }

  const savedDir = process.env.FT_CHROME_USER_DATA_DIR;
  const savedBrowser = process.env.FT_BROWSER;
  delete process.env.FT_CHROME_USER_DATA_DIR;
  delete process.env.FT_BROWSER;
  try {
    const cfg = loadChromeSessionConfig({ browserId: 'HELIUM' });
    assert.match(cfg.chromeUserDataDir, /net\.imput\.helium$/);
  } finally {
    if (savedDir !== undefined) process.env.FT_CHROME_USER_DATA_DIR = savedDir;
    if (savedBrowser !== undefined) process.env.FT_BROWSER = savedBrowser;
  }
});

test('loadChromeSessionConfig: --browser chrome always returns Chrome path, even if Chrome is not installed', (t) => {
  // Regression: an explicit --browser choice must never silently fall back
  // to a different browser (cursor-bot on #13).
  if (process.platform !== 'darwin') {
    t.skip('macOS-only');
    return;
  }
  const saved = {
    FT_BROWSER: process.env.FT_BROWSER,
    FT_CHROME_USER_DATA_DIR: process.env.FT_CHROME_USER_DATA_DIR,
  };
  delete process.env.FT_BROWSER;
  delete process.env.FT_CHROME_USER_DATA_DIR;
  try {
    const cfg = loadChromeSessionConfig({ browserId: 'chrome' });
    assert.match(cfg.chromeUserDataDir, /Google\/Chrome$/);
    assert.doesNotMatch(cfg.chromeUserDataDir, /net\.imput\.helium/);
  } finally {
    if (saved.FT_BROWSER !== undefined) process.env.FT_BROWSER = saved.FT_BROWSER;
    if (saved.FT_CHROME_USER_DATA_DIR !== undefined) process.env.FT_CHROME_USER_DATA_DIR = saved.FT_CHROME_USER_DATA_DIR;
  }
});

test('loadChromeSessionConfig: unknown browser id throws a helpful error', () => {
  const saved = process.env.FT_CHROME_USER_DATA_DIR;
  delete process.env.FT_CHROME_USER_DATA_DIR;
  try {
    assert.throws(
      () => loadChromeSessionConfig({ browserId: 'bogus' }),
      /Unknown browser: "bogus"[\s\S]*Supported browsers: chrome, helium/,
    );
  } finally {
    if (saved !== undefined) process.env.FT_CHROME_USER_DATA_DIR = saved;
  }
});

test('loadChromeSessionConfig: no browserId falls back to Chrome default on macOS', (t) => {
  if (process.platform !== 'darwin') {
    t.skip('macOS-only');
    return;
  }

  const saved = {
    FT_BROWSER: process.env.FT_BROWSER,
    FT_CHROME_USER_DATA_DIR: process.env.FT_CHROME_USER_DATA_DIR,
  };
  delete process.env.FT_BROWSER;
  delete process.env.FT_CHROME_USER_DATA_DIR;

  try {
    const cfg = loadChromeSessionConfig();
    // When Chrome is installed, detection picks Chrome; otherwise it falls
    // back to Helium. Accept either so the test is portable across CI
    // machines.
    assert.match(cfg.chromeUserDataDir, /Google\/Chrome$|net\.imput\.helium$/);
  } finally {
    if (saved.FT_BROWSER !== undefined) process.env.FT_BROWSER = saved.FT_BROWSER;
    if (saved.FT_CHROME_USER_DATA_DIR !== undefined) process.env.FT_CHROME_USER_DATA_DIR = saved.FT_CHROME_USER_DATA_DIR;
  }
});
