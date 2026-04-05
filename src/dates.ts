export function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export function coalesceTimestamps(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeTimestamp(value);
    if (normalized) return normalized;
  }
  return null;
}
