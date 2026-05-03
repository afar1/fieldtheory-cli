import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { canonicalCommandsDir, canonicalDataDir, canonicalLibraryDir, dataDir, libraryDir, mdDir, commandsDir, mdSchemaPath } from '../src/paths.js';

function withEnv(env: Record<string, string | undefined>, fn: () => void): void {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('paths: env overrides split data, library, and commands roots', () => {
  withEnv({
    FT_DATA_DIR: '/tmp/ft-data',
    FT_LIBRARY_DIR: '/tmp/ft-library',
    FT_COMMANDS_DIR: '/tmp/ft-commands',
  }, () => {
    assert.equal(dataDir(), '/tmp/ft-data');
    assert.equal(libraryDir(), '/tmp/ft-library');
    assert.equal(mdDir(), '/tmp/ft-library');
    assert.equal(commandsDir(), '/tmp/ft-commands');
    assert.equal(canonicalDataDir(), '/tmp/ft-data');
    assert.equal(canonicalLibraryDir(), '/tmp/ft-library');
    assert.equal(canonicalCommandsDir(), '/tmp/ft-commands');
    assert.equal(mdSchemaPath(), path.join('/tmp/ft-library', 'schema.md'));
  });
});

test('paths: FT_DATA_DIR keeps the legacy md child unless FT_LIBRARY_DIR is set', () => {
  withEnv({
    FT_DATA_DIR: '/tmp/ft-data',
    FT_LIBRARY_DIR: undefined,
    FT_COMMANDS_DIR: undefined,
  }, () => {
    assert.equal(dataDir(), '/tmp/ft-data');
    assert.equal(libraryDir(), '/tmp/ft-data/md');
    assert.equal(mdDir(), '/tmp/ft-data/md');
  });
});

test('paths: default command root is under ~/.fieldtheory', () => {
  withEnv({
    FT_COMMANDS_DIR: undefined,
  }, () => {
    assert.equal(commandsDir(), path.join(os.homedir(), '.fieldtheory', 'commands'));
  });
});
