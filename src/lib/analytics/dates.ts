import type { IsoDate, IsoDateTime } from "@/lib/domain/types";

const MS_PER_DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function make(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = make(timeZone);
    } catch {
      // An unknown zone name in the profile must not break every report.
      f = make("UTC");
    }
    formatters.set(timeZone, f);
  }
  return f;
}

/** Calendar date of an instant in the athlete's timezone (a 9pm workout is still "today"). */
export function localDate(iso: IsoDateTime, timeZone: string): IsoDate {
  const parts = formatterFor(timeZone).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const dayMs = (d: IsoDate) => Date.parse(`${d}T00:00:00Z`);

export function addDays(d: IsoDate, n: number): IsoDate {
  return new Date(dayMs(d) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((dayMs(to) - dayMs(from)) / MS_PER_DAY);
}

/** First day of the week containing `d`. Monday by default, pass 0 for Sunday. */
export function weekStart(d: IsoDate, startsOn: 0 | 1 = 1): IsoDate {
  const dow = new Date(dayMs(d)).getUTCDay();
  return addDays(d, -((dow - startsOn + 7) % 7));
}

/** ISO dates compare correctly as plain strings. */
export function inRange(d: IsoDate, from: IsoDate, to: IsoDate): boolean {
  return d >= from && d <= to;
}

export const time = (iso: IsoDateTime): number => Date.parse(iso);
