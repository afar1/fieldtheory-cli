export interface StatusLine {
  label: string;
  value: string;
}

export interface StatusSection {
  title?: string;
  lines: StatusLine[];
}

function formatStatusLine(label: string, value: string): string {
  return `  ${label.padEnd(14)} ${value}`;
}

export function renderStatusSections(sections: StatusSection[]): string {
  const chunks: string[] = [];

  for (const section of sections) {
    if (section.title) chunks.push(section.title);
    for (const line of section.lines) {
      chunks.push(formatStatusLine(line.label, line.value));
    }
  }

  return `\n${chunks.join('\n')}`;
}
