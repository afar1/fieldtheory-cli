// Bookmark text and author fields are untrusted terminal output.
export function sanitizeForDisplay(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, '?');
}
