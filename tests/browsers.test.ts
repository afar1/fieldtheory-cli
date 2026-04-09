import test from 'node:test';
import assert from 'node:assert/strict';
import { getBrowser, listBrowserIds, browserUserDataDir, detectBrowser } from '../src/browsers.js';

test('getBrowser: returns Chrome by id', () => {
  const browser = getBrowser('chrome');
  assert.equal(browser.id, 'chrome');
  assert.equal(browser.displayName, 'Google Chrome');
  assert.equal(browser.cookieBackend, 'chromium');
  assert.ok(browser.keychainEntries.length > 0);
});

test('getBrowser: case-insensitive lookup', () => {
  const browser = getBrowser('BRAVE');
  assert.equal(browser.id, 'brave');
});

test('getBrowser: unknown browser throws with supported list', () => {
  assert.throws(
    () => getBrowser('netscape'),
    /Unknown browser: "netscape"[\s\S]*Supported browsers:/,
  );
});

test('listBrowserIds: returns all registered ids', () => {
  const ids = listBrowserIds();
  assert.ok(ids.includes('chrome'));
  assert.ok(ids.includes('brave'));
  assert.ok(ids.includes('firefox'));
  assert.ok(ids.includes('helium'));
  assert.ok(ids.includes('comet'));
  assert.ok(ids.includes('chromium'));
});

test('getBrowser: firefox has firefox cookieBackend', () => {
  const browser = getBrowser('firefox');
  assert.equal(browser.cookieBackend, 'firefox');
  assert.equal(browser.keychainEntries.length, 0);
});

test('getBrowser: firefox has user-data paths for every supported OS', () => {
  const browser = getBrowser('firefox');
  assert.ok(browser.macPath, 'Firefox macPath must be set');
  assert.ok(browser.linuxPath, 'Firefox linuxPath must be set');
  assert.ok(browser.winPath, 'Firefox winPath must be set');
  // Windows Firefox lives under %APPDATA% (Roaming), not Local
  assert.match(browser.winPath!, /AppData[\\/]Roaming[\\/]Mozilla[\\/]Firefox/);
});

test('getBrowser: brave has correct keychain entries', () => {
  const browser = getBrowser('brave');
  const services = browser.keychainEntries.map(e => e.service);
  assert.ok(services.some(s => s.includes('Brave')));
});

test('browserUserDataDir: returns a path for known browsers on this OS', () => {
  const chrome = getBrowser('chrome');
  const dir = browserUserDataDir(chrome);
  assert.ok(dir, 'Expected a user-data dir for Chrome on this platform');
  assert.ok(dir.length > 0);
});

test('detectBrowser: returns a valid browser def', () => {
  const browser = detectBrowser();
  assert.ok(browser.id);
  assert.ok(browser.displayName);
  assert.equal(browser.cookieBackend, 'chromium');
});
