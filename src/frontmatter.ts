import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface MatterFile {
  data: Record<string, unknown>;
  content: string;
}

interface GrayMatter {
  (source: string): MatterFile;
  stringify(content: string, data: Record<string, unknown>): string;
}

const matter = require('gray-matter') as GrayMatter;

export interface ParsedFrontmatter<T extends Record<string, unknown> = Record<string, unknown>> {
  data: T;
  content: string;
}

export function parseFrontmatter<T extends Record<string, unknown> = Record<string, unknown>>(source: string): ParsedFrontmatter<T> {
  const parsed = matter(source);
  return {
    data: parsed.data as T,
    content: parsed.content,
  };
}

export function stringifyFrontmatter(data: Record<string, unknown>, content: string): string {
  const body = content.endsWith('\n') ? content : `${content}\n`;
  return `${matter.stringify(body, data).trimEnd()}\n`;
}
