import type { Command } from 'commander';
import { buildFieldTheoryOpenTarget, inferOpenKind, openFieldTheoryTarget, type FieldTheoryOpenKind } from './app-open.js';
import { installFieldTheoryApp } from './app-install.js';
import {
  createCommandDocument,
  deleteCommandDocument,
  listCommandDocuments,
  renameCommandDocument,
  showCommandDocument,
  updateCommandDocument,
  validateCommandDocument,
} from './commands-files.js';
import { getPathReport, formatPathReport } from './field-status.js';
import {
  createLibraryDocument,
  deleteLibraryDocument,
  listLibraryDocuments,
  renameLibraryDocument,
  searchLibraryDocuments,
  showLibraryDocument,
  updateLibraryDocument,
} from './library.js';

type SafeAction = (fn: (...args: any[]) => Promise<void>) => (...args: any[]) => Promise<void>;

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function parseOpenKind(value: unknown): FieldTheoryOpenKind | undefined {
  if (value === undefined) return undefined;
  const kind = String(value);
  if (kind === 'library' || kind === 'command') return kind;
  throw new Error(`Unknown target kind: ${kind}`);
}

export function registerCompanionCommands(program: Command, safe: SafeAction): void {
  program
    .command('paths')
    .description('Show Field Theory data, library, commands, and compatibility paths')
    .option('--json', 'JSON output')
    .action((options) => {
      const report = getPathReport();
      if (options.json) {
        printJson(report);
        return;
      }
      console.log(formatPathReport(report));
    });

  const library = program
    .command('library')
    .description('Inspect and manage Field Theory Library markdown');

  library
    .command('list')
    .description('List Library markdown files')
    .option('--limit <n>', 'Max files', (v: string) => Number(v))
    .option('--json', 'JSON output')
    .action((options) => {
      const docs = listLibraryDocuments({
        limit: typeof options.limit === 'number' && !Number.isNaN(options.limit) ? options.limit : undefined,
      });
      if (options.json) {
        printJson(docs);
        return;
      }
      for (const doc of docs) console.log(`${doc.relPath}  ${doc.title}`);
    });

  library
    .command('search')
    .description('Search Library markdown files')
    .argument('<query>', 'Text to search for')
    .option('--limit <n>', 'Max results', (v: string) => Number(v), 20)
    .option('--json', 'JSON output')
    .action((query: string, options) => {
      const results = searchLibraryDocuments(query, { limit: Number(options.limit) || 20 });
      if (options.json) {
        printJson(results);
        return;
      }
      for (const result of results) {
        console.log(`${result.relPath}  ${result.title}`);
        console.log(`  ${result.snippet}`);
      }
    });

  library
    .command('show')
    .description('Show one Library markdown file')
    .argument('<path>', 'Relative or absolute markdown path')
    .option('--json', 'JSON output')
    .action(safe(async (targetPath: string, options) => {
      const doc = await showLibraryDocument(targetPath);
      if (options.json) {
        printJson(doc);
        return;
      }
      console.log(doc.content);
    }));

  library
    .command('create')
    .description('Create a Library markdown file')
    .argument('<path>', 'Relative markdown path under the Library')
    .option('--title <title>', 'Create a simple heading when no content input is passed')
    .option('--stdin', 'Read markdown content from stdin')
    .option('--file <path>', 'Read markdown content from a file')
    .option('--json', 'JSON output')
    .action(safe(async (targetPath: string, options) => {
      const doc = await createLibraryDocument(targetPath, {
        stdin: Boolean(options.stdin),
        file: options.file ? String(options.file) : undefined,
        title: options.title ? String(options.title) : undefined,
      });
      if (options.json) {
        printJson(doc);
        return;
      }
      console.log(`Created: ${doc.path}`);
    }));

  library
    .command('update')
    .description('Replace a Library markdown file with stdin or file content')
    .argument('<path>', 'Relative or absolute markdown path')
    .option('--stdin', 'Read markdown content from stdin')
    .option('--file <path>', 'Read markdown content from a file')
    .option('--expected-sha256 <hash>', 'Only update if the current file hash matches')
    .option('--force', 'Overwrite without an expected hash')
    .option('--json', 'JSON output')
    .action(safe(async (targetPath: string, options) => {
      if (!options.stdin && !options.file) throw new Error('Pass --stdin or --file for update content.');
      const doc = await updateLibraryDocument(targetPath, {
        stdin: Boolean(options.stdin),
        file: options.file ? String(options.file) : undefined,
        expectedSha256: options.expectedSha256 ? String(options.expectedSha256) : undefined,
        force: Boolean(options.force),
      });
      if (options.json) {
        printJson(doc);
        return;
      }
      console.log(`Updated: ${doc.path}`);
      console.log(`sha256: ${doc.version.sha256}`);
    }));

  library
    .command('rename')
    .description('Rename a Library markdown file')
    .argument('<path>', 'Current relative or absolute markdown path')
    .argument('<new-path>', 'New relative markdown path under the Library')
    .option('--json', 'JSON output')
    .action(safe(async (targetPath: string, newPath: string, options) => {
      const doc = await renameLibraryDocument(targetPath, newPath);
      if (options.json) {
        printJson(doc);
        return;
      }
      console.log(`Renamed: ${doc.path}`);
    }));

  library
    .command('delete')
    .description('Move a Library markdown file to Trash')
    .argument('<path>', 'Relative or absolute markdown path')
    .option('--json', 'JSON output')
    .action(safe(async (targetPath: string, options) => {
      const result = deleteLibraryDocument(targetPath);
      if (options.json) {
        printJson(result);
        return;
      }
      console.log(`Moved to Trash: ${result.trashPath}`);
    }));

  library
    .command('open')
    .description('Open a Library markdown file in Field Theory')
    .argument('<path>', 'Relative or absolute markdown path')
    .option('--no-launch', 'Print target without launching the app')
    .option('--json', 'JSON output')
    .action(safe(async (targetPath: string, options) => {
      const target = buildFieldTheoryOpenTarget(targetPath, 'library');
      const launch = options.launch !== false ? openFieldTheoryTarget(target) : undefined;
      if (options.json) {
        printJson(launch ? { ...target, launch } : target);
        return;
      }
      console.log(target.url ?? target.path);
    }));

  const portableCommands = program
    .command('commands')
    .description('Inspect and manage Field Theory portable commands');

  portableCommands
    .command('list')
    .description('List portable command files')
    .option('--json', 'JSON output')
    .action((options) => {
      const docs = listCommandDocuments();
      if (options.json) {
        printJson(docs);
        return;
      }
      for (const doc of docs) console.log(`${doc.name}  ${doc.relPath}`);
    });

  portableCommands
    .command('show')
    .description('Show one portable command')
    .argument('<name>', 'Command name or markdown path')
    .option('--json', 'JSON output')
    .action(safe(async (name: string, options) => {
      const doc = await showCommandDocument(name);
      if (options.json) {
        printJson(doc);
        return;
      }
      console.log(doc.content);
    }));

  portableCommands
    .command('new')
    .description('Create a portable command file')
    .argument('<name>', 'Short command name')
    .option('--stdin', 'Read command content from stdin')
    .option('--file <path>', 'Read command content from a file')
    .option('--json', 'JSON output')
    .action(safe(async (name: string, options) => {
      const doc = await createCommandDocument(name, {
        stdin: Boolean(options.stdin),
        file: options.file ? String(options.file) : undefined,
      });
      if (options.json) {
        printJson(doc);
        return;
      }
      console.log(`Created: ${doc.path}`);
    }));

  portableCommands
    .command('update')
    .description('Replace a portable command with stdin or file content')
    .argument('<name>', 'Command name or markdown path')
    .option('--stdin', 'Read command content from stdin')
    .option('--file <path>', 'Read command content from a file')
    .option('--expected-sha256 <hash>', 'Only update if the current file hash matches')
    .option('--force', 'Overwrite without an expected hash')
    .option('--json', 'JSON output')
    .action(safe(async (name: string, options) => {
      if (!options.stdin && !options.file) throw new Error('Pass --stdin or --file for update content.');
      const doc = await updateCommandDocument(name, {
        stdin: Boolean(options.stdin),
        file: options.file ? String(options.file) : undefined,
        expectedSha256: options.expectedSha256 ? String(options.expectedSha256) : undefined,
        force: Boolean(options.force),
      });
      if (options.json) {
        printJson(doc);
        return;
      }
      console.log(`Updated: ${doc.path}`);
      console.log(`sha256: ${doc.version.sha256}`);
    }));

  portableCommands
    .command('rename')
    .description('Rename a portable command file')
    .argument('<name>', 'Current command name or markdown path')
    .argument('<new-name>', 'New command name')
    .option('--json', 'JSON output')
    .action(safe(async (name: string, newName: string, options) => {
      const doc = await renameCommandDocument(name, newName);
      if (options.json) {
        printJson(doc);
        return;
      }
      console.log(`Renamed: ${doc.path}`);
    }));

  portableCommands
    .command('delete')
    .description('Move a portable command file to Trash')
    .argument('<name>', 'Command name or markdown path')
    .option('--json', 'JSON output')
    .action(safe(async (name: string, options) => {
      const result = deleteCommandDocument(name);
      if (options.json) {
        printJson(result);
        return;
      }
      console.log(`Moved to Trash: ${result.trashPath}`);
    }));

  portableCommands
    .command('validate')
    .description('Validate one command or all command files')
    .argument('[name]', 'Optional command name or markdown path')
    .option('--json', 'JSON output')
    .action(safe(async (name: string | undefined, options) => {
      const results = validateCommandDocument(name);
      if (options.json) {
        printJson(results);
      } else {
        for (const result of results) {
          console.log(`${result.ok ? 'ok' : 'issues'}  ${result.relPath}`);
          for (const issue of result.issues) console.log(`  - ${issue}`);
        }
      }
      if (results.some((result) => !result.ok)) process.exitCode = 1;
    }));

  portableCommands
    .command('open')
    .description('Print a portable command file path for Field Theory')
    .argument('<name>', 'Command name or markdown path')
    .option('--no-launch', 'Accepted for parity with library open')
    .option('--json', 'JSON output')
    .action(safe(async (name: string, options) => {
      const doc = await showCommandDocument(name);
      const target = buildFieldTheoryOpenTarget(doc.path, 'command');
      if (options.json) {
        printJson(target);
        return;
      }
      console.log(target.note ?? target.path);
      console.log(target.path);
    }));

  const appCommand = program
    .command('app')
    .description('Open Field Theory app targets');

  appCommand
    .command('open')
    .description('Open or print a Field Theory app target')
    .argument('<path>', 'Markdown path')
    .option('--kind <kind>', 'Target kind: library or command')
    .option('--no-launch', 'Print target without launching the app')
    .option('--json', 'JSON output')
    .action(safe(async (targetPath: string, options) => {
      const kind = parseOpenKind(options.kind) ?? inferOpenKind(targetPath) ?? undefined;
      const target = buildFieldTheoryOpenTarget(targetPath, kind);
      const launch = options.launch !== false ? openFieldTheoryTarget(target) : undefined;
      if (options.json) {
        printJson(launch ? { ...target, launch } : target);
        return;
      }
      if (target.url) console.log(target.url);
      else {
        console.log(target.note ?? 'No app deep link available for this target.');
        console.log(target.path);
      }
    }));

  const install = program
    .command('install')
    .description('Install Field Theory components');

  install
    .command('app')
    .description('Download and install the latest Field Theory Mac app')
    .option('--install-dir <path>', 'Directory to install the app into', '/Applications')
    .option('--open', 'Open Field Theory after installing')
    .option('--json', 'JSON output')
    .action(safe(async (options) => {
      const result = await installFieldTheoryApp({
        installDir: String(options.installDir),
        open: Boolean(options.open),
        onProgress: options.json ? undefined : (message) => console.log(message),
      });
      if (options.json) {
        printJson(result);
        return;
      }
      console.log(`Installed Field Theory ${result.release}: ${result.appPath}`);
    }));
}
