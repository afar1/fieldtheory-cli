import type { Command } from 'commander';
import { addContact, contactsFilePath, findContact, listContacts, removeContact } from '../contacts.js';

function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n  Error: ${message}\n`);
  process.exitCode = 1;
}

export function registerContactsCommand(program: Command): void {
  const contacts = program
    .command('contacts')
    .description('Manage Field Theory contacts');

  contacts
    .command('list')
    .description('List contacts')
    .option('--json', 'JSON output')
    .action((options) => {
      try {
        const rows = listContacts();
        if (options.json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }
        for (const contact of rows) {
          console.log(contact.name ? `${contact.email}\t${contact.name}` : contact.email);
        }
      } catch (err) {
        printError(err);
      }
    });

  contacts
    .command('add')
    .description('Add or update a contact')
    .argument('<email>', 'Email address')
    .argument('[name...]', 'Display name')
    .option('--json', 'JSON output')
    .action((email: string, nameParts: string[], options) => {
      try {
        const contact = addContact(email, nameParts.join(' '));
        if (options.json) {
          console.log(JSON.stringify(contact, null, 2));
          return;
        }
        console.log(contact.name ? `${contact.email}\t${contact.name}` : contact.email);
      } catch (err) {
        printError(err);
      }
    });

  contacts
    .command('remove')
    .description('Remove a contact')
    .argument('<email>', 'Email address')
    .option('--json', 'JSON output')
    .action((email: string, options) => {
      try {
        const removed = removeContact(email);
        if (options.json) {
          console.log(JSON.stringify({ email, removed }, null, 2));
          return;
        }
        if (removed) console.log(`Removed ${email}`);
        else console.log(`No contact found for ${email}`);
      } catch (err) {
        printError(err);
      }
    });

  contacts
    .command('find')
    .description('Find a contact by email or exact name')
    .argument('<query>', 'Email address or exact display name')
    .option('--json', 'JSON output')
    .action((query: string, options) => {
      try {
        const contact = findContact(query);
        if (options.json) {
          console.log(JSON.stringify(contact, null, 2));
          if (!contact) process.exitCode = 1;
          return;
        }
        if (!contact) {
          console.log(`No contact found for ${query}`);
          process.exitCode = 1;
          return;
        }
        console.log(contact.name ? `${contact.email}\t${contact.name}` : contact.email);
      } catch (err) {
        printError(err);
      }
    });

  contacts
    .command('path')
    .description('Print contacts file path')
    .action(() => {
      console.log(contactsFilePath());
    });
}
