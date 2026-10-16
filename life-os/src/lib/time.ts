/**
 * Time helpers pinned to America/Phoenix.
 *
 * Phoenix is UTC-7 all year (Arizona does not observe DST), so a fixed offset is exact.
 * Dates are stored in UTC; "local dates" are YYYY-MM-DD strings in Phoenix time.
 */

export const TIMEZONE = "America/Phoenix";
const OFFSET_MIN = -7 * 60;
const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;

export type LocalDate = string; // YYYY-MM-DD

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Shift a UTC instant so its UTC fields read as Phoenix wall-clock fields. */
function toWall(d: Date): Date {
  return new Date(d.getTime() + OFFSET_MIN * MS_PER_MIN);
}

export function localDateOf(d: Date): LocalDate {
  const w = toWall(d);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
}

export function today(now: Date = new Date()): LocalDate {
  return localDateOf(now);
}

export function parseLocalDate(s: LocalDate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) throw new Error(`Invalid local date: ${s}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** UTC instant of Phoenix midnight at the start of the local date. */
export function startOfLocalDay(s: LocalDate): Date {
  const { y, m, d } = parseLocalDate(s);
  return new Date(Date.UTC(y, m - 1, d) - OFFSET_MIN * MS_PER_MIN);
}

/** Exclusive end: Phoenix midnight of the following day. */
export function endOfLocalDay(s: LocalDate): Date {
  return new Date(startOfLocalDay(s).getTime() + MS_PER_DAY);
}

/** UTC instant for a Phoenix local date + minutes after midnight. */
export function atLocalMinutes(s: LocalDate, minutes: number): Date {
  return new Date(startOfLocalDay(s).getTime() + minutes * MS_PER_MIN);
}

/** Phoenix wall-clock minutes after midnight for an instant. */
export function localMinutes(d: Date): number {
  const w = toWall(d);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
}

export function addDays(s: LocalDate, n: number): LocalDate {
  return localDateOf(new Date(startOfLocalDay(s).getTime() + n * MS_PER_DAY + 12 * 3_600_000));
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(s: LocalDate): number {
  const { y, m, d } = parseLocalDate(s);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function isWeekend(s: LocalDate): boolean {
  return isoWeekday(s) >= 6;
}

/** Monday-start week containing the date: [monday, sunday]. */
export function weekRange(s: LocalDate): { start: LocalDate; end: LocalDate } {
  const start = addDays(s, 1 - isoWeekday(s));
  return { start, end: addDays(start, 6) };
}

export function monthRange(s: LocalDate): { start: LocalDate; end: LocalDate } {
  const { y, m } = parseLocalDate(s);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()) / MS_PER_DAY);
}

export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`;
}

export function formatTime(d: Date): string {
  return minutesToLabel(localMinutes(d));
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function formatLocalDate(s: LocalDate, opts: { weekday?: boolean } = {}): string {
  const { m, d } = parseLocalDate(s);
  const base = `${MONTHS[m - 1]} ${d}`;
  return opts.weekday ? `${WEEKDAYS[isoWeekday(s) - 1]}, ${base}` : base;
}

export function formatDateTime(d: Date): string {
  return `${formatLocalDate(localDateOf(d))}, ${formatTime(d)}`;
}

/** Relative day label used across the UI ("Today", "Tomorrow", "Yesterday", or date). */
export function relativeDayLabel(s: LocalDate, now: Date = new Date()): string {
  const diff = daysBetween(today(now), s);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatLocalDate(s, { weekday: Math.abs(diff) < 7 });
}

export function greeting(now: Date = new Date()): string {
  const min = localMinutes(now);
  if (min < 12 * 60) return "Good morning";
  if (min < 17 * 60) return "Good afternoon";
  return "Good evening";
}
