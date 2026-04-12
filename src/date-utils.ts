const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function parseTimestampMs(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toIsoDate(value?: string | null): string | null {
  const ms = parseTimestampMs(value);
  if (ms == null) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function toIsoMonth(value?: string | null): string | null {
  const ms = parseTimestampMs(value);
  if (ms == null) return null;
  return new Date(ms).toISOString().slice(0, 7);
}

export function toWeekdayShort(value?: string | null): string | null {
  const ms = parseTimestampMs(value);
  if (ms == null) return null;
  return WEEKDAYS[new Date(ms).getUTCDay()] ?? null;
}

export function toUtcHour(value?: string | null): number | null {
  const ms = parseTimestampMs(value);
  if (ms == null) return null;
  return new Date(ms).getUTCHours();
}

export function toYearLabel(value?: string | null): string {
  const ms = parseTimestampMs(value);
  if (ms == null) return value?.slice(-4) ?? '????';
  return new Date(ms).toISOString().slice(0, 4);
}

export function toMonthDayLabel(value?: string | null): string {
  const ms = parseTimestampMs(value);
  if (ms == null) return value?.slice(4, 10) ?? ' ?? ??';
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
}
