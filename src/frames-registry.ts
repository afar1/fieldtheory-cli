import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_FRAMES, DEFAULT_FRAMES_BY_ID, getFrame as getBuiltInFrame } from './adjacent/frames.js';
import type { Frame, FrameGroup } from './adjacent/types.js';
import { ideasMdDir, userFramesPath } from './paths.js';

interface UserFramesStore {
  frames: Frame[];
}

function ensureRegistryDir(): void {
  fs.mkdirSync(ideasMdDir(), { recursive: true, mode: 0o700 });
}

export function loadUserFrames(): Frame[] {
  try {
    const raw = fs.readFileSync(userFramesPath(), 'utf-8');
    const parsed = JSON.parse(raw) as UserFramesStore;
    if (!parsed || !Array.isArray(parsed.frames)) return [];
    return parsed.frames;
  } catch {
    return [];
  }
}

function saveUserFrames(frames: Frame[]): void {
  ensureRegistryDir();
  const store: UserFramesStore = { frames };
  fs.writeFileSync(userFramesPath(), JSON.stringify(store, null, 2), { mode: 0o600 });
}

/**
 * Resolve a frame id, checking built-ins first and falling back to the
 * user-defined registry. Returns undefined if the id is unknown.
 */
export function getFrame(id: string): Frame | undefined {
  const builtIn = getBuiltInFrame(id);
  if (builtIn) return builtIn;
  return loadUserFrames().find((f) => f.id === id);
}

/** List every frame available to the CLI — built-ins first, then user. */
export function listAllFrames(): Frame[] {
  return [...DEFAULT_FRAMES, ...loadUserFrames()];
}

// ── Validation ──────────────────────────────────────────────────────────────

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Frame field "${field}" must be a non-empty string.`);
  }
  return value.trim();
}

/**
 * Parse an unknown blob (usually from a user-supplied JSON file) into a Frame.
 * Throws a descriptive error if any required field is missing or invalid.
 */
export function parseFrame(raw: unknown): Frame {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Frame must be a JSON object.');
  }
  const obj = raw as Record<string, unknown>;

  const id = requireNonEmptyString(obj.id, 'id');
  if (!ID_PATTERN.test(id)) {
    throw new Error(`Frame id "${id}" must be lowercase kebab-case (start with a letter; letters, digits, and dashes only).`);
  }

  const name = requireNonEmptyString(obj.name, 'name');
  const groupRaw = requireNonEmptyString(obj.group, 'group');
  if (groupRaw !== 'building' && groupRaw !== 'risk') {
    throw new Error(`Frame "group" must be "building" or "risk" (got "${groupRaw}").`);
  }
  const group = groupRaw as FrameGroup;

  const generationPromptAddition = requireNonEmptyString(obj.generationPromptAddition, 'generationPromptAddition');

  const axisARaw = obj.axisA;
  if (!axisARaw || typeof axisARaw !== 'object') {
    throw new Error('Frame field "axisA" must be an object with label + rubricSentence.');
  }
  const axisA = {
    label: requireNonEmptyString((axisARaw as Record<string, unknown>).label, 'axisA.label'),
    rubricSentence: requireNonEmptyString((axisARaw as Record<string, unknown>).rubricSentence, 'axisA.rubricSentence'),
  };

  const axisBRaw = obj.axisB;
  if (!axisBRaw || typeof axisBRaw !== 'object') {
    throw new Error('Frame field "axisB" must be an object with label + rubricSentence.');
  }
  const axisB = {
    label: requireNonEmptyString((axisBRaw as Record<string, unknown>).label, 'axisB.label'),
    rubricSentence: requireNonEmptyString((axisBRaw as Record<string, unknown>).rubricSentence, 'axisB.rubricSentence'),
  };

  const quadrantRaw = obj.quadrantLabels;
  if (!quadrantRaw || typeof quadrantRaw !== 'object') {
    throw new Error('Frame field "quadrantLabels" must be an object with highHigh, highLow, lowHigh, and lowLow.');
  }
  const quadrantLabels = {
    highHigh: requireNonEmptyString((quadrantRaw as Record<string, unknown>).highHigh, 'quadrantLabels.highHigh'),
    highLow: requireNonEmptyString((quadrantRaw as Record<string, unknown>).highLow, 'quadrantLabels.highLow'),
    lowHigh: requireNonEmptyString((quadrantRaw as Record<string, unknown>).lowHigh, 'quadrantLabels.lowHigh'),
    lowLow: requireNonEmptyString((quadrantRaw as Record<string, unknown>).lowLow, 'quadrantLabels.lowLow'),
  };

  return {
    id,
    name,
    group,
    generationPromptAddition,
    axisA,
    axisB,
    quadrantLabels,
  };
}

// ── Mutations ───────────────────────────────────────────────────────────────

export interface AddUserFrameResult {
  frame: Frame;
  replacedExisting: boolean;
}

/**
 * Add or update a user frame. Rejects ids that collide with a built-in frame,
 * because built-ins are authoritative and cannot be shadowed. If the id already
 * exists in the user store, it is replaced in-place and `replacedExisting` is
 * true; otherwise the frame is appended.
 */
export function addUserFrame(frame: Frame): AddUserFrameResult {
  if (DEFAULT_FRAMES_BY_ID[frame.id]) {
    throw new Error(`Cannot overwrite built-in frame "${frame.id}". Pick a different id.`);
  }
  const frames = loadUserFrames();
  const idx = frames.findIndex((f) => f.id === frame.id);
  const replacedExisting = idx >= 0;
  if (replacedExisting) {
    frames[idx] = frame;
  } else {
    frames.push(frame);
  }
  saveUserFrames(frames);
  return { frame, replacedExisting };
}

export function removeUserFrame(id: string): boolean {
  if (DEFAULT_FRAMES_BY_ID[id]) {
    throw new Error(`Cannot remove built-in frame "${id}".`);
  }
  const frames = loadUserFrames();
  const before = frames.length;
  const next = frames.filter((f) => f.id !== id);
  if (next.length === before) return false;
  saveUserFrames(next);
  return true;
}

/**
 * Read a Frame from a JSON file on disk and add it to the user registry.
 * The file must contain a single frame object (not wrapped in `{ frames: [...] }`).
 */
export function addUserFrameFromFile(filePath: string): AddUserFrameResult {
  const resolved = path.resolve(filePath);
  let raw: unknown;
  try {
    const text = fs.readFileSync(resolved, 'utf-8');
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`Could not read frame file ${resolved}: ${(err as Error).message}`);
  }
  const frame = parseFrame(raw);
  return addUserFrame(frame);
}

/**
 * Validate an optional frame id from user input (CLI flag, API field, etc).
 * Returns the trimmed id when the frame exists, `undefined` when nothing was
 * provided, and throws a descriptive error listing the available ids when the
 * input is non-empty but unknown. Built-in and user-defined frames are both
 * accepted.
 */
export function validateOptionalFrameId(opt: unknown): string | undefined {
  if (opt === undefined || opt === null) return undefined;
  const id = String(opt).trim();
  if (!id) return undefined;
  if (!getFrame(id)) {
    const known = listAllFrames().map((f) => f.id).join(', ');
    throw new Error(`Unknown frame: "${id}". Available: ${known}.`);
  }
  return id;
}
