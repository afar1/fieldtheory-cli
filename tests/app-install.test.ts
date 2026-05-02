import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installFieldTheoryApp, selectFieldTheoryDmgAsset } from '../src/app-install.js';

test('selectFieldTheoryDmgAsset prefers the arm64 DMG', () => {
  const asset = selectFieldTheoryDmgAsset({
    tag_name: 'v0.1.103',
    assets: [
      { name: 'Field.Theory-0.1.103-arm64-mac.zip', browser_download_url: 'https://example.com/app.zip' },
      { name: 'Field.Theory-0.1.103.dmg', browser_download_url: 'https://example.com/app-universal.dmg' },
      { name: 'Field.Theory-0.1.103-arm64.dmg', browser_download_url: 'https://example.com/app-arm64.dmg' },
    ],
  });

  assert.equal(asset.name, 'Field.Theory-0.1.103-arm64.dmg');
});

test('selectFieldTheoryDmgAsset reports available assets when no DMG exists', () => {
  assert.throws(() => selectFieldTheoryDmgAsset({
    tag_name: 'v0.1.103',
    assets: [
      { name: 'Field.Theory-0.1.103-arm64-mac.zip', browser_download_url: 'https://example.com/app.zip' },
      { name: 'latest-mac.yml', browser_download_url: 'https://example.com/latest-mac.yml' },
    ],
  }), /no downloadable DMG asset.*latest-mac\.yml/);
});

test('installFieldTheoryApp rejects non-macOS before network or installer work', async () => {
  let fetched = false;
  let executed = false;

  await assert.rejects(() => installFieldTheoryApp({
    platform: 'linux',
    fetch: (async () => {
      fetched = true;
      throw new Error('should not fetch');
    }) as typeof fetch,
    execFile: async () => {
      executed = true;
      return { stdout: '', stderr: '' };
    },
  }), /only supported on macOS/);

  assert.equal(fetched, false);
  assert.equal(executed, false);
});

test('installFieldTheoryApp downloads, mounts, copies, and detaches with injected runners', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-app-install-test-'));
  const installDir = path.join(tmpDir, 'Applications');
  const calls: Array<{ file: string; args: readonly string[] }> = [];

  const fetcher = (async (url: string) => {
    if (url === 'https://example.com/latest') {
      return new Response(JSON.stringify({
        tag_name: 'v1.2.3',
        assets: [
          {
            name: 'Field.Theory-1.2.3-arm64.dmg',
            browser_download_url: 'https://example.com/Field.Theory-1.2.3-arm64.dmg',
          },
        ],
      }), { status: 200 });
    }
    if (url === 'https://example.com/Field.Theory-1.2.3-arm64.dmg') {
      return new Response('fake dmg bytes', { status: 200 });
    }
    return new Response('not found', { status: 404, statusText: 'Not Found' });
  }) as typeof fetch;

  const execFile = async (file: string, args: readonly string[]) => {
    calls.push({ file, args });
    if (file === 'hdiutil' && args[0] === 'attach') {
      const mountPoint = String(args[args.indexOf('-mountpoint') + 1]);
      const appContents = path.join(mountPoint, 'Field Theory.app', 'Contents');
      fs.mkdirSync(appContents, { recursive: true });
      fs.writeFileSync(path.join(appContents, 'Info.plist'), 'fake plist');
    }
    if (file === 'ditto') {
      fs.cpSync(String(args[0]), String(args[1]), { recursive: true });
    }
    return { stdout: '', stderr: '' };
  };

  try {
    const result = await installFieldTheoryApp({
      platform: 'darwin',
      fetch: fetcher,
      execFile,
      installDir,
      releaseApiUrl: 'https://example.com/latest',
      env: {},
    });

    assert.equal(result.release, 'v1.2.3');
    assert.equal(result.assetName, 'Field.Theory-1.2.3-arm64.dmg');
    assert.equal(result.appPath, path.join(installDir, 'Field Theory.app'));
    assert.equal(fs.existsSync(path.join(result.appPath, 'Contents', 'Info.plist')), true);
    assert.deepEqual(calls.map((call) => call.file), ['hdiutil', 'ditto', 'hdiutil']);
    assert.equal(calls[0].args[0], 'attach');
    assert.equal(calls[2].args[0], 'detach');
    assert.ok(String(calls[1].args[0]).endsWith(path.join('mount', 'Field Theory.app')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
