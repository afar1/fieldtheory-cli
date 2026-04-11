export type PromptResult =
  | { kind: 'answer'; value: string }
  | { kind: 'close' }
  | { kind: 'interrupt' };

export class PromptCancelledError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = 'PromptCancelledError';
  }
}

export interface PromptInterface {
  question(query: string, callback: (answer: string) => void): void;
  close(): void;
  once(event: 'close' | 'SIGINT', listener: () => void): this;
  removeListener(event: 'close' | 'SIGINT', listener: () => void): this;
}

export interface PromptOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

export function promptWithInterface(rl: PromptInterface, question: string): Promise<PromptResult> {
  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      rl.removeListener('close', onClose);
      rl.removeListener('SIGINT', onSigint);
    };

    const settle = (result: PromptResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onClose = () => {
      settle({ kind: 'close' });
    };

    const onSigint = () => {
      settle({ kind: 'interrupt' });
      rl.close();
    };

    rl.once('close', onClose);
    rl.once('SIGINT', onSigint);
    rl.question(question, (answer) => {
      settle({ kind: 'answer', value: answer.trim() });
      rl.close();
    });
  });
}

export async function promptText(question: string, options: PromptOptions = {}): Promise<PromptResult> {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({
    input: options.input ?? process.stdin,
    output: options.output ?? process.stderr,
  });
  return promptWithInterface(rl, question);
}
