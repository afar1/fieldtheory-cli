import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { promptWithInterface } from '../src/prompt.js';

class FakePrompt extends EventEmitter {
  private callback: ((answer: string) => void) | null = null;
  closed = false;
  prompt = '';

  question(query: string, callback: (answer: string) => void): void {
    this.prompt = query;
    this.callback = callback;
  }

  answer(value: string): void {
    this.callback?.(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
}

test('promptWithInterface: resolves trimmed answer and closes interface', async () => {
  const prompt = new FakePrompt();
  const pending = promptWithInterface(prompt, 'Pick one: ');

  prompt.answer('  codex  ');
  const result = await pending;

  assert.deepEqual(result, { kind: 'answer', value: 'codex' });
  assert.equal(prompt.prompt, 'Pick one: ');
  assert.equal(prompt.closed, true);
});

test('promptWithInterface: resolves close when prompt closes without answer', async () => {
  const prompt = new FakePrompt();
  const pending = promptWithInterface(prompt, 'Pick one: ');

  prompt.close();
  const result = await pending;

  assert.deepEqual(result, { kind: 'close' });
});

test('promptWithInterface: resolves interrupt on SIGINT and closes interface', async () => {
  const prompt = new FakePrompt();
  const pending = promptWithInterface(prompt, 'Pick one: ');

  prompt.emit('SIGINT');
  const result = await pending;

  assert.deepEqual(result, { kind: 'interrupt' });
  assert.equal(prompt.closed, true);
});
