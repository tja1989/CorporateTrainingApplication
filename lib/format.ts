/** Display formatting. Scheduling stays in lib/time.ts; this file only words values for people. */
import { DEFAULT_TZ, localDate } from "./time";

type DateOpts = { tz?: string; now?: Date; withYear?: boolean };
const DAY_MS = 86_400_000;
const pluralRules = new Intl.PluralRules("en");

function dayNumber(date: Date, tz: string): number {
  const [y, m, d] = localDate(date, tz).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

export function calendarDaysBetween(from: Date, to: Date, tz: string = DEFAULT_TZ): number {
  return dayNumber(to, tz) - dayNumber(from, tz);
}

function parts(date: Date, tz: string, withTime: boolean) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  });
  return Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
}

export function formatDay(date: Date, { tz = DEFAULT_TZ, now = new Date(), withYear = false }: DateOpts = {}): string {
  const p = parts(date, tz, false);
  const sameYear = !withYear && localDate(date, tz).slice(0, 4) === localDate(now, tz).slice(0, 4);
  return `${p.weekday} ${p.day} ${p.month}${sameYear ? "" : ` ${p.year}`}`;
}

export function formatDateTime(date: Date, opts: DateOpts = {}): string {
  const p = parts(date, opts.tz ?? DEFAULT_TZ, true);
  return `${formatDay(date, opts)}, ${p.hour}:${p.minute}`;
}

/** `done` training shows its due date plainly; finished work is never "overdue". */
export function formatDue(due: Date, { tz = DEFAULT_TZ, now = new Date(), done = false }: DateOpts & { done?: boolean } = {}): string {
  if (done) return `Due ${formatDay(due, { tz, now })}`;
  const days = calendarDaysBetween(now, due, tz);
  if (days < 0) return `Overdue by ${plural(-days, "day")}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due ${formatDay(due, { tz, now })}, in ${plural(days, "day")}`;
}

export function formatRelative(date: Date, { now = new Date(), tz = DEFAULT_TZ }: DateOpts = {}): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  const days = calendarDaysBetween(date, now, tz);
  if (days === 0) return `${Math.floor(seconds / 3600)} h ago`;
  if (days === 1) return "Yesterday";
  return formatDay(date, { tz, now });
}

export function noun(count: number, one: string, other: string = `${one}s`): string {
  return pluralRules.select(count) === "one" ? one : other;
}

export function plural(count: number, one: string, other?: string): string {
  return `${count} ${noun(count, one, other)}`;
}

const languages = new Intl.DisplayNames(["en"], { type: "language" });
export function languageName(code: string | null | undefined): string {
  const value = (code ?? "").trim();
  if (!value) return "Not set";
  try {
    const name = languages.of(value);
    return name && name.toLowerCase() !== value.toLowerCase() ? name : value.toUpperCase();
  } catch {
    return value.toUpperCase();
  }
}

export function tagLabel(tag: string): string {
  const words = tag.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function zoneLabel(tz: string = DEFAULT_TZ): string {
  return `${(tz.split("/").pop() ?? tz).replaceAll("_", " ")} time`;
}
