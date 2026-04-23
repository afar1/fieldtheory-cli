import fs from 'node:fs';
import { contactsPath, fieldTheoryDir } from './paths.js';
import { normalizeEmail } from './fieldtheory-session.js';

export interface Contact {
  email: string;
  name?: string;
  created_at: string;
  updated_at: string;
}

type ContactsStore = Record<string, Contact>;

function normalizeName(name?: string): string | undefined {
  const trimmed = name?.trim();
  return trimmed ? trimmed : undefined;
}

function readStore(): ContactsStore {
  try {
    const parsed = JSON.parse(fs.readFileSync(contactsPath(), 'utf-8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as ContactsStore;
  } catch {
    return {};
  }
}

function writeStore(store: ContactsStore): void {
  fs.mkdirSync(fieldTheoryDir(), { recursive: true, mode: 0o700 });
  const filePath = contactsPath();
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

export function listContacts(): Contact[] {
  return Object.values(readStore()).sort((a, b) => a.email.localeCompare(b.email));
}

export function addContact(email: string, name?: string): Contact {
  const normalizedEmail = normalizeEmail(email);
  const store = readStore();
  const now = new Date().toISOString();
  const existing = store[normalizedEmail];
  const normalizedName = normalizeName(name);
  const contact: Contact = {
    email: normalizedEmail,
    ...(normalizedName ? { name: normalizedName } : {}),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  store[normalizedEmail] = contact;
  writeStore(store);
  return contact;
}

export function removeContact(email: string): boolean {
  const normalizedEmail = normalizeEmail(email);
  const store = readStore();
  if (!store[normalizedEmail]) return false;
  delete store[normalizedEmail];
  writeStore(store);
  return true;
}

export function findContact(query: string): Contact | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  if (trimmed.includes('@')) {
    try {
      return readStore()[normalizeEmail(trimmed)] ?? null;
    } catch {
      return null;
    }
  }

  const lower = trimmed.toLowerCase();
  const matches = listContacts().filter((contact) => contact.name?.toLowerCase() === lower);
  return matches.length === 1 ? matches[0] : null;
}

export function contactsFilePath(): string {
  return contactsPath();
}
