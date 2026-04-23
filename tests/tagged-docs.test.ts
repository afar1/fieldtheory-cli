import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addContact, findContact, listContacts, removeContact } from '../src/contacts.js';
import { parseFieldTheorySession } from '../src/fieldtheory-session.js';
import { parseFrontmatter, stringifyFrontmatter } from '../src/frontmatter.js';
import { dataDir, defaultDataDir, legacyDataDir, migrateDefaultDataDir } from '../src/paths.js';

const sequential = { concurrency: false };
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function withIsolatedHome(fn: (home: string) => Promise<void> | void): Promise<void> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-home-'));
  const savedHome = process.env.HOME;
  const savedUserProfile = process.env.USERPROFILE;
  const savedFtDataDir = process.env.FT_DATA_DIR;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.FT_DATA_DIR;

  try {
    await fn(home);
  } finally {
    if (savedHome !== undefined) process.env.HOME = savedHome;
    else delete process.env.HOME;
    if (savedUserProfile !== undefined) process.env.USERPROFILE = savedUserProfile;
    else delete process.env.USERPROFILE;
    if (savedFtDataDir !== undefined) process.env.FT_DATA_DIR = savedFtDataDir;
    else delete process.env.FT_DATA_DIR;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

function writeSession(home: string, email = 'me@example.com'): void {
  const dir = path.join(home, '.fieldtheory');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify({
    user_id: 'user_123',
    email,
    display_name: 'Me Example',
    expires_at: '2999-01-01T00:00:00.000Z',
  }, null, 2));
}

function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number | null } {
  const cliUrl = pathToFileURL(path.join(repoRoot, 'src', 'cli.ts')).href;
  const script = `import { buildCli } from ${JSON.stringify(cliUrl)}; await buildCli().parseAsync(['node', 'ft', ...process.argv.slice(1)]);`;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--eval', script, ...args], {
    cwd: repoRoot,
    env: { ...process.env },
    encoding: 'utf-8',
  });

  return {
    stdout: child.stdout,
    stderr: child.stderr,
    exitCode: child.status,
  };
}

test('frontmatter helper round-trips YAML data semantically', sequential, () => {
  const doc = stringifyFrontmatter({
    id: 'doc_1',
    from: 'me@example.com',
    to: ['a@example.com', 'b@example.com'],
  }, '# Hello\n\nBody\n');

  const parsed = parseFrontmatter(doc);
  assert.deepEqual(parsed.data.to, ['a@example.com', 'b@example.com']);
  assert.equal(parsed.data.from, 'me@example.com');
  assert.equal(parsed.content, '# Hello\n\nBody\n');
});

test('paths default to ~/.fieldtheory/bookmarks and migrate legacy data with a symlink', sequential, async () => {
  await withIsolatedHome((home) => {
    assert.equal(dataDir(), path.join(home, '.fieldtheory', 'bookmarks'));

    fs.mkdirSync(legacyDataDir(), { recursive: true });
    fs.writeFileSync(path.join(legacyDataDir(), 'bookmarks.jsonl'), '{}\n');
    assert.equal(dataDir(), legacyDataDir());

    const status = migrateDefaultDataDir();
    assert.ok(['linked', 'already-linked'].includes(status), `unexpected migration status ${status}`);
    assert.equal(dataDir(), defaultDataDir());
    assert.equal(fs.realpathSync(defaultDataDir()), fs.realpathSync(legacyDataDir()));
    assert.ok(fs.existsSync(path.join(defaultDataDir(), 'bookmarks.jsonl')));
  });
});

test('session parser returns one normalized email identity', sequential, () => {
  const session = parseFieldTheorySession({
    user_id: 'user_123',
    email: 'ME@EXAMPLE.COM',
    display_name: 'Me',
    expires_at: '2999-01-01T00:00:00.000Z',
  });

  assert.deepEqual(session, {
    user_id: 'user_123',
    email: 'me@example.com',
    display_name: 'Me',
    expires_at: '2999-01-01T00:00:00.000Z',
  });
});

test('session parser accepts numeric Supabase expiry timestamps', sequential, () => {
  const session = parseFieldTheorySession({
    user_id: 'user_123',
    email: 'me@example.com',
    expires_at: 32503680000,
  });

  assert.equal(session.expires_at, '3000-01-01T00:00:00.000Z');
});

