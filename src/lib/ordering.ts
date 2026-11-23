// Takeaway ordering rules shared by the website (at build time, in the browser) and the
// Worker that accepts orders (worker/index.ts), so both agree on when orders close.

export const TIME_ZONE = 'Europe/London';

/** Orders close at this London time on the day before the takeaway (unless a custom deadline is set). */
export const DEFAULT_CUTOFF = { daysBefore: 1, hour: 18, minute: 0 };

export type Method = 'collection' | 'delivery';

export interface OrderOption {
  key: string;
  type: string;
  price: number;
  description: string;
  method: Method;
  url?: string;
}

/** Offset of London time from UTC, in minutes, at a given instant (0 in winter, 60 in summer). */
function londonOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(at);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** The instant a London wall-clock time happens, e.g. 18:00 on 2026-11-26. */
export function londonTime(date: string, hour: number, minute: number, addDays = 0): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d + addDays, hour, minute);
  const first = guess - londonOffsetMinutes(new Date(guess)) * 60000;
  // Re-check near clock changes.
  return new Date(guess - londonOffsetMinutes(new Date(first)) * 60000);
}

/** YYYY-MM-DD for an instant, in London. */
export function londonDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** The first Friday on or after an instant (used when only the old deadline field is filled in). */
function fridayOnOrAfter(at: Date): string {
  const day = londonDate(at);
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + ((5 - dt.getUTCDay() + 7) % 7));
  return dt.toISOString().slice(0, 10);
}

export interface Schedule {
  /** The takeaway Friday, YYYY-MM-DD. Empty if not set. */
  takeawayDate: string;
  /** When orders close, ISO string. Empty if unknown (orders closed). */
  cutoff: string;
}

/**
 * Works out the takeaway date and order deadline from what staff entered in Sanity:
 * the takeaway date, plus an optional custom deadline that overrides the usual rule.
 */
export function schedule(takeawayDate?: string | null, customDeadline?: string | null): Schedule {
  if (takeawayDate) {
    const cutoff = customDeadline
      ? new Date(customDeadline)
      : londonTime(takeawayDate, DEFAULT_CUTOFF.hour, DEFAULT_CUTOFF.minute, -DEFAULT_CUTOFF.daysBefore);
    return { takeawayDate, cutoff: cutoff.toISOString() };
  }
  if (customDeadline) return { takeawayDate: fridayOnOrAfter(new Date(customDeadline)), cutoff: new Date(customDeadline).toISOString() };
  return { takeawayDate: '', cutoff: '' };
}

export const isOpen = (s: Schedule, now = new Date()) => Boolean(s.cutoff) && now.getTime() < new Date(s.cutoff).getTime();

/** Collection or delivery: set in Sanity, or guessed from the option's name. */
export const methodOf = (o: { method?: string | null; type?: string | null }): Method =>
  o.method === 'delivery' || o.method === 'collection' ? o.method : /deliver/i.test(o.type ?? '') ? 'delivery' : 'collection';

/** Friendly London date/time strings for emails and the page. */
export const formatDay = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
export const formatDeadline = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true }).replace(' at', ',');

export const money = (n: number) => `£${n.toFixed(2)}`;
