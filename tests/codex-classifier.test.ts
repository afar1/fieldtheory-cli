import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { invokeClassifier } from '../src/bookmark-classify-llm.js';
import { fakeCodex } from './helpers/fake-codex.js';

test('Codex classification uses CLI auth and default config while preserving final-file behavior', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-codex-test-'));
  const previous = process.env.CODEX_API_KEY;
  process.env.CODEX_API_KEY = 'fake-key';
  try {
    const bin = fakeCodex(dir, `
      if (process.env.CODEX_API_KEY !== 'fake-key') process.exit(7);
      if (!args.includes('configured-model') || !args.includes('model_reasoning_effort="high"')) process.exit(8);
      if (!args.includes('--ignore-user-config')) process.exit(10);
      if (!args.includes('features.plugins=false') || !args.includes('features.apps=false') ||
          args.some(arg => arg.startsWith('mcp_servers.'))) process.exit(9);
      fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], '[]');
      console.log('Session chatter with [irrelevant data]');
    `);
    const engine = { name: 'codex', label: 'test', model: 'configured-model', effort: 'high', config: {
      bin, args: (prompt: string) => ['exec', '--skip-git-repo-check', '--model', 'configured-model',
        '--config', 'model_reasoning_effort="high"', prompt],
    } };
    assert.equal(await invokeClassifier(engine, 'classify'), '[]');
    assert.equal(await invokeClassifier(engine, 'classify again'), '[]');
    const calls = fs.readFileSync(path.join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.ok(calls.every(args => args.includes('--ignore-user-config')));
    assert.equal(calls.length, 2);
    assert.ok(calls.every(args => !args.includes('list')));
    assert.ok(calls.every(args => args.includes('features.plugins=false')));
  } finally {
    if (previous === undefined) delete process.env.CODEX_API_KEY;
    else process.env.CODEX_API_KEY = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

for (const [command, fail] of [['classify', true], ['classify-domains', true], ['sync', true], ['sync', false]] as const) {
  test(`${command} retries existing backlog and reports failure=${fail}`, async () => {
    const { buildIndex } = await import('../src/bookmarks-db.js');
    const { openDb, saveDb } = await import('../src/db.js');
    const { twitterBookmarksIndexPath } = await import('../src/paths.js');
    const { spawnSync } = await import('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-classify-exit-'));
    const previous = process.env.FT_DATA_DIR;
    process.env.FT_DATA_DIR = dir;
    try {
      fakeCodex(dir, fail
        ? `console.error('ERROR: You have no credits remaining.'); process.exitCode = 1;`
        : `fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], JSON.stringify([{
            id: '1', categories: ['opinion'], domains: ['science'], primary: 'science',
          }]));`);
      fs.writeFileSync(path.join(dir, 'bookmarks.jsonl'), JSON.stringify({
        id: '1', tweetId: '1', url: 'https://x.com/test/status/1', text: 'A note',
        authorHandle: 'test', authorName: 'Test', links: [], tags: [],
        syncedAt: '2026-10-08T00:00:00Z', postedAt: '2026-10-08T00:00:00Z',
        language: 'en', engagement: {}, mediaObjects: [], ingestedVia: 'graphql',
      }) + '\n');
      await buildIndex();
      const db = await openDb(twitterBookmarksIndexPath());
      db.run('UPDATE bookmarks SET primary_category = NULL, primary_domain = NULL');
      saveDb(db, twitterBookmarksIndexPath());
      db.close();
      fs.writeFileSync(path.join(dir, '.update-check'), '0.0.0');
      const mock = path.join(dir, 'mock-fetch.mjs');
      fs.writeFileSync(mock, `globalThis.fetch = async () => new Response(JSON.stringify({
        data: { bookmark_timeline_v2: { timeline: { instructions: [] } } }
      }));`);
      const cli = new URL('../src/cli.ts', import.meta.url).pathname;
      const args = command === 'sync'
        ? ['sync', '--classify', '--engine', 'codex', '--no-media', '--cookies', 'test', 'test']
        : [command, '--engine', 'codex'];
      const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', mock, cli, ...args], {
        encoding: 'utf8', env: { ...process.env, PATH: dir + path.delimiter + process.env.PATH }, timeout: 15_000,
      });
      assert.equal(result.status, fail ? 1 : 0, result.stderr + result.stdout);
      if (fail) assert.match(result.stderr, /You have no credits remaining/);
      assert.equal(fs.existsSync(path.join(dir, 'classification-lock.json')), false);
      const status = await import('../src/bookmarks-db.js');
      assert.deepEqual(await status.getClassificationProgress(), { total: 1, categoriesDone: fail ? 0 : 1, domainsDone: fail ? 0 : 1 });
    } finally {
      if (previous === undefined) delete process.env.FT_DATA_DIR;
      else process.env.FT_DATA_DIR = previous;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