test('contacts APIs store records keyed by email and find exact names', sequential, async () => {
  await withIsolatedHome(() => {
    const contact = addContact('Ada@Example.com', 'Ada Lovelace');
    assert.equal(contact.email, 'ada@example.com');
    assert.equal(listContacts().length, 1);
    assert.equal(findContact('Ada Lovelace')?.email, 'ada@example.com');
    assert.equal(removeContact('ada@example.com'), true);
    assert.equal(listContacts().length, 0);
  });
});

test('ft whoami prints the session identity as JSON', sequential, async () => {
  await withIsolatedHome(async (home) => {
    writeSession(home);

    const result = runCli(['whoami', '--json']);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).email, 'me@example.com');
  });
});

test('ft contacts add/find/remove work through the CLI', sequential, async () => {
  await withIsolatedHome(async () => {
    const added = runCli(['contacts', 'add', '--json', 'ada@example.com', 'Ada', 'Lovelace']);
    assert.equal(added.exitCode, 0);
    assert.equal(JSON.parse(added.stdout).email, 'ada@example.com');

    const found = runCli(['contacts', 'find', '--json', 'Ada Lovelace']);
    assert.equal(found.exitCode, 0);
    assert.equal(JSON.parse(found.stdout).email, 'ada@example.com');

    const removed = runCli(['contacts', 'remove', '--json', 'ada@example.com']);
    assert.equal(removed.exitCode, 0);
    assert.equal(JSON.parse(removed.stdout).removed, true);
  });
});

test('ft share writes markdown with Field Theory sender and email recipients', sequential, async () => {
  await withIsolatedHome(async (home) => {
    const dataHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-data-'));
    process.env.FT_DATA_DIR = dataHome;
    writeSession(home);

    try {
      const result = runCli([
        'share',
        '--to', 'friend@example.com',
        '--cc', 'copy@example.com',
        '--folder', 'Project Alpha',
        '--title', 'Launch Note',
        '--body', 'Body text',
        '--json',
      ]);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stderr, '');

      const payload = JSON.parse(result.stdout);
      assert.equal(payload.title, 'Launch Note');
      assert.equal(payload.from, 'me@example.com');
      assert.deepEqual(payload.to, ['friend@example.com']);
      assert.deepEqual(payload.cc, ['copy@example.com']);
      assert.ok(payload.path.startsWith(path.join(dataHome, 'md', 'shared', 'project-alpha')));

      const doc = fs.readFileSync(payload.path, 'utf-8');
      const parsed = parseFrontmatter(doc);
      assert.match(String(payload.id), /^[0-9A-HJKMNP-TV-Z]{26}$/);
      assert.equal(parsed.data.id, payload.id);
      assert.equal(parsed.data.title, 'Launch Note');
      assert.equal(parsed.data.from, 'me@example.com');
      assert.deepEqual(parsed.data.to, ['friend@example.com']);
      assert.deepEqual(parsed.data.cc, ['copy@example.com']);
      assert.equal(parsed.content, '# Launch Note\n\nBody text\n');
    } finally {
      fs.rmSync(dataHome, { recursive: true, force: true });
    }
  });
});

test('ft share emits RESOLVE_CONTACT for unknown name recipients', sequential, async () => {
  await withIsolatedHome(async (home) => {
    process.env.FT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-data-'));
    writeSession(home);

    try {
      const result = runCli(['share', '--to', 'Ada', '--body', 'Hello']);
      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^RESOLVE_CONTACT /);

      const payload = JSON.parse(result.stderr.replace(/^RESOLVE_CONTACT /, ''));
      assert.deepEqual(payload, { recipient: 'Ada', reason: 'not_found' });
    } finally {
      fs.rmSync(process.env.FT_DATA_DIR!, { recursive: true, force: true });
      delete process.env.FT_DATA_DIR;
    }
  });
});

test('ft share preserves an existing top markdown heading', sequential, async () => {
  await withIsolatedHome(async (home) => {
    const dataHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-data-'));
    process.env.FT_DATA_DIR = dataHome;
    writeSession(home);

    try {
      const result = runCli([
        'share',
        '--to', 'friend@example.com',
        '--body', '# Existing Title\n\nBody text',
        '--json',
      ]);
      assert.equal(result.exitCode, 0);

      const payload = JSON.parse(result.stdout);
      const doc = fs.readFileSync(payload.path, 'utf-8');
      const parsed = parseFrontmatter(doc);
      assert.equal(parsed.content, '# Existing Title\n\nBody text\n');
    } finally {
      fs.rmSync(dataHome, { recursive: true, force: true });
    }
  });
});
