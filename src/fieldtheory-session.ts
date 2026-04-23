import fs from 'node:fs';
import { sessionPath } from './paths.js';

export interface FieldTheorySession {
  user_id: string;
  email: string;
  display_name?: string;
  expires_at: string;
}

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function expiresAtValue(record: Record<string, unknown>): string | undefined {
  const value = record.expires_at;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  return undefined;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!isEmail(email)) throw new Error(`Invalid email: ${value}`);
  return email;
}

export function parseFieldTheorySession(value: unknown): FieldTheorySession {
  if (!isRecord(value)) throw new SessionError('Invalid Field Theory session file.');

  const userId = stringValue(value, 'user_id');
  const email = stringValue(value, 'email');
  const displayName = stringValue(value, 'display_name');
  const expiresAt = expiresAtValue(value);

  if (!userId) throw new SessionError('Field Theory session is missing user_id.');
  if (!email) throw new SessionError('Field Theory session is missing email.');
  if (!expiresAt) throw new SessionError('Field Theory session is missing expires_at.');

  let normalizedEmail: string;
  try {
    normalizedEmail = normalizeEmail(email);
  } catch {
    throw new SessionError('Field Theory session has invalid email.');
  }
  if (Number.isNaN(Date.parse(expiresAt))) {
    throw new SessionError('Field Theory session has invalid expires_at.');
  }

  return {
    user_id: userId,
    email: normalizedEmail,
    ...(displayName ? { display_name: displayName } : {}),
    expires_at: expiresAt,
  };
}

export function readFieldTheorySession(): FieldTheorySession | null {
  try {
    return parseFieldTheorySession(JSON.parse(fs.readFileSync(sessionPath(), 'utf-8')));
  } catch (err) {
    if (err instanceof SessionError) throw err;
    return null;
  }
}

export function requireFieldTheorySession(nowMs = Date.now()): FieldTheorySession {
  const session = readFieldTheorySession();
  if (!session) {
    throw new SessionError(`No Field Theory session found at ${sessionPath()}.`);
  }

  if (Date.parse(session.expires_at) <= nowMs) {
    throw new SessionError('Field Theory session has expired.');
  }

  return session;
}
