import { isoWeekStart, localDate, zonedTimeToUtc } from "@/lib/time";
import { formatDay } from "@/lib/format";
export type FeedbackPeriod = { start: Date; end: Date; label: string };
function day(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Choose valid start and through dates.");
  const date = new Date(value + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new Error("Choose valid start and through dates.");
  return date;
}
function midnight(date: Date, tz: string) {
  return zonedTimeToUtc(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    0,
    0,
    tz,
  );
}
export function feedbackPeriod(
  kind: "week" | "month" | "custom",
  now: Date,
  tz: string,
  custom?: { start: string; end: string },
): FeedbackPeriod {
  new Intl.DateTimeFormat("en", { timeZone: tz }).format(now);
  let start: Date, end: Date, label: string;
  if (kind === "custom") {
    if (!custom)
      throw new Error("Choose start and through dates for a custom period.");
    start = day(custom.start);
    const through = day(custom.end);
    if (
      through < start ||
      (through.getTime() - start.getTime()) / 86400000 >= 366
    )
      throw new Error(
        "Choose a period of 1 to 366 days, with the start before the through date.",
      );
    end = new Date(through.getTime() + 86400000);
    // Calendar dates here are UTC-midnight markers, so word them in UTC.
    label = `${formatDay(start, { tz: "UTC", withYear: true })} to ${formatDay(through, { tz: "UTC", withYear: true })}`;
  } else if (kind === "week") {
    start = day(isoWeekStart(now, tz));
    end = new Date(start.getTime() + 7 * 86400000);
    label = `Week of ${formatDay(start, { tz: "UTC", withYear: true })}`;
  } else if (kind === "month") {
    const local = day(localDate(now, tz));
    start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1));
    end = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1),
    );
    label = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      month: "long",
      year: "numeric",
    }).format(now);
  } else throw new Error("Choose week, month or custom period.");
  return {
    start: midnight(start, tz),
    end: midnight(end, tz),
    label,
  };
}
