import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function withReposStore(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-ideas-repos-test-'));
  const saved = process.env.FT_DATA_DIR;
  process.env.FT_DATA_DIR = dir;
  try {
    await fn(dir);
  } finally {
    if (saved !== undefined) process.env.FT_DATA_DIR = saved;
    else delete process.env.FT_DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  }
}

async function getRepos() {
  return import('../src/ideas-repos.js');
}

test('listSavedRepos: returns empty when registry does not exist', async () => {
  await withReposStore(async () => {
    const repos = await getRepos();
    assert.deepEqual(repos.listSavedRepos(), []);
  });
});

test('addRepoToRegistry: stores absolute path and reports added=true on first add', async () => {
  await withReposStore(async () => {
    const repos = await getRepos();
    const result = repos.addRepoToRegistry('/tmp/example-repo');
    assert.equal(result.added, true);
    assert.equal(result.canonical, '/tmp/example-repo');
    assert.deepEqual(repos.listSavedRepos(), ['/tmp/example-repo']);
  });
});

test('addRepoToRegistry: dedupes on canonical form', async () => {
  await withReposStore(async () => {
    const repos = await getRepos();
    repos.addRepoToRegistry('/tmp/example-repo');
    const second = repos.addRepoToRegistry('/tmp/example-repo/');
    assert.equal(second.added, false);
    assert.deepEqual(repos.listSavedRepos(), ['/tmp/example-repo']);
  });
});

test('addRepoToRegistry: expands ~ to home directory', async () => {
  await withReposStore(async () => {
    const repos = await getRepos();
    const result = repos.addRepoToRegistry('~/dev/example');
    assert.ok(result.canonical.endsWith('/dev/example'));
    assert.ok(path.isAbsolute(result.canonical));
    assert.ok(!result.canonical.includes('~'));
  });
});

test('removeRepoFromRegistry: returns removed=false for unknown paths', async () => {
  await withReposStore(async () => {
    const repos = await getRepos();
    repos.addRepoToRegistry('/tmp/keep');
    const result = repos.removeRepoFromRegistry('/tmp/missing');
    assert.equal(result.removed, false);
    assert.deepEqual(repos.listSavedRepos(), ['/tmp/keep']);
  });
});

test('removeRepoFromRegistry: removes a known path', async () => {
  await withReposStore(async () => {
    const repos = await getRepos();
    repos.addRepoToRegistry('/tmp/a');
    repos.addRepoToRegistry('/tmp/b');
    const result = repos.removeRepoFromRegistry('/tmp/a');
    assert.equal(result.removed, true);
    assert.deepEqual(repos.listSavedRepos(), ['/tmp/b']);
  });
});

test('clearReposRegistry: returns removed count and empties the registry', async () => {
  await withReposStore(async () => {
    const repos = await getRepos();
    repos.addRepoToRegistry('/tmp/a');
    repos.addRepoToRegistry('/tmp/b');
    repos.addRepoToRegistry('/tmp/c');
    const count = repos.clearReposRegistry();
    assert.equal(count, 3);
    assert.deepEqual(repos.listSavedRepos(), []);
  });
});

test('normalizeRepoPath: rejects empty input', async () => {
  const repos = await getRepos();
  assert.throws(() => repos.normalizeRepoPath('   '), /empty/);
});

test('resolveRepoList: --repos beats --repo beats registry', async () => {
  const repos = await getRepos();
  const resolution = repos.resolveRepoList({
    singleRepo: '/from-single',
    multiRepos: ['/from-multi-a', '/from-multi-b'],
    savedRepos: ['/from-registry'],
  });
  // singleRepo + multiRepos together is an error case, not a precedence case.
  assert.equal(resolution.kind, 'error');
  if (resolution.kind === 'error') assert.equal(resolution.reason, 'both-flags');
});

test('resolveRepoList: --repos used when only --repos given', async () => {
  const repos = await getRepos();
  const resolution = repos.resolveRepoList({
    multiRepos: ['/a', '/b'],
    savedRepos: ['/registry'],
  });
  assert.equal(resolution.kind, 'ok');
  if (resolution.kind === 'ok') assert.deepEqual(resolution.repos, ['/a', '/b']);
});

test('resolveRepoList: --repo used when only --repo given', async () => {
  const repos = await getRepos();
  const resolution = repos.resolveRepoList({
    singleRepo: '/just-one',
    savedRepos: ['/registry'],
  });
  assert.equal(resolution.kind, 'ok');
  if (resolution.kind === 'ok') assert.deepEqual(resolution.repos, ['/just-one']);
});

test('resolveRepoList: registry used when neither flag given', async () => {
  const repos = await getRepos();
  const resolution = repos.resolveRepoList({ savedRepos: ['/saved-a', '/saved-b'] });
  assert.equal(resolution.kind, 'ok');
  if (resolution.kind === 'ok') assert.deepEqual(resolution.repos, ['/saved-a', '/saved-b']);
});

test('resolveRepoList: returns "none" error when nothing is available', async () => {
  const repos = await getRepos();
  const resolution = repos.resolveRepoList({ savedRepos: [] });
  assert.equal(resolution.kind, 'error');
  if (resolution.kind === 'error') assert.equal(resolution.reason, 'none');
});

test('resolveRepoList: empty multiRepos array does not satisfy the flag', async () => {
  const repos = await getRepos();
  const resolution = repos.resolveRepoList({
    multiRepos: [],
    savedRepos: ['/fallback'],
  });
  // Empty --repos should fall through to registry.
  assert.equal(resolution.kind, 'ok');
  if (resolution.kind === 'ok') assert.deepEqual(resolution.repos, ['/fallback']);
});
