import type { Command } from 'commander';
import { SessionError, requireFieldTheorySession } from '../fieldtheory-session.js';

function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n  Error: ${message}\n`);
  process.exitCode = 1;
}

export function registerWhoamiCommand(program: Command): void {
  program
    .command('whoami')
    .description('Show the current Field Theory email identity')
    .option('--json', 'JSON output')
    .action((options) => {
      try {
        const session = requireFieldTheorySession();
        if (options.json) {
          console.log(JSON.stringify(session, null, 2));
          return;
        }

        const label = session.display_name ? `${session.display_name} <${session.email}>` : session.email;
        console.log(label);
      } catch (err) {
        if (err instanceof SessionError) {
          printError(err);
          return;
        }
        throw err;
      }
    });
}
