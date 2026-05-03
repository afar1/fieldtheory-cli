import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildFieldTheoryOpenTarget, openFieldTheoryTarget } from '../src/app-open.js';

test('app-open builds Field Theory wiki URL for library paths', () => {
  const previous = process.env.FT_LIBRARY_DIR;
  process.env.FT_LIBRARY_DIR = '/tmp/ft-library';
  try {
    const target = buildFieldTheoryOpenTarget('entries/hello', 'library');
    assert.equal(target.kind, 'library');
    assert.equal(target.supported, true);
    assert.equal(target.path, path.join('/tmp/ft-library', 'entries', 'hello.md'));
    assert.ok(target.url?.startsWith('fieldtheory://wiki/open?'));
    assert.ok(target.url?.includes('immersive=true'));
  } finally {
    if (previous === undefined) delete process.env.FT_LIBRARY_DIR;
    else process.env.FT_LIBRARY_DIR = previous;
  }
});

test('app-open reports command paths as unsupported deep links', () => {
  const previous = process.env.FT_COMMANDS_DIR;
  process.env.FT_COMMANDS_DIR = '/tmp/ft-commands';
  try {
    const target = buildFieldTheoryOpenTarget('review', 'command');
    assert.equal(target.kind, 'command');
    assert.equal(target.supported, false);
    assert.equal(target.url, null);
    assert.equal(target.path, path.join('/tmp/ft-commands', 'review.md'));
  } finally {
    if (previous === undefined) delete process.env.FT_COMMANDS_DIR;
    else process.env.FT_COMMANDS_DIR = previous;
  }
});

test('app-open targets packaged Field Theory bundle instead of bare URL handler', () => {
  const target = {
    kind: 'library' as const,
    path: '/tmp/ft-library/page.md',
    url: 'fieldtheory://wiki/open?file=%2Ftmp%2Fft-library%2Fpage.md&immersive=true',
    supported: true,
  };
  const calls: Array<{ command: string; args: string[] }> = [];

  const result = openFieldTheoryTarget(target, {
    platform: 'darwin',
    env: {},
    spawn: (command, args) => {
      calls.push({ command, args });
      return { status: 0 };
    },
  });

  assert.deepEqual(result, { launched: true, method: 'bundle' });
  assert.deepEqual(calls, [{
    command: 'open',
    args: ['-b', 'com.fieldtheory.app', target.url],
  }]);
});

test('app-open supports explicit development checkout launcher', () => {
  const target = {
    kind: 'library' as const,
    path: '/tmp/ft-library/page.md',
    url: 'fieldtheory://wiki/open?file=%2Ftmp%2Fft-library%2Fpage.md&immersive=true',
    supported: true,
  };
  const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];

  const result = openFieldTheoryTarget(target, {
    platform: 'darwin',
    env: { FT_APP_DEV_DIR: '/tmp/fieldtheory/mac-app' },
    spawn: (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      return { status: 0 };
    },
  });

  assert.deepEqual(result, { launched: true, method: 'dev-dir' });
  assert.deepEqual(calls, [{
    command: path.join('/tmp/fieldtheory/mac-app', 'node_modules', '.bin', 'electron'),
    args: ['/tmp/fieldtheory/mac-app', target.url],
    cwd: '/tmp/fieldtheory/mac-app',
  }]);
});
