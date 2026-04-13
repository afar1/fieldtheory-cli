import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function withFramesStore(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ft-frames-test-'));
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

async function getRegistry() {
  return import('../src/frames-registry.js');
}

function validFrameJson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'focus-moat',
    name: 'Focus × Moat',
    group: 'building',
    generationPromptAddition: 'Consider which ideas sharpen the product focus vs. which build a moat.',
    axisA: { label: 'Focus', rubricSentence: '0 sprawl, 100 laser.' },
    axisB: { label: 'Moat', rubricSentence: '0 commodity, 100 defensible.' },
    quadrantLabels: {
      highHigh: 'Killer app',
      highLow: 'Feature factory',
      lowHigh: 'Platform bet',
      lowLow: 'Me-too',
    },
    ...overrides,
  };
}

test('loadUserFrames: returns empty list when registry file does not exist', async () => {
  await withFramesStore(async () => {
    const reg = await getRegistry();
    assert.deepEqual(reg.loadUserFrames(), []);
  });
});

test('parseFrame: accepts a fully specified frame and preserves its shape', async () => {
  const reg = await getRegistry();
  const frame = reg.parseFrame(validFrameJson());
  assert.equal(frame.id, 'focus-moat');
  assert.equal(frame.group, 'building');
  assert.equal(frame.axisA.label, 'Focus');
  assert.equal(frame.quadrantLabels.highHigh, 'Killer app');
});

test('parseFrame: rejects ids that are not lowercase kebab-case', async () => {
  const reg = await getRegistry();
  assert.throws(() => reg.parseFrame(validFrameJson({ id: 'Focus_Moat' })), /kebab-case/);
  assert.throws(() => reg.parseFrame(validFrameJson({ id: '1-focus' })), /kebab-case/);
  assert.throws(() => reg.parseFrame(validFrameJson({ id: '' })), /non-empty/);
});

test('parseFrame: rejects non-"building"/"risk" group values', async () => {
  const reg = await getRegistry();
  assert.throws(() => reg.parseFrame(validFrameJson({ group: 'strategic' })), /building.*risk/);
});

test('parseFrame: rejects missing axis or quadrant fields', async () => {
  const reg = await getRegistry();
  assert.throws(
    () => reg.parseFrame(validFrameJson({ axisA: { label: 'Focus' } })),
    /axisA\.rubricSentence/,
  );
  assert.throws(
    () => reg.parseFrame(validFrameJson({ quadrantLabels: { highHigh: 'x', highLow: 'y', lowHigh: 'z' } })),
    /quadrantLabels\.lowLow/,
  );
});

test('addUserFrame: persists a new frame and reports replacedExisting=false', async () => {
  await withFramesStore(async () => {
    const reg = await getRegistry();
    const result = reg.addUserFrame(reg.parseFrame(validFrameJson()));
    assert.equal(result.replacedExisting, false);
    assert.equal(result.frame.id, 'focus-moat');

    const loaded = reg.loadUserFrames();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0]!.name, 'Focus × Moat');
  });
});

test('addUserFrame: replaces an existing frame in-place on id collision', async () => {
  await withFramesStore(async () => {
    const reg = await getRegistry();
    reg.addUserFrame(reg.parseFrame(validFrameJson()));
    const second = reg.addUserFrame(reg.parseFrame(validFrameJson({ name: 'Focus × Moat v2' })));
    assert.equal(second.replacedExisting, true);

    const loaded = reg.loadUserFrames();
    assert.equal(loaded.length, 1, 'should still be one frame, not two');
    assert.equal(loaded[0]!.name, 'Focus × Moat v2');
  });
});

test('addUserFrame: refuses to shadow a built-in frame id', async () => {
  await withFramesStore(async () => {
    const reg = await getRegistry();
    assert.throws(
      () => reg.addUserFrame(reg.parseFrame(validFrameJson({ id: 'leverage-specificity' }))),
      /built-in/,
    );
  });
});

test('getFrame: built-in wins over a user frame with the same id (defense-in-depth)', async () => {
  // addUserFrame refuses shadowing, but getFrame should also behave correctly
  // if the registry file is hand-edited to include a built-in id.
  await withFramesStore(async (dir) => {
    const framesPath = path.join(dir, 'automation', 'ideas', 'frames.json');
    const framesDir = path.dirname(framesPath);
    await (await import('node:fs/promises')).mkdir(framesDir, { recursive: true });
    await writeFile(
      framesPath,
      JSON.stringify({
        frames: [validFrameJson({ id: 'leverage-specificity', name: 'Hijacked' })],
      }),
      'utf-8',
    );

    const reg = await getRegistry();
    const frame = reg.getFrame('leverage-specificity');
    assert.ok(frame);
    assert.notEqual(frame!.name, 'Hijacked');
  });
});

