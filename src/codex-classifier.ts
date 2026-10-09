import type { ResolvedEngine } from './engine.js';
import { invokeEngineAsync } from './engine.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const startupOptions = ['--ignore-user-config', '--config', 'features.plugins=false', '--config', 'features.apps=false'];

export async function invokeClassifier(engine: ResolvedEngine, prompt: string): Promise<string> {
  if (engine.name !== 'codex') return invokeEngineAsync(engine, prompt);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-codex-'));
  const output = path.join(dir, 'last-message.txt');
  const configured: ResolvedEngine = {
    ...engine,
    config: {
      ...engine.config,
      args: (text, profile) => {
        const args = engine.config.args(text, profile);
        return [...args.slice(0, -1), ...startupOptions,
          '--output-last-message', output, args[args.length - 1]];
      },
    },
  };
  try {
    await invokeEngineAsync(configured, prompt);
    return fs.readFileSync(output, 'utf8').trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
