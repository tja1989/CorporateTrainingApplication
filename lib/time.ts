/** All scheduling in the store's timezone; default Asia/Dubai (spec FR-3.3). */

export const DEFAULT_TZ = "Asia/Dubai";

/** End of day (23:59:59 local) N days from now in the given timezone, as UTC Date. */
export function endOfDayInTz(daysFromNow: number, tz: string = DEFAULT_TZ, from: Date = new Date()): Date {
  const base = new Date(from.getTime() + daysFromNow * 24 * 3600_000);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, d] = fmt.format(base).split("-").map(Number);
  // 23:59:59 local == next-day 00:00 local minus 1s; compute local midnight offset
  const localMidnightUtc = zonedTimeToUtc(y, m, d + 1, 0, 0, tz);
  return new Date(localMidnightUtc.getTime() - 1000);
}

function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  // Interpret (y-m-d hh:mm) as wall time in tz. Two-pass offset estimation.
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = tzOffsetMs(new Date(utcGuess), tz);
  const refined = utcGuess - offset;
  const offset2 = tzOffsetMs(new Date(refined), tz);
  return new Date(utcGuess - offset2);
}

function tzOffsetMs(at: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

/** ISO date (YYYY-MM-DD) of the Monday of the ISO week containing `at`, in tz. */
export function isoWeekStart(at: Date = new Date(), tz: string = DEFAULT_TZ): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, d] = fmt.format(at).split("-").map(Number);
  const local = new Date(Date.UTC(y, m - 1, d));
  const dow = local.getUTCDay() === 0 ? 7 : local.getUTCDay(); // 1..7, Mon=1
  local.setUTCDate(local.getUTCDate() - (dow - 1));
  return local.toISOString().slice(0, 10);
}

/** Local calendar date string in tz. */
export function localDate(at: Date = new Date(), tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function daysUntil(dueAt: Date, from: Date = new Date()): number {
  return Math.ceil((dueAt.getTime() - from.getTime()) / (24 * 3600_000));
}
