import type { IsoDate } from "@/lib/domain/types";

/** YYYY-MM-DD in the device's local time zone, which is what a lifter means by "today". */
export function localDate(d: Date = new Date()): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localDateDaysAgo(days: number, from: Date = new Date()): IsoDate {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - days);
  return localDate(d);
}
