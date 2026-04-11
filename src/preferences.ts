import fs from 'node:fs';
import { ensureDataDir, preferencesPath } from './paths.js';

export interface Preferences {
  defaultEngine?: string;
}

export function loadPreferences(): Preferences {
  try {
    return JSON.parse(fs.readFileSync(preferencesPath(), 'utf-8'));
  } catch {
    return {};
  }
}

export function savePreferences(prefs: Preferences): void {
  ensureDataDir();
  const filePath = preferencesPath();
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(prefs, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}