test('getFrame: resolves a user frame when the id is not a built-in', async () => {
  await withFramesStore(async () => {
    const reg = await getRegistry();
    reg.addUserFrame(reg.parseFrame(validFrameJson()));
    const frame = reg.getFrame('focus-moat');
    assert.ok(frame);
    assert.equal(frame!.name, 'Focus × Moat');
  });
});

test('listAllFrames: built-ins come first, user frames follow', async () => {
  await withFramesStore(async () => {
    const reg = await getRegistry();
    reg.addUserFrame(reg.parseFrame(validFrameJson()));
    reg.addUserFrame(reg.parseFrame(validFrameJson({ id: 'another', name: 'Another' })));
    const all = reg.listAllFrames();
    const userStart = all.findIndex((f) => f.id === 'focus-moat');
    const userEnd = all.findIndex((f) => f.id === 'another');
    assert.ok(userStart > 0, 'user frames should not be first');
    assert.ok(userEnd > userStart, 'user frames should be in insertion order');
    assert.equal(all[0]!.id, 'novelty-feasibility', 'built-ins come first and preserve their order');
  });
});

test('removeUserFrame: removes a user frame and returns true', async () => {
  await withFramesStore(async () => {
    const reg = await getRegistry();
    reg.addUserFrame(reg.parseFrame(validFrameJson()));
    const removed = reg.removeUserFrame('focus-moat');
    assert.equal(removed, true);
    assert.deepEqual(reg.loadUserFrames(), []);
  });
});

test('removeUserFrame: returns false for unknown ids, throws for built-ins', async () => {
  await withFramesStore(async () => {
    const reg = await getRegistry();
    assert.equal(reg.removeUserFrame('nonexistent'), false);
    assert.throws(() => reg.removeUserFrame('leverage-specificity'), /built-in/);
  });
});

test('addUserFrameFromFile: round-trips a valid JSON file into the store', async () => {
  await withFramesStore(async (dir) => {
    const filePath = path.join(dir, 'focus-moat.json');
    await writeFile(filePath, JSON.stringify(validFrameJson()), 'utf-8');

    const reg = await getRegistry();
    const result = reg.addUserFrameFromFile(filePath);
    assert.equal(result.frame.id, 'focus-moat');
    assert.equal(reg.loadUserFrames().length, 1);
  });
});

test('addUserFrameFromFile: surfaces parse errors with a helpful message', async () => {
  await withFramesStore(async (dir) => {
    const filePath = path.join(dir, 'broken.json');
    await writeFile(filePath, '{ this is not json', 'utf-8');

    const reg = await getRegistry();
    assert.throws(() => reg.addUserFrameFromFile(filePath), /Could not read frame file/);
  });
});

test('validateOptionalFrameId: returns undefined for absent or empty input', async () => {
  const reg = await getRegistry();
  assert.equal(reg.validateOptionalFrameId(undefined), undefined);
  assert.equal(reg.validateOptionalFrameId(null), undefined);
  assert.equal(reg.validateOptionalFrameId(''), undefined);
  assert.equal(reg.validateOptionalFrameId('   '), undefined);
});

test('validateOptionalFrameId: accepts a built-in frame id and returns it trimmed', async () => {
  const reg = await getRegistry();
  assert.equal(reg.validateOptionalFrameId('impact-effort'), 'impact-effort');
  assert.equal(reg.validateOptionalFrameId('  impact-effort  '), 'impact-effort');
});

test('validateOptionalFrameId: accepts a user frame id registered in the store', async () => {
  await withFramesStore(async () => {
    const reg = await getRegistry();
    reg.addUserFrame(reg.parseFrame(validFrameJson()));
    assert.equal(reg.validateOptionalFrameId('focus-moat'), 'focus-moat');
  });
});

test('validateOptionalFrameId: throws a helpful error listing available frames on an unknown id', async () => {
  await withFramesStore(async () => {
    const reg = await getRegistry();
    try {
      reg.validateOptionalFrameId('bogus-frame');
      assert.fail('should have thrown');
    } catch (err) {
      const msg = (err as Error).message;
      assert.match(msg, /Unknown frame/);
      assert.match(msg, /bogus-frame/);
      assert.match(msg, /Available:/);
      // Every built-in id should be listed.
      assert.match(msg, /leverage-specificity/);
      assert.match(msg, /novelty-feasibility/);
    }
  });
});
